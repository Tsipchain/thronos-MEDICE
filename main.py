from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from contextlib import asynccontextmanager
from datetime import datetime
import os

from models import (
    Base, Guardian, Patient, TempReading, FeverEvent,
    TempReadingIn, PatientCreate, GuardianCreate, FeverEventOut,
    SimulateIn,
)
from local_analyzer import LocalAnalyzer
from notifications import (
    send_fever_alert, send_high_fever_alert,
    send_antipyretic_reminder, send_fever_ended,
    send_spo2_alert, send_hr_alert, send_bp_alert,
)
from blockchain import record_fever_start, record_fever_end
from hospital_api import router as hospital_router
from thronos_integration import router as thronos_router
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# SQLite on the Railway volume — no external DB needed
DB_URL = os.getenv("DATABASE_URL", "sqlite:////medice/medice.db")

_connect_args = {"check_same_thread": False} if DB_URL.startswith("sqlite") else {}
engine       = create_engine(DB_URL, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine)

analyzer = LocalAnalyzer()


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs("/medice", exist_ok=True)
    Base.metadata.create_all(engine)
    yield

app = FastAPI(title="ThronomedICE Vital Signs API", version="2.0", lifespan=lifespan)

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


async def _process_vitals(
    patient_id: str,
    reading: TempReadingIn,
    ts: datetime,
    fcm_token: str | None,
    db: Session,
    patient,
    save_to_db: bool = True,
) -> dict:
    """Shared logic for /readings and /simulate."""

    if save_to_db and patient:
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
            timestamp   = ts,
        ))
        db.commit()

    t_result = await analyzer.analyze_temp(patient_id, reading.temperature, ts)
    v_result = await analyzer.analyze_vitals(
        patient_id,
        reading.spo2,      reading.spo2_valid  or False,
        reading.bpm,       reading.bpm_valid   or False,
        reading.systolic,  reading.diastolic,
        reading.bp_valid  or False,
    )

    if fcm_token:
        if t_result["send_fever_alert"]:
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
            event = FeverEvent(patient_id=patient.id, start_time=ts, peak_temp=reading.temperature)
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
    """Test vitals analysis without a registered patient or physical device."""
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
    guardian = Guardian(name=g.name, email=g.email)
    db.add(guardian)
    db.commit()
    return {"id": guardian.id}


@app.post("/patients", response_model=dict)
def create_patient(p: PatientCreate, db: Session = Depends(get_db)):
    patient = Patient(name=p.name, birth_date=p.birth_date, guardian_id=p.guardian_id)
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


@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0"}
