import React, { useContext, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView,
} from "react-native";
import { BLEContext } from "../context/BLEContext";
import { APIContext } from "../context/APIContext";

// ── Blood pressure helpers ──────────────────────────────────────────────────

type BpLevel = "normal" | "elevated" | "high_stage1" | "high_stage2" | "crisis" | "low" | "unknown";

function classifyBP(systolic: number | null, diastolic: number | null, valid: boolean): BpLevel {
  if (!valid || systolic === null || diastolic === null) return "unknown";
  if (systolic > 180 || diastolic > 120) return "crisis";
  if (systolic >= 140 || diastolic >= 90)  return "high_stage2";
  if (systolic >= 130 || diastolic >= 80)  return "high_stage1";
  if (systolic < 90  || diastolic < 60)    return "low";
  if (systolic >= 120)                      return "elevated";
  return "normal";
}

const BP_LABEL: Record<BpLevel, string> = {
  crisis:      "🚨 Υπερτασική Κρίση",
  high_stage2: "⚠️ Υψηλή Β΄ Στάδιο",
  high_stage1: "⚠️ Υψηλή Α΄ Στάδιο",
  elevated:    "↑ Ανυψωμένη",
  low:         "↓ Χαμηλή Πίεση",
  normal:      "✅ Κανονική",
  unknown:     "— Αναμονή",
};

const BP_CARD_BG: Record<BpLevel, string> = {
  crisis:      "rgba(180,0,0,0.55)",
  high_stage2: "rgba(180,50,0,0.50)",
  high_stage1: "rgba(180,100,0,0.45)",
  elevated:    "rgba(160,130,0,0.40)",
  low:         "rgba(0,80,180,0.40)",
  normal:      "rgba(0,0,0,0.20)",
  unknown:     "rgba(0,0,0,0.15)",
};

// ── Component ───────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const {
    connected, scanning,
    temperature, spo2, bpm,
    systolic, diastolic, bpValid,
    connect, disconnect,
  } = useContext(BLEContext);
  const { patient, postAntipyretic } = useContext(APIContext);
  const [marking, setMarking] = useState(false);

  const isFever     = temperature !== null && temperature >= 38.0;
  const isHighFever = temperature !== null && temperature >= 39.0;
  const isSpo2Low   = spo2 !== null && spo2 < 94;
  const isSpo2Crit  = spo2 !== null && spo2 < 90;
  const isHRAbnorm  = bpm  !== null && (bpm < 60 || bpm > 130);

  const bpLevel = classifyBP(systolic, diastolic, bpValid);
  const isBpCrisis   = bpLevel === "crisis";
  const isBpWarning  = bpLevel === "high_stage2" || bpLevel === "high_stage1" || bpLevel === "low";

  // Overall background: crisis (any) → red, warning → orange, normal → green
  const bgColor =
    isSpo2Crit || isHighFever || isBpCrisis ? "#C0392B"
    : isSpo2Low || isFever    || isBpWarning ? "#E67E22"
    : "#27AE60";

  const handleAntipyretic = async () => {
    if (!patient?.active_fever_id) return;
    setMarking(true);
    try { await postAntipyretic(patient.active_fever_id); }
    finally { setMarking(false); }
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: bgColor }]}>
      <Text style={styles.name}>{patient?.name ?? "—"}</Text>

      {/* Temperature */}
      <View style={styles.bigCard}>
        <Text style={styles.bigLabel}>🌡️ Θερμοκρασία</Text>
        <Text style={styles.bigValue}>
          {temperature !== null ? `${temperature.toFixed(1)}°C` : "---"}
        </Text>
        <Text style={styles.subLabel}>
          {isHighFever ? "⚠️ ΥΨΗΛΟΣ ΠΥΡΕΤΟΣ"
           : isFever   ? "🌡️ Πυρετός"
                       : "✅ Κανονική"}
        </Text>
      </View>

      {/* SpO2 + HR row */}
      <View style={styles.vitalRow}>
        <View style={[styles.vitalCard,
          isSpo2Crit ? styles.danger : isSpo2Low ? styles.warn : null]}>
          <Text style={styles.vitalLabel}>🧠 SpO₂</Text>
          <Text style={styles.vitalValue}>{spo2 !== null ? `${spo2.toFixed(0)}%` : "---"}</Text>
          <Text style={styles.vitalSub}>
            {isSpo2Crit ? "🚨 Κρίσιμο" : isSpo2Low ? "⚠️ Χαμηλό" : spo2 !== null ? "✅ OK" : ""}
          </Text>
        </View>

        <View style={[styles.vitalCard, isHRAbnorm ? styles.warn : null]}>
          <Text style={styles.vitalLabel}>❤️‍🩹 BPM</Text>
          <Text style={styles.vitalValue}>{bpm !== null ? `${bpm}` : "---"}</Text>
          <Text style={styles.vitalSub}>
            {bpm !== null && bpm < 60  ? "⚠️ Βραδυκαρδία"
           : bpm !== null && bpm > 130 ? "⚠️ Ταχυκαρδία"
           : bpm !== null              ? "✅ OK" : ""}
          </Text>
        </View>
      </View>

      {/* Blood Pressure card */}
      <View style={[styles.bpCard, { backgroundColor: BP_CARD_BG[bpLevel] }]}>
        <View style={styles.bpHeader}>
          <Text style={styles.bpLabel}>💓 Πίεση Αίματος</Text>
          <Text style={styles.bpBadge}>{BP_LABEL[bpLevel]}</Text>
        </View>
        <Text style={styles.bpValue}>
          {bpValid && systolic !== null && diastolic !== null
            ? `${systolic} / ${diastolic}`
            : "--- / ---"}
        </Text>
        <Text style={styles.bpUnit}>mmHg  (συστολική / διαστολική)</Text>
      </View>

      {/* BLE connect button */}
      <TouchableOpacity style={styles.bleBtn} onPress={connected ? disconnect : connect} disabled={scanning}>
        {scanning
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.bleBtnText}>{connected ? "Αποσύνδεση BLE" : "Σύνδεση BLE"}</Text>}
      </TouchableOpacity>

      {/* Antipyretic action */}
      {isFever && (
        <TouchableOpacity style={styles.antipyreticBtn} onPress={handleAntipyretic} disabled={marking}>
          <Text style={styles.antipyreticText}>{marking ? "..." : "💊 Έδωσα Αντιπυρετικό"}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container:       { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  name:            { fontSize: 22, color: "#fff", fontWeight: "600", marginBottom: 16 },

  bigCard:         { backgroundColor: "rgba(0,0,0,0.2)", borderRadius: 16, padding: 20,
                     alignItems: "center", marginBottom: 16, width: "100%" },
  bigLabel:        { fontSize: 14, color: "rgba(255,255,255,0.8)", marginBottom: 4 },
  bigValue:        { fontSize: 64, color: "#fff", fontWeight: "bold" },
  subLabel:        { fontSize: 16, color: "#fff", marginTop: 4 },

  vitalRow:        { flexDirection: "row", gap: 12, marginBottom: 14, width: "100%" },
  vitalCard:       { flex: 1, backgroundColor: "rgba(0,0,0,0.2)", borderRadius: 14,
                     padding: 16, alignItems: "center" },
  danger:          { backgroundColor: "rgba(180,0,0,0.5)" },
  warn:            { backgroundColor: "rgba(180,80,0,0.4)" },
  vitalLabel:      { fontSize: 12, color: "rgba(255,255,255,0.8)", marginBottom: 4 },
  vitalValue:      { fontSize: 32, color: "#fff", fontWeight: "700" },
  vitalSub:        { fontSize: 11, color: "#fff", marginTop: 2 },

  bpCard:          { width: "100%", borderRadius: 16, padding: 18, marginBottom: 20 },
  bpHeader:        { flexDirection: "row", justifyContent: "space-between", alignItems: "center",
                     marginBottom: 8 },
  bpLabel:         { fontSize: 14, color: "rgba(255,255,255,0.85)", fontWeight: "600" },
  bpBadge:         { fontSize: 12, color: "#fff", backgroundColor: "rgba(0,0,0,0.25)",
                     paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  bpValue:         { fontSize: 48, color: "#fff", fontWeight: "bold", textAlign: "center" },
  bpUnit:          { fontSize: 11, color: "rgba(255,255,255,0.7)", textAlign: "center", marginTop: 2 },

  bleBtn:          { backgroundColor: "rgba(0,0,0,0.25)", paddingHorizontal: 32, paddingVertical: 14,
                     borderRadius: 24, marginBottom: 16 },
  bleBtnText:      { color: "#fff", fontSize: 16, fontWeight: "600" },
  antipyreticBtn:  { backgroundColor: "rgba(255,255,255,0.3)", paddingHorizontal: 28,
                     paddingVertical: 12, borderRadius: 20 },
  antipyreticText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
