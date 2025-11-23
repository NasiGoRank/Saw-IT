import pg from 'pg';
import dotenv from 'dotenv';
import dns from 'dns';

dotenv.config();

const { Pool } = pg;

// Fungsi untuk membuat koneksi dengan "Paksaan" IPv4
const createPool = async () => {
  let connectionString = process.env.DATABASE_URL;
  let sslConfig = { rejectUnauthorized: false }; // Wajib untuk Supabase

  console.log("🔄 [DB] Initializing Database Connection...");

  try {
    // 1. Ambil Hostname dari URL (misal: db.xyz.supabase.co)
    const url = new URL(connectionString);
    const hostname = url.hostname;
    console.log(`📍 [DB] Target Hostname: ${hostname}`);

    // 2. Paksa Resolusi DNS ke IPv4 secara manual
    console.log("🔍 [DB] Resolving IPv4 address...");
    const addresses = await new Promise((resolve, reject) => {
      dns.resolve4(hostname, (err, addresses) => {
        if (err) reject(err);
        else resolve(addresses);
      });
    });

    if (addresses && addresses.length > 0) {
      const ip = addresses[0];
      console.log(`✅ [DB] Resolved IPv4: ${ip}`);

      // 3. Ganti Hostname dengan IP Angka di Connection String
      // Ini memaksa sistem untuk TIDAK menggunakan IPv6
      url.hostname = ip;
      connectionString = url.toString();

      // 4. PENTING: Beri tahu SSL nama host aslinya (SNI)
      // Supaya sertifikat keamanan tetap valid walau kita tembak IP langsung
      sslConfig.servername = hostname;
    } else {
      console.warn("⚠️ [DB] No IPv4 address found! Trying default...");
    }

  } catch (err) {
    console.error("⚠️ [DB] DNS Resolution Failed:", err.message);
    console.log("➡️ [DB] Proceeding with original connection string...");
  }

  // 5. Buat Pool dengan konfigurasi hasil racikan di atas
  const pool = new Pool({
    connectionString: connectionString,
    ssl: sslConfig
  });

  // 6. Tes Koneksi (Hanya untuk memastikan)
  try {
    const client = await pool.connect();
    console.log("🎉 [DB] DATABASE CONNECTED SUCCESSFULLY via IPv4!");
    client.release();
  } catch (err) {
    console.error("❌ [DB] Final Connection Error:", err.message);
  }

  return pool;
};

// Inisialisasi Pool
const pool = await createPool();

// Export fungsi helper query
export const query = (text, params) => pool.query(text, params);

export default pool;