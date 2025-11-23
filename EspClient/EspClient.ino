#include <WiFi.h>
#include <WiFiClientSecure.h> // PENTING: Untuk koneksi SSL ke HiveMQ
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>       // PENTING: Untuk cek Public IP

// ============================
// 1. WiFi Configuration
// ============================
const char* ssid = "PNJ_Hotspot";     // Ganti dengan WiFi Anda
const char* password = "0217270036";

// ============================
// 2. HiveMQ Cloud Configuration
// ============================
// URL Cluster (Tanpa tls://)
const char* mqtt_server = "f8dcdda3c9b746c3a5a70a83d5758987.s1.eu.hivemq.cloud"; 
const int mqtt_port = 8883; // Port SSL

// User Device yang dibuat di HiveMQ
const char* mqtt_user = "awikwok"; 
const char* mqtt_pass = "vIw$Pcm1$WT9beu"; 

// Gunakan WiFiClientSecure
WiFiClientSecure espClient;
PubSubClient client(espClient);

// ============================
// Hardware Pins
// ============================
const int pinSoil = 34;
const int pinRain = 35;
const int pinPump = 4; // LOW trigger relay

// ============================
// CALIBRATION SETTINGS
// ============================
const int SOIL_DRY = 3500; 
const int SOIL_WET = 1200; 
const int RAIN_DRY = 4095;
const int RAIN_WET = 0;

// Control Settings
const int soilStopPercent = 30;
const int rainStopPercent = 70;

// Variables
bool manualOverride = false;
bool manualPumpState = false;
unsigned long manualStartTime = 0;
const unsigned long manualTimeout = 60000; // 1 menit timeout

unsigned long lastSend = 0;
const unsigned long sendInterval = 2000; // Kirim data tiap 2 detik
unsigned long lastStatusPing = 0;
String publicIP = ""; // Variabel IP Publik

// ============================
// Helper: Get Public IP
// ============================
String getPublicIP() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    // Menggunakan layanan ipify untuk cek IP publik
    http.begin("http://api.ipify.org"); 
    int httpCode = http.GET();
    
    if (httpCode > 0) {
      String payload = http.getString();
      http.end();
      return payload; 
    }
    http.end();
  }
  return "";
}

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

  Serial.println("\nWiFi connected");
  Serial.print("Local IP: ");
  Serial.println(WiFi.localIP());

  // --- AMBIL PUBLIC IP ---
  Serial.print("Fetching Public IP...");
  publicIP = getPublicIP();
  Serial.println(publicIP);

  // Bypass sertifikat SSL (untuk kemudahan)
  espClient.setInsecure();
}

// ============================
// MQTT Callback & Reconnect
// ============================
void callback(char* topic, byte* payload, unsigned int length) {
  String message;
  for (unsigned int i = 0; i < length; i++) message += (char)payload[i];
  Serial.printf("MQTT -> %s\n", message.c_str());

  if (message == "WATER_ON") {
    manualOverride = true;
    manualPumpState = true;
    manualStartTime = millis();
    digitalWrite(pinPump, LOW); 
    client.publish("irrigation/status", "WATER_ON_OK");
  }
  else if (message == "WATER_OFF") {
    manualOverride = true;
    manualPumpState = false;
    manualStartTime = millis();
    digitalWrite(pinPump, HIGH); 
    client.publish("irrigation/status", "WATER_OFF_OK");
  }
  else if (message == "AUTO_MODE") {
    manualOverride = false;
    client.publish("irrigation/status", "AUTO_MODE_OK");
  }
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Connecting to HiveMQ...");
    String clientId = "ESP32Client-";
    clientId += String(random(0xffff), HEX);

    if (client.connect(clientId.c_str(), mqtt_user, mqtt_pass)) {
      Serial.println("connected");
      client.subscribe("irrigation/control");
      client.publish("irrigation/status", "ESP32_CONNECTED");
    } else {
      Serial.print("failed rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

// ============================
// Setup
// ============================
void setup() {
  Serial.begin(115200);
  pinMode(pinPump, OUTPUT);
  digitalWrite(pinPump, HIGH); // Start OFF
  analogReadResolution(12); 

  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  client.setCallback(callback);
  client.setBufferSize(512); 
}

// ============================
// Main Loop
// ============================
void loop() {
  if (!client.connected()) reconnect();
  client.loop();

  unsigned long now = millis();

  // Ping Status
  if (now - lastStatusPing > 5000) {
    client.publish("irrigation/status", "ESP32_ALIVE");
    lastStatusPing = now;
  }

  // Manual Timeout
  if (manualOverride && (now - manualStartTime > manualTimeout)) {
    manualOverride = false;
    client.publish("irrigation/status", "AUTO_MODE_OK");
  }

  // Send Sensor Data
  if (now - lastSend >= sendInterval) {
    lastSend = now;
    
    int soilRaw = analogRead(pinSoil);
    int rainRaw = analogRead(pinRain);

    // --- LOGIKA KALIBRASI ---
    int soilClamped = constrain(soilRaw, SOIL_WET, SOIL_DRY);
    long soilNumerator = (long)(SOIL_DRY - soilClamped) * 100;
    long soilDenominator = (long)(SOIL_DRY - SOIL_WET);
    
    int soilPercent = 0;
    if (soilDenominator != 0) soilPercent = (int)(soilNumerator / soilDenominator);

    int rainPercent = map(rainRaw, RAIN_DRY, RAIN_WET, 0, 100);
    soilPercent = constrain(soilPercent, 0, 100);
    rainPercent = constrain(rainPercent, 0, 100);

    String pumpStatus;
    if (!manualOverride) {
      if (soilPercent < soilStopPercent && rainPercent < rainStopPercent) {
        digitalWrite(pinPump, LOW);
        pumpStatus = "ON (auto)";
      } else {
        digitalWrite(pinPump, HIGH);
        pumpStatus = "OFF (auto)";
      }
    } else {
      digitalWrite(pinPump, manualPumpState ? LOW : HIGH);
      pumpStatus = manualPumpState ? "ON (manual)" : "OFF (manual)";
    }

    // --- JSON CONSTRUCTION (UPDATED) ---
    StaticJsonDocument<350> jsonDoc;
    jsonDoc["soil"] = soilPercent; 
    jsonDoc["rain"] = rainPercent;
    jsonDoc["pump"] = pumpStatus;
    jsonDoc["mode"] = manualOverride ? "manual" : "auto";
    
    // INI YANG PENTING: Kirim IP ke Dashboard
    jsonDoc["local_ip"] = WiFi.localIP().toString();
    jsonDoc["public_ip"] = publicIP; 

    char jsonBuffer[350];
    serializeJson(jsonDoc, jsonBuffer);
    
    client.publish("irrigation/data", jsonBuffer);
    Serial.println(jsonBuffer);
  }
}