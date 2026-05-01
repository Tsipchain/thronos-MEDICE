import React, { createContext, useEffect, useRef, useState } from "react";
import { BleManager, Device } from "react-native-ble-plx";
import { useContext } from "react";
import { Buffer } from "buffer";
import { APIContext } from "./APIContext";

const TEMP_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const TEMP_CHAR_UUID    = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const VITAL_CHAR_UUID   = "beb5483e-36e1-4688-b7f5-ea07361b26aa";
const PROV_CHAR_UUID    = "beb5483e-36e1-4688-b7f5-ea07361b26ab";

export const BLEContext = createContext<any>({});

export function BLEProvider({ children }: { children: React.ReactNode }) {
  const manager   = useRef(new BleManager()).current;
  const deviceRef = useRef<Device | null>(null);
  const [connected,   setConnected]   = useState(false);
  const [scanning,    setScanning]    = useState(false);
  const [temperature, setTemperature] = useState<number | null>(null);
  const [spo2,        setSpo2]        = useState<number | null>(null);
  const [bpm,         setBpm]         = useState<number | null>(null);
  const [systolic,    setSystolic]    = useState<number | null>(null);
  const [diastolic,   setDiastolic]   = useState<number | null>(null);
  const [bpValid,     setBpValid]     = useState(false);
  const { postReading, patient }      = useContext(APIContext);

  useEffect(() => () => { manager.destroy(); }, []);

  const connect = async () => {
    setScanning(true);
    manager.startDeviceScan(null, { allowDuplicates: false }, async (err, device) => {
      if (err || !device) { setScanning(false); return; }
      if (device.name !== "ThronomedICE") return;

      manager.stopDeviceScan();
      try {
        const d = await device.connect();
        await d.discoverAllServicesAndCharacteristics();
        deviceRef.current = d;
        setConnected(true);
        setScanning(false);

        // Full reading every 5 min: temp + vitals + optional BP
        d.monitorCharacteristicForService(TEMP_SERVICE_UUID, TEMP_CHAR_UUID, (e, char) => {
          if (e || !char?.value) return;
          const json = JSON.parse(Buffer.from(char.value, "base64").toString("utf8"));
          const temp: number = json.temperature;
          const s2: number   = json.spo2 ?? -1;
          const hr: number   = json.bpm  ?? -1;
          const sys: number  = json.systolic  ?? -1;
          const dia: number  = json.diastolic ?? -1;
          const bpOk: boolean = !!json.bp_valid;

          setTemperature(temp);
          if (s2 > 0)  setSpo2(s2);
          if (hr > 0)  setBpm(hr);
          if (bpOk && sys > 0 && dia > 0) {
            setSystolic(sys);
            setDiastolic(dia);
            setBpValid(true);
          }

          if (patient?.id) {
            postReading({
              patient_id:  String(patient.id),
              temperature: temp,
              spo2:        s2 > 0  ? s2  : undefined,
              bpm:         hr > 0  ? hr  : undefined,
              systolic:    bpOk && sys > 0 ? sys : undefined,
              diastolic:   bpOk && dia > 0 ? dia : undefined,
              spo2_valid:  s2 > 0 && !!json.spo2_valid,
              bpm_valid:   hr > 0 && !!json.bpm_valid,
              bp_valid:    bpOk && sys > 0 && dia > 0,
            });
          }
        });

        // Vitals-only refresh every 1 min (no temp, no upload)
        d.monitorCharacteristicForService(TEMP_SERVICE_UUID, VITAL_CHAR_UUID, (e, char) => {
          if (e || !char?.value) return;
          const json = JSON.parse(Buffer.from(char.value, "base64").toString("utf8"));
          if (json.spo2 > 0) setSpo2(json.spo2);
          if (json.bpm  > 0) setBpm(json.bpm);
        });
      } catch { setScanning(false); }
    });
    setTimeout(() => { manager.stopDeviceScan(); setScanning(false); }, 15000);
  };

  const disconnect = async () => {
    await deviceRef.current?.cancelConnection();
    deviceRef.current = null;
    setConnected(false);
    setTemperature(null);
    setSpo2(null);
    setBpm(null);
    setSystolic(null);
    setDiastolic(null);
    setBpValid(false);
  };

  // Send WiFi credentials + patient ID to device over BLE (first-time setup)
  const provision = async (newPatientId: string, ssid: string, pass: string) => {
    const d = deviceRef.current;
    if (!d || !connected) throw new Error("Not connected");
    const payload = JSON.stringify({ patient_id: newPatientId, ssid, pass });
    const b64 = Buffer.from(payload).toString("base64");
    await d.writeCharacteristicWithResponseForService(TEMP_SERVICE_UUID, PROV_CHAR_UUID, b64);
  };

  return (
    <BLEContext.Provider value={{
      connected, scanning,
      temperature, spo2, bpm,
      systolic, diastolic, bpValid,
      connect, disconnect, provision,
    }}>
      {children}
    </BLEContext.Provider>
  );
}
