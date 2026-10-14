// Emergency press relayed by volunteers' phones, for a bracelet no family holds (no family phone to send it).
// The bracelet needs no internet: any on-duty volunteer who hears the press sends it. No native imports,
// so it runs in node checks (src/ble/check.mjs).
import type { Point, Relay } from '../mock';

type Alarm = { frame: number; triggered: boolean; count: number } | null;

// A NEW double press (frame 0x21) from this bracelet. counts = the last press count heard per bracelet.
// The first packet heard only sets the count, unless its alarm flag is already on (the press happened just
// before this phone came in range). Every phone that hears the same press writes to the same report, so
// hearing it twice does no harm.
export function newPress(counts: Map<string, number>, mac: string, a: Alarm): boolean {
  if (!a || a.frame !== 0x21) return false;
  const prev = counts.get(mac);
  counts.set(mac, Math.max(a.count, prev ?? 0));
  return prev === undefined ? a.triggered : a.count > prev;
}

// One more volunteer heard the press. The report's place is the average of their locations, each weighted
// by signal (10^(rssi/20) grows like 1/distance, so a stronger signal pulls the place towards that volunteer).
// The strongest hearer is the nearest, and gets the report first.
// ponytail: plain weighted average, phones' signal readings differ by a few dB; fine at ~30 m bracelet range
export function addHearing(r: Relay | null, uid: string, rssi: number, p: Point): Relay {
  const w = Math.pow(10, rssi / 20);
  if (!r) return { by: [uid], best: uid, bestRssi: rssi, w, lat: w * p.latitude, lng: w * p.longitude };
  return {
    by: [...r.by, uid],
    best: rssi > r.bestRssi ? uid : r.best,
    bestRssi: Math.max(rssi, r.bestRssi),
    w: r.w + w,
    lat: r.lat + w * p.latitude,
    lng: r.lng + w * p.longitude,
  };
}

export const relayPlace = (r: Relay): Point => ({ latitude: r.lat / r.w, longitude: r.lng / r.w });
