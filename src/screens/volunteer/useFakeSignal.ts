// Fake bracelet signal for the volunteer proximity screen (Phase 1).
// It returns the same shape as the family app's Reading, so in Phase 2 the screen
// switches to real values from src/ble without changing.
import { useEffect, useRef, useState } from 'react';

export type Trend = 'approaching' | 'away' | 'steady';
export type Zone = 'NEAR' | 'MEDIUM' | 'FAR' | 'LOST';
export type Signal = {
  rssi: number; // latest raw reading, dBm
  smooth: number; // average of the last 6 readings
  trend: Trend;
  lastSeen: number; // ms since epoch
};

// Same constants as App.tsx and nasij_scanner.py
const WINDOW = 6;
const NEAR = -65;
const FAR = -80;
const TX_AT_1M = -59;
const PATH_LOSS = 2.5;
const LOST_AFTER_MS = 10000;

// Direction over a longer horizon than App.tsx: last 3 s vs the 3 s before.
// With readings every 0.5 s, comparing only the last 3 readings with the last 6
// needs about 4 dB per second of change, which walking produces only within a few metres.
const TREND_SAMPLES = 6;
const TREND_DB = 2;
const TREND_HOLD = 3; // a new direction must hold for 3 ticks (1.5 s)

const TICK_MS = 500;
const HEARD_UP_TO_M = 32; // further than this, the phone does not hear the bracelet

// Scripted walk: [seconds since start, metres between volunteer and bracelet]
// Not heard, then approaching, a wrong turn (moving away), then approaching until found.
const PATH: [number, number][] = [
  [0, 40],
  [3, 30],
  [10, 12],
  [11, 12],
  [18, 26],
  [19, 26],
  [28, 5],
  [34, 0.8],
];

function metresAt(sec: number) {
  if (sec >= PATH[PATH.length - 1][0]) return PATH[PATH.length - 1][1] + Math.sin(sec) * 0.2;
  for (let i = 1; i < PATH.length; i++) {
    const [t1, d1] = PATH[i];
    const [t0, d0] = PATH[i - 1];
    if (sec <= t1) return d0 + ((sec - t0) / (t1 - t0)) * (d1 - d0);
  }
  return PATH[0][1];
}

function avg(list: number[]) {
  return list.reduce((a, b) => a + b, 0) / list.length;
}

// 0 to 4 bars, same thresholds as App.tsx
export function bars(smooth: number) {
  if (smooth >= -60) return 4;
  if (smooth >= -70) return 3;
  if (smooth >= -80) return 2;
  if (smooth >= -90) return 1;
  return 0;
}

export function zoneOf(signal: Signal | null, now: number): Zone | null {
  if (!signal) return null;
  if (now - signal.lastSeen > LOST_AFTER_MS) return 'LOST';
  if (signal.smooth >= NEAR) return 'NEAR';
  if (signal.smooth >= FAR) return 'MEDIUM';
  return 'FAR';
}

// Rough distance in metres, same formula as App.tsx (but allows under 2 m)
export function estimateMetres(smooth: number) {
  const d = Math.pow(10, (TX_AT_1M - smooth) / (10 * PATH_LOSS));
  return Math.max(1, Math.min(60, Math.round(d)));
}

export function useFakeSignal(active: boolean) {
  const [signal, setSignal] = useState<Signal | null>(null);
  const [now, setNow] = useState(Date.now());
  const [run, setRun] = useState(0); // bump to restart the walk
  const history = useRef<number[]>([]);
  const shown = useRef<Trend>('steady');
  const candidate = useRef<{ trend: Trend; ticks: number }>({ trend: 'steady', ticks: 0 });

  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    history.current = [];
    shown.current = 'steady';
    candidate.current = { trend: 'steady', ticks: 0 };
    setSignal(null);

    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const metres = metresAt((t - start) / 1000);
      if (metres > HEARD_UP_TO_M) return; // no packet this tick

      const noise = (Math.random() - 0.5) * 5; // about ±2.5 dB
      const rssi = Math.round(TX_AT_1M - 10 * PATH_LOSS * Math.log10(metres) + noise);
      history.current = [...history.current, rssi].slice(-TREND_SAMPLES * 2);

      let raw: Trend = 'steady';
      if (history.current.length >= TREND_SAMPLES * 2) {
        const diff = avg(history.current.slice(-TREND_SAMPLES)) - avg(history.current.slice(0, TREND_SAMPLES));
        raw = diff > TREND_DB ? 'approaching' : diff < -TREND_DB ? 'away' : 'steady';
      }
      if (raw === candidate.current.trend) candidate.current.ticks += 1;
      else candidate.current = { trend: raw, ticks: 1 };
      if (candidate.current.ticks >= TREND_HOLD) shown.current = raw;

      setSignal({
        rssi,
        smooth: Math.round(avg(history.current.slice(-WINDOW))),
        trend: shown.current,
        lastSeen: t,
      });
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [active, run]);

  return { signal, now, restart: () => setRun((r) => r + 1) };
}
