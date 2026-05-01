#pragma once

// ── WiFi credentials (edit before flashing) ────────────────────────────────
#define WIFI_SSID          "YOUR_WIFI_SSID"
#define WIFI_PASSWORD      "YOUR_WIFI_PASSWORD"

// ── Railway API ────────────────────────────────────────────────────────────
// Set this to your deployed Railway service URL
#define API_BASE_URL       "https://your-service.up.railway.app"
#define API_READINGS_PATH  "/readings"

// Patient ID assigned when the device is registered in the app
// Can be overwritten at runtime via BLE provisioning characteristic
#define DEFAULT_PATIENT_ID "1"

// ── BLE UUIDs ──────────────────────────────────────────────────────────────
#define TEMP_SERVICE_UUID          "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define TEMP_CHARACTERISTIC_UUID   "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define VITAL_CHARACTERISTIC_UUID  "beb5483e-36e1-4688-b7f5-ea07361b26aa"
#define ALERT_CHARACTERISTIC_UUID  "beb5483e-36e1-4688-b7f5-ea07361b26a9"
// Write patient-id + wifi creds from phone during first setup
#define PROV_CHARACTERISTIC_UUID   "beb5483e-36e1-4688-b7f5-ea07361b26ab"

// ── MLX90614 (IR Thermometer) ───────────────────────────────────────────────
#define FEVER_THRESHOLD           38.0f
#define HIGH_FEVER_THRESHOLD      39.0f
#define MEASUREMENT_INTERVAL_MS   300000UL  // 5 minutes

// ── MAX30102 (Pulse Oximeter + HR) ─────────────────────────────────────────
#define MAX30102_I2C_ADDR         0x57
#define SPO2_LOW_THRESHOLD        94.0f
#define SPO2_CRITICAL             90.0f
#define BPM_LOW_CHILD             60
#define BPM_HIGH_CHILD            130
#define SPO2_SAMPLE_WINDOW        5
#define VITAL_INTERVAL_MS         60000UL   // vitals-only read every 1 minute

// ── Blood Pressure sensor (optional add-on IC, e.g. BM1390) ───────────────
// Set to 1 when a dedicated BP sensor is physically connected
#define BP_SENSOR_PRESENT         0
#define BP_I2C_ADDR               0x5C      // BM1390 default address

// ── Connectivity behaviour ─────────────────────────────────────────────────
// UPLOAD_MODE 0 = BLE only (phone relays to server)
// UPLOAD_MODE 1 = WiFi direct POST (BLE still used for local display)
// UPLOAD_MODE 2 = WiFi primary, BLE fallback
#define UPLOAD_MODE               2

#define WIFI_CONNECT_TIMEOUT_MS   10000UL   // 10 s to acquire IP
#define HTTP_TIMEOUT_MS           8000
#define WIFI_RETRY_COUNT          3

// ── Device ─────────────────────────────────────────────────────────────────
#define DEVICE_NAME               "ThronomedICE"
#define BATTERY_PIN               A0
