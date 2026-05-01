import httpx
import os

FCM_URL = "https://fcm.googleapis.com/fcm/send"
FCM_KEY = os.getenv("FCM_SERVER_KEY", "")
_AUTH   = {"Authorization": f"key={FCM_KEY}", "Content-Type": "application/json"}


async def _send(token: str, title: str, body: str, data: dict = {}):
    if not token or not FCM_KEY:
        return
    payload = {"to": token, "notification": {"title": title, "body": body}, "data": data}
    async with httpx.AsyncClient() as c:
        await c.post(FCM_URL, headers=_AUTH, json=payload, timeout=10)


async def send_fever_alert(token: str, temp: float):
    await _send(token, "🌡️ Πυρετός",
                f"Θερμοκρασία: {temp:.1f}°C", {"type": "fever", "temp": str(temp)})

async def send_high_fever_alert(token: str, temp: float):
    await _send(token, "⚠️ Υψηλός Πυρετός!",
                f"Θερμοκρασία {temp:.1f}°C — Επικοινωνήστε με γιατρό!",
                {"type": "high_fever", "temp": str(temp)})

async def send_antipyretic_reminder(token: str):
    await _send(token, "💊 Αντιπυρετικό;",
                "Πέρασαν 4 ώρες από το τελευταίο αντιπυρετικό.",
                {"type": "antipyretic_reminder"})

async def send_fever_ended(token: str):
    await _send(token, "✅ Πυρετός Τελείωσε",
                "Η θερμοκρασία επέστρεψε σε κανονικά επίπεδα.",
                {"type": "fever_ended"})

async def send_spo2_alert(token: str, spo2: float, level: str):
    emoji = "🚨" if level == "critical" else "⚠️"
    await _send(token, f"{emoji} SpO2 {'ΚΡΙΣΙΜΟ' if level == 'critical' else 'Χαμηλό'}!",
                f"Κορεσμός αίματος: {spo2:.0f}% — "
                f"{'Καλέστε ασθενοφόρο ΑΜΕΣΑ!' if level == 'critical' else 'Παρακολούθηση απαιτείται.'}",
                {"type": "spo2_alert", "spo2": str(spo2), "level": level})

async def send_hr_alert(token: str, bpm: int, level: str):
    label = "Βραδυκαρδία" if level == "bradycardia" else "Ταχυκαρδία"
    await _send(token, f"❤️‍🩹 {label}!",
                f"Καρδιακοί παλμοί: {bpm} BPM — Παρακαλώ επικοινωνήστε με ιατρό.",
                {"type": "hr_alert", "bpm": str(bpm), "level": level})

async def send_bp_alert(token: str, systolic: int, diastolic: int, level: str):
    labels = {
        "crisis":     ("🚨 Υπερτασική Κρίση!", "ΚΑΛΕΣΤΕ ΑΣΘΕΝΟΦΟΡΟ ΑΜΕΣΑ!"),
        "high_stage2":("⚠️ Υψηλή Πίεση (Β΄ Στάδιο)", "Επικοινωνήστε με γιατρό άμεσα."),
        "low":        ("⚠️ Χαμηλή Πίεση", "Ξαπλώστε τον ασθενή, παρακολούθηση."),
    }
    title, msg = labels.get(level, ("⚠️ Πίεση Αίματος", "Ελέγξτε τον ασθενή."))
    await _send(token, title,
                f"Πίεση: {systolic}/{diastolic} mmHg — {msg}",
                {"type": "bp_alert", "systolic": str(systolic),
                 "diastolic": str(diastolic), "level": level})
