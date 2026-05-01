import React, { useContext, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { APIContext } from "../context/APIContext";
import { BLEContext } from "../context/BLEContext";

// ── Small reusable bits ─────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Btn({
  label, onPress, disabled = false, variant = "primary", loading = false,
}: {
  label: string; onPress: () => void;
  disabled?: boolean; variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
}) {
  const bg = variant === "danger" ? "#C0392B" : variant === "secondary" ? "#7F8C8D" : "#2C3E50";
  return (
    <TouchableOpacity
      style={[s.btn, { backgroundColor: bg }, disabled && s.btnDisabled]}
      onPress={onPress} disabled={disabled || loading}>
      {loading
        ? <ActivityIndicator color="#fff" size="small" />
        : <Text style={s.btnText}>{label}</Text>}
    </TouchableOpacity>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

// ── Main screen ─────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const {
    apiUrl, setApiUrl,
    guardian, patient,
    createGuardian, createPatient,
    lastBpLevel,
  } = useContext(APIContext);
  const { connected, scanning, connect, disconnect, provision } = useContext(BLEContext);

  // ─ API URL
  const [inputUrl, setInputUrl] = useState(apiUrl);

  // ─ Registration
  const [regGuardianName,  setRegGuardianName]  = useState("");
  const [regGuardianEmail, setRegGuardianEmail] = useState("");
  const [regPatientName,   setRegPatientName]   = useState("");
  const [regPatientDob,    setRegPatientDob]    = useState("");  // YYYY-MM-DD
  const [regSubscription,  setRegSubscription]  = useState<"basic" | "bp">("basic");
  const [registering,      setRegistering]      = useState(false);

  // ─ Device provisioning
  const [provSsid,    setProvSsid]    = useState("");
  const [provPass,    setProvPass]    = useState("");
  const [provisioning, setProvisioning] = useState(false);

  // ── Handlers ────────────────────────────────────────────────────────────

  const saveApiUrl = () => {
    setApiUrl(inputUrl.trim());
    Alert.alert("✅ Αποθηκεύτηκε", "Το API URL ενημερώθηκε.");
  };

  const register = async () => {
    if (!regGuardianName || !regGuardianEmail || !regPatientName) {
      Alert.alert("Σφάλμα", "Συμπληρώστε όλα τα υποχρεωτικά πεδία."); return;
    }
    setRegistering(true);
    try {
      const gId = await createGuardian(regGuardianName.trim(), regGuardianEmail.trim());
      // 5-month free trial from today
      const freeUntil = new Date();
      freeUntil.setMonth(freeUntil.getMonth() + 5);
      await createPatient({
        name:         regPatientName.trim(),
        birth_date:   regPatientDob || undefined,
        guardian_id:  gId,
        subscription: regSubscription,
        free_until:   freeUntil.toISOString(),
      });
      Alert.alert("✅ Εγγραφή Επιτυχής", "Ο λογαριασμός και ο ασθενής αποθηκεύτηκαν.");
    } catch (e: any) {
      Alert.alert("Σφάλμα", e?.message ?? "Αποτυχία εγγραφής.");
    } finally { setRegistering(false); }
  };

  const sendProvision = async () => {
    if (!provSsid) { Alert.alert("Σφάλμα", "Εισάγετε SSID."); return; }
    if (!patient?.id) { Alert.alert("Σφάλμα", "Δεν έχει εγγραφεί ασθενής."); return; }
    setProvisioning(true);
    try {
      await provision(String(patient.id), provSsid.trim(), provPass);
      Alert.alert("✅ Απεστάλη", "Ρυθμίσεις αποθηκεύτηκαν στη συσκευή.");
    } catch (e: any) {
      Alert.alert("Σφάλμα", e?.message ?? "Αποτυχία αποστολής.");
    } finally { setProvisioning(false); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ── 1. API server ──────────────────────────────────────────── */}
        <Section title="🌐 Σύνδεση Διακομιστή">
          <Field label="API URL">
            <TextInput
              style={s.input}
              value={inputUrl}
              onChangeText={setInputUrl}
              autoCapitalize="none"
              keyboardType="url"
              placeholder="https://medice.thronos.io"
            />
          </Field>
          <Btn label="Αποθήκευση" onPress={saveApiUrl} />
        </Section>

        {/* ── 2. Account info or registration ──────────────────────── */}
        {guardian && patient ? (
          <Section title="👤 Λογαριασμός">
            <InfoRow label="Κηδεμόνας" value={guardian.name} />
            <InfoRow label="Email"       value={guardian.email} />
            <InfoRow label="Ασθενής"    value={patient.name} />
            <InfoRow label="Patient ID"  value={String(patient.id)} />
            <InfoRow label="Συνδρομή"
              value={patient.subscription === "bp" ? "Προηγμένη (+Πίεση)" : "Βασική"} />
            {patient.free_until && (
              <InfoRow label="Δωρεάν έως"
                value={new Date(patient.free_until).toLocaleDateString("el-GR")} />
            )}
            {lastBpLevel !== "normal" && lastBpLevel !== "unknown" && (
              <View style={s.bpAlert}>
                <Text style={s.bpAlertText}>Τελευταία μέτρηση πίεσης: {lastBpLevel}</Text>
              </View>
            )}
          </Section>
        ) : (
          <Section title="📝 Εγγραφή Νέου Χρήστη">
            <Text style={s.hint}>Κηδεμόνας</Text>
            <Field label="Όνομα">
              <TextInput style={s.input} value={regGuardianName}
                onChangeText={setRegGuardianName} placeholder="Γιώργος Παπαδόπουλος" />
            </Field>
            <Field label="Email">
              <TextInput style={s.input} value={regGuardianEmail}
                onChangeText={setRegGuardianEmail} placeholder="email@example.com"
                autoCapitalize="none" keyboardType="email-address" />
            </Field>

            <Text style={[s.hint, { marginTop: 12 }]}>Ασθενής / Προστατευόμενος</Text>
            <Field label="Όνομα">
              <TextInput style={s.input} value={regPatientName}
                onChangeText={setRegPatientName} placeholder="Μαρία Παπαδοπούλου" />
            </Field>
            <Field label="Ημερομηνία γέννησης (YYYY-MM-DD)">
              <TextInput style={s.input} value={regPatientDob}
                onChangeText={setRegPatientDob} placeholder="1990-06-15"
                keyboardType="numbers-and-punctuation" />
            </Field>

            <Field label="Συνδρομή">
              <View style={s.toggleRow}>
                <TouchableOpacity
                  style={[s.toggleBtn, regSubscription === "basic" && s.toggleActive]}
                  onPress={() => setRegSubscription("basic")}>
                  <Text style={[s.toggleText, regSubscription === "basic" && s.toggleActiveText]}>
                    Βασική — 10€/μήνα
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.toggleBtn, regSubscription === "bp" && s.toggleActive]}
                  onPress={() => setRegSubscription("bp")}>
                  <Text style={[s.toggleText, regSubscription === "bp" && s.toggleActiveText]}>
                    +Πίεση — 15€/μήνα
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={s.subHint}>Δωρεάν για 5 μήνες με την αγορά της συσκευής</Text>
            </Field>

            <Btn label="Εγγραφή" onPress={register} loading={registering} />
          </Section>
        )}

        {/* ── 3. Device provisioning ───────────────────────────────── */}
        <Section title="📡 Ρύθμιση Συσκευής">
          <View style={s.bleStatus}>
            <View style={[s.bleDot, { backgroundColor: connected ? "#27AE60" : "#E74C3C" }]} />
            <Text style={s.bleStatusText}>
              {scanning ? "Σάρωση..."
               : connected ? "Συνδεδεμένο ThronomedICE"
               : "Μη συνδεδεμένο"}
            </Text>
          </View>

          <Btn
            label={connected ? "Αποσύνδεση" : scanning ? "Σάρωση..." : "Σύνδεση με Συσκευή"}
            onPress={connected ? disconnect : connect}
            variant={connected ? "secondary" : "primary"}
            loading={scanning}
          />

          {connected && (
            <View style={{ marginTop: 16 }}>
              <Text style={s.hint}>Ρύθμιση WiFi (3α σύνδεση μέσω WiFi)</Text>
              <Field label="SSID (όνομα δικτύου)">
                <TextInput style={s.input} value={provSsid}
                  onChangeText={setProvSsid} placeholder="HomeWiFi"
                  autoCapitalize="none" />
              </Field>
              <Field label="Κωδικός Πρόσβασης">
                <TextInput style={s.input} value={provPass}
                  onChangeText={setProvPass} placeholder="password"
                  secureTextEntry autoCapitalize="none" />
              </Field>
              <Text style={s.subHint}>
                Patient ID: {patient?.id ?? "—"} — αποστέλλεται αυτόματα στη συσκευή
              </Text>
              <Btn label="Αποστολή ρυθμίσεων" onPress={sendProvision} loading={provisioning} />
            </View>
          )}

          <View style={s.provInfo}>
            <Text style={s.provInfoText}>
              💡 Μετά την αποστολή, η συσκευή αποθηκεύει τις ρυθμίσεις στη μνήμην της και συνδέεται αυτόνομα
              στο WiFi σε κάθε εκκίνηση. Δεν χρειάζεται ξανακαταχώρηση αρχείου (OTA).
            </Text>
          </View>
        </Section>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: "#F0F2F5" },

  section:      { backgroundColor: "#fff", marginTop: 16, marginHorizontal: 14,
                  borderRadius: 14, padding: 16, shadowColor: "#000",
                  shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#2C3E50", marginBottom: 14 },

  field:        { marginBottom: 12 },
  fieldLabel:   { fontSize: 12, color: "#7F8C8D", marginBottom: 4 },
  input:        { borderWidth: 1, borderColor: "#D5D8DC", borderRadius: 8,
                  padding: 10, fontSize: 15, backgroundColor: "#FDFEFE" },

  btn:          { borderRadius: 10, padding: 13, alignItems: "center", marginTop: 4 },
  btnDisabled:  { opacity: 0.5 },
  btnText:      { color: "#fff", fontSize: 15, fontWeight: "600" },

  infoRow:      { flexDirection: "row", justifyContent: "space-between",
                  paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#EAECEE" },
  infoLabel:    { fontSize: 13, color: "#7F8C8D" },
  infoValue:    { fontSize: 13, color: "#2C3E50", fontWeight: "500" },

  hint:         { fontSize: 12, fontWeight: "700", color: "#5D6D7E", marginBottom: 8 },
  subHint:      { fontSize: 11, color: "#95A5A6", marginBottom: 10, marginTop: 2 },

  toggleRow:    { flexDirection: "row", gap: 10 },
  toggleBtn:    { flex: 1, borderWidth: 1.5, borderColor: "#BDC3C7", borderRadius: 8,
                  padding: 10, alignItems: "center" },
  toggleActive: { borderColor: "#2C3E50", backgroundColor: "#2C3E50" },
  toggleText:   { fontSize: 13, color: "#5D6D7E", fontWeight: "500" },
  toggleActiveText: { color: "#fff" },

  bleStatus:    { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  bleDot:       { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  bleStatusText:{ fontSize: 14, color: "#2C3E50" },

  provInfo:     { backgroundColor: "#EAF4FB", borderRadius: 8, padding: 12, marginTop: 12 },
  provInfoText: { fontSize: 12, color: "#2874A6", lineHeight: 18 },

  bpAlert:      { backgroundColor: "#FDEDEC", borderRadius: 8, padding: 10, marginTop: 10 },
  bpAlertText:  { fontSize: 13, color: "#C0392B" },
});
