// Passer-by reports (Person 3). Same shape as PasserbyReport in mock.ts.
// The passer-by page (web/report) calls createPasserbyReport with no login: the rules allow
// exactly three fields, braceletId (12 characters), at and location, and nothing else.
// No imports from src/ble here: the web page cannot load the Bluetooth library.
import { addDoc, collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './index';
import type { PasserbyReport, Point } from '../mock';

const passerby = collection(db, 'passerbyReports');

// Bracelet number as printed: 12 hex characters, upper case. null if the text is not one.
export function braceletNumber(text: string | null | undefined): string | null {
  const clean = (text ?? '').toUpperCase().replace(/[^0-9A-F]/g, '');
  return clean.length === 12 ? clean : null;
}

export async function createPasserbyReport(braceletId: string, location: Point | null): Promise<string> {
  const id = braceletNumber(braceletId);
  if (!id) throw new Error('bad bracelet number');
  const r: Omit<PasserbyReport, 'id'> = { braceletId: id, at: Date.now(), location };
  const ref = await addDoc(passerby, r);
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
