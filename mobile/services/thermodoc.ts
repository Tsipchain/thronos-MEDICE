import { BleManager, Device } from "react-native-ble-plx";
import { Buffer } from "buffer";

export const THERMODOC_SERVICE_UUID = "1809";
export const THERMODOC_TEMP_CHAR_UUID = "2A1C";

function parseIEEE11073Float(buf: Buffer, offset: number): number {
  const b0 = buf[offset];
  const b1 = buf[offset + 1];
  const b2 = buf[offset + 2];
  const b3 = buf[offset + 3];
  // Exponent: signed 8-bit (MSB byte in BLE FLOAT little-endian layout)
  const exponent = (b3 << 24) >> 24;
  // Mantissa: signed 24-bit
  let mantissa = (b2 << 16) | (b1 << 8) | b0;
  if (mantissa & 0x800000) mantissa |= ~0xffffff;
  return mantissa * Math.pow(10, exponent);
}

export function parseTemperatureMeasurement(base64Value: string): {
  tempCelsius: number;
  valid: boolean;
} {
  try {
    const buf = Buffer.from(base64Value, "base64");
    if (buf.length < 5) return { tempCelsius: 0, valid: false };
    const flags = buf[0];
    const isFahrenheit = (flags & 0x01) !== 0;
    const tempRaw = parseIEEE11073Float(buf, 1);
    const tempCelsius = isFahrenheit ? (tempRaw - 32) * (5 / 9) : tempRaw;
    const valid = !isNaN(tempCelsius) && tempCelsius > 20 && tempCelsius < 45;
    return { tempCelsius, valid };
  } catch {
    return { tempCelsius: 0, valid: false };
  }
}

export async function connectThermoDOC(
  manager: BleManager,
  onTemperature: (tempC: number) => void,
  onConnected: (device: Device) => void,
  onDisconnected: () => void,
  onScanTimeout: () => void,
): Promise<void> {
  manager.startDeviceScan(
    [THERMODOC_SERVICE_UUID],
    { allowDuplicates: false },
    async (err, device) => {
      if (err || !device) {
        onScanTimeout();
        return;
      }
      manager.stopDeviceScan();
      try {
        const d = await device.connect();
        await d.discoverAllServicesAndCharacteristics();
        onConnected(d);
        d.monitorCharacteristicForService(
          THERMODOC_SERVICE_UUID,
          THERMODOC_TEMP_CHAR_UUID,
          (e, char) => {
            if (e || !char?.value) return;
            const { tempCelsius, valid } = parseTemperatureMeasurement(char.value);
            if (valid) onTemperature(tempCelsius);
          },
        );
        d.onDisconnected(() => onDisconnected());
      } catch {
        onDisconnected();
      }
    },
  );
  setTimeout(() => {
    manager.stopDeviceScan();
    onScanTimeout();
  }, 15000);
}
