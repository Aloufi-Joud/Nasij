// Reports in Firestore. Same shape as Report in mock.ts, except health and the family phone live in
// reports/{id}/private/health and private/contact: rules work per document, so this is the only way
// to show them to the assigned volunteer alone.
import {
  collection, doc, getDoc, getDocs, onSnapshot, query, runTransaction, updateDoc, where, writeBatch, type DocumentSnapshot,
} from 'firebase/firestore';
import { auth, db } from './index';
import type { ClosedAs, Health, Report } from '../mock';

export type NewReport = Omit<Report, 'id' | 'createdAt' | 'status' | 'assignedVolunteerId' | 'closedAs' | 'closedAt' | 'phone'> & {
  phone?: string | null;
  code?: string; // handover code (6 digits, children only), shown in the family app
};

const reports = collection(db, 'reports');
const healthDoc = (id: string) => doc(db, 'reports', id, 'private', 'health');
const contactDoc = (id: string) => doc(db, 'reports', id, 'private', 'contact');
// The code is the document id, so the rules can check a typed code with exists() while volunteers cannot read it
const handoverDoc = (id: string, code: string) => doc(db, 'reports', id, 'handover', code);
// Reports as listed and followed: health and phone stay in their own documents, so they are always null here
const toReport = (d: DocumentSnapshot): Report => ({
  ...(d.data() as Omit<Report, 'id' | 'health' | 'phone'>), id: d.id, health: null, phone: null,
});

export async function createReport({ health, phone, code, ...r }: NewReport): Promise<string> {
  const ref = doc(reports);
  const batch = writeBatch(db);
  // familyId: the rules let only this family follow and close its report
  const familyId = auth.currentUser?.uid ?? null;
  batch.set(ref, {
    ...r, familyId, createdAt: Date.now(), status: 'open', assignedVolunteerId: null, closedAs: null, closedAt: null, hasCode: !!code,
  });
  if (health) batch.set(healthDoc(ref.id), health);
  if (phone) batch.set(contactDoc(ref.id), { phone });
  if (code) batch.set(handoverDoc(ref.id, code), {});
  await batch.commit();
  return ref.id;
}

// Open and searching reports, newest first, without health. Returns the unsubscribe function.
export function subscribeOpenReports(onChange: (reports: Report[]) => void): () => void {
  return onSnapshot(query(reports, where('status', 'in', ['open', 'searching'])), (snap) =>
    onChange(snap.docs.map(toReport).sort((a, b) => b.createdAt - a.createdAt)),
  );
}

// This family's open and searching reports, so they come back after the app restarts
export async function loadMyOpenReports(): Promise<Report[]> {
  const familyId = auth.currentUser?.uid;
  if (!familyId) return [];
  const snap = await getDocs(query(reports, where('familyId', '==', familyId), where('status', 'in', ['open', 'searching'])));
  return snap.docs.map(toReport).sort((a, b) => b.createdAt - a.createdAt);
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
    tx.update(snap.ref, { status: 'searching', assignedVolunteerId: volunteerId, acceptedAt: Date.now() });
    return true;
  });
}

// Only the assigned volunteer (and security) may read this once rules are on
export async function getReportHealth(id: string): Promise<Health | null> {
  const snap = await getDoc(healthDoc(id));
  return snap.exists() ? (snap.data() as Health) : null;
}

// Family phone, for the assigned volunteer
export async function getReportPhone(id: string): Promise<string | null> {
  return (await getDoc(contactDoc(id))).data()?.phone ?? null;
}

// The family's own handover code, to show it again after a restart (volunteers cannot read it)
export async function getHandoverCode(id: string): Promise<string | null> {
  const snap = await getDocs(collection(db, 'reports', id, 'handover'));
  return snap.docs[0]?.id ?? null;
}

// Security gives a case to a volunteer, or moves it to another one. The volunteer app picks it up by itself
export function assignReport(id: string, volunteerId: string): Promise<void> {
  return updateDoc(doc(reports, id), { status: 'searching', assignedVolunteerId: volunteerId, acceptedAt: Date.now() });
}

// Closing wipes what was only needed for the search: health, phone, photo and the last sighting
// handover: the code the volunteer typed, needed by the rules to close a child's report as 'found'.
// A wrong code fails with permission-denied.
// Handed to security: the person now waits at the security point, so the photo, health and family phone stay
// for security (volunteers can no longer read a closed report) until reuniteAtSecurity()
export async function closeReport(id: string, closedAs: ClosedAs, handover?: string): Promise<void> {
  const keep = closedAs === 'security';
  const batch = writeBatch(db);
  batch.update(doc(reports, id), { status: 'closed', closedAs, closedAt: Date.now(), ...(keep ? {} : { photo: null }), ...(handover ? { handover } : {}) });
  if (handover) batch.delete(handoverDoc(id, handover));
  if (!keep) batch.delete(healthDoc(id));
  if (!keep) batch.delete(contactDoc(id));
  batch.delete(doc(db, 'reports', id, 'seen', 'last'));
  await batch.commit();
}

// Security handed the person to the family at the security point (after checking ID): now wipe the rest
export async function reuniteAtSecurity(id: string): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(reports, id), { reunitedAt: Date.now(), photo: null });
  batch.delete(healthDoc(id));
  batch.delete(contactDoc(id));
  await batch.commit();
}
