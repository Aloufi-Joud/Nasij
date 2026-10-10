// Makes the secret token for each bracelet's NFC/QR sticker, and prints the link to write on it.
// A passer-by report is accepted only with a known token (firestore.rules), so nobody can report bracelets
// by guessing their printed numbers. Running it again for a bracelet replaces its token: do that if a sticker
// is lost or copied, then rewrite the sticker.
// Run (same service account as scripts/cleanup.mjs, never commit the key file):
//   cd /tmp/tokens && npm init -y && npm install firebase-admin
//   FIREBASE_SERVICE_ACCOUNT="$(cat key.json)" REPORT_URL=https://<report page> node tokens.mjs 785005002D12 ...
import { randomBytes } from 'node:crypto';
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const BASE = process.env.REPORT_URL ?? 'https://<report page>';
const bracelets = process.argv.slice(2).map((b) => b.toUpperCase().replace(/[^0-9A-F]/g, ''));
if (!bracelets.length || bracelets.some((b) => b.length !== 12)) {
  console.log('Run: node tokens.mjs <12-character bracelet number> ...');
  process.exit(1);
}

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

for (const braceletId of bracelets) {
  // 22 characters from 62 = about 130 bits: cannot be guessed
  const token = Array.from(randomBytes(22), (x) => ALPHABET[x % ALPHABET.length]).join('');
  const batch = db.batch();
  for (const old of (await db.collection('braceletTokens').where('braceletId', '==', braceletId).get()).docs) batch.delete(old.ref);
  batch.set(db.doc(`braceletTokens/${token}`), { braceletId });
  await batch.commit();
  console.log(`${braceletId}  ${BASE}/?t=${token}`);
}
process.exit(0);
