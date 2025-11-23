Ini adalah panduan langkah demi langkah yang komprehensif untuk memigrasikan **Smart Irrigation System** kamu dari arsitektur lokal ke arsitektur Cloud Gratisan (Serverless).

Ini adalah pekerjaan yang cukup besar karena kita harus mengubah kode backend (dari SQLite ke PostgreSQL dan menghapus Aedes).

-----

### 🗺️ Peta Perubahan Arsitektur

| Komponen | Lama (Lokal) | Baru (Cloud) |
| :--- | :--- | :--- |
| **Database** | SQLite (`irrigation.db`) | **Supabase** (PostgreSQL) |
| **MQTT Broker** | Aedes (Embedded di Node.js) | **HiveMQ Cloud** |
| **Backend** | Localhost Node.js | **Render** Web Service |
| **Frontend** | Localhost / File | **Vercel** (Static Site) |
| **ESP32** | Connect ke IP Laptop | Connect ke HiveMQ Cloud |

-----

### Langkah 1: Setup Database (Supabase)

Karena Render mereset file sistem, kita butuh database eksternal.

1.  Buka [Supabase.com](https://supabase.com/) dan buat akun (Gratis).
2.  Buat **New Project**. Catat **Database Password** kamu.
3.  Setelah project jadi, masuk ke menu **Project Settings \> Database**.
4.  Cari bagian **Connection String (Node.js)**. Salin URI-nya. Nanti formatnya seperti:
    `postgres://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres`
5.  Masuk ke menu **SQL Editor** di sidebar kiri, lalu jalankan perintah ini untuk membuat tabel (syntax PostgreSQL sedikit beda dengan SQLite):

<!-- end list -->

```sql
-- Tabel Users
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    telegram_chat_id BIGINT DEFAULT NULL
);

-- Tabel History (Dengan kolom cuaca)
CREATE TABLE irrigation_history (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    status TEXT,
    mode TEXT,
    soil INTEGER,
    rain INTEGER,
    temperature REAL,
    humidity INTEGER,
    weather_condition TEXT,
    wind_speed REAL,
    location TEXT
);

-- Tabel Schedule
CREATE TABLE irrigation_schedule (
    id SERIAL PRIMARY KEY,
    datetime TEXT,
    duration INTEGER NOT NULL,
    type TEXT DEFAULT 'once',
    repeat_interval INTEGER,
    weekday TEXT,
    keep_after_run INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active'
);

-- Tabel Chat Sessions
CREATE TABLE chat_sessions (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabel Chat History
CREATE TABLE chat_history (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Masukkan Admin Default (Password: admin123 - hash bcrypt)
INSERT INTO users (username, password, role) 
VALUES ('admin', '$2b$10$ovY.HsGME33H001Brv9ioO47X9hZnUXT1q4NYAap4PRT1a7xdaA3C', 'admin');
```

-----

### Langkah 2: Setup MQTT Broker (HiveMQ Cloud)

Karena Render tidak membuka port 1883, kita pakai broker gratis.

1.  Buka [HiveMQ Cloud](https://www.hivemq.com/mqtt-cloud-broker/) dan daftar (Free Tier).
2.  Buat **Cluster**.
3.  Di dashboard cluster, buat **Access Management (Credentials)**. Buat username dan password untuk perangkat (misal: `esp32_user` / `password123`).
4.  Catat **Cluster URL** (misal: `e12345.s1.eu.hivemq.cloud`) dan Port (biasanya **8883** untuk SSL/TLS).

-----

### Langkah 3: Modifikasi Backend (Node.js)

Sekarang kita harus mengedit kode di laptop kamu sebelum di-upload ke GitHub/Render.

**A. Install Library Baru & Hapus yang Lama**
Buka terminal di folder backend proyekmu:

```bash
npm uninstall sqlite3 aedes websocket-stream
npm install pg dotenv mqtt
```

**B. Update `database/db.js` (Ganti SQLite ke PostgreSQL)**
Hapus isi lama, ganti dengan:

```javascript
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Wajib untuk Supabase
});

export const query = (text, params) => pool.query(text, params);
export default pool;
```

**C. Update `server.js` (Hapus Aedes, Ganti Koneksi MQTT)**
Kamu harus menghapus semua kode `aedes`, `net.createServer`, `ws.createServer`. Ganti menjadi Client yang connect ke HiveMQ.

```javascript
// ... imports
import mqtt from 'mqtt'; // Client library
import { query } from './database/db.js'; // Pakai db.js yang baru

// HAPUS BAGIAN AEDES SERVER!
// GANTIKAN DENGAN INI:

// Koneksi ke HiveMQ Cloud
const mqttClient = mqtt.connect(process.env.MQTT_URL, {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    protocol: 'mqtts', // Wajib SSL
    port: 8883
});

mqttClient.on('connect', () => {
    console.log('✅ Connected to HiveMQ Cloud');
    mqttClient.subscribe('irrigation/data');
    mqttClient.subscribe('irrigation/status');
});

mqttClient.on('message', async (topic, message) => {
    // ... Logika insert ke database kamu tetap sama ...
    // HANYA SAJA: Perbaiki query SQL (lihat poin D di bawah)
});

// ... Express Routes ...
```

**D. ⚠️ PERBAIKAN QUERY SQL DI SEMUA FILE (PENTING\!)**
SQLite menggunakan tanda tanya `?` untuk parameter. PostgreSQL menggunakan `$1, $2, $3`. Kamu harus mencari semua file di folder `routes/` dan `controllers/` lalu mengubahnya.

*Contoh di `authRoutes.js`:*

  * **Lama (SQLite):** `db.get("SELECT * FROM users WHERE username = ?", [username])`
  * **Baru (Postgres):**
    ```javascript
    import { query } from '../database/db.js';
    // ...
    const res = await query("SELECT * FROM users WHERE username = $1", [username]);
    const user = res.rows[0]; // Postgres mengembalikan object { rows: [...] }
    ```
  * **Contoh Update:** `UPDATE users SET role = $1 WHERE id = $2`

**E. Update `telegram-bot.js`**
Ubah koneksi MQTT di file ini agar connect ke HiveMQ (gunakan environment variables), bukan localhost. Dan ganti logika Database SQLite ke `pg` seperti di atas.

-----

### Langkah 4: Deploy Backend ke Render

1.  Push kode backend yang sudah dimodifikasi ke **GitHub**.
2.  Buka [Render.com](https://render.com/).
3.  New **Web Service** \> Connect GitHub Repo kamu.
4.  **Build Command:** `npm install`
5.  **Start Command:** `node src/server.js`
6.  **Environment Variables (Wajib Diisi):**
      * `DATABASE_URL`: (Connection string dari Supabase)
      * `MQTT_URL`: (URL Cluster HiveMQ, misal `tls://e1234.s1...`)
      * `MQTT_USERNAME`: (User HiveMQ)
      * `MQTT_PASSWORD`: (Pass HiveMQ)
      * `GEMINI_API_KEY`: ...
      * `WEATHER_API_KEY`: ...
      * `TELEGRAM_BOT_TOKEN`: ...
7.  Deploy\! Setelah sukses, Render akan memberimu URL backend (misal: `https://smart-irrigation-api.onrender.com`).

-----

### Langkah 5: Modifikasi Frontend (Web UI)

Sekarang ubah file HTML/JS agar menunjuk ke server Render, bukan Localhost.

**A. Update API Base URL**
Cari file seperti `history.js`, `settings.js`, `login.js`, `chatbot.js`, `automation.js`.
Ganti:
`const API_BASE = "http://localhost:5000/api/..."`
Menjadi:
`const API_BASE = "https://NAMA-APP-KAMU.onrender.com/api/..."`

**B. Update Dashboard MQTT (Websocket)**
HiveMQ Cloud Free Tier mendukung WebSocket (WSS) di port **8884**.
Di `dashboard.js`:

```javascript
// Ganti konfigurasi MQTT
this.serverUrl = 'wss://CLUSTER-URL-HIVEMQ:8884/mqtt'; 
this.username = '...'; // Harus hardcode atau fetch dari backend (kurang aman kalau hardcode di JS client, tapi untuk project sekolah oke)
this.password = '...';
```

*Catatan: Browser wajib pakai WSS (Secure WebSocket).*

-----

### Langkah 6: Deploy Frontend ke Vercel

1.  Pastikan folder `web-ui` ada di GitHub (bisa jadi satu repo dengan backend atau terpisah).
2.  Buka [Vercel.com](https://vercel.com/).
3.  **Add New Project** \> Import Repo GitHub.
4.  **Framework Preset:** Other / None.
5.  **Root Directory:** Pilih folder `web-ui` (ini penting agar Vercel tahu file HTML ada di mana).
6.  Deploy\! Kamu akan dapat URL (misal: `https://smart-irrigation.vercel.app`).

-----

### Langkah 7: Update ESP32

Terakhir, update kodingan Arduino/PlatformIO di ESP32 kamu.

1.  **MQTT Server:** Ganti IP laptop dengan URL HiveMQ (`e12345...hivemq.cloud`).
2.  **Port:** 8883 (Secure Client). *Note: ESP32 butuh sertifikat root CA HiveMQ jika pakai SSL, atau coba port non-SSL jika HiveMQ mengizinkan (biasanya Free Tier wajib SSL).*
      * Jika sulit setup SSL di ESP32, kamu bisa cari broker gratisan lain yang membolehkan non-SSL (TCP biasa), atau berjuang sedikit menambahkan `WiFiClientSecure`.
3.  **User/Pass:** Masukkan credential yang kamu buat di HiveMQ.

-----

### Ringkasan Checklist Migrasi

1.  [ ] Database pindah ke Supabase (PostgreSQL).
2.  [ ] Kode Backend Node.js diubah:
      * Hapus SQLite & Aedes.
      * Pasang `pg` & `mqtt` client.
      * Ubah query SQL (`?` -\> `$1`).
3.  [ ] Backend dideploy ke Render (Set Env Vars).
4.  [ ] Frontend JS diupdate (URL API Render & MQTT WSS HiveMQ).
5.  [ ] Frontend dideploy ke Vercel.
6.  [ ] ESP32 diprogram ulang ke HiveMQ.

Ini proses yang panjang dan butuh ketelitian tinggi, terutama di bagian **pengubahan Query SQL** dari SQLite ke Postgres. Selamat mencoba\!