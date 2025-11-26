import mqtt from 'mqtt';
import { randomInt } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

class IoTSimulator {
    constructor() {
        // --- CLOUD CONFIGURATION ---
        // Matches your HiveMQ setup

        this.config = {
            // Ensure protocol is tls://
            mqttBroker: process.env.MQTT_URL,
            username: process.env.MQTT_USERNAME,
            password: process.env.MQTT_PASSWORD,
            port: 8883,
            // Random Client ID to allow running Simulator & Real ESP32 simultaneously
            clientId: 'ESP32_SIM_' + Math.random().toString(16).substring(2, 8),

            // Timings matching your ESP32 code
            sendInterval: 2000,   // 2 seconds
            statusInterval: 5000, // 5 seconds
            manualTimeout: 60000  // 60 seconds
        };

        this.state = {
            soilMoisture: 45,
            rainLevel: 20,
            pumpState: false,
            manualOverride: false,
            manualStartTime: null,
            mode: 'auto',
            connected: false
        };

        this.client = null;
        this.intervals = [];
    }

    connect() {
        console.log(`🚀 Connecting IoT Simulator to: ${this.config.mqttBroker}`);

        this.client = mqtt.connect(this.config.mqttBroker, {
            clientId: this.config.clientId,
            username: this.config.username,
            password: this.config.password,
            port: this.config.port,
            protocol: 'mqtts', // Secure MQTT
            clean: true,
            rejectUnauthorized: true // HiveMQ Cloud uses valid public certs
        });

        this.client.on('connect', () => {
            console.log('✅ IoT Simulator connected to HiveMQ Cloud');
            this.state.connected = true;

            // Subscribe to CONTROL topic (Server sends commands here)
            this.client.subscribe('irrigation/control', (err) => {
                if (!err) console.log('📡 Subscribed to irrigation/control');
            });

            this.startSensors();
            this.publishStatus('ESP32_SIM_CONNECTED');
        });

        this.client.on('message', (topic, message) => {
            this.handleMessage(topic, message.toString());
        });

        this.client.on('error', (err) => {
            console.error('❌ MQTT Error:', err.message);
            this.state.connected = false;
        });

        this.client.on('close', () => {
            console.log('🔌 MQTT connection closed');
            this.state.connected = false;
            this.stopSensors();
        });
    }

    handleMessage(topic, message) {
        // Filter topic if needed, but we only sub to irrigation/control
        console.log(`📨 Command Received -> ${message}`);

        switch (message) {
            case 'WATER_ON':
                this.state.manualOverride = true;
                this.state.pumpState = true;
                this.state.manualStartTime = Date.now();
                this.state.mode = 'manual';
                this.publishStatus('WATER_ON_OK');
                console.log('💧 [CMD] Manual WATER ON activated');
                break;

            case 'WATER_OFF':
                this.state.manualOverride = true;
                this.state.pumpState = false;
                this.state.manualStartTime = Date.now();
                this.state.mode = 'manual';
                this.publishStatus('WATER_OFF_OK');
                console.log('🛑 [CMD] Manual WATER OFF activated');
                break;

            case 'AUTO_MODE':
                this.state.manualOverride = false;
                this.state.mode = 'auto';
                this.publishStatus('AUTO_MODE_OK');
                console.log('🤖 [CMD] Auto mode activated');
                break;
        }
    }

    startSensors() {
        // 1. Telemetry Loop (Send Sensor Data)
        const telemetryInterval = setInterval(() => {
            this.updateSensors();
            this.publishTelemetry();
        }, this.config.sendInterval);

        // 2. Status Heartbeat Loop
        const statusInterval = setInterval(() => {
            this.publishStatus('ESP32_SIM_ALIVE');
        }, this.config.statusInterval);

        // 3. Logic Check Loop (Manual Timeout)
        const overrideInterval = setInterval(() => {
            this.checkManualOverride();
        }, 1000);

        this.intervals.push(telemetryInterval, statusInterval, overrideInterval);
    }

    stopSensors() {
        this.intervals.forEach(interval => clearInterval(interval));
        this.intervals = [];
    }

    updateSensors() {
        // Simulate realistic fluctuations
        const soilChange = randomInt(-2, 3);
        const rainChange = randomInt(-5, 6);

        // Logic: If pump is ON, soil gets wetter rapidly
        if (this.state.pumpState) {
            this.state.soilMoisture = Math.min(100, this.state.soilMoisture + randomInt(3, 7));
        } else {
            this.state.soilMoisture += soilChange; // Slowly dries out or fluctuates
        }

        this.state.rainLevel += rainChange;

        // Clamp values 0-100
        this.state.soilMoisture = Math.max(0, Math.min(100, this.state.soilMoisture));
        this.state.rainLevel = Math.max(0, Math.min(100, this.state.rainLevel));

        // === AUTO MODE LOGIC (Same as ESP32) ===
        // < 30% Soil AND < 70% Rain -> PUMP ON
        if (!this.state.manualOverride && this.state.mode === 'auto') {
            if (this.state.soilMoisture < 30 && this.state.rainLevel < 70) {
                this.state.pumpState = true;
            } else {
                this.state.pumpState = false;
            }
        }
    }

    checkManualOverride() {
        if (this.state.manualOverride && this.state.manualStartTime) {
            if (Date.now() - this.state.manualStartTime > this.config.manualTimeout) {
                this.state.manualOverride = false;
                this.state.mode = 'auto';
                this.publishStatus('AUTO_MODE_OK');
                console.log('⏰ Manual override timeout - returning to auto mode');
            }
        }
    }

    publishTelemetry() {
        if (!this.client || !this.state.connected) return;

        // Exact format used by your ESP32
        const payload = {
            soil: this.state.soilMoisture,
            rain: this.state.rainLevel,
            pump: this.state.pumpState ? (this.state.mode === 'auto' ? "ON (auto)" : "ON (manual)") : (this.state.mode === 'auto' ? "OFF (auto)" : "OFF (manual)"),
            mode: this.state.mode
        };

        this.client.publish('irrigation/data', JSON.stringify(payload));

        // Console Visualization
        const pumpEmoji = this.state.pumpState ? '💧' : '🛑';
        const modeEmoji = this.state.mode === 'auto' ? '🤖' : '👤';
        console.log(`📤 [DATA] ${pumpEmoji}${modeEmoji} Soil: ${payload.soil}% | Rain: ${payload.rain}% | Pump: ${payload.pump}`);
    }

    publishStatus(status) {
        if (this.client && this.state.connected) {
            this.client.publish('irrigation/status', status);
        }
    }

    disconnect() {
        console.log('🔌 Disconnecting IoT Simulator...');
        this.stopSensors();
        if (this.client) {
            this.client.end();
        }
        this.state.connected = false;
    }
}

// --- RUN SIMULATOR ---
const iotSimulator = new IoTSimulator();
iotSimulator.connect();

// Handle Ctrl+C
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down IoT Simulator...');
    iotSimulator.disconnect();
    process.exit(0);
});

export default iotSimulator;