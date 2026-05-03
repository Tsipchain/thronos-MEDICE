import { postReading, registerDevice } from './api';

// TODO(Android APK): replace demo implementations with Capacitor BLE plugin calls.
// Candidate APIs:
// - scanDevices() => BLE scan
// - connectDevice(deviceId) => BLE connect/pair
// - provisionDevice(config) => BLE/Wi-Fi provisioning payload

export async function scanDevices() {
  return [{ device_id: 'THR-MEDICE-DEMO-001', device_type: 'bracelet' }];
}

export async function connectDevice(deviceId: string) {
  return { status: 'connected', deviceId };
}

export async function provisionDevice(config: {
  patient_id: number;
  device_id: string;
  device_type?: string;
  firmware_version?: string;
  connection_mode?: string;
}) {
  return registerDevice(config);
}

export async function sendTestReading(patientId: number, deviceId: string) {
  return postReading({
    patient_id: String(patientId),
    device_id: deviceId,
    temperature: 37.2,
    spo2: 98,
    bpm: 82,
    systolic: 118,
    diastolic: 76,
    spo2_valid: true,
    bpm_valid: true,
    bp_valid: true,
  });
}
