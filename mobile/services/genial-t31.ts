import { BleManager, Device } from "react-native-ble-plx";
import { Buffer } from "buffer";

export const GENIAL_T31_DEVICE_NAME = "Genial T31";

function parseTemperatureValue(base64Value: string): {
  tempCelsius: number;
  valid: boolean;
} {
  try {
    const buf = Buffer.from(base64Value, "base64");
    if (buf.length === 0) return { tempCelsius: 0, valid: false };

    let tempCelsius = 0;

    // Try parsing as standard BLE temperature format (IEEE 11073)
    if (buf.length >= 5) {
      const flags = buf[0];
      const isFahrenheit = (flags & 0x01) !== 0;
      const exponent = (buf[4] << 24) >> 24;
      let mantissa = (buf[3] << 16) | (buf[2] << 8) | buf[1];
      if (mantissa & 0x800000) mantissa |= ~0xffffff;
      tempCelsius = mantissa * Math.pow(10, exponent);
      if (isFahrenheit) tempCelsius = (tempCelsius - 32) * (5 / 9);
    }
    // Fallback: try parsing as simple 16-bit little-endian value in 0.01°C units
    else if (buf.length >= 2) {
      const raw = (buf[1] << 8) | buf[0];
      tempCelsius = raw / 100;
    }
    // Last resort: try as single byte (0-255 range)
    else if (buf.length >= 1) {
      tempCelsius = buf[0];
    }

    const valid = !isNaN(tempCelsius) && tempCelsius > 20 && tempCelsius < 45;
    return { tempCelsius, valid };
  } catch {
    return { tempCelsius: 0, valid: false };
  }
}

async function discoverTemperatureCharacteristic(
  device: Device
): Promise<{ serviceUUID: string; charUUID: string } | null> {
  try {
    // Standard BLE Health Thermometer Service
    const services = await device.services();

    // Look for Health Thermometer Service (1809) or any service with temperature characteristic
    for (const service of services) {
      const chars = await service.characteristics();
      for (const char of chars) {
        // Standard BLE Temperature Measurement (2A1C)
        if (
          char.uuid.toLowerCase() === "2a1c" ||
          char.uuid.toLowerCase().includes("2a1c")
        ) {
          return { serviceUUID: service.uuid, charUUID: char.uuid };
        }
      }
    }

    // Fallback: look for any characteristic with "temp" in name or UUID
    for (const service of services) {
      const chars = await service.characteristics();
      for (const char of chars) {
        if (
          char.uuid.toLowerCase().includes("temp") ||
          char.uuid.toLowerCase().includes("2a1c")
        ) {
          return { serviceUUID: service.uuid, charUUID: char.uuid };
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function connectGenialT31(
  manager: BleManager,
  onTemperature: (tempC: number) => void,
  onConnected: (device: Device) => void,
  onDisconnected: () => void,
  onScanTimeout: () => void
): Promise<void> {
  manager.startDeviceScan(null, { allowDuplicates: false }, async (err, device) => {
    if (err || !device) {
      onScanTimeout();
      return;
    }

    if (!device.name?.includes(GENIAL_T31_DEVICE_NAME)) {
      return;
    }

    manager.stopDeviceScan();
    try {
      const d = await device.connect();
      await d.discoverAllServicesAndCharacteristics();

      const charInfo = await discoverTemperatureCharacteristic(d);
      if (!charInfo) {
        onDisconnected();
        return;
      }

      onConnected(d);

      d.monitorCharacteristicForService(
        charInfo.serviceUUID,
        charInfo.charUUID,
        (e, char) => {
          if (e || !char?.value) return;
          const { tempCelsius, valid } = parseTemperatureValue(char.value);
          if (valid) onTemperature(tempCelsius);
        }
      );

      d.onDisconnected(() => onDisconnected());
    } catch (error) {
      console.error("Genial T31 connection error:", error);
      onDisconnected();
    }
  });

  setTimeout(() => {
    manager.stopDeviceScan();
    onScanTimeout();
  }, 15000);
}
