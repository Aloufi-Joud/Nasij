// Volunteer on-duty status and location in volunteers/{uid} (Person 3).
// Same shape as Volunteer in mock.ts. The document exists only while the volunteer is on duty:
// going off duty deletes it, so their location is not kept after the shift (PDPL).
// The security dashboard reads volunteers where onDuty == true.
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './index';
import { zones, type Language, type Point, type Volunteer } from '../mock';
import { metresBetween } from '../components/geo';

const volunteerDoc = (uid: string) => doc(db, 'volunteers', uid);

const WRITE_EVERY_MS = 30_000; // at most one location write per 30 s (free plan: 20k writes a day)
const NEAR_ZONE_M = 500; // further than this from every zone centre = outside the event

let duty: { uid: string; name: string } | null = null;
let last: Point | null = null; // latest location, also used by addSighting
let lastWrite = 0;

// Name of the event zone nearest to a point, '' when outside the event or unknown
export function areaOf(p: Point | null): string {
  if (!p) return '';
  const nearest = zones.reduce((a, b) => (metresBetween(p, b.center) < metresBetween(p, a.center) ? b : a));
  return metresBetween(p, nearest.center) <= NEAR_ZONE_M ? nearest.name : '';
}

export const lastVolunteerLocation = () => last;

async function write() {
  if (!duty || !last) return; // Volunteer.location is required: wait for the first location
  lastWrite = Date.now(); // set before the write, so a failing write is not retried on every update
  const v: Omit<Volunteer, 'id'> = { name: duty.name, onDuty: true, area: areaOf(last), location: last };
  const uid = duty.uid;
  await setDoc(volunteerDoc(uid), v);
  if (!duty) await deleteDoc(volunteerDoc(uid)); // went off duty while this write was on its way
}

// Also sets users/{uid}.role to volunteer: the header switch lets a family login open the volunteer
// side, and the rules check that role before showing open reports. Family access does not use the role.
// ponytail: when roles are assigned by staff (see the "later" list), this write will be refused: remove it then.
export async function goOnDuty(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('not logged in');
  await setDoc(doc(db, 'users', user.uid), { role: 'volunteer' }, { merge: true });
  duty = { uid: user.uid, name: user.email?.split('@')[0] || 'متطوع' };
  lastWrite = 0;
  await write();
}

// Call on every location update; writes only while on duty, and not more than every 30 s
export async function updateVolunteerLocation(p: Point): Promise<void> {
  last = p;
  if (!duty) return;
  if (lastWrite && Date.now() - lastWrite < WRITE_EVERY_MS) return;
  await write();
}

export async function goOffDuty(): Promise<void> {
  const d = duty;
  duty = null;
  last = null;
  if (d) await deleteDoc(volunteerDoc(d.uid));
}

// Languages the volunteer speaks, kept in users/{uid} so they survive the next login
export async function loadLanguages(): Promise<Language[] | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  return ((await getDoc(doc(db, 'users', uid))).data()?.languages as Language[] | undefined) ?? null;
}

export async function saveLanguages(languages: Language[]): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (uid) await setDoc(doc(db, 'users', uid), { languages }, { merge: true });
}
