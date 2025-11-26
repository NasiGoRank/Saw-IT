import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Menggunakan Connection Pooler (Port 6543)
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

export const query = (text, params) => pool.query(text, params);

pool.connect((err) => {
  if (err) console.error('❌ Database Error:', err.stack);
  else console.log('✅ Connected to Supabase (via Pooler)');
});

export default pool;