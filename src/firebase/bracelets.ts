// Bracelet lock: bracelets/{mac} says which family holds the bracelet this visit.
// Call claimBracelet only after the press check in src/ble/pairing.ts.
import { deleteDoc, doc, runTransaction } from 'firebase/firestore';
import { auth, db } from './index';

const braceletDoc = (mac: string) => doc(db, 'bracelets', mac.toUpperCase());

// false if another family already holds it this visit (the rules do not even let us read their lock)
export function claimBracelet(mac: string): Promise<boolean> {
  const familyId = auth.currentUser?.uid;
  if (!familyId) return Promise.reject(new Error('not logged in'));
  const claim = runTransaction(db, async (tx) => {
    const snap = await tx.get(braceletDoc(mac));
    if (snap.exists()) return snap.data().familyId === familyId; // already ours: keep the lock and its alert as they are
    tx.set(braceletDoc(mac), { familyId, at: Date.now() });
    // A passer-by alert from an earlier visit is not this family's to see
    tx.delete(doc(db, 'passerbyAlerts', mac.toUpperCase()));
    return true;
  });
  return claim.catch((e: { code?: string }) => {
    if (e.code === 'permission-denied') return false;
    throw e;
  });
}

export const releaseBracelet = (mac: string) => deleteDoc(braceletDoc(mac));
