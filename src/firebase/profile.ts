// The account holder's own details (guardian name and phone), kept in users/{uid} next to the role.
// The phone fills in new members and is the fallback contact on a report.
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './index';

export type Profile = { name: string; phone: string };

const userDoc = () => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('not logged in');
  return doc(db, 'users', uid);
};

export async function loadProfile(): Promise<Profile> {
  const d = (await getDoc(userDoc())).data();
  return { name: d?.name ?? '', phone: d?.phone ?? '' };
}

export const saveProfile = (p: Profile) => setDoc(userDoc(), p, { merge: true });
