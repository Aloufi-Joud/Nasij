// Sightings (Person 3): a volunteer's phone heard the bracelet of an open report.
// Same shape as Sighting in mock.ts. Person 1's listener may call addSighting on every packet:
// this file keeps it to one write per report every 10 s, so the free plan's daily write limit holds.
import { collection, doc, onSnapshot, query, where, writeBatch } from 'firebase/firestore';
import { auth, db } from './index';
import { areaOf, lastVolunteerLocation } from './volunteers';
import type { Point, Sighting } from '../mock';

export const SIGHTING_EVERY_MS = 10_000;

const sightings = collection(db, 'sightings');
// What the family sees: the area and time only, never the volunteer or their exact location
const lastSeenDoc = (reportId: string) => doc(db, 'reports', reportId, 'seen', 'last');

export type LastSeen = { area: string; at: number };
const lastSent = new Map<string, number>(); // reportId → time of the last write

// Writes a sighting and returns true, or returns false without writing when:
// not logged in, no location yet (Sighting.location is required), or the same report was sent under 10 s ago.
// location defaults to the volunteer's latest location from volunteers.ts.
export async function addSighting(
  reportId: string,
  rssi: number,
  location: Point | null = lastVolunteerLocation(),
): Promise<boolean> {
  const volunteerId = auth.currentUser?.uid;
  if (!volunteerId || !location) return false;
  const at = Date.now();
  if (at - (lastSent.get(reportId) ?? 0) < SIGHTING_EVERY_MS) return false;
  lastSent.set(reportId, at); // set before the write, so a refused write is not retried on every packet
  const s: Omit<Sighting, 'id'> = { reportId, volunteerId, rssi, at, area: areaOf(location), location };
  const batch = writeBatch(db);
  batch.set(doc(sightings), s);
  batch.set(lastSeenDoc(reportId), { area: s.area, at });
  await batch.commit();
  return true;
}

// Sightings of one report, live, newest first. Returns the unsubscribe function.
// Sorted here, not in the query: where + orderBy on two fields would need a Firestore index.
export function subscribeSightings(
  reportId: string,
  onChange: (sightings: Sighting[]) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    query(sightings, where('reportId', '==', reportId)),
    (snap) => onChange(snap.docs.map((d) => ({ ...(d.data() as Omit<Sighting, 'id'>), id: d.id })).sort((a, b) => b.at - a.at)),
    onError,
  );
}

// Where the bracelet of the family's report was last heard, live. null until a volunteer hears it.
export function subscribeLastSeen(reportId: string, onChange: (seen: LastSeen | null) => void): () => void {
  return onSnapshot(
    lastSeenDoc(reportId),
    (d) => onChange(d.exists() ? (d.data() as LastSeen) : null),
    () => onChange(null),
  );
}
