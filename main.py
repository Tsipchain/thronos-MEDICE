from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
import hashlib
import secrets
import os
import logging
import json
import stripe
from pydantic import BaseModel, field_validator

from models import (
    Base, Guardian, Patient, TempReading, FeverEvent, Device,
    TempReadingIn, PatientCreate, GuardianCreate, GuardianLogin,
    FeverEventOut, SimulateIn, HEALTH_ID_TYPES,
    StripeCheckoutRequest,
)
from validators import validate_health_id
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
from reseller_api import router as reseller_router
from sqlalchemy import create_engine
from sqlalchemy import text
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
logger = logging.getLogger(__name__)


def _run_sqlite_startup_migrations() -> None:
    if not DB_URL.startswith("sqlite"):
        return

    required_columns: dict[str, list[tuple[str, str]]] = {
        "guardians": [
            ("password_hash", "TEXT"),
            ("fcm_token", "TEXT"),
            ("active_patient_id", "INTEGER"),
            ("subscription_tier", "TEXT DEFAULT 'free'"),
            ("subscription_status", "TEXT DEFAULT 'active'"),
            ("stripe_customer_id", "TEXT"),
            ("stripe_subscription_id", "TEXT"),
            ("trial_ends_at", "DATETIME"),
            ("subscription_renews_at", "DATETIME"),
            ("created_at", "DATETIME"),
        ],
        "patients": [
            ("subscription", "TEXT DEFAULT 'basic'"),
            ("free_until", "DATETIME"),
            ("national_health_id", "TEXT"),
            ("national_health_id_type", "TEXT"),
            ("country", "TEXT DEFAULT 'GR'"),
            ("last_fever_check_time", "DATETIME"),
            ("last_fever_rate", "FLOAT"),
        ],
        "fever_events": [
            ("min_spo2", "FLOAT"),
            ("avg_bpm", "FLOAT"),
            ("antipyretic_given", "BOOLEAN DEFAULT 0"),
            ("rapid_rise", "BOOLEAN DEFAULT 0"),
            ("blockchain_tx", "TEXT"),
        ],
        "temp_readings": [
            ("device_id", "TEXT"),
            ("spo2", "FLOAT"),
            ("bpm", "INTEGER"),
            ("systolic", "INTEGER"),
            ("diastolic", "INTEGER"),
            ("spo2_valid", "BOOLEAN DEFAULT 0"),
            ("bpm_valid", "BOOLEAN DEFAULT 0"),
            ("bp_valid", "BOOLEAN DEFAULT 0"),
            ("fever_rate", "FLOAT"),
            ("timestamp", "DATETIME"),
        ],
        "devices": [
            ("manufacturer", "TEXT"),
            ("model", "TEXT"),
            ("ble_profile", "TEXT"),
            ("service_uuids_json", "TEXT"),
            ("last_raw_payload", "TEXT"),
            ("temperature_unit", "TEXT"),
            ("last_sync_at", "DATETIME"),
            ("signal_strength", "INTEGER"),
        ],
        "hospitals": [
            ("name", "TEXT"),
            ("country", "TEXT"),
            ("contact_email", "TEXT"),
            ("contact_phone", "TEXT"),
            ("api_key", "TEXT"),
            ("alert_webhook_url", "TEXT"),
            ("alert_webhook_secret", "TEXT"),
            ("alert_spo2_threshold", "INTEGER DEFAULT 90"),
            ("alert_hr_min", "INTEGER DEFAULT 60"),
            ("alert_hr_max", "INTEGER DEFAULT 130"),
            ("is_active", "BOOLEAN DEFAULT 1"),
            ("created_at", "DATETIME"),
        ],
        "hospital_access": [
            ("hospital_id", "INTEGER"),
            ("granted_at", "DATETIME"),
        ],
    }

    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS hospitals (
                id INTEGER PRIMARY KEY,
                name TEXT,
                country TEXT,
                contact_email TEXT UNIQUE,
                contact_phone TEXT,
                api_key TEXT UNIQUE,
                alert_webhook_url TEXT,
                alert_webhook_secret TEXT,
                alert_spo2_threshold INTEGER DEFAULT 90,
                alert_hr_min INTEGER DEFAULT 60,
                alert_hr_max INTEGER DEFAULT 130,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME
            )
        """))
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS devices (
                id INTEGER PRIMARY KEY,
                patient_id INTEGER,
                device_id TEXT UNIQUE,
                device_type TEXT,
                firmware_version TEXT,
                connection_mode TEXT,
                last_seen_at DATETIME,
                battery_level INTEGER,
                manufacturer TEXT,
                model TEXT,
                ble_profile TEXT,
                service_uuids_json TEXT,
                last_raw_payload TEXT,
                temperature_unit TEXT,
                last_sync_at DATETIME,
                signal_strength INTEGER,
                created_at DATETIME
            )
        """))
        for table_name, columns in required_columns.items():
            existing = conn.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
            existing_names = {row[1] for row in existing}
            for col_name, col_def in columns:
                if col_name not in existing_names:
                    conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_def}"))
                    logger.info("SQLite startup migration added column %s.%s", table_name, col_name)


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
    _run_sqlite_startup_migrations()
    yield

app = FastAPI(title="ThronomedICE Vital Signs API", version="2.1", lifespan=lifespan)

def _parse_cors_origins() -> list[str]:
    defaults = [
        "https://medice.thronoschain.org",
        "https://www.medice.thronoschain.org",
        "https://thronoschain.org",
        "https://www.thronoschain.org",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8080",
    ]
    raw = os.getenv("CORS_ORIGINS", "")
    if not raw.strip():
        return defaults
    parsed = [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]
    return list(dict.fromkeys(parsed + defaults))


_CORS_ORIGINS = _parse_cors_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
logger.info("CORS configured with %d origins: %s", len(_CORS_ORIGINS), _CORS_ORIGINS)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    def _safe_validation_errors() -> list[dict]:
        safe_errors = []
        for err in exc.errors():
            item = dict(err)
            ctx = item.get("ctx")
            if isinstance(ctx, dict):
                item["ctx"] = {k: str(v) for k, v in ctx.items()}
            safe_errors.append(item)
        return safe_errors

    return JSONResponse(
        status_code=422,
        content={
            "detail": _safe_validation_errors(),
            "message": "Validation failed",
        },
    )


app.include_router(hospital_router)
app.include_router(thronos_router)
app.include_router(reseller_router)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "ThronomedICE API"}
