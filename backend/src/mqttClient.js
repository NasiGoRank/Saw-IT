import mqtt from "mqtt";
import dotenv from "dotenv";

dotenv.config();

console.log("🔌 Connecting to HiveMQ Cloud...");

// Buat Client
export const mqttClient = mqtt.connect(process.env.MQTT_URL, {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    port: 8883,
    protocol: 'mqtts' // Wajib SSL untuk HiveMQ Cloud
});

// Event Listeners Dasar
mqttClient.on('connect', () => {
    console.log('✅ Connected to HiveMQ Cloud (Shared Client)');
});

mqttClient.on('error', (err) => {
    console.error('❌ MQTT Error:', err);
});