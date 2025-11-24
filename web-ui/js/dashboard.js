// MQTT + WeatherAPI dashboard (notifications removed)
class IrrigationDashboard {
    constructor() {
        this.client = null;
        this.isConnected = false;

        // MQTT WebSocket broker
        this.serverUrl = 'wss://f8dcdda3c9b746c3a5a70a83d5758987.s1.eu.hivemq.cloud:8884/mqtt';

        // WeatherAPI (set your key & location)
        this.weatherApiKey = '6a51e7780b6a4aaa82935631250611'; // <-- put your WeatherAPI key here

        // Default location if ESP32 hasn't sent data yet
        this.weatherQuery = 'Jakarta';
        this.currentPublicIP = null;

        this.esp32Connected = false;
        this.lastPumpAction = null;
        this.autoMode = true;

        this.init();
    }

    init() {
        this.connectMQTT();
        this.setupEventListeners();
        this.startUptimeCounter();
        this.updateLastRestartTime();

        // Weather
        this.fetchWeather();
        setInterval(() => this.fetchWeather(), 60 * 1000); // every 1 min
    }

    // ===== WEATHER =====
    async fetchWeather() {
        try {
            if (!this.weatherApiKey) return;
            const url = `https://api.weatherapi.com/v1/current.json?key=${this.weatherApiKey}&q=${encodeURIComponent(this.weatherQuery)}&aqi=no`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`Weather API ${res.status}`);
            const data = await res.json();

            const cur = data.current;
            const loc = data.location;

            const icon = document.getElementById('weatherIcon');
            if (icon && cur.condition?.icon) {
                icon.src = cur.condition.icon.startsWith('http') ? cur.condition.icon : `https:${cur.condition.icon}`;
                icon.classList.remove('hidden');
            }

            this.setText('weatherTemp', `${Math.round(cur.temp_c)}°C`);
            this.setText('weatherText', cur.condition?.text || '—');
            this.setText('weatherHumidity', `${cur.humidity}%`);
            this.setText('weatherWind', `${Math.round(cur.wind_kph)} km/h`);
            this.setText('weatherLocation', `${loc.name}`);
            this.setText('weatherCountry', `${loc.region ? loc.region + ', ' : ''}${loc.country}`);
            this.setText('weatherUpdated', `Updated ${loc.localtime}`);
        } catch (err) {
            console.warn('Weather fetch failed:', err.message);
            this.setText('weatherUpdated', 'Weather unavailable');
        }
    }

    setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    // ===== MQTT =====
    connectMQTT() {
        try {
            // Koneksi ke HiveMQ Cloud via WebSocket (Port 8884)
            this.client = mqtt.connect(this.serverUrl, {
                username: 'awikwok', // Pastikan user ini ada di HiveMQ
                password: 'vIw$Pcm1$WT9beu',
                clientId: 'WebDashboard_' + Math.random().toString(16).substring(2, 8)
            });

            this.client.on('connect', () => {
                this.isConnected = true;
                this.updateConnectionStatus('Connected', 'status-online pulse');
                this.updateSensorStatus('active');
                console.log(`✅ Connected to HiveMQ Cloud`);

                // PERBAIKAN DI SINI: Subscribe langsung ke sumber data ESP32
                this.client.subscribe('irrigation/data');   // Data Sensor (JSON)
                this.client.subscribe('irrigation/status'); // Status Alat (Text)
                this.client.subscribe('irrigation/logs');   // Logs Server (Backup)
            });

            this.client.on('message', (topic, message) => {
                const msg = message.toString();

                // 1. Jika Topik DATA (JSON dari ESP32)
                if (topic === 'irrigation/data' || topic === 'irrigation/logs') {
                    try {
                        const data = JSON.parse(msg);
                        this.processSensorData(data);
                    } catch (e) {
                        console.warn("Invalid JSON:", msg);
                    }
                }

                // 2. Jika Topik STATUS (Text dari ESP32)
                else if (topic === 'irrigation/status') {
                    console.log("Status Update:", msg);
                    if (msg.includes("CONNECTED") || msg.includes("ALIVE") || msg.includes("OK")) {
                        this.updateESP32Status("Connected");
                    } else if (msg.includes("DISCONNECTED")) {
                        this.updateESP32Status("Disconnected");
                    }
                }
            });

            this.client.on('reconnect', () => {
                this.updateConnectionStatus('Reconnecting...', 'status-connecting');
            });

            this.client.on('close', () => {
                this.isConnected = false;
                this.updateConnectionStatus('Disconnected', 'status-offline');
                this.updateSensorStatus('inactive');
                this.updateESP32Status('Disconnected');
            });

            this.client.on('error', (err) => {
                console.error('MQTT Error:', err.message);
                this.updateConnectionStatus('Error', 'status-offline');
                this.updateSensorStatus('error');
            });

        } catch (error) {
            console.error('MQTT connection failed:', error);
            this.updateConnectionStatus('Error', 'status-offline');
        }
    }

    processSensorData(data) {
        if (data.soil !== undefined) this.updateSoilData(data.soil);
        if (data.rain !== undefined) this.updateRainData(data.rain);
        if (data.pump !== undefined) this.updatePumpStatus(data.pump);
        if (data.mode !== undefined) this.updateModeStatus(data.mode);

        if (data.esp32Status) {
            const isConnected = data.esp32Status.includes("CONNECTED") || data.esp32Status.includes("ALIVE");
            this.updateESP32Status(isConnected ? "Connected" : "Disconnected");
        }

        if (data.local_ip) {
            const ipElement = document.getElementById('espIpAddress');
            if (ipElement) ipElement.textContent = data.local_ip;
        }

        // LOGIKA UPDATE LOKASI OTOMATIS & SIMPAN KE STORAGE
        if (data.public_ip) {
            // 1. Simpan IP Publik ke LocalStorage agar bisa dipakai di halaman Automation
            localStorage.setItem('esp_public_ip', data.public_ip);

            // 2. Jika IP berubah, update cuaca dashboard sekarang juga
            if (data.public_ip !== this.currentPublicIP) {
                console.log(`🌍 New Location Detected from ESP32: ${data.public_ip}`);
                this.currentPublicIP = data.public_ip;
                this.weatherQuery = data.public_ip;
                this.fetchWeather();
            }
        }

        this.updateLastUpdateTime();
    }

    // ===== UI updates (Sama seperti sebelumnya) =====
    updateSoilData(value) {
        const soilValueElement = document.getElementById('soilValue');
        const soilBarElement = document.getElementById('soilBar');
        const soilStatusElement = document.getElementById('soilStatusText');

        soilValueElement.textContent = `${value}%`;
        soilBarElement.style.width = `${value}%`;

        if (value < 30) {
            soilStatusElement.textContent = 'Dry - Needs watering';
            soilStatusElement.className = 'text-red-400';
        } else if (value < 70) {
            soilStatusElement.textContent = 'Optimal';
            soilStatusElement.className = 'text-green-400';
        } else {
            soilStatusElement.textContent = 'Wet - No watering needed';
            soilStatusElement.className = 'text-blue-400';
        }

        this.updateSystemHealth(value);
    }

    updateRainData(value) {
        const rainValueElement = document.getElementById('rainValue');
        const rainBarElement = document.getElementById('rainBar');
        const rainStatusElement = document.getElementById('rainStatusText');

        rainValueElement.textContent = `${value}%`;
        rainBarElement.style.width = `${value}%`;

        if (value < 20) {
            rainStatusElement.textContent = 'No rain';
            rainStatusElement.className = 'text-gray-400';
        } else if (value < 50) {
            rainStatusElement.textContent = 'Light rain';
            rainStatusElement.className = 'text-blue-400';
        } else {
            rainStatusElement.textContent = 'Heavy rain';
            rainStatusElement.className = 'text-blue-600';
        }
    }

    updatePumpStatus(status) {
        const pumpStatusElement = document.getElementById('pumpStatus');
        const pumpControlStatusElement = document.getElementById('pumpControlStatus');
        const pumpStatusTextElement = document.getElementById('pumpStatusText');
        const pumpDeviceStatusElement = document.getElementById('pumpDeviceStatus');

        pumpStatusElement.textContent = status;
        pumpControlStatusElement.textContent = status;

        const active = status.includes("ON");
        const statusText = active ? "Watering Active" : "Watering Inactive";
        const statusClass = active ? 'bg-green-900/50 text-green-400' : 'bg-gray-700 text-gray-300';

        pumpStatusTextElement.textContent = statusText;
        pumpStatusTextElement.className = `px-3 py-1 rounded-full text-sm font-medium ${statusClass}`;

        pumpDeviceStatusElement.textContent = active ? "Active" : "Inactive";
        pumpDeviceStatusElement.className = `px-2 py-1 rounded text-xs ${active ? 'bg-green-900/50 text-green-400' : 'bg-gray-700 text-gray-300'}`;
    }

    updateModeStatus(mode) {
        const modeText = document.getElementById('modeStatus');
        if (!modeText) return;
        this.autoMode = (mode === "auto");
        modeText.textContent = this.autoMode ? "Automatic Mode" : "Manual Mode";
        modeText.className = `font-semibold ${this.autoMode ? 'text-green-400' : 'text-yellow-400'}`;
    }

    updateSystemHealth(soilValue) {
        const systemHealthElement = document.getElementById('systemHealth');
        const systemHealthTextElement = document.getElementById('systemHealthText');

        let healthStatus, healthText, healthClass;

        if (soilValue < 20) {
            healthStatus = "Critical";
            healthText = "Soil too dry";
            healthClass = "bg-red-900/50 text-red-400";
        } else if (soilValue < 30) {
            healthStatus = "Warning";
            healthText = "Soil dry";
            healthClass = "bg-yellow-900/50 text-yellow-400";
        } else if (soilValue < 70) {
            healthStatus = "Good";
            healthText = "Optimal moisture";
            healthClass = "bg-green-900/50 text-green-400";
        } else {
            healthStatus = "Warning";
            healthText = "Soil too wet";
            healthClass = "bg-yellow-900/50 text-yellow-400";
        }

        systemHealthElement.textContent = healthStatus;
        systemHealthTextElement.textContent = healthText;
        systemHealthTextElement.className = `px-3 py-1 rounded-full text-sm font-medium ${healthClass}`;
    }

    updateSensorStatus(status) {
        const statusClass =
            status === 'active' ? 'bg-green-900/50 text-green-400' :
                status === 'inactive' ? 'bg-gray-700 text-gray-300' :
                    'bg-red-900/50 text-red-400';

        const statusText =
            status === 'active' ? 'Active' :
                status === 'inactive' ? 'Inactive' : 'Error';

        document.getElementById('soilSensorStatus').textContent = statusText;
        document.getElementById('soilSensorStatus').className = `px-2 py-1 rounded text-xs ${statusClass}`;

        document.getElementById('rainSensorStatus').textContent = statusText;
        document.getElementById('rainSensorStatus').className = `px-2 py-1 rounded text-xs ${statusClass}`;
    }

    updateESP32Status(status) {
        const esp32StatusElement = document.getElementById('esp32Status');
        const wifiStatusElement = document.getElementById('wifiStatus');

        esp32StatusElement.textContent = status;

        if (status === 'Connected') {
            esp32StatusElement.className = 'text-green-400';
            wifiStatusElement.textContent = 'Connected';
            wifiStatusElement.className = 'px-2 py-1 rounded text-xs bg-green-900/50 text-green-400';
        } else {
            esp32StatusElement.className = 'text-red-400';
            wifiStatusElement.textContent = 'Disconnected';
            wifiStatusElement.className = 'px-2 py-1 rounded text-xs bg-red-900/50 text-red-400';
        }
    }

    updateConnectionStatus(status, indicatorClass) {
        const ind = document.getElementById('connectionIndicator');
        if (ind) ind.className = `status-indicator ${indicatorClass}`;
        this.setText('connectionStatus', status);
    }

    updateLastUpdateTime() {
        const now = new Date();
        this.setText('lastUpdate', now.toLocaleTimeString());
    }

    updateLastRestartTime() {
        const restartTime = new Date();
        const el = document.getElementById('lastRestart');
        if (el) el.textContent = restartTime.toLocaleTimeString();
    }

    // ===== Controls (no notification calls) =====
    setupEventListeners() {
        const onBtn = document.getElementById('btnOn');
        const offBtn = document.getElementById('btnOff');

        if (onBtn) onBtn.addEventListener('click', () => {
            if (this.isConnected) this.client.publish('irrigation/commands', 'WATER_ON');
        });

        if (offBtn) offBtn.addEventListener('click', () => {
            if (this.isConnected) this.client.publish('irrigation/commands', 'WATER_OFF');
        });

        const btnAuto = document.getElementById('btnAuto');
        if (btnAuto) btnAuto.addEventListener('click', () => {
            if (this.isConnected) this.client.publish('irrigation/commands', 'AUTO_MODE');
        });
    }

    // ===== Timers =====
    startUptimeCounter() {
        const startTime = new Date();
        setInterval(() => {
            const now = new Date();
            const diff = now - startTime;
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            this.setText('uptime', `${days}d ${hours}h ${minutes}m`);
        }, 1000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.irrigationDashboard = new IrrigationDashboard();
});