import React, { useContext, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, Modal,
} from "react-native";
import axios from "axios";
import { APIContext } from "../context/APIContext";
import { BLEContext } from "../context/BLEContext";

const HEALTH_ID_TYPES = {
  "amka":  "ΑΜΚΑ (Ελλάδα)",
  "kvnr":  "KVNR (Γερμανία)",
  "svnr":  "SVNR (Αυστρία)",
  "snils": "СНИЛС (Ρωσία)",
  "nhs":   "NHS (UK)",
  "nir":   "NIR (Γαλλία)",
  "bsn":   "BSN (Ολλανδία)",
  "phn":   "PHN (Καναδά)",
  "ssn":   "SSN (ΗΠΑ)",
};

const HEALTH_ID_TYPES = {
  "amka":  "ΑΜΚΑ (Ελλάδα)",
  "kvnr":  "KVNR (Γερμανία)",
  "svnr":  "SVNR (Αυστρία)",
  "snils": "СНИЛС (Ρωσία)",
  "nhs":   "NHS (UK)",
  "nir":   "NIR (Γαλλία)",
  "bsn":   "BSN (Ολλανδία)",
  "phn":   "PHN (Καναδά)",
  "ssn":   "SSN (ΗΠΑ)",
};

export default function SettingsScreen() {
  const {
    apiUrl, setApiUrl,
    guardian, patient, patients,
    createGuardian, createPatient,
    setActivePatient, updatePatient,
    lastBpLevel,
  } = useContext(APIContext);
  const { connected, scanning, connect, disconnect, provision, deviceType, setDeviceType } = useContext(BLEContext);

  const [inputUrl, setInputUrl] = useState(apiUrl);
  const [regGuardianName,  setRegGuardianName]  = useState("");
  const [regGuardianEmail, setRegGuardianEmail] = useState("");
  const [regPatientName,   setRegPatientName]   = useState("");
  const [regPatientDob,    setRegPatientDob]    = useState("");
  const [regSubscription,  setRegSubscription]  = useState<"basic" | "bp">("basic");
  const [registering,      setRegistering]      = useState(false);

  const [provSsid,    setProvSsid]    = useState("");
  const [provPass,    setProvPass]    = useState("");
  const [provisioning, setProvisioning] = useState(false);

  // ─ Multi-child management
  const [addingChild,    setAddingChild]    = useState(false);
  const [newChildName,   setNewChildName]   = useState("");
  const [newChildDob,    setNewChildDob]    = useState("");
  const [newChildSub,    setNewChildSub]    = useState<"basic" | "bp">("basic");

  // ─ Health ID management
  const [healthIdModal,  setHealthIdModal]  = useState(false);
  const [healthIdType,   setHealthIdType]   = useState<string>("amka");
  const [healthIdValue,  setHealthIdValue]  = useState("");
  const [healthIdValid,  setHealthIdValid]  = useState<boolean | null>(null);
  const [healthIdMsg,    setHealthIdMsg]    = useState("");

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

  const addChild = async () => {
    if (!newChildName) { Alert.alert("Σφάλμα", "Εισάγετε όνομα παιδιού."); return; }
    if (!guardian?.id) { Alert.alert("Σφάλμα", "Δεν έχει σαθεί κηδεμόνας."); return; }
    setAddingChild(true);
    try {
      const freeUntil = new Date();
      freeUntil.setMonth(freeUntil.getMonth() + 5);
      await createPatient({
        name: newChildName.trim(),
        birth_date: newChildDob || undefined,
        guardian_id: guardian.id,
        subscription: newChildSub,
        free_until: freeUntil.toISOString(),
      });
      setNewChildName("");
      setNewChildDob("");
      setNewChildSub("basic");
      Alert.alert("✅ Επιτυχία", "Το παιδί προστέθηκε.");
    } catch (e: any) {
      Alert.alert("Σφάλμα", e?.message ?? "Αποτυχία προσθήκης παιδιού.");
    } finally { setAddingChild(false); }
  };

  const switchPatient = async (patientId: number) => {
    if (guardian?.id) {
      await setActivePatient(guardian.id, patientId);
    }
  };

  const validateHealthId = async (type: string, value: string) => {
    if (!value) {
      setHealthIdMsg("Εισάγετε τον αριθμό");
      setHealthIdValid(false);
      return;
    }
    try {
      const res = await axios.post(`${apiUrl}/patients/${patient.id}/health-id/validate`, {
        health_id_type: type,
        health_id: value,
      });
      if (res.data.valid) {
        setHealthIdValid(true);
        setHealthIdMsg(res.data.message);
      } else {
        setHealthIdValid(false);
        setHealthIdMsg(res.data.message);
      }
    } catch (e: any) {
      setHealthIdValid(false);
      setHealthIdMsg("Σφάλμα επικοινωνίας");
    }
  };

  const saveHealthId = async () => {
    if (!healthIdValid) {
      Alert.alert("Σφάλμα", "Η αναγνώρηση δεν είναι έγκυρη");
      return;
    }
    try {
      await axios.post(`${apiUrl}/patients/${patient.id}/health-id`, {
        health_id_type: healthIdType,
        health_id: healthIdValue,
      });
      Alert.alert("✅ Αποθήκευση", "Η αναγνώρηση αποθηκεύτηκε.");
      await updatePatient(patient.id, {
        national_health_id_type: healthIdType,
        national_health_id: healthIdValue,
      });
      setHealthIdModal(false);
      setHealthIdValue("");
      setHealthIdValid(null);
    } catch (e: any) {
      Alert.alert("Σφάλμα", e?.message ?? "Αποτυχία αποθήκευσης");
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 40 }}>

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

        {guardian && patient ? (
          <>
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
              <Btn
                label={patient.national_health_id ? "📋 Ενημέρωση Αναγνώρισης" : "📋 Προσθήκη Αναγνώρισης"}
                onPress={() => setHealthIdModal(true)}
                variant="secondary"
              />
            </Section>

            {patients.length > 0 && (
              <Section title="👶 Διαχείριση Παιδιών">
                {patients.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={[s.childRow, p.id === patient.id && s.childRowActive]}
                    onPress={() => switchPatient(p.id)}>
                    <View style={s.childRowContent}>
                      <Text style={[s.childName, p.id === patient.id && s.childNameActive]}>
                        {p.name}
                      </Text>
                      <Text style={s.childAge}>
                        {p.birth_date ? `Γ.${new Date(p.birth_date).toLocaleDateString("el-GR")}` : "Χωρίς ΗΜ/Ν"}
                      </Text>
                    </View>
                    {p.id === patient.id && <Text style={s.childCheckmark}>✓</Text>}
                  </TouchableOpacity>
                ))}
                <Btn label="+ Προσθήκη Παιδιού" onPress={() => Alert.alert("Νέο Παιδί",
                  "Συμπληρώστε τα στοιχεία του νέου παιδιού",
                  [
                    { text: "Ακύρωση", onPress: () => {} },
                    { text: "Συνέχεια", onPress: () => {
                      // Show add child form (simplified inline)
                      Alert.prompt("Όνομα Παιδιού", "", (name) => {
                        if (name) setNewChildName(name);
                      });
                    }},
                  ])} />
              </Section>
            )}
          </>
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

        <Section title="📡 Ρύθμιση Συσκευής">
          <Field label="Τύπος Συσκευής">
            <TouchableOpacity style={s.pickerBtn} onPress={() =>
              Alert.alert("Τύπος Συσκευής", "", [
                { text: "ThronomedICE", onPress: () => setDeviceType("ThronomedICE") },
                { text: "ThermoDOC", onPress: () => setDeviceType("ThermoDOC") },
                { text: "Genial T31", onPress: () => setDeviceType("GenialT31") },
              ])}>
              <Text style={s.pickerBtnText}>
                {deviceType === "GenialT31" ? "Genial T31" : deviceType}
              </Text>
            </TouchableOpacity>
          </Field>

          <View style={s.bleStatus}>
            <View style={[s.bleDot, { backgroundColor: connected ? "#27AE60" : "#E74C3C" }]} />
            <Text style={s.bleStatusText}>
              {scanning ? "Σάρωση..."
               : connected ? `Συνδεδεμένο ${deviceType === "GenialT31" ? "Genial T31" : deviceType}`
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
              στο WiFi σε κάθε εκκίνηση.
            </Text>
          </View>
        </Section>

        <Modal visible={healthIdModal} transparent animationType="slide">
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={s.modalOverlay}>
              <View style={s.modalContent}>
                <Text style={s.modalTitle}>📋 Εθνική Αναγνώρηση</Text>

                <Field label="Τύπος Αναγνώρισης">
                  <TouchableOpacity style={s.pickerBtn} onPress={() =>
                    Alert.alert("Τύπος Αναγνώρισης", "",
                      Object.entries(HEALTH_ID_TYPES).map(([key, label]) => ({
                        text: label,
                        onPress: () => setHealthIdType(key),
                      }))
                    )}
                  >
                    <Text style={s.pickerBtnText}>{HEALTH_ID_TYPES[healthIdType as keyof typeof HEALTH_ID_TYPES]}</Text>
                  </TouchableOpacity>
                </Field>

                <Field label="Αριθμός Αναγνώρισης">
                  <TextInput
                    style={s.input}
                    value={healthIdValue}
                    onChangeText={(v) => {
                      setHealthIdValue(v);
                      setHealthIdValid(null);
                    }}
                    placeholder="Εισάγετε αριθμό"
                    autoCapitalize="none"
                  />
                </Field>

                <Btn
                  label="Έλεγχος"
                  onPress={() => validateHealthId(healthIdType, healthIdValue)}
                />

                {healthIdValid !== null && (
                  <View style={[s.validationResult, healthIdValid ? s.validationOk : s.validationErr]}>
                    <Text style={s.validationText}>{healthIdMsg}</Text>
                  </View>
                )}

                <View style={s.modalBtnRow}>
                  <Btn
                    label="Ακύρωση"
                    onPress={() => {
                      setHealthIdModal(false);
                      setHealthIdValue("");
                      setHealthIdValid(null);
                    }}
                    variant="secondary"
                  />
                  <Btn
                    label="Αποθήκευση"
                    onPress={saveHealthId}
                    disabled={!healthIdValid}
                  />
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

      </ScrollView>

      {/* ── Health ID Modal ──────────────────────────────────────── */}
      <Modal visible={healthIdModal} transparent animationType="slide">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={s.modalOverlay}>
            <View style={s.modalContent}>
              <Text style={s.modalTitle}>📋 Εθνική Αναγνώρηση</Text>

              <Field label="Τύπος Αναγνώρισης">
                <TouchableOpacity style={s.pickerBtn} onPress={() =>
                  Alert.alert("Τύπος Αναγνώρισης", "",
                    Object.entries(HEALTH_ID_TYPES).map(([key, label]) => ({
                      text: label,
                      onPress: () => setHealthIdType(key),
                    }))
                  )}>
                  <Text style={s.pickerBtnText}>{HEALTH_ID_TYPES[healthIdType as keyof typeof HEALTH_ID_TYPES]}</Text>
                </TouchableOpacity>
              </Field>

              <Field label="Αριθμός Αναγνώρισης">
                <TextInput
                  style={s.input}
                  value={healthIdValue}
                  onChangeText={(v) => {
                    setHealthIdValue(v);
                    setHealthIdValid(null);
                  }}
                  placeholder="Εισάγετε αριθμό"
                  autoCapitalize="none"
                />
              </Field>

              <Btn
                label="Έλεγχος"
                onPress={() => validateHealthId(healthIdType, healthIdValue)}
              />

              {healthIdValid !== null && (
                <View style={[s.validationResult, healthIdValid ? s.validationOk : s.validationErr]}>
                  <Text style={s.validationText}>{healthIdMsg}</Text>
                </View>
              )}

              <View style={s.modalBtnRow}>
                <Btn
                  label="Ακύρωση"
                  onPress={() => {
                    setHealthIdModal(false);
                    setHealthIdValue("");
                    setHealthIdValid(null);
                  }}
                  variant="secondary"
                />
                <Btn
                  label="Αποθήκευση"
                  onPress={saveHealthId}
                  disabled={!healthIdValid}
                />
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </KeyboardAvoidingView>
  );
}

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

  childRow:     { flexDirection: "row", alignItems: "center", paddingVertical: 10,
                  paddingHorizontal: 12, borderRadius: 8, marginBottom: 8,
                  backgroundColor: "#F8F9FA", borderWidth: 1, borderColor: "#EAECEE" },
  childRowActive: { backgroundColor: "#E8F4F8", borderColor: "#2874A6" },
  childRowContent: { flex: 1 },
  childName:    { fontSize: 14, fontWeight: "600", color: "#2C3E50" },
  childNameActive: { color: "#2874A6" },
  childAge:     { fontSize: 12, color: "#95A5A6", marginTop: 2 },
  childCheckmark: { fontSize: 18, color: "#27AE60", marginRight: 4 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20,
                  padding: 20, paddingBottom: 40 },
  modalTitle:  { fontSize: 18, fontWeight: "700", color: "#2C3E50", marginBottom: 16 },
  pickerBtn:   { borderWidth: 1, borderColor: "#D5D8DC", borderRadius: 8, padding: 12,
                 backgroundColor: "#FDFEFE", justifyContent: "center" },
  pickerBtnText: { fontSize: 15, color: "#2C3E50" },
  validationResult: { borderRadius: 8, padding: 12, marginTop: 12 },
  validationOk: { backgroundColor: "#D5F4E6" },
  validationErr: { backgroundColor: "#FDEDEC" },
  validationText: { fontSize: 13, color: "#27AE60", textAlign: "center" },
  modalBtnRow: { flexDirection: "row", gap: 10, marginTop: 16 },
});
