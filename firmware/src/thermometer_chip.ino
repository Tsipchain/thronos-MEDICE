#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <NimBLEDevice.h>
#include <Wire.h>
#include <Adafruit_MLX90614.h>
#include <MAX30105.h>
#include <heartRate.h>
#include <spo2_algorithm.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include "config.h"

// ── Persistent storage (survives reboot) ───────────────────────────────────
Preferences prefs;
char        patientId[16]  = DEFAULT_PATIENT_ID;
char        wifiSsid[64]   = WIFI_SSID;
char        wifiPass[64]   = WIFI_PASSWORD;
char        deviceId[20];   // filled from MAC in setup()

// ── BLE ────────────────────────────────────────────────────────────────────
NimBLEServer*         pServer         = nullptr;
NimBLECharacteristic* pTempChar       = nullptr;
NimBLECharacteristic* pVitalChar      = nullptr;
NimBLECharacteristic* pAlertChar      = nullptr;
NimBLECharacteristic* pProvChar       = nullptr;
bool                  bleConnected    = false;

// ── Sensors ────────────────────────────────────────────────────────────────
Adafruit_MLX90614 mlx;
MAX30105          particleSensor;

// ── Timing ─────────────────────────────────────────────────────────────────
unsigned long lastTempMs  = 0;
unsigned long lastVitalMs = 0;

// ── SpO2 / HR buffers ──────────────────────────────────────────────────────
uint32_t irBuffer[100], redBuffer[100];
int32_t  spo2;      int8_t validSPO2;
int32_t  heartRate; int8_t validHR;

// ── Blood pressure (populated only when BP_SENSOR_PRESENT == 1) ───────────
int16_t bpSystolic  = 0;
int16_t bpDiastolic = 0;
bool    bpValid     = false;

// ═══════════════════════════════════════════════════════════════════════════
// BLE
// ═══════════════════════════════════════════════════════════════════════════

class ConnectCB : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer*) override    { bleConnected = true; }
  void onDisconnect(NimBLEServer*) override {
    bleConnected = false;
    NimBLEDevice::startAdvertising();
  }
};

// Provisioning write: phone sends JSON {"patient_id":"3","ssid":"Home","pass":"1234"}
class ProvCB : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* c) override {
    StaticJsonDocument<256> doc;
    if (deserializeJson(doc, c->getValue()) != DeserializationError::Ok) return;
    if (doc.containsKey("patient_id")) {
      strlcpy(patientId, doc["patient_id"] | DEFAULT_PATIENT_ID, sizeof(patientId));
      prefs.putString("patient_id", patientId);
    }
    if (doc.containsKey("ssid") && doc.containsKey("pass")) {
      strlcpy(wifiSsid, doc["ssid"] | WIFI_SSID,     sizeof(wifiSsid));
      strlcpy(wifiPass, doc["pass"] | WIFI_PASSWORD,  sizeof(wifiPass));
      prefs.putString("wifi_ssid", wifiSsid);
      prefs.putString("wifi_pass", wifiPass);
      // Reconnect with new credentials
      WiFi.disconnect();
      WiFi.begin(wifiSsid, wifiPass);
    }
    Serial.printf("[PROV] patient=%s ssid=%s\n", patientId, wifiSsid);
  }
};

void setupBLE() {
  NimBLEDevice::init(DEVICE_NAME);
  pServer = NimBLEDevice::createServer();
  pServer->setCallbacks(new ConnectCB());

  auto* svc  = pServer->createService(TEMP_SERVICE_UUID);
  pTempChar  = svc->createCharacteristic(TEMP_CHARACTERISTIC_UUID,
                 NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  pVitalChar = svc->createCharacteristic(VITAL_CHARACTERISTIC_UUID,
                 NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  pAlertChar = svc->createCharacteristic(ALERT_CHARACTERISTIC_UUID,
                 NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY);
  pProvChar  = svc->createCharacteristic(PROV_CHARACTERISTIC_UUID,
                 NIMBLE_PROPERTY::WRITE);
  pProvChar->setCallbacks(new ProvCB());
  svc->start();

  auto* adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(TEMP_SERVICE_UUID);
  adv->start();
  Serial.println("[BLE] Advertising");
}

// ═══════════════════════════════════════════════════════════════════════════
// WiFi
// ═══════════════════════════════════════════════════════════════════════════

bool wifiConnected() {
  return WiFi.status() == WL_CONNECTED;
}

void setupWiFi() {
#if UPLOAD_MODE == 0
  return;  // BLE-only mode, skip WiFi
#endif
  Serial.printf("[WiFi] Connecting to %s\n", wifiSsid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(wifiSsid, wifiPass);
  unsigned long t = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t < WIFI_CONNECT_TIMEOUT_MS) {
    delay(250);
    Serial.print('.');
  }
  if (wifiConnected()) {
    Serial.printf("\n[WiFi] IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[WiFi] Failed — BLE fallback active");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Sensors
// ═══════════════════════════════════════════════════════════════════════════

bool setupMAX30102() {
  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) return false;
  particleSensor.setup(60, 4, 2, 200, 411, 4096);
  particleSensor.setPulseAmplitudeRed(0x0A);
  particleSensor.setPulseAmplitudeGreen(0);
  return true;
}

void readSpO2() {
  for (byte i = 0; i < 100; i++) {
    while (!particleSensor.available()) particleSensor.check();
    redBuffer[i] = particleSensor.getRed();
    irBuffer[i]  = particleSensor.getIR();
    particleSensor.nextSample();
  }
  maxim_heart_rate_and_oxygen_saturation(
    irBuffer, 100, redBuffer, &spo2, &validSPO2, &heartRate, &validHR);
}

#if BP_SENSOR_PRESENT
// Stub: replace with your IC's actual driver calls (e.g. BM1390, HX711+cuff)
void readBP() {
  // TODO: read systolic/diastolic from BP IC over I2C
  // bpSystolic  = ic.getSystolic();
  // bpDiastolic = ic.getDiastolic();
  // bpValid     = ic.isValid();
}
#endif

// ═══════════════════════════════════════════════════════════════════════════
// HTTP upload
// ═══════════════════════════════════════════════════════════════════════════

bool postToAPI(float tempC) {
  if (!wifiConnected()) return false;

  StaticJsonDocument<384> doc;
  doc["patient_id"]  = patientId;
  doc["device_id"]   = deviceId;
  doc["temperature"] = serialized(String(tempC, 2));
  doc["spo2"]        = validSPO2 ? spo2      : 0;
  doc["bpm"]         = validHR   ? heartRate : 0;
  doc["spo2_valid"]  = (bool)validSPO2;
  doc["bpm_valid"]   = (bool)validHR;
#if BP_SENSOR_PRESENT
  doc["systolic"]    = bpSystolic;
  doc["diastolic"]   = bpDiastolic;
  doc["bp_valid"]    = bpValid;
#else
  doc["bp_valid"]    = false;
#endif

  char body[384];
  serializeJson(doc, body);

  for (int attempt = 1; attempt <= WIFI_RETRY_COUNT; attempt++) {
    HTTPClient http;
    http.begin(String(API_BASE_URL) + API_READINGS_PATH);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(HTTP_TIMEOUT_MS);
    int code = http.POST(body);
    http.end();

    if (code == 200 || code == 201) {
      Serial.printf("[HTTP] POST ok (attempt %d)\n", attempt);
      return true;
    }
    Serial.printf("[HTTP] Attempt %d failed: %d\n", attempt, code);
    delay(1000 * attempt);  // 1s, 2s, 3s back-off
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// BLE notify helpers
// ═══════════════════════════════════════════════════════════════════════════

void bleNotifyFull(float tempC) {
  if (!bleConnected) return;

  StaticJsonDocument<256> doc;
  doc["temperature"] = tempC;
  doc["spo2"]        = validSPO2 ? spo2      : -1;
  doc["bpm"]         = validHR   ? heartRate : -1;
  doc["spo2_valid"]  = (bool)validSPO2;
  doc["bpm_valid"]   = (bool)validHR;
#if BP_SENSOR_PRESENT
  doc["systolic"]    = bpSystolic;
  doc["diastolic"]   = bpDiastolic;
  doc["bp_valid"]    = bpValid;
#endif
  char buf[256];
  serializeJson(doc, buf);
  pTempChar->setValue((uint8_t*)buf, strlen(buf));
  pTempChar->notify();
}

void bleNotifyVitals() {
  if (!bleConnected) return;

  StaticJsonDocument<128> vdoc;
  vdoc["spo2"] = validSPO2 ? spo2      : -1;
  vdoc["bpm"]  = validHR   ? heartRate : -1;
  char vbuf[128];
  serializeJson(vdoc, vbuf);
  pVitalChar->setValue((uint8_t*)vbuf, strlen(vbuf));
  pVitalChar->notify();
}

void bleAlert(const char* type, float value) {
  if (!bleConnected) return;
  StaticJsonDocument<128> doc;
  doc["alert"] = type;
  doc["value"] = value;
  char buf[128];
  serializeJson(doc, buf);
  pAlertChar->setValue((uint8_t*)buf, strlen(buf));
  pAlertChar->notify();
}

// ═══════════════════════════════════════════════════════════════════════════
// Arduino entry points
// ═══════════════════════════════════════════════════════════════════════════

void setup() {
  Serial.begin(115200);
  Wire.begin();

  // Load persisted config
  prefs.begin("medice", false);
  strlcpy(patientId, prefs.getString("patient_id", DEFAULT_PATIENT_ID).c_str(), sizeof(patientId));
  strlcpy(wifiSsid,  prefs.getString("wifi_ssid",  WIFI_SSID).c_str(),          sizeof(wifiSsid));
  strlcpy(wifiPass,  prefs.getString("wifi_pass",  WIFI_PASSWORD).c_str(),       sizeof(wifiPass));

  // Device ID = last 6 bytes of MAC
  uint8_t mac[6];
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  snprintf(deviceId, sizeof(deviceId), "ICE-%02X%02X%02X%02X%02X%02X",
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  Serial.printf("[BOOT] Device: %s  Patient: %s\n", deviceId, patientId);

  setupBLE();
  setupWiFi();

  if (!mlx.begin())       Serial.println("[WARN] MLX90614 not found");
  if (!setupMAX30102())   Serial.println("[WARN] MAX30102 not found");

  Serial.println("[BOOT] ThronomedICE ready");
}

void loop() {
  unsigned long now = millis();

  // ── Full reading every 5 minutes ─────────────────────────────────────────
  if (now - lastTempMs >= MEASUREMENT_INTERVAL_MS) {
    lastTempMs = now;
    float tempC = mlx.readObjectTempC();
    if (isnan(tempC)) return;

    readSpO2();
#if BP_SENSOR_PRESENT
    readBP();
#endif

    // Upload: WiFi first, BLE if WiFi unavailable or BLE-only mode
#if UPLOAD_MODE == 0
    bleNotifyFull(tempC);  // BLE-only: phone app posts to server
#elif UPLOAD_MODE == 1
    postToAPI(tempC);      // WiFi only (silent if no BLE connection)
    bleNotifyFull(tempC);  // also update phone display
#else // UPLOAD_MODE == 2
    bool uploaded = postToAPI(tempC);
    // In fallback mode, notify via BLE so phone can relay if WiFi failed
    if (!uploaded || bleConnected) bleNotifyFull(tempC);
#endif

    // BLE local alerts regardless of upload mode
    if      (tempC >= HIGH_FEVER_THRESHOLD)              bleAlert("HIGH_FEVER", tempC);
    else if (tempC >= FEVER_THRESHOLD)                   bleAlert("FEVER", tempC);
    if (validSPO2 && spo2 < SPO2_CRITICAL)               bleAlert("SPO2_CRITICAL", spo2);
    else if (validSPO2 && spo2 < SPO2_LOW_THRESHOLD)     bleAlert("SPO2_LOW", spo2);
    if (validHR && (heartRate < BPM_LOW_CHILD || heartRate > BPM_HIGH_CHILD))
                                                         bleAlert("HR_ABNORMAL", heartRate);
  }

  // ── Vitals-only read every 1 minute (BLE display refresh) ────────────────
  if (now - lastVitalMs >= VITAL_INTERVAL_MS) {
    lastVitalMs = now;
    readSpO2();
    bleNotifyVitals();
  }

  // ── WiFi watchdog: reconnect if dropped ──────────────────────────────────
#if UPLOAD_MODE != 0
  if (WiFi.status() == WL_CONNECTION_LOST || WiFi.status() == WL_DISCONNECTED) {
    Serial.println("[WiFi] Reconnecting...");
    WiFi.reconnect();
  }
#endif
}
