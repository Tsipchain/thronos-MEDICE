"""
In-memory fever + vitals analyzer.
No Redis required — state lives in-process.
Works correctly for a single Railway replica with SQLite.
"""
from datetime import datetime, timedelta
from typing import Optional, Dict

FEVER_THRESHOLD        = 38.0
HIGH_FEVER_THRESHOLD   = 39.0
SPO2_LOW               = 94.0
SPO2_CRITICAL          = 90.0
BPM_LOW_CHILD          = 60
BPM_HIGH_CHILD         = 130
COOL_READINGS_TO_END   = 6
ANTIPYRETIC_INTERVAL_H = 4


class LocalAnalyzer:
    def __init__(self):
        self._active:      Dict[str, str]       = {}   # patient_id -> fever_event_id
        self._cool:        Dict[str, int]        = {}   # consecutive normal readings
        self._antipyretic: Dict[str, datetime]   = {}   # last antipyretic time
        self._spo2_min:    Dict[str, float]      = {}
        self._bpm_sum:     Dict[str, float]      = {}
        self._bpm_cnt:     Dict[str, int]        = {}

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
                self._active.pop(pid, None)
                self._cool.pop(pid, None)
                self._antipyretic.pop(pid, None)
                self._spo2_min.pop(pid, None)
                self._bpm_sum.pop(pid, None)
                self._bpm_cnt.pop(pid, None)

        return dict(
            is_fever=is_fever,
            is_new_fever=is_new_fever,
            is_fever_ending=is_fever_ending,
            send_fever_alert=send_alert,
            send_antipyretic_reminder=send_antipyretic,
            fever_level=fever_level,
            active_fever_id=active_fever_id,
        )

    async def analyze_vitals(self, patient_id: str,
                             spo2: Optional[float], spo2_valid: bool,
                             bpm: Optional[int],    bpm_valid: bool) -> dict:
        pid        = str(patient_id)
        spo2_alert = False
        spo2_level = "normal"
        hr_alert   = False
        hr_level   = "normal"

        if spo2_valid and spo2 is not None:
            if spo2 < SPO2_CRITICAL:
                spo2_alert = True
                spo2_level = "critical"
            elif spo2 < SPO2_LOW:
                spo2_alert = True
                spo2_level = "low"
            if spo2 < self._spo2_min.get(pid, 999.0):
                self._spo2_min[pid] = spo2

        if bpm_valid and bpm is not None:
            if bpm < BPM_LOW_CHILD:
                hr_alert = True
                hr_level = "bradycardia"
            elif bpm > BPM_HIGH_CHILD:
                hr_alert = True
                hr_level = "tachycardia"
            self._bpm_sum[pid] = self._bpm_sum.get(pid, 0.0) + bpm
            self._bpm_cnt[pid] = self._bpm_cnt.get(pid, 0) + 1

        return dict(spo2_alert=spo2_alert, spo2_level=spo2_level,
                    hr_alert=hr_alert, hr_level=hr_level, send_spo2_alert=spo2_alert)

    async def register_fever_started(self, patient_id: str, event_id: str):
        self._active[str(patient_id)] = event_id

    async def register_antipyretic_given(self, patient_id: str, ts: datetime):
        self._antipyretic[str(patient_id)] = ts

    async def get_fever_vitals(self, patient_id: str) -> dict:
        pid     = str(patient_id)
        min_spo2 = self._spo2_min.get(pid)
        cnt      = self._bpm_cnt.get(pid, 0)
        avg_bpm  = self._bpm_sum.get(pid, 0.0) / cnt if cnt else None
        return {"min_spo2": min_spo2, "avg_bpm": avg_bpm}
