// The family's members (bracelet wearers), several per family account: members/{id} with familyId.
// Same shape as Member in mock.ts, plus familyId so the rules and security can match it.
import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { auth, db } from './index';
import { braceletOfToken } from './passerby';
import type { Member } from '../mock';

const members = collection(db, 'members');
const me = () => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('not logged in');
  return uid;
};

// Saves a new member (no id) or replaces an existing one; returns its id
export async function saveMember({ id, ...m }: Omit<Member, 'id'> & { id?: string }): Promise<string> {
  const ref = id ? doc(members, id) : doc(members);
  await setDoc(ref, { ...m, familyId: me() });
  return ref.id;
}

export async function loadMembers(): Promise<Member[]> {
  const snap = await getDocs(query(members, where('familyId', '==', me())));
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as Member);
}

export const deleteMember = (id: string) => deleteDoc(doc(members, id));

// A volunteer who scanned a bracelet's sticker (nasij://bracelet?t=<token>) sees its member, health and phone included.
// The token proves they hold the bracelet: it goes to volunteerScans/{uid} first, and the rules let a volunteer
// read only the member on that token's bracelet, for 10 minutes. null: unknown sticker or no member on it.
export async function memberOfSticker(token: string): Promise<Member | null> {
  const mac = await braceletOfToken(token);
  if (!mac) return null;
  await setDoc(doc(db, 'volunteerScans', me()), { token, at: Date.now() });
  const snap = await getDocs(query(members, where('braceletId', '==', mac)));
  const d = snap.docs[0];
  return d ? ({ ...d.data(), id: d.id } as Member) : null;
}
