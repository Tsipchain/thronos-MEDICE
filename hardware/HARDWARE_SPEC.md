# ThronomedICE - Hardware Specification

## The Wearable Device

A child-safe IoT wristband that measures body temperature + SpO2 + heart rate
continuously and transmits data via Bluetooth Low Energy (BLE) to the parent's phone.

---

## Bill of Materials (per unit)

| # | Component | Model | Purpose | Cost (1k units) |
|---|-----------|-------|---------|------------------|
| 1 | Microcontroller | **ESP32-S3 Mini** | BLE 5.0 + WiFi, ultra-low-power sleep | $3.50 |
| 2 | IR Thermometer | **MLX90614ESF-BAA** | Non-contact body temp, ±0.5°C accuracy | $8.00 |
| 3 | Pulse Oximeter | **MAX30102** | SpO2 + heart rate | $4.50 |
| 4 | Battery | LiPo 3.7V 180mAh | Rechargeable, thin profile | $2.50 |
| 5 | Charge IC | TP4056 + USB-C | Safe LiPo charging via USB-C | $0.80 |
| 6 | PCB | Custom 2-layer | All components on 25×20mm board | $1.20 |
| 7 | Enclosure | Medical-grade silicone | Wristband, IP67, hypoallergenic | $4.00 |
| 8 | Assembly | SMT + test | - | $3.00 |
| | **Total** | | | **~$27.50 / unit** |

---

## Wiring Diagram

```
ESP32-S3 Mini        MLX90614        MAX30102
-----------          --------        --------
GPIO 21 (SDA) -----> SDA      -----> SDA
GPIO 22 (SCL) -----> SCL      -----> SCL
3.3V          -----> VCC      -----> VCC
GND           -----> GND      -----> GND

ESP32-S3 Mini        TP4056
-----------          ------
3.3V          <----- OUT+
GND           <----- OUT-
```

---

## Form Factor Options

### Option A - Wristband (recommended, age 2+)
- Soft silicone strap, 14-20 cm adjustable
- MLX90614 sensor window on inner wrist (radial artery)
- MAX30102 on fingertip contact pad
- Wrist-to-oral temperature correction factor: **+0.3°C** applied in firmware

### Option B - Chest Patch (recommended, age 0-24 months)
- Medical-grade adhesive patch (hypoallergenic)
- Sensor 1-2mm from skin, taped flat
- Change patch every 48h

### Option C - Ear Clip (age 5+)
- Soft silicone clip over earlobe
- Most accurate reading for core temperature

---

## Power Budget

| Mode | Current Draw | Battery Life (180mAh) |
|------|-------------|----------------------|
| Active: BLE TX + Both Sensors | 100 mA | ~1.8 h |
| BLE advertising + ESP light-sleep | 8 mA | ~22 h |
| Deep sleep (wake every 5 min) | 0.15 mA peak avg | **~7 days** |

---

## Sensor Accuracy

- **MLX90614**: ±0.5°C in 36–40°C range, 500ms sample time
- **MAX30102**: SpO2 ±2%, HR ±3 BPM (in good contact)
- **Calibration**: Factory-calibrated; per-device offset in NVS

---

## BLE Protocol

| Item | Value |
|------|-------|
| Service UUID | `4fafc201-1fb5-459e-8fcc-c5c9c331914b` |
| Temp+Vitals Characteristic | `beb5483e-36e1-4688-b7f5-ea07361b26a8` (Notify) |
| Vitals-only Characteristic | `beb5483e-36e1-4688-b7f5-ea07361b26aa` (Notify, 1 min) |
| Alert Characteristic | `beb5483e-36e1-4688-b7f5-ea07361b26a9` (Notify) |

### Temp+Vitals Payload (JSON, UTF-8 over BLE, every 5 min)

```json
{
  "temperature": 38.52,
  "spo2": 97,
  "bpm": 88,
  "spo2_valid": true,
  "bpm_valid": true,
  "ts": 1714512000
}
```

### Alert Payload

```json
{ "alert": "HIGH_FEVER", "value": 39.2 }
{ "alert": "SPO2_CRITICAL", "value": 88 }
{ "alert": "HR_ABNORMAL", "value": 145 }
```

---

## Regulatory Requirements

| Market | Certification | Class |
|--------|--------------|-------|
| EU | CE + MDR (Medical Device Regulation) | Class IIa |
| USA | FDA 510(k) | Class II |
| Global | ISO 13485 (Quality Management) | - |
| Global | IEC 60601-1 (Electrical Safety) | - |

> **Note**: As a monitoring-only device (no active therapy), the regulatory
> pathway is simplified. Consult a Notified Body before CE marking.
