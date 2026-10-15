// Bracelet packets and signal maths, shared by the family and volunteer screens.
// Same logic as the tested laptop scanner (nasij_scanner.py). No native imports, so it runs in node checks.
import type { Device } from 'react-native-ble-plx';

export const LOST_AFTER_MS = 20000; // no packet for 20 s = signal lost (the bracelet calls slowly; 10 s gave false alarms with it beside the phone)
export const WINDOW = 6; // average the last 6 readings
export const TREND_MS = 5000; // direction looks at the last 5 s of readings
export const TREND_HOLD_MS = 2000; // a new direction shows only once it has held 2 s

export type Trend = 'approaching' | 'away' | 'steady';
export type Reading = { rssi: number; t: number };
// recent = average of the last 3 only: reacts faster when walking (the volunteer's distance)
// next / nextSince = the direction waiting to be shown, and since when
export type Signal = {
  rssi: number;
  smooth: number;
  recent: number;
  trend: Trend;
  next: Trend;
  nextSince: number;
  lastSeen: number;
};

function avg(list: number[]) {
  return list.reduce((a, b) => a + b, 0) / list.length;
}

// Keep the last WINDOW readings, plus everything from the last TREND_MS
export function addReading(history: Reading[], rssi: number, t: number): Reading[] {
  const h = [...history, { rssi, t }];
  return h.filter((r, i) => i >= h.length - WINDOW || t - r.t <= TREND_MS);
}

// Raw direction: newer half of the last 5 s vs the older half, ±3 dB (the agreed method since 2026-10-15).
// The halves don't overlap, so the whole change counts, and 5 s lets a slow walk in from far add up:
// far away each metre moves the signal only a little, close by a lot.
function rawTrend(history: Reading[], t: number): Trend {
  const mid = t - TREND_MS / 2;
  const span = history.filter((r) => t - r.t <= TREND_MS);
  const older = span.filter((r) => r.t < mid).map((r) => r.rssi);
  const newer = span.filter((r) => r.t >= mid).map((r) => r.rssi);
  if (!older.length || !newer.length) return 'steady';
  const diff = avg(newer) - avg(older);
  return diff > 3 ? 'approaching' : diff < -3 ? 'away' : 'steady';
}

// Smoothed signal and shown direction. prev = this bracelet's last result (null when starting fresh).
// The shown direction changes only after the new one holds TREND_HOLD_MS, so body and phone movement
// don't flip it every reading.
export function summarize(history: Reading[], prev: Signal | null) {
  const t = history[history.length - 1].t;
  const last = history.slice(-WINDOW).map((r) => r.rssi);
  const raw = rawTrend(history, t);
  const shown = prev?.trend ?? 'steady';
  const nextSince = prev && prev.next === raw ? prev.nextSince : t;
  const trend: Trend = raw === shown || t - nextSince >= TREND_HOLD_MS ? raw : shown;
  return { smooth: Math.round(avg(last)), recent: Math.round(avg(last.slice(-3))), trend, next: raw, nextSince };
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
