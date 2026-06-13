from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional
import os
import httpx
import secrets
import hashlib

from models import Base, Patient, FeverEvent, HospitalAccess, TempReading, FeverEventOut, HEALTH_ID_TYPES, Hospital
from validators import validate_health_id

router = APIRouter(prefix="/hospital", tags=["hospital"])

HOSPITAL_API_KEY = os.getenv("HOSPITAL_API_KEY", "")


def get_db():
    from main import SessionLocal
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _verify_hospital_key(x_hospital_key: str = Header(...), db: Session = Depends(get_db)):
    """Verify hospital API key from header."""
    if not x_hospital_key:
        raise HTTPException(status_code=403, detail="Missing X-Hospital-Key header")
    hospital = db.query(Hospital).filter(Hospital.api_key == x_hospital_key, Hospital.is_active == True).first()
    if not hospital:
        raise HTTPException(status_code=403, detail="Invalid or inactive hospital API key")
    return hospital


def _has_access(patient_id: int, hospital_id: int, db: Session) -> bool:
    return db.query(HospitalAccess).filter(
        HospitalAccess.patient_id  == patient_id,
        HospitalAccess.hospital_id == hospital_id,
        HospitalAccess.is_active   == True,
    ).first() is not None


# ────── HOSPITAL REGISTRATION & MANAGEMENT ──────────────────────────────────

@router.post("/register", response_model=dict)
def register_hospital(
    name: str,
    country: str,
    contact_email: str,
    contact_phone: Optional[str] = None,
    alert_webhook_url: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Register a new hospital in the Thronos network.
    Hospital receives a unique API key for authentication.
    """
    # Check if hospital already registered
    existing = db.query(Hospital).filter(Hospital.contact_email == contact_email).first()
    if existing:
        raise HTTPException(400, "Hospital with this email already registered")

    # Generate unique API key
    api_key = secrets.token_urlsafe(32)

    hospital = Hospital(
        name=name,
        country=country,
        contact_email=contact_email,
        contact_phone=contact_phone,
        api_key=api_key,
        alert_webhook_url=alert_webhook_url,
    )
    db.add(hospital)
    db.commit()

    return {
        "id": hospital.id,
        "api_key": api_key,
        "message": "Hospital registered. Use this API key in X-Hospital-Key header for all requests.",
    }


@router.get("/{hospital_id}/dashboard", response_model=dict)
def hospital_dashboard(
    hospital_id: int,
    hospital: Hospital = Depends(_verify_hospital_key),
    db: Session = Depends(get_db),
):
    """Get hospital dashboard with summary of active patients."""
    accesses = db.query(HospitalAccess).filter(
        HospitalAccess.hospital_id == hospital.id,
        HospitalAccess.is_active == True,
    ).all()

    total_patients = len(accesses)
    recent_readings = db.query(TempReading).filter(
        TempReading.patient_id.in_([a.patient_id for a in accesses]),
        TempReading.timestamp >= datetime.utcnow() - timedelta(hours=24),
    ).count()

    active_fevers = db.query(FeverEvent).filter(
        FeverEvent.patient_id.in_([a.patient_id for a in accesses]),
        FeverEvent.end_time == None,
    ).count()

    return {
        "hospital_id": hospital.id,
        "hospital_name": hospital.name,
        "total_patients_with_access": total_patients,
        "readings_last_24h": recent_readings,
        "active_fever_events": active_fevers,
    }


# ────── PATIENT ACCESS ──────────────────────────────────────────────────────

@router.post("/patients/{patient_id}/access")
def grant_access(
    patient_id:            int,
    guardian_confirmation: bool,
    emr_push_url:          Optional[str] = None,
    hospital: Hospital = Depends(_verify_hospital_key),
    db: Session = Depends(get_db),
):
    """Grant hospital access to a patient (requires guardian confirmation)."""
    if not guardian_confirmation:
        raise HTTPException(400, "Guardian must confirm access")

    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(404, "Patient not found")

    # Check if access already exists
    row = db.query(HospitalAccess).filter(
        HospitalAccess.patient_id == patient_id,
        HospitalAccess.hospital_id == hospital.id,
    ).first()

    if row:
        row.is_active = True
        row.revoked_at = None
        row.emr_push_url = emr_push_url
    else:
        db.add(HospitalAccess(
            patient_id = patient_id,
            hospital_id = hospital.id,
            emr_push_url = emr_push_url,
        ))

    db.commit()
    return {
        "status": "access_granted",
        "patient_id": patient_id,
        "hospital_id": hospital.id,
        "hospital_name": hospital.name,
    }


@router.delete("/patients/{patient_id}/access")
def revoke_access(
    patient_id: int,
    hospital: Hospital = Depends(_verify_hospital_key),
    db: Session = Depends(get_db),
):
    """Revoke hospital access to a patient."""
    row = db.query(HospitalAccess).filter(
        HospitalAccess.patient_id == patient_id,
        HospitalAccess.hospital_id == hospital.id,
        HospitalAccess.is_active == True,
    ).first()
    if not row:
        raise HTTPException(404, "No active access found")
    row.is_active = False
    row.revoked_at = datetime.utcnow()
    db.commit()
    return {"status": "access_revoked", "patient_id": patient_id}


@router.get("/patients/lookup")
def lookup_by_health_id(
    health_id_type: str,
    health_id: str,
    hospital: Hospital = Depends(_verify_hospital_key),
    db: Session = Depends(get_db),
):
    """
    Look up a patient by their national health ID (e.g. AMKA, KVNR, NHS number).
    Returns patient summary if the hospital has been granted access.

    Supported types: amka (GR), kvnr (DE), svnr (AT), snils (RU),
                     nhs (UK), nir (FR), bsn (NL), phn (CA), ssn (US)
    """
    if health_id_type not in HEALTH_ID_TYPES:
        raise HTTPException(400, f"Unknown health_id_type. Supported: {list(HEALTH_ID_TYPES.keys())}")

    # Validate the format first
    is_valid, msg = validate_health_id(health_id_type, health_id)
    if not is_valid:
        raise HTTPException(400, f"Invalid {health_id_type}: {msg}")

    patient = db.query(Patient).filter(
        Patient.national_health_id_type == health_id_type,
        Patient.national_health_id      == health_id,
    ).first()

    if not patient:
        raise HTTPException(404, "No patient found with this health ID")

    if not _has_access(patient.id, hospital.id, db):
        raise HTTPException(403, "Hospital does not have access to this patient. "
                                 "Guardian must grant access first via POST /hospital/patients/{id}/access")

    last_reading = (
        db.query(TempReading)
        .filter(TempReading.patient_id == patient.id)
        .order_by(TempReading.timestamp.desc())
        .first()
    )
    total_fever_events = db.query(FeverEvent).filter(FeverEvent.patient_id == patient.id).count()

    return {
        "patient_id":          patient.id,
        "name":                patient.name,
        "birth_date":          patient.birth_date.isoformat() if patient.birth_date else None,
        "national_health_id":  patient.national_health_id,
        "health_id_type":      patient.national_health_id_type,
        "health_id_label":     HEALTH_ID_TYPES[health_id_type]["label"],
        "country":             patient.country,
        "total_fever_events":  total_fever_events,
        "last_reading": {
            "temperature": last_reading.temperature,
            "spo2":        last_reading.spo2,
            "bpm":         last_reading.bpm,
            "timestamp":   last_reading.timestamp.isoformat(),
        } if last_reading else None,
    }


@router.post("/patients/{patient_id}/push-to-emr")
async def push_to_emr(
    patient_id: int,
    hospital: Hospital = Depends(_verify_hospital_key),
    db: Session = Depends(get_db),
):
    """
    Push the patient's latest vitals and fever summary to the hospital's EMR endpoint.
    The hospital must have set emr_push_url when calling grant_access.
    Supports any hospital system worldwide (Greek AMKA registries, German ePA, UK NHS Spine, etc.)
    """
    if not _has_access(patient_id, hospital.id, db):
        raise HTTPException(403, "No access to this patient")

    row = db.query(HospitalAccess).filter(
        HospitalAccess.patient_id == patient_id,
        HospitalAccess.hospital_id == hospital.id,
        HospitalAccess.is_active == True,
    ).first()

    if not row or not row.emr_push_url:
        raise HTTPException(400, "No EMR push URL configured for this hospital. "
                                 "Set emr_push_url when calling grant_access.")

    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(404, "Patient not found")

    last_reading = (
        db.query(TempReading)
        .filter(TempReading.patient_id == patient.id)
        .order_by(TempReading.timestamp.desc())
        .first()
    )
    recent_fevers = (
        db.query(FeverEvent)
        .filter(FeverEvent.patient_id == patient.id)
        .order_by(FeverEvent.start_time.desc())
        .limit(5)
        .all()
    )

    payload = {
        "source":             "ThronomedICE",
        "patient_id":         patient.id,
        "national_health_id": patient.national_health_id,
        "health_id_type":     patient.national_health_id_type,
        "name":               patient.name,
        "birth_date":         patient.birth_date.isoformat() if patient.birth_date else None,
        "country":            patient.country,
        "pushed_at":          datetime.utcnow().isoformat(),
        "latest_vitals": {
            "temperature": last_reading.temperature,
            "spo2":        last_reading.spo2,
            "bpm":         last_reading.bpm,
            "systolic":    last_reading.systolic,
            "diastolic":   last_reading.diastolic,
            "timestamp":   last_reading.timestamp.isoformat(),
        } if last_reading else None,
        "recent_fever_events": [
            {
                "start_time":   e.start_time.isoformat(),
                "end_time":     e.end_time.isoformat() if e.end_time else None,
                "peak_temp":    e.peak_temp,
                "min_spo2":     e.min_spo2,
                "avg_bpm":      e.avg_bpm,
                "blockchain_tx": e.blockchain_tx,
            }
            for e in recent_fevers
        ],
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(row.emr_push_url, json=payload)
            resp.raise_for_status()
        return {"status": "pushed", "hospital_id": hospital.id, "emr_status": resp.status_code}
    except httpx.HTTPError as e:
        raise HTTPException(502, f"EMR push failed: {e}")


@router.get("/health-id-types")
def list_health_id_types():
    """Return all supported national health ID types with labels."""
    return {"types": [
        {"type": k, **v} for k, v in HEALTH_ID_TYPES.items()
    ]}
