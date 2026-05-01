import React, { createContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";

export const APIContext = createContext<any>({});

export function APIProvider({ children }: { children: React.ReactNode }) {
  const [apiUrl,       setApiUrlState] = useState("https://medice.thronos.io");
  const [guardian,     setGuardian]    = useState<any>(null);
  const [patient,      setPatient]     = useState<any>(null);
  const [feverHistory, setFeverHistory] = useState<any[]>([]);
  const [lastBpLevel,  setLastBpLevel] = useState<string>("normal");

  useEffect(() => {
    (async () => {
      const url = await AsyncStorage.getItem("medice_api_url");
      if (url) setApiUrlState(url);
      const g = await AsyncStorage.getItem("medice_guardian");
      if (g) setGuardian(JSON.parse(g));
      const p = await AsyncStorage.getItem("medice_patient");
      if (p) setPatient(JSON.parse(p));
    })();
  }, []);

  useEffect(() => { if (patient?.id) fetchFeverHistory(patient.id); }, [patient]);

  const setApiUrl = async (url: string) => {
    setApiUrlState(url);
    await AsyncStorage.setItem("medice_api_url", url);
  };

  const createGuardian = async (name: string, email: string): Promise<number> => {
    const res = await axios.post(`${apiUrl}/guardians`, { name, email });
    const g   = { id: res.data.id, name, email };
    setGuardian(g);
    await AsyncStorage.setItem("medice_guardian", JSON.stringify(g));
    return res.data.id as number;
  };

  const createPatient = async (data: {
    name:         string;
    birth_date?:  string;
    guardian_id:  number;
    subscription: string;
    free_until?:  string;
  }) => {
    const res = await axios.post(`${apiUrl}/patients`, data);
    const p   = { id: res.data.id, ...data };
    setPatient(p);
    await AsyncStorage.setItem("medice_patient", JSON.stringify(p));
    return res.data.id as number;
  };

  const postReading = async (data: {
    patient_id:  string;
    temperature: number;
    spo2?:       number;
    bpm?:        number;
    systolic?:   number;
    diastolic?:  number;
    spo2_valid?: boolean;
    bpm_valid?:  boolean;
    bp_valid?:   boolean;
  }) => {
    try {
      const res = await axios.post(`${apiUrl}/readings`, {
        ...data,
        device_id: data.patient_id,
        timestamp: new Date().toISOString(),
      });
      if (res.data?.active_fever_id !== undefined)
        setPatient((p: any) => ({ ...p, active_fever_id: res.data.active_fever_id }));
      if (res.data?.bp_level)
        setLastBpLevel(res.data.bp_level);
    } catch (e) { console.warn("postReading:", e); }
  };

  const postAntipyretic = async (id: string) => {
    await axios.put(`${apiUrl}/fever-events/${id}/antipyretic`);
    if (patient?.id) fetchFeverHistory(patient.id);
  };

  const fetchFeverHistory = async (pid: string) => {
    try {
      const res = await axios.get(`${apiUrl}/patients/${pid}/fever-history`);
      setFeverHistory(res.data);
    } catch (e) { console.warn("feverHistory:", e); }
  };

  return (
    <APIContext.Provider value={{
      apiUrl, setApiUrl,
      guardian, patient,
      feverHistory, lastBpLevel,
      createGuardian, createPatient,
      postReading, postAntipyretic,
    }}>
      {children}
    </APIContext.Provider>
  );
}
