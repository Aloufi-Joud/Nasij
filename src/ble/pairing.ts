// Linking check: proof the bracelet is in your hand, not just nearby.
// The phone only listens (never connects), so the proof is a NEW double press
// (frame 0x21 count goes up) heard while the bracelet is held next to the phone.

// ponytail: -55 ≈ within ~20-30 cm of the phone; lower (e.g. -65) for more range, higher (-45) to be stricter
export const PAIR_RSSI = -55; // stronger than this = close to the phone

export type Pairing = { mac: string; ids: Set<string>; baseline: number | null; pressed: boolean; rssi: number | null; since: number };

export function newPairing(mac: string, now: number): Pairing {
  return { mac, ids: new Set(), baseline: null, pressed: false, rssi: null, since: now };
}

// Feed every scanned packet. mac = from EA00 (null on FEE0 packets), alarm = parsed FEE0.
export function pairStep(
  p: Pairing,
  deviceId: string,
  mac: string | null,
  rssi: number,
  alarm: { frame: number; count: number } | null,
) {
  if (mac === p.mac) p.ids.add(deviceId);
  if (!p.ids.has(deviceId)) return;
  p.rssi = rssi;
  if (!alarm || alarm.frame !== 0x21) return;
  // First count seen, or a press from far away: only move the baseline
  if (p.baseline === null || (alarm.count > p.baseline && rssi < PAIR_RSSI)) p.baseline = alarm.count;
  else if (alarm.count > p.baseline) p.pressed = true;
}
