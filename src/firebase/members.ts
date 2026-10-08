// The family's members (bracelet wearers), several per family account: members/{id} with familyId.
// Same shape as Member in mock.ts, plus familyId so the rules and security can match it.
import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { auth, db } from './index';
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
