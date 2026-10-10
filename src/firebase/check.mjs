// Live check of the Firebase functions against the real database, no phone needed.
// Run: node src/firebase/check.mjs <test email> <password> [sticker token from scripts/tokens.mjs]
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

const [email, password, sticker] = process.argv.slice(2);
if (!email || !password) {
  console.log('Run: node src/firebase/check.mjs <test email> <password>');
  process.exit(1);
}

const { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } = await import('firebase/auth');
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
const role = (name) => setDoc(doc(db, 'users', auth.currentUser.uid), { email: auth.currentUser.email, role: name }, { merge: true });
const login = (e) => signInWithEmailAndPassword(auth, e, password).catch(() => createUserWithEmailAndPassword(auth, e, password));

await step('login', () => login(email));

// One account plays the family, then the volunteer
await step('family role', () => role('family'));
const br = await import('./bracelets');
await step('family links the test bracelet (a report needs a bracelet the family holds)', async () =>
  assert.equal(await br.claimBracelet('TEST00000000'), true),
);
await step("a report with someone else's bracelet is refused", () =>
  assert.rejects(() =>
    r.createReport({
      type: 'lost', braceletId: 'FFFFFFFFFFFF', member: { name: 'x', kind: 'child', age: 5 },
      photo: null, description: 'check.mjs', health: null, area: 'test', location: null,
    }),
  ),
);
await step('a report whose photo is a link is refused', () =>
  assert.rejects(() =>
    r.createReport({
      type: 'lost', braceletId: 'TEST00000000', member: { name: 'x', kind: 'child', age: 5 },
      photo: 'https://example.com/x.jpg', description: 'check.mjs', health: null, area: 'test', location: null,
    }),
  ),
);
const PHOTO = 'data:image/png;base64,iVBORw0KGgo=';
const id = await step('family creates a report with a photo', () =>
  r.createReport({
    type: 'lost', braceletId: 'TEST00000000', member: { name: 'اختبار', kind: 'child', age: 5 },
    photo: PHOTO, description: 'check.mjs', health: { condition: 'Asthma', notes: 'inhaler' }, area: 'test', location: null,
  }),
);

await step('volunteer role', () => role('volunteer'));
await step('open reports list it, without health or photo', async () => {
  const open = await new Promise((res, rej) => {
    const stop = r.subscribeOpenReports((list) => (stop(), res(list)));
    setTimeout(() => rej(new Error('no answer in 10 s')), 10_000);
  });
  assert(open.some((x) => x.id === id && x.health === null && x.photo === null));
});
// This account is also the report's family (which may read the photo), so the refusal needs a second account
await step('another volunteer cannot read the photo', async () => {
  await login(email.replace('@', '+volunteer@'));
  await role('volunteer');
  await assert.rejects(() => r.getReportPhoto(id));
  await login(email);
});
await step('volunteer accepts it', async () => assert.equal(await r.acceptReport(id, auth.currentUser.uid), true));
await step('a second accept is refused', async () => assert.equal(await r.acceptReport(id, auth.currentUser.uid), false));
await step('assigned volunteer reads health and photo', async () => {
  assert.equal((await r.getReportHealth(id))?.condition, 'Asthma');
  assert.equal(await r.getReportPhoto(id), PHOTO);
});

// Person 3: volunteer duty, sightings and passer-by (the account is still a volunteer here)
const { getDoc } = await import('firebase/firestore');
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
// Asked from the server: a live listener first answers from this phone's own copy of the sighting it just wrote
await step('a volunteer cannot read sightings (security only)', async () => {
  const { collection, getDocsFromServer, query, where } = await import('firebase/firestore');
  await assert.rejects(() => getDocsFromServer(query(collection(db, 'sightings'), where('reportId', '==', id))));
});
await step('off duty deletes the volunteer document', async () => {
  await v.goOffDuty();
  assert.equal((await getDoc(vDoc())).exists(), false);
});
// Closed last: sightings need an open report
await step('close deletes health and photo', async () => {
  await r.closeReport(id, 'found');
  assert.equal(await r.getReportHealth(id), null);
  assert.equal(await r.getReportPhoto(id), null);
});
// Free the test bracelet, so the next run (maybe with another account) can link it
await step('family releases the test bracelet', () => br.releaseBracelet('TEST00000000'));

const since = Date.now() - 1000;
await step('a made-up sticker is refused', async () => {
  await signOut(auth);
  await assert.rejects(() => pb.createPasserbyReport('MadeUpStickerToken0000', null));
});
await step('no login: a passer-by cannot read reports', () =>
  assert.rejects(() => first((ok, err) => pb.subscribePasserbyReports('785005002D12', since, ok, err))),
);
await step('a report without the sticker token is refused by the rules', async () => {
  const { collection, writeBatch } = await import('firebase/firestore');
  const at = Date.now();
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'passerbyReports')), { braceletId: '785005002D12', at, location: null });
  batch.set(doc(db, 'passerbyLimits', '785005002D12'), { start: at, n: 1, at });
  await assert.rejects(() => batch.commit());
});
if (sticker) {
  const bracelet = await pb.braceletOfToken(sticker);
  // The limit (2 per bracelet per window) may already be used by an earlier run: then it resolves with null
  const sent = await step('passer-by with no login reports from the sticker', async () => {
    assert(bracelet, 'unknown sticker token');
    return pb.createPasserbyReport(sticker, null);
  });
  if (sent) {
    await step('volunteer sees the passer-by report', async () => {
      await signInWithEmailAndPassword(auth, email, password);
      const list = await first((ok, err) => pb.subscribePasserbyReports(bracelet, since, ok, err));
      assert(list.some((p) => p.id === sent));
    });
  } else console.log('  - limit reached for this bracelet (2 per window, see WINDOW_MS in passerby.ts): run again later to see a report go through');
} else console.log('  - no sticker token given: skipped sending a real passer-by report');

console.log('OK');
process.exit(0);
