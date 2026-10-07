// Reports in Firestore. Same shape as Report in mock.ts, except health lives in
// reports/{id}/private/health: rules work per document, so this is the only way
// to show health to the assigned volunteer alone.
import {
  collection, doc, getDoc, onSnapshot, query, runTransaction, where, writeBatch, type DocumentSnapshot,
} from 'firebase/firestore';
import { auth, db } from './index';
import type { ClosedAs, Health, Report } from '../mock';

export type NewReport = Omit<Report, 'id' | 'createdAt' | 'status' | 'assignedVolunteerId' | 'closedAs' | 'closedAt'>;

const reports = collection(db, 'reports');
const healthDoc = (id: string) => doc(db, 'reports', id, 'private', 'health');
// Reports as listed and followed: health stays in its own document, so it is always null here
const toReport = (d: DocumentSnapshot): Report => ({ ...(d.data() as Omit<Report, 'id' | 'health'>), id: d.id, health: null });

export async function createReport({ health, ...r }: NewReport): Promise<string> {
  const ref = doc(reports);
  const batch = writeBatch(db);
  // familyId: the rules let only this family follow and close its report
  const familyId = auth.currentUser?.uid ?? null;
  batch.set(ref, { ...r, familyId, createdAt: Date.now(), status: 'open', assignedVolunteerId: null, closedAs: null, closedAt: null });
  if (health) batch.set(healthDoc(ref.id), health);
  await batch.commit();
  return ref.id;
}

// Open and searching reports, newest first, without health. Returns the unsubscribe function.
export function subscribeOpenReports(onChange: (reports: Report[]) => void): () => void {
  return onSnapshot(query(reports, where('status', 'in', ['open', 'searching'])), (snap) =>
    onChange(snap.docs.map(toReport).sort((a, b) => b.createdAt - a.createdAt)),
  );
}

// One report, live (family status screen, volunteer case screen). null once deleted.
export function subscribeReport(id: string, onChange: (report: Report | null) => void): () => void {
  return onSnapshot(doc(reports, id), (d) =>
    onChange(d.exists() ? toReport(d) : null),
  );
}

// Transaction, so two volunteers tapping at once cannot both take the case.
// Returns false if someone else already took it.
export function acceptReport(id: string, volunteerId: string): Promise<boolean> {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(doc(reports, id));
    if (snap.data()?.status !== 'open') return false;
    tx.update(snap.ref, { status: 'searching', assignedVolunteerId: volunteerId });
    return true;
  });
}

// Only the assigned volunteer (and security) may read this once rules are on
export async function getReportHealth(id: string): Promise<Health | null> {
  const snap = await getDoc(healthDoc(id));
  return snap.exists() ? (snap.data() as Health) : null;
}

// Closing wipes what was only needed for the search: health and photo
export async function closeReport(id: string, closedAs: ClosedAs): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(reports, id), { status: 'closed', closedAs, closedAt: Date.now(), photo: null });
  batch.delete(healthDoc(id));
  await batch.commit();
}
