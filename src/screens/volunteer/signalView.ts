// How the volunteer screens show a bracelet signal. The readings and the direction come from
// src/ble (Person 1, the agreed method); this file only turns them into bars, zone and metres.
import { LOST_AFTER_MS, type Signal } from '../../ble/signal';

// Same constants as the family app and nasij_scanner.py
const NEAR = -65;
const FAR = -80;
const TX_AT_1M = -59;
const PATH_LOSS = 2.5;

export type SignalZone = 'NEAR' | 'MEDIUM' | 'FAR' | 'LOST';

// 0 to 4 bars, same thresholds as the family app
export function bars(smooth: number) {
  if (smooth >= -60) return 4;
  if (smooth >= -70) return 3;
  if (smooth >= -80) return 2;
  if (smooth >= -90) return 1;
  return 0;
}

export function zoneOf(signal: Signal | null, now: number): SignalZone | null {
  if (!signal) return null;
  if (now - signal.lastSeen > LOST_AFTER_MS) return 'LOST';
  if (signal.smooth >= NEAR) return 'NEAR';
  if (signal.smooth >= FAR) return 'MEDIUM';
  return 'FAR';
}

// Rough distance in metres, same formula as the family app (but allows under 2 m)
export function estimateMetres(smooth: number) {
  const d = Math.pow(10, (TX_AT_1M - smooth) / (10 * PATH_LOSS));
  return Math.max(1, Math.min(60, Math.round(d)));
}
