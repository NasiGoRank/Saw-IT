import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { loadScheduleJobs } from "../server.js";
import { query } from "../database/db.js";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get all schedules
router.get("/", async (req, res) => {
    try {
        const result = await query("SELECT * FROM irrigation_schedule ORDER BY id DESC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Add a new schedule
router.post("/", async (req, res) => {
    try {
        const {
            type,
            datetime,
            duration,
            repeat_interval,
            weekday,
            keep_after_run,
        } = req.body;

        // Validation logic remains the same...
        if (!type || !duration) return res.status(400).json({ error: "Missing required fields" });
        if (type === "once" && !datetime) return res.status(400).json({ error: "Datetime required" });
        if (type === "daily" && !datetime) return res.status(400).json({ error: "Time required" });
        if (type === "hourly" && !repeat_interval) return res.status(400).json({ error: "Repeat interval required" });
        if (type === "weekly" && (!weekday || !datetime)) return res.status(400).json({ error: "Days and time required" });

        await query(
            `INSERT INTO irrigation_schedule (type, datetime, duration, repeat_interval, weekday, keep_after_run)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [type, datetime || null, duration, repeat_interval || null, weekday || null, keep_after_run || 0]
        );

        await loadScheduleJobs(); // Reload scheduler
        res.json({ success: true });
    } catch (err) {
        console.error("Error adding schedule:", err);
        res.status(500).json({ error: err.message });
    }
});

// Delete a schedule
router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    try {
        await query("DELETE FROM irrigation_schedule WHERE id = $1", [id]);
        await loadScheduleJobs();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;