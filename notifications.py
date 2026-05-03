import os
import aiohttp
import json
from datetime import datetime

FCM_CREDENTIALS_PATH = os.getenv("FCM_CREDENTIALS_PATH", "/medice/fcm-creds.json")
FCM_PROJECT_ID = os.getenv("FCM_PROJECT_ID", "")


async def _send_fcm(token: str, title: str, body: str, data: dict = None):
    """
    Send Firebase Cloud Messaging notification.
    Requires GOOGLE_APPLICATION_CREDENTIALS env var set.
    """
    if not FCM_PROJECT_ID:
        print(f"⚠️  FCM not configured. Would send: {title} - {body}")
        return
    
    try:
        import google.auth
        from google.auth.transport.requests import Request
        from google.oauth2.service_account import Credentials
        
        creds = Credentials.from_service_account_file(FCM_CREDENTIALS_PATH)
        creds.refresh(Request())
        
        url = f"https://fcm.googleapis.com/v1/projects/{FCM_PROJECT_ID}/messages:send"
        headers = {"Authorization": f"Bearer {creds.token}", "Content-Type": "application/json"}
        
        message = {
            "message": {
                "token": token,
                "notification": {"title": title, "body": body},
                "data": data or {},
            }
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=message, headers=headers) as resp:
                if resp.status != 200:
                    print(f"❌ FCM error {resp.status}: {await resp.text()}")
    except Exception as e:
        print(f"❌ FCM send failed: {e}")


async def send_fever_alert(token: str, temperature: float):
    """Normal fever alert (38.0-39.0°C)"""
    await _send_fcm(
        token,
        title="🌡️ Πυρετός ανιχνεύθηκε",
        body=f"Θερμοκρασία: {temperature:.1f}°C",
        data={"type": "fever_alert", "temperature": str(temperature)},
    )


async def send_high_fever_alert(token: str, temperature: float):
    """High fever alert (≥39.0°C)"""
    await _send_fcm(
        token,
        title="🔥 ΥΨΗΛΟΣ ΠΥΡΕΤΟΣ",
        body=f"Επείγουσα: {temperature:.1f}°C — Επικοινωνήστε με γιατρό",
        data={"type": "high_fever", "temperature": str(temperature)},
    )


async def send_rapid_fever_alert(token: str, temperature: float, fever_rate: float):
    """
    Rapid fever rise alert (>0.8°C per 30 min).
    fever_rate in °C per minute.
    """
    rate_per_30min = fever_rate * 30
    await _send_fcm(
        token,
        title="🚨 ΤΑΧΕΙΑ ΑΝΟΔΟΣ ΠΥΡΕΤΟΥ",
        body=f"{temperature:.1f}°C — Ανέβηκε {rate_per_30min:.2f}°C σε 30 λεπτά!",
        data={
            "type": "rapid_fever",
            "temperature": str(temperature),
            "fever_rate": str(fever_rate),
        },
    )


async def send_antipyretic_reminder(token: str):
    """Reminder to give antipyretic medication."""
    await _send_fcm(
        token,
        title="💊 Υπενθύμιση Φαρμάκου",
        body="Ώρα για το αντιπυρετικό",
        data={"type": "antipyretic_reminder"},
    )


async def send_fever_ended(token: str):
    """Fever episode has ended."""
    await _send_fcm(
        token,
        title="✅ Πυρετός Περατώθη",
        body="Η θερμοκρασία επανήλθε στο κανονικό",
        data={"type": "fever_ended"},
    )


async def send_spo2_alert(token: str, spo2: float, level: str):
    """SpO2 alert (critical: <90%, low: <94%)."""
    is_critical = level == "critical"
    await _send_fcm(
        token,
        title=f"{'🚨' if is_critical else '⚠️'} Χαμηλός Κορεσμός O₂",
        body=f"SpO₂: {spo2:.0f}%",
        data={"type": "spo2_alert", "spo2": str(spo2)},
    )


async def send_hr_alert(token: str, bpm: int, level: str):
    """HR alert (abnormal: <60 or >130 BPM)."""
    await _send_fcm(
        token,
        title="⚠️ Ανώμαλος Καρδιακός Ρυθμός",
        body=f"Παλμοί: {bpm} BPM",
        data={"type": "hr_alert", "bpm": str(bpm)},
    )


async def send_bp_alert(token: str, systolic: int, diastolic: int, level: str):
    """Blood pressure alert."""
    await _send_fcm(
        token,
        title="⚠️ Ανώμαλη Πίεση Αίματος",
        body=f"{systolic}/{diastolic} mmHg",
        data={"type": "bp_alert", "systolic": str(systolic), "diastolic": str(diastolic)},
    )
