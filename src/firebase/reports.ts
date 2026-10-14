// Reports in Firestore. Same shape as Report in mock.ts, except health, the family phone and the photo live in
// reports/{id}/private/health, private/contact and private/photo: rules work per document, so this is the only
// way to show them to the assigned volunteer alone.
import {
  collection, doc, getDoc, getDocs, onSnapshot, query, runTransaction, updateDoc, where, writeBatch, type DocumentSnapshot,
} from 'firebase/firestore';
import { auth, db } from './index';
import type { ClosedAs, Health, Point, Report } from '../mock';
import { addHearing, relayPlace } from '../ble/relay';
import { areaOf } from './volunteers';

export type NewReport = Omit<Report, 'id' | 'createdAt' | 'status' | 'assignedVolunteerId' | 'closedAs' | 'closedAt' | 'phone'> & {
  phone?: string | null;
  code?: string; // handover code (6 digits, children only), shown in the family app
};

const reports = collection(db, 'reports');
const healthDoc = (id: string) => doc(db, 'reports', id, 'private', 'health');
const contactDoc = (id: string) => doc(db, 'reports', id, 'private', 'contact');
const photoDoc = (id: string) => doc(db, 'reports', id, 'private', 'photo');
// The code is the document id, so the rules can check a typed code with exists() while volunteers cannot read it
const handoverDoc = (id: string, code: string) => doc(db, 'reports', id, 'handover', code);
// Reports as listed and followed: health, phone and photo stay in their own documents, so they are always null here
const toReport = (d: DocumentSnapshot): Report => ({
  ...(d.data() as Omit<Report, 'id' | 'health' | 'phone' | 'photo'>), id: d.id, health: null, phone: null, photo: null,
});

// At most REPORTS_PER_WINDOW reports per family in REPORT_WINDOW_MS (also in the rules: keep both in sync)
const REPORT_WINDOW_MS = 10 * 60_000;
const REPORTS_PER_WINDOW = 5;

export async function createReport({ health, phone, photo, code, ...r }: NewReport): Promise<string> {
  // familyId: the rules let only this family follow and close its report
  const familyId = auth.currentUser?.uid;
  if (!familyId) throw new Error('not logged in');
  const createdAt = Date.now();
  // The limit document reportLimits/{family} = { start, n, at } moves in the same batch as the report
  const limitRef = doc(db, 'reportLimits', familyId);
  const old = (await getDoc(limitRef)).data() as { start: number; n: number } | undefined;
  const fresh = !old || createdAt >= old.start + REPORT_WINDOW_MS;
  if (!fresh && old.n >= REPORTS_PER_WINDOW) throw new Error('too many reports');
  const ref = doc(reports);
  const batch = writeBatch(db);
  batch.set(limitRef, fresh ? { start: createdAt, n: 1, at: createdAt } : { start: old.start, n: old.n + 1, at: createdAt });
  batch.set(ref, {
    ...r, familyId, createdAt, status: 'open', assignedVolunteerId: null, closedAs: null, closedAt: null, hasCode: !!code,
  });
  if (health) batch.set(healthDoc(ref.id), health);
  if (phone) batch.set(contactDoc(ref.id), { phone });
  if (photo) batch.set(photoDoc(ref.id), { photo });
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

// The photo, for the assigned volunteer (only after accepting) and security
export async function getReportPhoto(id: string): Promise<string | null> {
  return (await getDoc(photoDoc(id))).data()?.photo ?? null;
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
// securityPoint: where security keeps them (zone and pavilion), shown to the family
export async function closeReport(id: string, closedAs: ClosedAs, handover?: string, securityPoint?: string): Promise<void> {
  const keep = closedAs === 'security';
  const batch = writeBatch(db);
  batch.update(doc(reports, id), { status: 'closed', closedAs, closedAt: Date.now(), ...(handover ? { handover } : {}), ...(securityPoint ? { securityPoint } : {}) });
  if (handover) batch.delete(handoverDoc(id, handover));
  if (!keep) batch.delete(healthDoc(id));
  if (!keep) batch.delete(contactDoc(id));
  if (!keep) batch.delete(photoDoc(id));
  batch.delete(doc(db, 'reports', id, 'seen', 'last'));
  await batch.commit();
}

// Security handed the person to the family at the security point (after checking ID): now wipe the rest
export async function reuniteAtSecurity(id: string): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(reports, id), { reunitedAt: Date.now() });
  batch.delete(healthDoc(id));
  batch.delete(contactDoc(id));
  batch.delete(photoDoc(id));
  await batch.commit();
}

// A volunteer's phone heard an emergency press from a bracelet no family holds: every volunteer who hears the
// same press writes to the same report, sos_<bracelet>_<press count>, adding their location to its place.
// A bracelet a family holds is left to the family app (it gives the family 15 s to cancel a press by mistake).
// ponytail: a held bracelet out of its family's range sends nothing; relay those too if that case matters
export async function relaySos(mac: string, count: number, rssi: number, at: Point): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  // A free bracelet reads as "does not exist"; one a family holds is refused (only that family may read it)
  const held = await getDoc(doc(db, 'bracelets', mac)).then((d) => d.exists(), () => true);
  if (held) return;
  const ref = doc(reports, `sos_${mac}_${count}`);
  await runTransaction(db, async (tx) => {
    const old = (await tx.get(ref)).data() as Report | undefined;
    if (old && (old.status !== 'open' || !old.relay || old.relay.by.includes(uid))) return;
    const relay = addHearing(old?.relay ?? null, uid, rssi, at);
    const location = relayPlace(relay);
    if (old) {
      tx.update(ref, { relay, location, area: areaOf(location) });
      return;
    }
    // Nothing is known about the wearer but the bracelet: the volunteer goes to the place and sees.
    // ponytail: kind 'elder' is a guess (children's bracelets are always held by a family)
    tx.set(ref, {
      type: 'emergency', braceletId: mac, member: { name: `صاحب السوار ${mac.slice(-4)}`, kind: 'elder', age: 0 },
      description: '', area: areaOf(location), location, createdAt: Date.now(), familyId: null,
      status: 'open', assignedVolunteerId: null, closedAs: null, closedAt: null, relay,
    });
  });
}
