from sqlalchemy import Column, Integer, Float, String, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

Base = declarative_base()


class Guardian(Base):
    __tablename__ = "guardians"
    id        = Column(Integer, primary_key=True)
    name      = Column(String)
    email     = Column(String, unique=True)
    fcm_token = Column(String, nullable=True)
    patients  = relationship("Patient", back_populates="guardian")


class Patient(Base):
    __tablename__ = "patients"
    id              = Column(Integer, primary_key=True)
    name            = Column(String)
    birth_date      = Column(DateTime, nullable=True)
    guardian_id     = Column(Integer, ForeignKey("guardians.id"))
    # Subscription tier: "basic" (temp+SpO2+HR) or "bp" (+ blood pressure)
    subscription    = Column(String, default="basic")
    # Free trial: date until which full service is free (5 months post-device-purchase)
    free_until      = Column(DateTime, nullable=True)
    guardian        = relationship("Guardian", back_populates="patients")
    readings        = relationship("TempReading", back_populates="patient")
    fever_events    = relationship("FeverEvent", back_populates="patient")

    @property
    def bp_subscription(self) -> bool:
        """True when patient has BP add-on or is in free trial."""
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
    systolic    = Column(Integer, nullable=True)   # mmHg
    diastolic   = Column(Integer, nullable=True)   # mmHg
    spo2_valid  = Column(Boolean, default=False)
    bpm_valid   = Column(Boolean, default=False)
    bp_valid    = Column(Boolean, default=False)
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
    blockchain_tx     = Column(String, nullable=True)
    patient           = relationship("Patient", back_populates="fever_events")


class HospitalAccess(Base):
    __tablename__ = "hospital_access"
    id               = Column(Integer, primary_key=True)
    patient_id       = Column(Integer, ForeignKey("patients.id"))
    hospital_id      = Column(String)
    hospital_name    = Column(String, nullable=True)
    hospital_address = Column(String, nullable=True)
    is_active        = Column(Boolean, default=True)
    revoked_at       = Column(DateTime, nullable=True)


# ── Pydantic schemas ────────────────────────────────────────────────────────

class TempReadingIn(BaseModel):
    patient_id:  str
    device_id:   str
    temperature: float
    spo2:        Optional[float]    = None
    bpm:         Optional[int]      = None
    systolic:    Optional[int]      = None   # blood pressure mmHg
    diastolic:   Optional[int]      = None   # blood pressure mmHg
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
    timestamp:   datetime
    class Config: orm_mode = True


class SimulateIn(BaseModel):
    """Input for the /simulate endpoint — no patient_id required."""
    temperature: float
    spo2:        Optional[float] = None
    bpm:         Optional[int]   = None
    systolic:    Optional[int]   = None
    diastolic:   Optional[int]   = None


class PatientCreate(BaseModel):
    name:         str
    birth_date:   Optional[datetime] = None
    guardian_id:  int
    subscription: Optional[str]      = "basic"   # "basic" | "bp"
    free_until:   Optional[datetime] = None


class GuardianCreate(BaseModel):
    name:  str
    email: str


class FeverEventOut(BaseModel):
    id:                int
    start_time:        datetime
    end_time:          Optional[datetime]
    peak_temp:         float
    min_spo2:          Optional[float]
    avg_bpm:           Optional[float]
    antipyretic_given: bool
    blockchain_tx:     Optional[str]
    class Config: orm_mode = True
