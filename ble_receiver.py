"""
BLE Gateway for Raspberry Pi or Linux-based room gateway.
The mobile app (React Native) can also read BLE directly and POST to /readings.
This module is for a fixed room gateway alternative.

Supports two device types:
  - ThronomedICE: custom service UUID with JSON payload
  - ThermoDOC:    standard Health Thermometer Service (GATT 0x1809 / 0x2A1C)
"""
import asyncio
import json
import logging
import struct
import httpx
from datetime import datetime

logger = logging.getLogger(__name__)

# ThronomedICE custom service
TEMP_SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
TEMP_CHAR_UUID    = "beb5483e-36e1-4688-b7f5-ea07361b26a8"

# Standard Health Thermometer Service (Bluetooth GATT 0x1809)
HTM_SERVICE_UUID  = "00001809-0000-1000-8000-00805f9b34fb"
HTM_CHAR_UUID     = "00002a1c-0000-1000-8000-00805f9b34fb"


def _parse_ieee11073_float(data: bytes, offset: int) -> float:
    """Parse a 4-byte IEEE 11073-20601 FLOAT from a BLE characteristic."""
    b0, b1, b2, b3 = data[offset], data[offset+1], data[offset+2], data[offset+3]
    exponent = struct.unpack("b", bytes([b3]))[0]  # signed 8-bit
    mantissa = (b2 << 16) | (b1 << 8) | b0
    if mantissa & 0x800000:  # sign-extend 24-bit
        mantissa |= ~0xFFFFFF
    return mantissa * (10 ** exponent)


def _parse_thermodoc_temp(data: bytes) -> float | None:
    """Return Celsius temperature from a Temperature Measurement characteristic value."""
    if len(data) < 5:
        return None
    flags = data[0]
    temp = _parse_ieee11073_float(data, 1)
    if flags & 0x01:  # Fahrenheit
        temp = (temp - 32) * 5 / 9
    if not (20 < temp < 45):
        return None
    return round(temp, 2)


class BLEGateway:
    def __init__(self, api_url: str = "http://localhost:8000"):
        self.api_url  = api_url
        self._running = False

    async def start(self):
        try:
            import bleak  # noqa: F401
        except ImportError:
            logger.warning("bleak not installed - BLE gateway unavailable")
            return
        self._running = True
        logger.info("BLE gateway started (API: %s)", self.api_url)
        await self._scan_loop()

    async def _scan_loop(self):
        from bleak import BleakScanner
        while self._running:
            devices = await BleakScanner.discover(timeout=5.0)
            for dev in devices:
                uuids = [str(u).lower() for u in (dev.metadata.get("uuids") or [])]
                if dev.name and "ThronomedICE" in dev.name:
                    logger.info("Found ThronomedICE: %s (%s)", dev.name, dev.address)
                    asyncio.create_task(self._stream_thronomedice(dev.address))
                elif HTM_SERVICE_UUID in uuids or "1809" in uuids:
                    logger.info("Found ThermoDOC (HTM): %s (%s)", dev.name or "unknown", dev.address)
                    asyncio.create_task(self._stream_thermodoc(dev.address))
            await asyncio.sleep(30)

    async def _stream_thronomedice(self, address: str):
        from bleak import BleakClient
        try:
            async with BleakClient(address) as client:
                while self._running and client.is_connected:
                    raw     = await client.read_gatt_char(TEMP_CHAR_UUID)
                    payload = json.loads(raw.decode())
                    await self._forward({
                        "device_id":   payload.get("device_id", "ble-gateway"),
                        "temperature": payload["object_temp"],
                        "timestamp":   datetime.utcnow().isoformat(),
                    })
                    await asyncio.sleep(10)
        except Exception as exc:
            logger.error("ThronomedICE stream error for %s: %s", address, exc)

    async def _stream_thermodoc(self, address: str):
        """Stream temperature from a standard Health Thermometer Service device."""
        from bleak import BleakClient
        try:
            async with BleakClient(address) as client:
                while self._running and client.is_connected:
                    raw  = await client.read_gatt_char(HTM_CHAR_UUID)
                    temp = _parse_thermodoc_temp(bytes(raw))
                    if temp is not None:
                        await self._forward({
                            "device_id":   address,
                            "temperature": temp,
                            "timestamp":   datetime.utcnow().isoformat(),
                        })
                    await asyncio.sleep(10)
        except Exception as exc:
            logger.error("ThermoDOC stream error for %s: %s", address, exc)

    async def _forward(self, payload: dict):
        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{self.api_url}/readings",
                    json=payload,
                    timeout=5.0,
                )
        except Exception as exc:
            logger.error("Forward failed: %s", exc)

    def stop(self):
        self._running = False
