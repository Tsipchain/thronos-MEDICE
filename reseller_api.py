"""
Reseller & Device Activation API
---------------------------------
Allows pharmacies and B2B distributors to:
  - Register as resellers
  - Generate batches of device activation codes (for inside-box QR/stickers)
  - View sales stats (activations, commissions earned)

Customers use:
  - POST /activate  (no auth) to redeem their device code and start free trial
"""
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import secrets
import string

from models import (
    Guardian, Patient, Reseller, DeviceActivationCode,
    ResellerCreate, ActivateDeviceRequest, GenerateCodesRequest,
)

router = APIRouter(prefix="/reseller", tags=["reseller"])

_ADMIN_KEY = __import__("os").getenv("ADMIN_API_KEY", "")


def get_db():
    from main import SessionLocal
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _admin_only(x_admin_key: str = Header(...)):
    if not _ADMIN_KEY or x_admin_key != _ADMIN_KEY:
        raise HTTPException(403, "Admin access required")


def _reseller_auth(x_reseller_key: str = Header(...), db: Session = Depends(get_db)):
    reseller = db.query(Reseller).filter(
        Reseller.api_key == x_reseller_key,
        Reseller.is_active == True,
    ).first()
    if not reseller:
        raise HTTPException(403, "Invalid or inactive reseller key")
    return reseller


def _gen_code() -> str:
    """Generate a human-friendly activation code: THR-XXXX-YYYY-ZZZZ"""
    chars = string.ascii_uppercase + string.digits
    parts = ["".join(secrets.choice(chars) for _ in range(4)) for _ in range(3)]
    return "THR-" + "-".join(parts)


# ── Admin: register a new reseller ──────────────────────────────────────────

@router.post("/register", response_model=dict)
def register_reseller(
    body: ResellerCreate,
    db: Session = Depends(get_db),
    _: str = Depends(_admin_only),
):
    """Admin-only: register a pharmacy or distributor as a reseller."""
    existing = db.query(Reseller).filter(Reseller.contact_email == body.contact_email).first()
    if existing:
        raise HTTPException(409, "Email already registered")

    api_key = "RSL-" + secrets.token_urlsafe(32)
    reseller = Reseller(
        name=body.name,
        contact_email=body.contact_email,
        contact_phone=body.contact_phone,
        address=body.address,
        country=body.country,
        reseller_type=body.reseller_type,
        commission_pct=body.commission_pct,
        api_key=api_key,
    )
    db.add(reseller)
    db.commit()

    return {
        "id": reseller.id,
        "name": reseller.name,
        "api_key": api_key,
        "commission_pct": reseller.commission_pct,
        "message": "Reseller registered. Share the api_key securely with the reseller.",
    }


# ── Admin: list all resellers ────────────────────────────────────────────────

@router.get("/list", response_model=list)
def list_resellers(db: Session = Depends(get_db), _: str = Depends(_admin_only)):
    resellers = db.query(Reseller).all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "contact_email": r.contact_email,
            "country": r.country,
            "reseller_type": r.reseller_type,
            "commission_pct": r.commission_pct,
            "is_active": r.is_active,
            "total_codes": len(r.devices),
            "activated_codes": sum(1 for d in r.devices if d.is_used),
        }
        for r in resellers
    ]


# ── Reseller: generate a batch of activation codes ───────────────────────────

@router.post("/codes/generate", response_model=dict)
def generate_codes(
    body: GenerateCodesRequest,
    db: Session = Depends(get_db),
    reseller: Reseller = Depends(_reseller_auth),
):
    """Generate a batch of unique activation codes for a reseller."""
    if body.reseller_id != reseller.id:
        raise HTTPException(403, "Can only generate codes for your own reseller account")
    if body.quantity < 1 or body.quantity > 10_000:
        raise HTTPException(400, "Quantity must be between 1 and 10,000")

    batch_id = body.batch_id or f"BATCH-{datetime.utcnow().strftime('%Y%m%d')}-{secrets.token_hex(4).upper()}"
    generated = []

    for _ in range(body.quantity):
        # Retry on (extremely rare) collision
        for _attempt in range(10):
            code = _gen_code()
            if not db.query(DeviceActivationCode).filter(DeviceActivationCode.code == code).first():
                break

        record = DeviceActivationCode(
            code=code,
            reseller_id=reseller.id,
            batch_id=batch_id,
            free_months=body.free_months,
            device_tier=body.device_tier,
        )
        db.add(record)
        generated.append(code)

    db.commit()

    return {
        "batch_id": batch_id,
        "quantity": len(generated),
        "codes": generated,
        "free_months": body.free_months,
        "device_tier": body.device_tier,
        "message": f"Print these codes and insert them in device boxes. Each code activates {body.free_months} free months.",
    }


# ── Reseller: view my stats ──────────────────────────────────────────────────

@router.get("/stats", response_model=dict)
def reseller_stats(
    db: Session = Depends(get_db),
    reseller: Reseller = Depends(_reseller_auth),
):
    """Reseller portal: see activations and estimated commissions."""
    codes = db.query(DeviceActivationCode).filter(
        DeviceActivationCode.reseller_id == reseller.id
    ).all()

    total     = len(codes)
    activated = [c for c in codes if c.is_used]
    pending   = total - len(activated)

    # Monthly subscription revenue per tier (EUR)
    tier_price = {"basic": 10.0, "premium": 15.0, "family": 25.0}

    # Estimate: active subscriptions after trial * avg tier price * commission_pct
    active_subs = len(activated)  # simplification: 1 activation = 1 active sub
    avg_price   = sum(tier_price.get(c.device_tier, 10.0) for c in activated) / max(active_subs, 1)
    monthly_rev = active_subs * avg_price
    commission  = monthly_rev * (reseller.commission_pct / 100)

    # Recent activations
    recent = sorted(activated, key=lambda c: c.used_at or datetime.min, reverse=True)[:10]

    return {
        "reseller_name":     reseller.name,
        "reseller_type":     reseller.reseller_type,
        "commission_pct":    reseller.commission_pct,
        "total_codes":       total,
        "activated_codes":   len(activated),
        "pending_codes":     pending,
        "estimated_active_subscribers": active_subs,
        "estimated_monthly_commission_eur": round(commission, 2),
        "recent_activations": [
            {
                "code":       c.code,
                "used_at":    c.used_at.isoformat() if c.used_at else None,
                "device_tier": c.device_tier,
            }
            for c in recent
        ],
    }


# ── Public: activate a device code (no auth required) ────────────────────────

@router.post("/activate", response_model=dict, tags=["reseller", "public"])
def activate_device(
    body: ActivateDeviceRequest,
    db: Session = Depends(get_db),
):
    """
    Called by the guardian app when they scan the QR / enter the code from the box.
    Grants free trial months and links the device to the guardian's account.
    No authentication required — code itself is the proof of purchase.
    """
    code_record = db.query(DeviceActivationCode).filter(
        DeviceActivationCode.code == body.code.upper().strip()
    ).first()

    if not code_record:
        raise HTTPException(404, "Activation code not found. Check the code and try again.")
    if code_record.is_used:
        raise HTTPException(409, "This code has already been activated.")
    if not code_record.reseller.is_active:
        raise HTTPException(403, "This code is from an inactive reseller. Contact support.")

    guardian = db.query(Guardian).filter(Guardian.id == body.guardian_id).first()
    if not guardian:
        raise HTTPException(404, "Guardian account not found.")

    # Calculate free trial period
    now         = datetime.utcnow()
    trial_end   = now + timedelta(days=30 * code_record.free_months)

    # Update guardian subscription
    guardian.subscription_tier   = code_record.device_tier
    guardian.subscription_status = "trial"
    guardian.trial_ends_at       = trial_end

    # Mark code as used
    code_record.is_used     = True
    code_record.used_at     = now
    code_record.guardian_id = body.guardian_id

    # Apply to all existing patients of this guardian
    for patient in guardian.patients:
        patient.free_until = trial_end

    db.commit()

    reseller = code_record.reseller
    return {
        "status":        "activated",
        "trial_months":  code_record.free_months,
        "trial_ends_at": trial_end.isoformat(),
        "tier":          code_record.device_tier,
        "reseller_name": reseller.name,
        "message":       f"Συγχαρητήρια! Έχετε {code_record.free_months} μήνες δωρεάν ({code_record.device_tier} plan). Η δωρεάν περίοδος λήγει {trial_end.strftime('%d/%m/%Y')}.",
    }


# ── Public: look up a code (validity check before activation) ────────────────

@router.get("/code/{code}", response_model=dict, tags=["reseller", "public"])
def check_code(code: str, db: Session = Depends(get_db)):
    """Check if a code is valid and unused before activating."""
    record = db.query(DeviceActivationCode).filter(
        DeviceActivationCode.code == code.upper().strip()
    ).first()
    if not record:
        raise HTTPException(404, "Code not found")
    return {
        "code":       record.code,
        "is_valid":   not record.is_used and record.reseller.is_active,
        "is_used":    record.is_used,
        "free_months": record.free_months,
        "device_tier": record.device_tier,
        "reseller":   record.reseller.name,
    }
