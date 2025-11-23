import pg from 'pg';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Create a connection pool to Supabase
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:gjAW3MAlhSHeEZlR@db.deqrzjdjpvvotjgmnxwq.supabase.co:5432/postgres",
  ssl: {
    rejectUnauthorized: false // Required for Supabase connections
  }
});

// Helper function to run queries
// REMEMBER: PostgreSQL uses $1, $2, $3 for placeholders (not ?)
export const query = (text, params) => pool.query(text, params);

// Test connection on startup
pool.connect((err) => {
  if (err) console.error('❌ Database connection error', err.stack);
  else console.log('✅ Connected to Supabase (PostgreSQL)');
});

export default pool;