// The family's member (the bracelet wearer), one per family account: members/{familyUid}.
// Same shape as Member in mock.ts, plus familyId so security can match it.
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './index';
import type { Member } from '../mock';

const memberDoc = () => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('not logged in');
  return doc(db, 'members', uid);
};

export const saveMember = (m: Omit<Member, 'id'>) => setDoc(memberDoc(), { ...m, familyId: auth.currentUser!.uid });

export async function loadMember(): Promise<Member | null> {
  const snap = await getDoc(memberDoc());
  return snap.exists() ? ({ ...snap.data(), id: snap.id } as Member) : null;
}

export const deleteMember = () => deleteDoc(memberDoc());
