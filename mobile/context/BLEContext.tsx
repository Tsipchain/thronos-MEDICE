import React, { createContext, useEffect, useRef, useState } from "react";
import { BleManager, Device } from "react-native-ble-plx";
import { useContext } from "react";
import { Buffer } from "buffer";
import axios from "axios";
import { APIContext } from "./APIContext";
import { connectThermoDOC } from "../services/thermodoc";
import { connectGenialT31 } from "../services/genial-t31";

const TEMP_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const TEMP_CHAR_UUID    = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const VITAL_CHAR_UUID   = "beb5483e-36e1-4688-b7f5-ea07361b26aa";
const PROV_CHAR_UUID    = "beb5483e-36e1-4688-b7f5-ea07361b26ab";

export type DeviceType = "ThronomedICE" | "ThermoDOC" | "GenialT31";
export type BLEState = "idle" | "scanning" | "connecting" | "paired" | "provisioning" | "syncing" | "error";

export const BLEContext = createContext<any>({});

export function BLEProvider({ children }: { children: React.ReactNode }) {
  const manager   = useRef(new BleManager()).current;
  const deviceRef = useRef<Device | null>(null);
  const [bleState,    setBleState]    = useState<BLEState>("idle");
  const [deviceType,  setDeviceType]  = useState<DeviceType>("ThronomedICE");
  const [temperature, setTemperature] = useState<number | null>(null);
  const [spo2,        setSpo2]        = useState<number | null>(null);
  const [bpm,         setBpm]         = useState<number | null>(null);
  const [systolic,    setSystolic]    = useState<number | null>(null);
  const [diastolic,   setDiastolic]   = useState<number | null>(null);
  const [bpValid,     setBpValid]     = useState(false);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [signalStrength, setSignalStrength] = useState<number | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [pendingReadings, setPendingReadings] = useState<any[]>([]);
  const { postReading, patient, apiUrl } = useContext(APIContext);

  const connected = bleState === "paired" || bleState === "syncing";
  const scanning = bleState === "scanning" || bleState === "connecting";

  useEffect(() => () => { manager.destroy(); }, []);

  const connectThronomedICE = () => {
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

        d.monitorCharacteristicForService(TEMP_SERVICE_UUID, TEMP_CHAR_UUID, (e, char) => {
          if (e || !char?.value) return;
          const json = JSON.parse(Buffer.from(char.value, "base64").toString("utf8"));
          const temp: number  = json.temperature;
          const s2: number    = json.spo2 ?? -1;
          const hr: number    = json.bpm  ?? -1;
          const sys: number   = json.systolic  ?? -1;
          const dia: number   = json.diastolic ?? -1;
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

  const syncBufferedReadings = async () => {
    if (pendingReadings.length === 0) return;
    try {
      setBleState("syncing");
      const res = await axios.post(`${apiUrl}/readings/bulk`, pendingReadings);
      if (res.data.processed > 0) {
        setLastSyncTime(new Date());
        setPendingReadings([]);
      }
      setBleState("paired");
    } catch (e) {
      console.warn("Sync failed:", e);
      setBleState("paired");
    }
  };

  const addPendingReading = (reading: any) => {
    setPendingReadings(prev => [...prev, reading]);
    if (patient?.id && reading.temperature) {
      postReading({ patient_id: String(patient.id), temperature: reading.temperature });
    }
  };

  const connect = async () => {
    setBleState("scanning");
    if (deviceType === "ThermoDOC") {
      await connectThermoDOC(
        manager,
        (tempC) => {
          setTemperature(tempC);
          addPendingReading({ temperature: tempC, device_id: "thermadoc" });
        },
        (d) => { deviceRef.current = d; setBleState("paired"); },
        ()  => { deviceRef.current = null; setBleState("idle"); },
        ()  => setBleState("error"),
      );
    } else if (deviceType === "GenialT31") {
      await connectGenialT31(
        manager,
        (tempC) => {
          setTemperature(tempC);
          addPendingReading({ temperature: tempC, device_id: "genial-t31" });
        },
        (d) => { deviceRef.current = d; setBleState("paired"); },
        ()  => { deviceRef.current = null; setBleState("idle"); },
        ()  => setBleState("error"),
      );
    } else {
      connectThronomedICE();
    }
  };

  const disconnect = async () => {
    await deviceRef.current?.cancelConnection();
    deviceRef.current = null;
    setBleState("idle");
    setTemperature(null);
    setSpo2(null);
    setBpm(null);
    setSystolic(null);
    setDiastolic(null);
    setBpValid(false);
    setBatteryLevel(null);
    setSignalStrength(null);
  };

  const provision = async (newPatientId: string, ssid: string, pass: string) => {
    const d = deviceRef.current;
    if (!d || !connected) throw new Error("Not connected");
    const payload = JSON.stringify({ patient_id: newPatientId, ssid, pass });
    const b64 = Buffer.from(payload).toString("base64");
    await d.writeCharacteristicWithResponseForService(TEMP_SERVICE_UUID, PROV_CHAR_UUID, b64);
  };

  return (
    <BLEContext.Provider value={{
      bleState,
      connected, scanning,
      deviceType, setDeviceType,
      temperature, spo2, bpm,
      systolic, diastolic, bpValid,
      batteryLevel, signalStrength,
      lastSyncTime, pendingReadings,
      connect, disconnect, provision,
      syncBufferedReadings, addPendingReading,
    }}>
      {children}
    </BLEContext.Provider>
  );
}
