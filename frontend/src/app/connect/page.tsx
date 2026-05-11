'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { connectDevice, discoverDeviceProfile, provisionDevice, scanDevices, sendTestReading, subscribeTemperature } from '@/lib/deviceConnection';

export default function ConnectPage() {
  const router = useRouter();
  const [patient, setPatient] = useState<any>(null);
  const [deviceId, setDeviceId] = useState('THR-MEDICE-DEMO-001');
  const [devices, setDevices] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [profile, setProfile] = useState<any>(null);
  const [lastReading, setLastReading] = useState<any>(null);

  useEffect(() => {
    const p = localStorage.getItem('medice_patient');
    if (!p) return router.replace('/login');
    setPatient(JSON.parse(p));
  }, [router]);

  const demoScan = async () => setDevices(await scanDevices('demo'));
  const realScan = async () => setDevices(await scanDevices('standard_health_thermometer'));

  const register = async () => {
    if (!patient?.id || !deviceId) return;
    await connectDevice(deviceId);
    const prof = await discoverDeviceProfile(deviceId);
    setProfile(prof);
    await provisionDevice({
      patient_id: patient.id,
      device_id: deviceId,
      device_type: 'thermometer',
      firmware_version: '0.1.0',
      connection_mode: 'ble',
      ble_profile: prof.profile,
      service_uuids: prof.serviceUuids || [],
      temperature_unit: 'C',
    });
    await sendTestReading(patient.id, deviceId);
    setStatus('✅ Η συσκευή συνδέθηκε και στάλθηκε test reading.');
  };

  const startLive = async () => {
    if (!patient?.id || !deviceId) return;
    setStatus('📡 Live monitoring started...');
    await subscribeTemperature(deviceId, patient.id, setLastReading);
  };

  return <div className="p-6 max-w-xl mx-auto">
    <h1 className="text-2xl font-bold mb-4">Σύνδεση Συσκευής</h1>
    <div className="flex gap-2 mb-3">
      <button onClick={demoScan} className="border px-3 py-2 rounded">🧪 Demo Scan</button>
      <button onClick={realScan} className="border px-3 py-2 rounded">📶 Real BLE Scan</button>
    </div>
    <div className="space-y-2 mb-4">
      {devices.map((d) => <button key={d.deviceId || d.device_id} onClick={() => setDeviceId(d.deviceId || d.device_id)} className="block border px-3 py-2 rounded w-full text-left">{d.name || d.deviceId || d.device_id}</button>)}
    </div>
    <input value={deviceId} onChange={e => setDeviceId(e.target.value)} className="w-full border p-2 rounded" />
    <div className="flex gap-2 mt-3">
      <button onClick={register} className="bg-slate-800 text-white px-4 py-2 rounded">Καταχώριση & Test</button>
      <button onClick={startLive} className="bg-blue-700 text-white px-4 py-2 rounded">Start Live Monitoring</button>
    </div>
    {profile && <pre className="text-xs mt-3 bg-slate-100 p-2 rounded">{JSON.stringify(profile, null, 2)}</pre>}
    {lastReading && <p className="mt-2 text-sm">🌡️ {lastReading.temperature?.toFixed?.(2) ?? lastReading.temperature}°C {lastReading.battery != null ? `🔋${lastReading.battery}%` : ''}</p>}
    {status && <p className="mt-3 text-green-700">{status}</p>}
  </div>;
}
