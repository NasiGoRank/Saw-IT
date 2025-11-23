import express from "express";
import cors from "cors";
import mqtt from "mqtt";
import dotenv from "dotenv";
import { DateTime } from "luxon";
import cron from "node-cron";
import fetch from "node-fetch";
import { query } from "./database/db.js"; // Import new Supabase wrapper

// Import routes
import authRoutes from "./routes/authRoutes.js";
import historyRoutes from "./routes/historyRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import scheduleRoutes from "./routes/scheduleRoutes.js";
import autoScheduleRoutes from "./routes/autoScheduleRoutes.js";
import telegramBot from './telegram-bot.js';
import { mqttClient } from "./mqttClient.js";

dotenv.config();

const app = express();
const API_PORT = process.env.PORT || 5000;
const WEATHER_API_KEY = process.env.WEATHER_API_KEY || "6a51e7780b6a4aaa82935631250611";
const CITY = 'auto:ip';

app.use(cors());
app.use(express.json());

// --- 1. MQTT CONNECTION (HiveMQ Cloud) ---
console.log("🔌 Connecting to HiveMQ Cloud...");
mqttClient.on('connect', () => {
    console.log('✅ Connected to HiveMQ Cloud');
    mqttClient.subscribe('irrigation/data');
    mqttClient.subscribe('irrigation/status');
    mqttClient.subscribe('irrigation/commands');
});

// --- 2. LOGGING & TELEMETRY ---
let lastPumpState = null;

// Helper: Get Weather Data
async function getCurrentWeather() {
    try {
        const url = `http://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=${CITY}&aqi=no`;
        const weatherRes = await fetch(url);
        if (weatherRes.ok) {
            const weatherData = await weatherRes.json();
            return {
                temperature: weatherData.current.temp_c,
                humidity: weatherData.current.humidity,
                weather_condition: weatherData.current.condition.text,
                wind_speed: weatherData.current.wind_kph,
                location: weatherData.location.name
            };
        }
    } catch (error) {
        console.error('⚠️ Error fetching weather data:', error.message);
    }
    return { temperature: null, humidity: null, weather_condition: null, wind_speed: null, location: null };
}

// Handle Incoming MQTT Messages
mqttClient.on('message', async (topic, message) => {
    const payload = message.toString();

    // 1. Telemetry Data from ESP32
    if (topic === "irrigation/data") {
        try {
            const data = JSON.parse(payload);
            const { soil, rain, pump, mode } = data;
            const newStatus = pump.includes("ON") ? "ON" : "OFF";
            const newMode = (mode || "").toLowerCase().includes("manual") ? "Manual" : "Auto";

            // Only log to DB if pump status changes
            if (newStatus !== lastPumpState) {
                lastPumpState = newStatus;

                const weatherData = await getCurrentWeather();

                // PostgreSQL Syntax: $1, $2, $3...
                await query(
                    `INSERT INTO irrigation_history 
                    (status, mode, soil, rain, temperature, humidity, weather_condition, wind_speed, location) 
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [
                        newStatus,
                        newMode,
                        soil ?? null,
                        rain ?? null,
                        weatherData.temperature,
                        weatherData.humidity,
                        weatherData.weather_condition,
                        weatherData.wind_speed,
                        weatherData.location
                    ]
                );

                console.log(`📝 DB Logged: Pump ${newStatus} (${newMode}) | Soil: ${soil}%`);
            }

            // Forward to frontend via MQTT
            mqttClient.publish("irrigation/logs", JSON.stringify(data));

        } catch (err) {
            console.error("⚠️ Invalid telemetry data:", err.message);
        }
    }

    // 2. Command Forwarding (Frontend -> Server -> ESP32)
    if (topic === "irrigation/commands") {
        mqttClient.publish("irrigation/control", payload);
    }

    // 3. Status forwarding
    if (topic === "irrigation/status") {
        mqttClient.publish("irrigation/logs", JSON.stringify({
            esp32Status: payload,
            ts: new Date().toISOString()
        }));
    }
});

// --- 3. SCHEDULER SYSTEM ---
let activeJobs = new Map();

export async function loadScheduleJobs() {
    // 1. Clear existing timers
    for (const job of activeJobs.values()) {
        if (job.stop) job.stop(); // For cron jobs
        else clearTimeout(job);   // For timeouts
    }
    activeJobs.clear();

    // 2. Clean up expired one-time schedules (Postgres Syntax)
    try {
        await query("DELETE FROM irrigation_schedule WHERE type='once' AND TO_TIMESTAMP(datetime, 'YYYY-MM-DD HH24:MI') < NOW()");
    } catch (e) {
        console.warn("⚠️ Could not clean old schedules (Check date format)");
    }

    // 3. Fetch active schedules
    const res = await query("SELECT * FROM irrigation_schedule WHERE status = 'active'");
    const schedules = res.rows;

    console.log(`🔁 Loading ${schedules.length} active schedule(s)...`);

    for (const sch of schedules) {
        try {
            let job;

            // ---- ONE-TIME ----
            if (sch.type === "once") {
                if (!sch.datetime) continue;
                // Adjust timezone as needed
                const scheduleTime = DateTime.fromFormat(sch.datetime.trim(), "yyyy-MM-dd HH:mm", { zone: "Asia/Jakarta" });
                const delay = scheduleTime.toMillis() - Date.now();

                if (delay > 0) {
                    job = setTimeout(() => runIrrigation(sch), delay);
                }
            }
            // ---- DAILY ----
            else if (sch.type === "daily") {
                if (!sch.datetime) continue;
                const [hour, minute] = sch.datetime.split(":").map(Number);
                const cronPattern = `${minute} ${hour} * * *`;
                job = cron.schedule(cronPattern, () => runIrrigation(sch));
            }
            // ---- HOURLY ----
            else if (sch.type === "hourly") {
                const interval = Number(sch.repeat_interval);
                const cronPattern = `*/${interval} * * * *`;
                job = cron.schedule(cronPattern, () => runIrrigation(sch));
            }
            // ---- WEEKLY ----
            else if (sch.type === "weekly") {
                if (!sch.weekday || !sch.datetime) continue;
                const [hour, minute] = sch.datetime.split(":").map(Number);
                const days = sch.weekday.split(",").map(d => d.trim().slice(0, 3)).join(",");
                const cronPattern = `${minute} ${hour} * * ${days}`;
                job = cron.schedule(cronPattern, () => runIrrigation(sch));
            }

            if (job) activeJobs.set(sch.id, job);

        } catch (err) {
            console.error(`❌ Error scheduling ID ${sch.id}:`, err.message);
        }
    }
    console.log(`✅ Scheduler active: ${activeJobs.size} job(s) running.`);
}

async function runIrrigation(sch) {
    console.log(`💧 Executing Schedule ID ${sch.id} (${sch.type})`);
    mqttClient.publish("irrigation/control", "WATER_ON");

    setTimeout(async () => {
        mqttClient.publish("irrigation/control", "WATER_OFF");
        console.log(`🛑 Finished irrigation (${sch.duration} min)`);

        if (!sch.keep_after_run && sch.type === "once") {
            await query("DELETE FROM irrigation_schedule WHERE id = $1", [sch.id]);
            await loadScheduleJobs();
        }
    }, sch.duration * 60 * 1000);
}

// --- 4. SERVER STARTUP ---
// Initialize scheduler
loadScheduleJobs();

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/history", historyRoutes);
app.use("/chat", chatRoutes);
app.use("/api/schedules", scheduleRoutes);
app.use("/api/auto-schedule", autoScheduleRoutes);

app.listen(API_PORT, () => {
    console.log(`🚀 Server running on port ${API_PORT}`);
});

export { mqttClient };