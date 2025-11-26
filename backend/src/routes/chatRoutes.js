import express from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { marked } from "marked";
import { query } from "../database/db.js";

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- Generate AI reply ---
async function callWithRetry(messages, retries = 3, delay = 500) {
    try {
        const prompt = messages.map(m => `${m.role}: ${m.content}`).join("\n");
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Updated model name if needed
        const result = await model.generateContent(prompt);
        const rawReply = result.response.text();
        return marked(rawReply || "No response.");
    } catch (error) {
        if (retries > 0) {
            await new Promise(r => setTimeout(r, delay));
            return callWithRetry(messages, retries - 1, delay * 2);
        }
        throw error;
    }
}

// --- Create new chat session ---
router.post("/session", async (req, res) => {
    const { name } = req.body;
    try {
        // Postgres: Use RETURNING id to get the ID of inserted row
        const result = await query(
            "INSERT INTO chat_sessions (name) VALUES ($1) RETURNING id",
            [name || "New Chat"]
        );
        res.json({ id: result.rows[0].id, name: name || "New Chat" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Get all chat sessions ---
router.get("/sessions", async (req, res) => {
    const result = await query("SELECT * FROM chat_sessions ORDER BY id DESC");
    res.json(result.rows);
});

// --- Delete a session ---
router.delete("/session/:id", async (req, res) => {
    const { id } = req.params;
    await query("DELETE FROM chat_history WHERE session_id = $1", [id]);
    await query("DELETE FROM chat_sessions WHERE id = $1", [id]);
    res.json({ success: true });
});

// --- Load chat history ---
router.get("/history/:session_id", async (req, res) => {
    const { session_id } = req.params;
    const result = await query(
        "SELECT * FROM chat_history WHERE session_id = $1 ORDER BY id ASC",
        [session_id]
    );
    res.json(result.rows);
});

// --- Chat within a session ---
router.post("/", async (req, res) => {
    const { message, session_id } = req.body;
    if (!message) return res.status(400).json({ reply: "Message cannot be empty." });

    try {
        const result = await query(
            "SELECT role, message FROM chat_history WHERE session_id = $1 ORDER BY id DESC LIMIT 5",
            [session_id]
        );

        // Rows need to be reversed to maintain chronological order for AI context
        const context = result.rows.reverse().map(row => ({
            role: row.role,
            content: row.message
        }));

        const messages = [
            { role: "system", content: "You are an intelligent irrigation and farming assistant." },
            ...context,
            { role: "user", content: message }
        ];

        const reply = await callWithRetry(messages);

        await query(
            "INSERT INTO chat_history (session_id, role, message) VALUES ($1, $2, $3)",
            [session_id, "user", message]
        );
        await query(
            "INSERT INTO chat_history (session_id, role, message) VALUES ($1, $2, $3)",
            [session_id, "ai", reply]
        );

        res.json({ reply });
    } catch (error) {
        console.error("❌ Gemini Error:", error);
        res.status(500).json({ reply: "AI temporarily unavailable." });
    }
});

export default router;