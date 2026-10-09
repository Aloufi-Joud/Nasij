// The account holder's own details (guardian name and phone), kept in users/{uid} next to the role.
// The phone fills in new members and is the fallback contact on a report.
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, verifyBeforeUpdateEmail } from 'firebase/auth';
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

// Changing the email or password needs the current password again (Firebase asks for a recent sign-in).
export async function confirmPassword(current: string) {
  const user = auth.currentUser;
  if (!user?.email) throw new Error('not logged in');
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
}

// Call right after confirmPassword
export const changePassword = (password: string) => updatePassword(auth.currentUser!, password);

// A new email only takes over once its owner opens the link sent to it
export async function changeEmail(current: string, email: string) {
  await confirmPassword(current);
  await verifyBeforeUpdateEmail(auth.currentUser!, email);
}
