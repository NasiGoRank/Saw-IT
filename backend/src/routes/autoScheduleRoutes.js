import express from "express";
import fetch from "node-fetch";
import OpenAI from "openai";
import { loadScheduleJobs } from "../server.js";
import { query } from "../database/db.js"; // Updated import
import { DateTime } from "luxon";

const router = express.Router();

// ===== Gemini Setup =====
// Using OpenAI client SDK to access Gemini via compatible endpoint
const gemini = new OpenAI({
    apiKey: process.env.GOOGLE_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
});

// ===== Main Route =====
router.post("/", async (req, res) => {
    try {
        const { soil, rain } = req.body;
        const weatherKey = process.env.WEATHER_API_KEY || "AIzaSyCIVl8alDq2jVRuHl1Xm1XrgwtzvJlz4oI";

        if (!weatherKey) {
            return res.status(500).json({ error: "Missing WEATHER_API_KEY" });
        }

        // ---- 1. Fetch Weather Forecast ----
        // (Weather fetching logic remains the same)
        const q = "auto:ip";
        const forecastURL = `https://api.weatherapi.com/v1/forecast.json?key=${weatherKey}&q=${encodeURIComponent(q)}&days=1&aqi=no&alerts=no`;

        const weatherRes = await fetch(forecastURL);
        const weatherData = await weatherRes.json();

        if (!weatherData.forecast) throw new Error("Invalid WeatherAPI response");

        const locationName = weatherData.location.name;
        const tz = weatherData.location.tz_id;
        const localtime = weatherData.location.localtime;

        // ... (Prompt generation logic remains the same) ...
        const forecastSummary = weatherData.forecast.forecastday[0].hour.map(h => ({
            time: h.time,
            temp_c: h.temp_c,
            humidity: h.humidity,
            chance_of_rain: h.chance_of_rain
        }));

        const now = DateTime.local().setZone(tz);
        const prompt = `
You are an advanced irrigation scheduling assistant.

Inputs:
- Current soil moisture: ${soil}%
- Current rain sensor: ${rain}%
- Location: ${locationName}, ${weatherData.location.country}
- Timezone: ${tz}
- Current local time: ${localtime}
- Forecast for the next 24 hours: ${JSON.stringify(forecastSummary)}

${dateRangeHint}

Goal: Generate a complete irrigation schedule for the current day (from now until midnight).

Rules:
- Use the provided timezone and local time as your absolute reference.
- Create a full-day schedule covering all optimal watering times today.
- Skip watering during or within 2 hours before/after high rain probability (> 60%).
- Prefer early morning (04:00–07:00) and late afternoon (17:00–19:00) sessions.
- Avoid midday (11:00–15:00) if temperature > 30°C.
- If soil < 30%, plan 2–3 watering sessions (10–20 minutes each).
- If soil 30–50%, plan 1–2 short sessions (5–10 minutes each).
- If soil > 50%, water only once briefly if dry (<20% rain chance, humidity <60%).
- Use only **future times** (do not include hours that have already passed today).
- Ensure all schedule times are in the same local time format (YYYY-MM-DD HH:mm).

Respond **strictly in JSON**, following this schema:
{
  "schedules": [
    {
      "datetime": "YYYY-MM-DD HH:mm",
      "duration": 10,
      "type": "once",
      "keep_after_run": 0
    }
  ]
}
No explanations or markdown.
`;

        // ---- 3. Call Gemini ----
        const llmResponse = await gemini.chat.completions.create({
            model: "gemini-2.0-flash",
            messages: [{ role: "user", content: prompt }]
        });

        const text = llmResponse.choices[0].message.content.trim();
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found");

        const jsonData = JSON.parse(jsonMatch[0]);
        const schedules = jsonData.schedules || [];

        if (schedules.length === 0) {
            return res.json({ success: true, message: "No irrigation needed." });
        }

        // ---- 4. Insert into Supabase ----
        let insertedCount = 0;
        for (const s of schedules) {
            const scheduleTime = DateTime.fromFormat(s.datetime, "yyyy-MM-dd HH:mm", { zone: tz });

            if (scheduleTime < now) continue; // Skip past

            await query(
                `INSERT INTO irrigation_schedule (type, datetime, duration, keep_after_run)
                 VALUES ($1, $2, $3, $4)`,
                [s.type || "once", scheduleTime.toFormat("yyyy-MM-dd HH:mm"), s.duration, s.keep_after_run || 0]
            );
            insertedCount++;
        }

        if (insertedCount === 0) return res.json({ success: true, message: "All times were past." });

        // ---- 5. Reload Scheduler ----
        await loadScheduleJobs();

        res.json({ success: true, generated: insertedCount, schedules });

    } catch (err) {
        console.error("Auto-schedule error:", err.message);
        res.status(500).json({ error: err.message });
    }
});

export default router;