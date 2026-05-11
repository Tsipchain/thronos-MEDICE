import { postReading, registerDevice } from './api';

type BleDevice = { deviceId: string; name?: string; uuids?: string[]; profile?: string };
const HTS = '00001809-0000-1000-8000-00805f9b34fb';
const TEMP_MEAS = '00002a1c-0000-1000-8000-00805f9b34fb';
const TEMP_INTER = '00002a1e-0000-1000-8000-00805f9b34fb';
const BATT_SVC = '0000180f-0000-1000-8000-00805f9b34fb';
const BATT_LVL = '00002a19-0000-1000-8000-00805f9b34fb';

function hasBlePlugin() {
  return typeof window !== 'undefined' && !!(window as any).Capacitor?.Plugins?.BluetoothLe;
}

async function ble() {
  if (!hasBlePlugin()) return null;
  return (window as any).Capacitor?.Plugins?.BluetoothLe ?? null;
}

export async function scanDevices(profile: 'demo'|'standard_health_thermometer'|'generic_custom_ble' = 'demo') {
  if (profile === 'demo' || !hasBlePlugin()) {
    return [{ deviceId: 'THR-MEDICE-DEMO-001', name: 'Demo Thermometer', profile: 'demo', note: 'Use Android APK for real Bluetooth connection.' }];
  }
  const BluetoothLe = await ble();
  if (!BluetoothLe) return [];
  await BluetoothLe.initialize();
  const found: BleDevice[] = [];
  await BluetoothLe.requestLEScan({ services: [] }, (r: any) => {
    found.push({ deviceId: r.device.deviceId, name: r.device.name, uuids: r.uuids });
  });
  await new Promise(r => setTimeout(r, 4000));
  await BluetoothLe.stopLEScan();
  return found;
}

export async function connectDevice(deviceId: string) {
  if (!hasBlePlugin() || deviceId.includes('DEMO')) return { status: 'connected', deviceId, demo: true };
  const BluetoothLe = await ble();
  await BluetoothLe?.connect({ deviceId });
  return { status: 'connected', deviceId };
}

export async function discoverDeviceProfile(deviceId: string) {
  if (!hasBlePlugin() || deviceId.includes('DEMO')) return { profile: 'demo', serviceUuids: [HTS, BATT_SVC] };
  const BluetoothLe = await ble();
  const services = await BluetoothLe?.discoverServices({ deviceId });
  const uuids = (services?.services || []).map((s: any) => s.uuid?.toLowerCase());
  return { profile: uuids.includes(HTS) ? 'standard_health_thermometer' : 'generic_custom_ble', serviceUuids: uuids };
}

export function parseHealthThermometerMeasurement(dataView: DataView) {
  const flags = dataView.getUint8(0);
  const isFahrenheit = (flags & 0x01) !== 0;
  const tempRaw = dataView.getInt32(1, true);
  const tempC = tempRaw / 100;
  const temperature = isFahrenheit ? ((tempC - 32) * 5) / 9 : tempC;
  return { temperature, unit: isFahrenheit ? 'F' : 'C' };
}

export async function readBatteryLevel(deviceId: string) {
  if (!hasBlePlugin() || deviceId.includes('DEMO')) return null;
  const BluetoothLe = await ble();
  const r = await BluetoothLe?.read({ deviceId, service: BATT_SVC, characteristic: BATT_LVL });
  if (!r?.value) return null;
  const bytes = Uint8Array.from(atob(r.value), c => c.charCodeAt(0));
  return bytes[0] ?? null;
}

export async function sendBleReadingToBackend(patientId: number, deviceId: string, temperature: number, battery: number | null) {
  await postReading({
    patient_id: String(patientId),
    device_id: deviceId,
    temperature,
    spo2_valid: false,
    bpm_valid: false,
    bp_valid: false,
  });
  if (battery !== null) {
    await fetch((window as any).location.origin + '/api/noop').catch(() => null);
  }
}

export async function subscribeTemperature(deviceId: string, patientId: number, onReading: (v: any) => void) {
  if (!hasBlePlugin() || deviceId.includes('DEMO')) {
    const t = 36.8 + Math.random() * 0.5;
    await sendBleReadingToBackend(patientId, deviceId, t, null);
    onReading({ temperature: t, source: 'demo' });
    return () => {};
  }
  const BluetoothLe = await ble();
  await BluetoothLe?.startNotifications({ deviceId, service: HTS, characteristic: TEMP_MEAS }, async (r: any) => {
    if (!r.value) return;
    const bytes = Uint8Array.from(atob(r.value), c => c.charCodeAt(0));
    const parsed = parseHealthThermometerMeasurement(new DataView(bytes.buffer));
    const battery = await readBatteryLevel(deviceId);
    await sendBleReadingToBackend(patientId, deviceId, parsed.temperature, battery);
    onReading({ ...parsed, battery, source: 'ble' });
  });
  return async () => {
    await BluetoothLe?.stopNotifications({ deviceId, service: HTS, characteristic: TEMP_MEAS });
  };
}

export async function provisionDevice(config: any) {
  return registerDevice(config);
}

export async function sendTestReading(patientId: number, deviceId: string) {
  return postReading({ patient_id: String(patientId), device_id: deviceId, temperature: 37.2, spo2_valid: false, bpm_valid: false, bp_valid: false });
}
