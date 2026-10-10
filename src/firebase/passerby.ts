// Passer-by reports (Person 3). Same shape as PasserbyReport in mock.ts.
// The passer-by page (web/report) calls createPasserbyReport with no login: the rules allow
// exactly three fields, braceletId (12 characters), at and location, and nothing else.
// No imports from src/ble here: the web page cannot load the Bluetooth library.
import { collection, doc, getDoc, onSnapshot, query, where, writeBatch } from 'firebase/firestore';
import { db } from './index';
import type { PasserbyReport, Point } from '../mock';

const passerby = collection(db, 'passerbyReports');

// At most PER_WINDOW reports per bracelet in WINDOW_MS (also enforced by the rules: keep both in sync)
const WINDOW_MS = 15 * 60_000;
const PER_WINDOW = 2;

// Bracelet number as printed: 12 hex characters, upper case. null if the text is not one.
export function braceletNumber(text: string | null | undefined): string | null {
  const clean = (text ?? '').toUpperCase().replace(/[^0-9A-F]/g, '');
  return clean.length === 12 ? clean : null;
}

// Resolves with the report id, or null when this bracelet already has PER_WINDOW reports in the window:
// security has the recent reports, so the page can still say "sent".
export async function createPasserbyReport(braceletId: string, location: Point | null): Promise<string | null> {
  const id = braceletNumber(braceletId);
  if (!id) throw new Error('bad bracelet number');
  const r: Omit<PasserbyReport, 'id'> = { braceletId: id, at: Date.now(), location };
  // The limit document passerbyLimits/{bracelet} = { start, n, at } moves in the same batch as the report
  const limitRef = doc(db, 'passerbyLimits', id);
  const old = (await getDoc(limitRef)).data() as { start?: number; n?: number } | undefined;
  const fresh = !old?.start || r.at >= old.start + WINDOW_MS;
  if (!fresh && (old?.n ?? 0) >= PER_WINDOW) return null;
  const ref = doc(passerby);
  const batch = writeBatch(db);
  batch.set(ref, r);
  batch.set(limitRef, fresh ? { start: r.at, n: 1, at: r.at } : { start: old!.start, n: (old!.n ?? 0) + 1, at: r.at });
  await batch.commit();
  return ref.id;
}

// Passer-by reports for one bracelet, live, newest first (volunteer on that case; security reads all).
// Filtered by time here, not in the query: where on two fields would need a Firestore index.
export function subscribePasserbyReports(
  braceletId: string,
  since: number,
  onChange: (reports: PasserbyReport[]) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    query(passerby, where('braceletId', '==', braceletId.toUpperCase())),
    (snap) =>
      onChange(
        snap.docs
          .map((d) => ({ ...(d.data() as Omit<PasserbyReport, 'id'>), id: d.id }))
          .filter((p) => p.at >= since)
          .sort((a, b) => b.at - a.at),
      ),
    onError,
  );
}
