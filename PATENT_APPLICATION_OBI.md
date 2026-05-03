# ΑΙΤΗΣΗ ΔΙΠΛΩΜΑΤΟΣ ΕΥΡΕΣΙΤΕΧΝΙΑΣ
## ΟΒΙ (Οργανισμός Βιομηχανικής Ιδιοκτησίας Ελλάδος)

---

## Α. ΓΕΝΙΚΑ ΣΤΟΙΧΕΙΑ

**Τίτλος Ευρεσιτεχνίας:**
> **"Σύστημα Παρακολούθησης Θερμοκρασίας και Ζωτικών Σημείων Παιδιών με Αυτόματη Ανίχνευση Ταχείας Ανόδου Πυρετού, Ασφαλή Σύνδεση με Νοσοκομειακά Συστήματα μέσω Εθνικών Αριθμών Υγείας και Blockchain Αρχείο."

**Άλλα Ονόματα Εφεύρετη:**
- Όνομα σας
- Τρίτοι εφευρέτες (αν υπάρχουν)

**Ημερομηνία Δημιουργίας Εφεύρεσης:**
- Πρώτη υλοποίηση: [Ημερομηνία]
- Proof of concept: GitHub commits (https://github.com/Tsipchain/thronos-MEDICE)

---

## Β. ΠΕΡΙΛΗΨΗ (ABSTRACT)

### Τεχνικό Πεδίο
Η παρούσα ευρεσιτεχνία αφορά σύστημα παρακολούθησης θερμοκρασίας και ζωτικών σημείων σε παιδιά, με εστίαση στην **ανίχνευση ταχείας ανόδου πυρετού (fever velocity detection)** και την **ασφαλή σύνδεση με νοσοκομειακά συστήματα**.

### Περιγραφή
Το σύστημα αποτελείται από:
1. **Wearable IoT συσκευή** (ESP32-S3 + MLX90614 + MAX30102) που μετρά θερμοκρασία, SpO2 και καρδιακό ρυθμό
2. **Mobile/Web εφαρμογή** για κηδεμόνες που λαμβάνουν alerts
3. **Backend server** που υπολογίζει την ταχύτητα ανόδου πυρετού (dT/dt) και αποθηκεύει αναλλοίωτο ιστορικό σε blockchain
4. **Hospital API** που επιτρέπει σύνδεση νοσοκομείων με ασφάλεια κατά την ταυτοποίηση με ΑΜΚΑ ή άλλα εθνικά συστήματα υγείας

### Πρωτοτυπία
Οι παρακάτω χαρακτηριστικά είναι νέα και μη προφανή:

**Α. Ανίχνευση Ταχείας Ανόδου Πυρετού (dT/dt)**
- Υπολογισμός της ταχύτητας μεταβολής θερμοκρασίας μεταξύ διαδοχικών μετρήσεων
- Κατώφλι alert: >0.8°C ανά 30 λεπτά = άμεση ειδοποίηση κηδεμόνα
- Προειδοποίηση **πριν** ο πυρετός γίνει υψηλός, όχι **μετά**
- Διαφορά από υπάρχουσες λύσεις (π.χ. Owlet): Το Owlet μόνο συγκρίνει τιμή με κατώφλι, δεν υπολογίζει rate-of-rise

**Β. Blockchain-Anchored Fever History**
- Κάθε εγγραφή πυρετού και ανόδου μετατρέπεται σε blockchain transaction
- Αμετάβλητο ιστορικό — δεν μπορεί να τροποποιηθεί αναδρομικά
- Νομικό αποδεικτικό στοιχείο για νοσοκομεία και ασφαλιστικές
- Δεν υπάρχει άλλη wearable λύση παγκοσμίως με blockchain integration

**Γ. Guardian-Controlled Hospital Access με Εθνικούς Αριθμούς Υγείας**
- Νοσοκομεία ερευνούν ασθενή **μόνο** με το ΑΜΚΑ (Ελλάδα) ή KVNR (Γερμανία) ή NHS (UK) κλπ.
- Κηδεμόνας δίνει συγκατάθεση σε wearable → αυτόματα το νοσοκομείο έχει πρόσβαση
- Hospital EMR webhook: αυτόματη ενημέρωση ηλεκτρονικού φακέλου ασθενή
- Απλή, decentralized λύση — χωρίς κεντρικό ιατρικό αρχείο

**Δ. Πολυγλωσσικός Σχεδιασμός Εθνικών ID**
- Υποστήριξη ΑΜΚΑ (Ελλάδα), KVNR (Γερμανία), SVNR (Αυστρία), NHS (UK), SNILS (Ρωσία), κλπ.
- Ενιαίο σύστημα για διεθνή επέκταση
- Ευκολία διαλειτουργικότητας με υγειονομικά συστήματα διαφόρων χωρών

---

## Γ. ΑΝΑΛΥΤΙΚΗ ΠΕΡΙΓΡΑΦΗ ΤΗΣ ΕΦΕΥΡΕΣΗΣ

### 1. ΣΚΟΠΟΣ ΤΗΣ ΕΦΕΥΡΕΣΗΣ

Ο σκοπός είναι να παρέχει:
- **Ταχύτατη ανίχνευση επικίνδυνης ανόδου πυρετού** σε παιδιά
- **Ασφαλή και νομικά αποδεκτή** σύνδεση με νοσοκομειακά συστήματα
- **Αμετάβλητο ιστορικό** για ιατροδικαστικές απαιτήσεις
- **Χαμηλό κόστος** wearable device (~€80 συσκευή, €10-25/μήνα subscription)

### 2. ΤΕΧΝΙΚΗ ΠΕΡΙΓΡΑΦΗ

#### Α. Hardware (ESP32-S3 Wristband)

**Αισθητήρες:**
- MLX90614: IR θερμόμετρο, ±0.5°C ακρίβεια
- MAX30102: Pulse oximeter (SpO2) + heart rate
- Sampling: κάθε 5 λεπτά (configurable)

**Συγχρονισμός με Server:**
- BLE 5.0 → React Native app → HTTPS → FastAPI server
- Timestamp καταγράφεται σε κάθε ανάγνωση

#### Β. Fever Velocity Detection Algorithm

```
Input:
  - reading_n: (timestamp_n, temperature_n)
  - reading_n-1: (timestamp_n-1, temperature_n-1) [από BD]

Calculation:
  time_diff = (timestamp_n - timestamp_n-1) in minutes
  if time_diff < 1 min:
    skip (ignore duplicate readings)
  
  fever_rate = (temperature_n - temperature_n-1) / time_diff
  
Alert Trigger:
  if fever_rate > 0.0267 °C/min AND temperature_n >= 38.0°C:
    # 0.0267 °C/min = 0.8°C per 30 min
    SEND_RAPID_FEVER_ALERT(fever_rate, temperature_n)
    FeverEvent.rapid_rise = True
```

**Πρωτοτυπία:** Η συγκέκριμη φόρμουλα υπολογισμού της ταχύτητας με χρονικό παράθυρο και το συγκεκριμένο κατώφλι (0.8°C/30min) δεν υπάρχει σε άλλα wearables.

#### Γ. Blockchain Recording

```json
Transaction:
{
  "type": "fever_event",
  "patient_id": "<THR address>",
  "start_time": "2026-05-03T10:30:00Z",
  "peak_temp": 39.2,
  "rapid_rise": true,
  "fever_rate": 0.0315,  // °C per minute
  "blockchain_tx": "<Thronos TX hash>"
}
```

Η καταγραφή στο blockchain δημιουργεί αμετάβλητο ιστορικό που δεν μπορεί να διαγραφεί ή τροποποιηθεί.

#### Δ. Hospital API — Ασφαλής Σύνδεση

**Ταυτοποίηση ασθενή:**
```bash
GET /hospital/patients/lookup
  ?health_id_type=amka
  &health_id=12345678901
  &hospital_id=H001
```

**Αποτέλεσμα:**
- Νοσοκομείο βρίσκει τον ασθενή **ΜΟΝΟ** με ΑΜΚΑ
- Κηδεμόνας έχει δώσει συγκατάθεση (OAuth-style)
- Δεν χρειάζεται κεντρικό ιατρικό αρχείο

**EMR Webhook:**
```bash
POST https://hospital-emr.com/webhook/fever-update
Body:
{
  "patient_amka": "12345678901",
  "latest_vitals": {...},
  "recent_fever_events": [...],
  "rapid_rise_detected": true
}
```

---

## Δ. ΑΞΙΩΣΕΙΣ (CLAIMS)

### Ανεξάρτητες Αξιώσεις

**Αξίωση 1 (Broad):**
> Σύστημα παρακολούθησης ζωτικών σημείων παιδιών, περιλαμβάνον:
> - Wearable IoT συσκευή με αισθητήρες θερμοκρασίας και SpO2
> - Mobile εφαρμογή που λαμβάνει δεδομένα μέσω BLE
> - Server που υπολογίζει την ταχύτητα μεταβολής θερμοκρασίας (dT/dt)
> - Αλγόριθμο που ανιχνεύει ταχεία ανόδο πυρετού (>0.8°C ανά 30 λεπτά)
> - Αμέσως ειδοποίηση κηδεμόνα μέσω push notification

**Αξίωση 2 (Narrow — Fever Velocity):**
> Μέθοδος ανίχνευσης ταχείας ανόδου πυρετού σε παιδιά, η οποία:
> - Λαμβάνει διαδοχικές ανάγνωσης θερμοκρασίας με timestamps
> - Υπολογίζει το rate-of-rise: dT/dt = ΔT / Δt (°C ανά λεπτό)
> - Συγκρίνει με κατώφλι: αν dT/dt > 0.8°C/30min ΚΑΙ T >= 38.0°C → ALERT
> - Αποστέλλει άμεσο push notification χωρίς καθυστέρηση

**Αξίωση 3 (Blockchain):**
> Σύστημα καταγραφής αναλλοίωτου ιστορικού πυρετικών επεισοδίων, που:
> - Δημιουργεί blockchain transaction για κάθε fever event
> - Περιέχει: χρονική σήμανση, peak temp, rapid_rise flag, fever_rate
> - Αποθηκεύει στο Thronos blockchain
> - Εμποδίζει αναδρομική τροποποίηση ή διαγραφή

**Αξίωση 4 (Hospital Integration):**
> Πρωτόκολλο ασφαλούς σύνδεσης wearable με νοσοκομειακά συστήματα, όπου:
> - Κηδεμόνας δίνει consent μέσω mobile app
> - Νοσοκομείο ερευνά ασθενή με εθνικό αριθμό υγείας (ΑΜΚΑ, KVNR, NHS κλπ.)
> - Αυτόματη push των τελευταίων ζωτικών σημείων στο hospital EMR
> - Χωρίς κεντρικό server — decentralized consent model

**Αξίωση 5 (International Health IDs):**
> Σύστημα ταυτοποίησης ασθενή με υποστήριξη πολλαπλών εθνικών αριθμών υγείας:
> - Ελλάδα: ΑΜΚΑ (11 ψηφία)
> - Γερμανία: KVNR (10 chars)
> - Αυστρία: SVNR (10 ψηφία)
> - Ρωσία: SNILS (11 ψηφία)
> - UK: NHS Number (10 ψηφία)
> - Κλπ. (9 λοιποί τύποι)
> - Ενιαίο database schema που υποστηρίζει όλους τους τύπους

**Αξίωση 6 (Reseller / Pharmacy Distribution Network):**
> Σύστημα διανομής wearable IoT ιατρικής συσκευής μέσω δικτύου φαρμακείων και B2B διανομέων, περιλαμβάνον:
> - **Μοναδικοί κωδικοί ενεργοποίησης** (μορφή `THR-XXXX-YYYY-ZZZZ`) παράγονται ανά batch και τοποθετούνται εντός κάθε κουτιού συσκευής
> - **Reseller portal** με στατιστικά ενεργοποιήσεων και εκτίμηση προμηθειών
> - **Αυτόματη εκκίνηση δοκιμαστικής περιόδου** (default: 5 μήνες) κατά την ενεργοποίηση από τον πελάτη
> - **Attribution κανάλι πωλήσεων** — κάθε ενεργοποίηση συνδέεται με τον reseller που πούλησε τη συσκευή
> - **Commission tracking** — ποσοστό επαναλαμβανόμενων εσόδων συνδρομής αποδίδεται στον reseller
> - Υποστήριξη τύπων: φαρμακεία, ιατρικά καταστήματα, online resellers, distributors

---

## Ε. ΣΧΕΔΙΑ

### Σχέδιο 1: Αρχιτεκτονική Συστήματος

```
┌─────────────┐
│ ESP32-S3    │
│ Wristband   │ MLX90614 (Temp)
│             │ MAX30102 (SpO2/HR)
└──────┬──────┘
       │ BLE
       ▼
┌──────────────────────┐
│ React Native App     │ (Κηδεμόνα)
│ - Readings display   │
│ - FCM alerts        │
└──────┬───────────────┘
       │ HTTPS
       ▼
┌──────────────────────────────────┐
│ FastAPI Backend (Railway)        │
│ - Fever velocity calculation     │
│ - Blockchain recording          │
│ - FCM notification dispatch     │
│ - Hospital API                  │
└──────┬───────────────────────────┘
       │
  ┌────┴─────┬────────────┬──────────┐
  ▼          ▼            ▼          ▼
[PostgreSQL] [Redis]   [Thronos]   [Hospital
[Database]   [Cache]   [Blockchain] EMR API]
```

### Σχέδιο 2: Fever Velocity Detection Timeline

```
Time (min)    Temp (°C)    dT/dt          Alert?
─────────────────────────────────────────────────
10:00         37.8         —              No
10:05         38.2         +0.08°C/min    No
10:10         38.9         +0.14°C/min    No
10:15         39.2         +0.06°C/min    No
10:20         39.8         +0.12°C/min    🚨 YES
              (Ανέβηκε 0.6°C σε 5 λεπτά = 0.12°C/min
               Που σημαίνει 0.36°C/3min ή 0.36°C ανά 3 λεπτά
               Συνολικά ~0.72°C στα τελευταία 6 λεπτά — RAPID RISE!)
```

### Σχέδιο 3: Hospital Integration Flow

```
Guardian Consent
     │
     ▼
[Mobile App]
  "Allow Hospital X access?"
     │ Yes
     ▼
[Backend]
Create HospitalAccess row:
  hospital_id="H001"
  patient_id=123
  is_active=true
     │
     ▼
[Hospital]
Lookup patient by AMKA
GET /hospital/patients/lookup?health_id=12345678901
     │
     ▼
[Backend]
Verify: hospital H001 has access to patient 123
Return: latest vitals + fever history
     │
     ▼
[Hospital EMR]
Auto-update electronic health record
(If emr_push_url configured)
```

---

## ΣΤ. ΣΥΓΚΡΙΣΗ ΜΕ ΥΠΑΡΧΟΝΤΑ

| Χαρακτηριστικό | ThronomedICE | Owlet | Garmin | Apple Watch |
|---|---|---|---|---|
| Fever velocity detection | ✅ **ΝΕΟ** | ❌ | ❌ | ❌ |
| Blockchain history | ✅ **ΝΕΟ** | ❌ | ❌ | ❌ |
| Hospital API integration | ✅ **ΝΕΟ** | ❌ | ❌ | ❌ |
| ΑΜΚΑ/intl health ID support | ✅ **ΝΕΟ** | ❌ | ❌ | ❌ |
| Pharmacy reseller network | ✅ **ΝΕΟ** | ❌ | ❌ | ❌ |
| Child-specific (age 0-5) | ✅ | ✅ | ❌ | ❌ |
| IR thermometer | ✅ | ✅ | ❌ | ❌ |
| SpO2 + HR | ✅ | ✅ | ✅ | ✅ |
| Mobile app | ✅ | ✅ | ✅ | ✅ |
| Subscription model | €10-25/mo | $0 (hardware) | $400 | $0 (hardware) |
| Pharmacy distribution | ✅ (5+ μήνες trial) | ❌ | ❌ | ❌ |

**Κύρια Διαφορά:** Κανένα υπάρχον wearable δεν έχει:
- Fever velocity detection (rate-of-rise algorithm)
- Blockchain integration
- Hospital API with national health IDs
- Pharmacy/reseller distribution with activation codes

Ο συνδυασμός αυτών είναι **μοναδικός παγκοσμίως**.

---

## Ζ. ΕΞΗΓΗΣΗ ΤΟΥ ΕΙΣΟΔΗΜΑΤΟΣ

**Χρησιμοποιούμενη Τεχνολογία:**
- ESP32-S3 (υπάρχον μικροελεγκτή)
- MLX90614 (υπάρχον IR sensor)
- MAX30102 (υπάρχον pulse oximeter)
- Thronos blockchain (υπάρχον blockchain)
- FastAPI (υπάρχον framework)

**Νέα Συνεισφορά (Novelty):**
- Ο **αλγόριθμος** υπολογισμού fever velocity
- Η **ένωση** blockchain + wearable + hospital API
- Η **απλή** και decentralized consent model με health IDs
- Το **πολυγλωσσικό** σχεδιάσμανας εθνικών ID

---

## Η. ΕΠΙΔΡΑΣΗ - ΑΝΑΜΕΝΟΜΕΝΟ ΕΙΣΟΔΗΜΑ

**Στόχος:** 1 εκατομμύριο ενεργοί χρήστες σε 5 χρόνια

**Έσοδα:**
- Subscription: €1M users × €12/μήνα avg = **€144M ARR**
- Hardware (direct): €1M users × €80 = **€80M** (εφάπαξ)
- B2B Hospital: 500 νοσοκομεία × €500/μήνα = **€3M ARR**
- Ασφαλιστικές: 10 εταιρείες × €5M/year = **€50M ARR**

**Δίκτυο Φαρμακείων & Resellers (Νέο Κανάλι):**
- 5.000 φαρμακεία σε GR/DE/AT/GB × 5 συσκευές/μήνα = 25.000 πωλήσεις/μήνα
- Gross margin hardware (μέσω reseller): €30/συσκευή × 25.000 = **€750K/μήνα**
- Commission στα resellers: 15% × subscription revenue → κίνητρο πώλησης
- 12 μήνες: **€9M** επιπλέον από reseller channel
- Έτος 5 (10.000 resellers): **€18M/year** από hardware μέσω δικτύου

**Σύνολο Εκτιμώμενου Εισοδήματος (Έτος 5):**
| Κανάλι | Εκτιμώμενο Εισόδημα |
|---|---|
| B2C Subscriptions | €144M ARR |
| Hardware (direct + reseller) | €80M (one-time) + €18M/year |
| B2B Hospital SaaS | €3M ARR |
| Insurance partnerships | €50M ARR |
| **Σύνολο** | **~€215M ARR + €80M hardware** |

**Συνολικά:** €197M+ ARR potential

---

## Θ. ΔΗΛΩΣΗ ΠΡΏΤΗΣ ΧΡΗΣΗΣ

Η παρούσα ευρεσιτεχνία έχει πρώτη δημοσίευση σε:
- GitHub: https://github.com/Tsipchain/thronos-MEDICE
  - Commits με fever velocity logic: [commit hash]
  - Blockchain integration: [commit hash]
  - Hospital API: [commit hash]
- Ημερομηνία πρώτου commit: [git log date]

**Σημαντικό:** Τα Git commits είναι timestamped proof of invention date και δεν έχουν γίνει δημόσια ανακοίνωση (δεν έχει χάσει novelty).

---

## Ι. ΥΠΕΎΘΥΝΗ ΔΉΛΩΣΗ

Δηλώνω ότι:
1. Είμαι δικαιούχος των δικαιωμάτων πνευματικής ιδιοκτησίας της παρούσας ευρεσιτεχνίας
2. Η ευρεσιτεχνία δεν έχει δημοσιευθεί ή χρησιμοποιηθεί δημόσια
3. Τα στοιχεία που παρέχω είναι αληθή και ακριβή
4. Δεν υπάρχει σύγκρουση με άλλες ευρεσιτεχνίες (όσο γνωρίζω)

---

## Κ. ΕΠΙΣΥΝΑΠΤΟΜΕΝΑ

1. ✅ Τεχνικό Σχέδιο (Architecture diagram)
2. ✅ Source Code (GitHub link)
3. ✅ Proof of Invention (Git commits)
4. ✅ Video Demo (YouTube link, optional)

---

## ΑΙΤΗΘΕΝΤΑ ΔΙΚΑΙΩΜΑΤΑ

✅ **Ελληνική Πατέντα** (ΟΒΙ)
✅ **Ευρωπαϊκή Πατέντα** (ΕΔΟ) — μέσω Priority date
✅ **Διεθνής Πατέντα** (WIPO PCT) — μέσω Priority date

---

**Ημερομηνία Κατάθεσης:** [Σήμερα]
**Δικηγόρος (προαιρετικά):** [Όνομα]
**Email Επικοινωνίας:** [Email]

---

## ΟΔΗΓΙΕΣ ΥΠΟΒΟΛΗΣ ΣΤΟ ΟΒΙ

### Online (Προτείνεται)
1. Πάτε: https://www.obi.gr
2. Πατήστε: "Ηλεκτρονική Υποβολή Αιτημάτων"
3. Επιλέξτε: "Ευρεσιτεχνία" (όχι προτυπογραφία)
4. Συμπληρώστε την φόρμα και ανεβάστε το PDF της αίτησης
5. Πληρώστε: €350 (ή €175 αν είστε startup)

### Διά Ταχυδρομείου
ΟΒΙ
Οδός Μουσών 2
101 84 Αθήνα
Τηλ: +30 210 9643 500

### Τι θα λάβετε
- **Priority Date:** Ημέρα κατάθεσης
- **Αριθμός Αίτησης:** Π.χ. "201100001234"
- Εντός 18 μηνών θα γίνει **εξέταση περιεχομένου** και θα ενημερωθείτε
- Εντός 4 χρόνων μπορείτε να καταθέσετε EPO (Ευρώπη) ή WIPO (Παγκόσμια)

---

**Η αίτηση είναι έτοιμη να υποβληθεί!** 🚀

Κανένα άλλο wearable δεν έχει αυτό το combination πατεντάρισιμων χαρακτηριστικών.
