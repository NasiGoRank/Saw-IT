#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ============================
// WiFi Configuration
// ============================
const char* ssid = "PNJ_Hotspot";
const char* password = "0217270036";

// ============================
// MQTT Configuration
// ============================
const char* mqtt_server = "10.24.32.155";  
const int mqtt_port = 1883;

WiFiClient espClient;
PubSubClient client(espClient);

// ============================
// Hardware Pins
// ============================
const int pinSoil = 34;
const int pinRain = 35;
const int pinPump = 4;  // LOW trigger relay

// ============================
// CALIBRATION SETTINGS (PENTING)
// ============================
// Ganti nilai ini sesuai hasil tes sensor Anda!
const int SOIL_DRY = 3500; // Nilai Raw saat KERING (Udara)
const int SOIL_WET = 1200; // Nilai Raw saat BASAH (Air)

// Kalibrasi Sensor Hujan (Opsional, sesuaikan jika perlu)
const int RAIN_DRY = 4095; 
const int RAIN_WET = 0;

// ============================
// Control Settings
// ============================
const int soilStopPercent = 30; // Batas auto stop
const int rainStopPercent = 70;

bool manualOverride = false;
bool manualPumpState = false;
unsigned long manualStartTime = 0;
const unsigned long manualTimeout = 3000; // Auto-revert ke Auto setelah 3 detik (sesuai kode lama)

unsigned long lastSend = 0;
const unsigned long sendInterval = 1000;
unsigned long lastStatusPing = 0;

// ============================
// WiFi Setup
// ============================
void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("WiFi connected");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
}

// ============================
// MQTT Callback
// ============================
void callback(char* topic, byte* payload, unsigned int length) {
  String message;
  for (unsigned int i = 0; i < length; i++) message += (char)payload[i];

  Serial.printf("MQTT -> %s\n", message.c_str());

  if (message == "WATER_ON") {
    manualOverride = true;
    manualPumpState = true;
    manualStartTime = millis();
    digitalWrite(pinPump, LOW);  // LOW = ON
    client.publish("irrigation/status", "WATER_ON_OK");
  }
  else if (message == "WATER_OFF") {
    manualOverride = true;
    manualPumpState = false;
    manualStartTime = millis();
    digitalWrite(pinPump, HIGH); // HIGH = OFF
    client.publish("irrigation/status", "WATER_OFF_OK");
  }
  else if (message == "AUTO_MODE") {
    manualOverride = false;
    client.publish("irrigation/status", "AUTO_MODE_OK");
  }
}

// ============================
// Connectivity
// ============================
void reconnect() {
  while (!client.connected()) {
    Serial.print("Connecting MQTT...");
    if (client.connect("ESP32_IRRIGATION_01")) {
      Serial.println("connected");
      client.subscribe("irrigation/control");
      client.publish("irrigation/status", "ESP32_CONNECTED");
    } else {
      Serial.print("failed rc=");
      Serial.println(client.state());
      delay(3000);
    }
  }
}

// ============================
// Setup
// ============================
void setup() {
  Serial.begin(115200);

  pinMode(pinPump, OUTPUT);
  digitalWrite(pinPump, HIGH);   // Start OFF (HIGH = OFF)

  // Setup ADC resolution (ESP32 default is 12-bit: 0-4095)
  analogReadResolution(12); 

  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
}

// ============================
// Main Loop
// ============================
void loop() {
  if (!client.connected()) reconnect();
  client.loop();

  unsigned long now = millis();

  // Keep-alive status
  if (now - lastStatusPing > 2000) {
    client.publish("irrigation/status", "ESP32_ALIVE");
    lastStatusPing = now;
  }

  // Timeout manual mode
  if (manualOverride && (now - manualStartTime > manualTimeout)) {
    manualOverride = false;
    client.publish("irrigation/status", "AUTO_MODE_OK");
  }

  // Read Sensors & Logic
  if (now - lastSend >= sendInterval) {
    lastSend = now;

    int soilRaw = analogRead(pinSoil);
    int rainRaw = analogRead(pinRain);

    // -----------------------------------------------------------
    // LOGIKA KALIBRASI INTEGER (TANPA FLOAT)
    // -----------------------------------------------------------
    
    // 1. Clamp (Batasi nilai raw agar tidak minus saat dihitung)
    int soilClamped = constrain(soilRaw, SOIL_WET, SOIL_DRY);

    // 2. Hitung Persen dengan Matematika Integer
    // Rumus: (Selisih * 100) / Rentang Total
    // Kita pakai 'long' sementara agar hasil kali * 100 tidak overflow (meski di ESP32 int cukup besar)
    long soilNumerator = (long)(SOIL_DRY - soilClamped) * 100;
    long soilDenominator = (long)(SOIL_DRY - SOIL_WET);
    
    int soilPercent = 0;
    if (soilDenominator != 0) { // Safety check agar tidak bagi dengan 0
        soilPercent = (int)(soilNumerator / soilDenominator);
    }

    // 3. Sensor Hujan (Mapping biasa)
    int rainPercent = map(rainRaw, RAIN_DRY, RAIN_WET, 0, 100);
    
    // 4. Final Safety Clamp (0-100)
    soilPercent = constrain(soilPercent, 0, 100);
    rainPercent = constrain(rainPercent, 0, 100);

    // -----------------------------------------------------------

    String pumpStatus;

    // === Automatic control ===
    if (!manualOverride) {
      if (soilPercent < soilStopPercent && rainPercent < rainStopPercent) {
        digitalWrite(pinPump, LOW);  // ON
        pumpStatus = "ON (auto)";
      } else {
        digitalWrite(pinPump, HIGH); // OFF
        pumpStatus = "OFF (auto)";
      }
    }

    // === Manual control ===
    else {
      digitalWrite(pinPump, manualPumpState ? LOW : HIGH);
      pumpStatus = manualPumpState ? "ON (manual)" : "OFF (manual)";
    }

    // JSON Construction
    // ArduinoJson akan otomatis mendeteksi tipe data 'int' dan tidak akan menambahkan desimal
    StaticJsonDocument<256> jsonDoc;
    jsonDoc["soil"] = soilPercent; 
    jsonDoc["rain"] = rainPercent;
    jsonDoc["pump"] = pumpStatus;
    jsonDoc["mode"] = manualOverride ? "manual" : "auto";

    char jsonBuffer[256];
    serializeJson(jsonDoc, jsonBuffer);

    client.publish("irrigation/data", jsonBuffer);
    Serial.println(jsonBuffer);
  }
}