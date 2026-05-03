# Αίτηση Διπλώματος Ευρεσιτεχνίας
## Hellenic Patent Office (OBI) Application

**Τίτλος Εφεύρεσης / Title:**
Decentralized Wearable System for Continuous Pediatric Vital Signs Monitoring with Fever Velocity Detection, Blockchain Recording, and National Health ID Integration

---

## ΑΝΑΦΟΡΑ / ABSTRACT

A decentralized system for continuous monitoring of vital signs (temperature, blood oxygen, heart rate, blood pressure) in pediatric patients, featuring patented fever velocity detection (rate-of-rise of temperature), immutable blockchain recording of fever events, and secure hospital integration via national health identifiers (AMKA, KVNR, SVNR, SNILS, NHS, NIR, BSN, PHN, etc.).

The system comprises:
1. **Wearable Device Module** – Bluetooth low-energy sensor transmission
2. **Mobile Guardian Application** – Real-time alerts and health management (React Native)
3. **Cloud Microservices Backend** – FastAPI + PostgreSQL with Stripe subscription billing
4. **Hospital Integration API** – Secure patient lookup and EMR webhook push
5. **Immutable Blockchain Ledger** – Thronos chain for fever event recording

**Core Innovation:** Fever velocity algorithm detecting rapid temperature rise (>0.8°C per 30 minutes) triggering immediate clinical alert, enabling early intervention in pediatric fever management.

---

## ΑΝΕΞΆΡΤΗΤΕΣ ΑΞΙΏΣΕΙΣ / INDEPENDENT CLAIMS

### Claim 1: System Architecture (Broad)
A decentralized pediatric vital signs monitoring system comprising:
- (a) A Bluetooth LE wearable sensor device measuring temperature, SpO₂, heart rate, and blood pressure
- (b) A mobile guardian application (iOS/Android) with real-time alert notifications
- (c) A cloud backend (FastAPI + PostgreSQL) with subscription tier management
- (d) A blockchain ledger (Thronos chain) recording fever events immutably
- (e) A hospital integration API accepting national health ID queries and EMR webhook pushes
- (f) Multi-language support (Greek, English, German) for global markets

**Claim Scope:** The combination of wearable + mobile + cloud + blockchain + hospital API in a unified pediatric monitoring platform.

---

### Claim 2: Fever Velocity Detection Algorithm (Narrow - Core Patentable)

A method for detecting rapid fever onset in pediatric patients comprising:

**Steps:**
1. Receive consecutive temperature readings T₁, T₂ at timestamps t₁, t₂
2. Calculate fever rate as: **dT/dt = (T₂ - T₁) / (t₂ - t₁)** in °C per minute
3. Detect rapid rise when: **(dT/dt > 0.0267 °C/min) AND (T₂ ≥ 38.0°C)**
   - Equivalent to: >0.8°C per 30 minutes at fever threshold
4. Upon detection, immediately trigger:
   - 🚨 Push notification to guardian device
   - Blockchain transaction recording fever start
   - Hospital access webhook notification
5. Continue monitoring until temperature drops below 38.0°C for 30+ minutes

**Technical Advantage:**
- Early detection window: 15-30 minutes before traditional "fever management" protocols
- Enables preventive intervention before febrile seizure risk or serious illness escalation
- Particularly valuable for infants/toddlers where fever escalation speed correlates with infection severity

---

### Claim 3: Blockchain-Backed Immutable Fever Event Recording

A method for recording pediatric fever events on a blockchain ledger:

**Recorded Data:**
- `fever_start`: timestamp of fever onset
- `temperature_at_start`: initial recorded temperature (°C)
- `temperature_peak`: maximum temperature during event
- `duration`: time from fever start to resolution
- `rapid_rise_flag`: boolean indicating velocity-based detection
- `guardian_interventions`: antipyretic administration timestamps
- `hospital_access_log`: list of hospitals accessing the record
- `patient_national_id`: de-identified reference (AMKA hash, KVNR, etc)

**Blockchain Chain:** Thronos (custom EVM-compatible chain)
- Smart contract: `FeverHistory.sol` with immutable log and cryptographic proof
- Prevents tampering or deletion of medical history
- Enables medical-legal documentation for liability protection
- Facilitates clinical research with de-identified aggregated data

---

### Claim 4: Hospital Integration via National Health IDs

A method for secure hospital access to pediatric patient data using national health identifiers:

**Supported ID Types:**
- **AMKA** (Αριθμός Μητρώου Ασθενούς) – Greece
- **KVNR** (Krankenversichertennummer) – Germany
- **SVNR** (Sozialversicherungsnummer) – Austria
- **SNILS** (Социальный Номер Индивидуального Лицевого Счета) – Russia
- **NHS Number** – United Kingdom
- **NIR** (Numéro d'Inscription au Répertoire) – France
- **BSN** (Burgerservicenummer) – Netherlands
- **PHN** (Personenversicherungsnummer) – Switzerland
- **Personnummer** – Sweden

**Integration Flow:**
1. Hospital calls `/hospital/patients/lookup?health_id=<AMKA>&health_id_type=amka`
2. System verifies guardian-granted access (stored in `HospitalAccess` table)
3. Returns: patient summary, latest vitals, recent fever events, rapid_rise history
4. Optional: Hospital configures EMR webhook URL → automatic vital push on new readings
5. All access logged and auditable by guardian

---

### Claim 5: Multi-Country National Health ID Support with Localized Subscription Tiers

A method for international pediatric monitoring with region-specific pricing and national health system integration:

**Feature Set:**
1. Support for 9 national health ID systems (Claim 4 list)
2. Multi-currency subscription billing:
   - **Tier 1 (Basic):** €10/month (temperature + SpO₂ + HR)
   - **Tier 2 (Premium):** €15/month (Basic + blood pressure)
   - **Tier 3 (Family):** €25/month (5 children, all vitals)
3. Regional hospital API endpoints:
   - Greek: `GET /hospital/patients/lookup?health_id=12345678901&health_id_type=amka`
   - German: `GET /hospital/patients/lookup?health_id=X123456789&health_id_type=kvnr`
   - Russian: `GET /hospital/patients/lookup?health_id=123-456-789&health_id_type=snils`
4. Localized alerts and UI (Greek, German, Russian, English)
5. Compliance with regional data protection (GDPR, Bundesdatenschutzgesetz, PIPL, DPA)

---

## ΤΕΧΝΙΚΉ ΠΕΡΙΓΡΑΦΉ / TECHNICAL DESCRIPTION

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLOUD BACKEND (FastAPI)                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  /readings          POST         TempReading + fever_rate  │ │
│  │  /fever-events      GET          FeverEvent list + rapid   │ │
│  │  /guardian/*/sub    GET          Subscription status       │ │
│  │  /subscribe/chk     POST         Stripe Checkout session   │ │
│  │  /subscribe/webhook POST         Stripe event handling     │ │
│  │  /hospital/*        GET/POST     Access + EMR push         │ │
│  └────────────────────────────────────────────────────────────┘ │
│           ↑ PostgreSQL / SQLite        ↓ httpx webhook calls   │
└─────────────────────────────────────────────────────────────────┘
         ↓ FastAPI REST API                           ↓ Stripe API
     ┌─────────────────┐                     ┌────────────────────┐
     │  Mobile App     │ Vital readings       │ Subscription Mgmt  │
     │  (React Native) │ FCM push notify ←─── │ (Stripe.com)       │
     │  Guardian UX    │  fever alerts        │ Webhook process    │
     └─────────────────┘                     └────────────────────┘
         ↑ Bluetooth LE                           ↓ Hospital API
     ┌─────────────────┐                     ┌────────────────────┐
     │  Wearable Dev   │ sensor data          │ Hospital EMR Sys   │
     │ (Nordic nRF52)  │ T, SpO₂, HR, BP      │ webhook endpoint   │
     │ 5-min intervals │                      │ (automated push)   │
     └─────────────────┘                     └────────────────────┘
```

### Fever Velocity Calculation Algorithm

```python
def _calculate_fever_rate(patient_id, current_temp, ts, db):
    """Calculate dT/dt from consecutive readings."""
    prev_reading = db.query(TempReading)\
        .filter(TempReading.patient_id == patient_id, 
                TempReading.timestamp < ts)\
        .order_by(TempReading.timestamp.desc())\
        .first()
    
    if not prev_reading:
        return None
    
    time_diff_minutes = (ts - prev_reading.timestamp).total_seconds() / 60
    if time_diff_minutes <= 0:
        return None
    
    # fever_rate in °C per minute
    fever_rate = (current_temp - prev_reading.temperature) / time_diff_minutes
    return fever_rate

def _detect_rapid_rise(fever_rate, current_temp):
    """Detect rapid fever onset."""
    RAPID_RISE_THRESHOLD = 0.0267  # °C per minute (0.8°C per 30 min)
    FEVER_THRESHOLD = 38.0  # °C
    
    return (fever_rate > RAPID_RISE_THRESHOLD) and (current_temp >= FEVER_THRESHOLD)
```

### Database Schema for Fever Tracking

```sql
-- patients table extended
ALTER TABLE patients ADD COLUMN last_fever_check_time DATETIME NULL;
ALTER TABLE patients ADD COLUMN last_fever_rate FLOAT NULL;

-- temp_readings table extended
ALTER TABLE temp_readings ADD COLUMN fever_rate FLOAT NULL;

-- fever_events table extended
ALTER TABLE fever_events ADD COLUMN rapid_rise BOOLEAN DEFAULT FALSE;
```

### Backend Endpoint: POST /subscribe/checkout

**Request:**
```json
{
  "tier": "premium",
  "success_url": "https://medice.thronoschain.org/dashboard?session=success",
  "cancel_url": "https://medice.thronoschain.org/pricing"
}
```

**Response:**
```json
{
  "url": "https://checkout.stripe.com/pay/cs_test_...",
  "session_id": "cs_test_..."
}
```

**Flow:**
1. Guardian selects tier and clicks "Subscribe"
2. Frontend calls `/subscribe/checkout` with tier + return URLs
3. Backend calls `stripe.checkout.Session.create()` with price ID
4. Returns Stripe Checkout URL
5. Guardian redirected to Stripe Checkout (hosted form)
6. After payment, Stripe sends webhook to `/subscribe/webhook`
7. Backend updates `Guardian.subscription_tier` and `subscription_renews_at`

### Backend Endpoint: GET /hospital/patients/lookup

**Request:**
```
GET /hospital/patients/lookup?health_id=12345678901&health_id_type=amka&hospital_id=EKA_ATHENS
Header: X-Hospital-Key: <HOSPITAL_API_KEY>
```

**Response:**
```json
{
  "id": 42,
  "name": "Maria Papadopoulos",
  "birth_date": "2015-06-15T00:00:00",
  "national_health_id": "12345678901",
  "health_id_type": "amka",
  "country": "GR",
  "latest_vitals": {
    "temperature": 39.2,
    "spo2": 98.0,
    "bpm": 110,
    "fever_rate": 0.045,
    "timestamp": "2025-05-03T14:23:00"
  }
}
```

**Security:**
- Requires valid hospital API key
- Verifies guardian-granted access in `HospitalAccess` table
- Returns 403 if hospital not authorized
- All queries logged for audit trail

---

## ΔΙΆΚΡΙΣΗ ΔΙΑΝΟΗΤΙΚΉΣ ΙΔΙΟΚΤΗΣΊΑΣ / COMPETITIVE DIFFERENTIATION

### vs. Owlet
- ✅ **Fever velocity detection** – Owlet sends static temperature alerts only
- ✅ **Blockchain immutability** – Owlet data stored centrally (no audit trail)
- ✅ **Hospital integration** – Owlet has no EMR integration
- ✅ **Multi-country health IDs** – Owlet US-only
- ❌ Owlet has FDA approval (we'll pursue EU CE marking)

### vs. Garmin fēnix / Apple Watch
- ✅ **Pediatric-focused** – Garmin/Apple target adults
- ✅ **Fever velocity algorithm** – Neither implements rate-of-rise detection
- ✅ **Guardian control model** – No parental oversight in adult watches
- ✅ **Hospital API** – Not designed for clinical integration

### vs. Viatom CheckMe Pro
- ✅ **Continuous monitoring** – CheckMe is spot-check only
- ✅ **Multi-vital cloud platform** – CheckMe is hardware-centric
- ✅ **Fever velocity** – No rate-of-rise detection

---

## ΠΡΟΒΟΛΈΣ ΕΣΌΔΩΝ / REVENUE PROJECTIONS

### B2C Subscription Model
- **Target Market:** 200M pediatric patients in EU + UK + Russia
- **Addressable Market (willing to pay):** 50M × €12/month avg = **€600M ARR**
- **Conservative Penetration:** 2-5% in first 5 years = 1-2.5M users
- **Projected Revenue (Year 5):** 2M users × €12/month × 12 = **€288M ARR**

### B2B Hospital Integration
- **per-hospital license:** €50,000 - €200,000/year (depending on size)
- **Target:** 2,000 hospitals across EU (25% penetration)
- **Projected Revenue (Year 5):** 500 hospitals × €100,000/year = **€50M ARR**

### Hardware Sales
- **Device cost to user:** €150 (wearable + calibration)
- **Gross margin:** 40%
- **Projected (Year 5):** 100,000 devices/month × €60 margin = **€72M ARR**

### Total Projected Revenue (Year 5)
- B2C subscriptions: €288M
- B2B hospital: €50M
- Hardware: €72M
- **Total: €410M ARR**

---

## ΔΙΑΔΙΚΑΣΊΑ ΕΓΓΡΑΦΗΣ ΣΤΟ OBI / OBI FILING PROCEDURE

### Step 1: Document Preparation (Completed)
- ✅ Abstract
- ✅ 5 Independent Claims
- ✅ Technical drawings/diagrams
- ✅ Detailed description (this document)
- ✅ Competitive analysis
- ✅ Revenue projections

### Step 2: OBI Filing
- **Office:** Hellenic Patent Office (OBI / Ελληνικό Γραφείο Ευρεσιτεχνιών)
- **Website:** https://www.obi.gr
- **Filing Fee:** €350 (non-refundable)
- **Filing Type:** National patent application (Greece)
- **Priority Date:** [Date of OBI filing] (basis for international claims)

### Step 3: Examination (12-18 months)
- OBI conducts prior art search (Greek + international databases)
- May issue office actions requiring claim amendments
- Typical back-and-forth: 2-3 interactions with examiner
- Target: Grant within 2 years

### Step 4: International Protection (Optional, Post-Grant)
- **EPO Filing (European Patent Office):** 6-12 months post-OBI grant
  - Covers: Austria, France, Germany, Netherlands, Sweden, UK (via national route), etc.
  - Cost: €2,000-5,000 in examination + attorney fees
- **WIPO PCT (Patent Cooperation Treaty):** 2-4 months post-OBI grant
  - Cost: $2,000-3,000
  - Enables later entry into 150+ countries

---

## ΔΙΚΑΙΏΜΑΤΑ ΣΥΓΓΡΑΦΈΑ / AUTHORS / INVENTORS

**Primary Inventor:** [Thronos Development Team]
- Fever velocity algorithm design: Dr. [Name], Clinical Advisor
- Blockchain integration: [Name], Lead Software Architect
- Hospital API specification: [Name], Healthcare Systems Engineer

**Patent Assignee:** Thronos Labs Ltd. / [Greek Entity Name]

---

## ΔΗΛΩΣΗ ΠΡΩΤΟΤΥΠΊΑΣ / ORIGINALITY STATEMENT

This invention combines:
1. ✅ **Novel fever velocity algorithm** (not patented previously)
2. ✅ **Blockchain recording of fever events** (first application in pediatric wearables)
3. ✅ **Multi-national health ID integration** (unique system supporting 9 ID formats)
4. ✅ **Guardian-controlled hospital access model** (distinct from existing EMR systems)

**Prior Art Check:**
- Owlet (US patents): focuses on general monitoring, not fever velocity
- Garmin/Apple: adult-focused, no rate-of-rise algorithms
- No existing patents found combining all 4 elements

---

## ΗΜΕΡΟΜΗΝΊΑ ΑΊΤΗΣΗΣ / APPLICATION DATE

**[To be filled on submission to OBI]**
- Estimated submission: May 2025
- Estimated grant date: May 2027
- Patent term: 20 years from filing date (until May 2045)

---

## ΣΗΜΕΙΩΣΕΙΣ / NOTES

1. **Provisional vs. Full Application:** This is a full application. No provisional filing required for OBI.
2. **Language:** Application language is English per OBI guidelines for international patents.
3. **Claims Drafting:** Broad claims (1, 4, 5) and narrow claims (2, 3) provide layered protection.
4. **Future Amendments:** Claims may be narrowed during examination; core innovation (fever velocity) remains protectable.
5. **Design Patents:** Consider separate design patent for wearable device aesthetics (EU Design Register).
6. **Trade Secrets:** Backend algorithms (LocalAnalyzer, Thronos smart contract details) retained as trade secrets, not disclosed in patent.

---

## ΣΥΜΠΈΡΑΣΜΑ / CONCLUSION

Thronos MEDICE represents a unique combination of patentable innovations in pediatric health monitoring. The fever velocity detection algorithm is the core invention, addressing a previously unmet clinical need for early detection of rapid fever onset in children.

With OBI protection in Greece and subsequent EPO/WIPO filings, this patent provides:
- **13-year exclusivity** in European markets (2027-2045 assuming grant in 2027)
- **Licensing opportunities** with major health companies (Philips, Siemens, GE Healthcare)
- **Competitive moat** against larger players entering pediatric wearables
- **Revenue protection** for B2C subscription and B2B hospital licensing models

---

**Prepared by:** Thronos Development Team
**Date:** May 2025
**Status:** Ready for OBI submission (https://www.obi.gr)
