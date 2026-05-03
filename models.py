from sqlalchemy import Column, Integer, Float, String, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

Base = declarative_base()

# Supported national health ID types
HEALTH_ID_TYPES = {
    "amka":  {"country": "GR", "label": "ΑΜΚΑ (Ελλάδα)",            "digits": 11},
    "kvnr":  {"country": "DE", "label": "Krankenversicherungsnr. (DE)", "digits": None},
    "svnr":  {"country": "AT", "label": "Sozialversicherungsnr. (AT)", "digits": 10},
    "snils": {"country": "RU", "label": "СНИЛС (Россия)",             "digits": 11},
    "nhs":   {"country": "GB", "label": "NHS Number (UK)",            "digits": 10},
    "nir":   {"country": "FR", "label": "NIR / INSEE (France)",       "digits": 15},
    "bsn":   {"country": "NL", "label": "BSN (Nederland)",            "digits": 9},
    "phn":   {"country": "CA", "label": "Provincial Health No. (CA)", "digits": None},
    "ssn":   {"country": "US", "label": "SSN (USA)",                  "digits": 9},
}


class Guardian(Base):
    __tablename__ = "guardians"
    id            = Column(Integer, primary_key=True)
    name          = Column(String)
    email         = Column(String, unique=True)
    password_hash = Column(String, nullable=True)
    fcm_token     = Column(String, nullable=True)
    # Subscription & billing
    subscription_tier    = Column(String, default="free")  # free | basic | premium | family
    subscription_status  = Column(String, default="active")  # active | cancelled | past_due | trial
    stripe_customer_id   = Column(String, nullable=True, unique=True)
    stripe_subscription_id = Column(String, nullable=True, unique=True)
    trial_ends_at        = Column(DateTime, nullable=True)
    subscription_renews_at = Column(DateTime, nullable=True)
    created_at           = Column(DateTime, default=datetime.utcnow)
    patients      = relationship("Patient", back_populates="guardian")


class Patient(Base):
    __tablename__ = "patients"
    id              = Column(Integer, primary_key=True)
    name            = Column(String)
    birth_date      = Column(DateTime, nullable=True)
    guardian_id     = Column(Integer, ForeignKey("guardians.id"))
    subscription    = Column(String, default="basic")   # "basic" | "bp"
    free_until      = Column(DateTime, nullable=True)
    # National health ID — used for hospital integration
    national_health_id      = Column(String, nullable=True)
    national_health_id_type = Column(String, nullable=True)  # amka | kvnr | svnr | snils | nhs | nir | bsn | phn | ssn
    country                 = Column(String, nullable=True, default="GR")
    # Fever velocity tracking (for rapid fever detection)
    last_fever_check_time = Column(DateTime, nullable=True)
    last_fever_rate       = Column(Float, nullable=True)  # °C per minute
    guardian        = relationship("Guardian", back_populates="patients")
    readings        = relationship("TempReading", back_populates="patient")
    fever_events    = relationship("FeverEvent", back_populates="patient")

    @property
    def bp_subscription(self) -> bool:
        if self.free_until and datetime.utcnow() < self.free_until:
            return True
        return self.subscription == "bp"


class TempReading(Base):
    __tablename__ = "temp_readings"
    id          = Column(Integer, primary_key=True)
    patient_id  = Column(Integer, ForeignKey("patients.id"))
    device_id   = Column(String)
    temperature = Column(Float)
    spo2        = Column(Float,   nullable=True)
    bpm         = Column(Integer, nullable=True)
    systolic    = Column(Integer, nullable=True)
    diastolic   = Column(Integer, nullable=True)
    spo2_valid  = Column(Boolean, default=False)
    bpm_valid   = Column(Boolean, default=False)
    bp_valid    = Column(Boolean, default=False)
    # Fever velocity (calculated, not stored during input)
    fever_rate  = Column(Float, nullable=True)  # °C per minute
    timestamp   = Column(DateTime, default=datetime.utcnow)
    patient     = relationship("Patient", back_populates="readings")


class FeverEvent(Base):
    __tablename__ = "fever_events"
    id                = Column(Integer, primary_key=True)
    patient_id        = Column(Integer, ForeignKey("patients.id"))
    start_time        = Column(DateTime)
    end_time          = Column(DateTime, nullable=True)
    peak_temp         = Column(Float)
    min_spo2          = Column(Float, nullable=True)
    avg_bpm           = Column(Float, nullable=True)
    antipyretic_given = Column(Boolean, default=False)
    rapid_rise        = Column(Boolean, default=False)  # Fever rose >0.8°C in 30 min
    blockchain_tx     = Column(String, nullable=True)
    patient           = relationship("Patient", back_populates="fever_events")


class HospitalAccess(Base):
    __tablename__ = "hospital_access"
    id               = Column(Integer, primary_key=True)
    patient_id       = Column(Integer, ForeignKey("patients.id"))
    hospital_id      = Column(String)
    hospital_name    = Column(String, nullable=True)
    hospital_address = Column(String, nullable=True)
    # Optional webhook: hospital provides their EMR endpoint for auto-push
    emr_push_url     = Column(String, nullable=True)
    is_active        = Column(Boolean, default=True)
    revoked_at       = Column(DateTime, nullable=True)


class Reseller(Base):
    """Pharmacy, medical supply store, or any B2B reseller of the device."""
    __tablename__ = "resellers"
    id                  = Column(Integer, primary_key=True)
    name                = Column(String)                    # "Φαρμακείο Παπαδόπουλος"
    contact_email       = Column(String, unique=True)
    contact_phone       = Column(String, nullable=True)
    address             = Column(String, nullable=True)
    country             = Column(String, default="GR")
    reseller_type       = Column(String, default="pharmacy") # pharmacy | medical_supply | online | distributor
    api_key             = Column(String, unique=True)        # secret key for reseller API calls
    commission_pct      = Column(Float, default=15.0)        # % of subscription revenue credited
    is_active           = Column(Boolean, default=True)
    created_at          = Column(DateTime, default=datetime.utcnow)
    devices             = relationship("DeviceActivationCode", back_populates="reseller")


class DeviceActivationCode(Base):
    """One-time activation code bundled inside each physical device box."""
    __tablename__ = "device_activation_codes"
    id              = Column(Integer, primary_key=True)
    code            = Column(String, unique=True)           # e.g. "THR-XXXX-YYYY-ZZZZ"
    reseller_id     = Column(Integer, ForeignKey("resellers.id"))
    guardian_id     = Column(Integer, ForeignKey("guardians.id"), nullable=True)
    batch_id        = Column(String, nullable=True)         # groups codes from same manufacturing run
    is_used         = Column(Boolean, default=False)
    used_at         = Column(DateTime, nullable=True)
    free_months     = Column(Integer, default=5)            # trial duration granted on activation
    device_tier     = Column(String, default="basic")       # default subscription tier after trial
    created_at      = Column(DateTime, default=datetime.utcnow)
    reseller        = relationship("Reseller", back_populates="devices")


# ──── Pydantic schemas ──────────────────────────────────────────────────────

class TempReadingIn(BaseModel):
    patient_id:  str
    device_id:   str
    temperature: float
    spo2:        Optional[float]    = None
    bpm:         Optional[int]      = None
    systolic:    Optional[int]      = None
    diastolic:   Optional[int]      = None
    spo2_valid:  Optional[bool]     = False
    bpm_valid:   Optional[bool]     = False
    bp_valid:    Optional[bool]     = False
    timestamp:   Optional[datetime] = None


class TempReadingOut(BaseModel):
    id:          int
    temperature: float
    spo2:        Optional[float]
    bpm:         Optional[int]
    systolic:    Optional[int]
    diastolic:   Optional[int]
    spo2_valid:  bool
    bpm_valid:   bool
    bp_valid:    bool
    fever_rate:  Optional[float]  # °C per minute
    timestamp:   datetime
    class Config: from_attributes = True


class SimulateIn(BaseModel):
    temperature: float
    spo2:        Optional[float] = None
    bpm:         Optional[int]   = None
    systolic:    Optional[int]   = None
    diastolic:   Optional[int]   = None


class PatientCreate(BaseModel):
    name:                    str
    birth_date:              Optional[datetime] = None
    guardian_id:             int
    subscription:            Optional[str]      = "basic"
    free_until:              Optional[datetime] = None
    national_health_id:      Optional[str]      = None
    national_health_id_type: Optional[str]      = None
    country:                 Optional[str]      = "GR"


class GuardianCreate(BaseModel):
    name:     str
    email:    str
    password: str


class GuardianLogin(BaseModel):
    email:    str
    password: str


class FeverEventOut(BaseModel):
    id:                int
    start_time:        datetime
    end_time:          Optional[datetime]
    peak_temp:         float
    min_spo2:          Optional[float]
    avg_bpm:           Optional[float]
    antipyretic_given: bool
    rapid_rise:        bool
    blockchain_tx:     Optional[str]
    class Config: from_attributes = True


class StripeCheckoutRequest(BaseModel):
    tier: str  # basic | premium | family
    success_url: str
    cancel_url: str


class StripeWebhookRequest(BaseModel):
    type: str
    data: dict


class ResellerCreate(BaseModel):
    name:           str
    contact_email:  str
    contact_phone:  Optional[str]  = None
    address:        Optional[str]  = None
    country:        Optional[str]  = "GR"
    reseller_type:  Optional[str]  = "pharmacy"  # pharmacy | medical_supply | online | distributor
    commission_pct: Optional[float] = 15.0


class ActivateDeviceRequest(BaseModel):
    code:        str   # "THR-XXXX-YYYY-ZZZZ"
    guardian_id: int


class GenerateCodesRequest(BaseModel):
    reseller_id: int
    quantity:    int
    free_months: Optional[int] = 5
    device_tier: Optional[str] = "basic"
    batch_id:    Optional[str] = None
