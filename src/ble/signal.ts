// Bracelet packets and signal maths, shared by the family and volunteer screens.
// Same logic as the tested laptop scanner (nasij_scanner.py). No native imports, so it runs in node checks.
import type { Device } from 'react-native-ble-plx';

export const LOST_AFTER_MS = 10000; // no packet for 10 s = signal lost
export const WINDOW = 6; // average the last 6 readings

export type Trend = 'approaching' | 'away' | 'steady';
export type Signal = { rssi: number; smooth: number; trend: Trend; lastSeen: number };

function avg(list: number[]) {
  return list.reduce((a, b) => a + b, 0) / list.length;
}

// Smoothed signal and direction from the last WINDOW readings.
// Direction: last 3 readings vs the average of all 6, ±3 dB (the agreed method).
export function summarize(history: number[]): { smooth: number; trend: Trend } {
  const full = avg(history);
  const diff = avg(history.slice(-3)) - full;
  return { smooth: Math.round(full), trend: diff > 3 ? 'approaching' : diff < -3 ? 'away' : 'steady' };
}

function toBytes(b64: string) {
  return Array.from(atob(b64), (c) => c.charCodeAt(0));
}
function toHex(bytes: number[]) {
  return bytes.map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

type Packet = Pick<Device, 'serviceData'>;

// Any MOKO bracelet: service data EA00 (scan response), last 6 bytes = its MAC
export function braceletMac(device: Packet): string | null {
  for (const [uuid, b64] of Object.entries(device.serviceData ?? {})) {
    if (!b64 || !uuid.toLowerCase().includes('ea00')) continue;
    const b = toBytes(b64);
    if (b.length >= 6) return toHex(b.slice(-6));
  }
  return null;
}

// MOKO alarm info (service data FEE0): frame type, status flag, trigger count
// Frame 0x21 = double press slot, 0x23 = no movement. Status bit1 = alarm triggered.
export function parseAlarm(device: Packet) {
  for (const [uuid, b64] of Object.entries(device.serviceData ?? {})) {
    if (!b64 || !uuid.toLowerCase().includes('fee0')) continue;
    const b = toBytes(b64);
    if (b.length < 4) continue;
    return { frame: b[0], triggered: (b[1] & 0x02) !== 0, count: (b[2] << 8) | b[3] };
  }
  return null;
}

// Bracelet number as printed: 12 hex characters
export function cleanMac(text: string) {
  return text.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 12);
}
