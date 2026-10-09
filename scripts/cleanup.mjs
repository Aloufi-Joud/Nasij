// Free stand-in for a scheduled Cloud Function (the Spark plan has none): GitHub Actions runs this every hour.
// Closes reports left open longer than MAX_OPEN_MS (the family never came back to close them) and deletes
// what only the search needed: health, phone, handover code, last-seen and the photo. Also deletes sightings
// and passer-by reports older than a day, since they hold locations.
// Needs the FIREBASE_SERVICE_ACCOUNT secret (see the brief, section 11). Run by .github/workflows/cleanup.yml.
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const MAX_OPEN_MS = 6 * 60 * 60 * 1000;
const KEEP_LOCATIONS_MS = 24 * 60 * 60 * 1000;

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();
const now = Date.now();

let closed = 0;
const open = await db.collection('reports').where('status', 'in', ['open', 'searching']).get();
for (const report of open.docs) {
  if (report.data().createdAt > now - MAX_OPEN_MS) continue;
  const batch = db.batch();
  batch.update(report.ref, { status: 'closed', closedAs: 'expired', closedAt: now, photo: null });
  for (const sub of ['private', 'handover', 'seen'])
    for (const d of (await report.ref.collection(sub).get()).docs) batch.delete(d.ref);
  await batch.commit();
  closed++;
}

let deleted = 0;
for (const name of ['sightings', 'passerbyReports']) {
  const old = await db.collection(name).where('at', '<', now - KEEP_LOCATIONS_MS).get();
  for (const d of old.docs) {
    await d.ref.delete();
    deleted++;
  }
}

console.log(`closed ${closed} old reports, deleted ${deleted} old sightings and passer-by reports`);
