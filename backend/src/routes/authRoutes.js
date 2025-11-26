import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../database/db.js';

const router = express.Router();

// 1. LOGIN
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await query("SELECT * FROM users WHERE username = $1", [username]);
        const user = result.rows[0];

        if (!user) return res.status(400).json({ error: "User not found" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: "Invalid password" });

        res.json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                role: user.role
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. CREATE USER
router.post('/register', async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: "Username/Password required" });

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await query("INSERT INTO users (username, password, role) VALUES ($1, $2, $3)",
            [username, hashedPassword, role || 'user']
        );
        res.json({ success: true, message: "User created successfully" });
    } catch (err) {
        res.status(500).json({ error: "Username already exists or database error" });
    }
});

// 3. GET ALL USERS
router.get('/users', async (req, res) => {
    try {
        const result = await query("SELECT id, username, role, telegram_chat_id FROM users");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. DELETE USER
router.delete('/users/:id', async (req, res) => {
    try {
        const result = await query("SELECT * FROM users WHERE id = $1", [req.params.id]);
        const user = result.rows[0];

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        if (user.username === 'admin') {
            return res.status(403).json({ error: "Cannot delete the main Admin account!" });
        }

        await query("DELETE FROM users WHERE id = $1", [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. UPDATE USER
router.put('/users/:id', async (req, res) => {
    const { id } = req.params;
    const { username, password, role } = req.body;

    try {
        const result = await query("SELECT * FROM users WHERE id = $1", [id]);
        const user = result.rows[0];

        if (!user) return res.status(404).json({ error: "User not found" });

        let sql = "UPDATE users SET username = $1, role = $2 WHERE id = $3";
        let params = [username, role, id];

        if (password && password.trim() !== "") {
            const hashedPassword = await bcrypt.hash(password, 10);
            sql = "UPDATE users SET username = $1, password = $2, role = $3 WHERE id = $4";
            params = [username, hashedPassword, role, id];
        }

        await query(sql, params);
        res.json({ success: true, message: "User updated successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to update user" });
    }
});

export default router;