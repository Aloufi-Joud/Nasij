// Free stand-in for a scheduled Cloud Function (the Spark plan has none): GitHub Actions runs this every hour.
// Closes reports left open longer than MAX_OPEN_MS (the family never came back to close them) and deletes
// what only the search needed: health, phone, handover code, last-seen and the photo. Also deletes sightings
// and passer-by reports older than a day, since they hold locations. Cases handed to security get the same
// wipe after MAX_OPEN_MS if security never marked them as handed to the family.
// Needs the FIREBASE_SERVICE_ACCOUNT secret (see the brief, section 11). Run by .github/workflows/cleanup.yml.
import { cert, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const MAX_OPEN_MS = 6 * 60 * 60 * 1000;
const KEEP_LOCATIONS_MS = 24 * 60 * 60 * 1000;
// ponytail: a volunteer who stands still writes no location, so one still for an hour drops off the dashboard
// until they move; a heartbeat write would fix it, at the cost of free-plan writes
const VOLUNTEER_STALE_MS = 60 * 60 * 1000;
// No visit lasts this long: a family that left without "end of visit" frees the bracelet for the next one
const BRACELET_LOCK_MS = 12 * 60 * 60 * 1000;

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = getFirestore();
const now = Date.now();

let closed = 0;
const open = await db.collection('reports').where('status', 'in', ['open', 'searching']).get();
for (const report of open.docs) {
  if (report.data().createdAt > now - MAX_OPEN_MS) continue;
  const batch = db.batch();
  batch.update(report.ref, { status: 'closed', closedAs: 'expired', closedAt: now });
  for (const sub of ['private', 'handover', 'seen'])
    for (const d of (await report.ref.collection(sub).get()).docs) batch.delete(d.ref);
  await batch.commit();
  closed++;
}

// Handed to security but never marked as handed to the family: wipe what security kept for the handover
const atDesk = await db.collection('reports').where('closedAs', '==', 'security').get();
for (const report of atDesk.docs) {
  const r = report.data();
  if (r.reunitedAt || r.closedAt > now - MAX_OPEN_MS) continue;
  const batch = db.batch();
  batch.update(report.ref, { reunitedAt: now });
  for (const d of (await report.ref.collection('private').get()).docs) batch.delete(d.ref);
  await batch.commit();
  closed++;
}

let deleted = 0;
for (const name of ['sightings', 'passerbyReports', 'passerbyAlerts']) {
  const old = await db.collection(name).where('at', '<', now - KEEP_LOCATIONS_MS).get();
  for (const d of old.docs) {
    await d.ref.delete();
    if (name === 'passerbyReports') await db.doc(`passerbyClaims/${d.id}`).delete();
    deleted++;
  }
}

// Volunteers whose app was closed while on duty: their location must not stay (PDPL)
let gone = 0;
for (const v of (await db.collection('volunteers').get()).docs) {
  if ((v.data().at ?? 0) >= now - VOLUNTEER_STALE_MS) continue;
  await v.ref.delete();
  gone++;
}

let freed = 0;
for (const b of (await db.collection('bracelets').where('at', '<', now - BRACELET_LOCK_MS).get()).docs) {
  // The member who wore it shows no bracelet either, so the family app does not treat it as still theirs
  const wearers = await db.collection('members').where('familyId', '==', b.data().familyId).where('braceletId', '==', b.id).get();
  for (const m of wearers.docs) await m.ref.update({ braceletId: null });
  await b.ref.delete();
  freed++;
}

console.log(`closed ${closed} old reports, deleted ${deleted} old sightings and passer-by reports, ${gone} stale volunteers, freed ${freed} bracelets`);
