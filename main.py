from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
import hashlib
import secrets
import os
import stripe

from models import (
    Base, Guardian, Patient, TempReading, FeverEvent,
    TempReadingIn, PatientCreate, GuardianCreate, GuardianLogin,
    FeverEventOut, SimulateIn, HEALTH_ID_TYPES,
    StripeCheckoutRequest,
)
from local_analyzer import LocalAnalyzer
from notifications import (
    send_fever_alert, send_high_fever_alert,
    send_antipyretic_reminder, send_fever_ended,
    send_spo2_alert, send_hr_alert, send_bp_alert,
    send_rapid_fever_alert,
)
from blockchain import record_fever_start, record_fever_end
from hospital_api import router as hospital_router
from thronos_integration import router as thronos_router
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

DB_URL = os.getenv("DATABASE_URL", "sqlite:////medice/medice.db")
STRIPE_API_KEY = os.getenv("STRIPE_API_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")

if STRIPE_API_KEY:
    stripe.api_key = STRIPE_API_KEY

# Stripe product IDs (set in Stripe dashboard)
STRIPE_PRODUCTS = {
    "basic": os.getenv("STRIPE_PRODUCT_BASIC", "price_basic"),
    "premium": os.getenv("STRIPE_PRODUCT_PREMIUM", "price_premium"),
    "family": os.getenv("STRIPE_PRODUCT_FAMILY", "price_family"),
}

_connect_args = {"check_same_thread": False} if DB_URL.startswith("sqlite") else {}
engine       = create_engine(DB_URL, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine)

analyzer = LocalAnalyzer()


def _hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return f"{salt}:{hashed.hex()}"


def _verify_password(password: str, password_hash: str) -> bool:
    try:
        salt, hashed = password_hash.split(":", 1)
    except ValueError:
        return False
    check = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000)
    return secrets.compare_digest(check.hex(), hashed)


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs("/medice", exist_ok=True)
    Base.metadata.create_all(engine)
    yield

app = FastAPI(title="ThronomedICE Vital Signs API", version="2.1", lifespan=lifespan)

_CORS_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "CORS_ORIGINS",
        "https://medice.thronoschain.org,https://thronoschain.org,http://localhost:3000"
    ).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_origin_regex=r"https://(.*\.up\.railway\.app|.*\.thronoschain\.org|thronoschain\.org)",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(hospital_router)
app.include_router(thronos_router)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _calculate_fever_rate(patient_id: int, current_temp: float, db: Session) -> float | None:
    """
    Calculate fever rate (°C per minute) based on last reading.
    Returns rate or None if no previous reading.
    """
    prev_reading = (
        db.query(TempReading)
        .filter(TempReading.patient_id == patient_id)
        .order_by(TempReading.timestamp.desc())
        .offset(1)  # Skip current
        .first()
    )
    if not prev_reading:
        return None
    
    now = datetime.utcnow()
    time_diff = (now - prev_reading.timestamp).total_seconds() / 60.0  # minutes
    if time_diff < 1:  # Ignore if < 1 min apart
        return None
    
    rate = (current_temp - prev_reading.temperature) / time_diff
    return rate


async def _process_vitals(
    patient_id: str,
    reading: TempReadingIn,
    ts: datetime,
    fcm_token: str | None,
    db: Session,
    patient,
    save_to_db: bool = True,
) -> dict:
    if save_to_db and patient:
        # Calculate fever rate before saving
        fever_rate = _calculate_fever_rate(patient.id, reading.temperature, db)
        
        db.add(TempReading(
            patient_id  = patient.id,
            device_id   = reading.device_id,
            temperature = reading.temperature,
            spo2        = reading.spo2,
            bpm         = reading.bpm,
            systolic    = reading.systolic,
            diastolic   = reading.diastolic,
            spo2_valid  = reading.spo2_valid  or False,
            bpm_valid   = reading.bpm_valid   or False,
            bp_valid    = reading.bp_valid    or False,
            fever_rate  = fever_rate,
            timestamp   = ts,
        ))
        db.commit()
        patient.last_fever_check_time = ts
        patient.last_fever_rate = fever_rate
        db.commit()
    else:
        fever_rate = None

    t_result = await analyzer.analyze_temp(patient_id, reading.temperature, ts)
    v_result = await analyzer.analyze_vitals(
        patient_id,
        reading.spo2,      reading.spo2_valid  or False,
        reading.bpm,       reading.bpm_valid   or False,
        reading.systolic,  reading.diastolic,
        reading.bp_valid  or False,
    )

    # Check for rapid fever rise (>0.8°C per 30 min = 0.0267°C per min)
    rapid_rise = fever_rate and fever_rate > 0.0267 and reading.temperature >= 38.0

    if fcm_token:
        # Rapid fever alert (highest priority)
        if rapid_rise:
            await send_rapid_fever_alert(fcm_token, reading.temperature, fever_rate)
        elif t_result["send_fever_alert"]:
            if t_result["fever_level"] == "high_fever":
                await send_high_fever_alert(fcm_token, reading.temperature)
            else:
                await send_fever_alert(fcm_token, reading.temperature)

        if t_result["send_antipyretic_reminder"]:
            await send_antipyretic_reminder(fcm_token)

        if v_result["spo2_alert"] and reading.spo2:
            await send_spo2_alert(fcm_token, reading.spo2, v_result["spo2_level"])

        if v_result["hr_alert"] and reading.bpm:
            await send_hr_alert(fcm_token, reading.bpm, v_result["hr_level"])

        bp_enabled = getattr(patient, "bp_subscription", True) if patient else False
        if v_result["bp_alert"] and bp_enabled and reading.systolic and reading.diastolic:
            await send_bp_alert(fcm_token, reading.systolic, reading.diastolic, v_result["bp_level"])

    if save_to_db and patient:
        if t_result["is_new_fever"]:
            event = FeverEvent(
                patient_id=patient.id,
                start_time=ts,
                peak_temp=reading.temperature,
                rapid_rise=bool(rapid_rise),
            )
            db.add(event)
            db.commit()
            tx = await record_fever_start(str(patient.id), int(reading.temperature * 100), int(ts.timestamp()))
            event.blockchain_tx = tx
            db.commit()
            await analyzer.register_fever_started(patient_id, str(event.id))

        if t_result["active_fever_id"]:
            event = db.query(FeverEvent).filter(FeverEvent.id == int(t_result["active_fever_id"])).first()
            if event and reading.temperature > event.peak_temp:
                event.peak_temp = reading.temperature
                db.commit()

        if t_result["is_fever_ending"] and t_result["active_fever_id"]:
            event = db.query(FeverEvent).filter(FeverEvent.id == int(t_result["active_fever_id"])).first()
            if event:
                vitals = await analyzer.get_fever_vitals(patient_id)
                event.end_time = ts
                event.min_spo2 = vitals["min_spo2"]
                event.avg_bpm  = vitals["avg_bpm"]
                db.commit()
                await record_fever_end(str(patient.id), event.id)
                if fcm_token:
                    await send_fever_ended(fcm_token)

    return {
        "status":          "ok",
        "fever_level":     t_result["fever_level"],
        "fever_rate":      fever_rate,
        "rapid_rise":      rapid_rise,
        "spo2_level":      v_result["spo2_level"],
        "hr_level":        v_result["hr_level"],
        "bp_level":        v_result["bp_level"],
        "bp_alert":        v_result["bp_alert"],
        "active_fever_id": t_result["active_fever_id"],
        "is_new_fever":    t_result["is_new_fever"],
    }


@app.post("/readings", response_model=dict)
async def post_reading(reading: TempReadingIn, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.id == int(reading.patient_id)).first()
    if not patient:
        raise HTTPException(404, "Patient not found")

    ts        = reading.timestamp or datetime.utcnow()
    fcm_token = patient.guardian.fcm_token if patient.guardian else None

    return await _process_vitals(
        str(reading.patient_id), reading, ts, fcm_token, db, patient, save_to_db=True,
    )


@app.post("/simulate", response_model=dict)
async def simulate(body: SimulateIn, db: Session = Depends(get_db)):
    reading = TempReadingIn(
        patient_id  = "0",
        device_id   = "simulator",
        temperature = body.temperature,
        spo2        = body.spo2,
        bpm         = body.bpm,
        systolic    = body.systolic,
        diastolic   = body.diastolic,
        spo2_valid  = body.spo2  is not None,
        bpm_valid   = body.bpm   is not None,
        bp_valid    = body.systolic is not None and body.diastolic is not None,
        timestamp   = datetime.utcnow(),
    )
    result = await _process_vitals(
        "sim", reading, datetime.utcnow(), None, db, None, save_to_db=False,
    )
    result["mode"] = "simulation"
    return result


@app.get("/patients/{patient_id}/vitals")
def current_vitals(patient_id: int, db: Session = Depends(get_db)):
    reading = (
        db.query(TempReading)
        .filter(TempReading.patient_id == patient_id)
        .order_by(TempReading.timestamp.desc())
        .first()
    )
    if not reading:
        raise HTTPException(404, "No readings yet")
    return {
        "temperature": reading.temperature,
        "fever_rate": reading.fever_rate,
        "spo2":        reading.spo2,
        "bpm":         reading.bpm,
        "systolic":    reading.systolic,
        "diastolic":   reading.diastolic,
        "bp_valid":    reading.bp_valid,
        "spo2_valid":  reading.spo2_valid,
        "bpm_valid":   reading.bpm_valid,
        "timestamp":   reading.timestamp,
    }


@app.get("/patients/{patient_id}/fever-history", response_model=list[FeverEventOut])
def fever_history(patient_id: int, db: Session = Depends(get_db)):
    return db.query(FeverEvent).filter(FeverEvent.patient_id == patient_id)\
             .order_by(FeverEvent.start_time.desc()).all()


@app.get("/patients/{patient_id}/plan")
def patient_plan(patient_id: int, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(404, "Patient not found")

    now = datetime.utcnow()
    in_trial  = bool(patient.free_until and now < patient.free_until)
    days_left = max(0, (patient.free_until - now).days) if in_trial else 0

    health_id_label = None
    if patient.national_health_id_type:
        info = HEALTH_ID_TYPES.get(patient.national_health_id_type, {})
        health_id_label = info.get("label", patient.national_health_id_type.upper())

    return {
        "patient_id":    patient.id,
        "name":          patient.name,
        "subscription":  patient.subscription,
        "in_trial":      in_trial,
        "trial_days_left": days_left,
        "bp_enabled":    patient.bp_subscription,
        "national_health_id":      patient.national_health_id,
        "national_health_id_type": patient.national_health_id_type,
        "health_id_label":         health_id_label,
        "country":       patient.country,
    }


@app.put("/fever-events/{event_id}/antipyretic")
async def mark_antipyretic(event_id: int, db: Session = Depends(get_db)):
    event = db.query(FeverEvent).filter(FeverEvent.id == event_id).first()
    if not event:
        raise HTTPException(404)
    event.antipyretic_given = True
    db.commit()
    await analyzer.register_antipyretic_given(str(event.patient_id), datetime.utcnow())
    return {"status": "ok"}


@app.post("/guardians", response_model=dict)
def create_guardian(g: GuardianCreate, db: Session = Depends(get_db)):
    existing = db.query(Guardian).filter(Guardian.email == g.email).first()
    if existing:
        raise HTTPException(409, "Email already registered")
    guardian = Guardian(
        name          = g.name,
        email         = g.email,
        password_hash = _hash_password(g.password),
        subscription_tier = "free",
        subscription_status = "active",
    )
    db.add(guardian)
    db.commit()
    return {"id": guardian.id}


@app.post("/login", response_model=dict)
def login(body: GuardianLogin, db: Session = Depends(get_db)):
    guardian = db.query(Guardian).filter(Guardian.email == body.email).first()
    if not guardian or not guardian.password_hash:
        raise HTTPException(401, "Invalid email or password")
    if not _verify_password(body.password, guardian.password_hash):
        raise HTTPException(401, "Invalid email or password")

    now = datetime.utcnow()
    patients = []
    for p in guardian.patients:
        in_trial  = bool(p.free_until and now < p.free_until)
        days_left = max(0, (p.free_until - now).days) if in_trial else 0
        patients.append({
            "id":           p.id,
            "name":         p.name,
            "subscription": p.subscription,
            "in_trial":     in_trial,
            "trial_days_left": days_left,
            "bp_enabled":   p.bp_subscription,
        })

    return {
        "guardian_id": guardian.id,
        "name":        guardian.name,
        "email":       guardian.email,
        "subscription_tier": guardian.subscription_tier,
        "subscription_status": guardian.subscription_status,
        "trial_ends_at": guardian.trial_ends_at.isoformat() if guardian.trial_ends_at else None,
        "patients":    patients,
    }


@app.post("/patients", response_model=dict)
def create_patient(p: PatientCreate, db: Session = Depends(get_db)):
    patient = Patient(
        name                    = p.name,
        birth_date              = p.birth_date,
        guardian_id             = p.guardian_id,
        subscription            = p.subscription or "basic",
        free_until              = p.free_until,
        national_health_id      = p.national_health_id,
        national_health_id_type = p.national_health_id_type,
        country                 = p.country or "GR",
    )
    db.add(patient)
    db.commit()
    return {"id": patient.id}


@app.post("/patients/{patient_id}/fcm-token")
def register_fcm(patient_id: int, body: dict, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient or not patient.guardian:
        raise HTTPException(404)
    patient.guardian.fcm_token = body.get("token")
    db.commit()
    return {"status": "ok"}


# ──── STRIPE SUBSCRIPTION ────────────────────────────────────────────────────────

@app.post("/subscribe/checkout")
def create_checkout_session(req: StripeCheckoutRequest, body: dict, db: Session = Depends(get_db)):
    """
    Create a Stripe Checkout session. Expects: {"guardian_id": int}
    Returns: {"checkout_url": "https://checkout.stripe.com/..."}
    """
    if not STRIPE_API_KEY:
        raise HTTPException(500, "Stripe not configured")
    
    guardian_id = body.get("guardian_id")
    if not guardian_id:
        raise HTTPException(400, "guardian_id required")
    
    guardian = db.query(Guardian).filter(Guardian.id == guardian_id).first()
    if not guardian:
        raise HTTPException(404, "Guardian not found")
    
    if req.tier not in STRIPE_PRODUCTS:
        raise HTTPException(400, f"Invalid tier. Allowed: {list(STRIPE_PRODUCTS.keys())}")
    
    try:
        # Create or get Stripe customer
        if not guardian.stripe_customer_id:
            customer = stripe.Customer.create(
                email=guardian.email,
                name=guardian.name,
            )
            guardian.stripe_customer_id = customer.id
            db.commit()
        
        # Create checkout session
        session = stripe.checkout.Session.create(
            customer=guardian.stripe_customer_id,
            payment_method_types=["card"],
            line_items=[
                {"price": STRIPE_PRODUCTS[req.tier], "quantity": 1}
            ],
            mode="subscription",
            success_url=req.success_url,
            cancel_url=req.cancel_url,
        )
        return {"checkout_url": session.url}
    except stripe.error.StripeError as e:
        raise HTTPException(400, f"Stripe error: {e.message}")


@app.post("/subscribe/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """
    Stripe webhook handler for subscription events.
    """
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(500, "Webhook secret not configured")
    
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        raise HTTPException(400, "Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(400, "Invalid signature")
    
    # Handle subscription events
    if event["type"] == "customer.subscription.updated":
        sub = event["data"]["object"]
        customer_id = sub["customer"]
        guardian = db.query(Guardian).filter(
            Guardian.stripe_customer_id == customer_id
        ).first()
        if guardian:
            guardian.stripe_subscription_id = sub["id"]
            guardian.subscription_status = "active" if sub["status"] == "active" else "cancelled"
            if sub.get("trial_end"):
                guardian.trial_ends_at = datetime.fromtimestamp(sub["trial_end"])
            db.commit()
    
    elif event["type"] == "customer.subscription.deleted":
        sub = event["data"]["object"]
        customer_id = sub["customer"]
        guardian = db.query(Guardian).filter(
            Guardian.stripe_customer_id == customer_id
        ).first()
        if guardian:
            guardian.subscription_status = "cancelled"
            guardian.stripe_subscription_id = None
            db.commit()
    
    return {"status": "ok"}


@app.get("/guardian/{guardian_id}/subscription")
def get_subscription(guardian_id: int, db: Session = Depends(get_db)):
    guardian = db.query(Guardian).filter(Guardian.id == guardian_id).first()
    if not guardian:
        raise HTTPException(404, "Guardian not found")
    
    return {
        "guardian_id": guardian_id,
        "subscription_tier": guardian.subscription_tier,
        "subscription_status": guardian.subscription_status,
        "trial_ends_at": guardian.trial_ends_at.isoformat() if guardian.trial_ends_at else None,
        "subscription_renews_at": guardian.subscription_renews_at.isoformat() if guardian.subscription_renews_at else None,
    }


@app.get("/health")
def health():
    return {"status": "ok", "version": "2.1"}
