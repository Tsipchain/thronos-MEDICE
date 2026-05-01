"""
In-memory fever + vitals + blood pressure analyzer.
No Redis required — state lives in-process.
"""
from datetime import datetime, timedelta
from typing import Optional, Dict

# ── Temperature ─────────────────────────────────────────────────────────────
FEVER_THRESHOLD        = 38.0
HIGH_FEVER_THRESHOLD   = 39.0
COOL_READINGS_TO_END   = 6
ANTIPYRETIC_INTERVAL_H = 4

# ── SpO2 ────────────────────────────────────────────────────────────────────
SPO2_LOW      = 94.0
SPO2_CRITICAL = 90.0

# ── Heart Rate ───────────────────────────────────────────────────────────────
BPM_LOW_CHILD  = 60
BPM_HIGH_CHILD = 130

# ── Blood Pressure (mmHg) — adult/elderly thresholds ────────────────────────
# Children have lower normal ranges; adults/elderly follow AHA guidelines
BP_SYSTOLIC_LOW       = 90    # hypotension
BP_SYSTOLIC_NORMAL_HI = 120   # upper normal
BP_SYSTOLIC_HIGH_1    = 130   # Stage 1 hypertension
BP_SYSTOLIC_HIGH_2    = 140   # Stage 2 hypertension
BP_SYSTOLIC_CRISIS    = 180   # hypertensive crisis

BP_DIASTOLIC_LOW      = 60
BP_DIASTOLIC_HIGH_1   = 80
BP_DIASTOLIC_HIGH_2   = 90
BP_DIASTOLIC_CRISIS   = 120


def classify_bp(systolic: int, diastolic: int) -> str:
    if systolic > BP_SYSTOLIC_CRISIS or diastolic > BP_DIASTOLIC_CRISIS:
        return "crisis"
    if systolic >= BP_SYSTOLIC_HIGH_2 or diastolic >= BP_DIASTOLIC_HIGH_2:
        return "high_stage2"
    if systolic >= BP_SYSTOLIC_HIGH_1 or diastolic >= BP_DIASTOLIC_HIGH_1:
        return "high_stage1"
    if systolic < BP_SYSTOLIC_LOW or diastolic < BP_DIASTOLIC_LOW:
        return "low"
    if systolic >= BP_SYSTOLIC_NORMAL_HI:
        return "elevated"
    return "normal"


class LocalAnalyzer:
    def __init__(self):
        self._active:      Dict[str, str]     = {}
        self._cool:        Dict[str, int]     = {}
        self._antipyretic: Dict[str, datetime] = {}
        self._spo2_min:    Dict[str, float]   = {}
        self._bpm_sum:     Dict[str, float]   = {}
        self._bpm_cnt:     Dict[str, int]     = {}

    async def analyze_temp(self, patient_id: str, temp: float, ts: datetime) -> dict:
        pid = str(patient_id)
        is_fever      = temp >= FEVER_THRESHOLD
        is_high_fever = temp >= HIGH_FEVER_THRESHOLD
        fever_level   = "high_fever" if is_high_fever else ("fever" if is_fever else "normal")

        active_fever_id  = self._active.get(pid)
        is_new_fever     = False
        is_fever_ending  = False
        send_alert       = False
        send_antipyretic = False

        if is_fever:
            self._cool[pid] = 0
            if not active_fever_id:
                is_new_fever = True
                send_alert   = True
            last = self._antipyretic.get(pid)
            if last is None:
                send_antipyretic = bool(active_fever_id)
            elif (ts - last) >= timedelta(hours=ANTIPYRETIC_INTERVAL_H):
                send_antipyretic = True
        else:
            self._cool[pid] = self._cool.get(pid, 0) + 1
            if active_fever_id and self._cool[pid] >= COOL_READINGS_TO_END:
                is_fever_ending = True
                for d in (self._active, self._cool, self._antipyretic,
                          self._spo2_min, self._bpm_sum, self._bpm_cnt):
                    d.pop(pid, None)

        return dict(
            is_fever=is_fever, is_new_fever=is_new_fever,
            is_fever_ending=is_fever_ending, send_fever_alert=send_alert,
            send_antipyretic_reminder=send_antipyretic,
            fever_level=fever_level, active_fever_id=active_fever_id,
        )

    async def analyze_vitals(self, patient_id: str,
                             spo2: Optional[float], spo2_valid: bool,
                             bpm:  Optional[int],   bpm_valid:  bool,
                             systolic:  Optional[int] = None,
                             diastolic: Optional[int] = None,
                             bp_valid:  bool = False) -> dict:
        pid        = str(patient_id)
        spo2_alert = False; spo2_level = "normal"
        hr_alert   = False; hr_level   = "normal"
        bp_alert   = False; bp_level   = "normal"

        if spo2_valid and spo2 is not None:
            if spo2 < SPO2_CRITICAL:
                spo2_alert = True; spo2_level = "critical"
            elif spo2 < SPO2_LOW:
                spo2_alert = True; spo2_level = "low"
            if spo2 < self._spo2_min.get(pid, 999.0):
                self._spo2_min[pid] = spo2

        if bpm_valid and bpm is not None:
            if bpm < BPM_LOW_CHILD:
                hr_alert = True; hr_level = "bradycardia"
            elif bpm > BPM_HIGH_CHILD:
                hr_alert = True; hr_level = "tachycardia"
            self._bpm_sum[pid] = self._bpm_sum.get(pid, 0.0) + bpm
            self._bpm_cnt[pid] = self._bpm_cnt.get(pid, 0) + 1

        if bp_valid and systolic is not None and diastolic is not None:
            bp_level = classify_bp(systolic, diastolic)
            bp_alert = bp_level in ("crisis", "high_stage2", "low")

        return dict(
            spo2_alert=spo2_alert, spo2_level=spo2_level,
            hr_alert=hr_alert,     hr_level=hr_level,
            bp_alert=bp_alert,     bp_level=bp_level,
            send_spo2_alert=spo2_alert,
        )

    async def register_fever_started(self, patient_id: str, event_id: str):
        self._active[str(patient_id)] = event_id

    async def register_antipyretic_given(self, patient_id: str, ts: datetime):
        self._antipyretic[str(patient_id)] = ts

    async def get_fever_vitals(self, patient_id: str) -> dict:
        pid      = str(patient_id)
        min_spo2 = self._spo2_min.get(pid)
        cnt      = self._bpm_cnt.get(pid, 0)
        avg_bpm  = self._bpm_sum.get(pid, 0.0) / cnt if cnt else None
        return {"min_spo2": min_spo2, "avg_bpm": avg_bpm}
