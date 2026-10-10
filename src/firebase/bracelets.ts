// Bracelet lock: bracelets/{mac} says which family holds the bracelet this visit.
// Call claimBracelet only after the press check in src/ble/pairing.ts.
import { deleteDoc, doc, runTransaction } from 'firebase/firestore';
import { auth, db } from './index';

const braceletDoc = (mac: string) => doc(db, 'bracelets', mac.toUpperCase());

// false if another family already holds it this visit
export function claimBracelet(mac: string): Promise<boolean> {
  const familyId = auth.currentUser?.uid;
  if (!familyId) return Promise.reject(new Error('not logged in'));
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(braceletDoc(mac));
    if (snap.exists() && snap.data().familyId !== familyId) return false;
    tx.set(braceletDoc(mac), { familyId, at: Date.now() });
    // A passer-by alert from an earlier visit is not this family's to see
    tx.delete(doc(db, 'passerbyAlerts', mac.toUpperCase()));
    return true;
  });
}

export const releaseBracelet = (mac: string) => deleteDoc(braceletDoc(mac));
