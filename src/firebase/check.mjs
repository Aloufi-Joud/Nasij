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

console.log('OK');
process.exit(0);
