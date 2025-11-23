import TelegramBot from 'node-telegram-bot-api';
import fetch from 'node-fetch';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { query } from './database/db.js'; // Use shared Supabase connection
import { mqttClient } from './mqttClient.js';

dotenv.config();

// --- 1. CONFIGURATION ---
const TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8457047782:AAGxdeEM5XFbKWBBwBL6hrH2sXWTuakAMgM";
const WEATHER_API_KEY = process.env.WEATHER_API_KEY || "6a51e7780b6a4aaa82935631250611";
const CITY = 'auto:ip';

if (!TOKEN) console.error("❌ Telegram Token missing in .env");

const bot = new TelegramBot(TOKEN, { polling: true });

// Data Cache
let deviceState = {
    soil: null,
    rain: null,
    pump: null,
    mode: null,
    lastUpdate: null
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
    if (deviceState.soil === null) {
        return { text: "⚠️ *No Data Received*\nCheck ESP32 connection.", error: true };
    }

    const timeDiff = (Date.now() - (deviceState.lastUpdate || 0)) / 1000;
    const isOnline = timeDiff < 120;
    const powerStatus = isOnline ? "🟢 Online" : "🔴 Offline";

    let weatherText = "Weather unavailable";
    try {
        const url = `http://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=${CITY}&aqi=no`;
        const weatherRes = await fetch(url);
        if (weatherRes.ok) {
            const data = await weatherRes.json();
            weatherText = `*Weather in ${data.location.name}:*
Condition: ${data.current.condition.text}
Temp: ${data.current.temp_c}°C`;
        }
    } catch (e) { /* ignore */ }

    const response = `
*System Status Report*
Device: ${powerStatus}
Soil: *${deviceState.soil ?? '--'}%*
Rain: *${deviceState.rain ?? '--'}%*
Mode: *${deviceState.mode || 'Auto'}*
Pump: *${deviceState.pump === 'ON' ? 'ON 💧' : 'OFF 🛑'}*

${weatherText}
`;
    return { text: response, error: false };
}

// --- 3. LOGIN / LOGOUT ---

bot.onText(/\/login (.+) (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const username = match[1];
    const password = match[2];

    try {
        const res = await query("SELECT * FROM users WHERE username = $1", [username]);
        const user = res.rows[0];

        if (!user) {
            bot.sendMessage(chatId, "⛔ Username not found.");
        } else {
            const isMatch = await bcrypt.compare(password, user.password);
            if (isMatch) {
                await query("UPDATE users SET telegram_chat_id = $1 WHERE id = $2", [chatId, user.id]);
                bot.sendMessage(chatId, `✅ *Login Successful!*\nWelcome, ${user.username}.`, { parse_mode: 'Markdown' });
            } else {
                bot.sendMessage(chatId, "⛔ Incorrect password.");
            }
        }
    } catch (e) {
        console.error(e);
        bot.sendMessage(chatId, "❌ Login Error.");
    }
});

bot.onText(/\/logout/, async (msg) => {
    const chatId = msg.chat.id;
    await query("UPDATE users SET telegram_chat_id = NULL WHERE telegram_chat_id = $1", [chatId]);
    bot.sendMessage(chatId, "🔒 *Logout Successful.*");
});

// Protection Middleware
const protectedCommands = ['/status', '/on', '/off', '/auto', '/schedule'];
bot.on('message', async (msg) => {
    if (!msg.text) return;
    const isProtected = protectedCommands.some(cmd => msg.text.startsWith(cmd));
    if (isProtected) {
        const user = await getAuthenticatedUser(msg.chat.id);
        if (!user) {
            bot.sendMessage(msg.chat.id, "🔒 *Access Denied*\nPlease login: `/login username password`", { parse_mode: 'Markdown' });
        }
    }
});

// --- 4. COMMANDS ---

bot.onText(/\/start|\/help/, (msg) => {
    const help = `*Commands:*\n/login <user> <pass>\n/logout\n/status\n/on\n/off\n/auto\n/schedule`;
    bot.sendMessage(msg.chat.id, help, { parse_mode: 'Markdown' });
});

bot.onText(/\/status/, async (msg) => {
    const user = await getAuthenticatedUser(msg.chat.id);
    if (!user) return;
    const report = await getSystemStatusReport();
    bot.sendMessage(msg.chat.id, report.text, { parse_mode: 'Markdown' });
});

bot.onText(/\/on/, async (msg) => {
    if (!await getAuthenticatedUser(msg.chat.id)) return;
    mqttClient.publish('irrigation/commands', 'WATER_ON');
    bot.sendMessage(msg.chat.id, "💦 Sent: Pump ON");
});

bot.onText(/\/off/, async (msg) => {
    if (!await getAuthenticatedUser(msg.chat.id)) return;
    mqttClient.publish('irrigation/commands', 'WATER_OFF');
    bot.sendMessage(msg.chat.id, "🛑 Sent: Pump OFF");
});

bot.onText(/\/auto/, async (msg) => {
    if (!await getAuthenticatedUser(msg.chat.id)) return;
    mqttClient.publish('irrigation/commands', 'AUTO_MODE');
    bot.sendMessage(msg.chat.id, "🤖 Sent: Auto Mode");
});

// --- 5. MQTT LISTENER (Reuse connection) ---
// Note: We don't subscribe here again because server.js handles subscriptions.
// We just listen to the 'message' event from the shared client.

mqttClient.on('message', async (topic, message) => {
    if (topic === 'irrigation/logs') {
        try {
            const data = JSON.parse(message.toString());
            Object.assign(deviceState, data);
            deviceState.lastUpdate = Date.now();

            // Alert Logic: Pump turned ON
            if (data.pump && data.pump !== lastPumpStatus) {
                const isPumpOn = data.pump.includes('ON');
                const wasPumpOn = lastPumpStatus.includes('ON');

                if (isPumpOn && !wasPumpOn) {
                    const res = await query("SELECT telegram_chat_id FROM users WHERE telegram_chat_id IS NOT NULL");
                    const users = res.rows;

                    users.forEach(u => {
                        bot.sendMessage(u.telegram_chat_id, `💦 *Pump Activated*\nSoil: ${data.soil}%`, { parse_mode: 'Markdown' });
                    });
                }
                lastPumpStatus = data.pump;
            }
        } catch (e) { /* ignore */ }
    }
});

export default bot;