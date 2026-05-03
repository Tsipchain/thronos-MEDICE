'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { connectDevice, provisionDevice, scanDevices, sendTestReading } from '@/lib/deviceConnection';

export default function ConnectPage() {
  const router = useRouter();
  const [patient, setPatient] = useState<any>(null);
  const [deviceId, setDeviceId] = useState('THR-MEDICE-DEMO-001');
  const [devices, setDevices] = useState<any[]>([]);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const p = localStorage.getItem('medice_patient');
    if (!p) return router.replace('/login');
    setPatient(JSON.parse(p));
  }, [router]);

  const scan = async () => setDevices(await scanDevices());
  const register = async () => {
    if (!patient?.id || !deviceId) return;
    await connectDevice(deviceId);
    await provisionDevice({ patient_id: patient.id, device_id: deviceId, device_type: 'bracelet', firmware_version: '0.1.0', connection_mode: 'wifi_ble' });
    await sendTestReading(patient.id, deviceId);
    setStatus('✅ Η συσκευή συνδέθηκε και στάλθηκε test reading.');
    setTimeout(() => router.push('/dashboard'), 800);
  };

  return <div className="p-6 max-w-xl mx-auto">
    <h1 className="text-2xl font-bold mb-4">Σύνδεση Συσκευής</h1>
    <button onClick={scan} className="border px-3 py-2 rounded mb-3">🔎 Demo BLE Scan</button>
    <div className="space-y-2 mb-4">
      {devices.map((d) => <button key={d.device_id} onClick={() => setDeviceId(d.device_id)} className="block border px-3 py-2 rounded w-full text-left">{d.device_id}</button>)}
    </div>
    <input value={deviceId} onChange={e => setDeviceId(e.target.value)} className="w-full border p-2 rounded" />
    <button onClick={register} className="mt-3 bg-slate-800 text-white px-4 py-2 rounded">Καταχώριση & Test</button>
    {status && <p className="mt-3 text-green-700">{status}</p>}
  </div>;
}
