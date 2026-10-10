// Live check of the Firebase functions against the real database, no phone needed.
// Run: node src/firebase/check.mjs <test email> <password>
// The email gets an account on first run, like the app login. Prints OK, or the step that failed.
// Add a few lines here when you write a new function (sightings, passer-by).
import assert from 'node:assert';
import { registerHooks } from 'node:module';

// Node needs file extensions on imports; the app code leaves them out, so try .ts for it
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (e) {
      for (const ext of ['.ts', '/index.ts']) {
        try { return next(spec + ext, ctx); } catch {}
      }
      throw e;
    }
  },
});

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.log('Run: node src/firebase/check.mjs <test email> <password>');
  process.exit(1);
}

const { createUserWithEmailAndPassword, signInWithEmailAndPassword } = await import('firebase/auth');
const { doc, setDoc } = await import('firebase/firestore');
const { auth, db } = await import('./index');
const r = await import('./reports');

const step = async (name, fn) => {
  try {
    const out = await fn();
    console.log('  ✓', name);
    return out;
  } catch (e) {
    console.log('  ✗', name);
    throw e;
  }
};
const role = (name) => setDoc(doc(db, 'users', auth.currentUser.uid), { email, role: name }, { merge: true });

await step('login', () =>
  signInWithEmailAndPassword(auth, email, password).catch(() => createUserWithEmailAndPassword(auth, email, password)),
);

// One account plays the family, then the volunteer
await step('family role', () => role('family'));
const id = await step('family creates a report', () =>
  r.createReport({
    type: 'lost', braceletId: 'TEST00000000', member: { name: 'اختبار', kind: 'child', age: 5 },
    photo: null, description: 'check.mjs', health: { condition: 'Asthma', notes: 'inhaler' }, area: 'test', location: null,
  }),
);

await step('volunteer role', () => role('volunteer'));
await step('open reports list it, without health', async () => {
  const open = await new Promise((res, rej) => {
    const stop = r.subscribeOpenReports((list) => (stop(), res(list)));
    setTimeout(() => rej(new Error('no answer in 10 s')), 10_000);
  });
  assert(open.some((x) => x.id === id && x.health === null));
});
await step('volunteer accepts it', async () => assert.equal(await r.acceptReport(id, auth.currentUser.uid), true));
await step('a second accept is refused', async () => assert.equal(await r.acceptReport(id, auth.currentUser.uid), false));
await step('assigned volunteer reads health', async () => assert.equal((await r.getReportHealth(id))?.condition, 'Asthma'));
await step('close deletes health', async () => {
  await r.closeReport(id, 'found');
  assert.equal(await r.getReportHealth(id), null);
});

// Person 3: volunteer duty, sightings and passer-by (the account is still a volunteer here)
const { getDoc } = await import('firebase/firestore');
const { signOut } = await import('firebase/auth');
const v = await import('./volunteers');
const sg = await import('./sightings');
const pb = await import('./passerby');
const first = (subscribe) =>
  new Promise((res, rej) => {
    const stop = subscribe((list) => (stop(), res(list)), rej);
    setTimeout(() => rej(new Error('no answer in 10 s')), 10_000);
  });
const vDoc = () => doc(db, 'volunteers', auth.currentUser.uid);
const SITE = { latitude: 24.909, longitude: 46.705 }; // central plaza

await step('volunteer goes on duty with a location', async () => {
  await v.goOnDuty();
  await v.updateVolunteerLocation(SITE);
  const d = await getDoc(vDoc());
  assert.equal(d.data()?.onDuty, true);
  assert.equal(d.data()?.area, 'الساحة المركزية');
});
await step('volunteer adds a sighting', async () => assert.equal(await sg.addSighting(id, -72), true));
await step('a second sighting within 10 s is skipped', async () => assert.equal(await sg.addSighting(id, -70), false));
await step('sightings of the report list it', async () => {
  const list = await first((ok, err) => sg.subscribeSightings(id, ok, err));
  assert(list.some((s) => s.rssi === -72 && s.area === 'الساحة المركزية'));
});
await step('off duty deletes the volunteer document', async () => {
  await v.goOffDuty();
  assert.equal((await getDoc(vDoc())).exists(), false);
});

const since = Date.now() - 1000;
// A new made-up bracelet each run, so the 2-per-15-minutes limit of an earlier run does not apply
const B = Array.from({ length: 12 }, () => '0123456789ABCDEF'[Math.floor(Math.random() * 16)]).join('');
await step('passer-by with no login reports a bracelet, twice', async () => {
  await signOut(auth);
  assert.equal(typeof (await pb.createPasserbyReport(B, null)), 'string');
  assert.equal(typeof (await pb.createPasserbyReport(B.toLowerCase(), null)), 'string');
});
await step('a third report in 15 minutes is skipped', async () => assert.equal(await pb.createPasserbyReport(B, null), null));
await step('restarting the window by hand is refused by the rules', async () => {
  const { collection, writeBatch } = await import('firebase/firestore');
  const at = Date.now();
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'passerbyReports')), { braceletId: B, at, location: null });
  batch.set(doc(db, 'passerbyLimits', B), { start: at, n: 1, at });
  await assert.rejects(() => batch.commit());
});
await step('a bad bracelet number is refused', () =>
  assert.rejects(() => pb.createPasserbyReport('12345', null)),
);
await step('no login: a passer-by cannot read reports', () =>
  assert.rejects(() => first((ok, err) => pb.subscribePasserbyReports(B, since, ok, err))),
);
await step('volunteer sees the passer-by reports', async () => {
  await signInWithEmailAndPassword(auth, email, password);
  const list = await first((ok, err) => pb.subscribePasserbyReports(B, since, ok, err));
  assert.equal(list.length, 2);
});

console.log('OK');
process.exit(0);
