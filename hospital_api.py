from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Optional
import os
import httpx

from models import Base, Patient, FeverEvent, HospitalAccess, TempReading, FeverEventOut

router = APIRouter(prefix="/hospital", tags=["hospital"])

HOSPITAL_API_KEY = os.getenv("HOSPITAL_API_KEY", "")

HEALTH_ID_TYPES = {
    "amka": {"country": "GR", "label": "Αριθμός Μητρώου Ασθενούς (ΑΜΚΑ)"},
    "kvnr": {"country": "DE", "label": "Krankenversichertennummer (KVNR)"},
    "svnr": {"country": "AT", "label": "Sozialversicherungsnummer (SVNR)"},
    "snils": {"country": "RU", "label": "СНИЛС (SNILS)"},
    "nhs": {"country": "GB", "label": "NHS Number"},
    "nir": {"country": "FR", "label": "Numéro d'Inscription au Répertoire (NIR)"},
    "bsn": {"country": "NL", "label": "Burgerservicenummer (BSN)"},
    "phn": {"country": "CH", "label": "Personenversicherungsnummer"},
    "ssn": {"country": "SE", "label": "Personnummer"},
}


def _verify_key(x_hospital_key: str = Header(...)):
    if not HOSPITAL_API_KEY or x_hospital_key != HOSPITAL_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid hospital API key")
    return x_hospital_key


def get_db():
    from main import SessionLocal
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _has_access(patient_id: str, hospital_id: str, db: Session) -> bool:
    return db.query(HospitalAccess).filter(
        HospitalAccess.patient_id  == patient_id,
        HospitalAccess.hospital_id == hospital_id,
        HospitalAccess.is_active   == True,
    ).first() is not None


@router.post("/patients/{patient_id}/access")
def grant_access(
    patient_id:            str,
    hospital_id:           str,
    hospital_name:         str,
    guardian_confirmation: bool,
    emr_push_url:          Optional[str] = None,
    db: Session = Depends(get_db),
    _: str = Depends(_verify_key),
):
    if not guardian_confirmation:
        raise HTTPException(400, "Guardian must confirm access")
    if not db.query(Patient).filter(Patient.id == patient_id).first():
        raise HTTPException(404, "Patient not found")
    row = db.query(HospitalAccess).filter(
        HospitalAccess.patient_id  == patient_id,
        HospitalAccess.hospital_id == hospital_id,
    ).first()
    if row:
        row.is_active  = True
        row.revoked_at = None
        if emr_push_url:
            row.emr_push_url = emr_push_url
    else:
        db.add(HospitalAccess(
            patient_id=patient_id,
            hospital_id=hospital_id,
            hospital_name=hospital_name,
            emr_push_url=emr_push_url
        ))
    db.commit()
    return {"status": "access_granted", "patient_id": patient_id, "hospital_id": hospital_id}


@router.delete("/patients/{patient_id}/access")
def revoke_access(
    patient_id:  str,
    hospital_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(_verify_key),
):
    row = db.query(HospitalAccess).filter(
        HospitalAccess.patient_id  == patient_id,
        HospitalAccess.hospital_id == hospital_id,
        HospitalAccess.is_active   == True,
    ).first()
    if not row:
        raise HTTPException(404, "No active access found")
    row.is_active  = False
    row.revoked_at = datetime.utcnow()
    db.commit()
    return {"status": "access_revoked"}


@router.get("/patients/{patient_id}/fever-history")
def fever_history(
    patient_id:  str,
    hospital_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(_verify_key),
):
    if not _has_access(patient_id, hospital_id, db):
        raise HTTPException(403, "No access to this patient")
    events = (
        db.query(FeverEvent)
        .filter(FeverEvent.patient_id == patient_id)
        .order_by(FeverEvent.start_time.desc())
        .all()
    )
    return {
        "patient_id":        patient_id,
        "total_fever_events": len(events),
        "events":            [FeverEventOut.model_validate(e) for e in events],
    }


@router.get("/patients/{patient_id}/recent-readings")
def recent_readings(
    patient_id:  str,
    hospital_id: str,
    hours:       int = 24,
    db: Session = Depends(get_db),
    _: str = Depends(_verify_key),
):
    if not _has_access(patient_id, hospital_id, db):
        raise HTTPException(403, "No access to this patient")
    cutoff   = datetime.utcnow() - timedelta(hours=hours)
    readings = (
        db.query(TempReading)
        .filter(TempReading.patient_id == patient_id, TempReading.timestamp >= cutoff)
        .order_by(TempReading.timestamp.desc())
        .all()
    )
    return {
        "patient_id":     patient_id,
        "hours":          hours,
        "readings_count": len(readings),
        "readings": [
            {
                "temperature": r.temperature,
                "spo2":        r.spo2,
                "bpm":         r.bpm,
                "timestamp":   r.timestamp.isoformat(),
                "blockchain_tx": r.blockchain_tx if hasattr(r, "blockchain_tx") else None,
            }
            for r in readings
        ],
    }


@router.get("/health-id-types", response_model=dict)
def list_health_id_types(_: str = Depends(_verify_key)):
    """List all supported national health ID types."""
    return {"health_id_types": HEALTH_ID_TYPES}


@router.get("/patients/lookup")
def lookup_patient(
    health_id: str,
    health_id_type: str,
    hospital_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(_verify_key),
):
    """Lookup patient by national health ID."""
    if health_id_type not in HEALTH_ID_TYPES:
        raise HTTPException(400, "Invalid health ID type")

    patient = db.query(Patient).filter(
        Patient.national_health_id == health_id,
        Patient.national_health_id_type == health_id_type
    ).first()
    if not patient:
        raise HTTPException(404, "Patient not found")

    access = db.query(HospitalAccess).filter(
        HospitalAccess.patient_id == patient.id,
        HospitalAccess.hospital_id == hospital_id,
        HospitalAccess.is_active == True
    ).first()
    if not access:
        raise HTTPException(403, "No access to this patient")

    latest_reading = (
        db.query(TempReading)
        .filter(TempReading.patient_id == patient.id)
        .order_by(TempReading.timestamp.desc())
        .first()
    )

    return {
        "id": patient.id,
        "name": patient.name,
        "birth_date": patient.birth_date,
        "national_health_id": patient.national_health_id,
        "health_id_type": patient.national_health_id_type,
        "country": patient.country,
        "latest_vitals": {
            "temperature": latest_reading.temperature if latest_reading else None,
            "spo2": latest_reading.spo2 if latest_reading else None,
            "bpm": latest_reading.bpm if latest_reading else None,
            "timestamp": latest_reading.timestamp.isoformat() if latest_reading else None,
        } if latest_reading else None
    }


@router.post("/patients/{patient_id}/push-to-emr")
async def push_to_emr(
    patient_id: int,
    hospital_id: str,
    db: Session = Depends(get_db),
    _: str = Depends(_verify_key),
):
    """Push patient vitals to hospital EMR endpoint."""
    if not _has_access(str(patient_id), hospital_id, db):
        raise HTTPException(403, "No access to this patient")

    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(404, "Patient not found")

    access = db.query(HospitalAccess).filter(
        HospitalAccess.patient_id == patient_id,
        HospitalAccess.hospital_id == hospital_id
    ).first()
    if not access or not access.emr_push_url:
        raise HTTPException(400, "No EMR endpoint configured for this hospital")

    latest_reading = (
        db.query(TempReading)
        .filter(TempReading.patient_id == patient_id)
        .order_by(TempReading.timestamp.desc())
        .first()
    )

    recent_events = (
        db.query(FeverEvent)
        .filter(FeverEvent.patient_id == patient_id)
        .order_by(FeverEvent.start_time.desc())
        .limit(5)
        .all()
    )

    payload = {
        "source": "thronos-medice",
        "patient_id": patient_id,
        "national_health_id": patient.national_health_id,
        "health_id_type": patient.national_health_id_type,
        "name": patient.name,
        "birth_date": patient.birth_date.isoformat() if patient.birth_date else None,
        "country": patient.country,
        "pushed_at": datetime.utcnow().isoformat(),
        "latest_vitals": {
            "temperature": latest_reading.temperature if latest_reading else None,
            "spo2": latest_reading.spo2 if latest_reading else None,
            "bpm": latest_reading.bpm if latest_reading else None,
            "fever_rate": latest_reading.fever_rate if latest_reading else None,
            "timestamp": latest_reading.timestamp.isoformat() if latest_reading else None,
        } if latest_reading else None,
        "recent_fever_events": [
            {
                "start_time": e.start_time.isoformat(),
                "end_time": e.end_time.isoformat() if e.end_time else None,
                "peak_temp": e.peak_temp,
                "rapid_rise": e.rapid_rise,
            }
            for e in recent_events
        ]
    }

    try:
        async with httpx.AsyncClient() as client:
            await client.post(access.emr_push_url, json=payload, timeout=10)
        return {"status": "ok", "pushed": True}
    except Exception as e:
        return {"status": "error", "message": str(e), "pushed": False}
