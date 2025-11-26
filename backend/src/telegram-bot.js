import TelegramBot from 'node-telegram-bot-api';
import fetch from 'node-fetch';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { query } from './database/db.js'; // Koneksi Database Cloud
import { mqttClient } from './mqttClient.js'; // Koneksi MQTT Cloud 

dotenv.config();

// --- 1. CONFIGURATION ---
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEATHER_API_KEY = process.env.WEATHER_API_KEY;
const DEFAULT_CITY = 'Jakarta';

if (!TOKEN) console.error("❌ Telegram Token missing in .env");

const bot = new TelegramBot(TOKEN, { polling: true });

// Data Cache (Penyimpanan Sementara)
let deviceState = {
    soil: null,
    rain: null,
    pump: null,
    mode: null,
    lastUpdate: null,
    public_ip: null
};
let lastPumpStatus = 'OFF';

// --- 2. HELPER FUNCTIONS ---

async function getAuthenticatedUser(chatId) {
    try {
        const res = await query("SELECT * FROM users WHERE telegram_chat_id = $1", [chatId]);
        return res.rows[0];
    } catch (e) {
        console.error("❌ DB Error:", e);
        return null;
    }
}

async function getSystemStatusReport() {
    const now = Date.now();
    const timeDiff = (now - (deviceState.lastUpdate || 0)) / 1000;
    const isOnline = timeDiff < 120;

    const statusIcon = isOnline ? "🟢" : "🔴";
    const statusText = isOnline ? "Online" : "Offline (No data > 2 mins)";

    const soilText = deviceState.soil !== null ? `${deviceState.soil}%` : "⏳ Waiting...";
    const rainText = deviceState.rain !== null ? `${deviceState.rain}%` : "⏳ Waiting...";
    const pumpText = deviceState.pump ? (deviceState.pump.includes("ON") ? "Active 💧" : "Inactive 🛑") : "Unknown";
    const modeText = deviceState.mode ? (deviceState.mode === 'auto' ? "🤖 Automatic" : "🖐️ Manual") : "Unknown";

    // Ambil Cuaca (Gunakan IP alat jika ada)
    let weatherText = "☁️ Weather unavailable";
    try {
        const locationQuery = deviceState.public_ip || DEFAULT_CITY;
        if (WEATHER_API_KEY) {
            const url = `http://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(locationQuery)}&aqi=no`;
            const weatherRes = await fetch(url);
            if (weatherRes.ok) {
                const data = await weatherRes.json();
                weatherText = `
*Weather at Location (${data.location.name}):*
🌡️ Temp: ${data.current.temp_c}°C
💧 Humidity: ${data.current.humidity}%
💨 Wind: ${data.current.wind_kph} km/h`;
            }
        }
    } catch (e) { /* ignore */ }

    const response = `
*🌱 System Status Report*
--------------------------------
*Device Status:* ${statusIcon} ${statusText}
*Last Update:* ${deviceState.lastUpdate ? new Date(deviceState.lastUpdate).toLocaleTimeString() : "Never"}

*📊 Sensors:*
• Soil Moisture: *${soilText}*
• Rain Level: *${rainText}*

*⚙️ Controls:*
• Pump State: *${pumpText}*
• Operation Mode: *${modeText}*
--------------------------------
${weatherText}
`;
    return { text: response };
}

// --- 3. LOGIN / LOGOUT HANDLERS ---

bot.onText(/\/login (.+) (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const username = match[1];
    const password = match[2];

    try {
        const res = await query("SELECT * FROM users WHERE username = $1", [username]);
        const user = res.rows[0];

        if (!user) {
            bot.sendMessage(chatId, "⛔ *Access Denied:* Username not found.", { parse_mode: 'Markdown' });
        } else {
            const isMatch = await bcrypt.compare(password, user.password);
            if (isMatch) {
                await query("UPDATE users SET telegram_chat_id = $1 WHERE id = $2", [chatId, user.id]);
                bot.sendMessage(chatId, `✅ *Login Successful!*\n\nWelcome back, *${user.username}*.\nYou will now receive irrigation alerts.`, { parse_mode: 'Markdown' });
            } else {
                bot.sendMessage(chatId, "⛔ *Access Denied:* Incorrect password.", { parse_mode: 'Markdown' });
            }
        }
    } catch (e) {
        console.error(e);
        bot.sendMessage(chatId, "❌ Internal Server Error.");
    }
});

bot.onText(/\/logout/, async (msg) => {
    const chatId = msg.chat.id;
    await query("UPDATE users SET telegram_chat_id = NULL WHERE telegram_chat_id = $1", [chatId]);
    bot.sendMessage(chatId, "🔒 *Logged Out.*\nYou will no longer receive alerts.");
});

// --- 4. COMMAND HANDLERS ---

bot.onText(/\/start|\/help/, (msg) => {
    const help = `
*🌊 Water Bender Bot Control*

*🔑 Account*
/login <user> <pass> - Connect to receive alerts
/logout - Disconnect

*📊 Monitoring*
/status - Check device & sensors

*🕹️ Controls*
/on - Pump ON (Manual)
/off - Pump OFF (Manual)
/auto - Auto Mode

*📅 Schedule*
/schedule - View active schedules
`;
    bot.sendMessage(msg.chat.id, help, { parse_mode: 'Markdown' });
});

bot.onText(/\/status/, async (msg) => {
    const user = await getAuthenticatedUser(msg.chat.id);
    if (!user) return;

    bot.sendChatAction(msg.chat.id, 'typing');
    const report = await getSystemStatusReport();
    bot.sendMessage(msg.chat.id, report.text, { parse_mode: 'Markdown' });
});

bot.onText(/\/on/, async (msg) => {
    if (!await getAuthenticatedUser(msg.chat.id)) return;
    mqttClient.publish('irrigation/commands', 'WATER_ON');
    bot.sendMessage(msg.chat.id, "💦 *Sent:* Pump ON (Manual)", { parse_mode: 'Markdown' });
});

bot.onText(/\/off/, async (msg) => {
    if (!await getAuthenticatedUser(msg.chat.id)) return;
    mqttClient.publish('irrigation/commands', 'WATER_OFF');
    bot.sendMessage(msg.chat.id, "🛑 *Sent:* Pump OFF (Manual)", { parse_mode: 'Markdown' });
});

bot.onText(/\/auto/, async (msg) => {
    if (!await getAuthenticatedUser(msg.chat.id)) return;
    mqttClient.publish('irrigation/commands', 'AUTO_MODE');
    bot.sendMessage(msg.chat.id, "🤖 *Sent:* Auto Mode", { parse_mode: 'Markdown' });
});

bot.onText(/\/schedule/, async (msg) => {
    const user = await getAuthenticatedUser(msg.chat.id);
    if (!user) return;

    try {
        const result = await query("SELECT * FROM irrigation_schedule WHERE status = 'active' ORDER BY id DESC LIMIT 5");
        if (result.rows.length === 0) {
            bot.sendMessage(msg.chat.id, "📭 No active schedules.");
        } else {
            let reply = "*🗓️ Active Schedules:*\n";
            result.rows.forEach((s, i) => {
                reply += `\n${i + 1}. *${s.type.toUpperCase()}* (${s.duration} mins)\n   ${s.datetime || s.weekday}`;
            });
            bot.sendMessage(msg.chat.id, reply, { parse_mode: 'Markdown' });
        }
    } catch (err) {
        bot.sendMessage(msg.chat.id, "❌ Failed to get schedules.");
    }
});

// --- 5. NOTIFICATION SYSTEM (MQTT Listener) ---
// Bot mendengarkan data dari server/ESP32 untuk mengirim notifikasi

mqttClient.on('message', async (topic, message) => {
    if (topic === 'irrigation/logs') {
        try {
            const data = JSON.parse(message.toString());
            Object.assign(deviceState, data);
            deviceState.lastUpdate = Date.now();

            // DETEKSI PERUBAHAN: Pump OFF -> ON
            if (data.pump && data.pump !== lastPumpStatus) {
                const isPumpOn = data.pump.includes('ON');
                const wasPumpOn = lastPumpStatus.includes('ON');

                if (isPumpOn && !wasPumpOn) {
                    // Ambil semua user yang sudah LOGIN (punya chat_id)
                    const res = await query("SELECT telegram_chat_id FROM users WHERE telegram_chat_id IS NOT NULL");
                    const activeUsers = res.rows;

                    const alertMsg = `
💦 *IRRIGATION STARTED*

*Conditions:*
• Soil: ${data.soil}%
• Rain: ${data.rain}%
• Mode: ${data.mode || 'Auto'}

_Pump has been activated._
`;
                    // Kirim ke semua user
                    activeUsers.forEach(u => {
                        bot.sendMessage(u.telegram_chat_id, alertMsg, { parse_mode: 'Markdown' });
                    });
                    console.log(`[BOT] Alert sent to ${activeUsers.length} users.`);
                }
                lastPumpStatus = data.pump;
            }
        } catch (e) { /* ignore */ }
    }
});

export default bot;