// Bracelet packets and signal maths, shared by the family and volunteer screens.
// Same logic as the tested laptop scanner (nasij_scanner.py). No native imports, so it runs in node checks.
import type { Device } from 'react-native-ble-plx';

export const LOST_AFTER_MS = 20000; // no packet for 20 s = signal lost (the bracelet calls slowly; 10 s gave false alarms with it beside the phone)
export const WINDOW = 6; // average the last 6 readings

export type Trend = 'approaching' | 'away' | 'steady';
// recent = average of the last 3 only: reacts faster when walking (the volunteer's distance)
// trendAt = when the shown direction was last seen in the readings
export type Signal = { rssi: number; smooth: number; recent: number; trend: Trend; trendAt: number; lastSeen: number };
export const TREND_HOLD_MS = 3000; // approaching / away stays shown 3 s after the readings settle

function avg(list: number[]) {
  return list.reduce((a, b) => a + b, 0) / list.length;
}

// Middle value: one odd reading (a body in the way, a reflection) can't pull it like it pulls an average
function median(list: number[]) {
  const s = [...list].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Smoothed signal (median) and direction from the last WINDOW readings.
// Direction: last 3 readings vs the average of all 6, ±3 dB (the agreed method).
export function summarize(history: number[]): { smooth: number; recent: number; trend: Trend } {
  const full = avg(history);
  const last3 = avg(history.slice(-3));
  const diff = last3 - full;
  return { smooth: Math.round(median(history)), recent: Math.round(last3), trend: diff > 3 ? 'approaching' : diff < -3 ? 'away' : 'steady' };
}

// New reading for one bracelet. prev = its last result.
// A step closer shows "approaching" only until the 6 readings fill with the new level, then flips
// to steady, so a seen direction is held TREND_HOLD_MS (the opposite direction replaces it at once).
export function nextSignal(prev: Signal | null, history: number[], rssi: number, t: number): Signal {
  const s = summarize(history);
  const hold = s.trend === 'steady' && prev && prev.trend !== 'steady' && t - prev.trendAt < TREND_HOLD_MS;
  return hold ? { rssi, ...s, trend: prev.trend, trendAt: prev.trendAt, lastSeen: t } : { rssi, ...s, trendAt: t, lastSeen: t };
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
