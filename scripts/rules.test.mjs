// Allow/deny checks for firestore.rules on the local emulator. Every case starts from the same seed.
// Run: npx firebase-tools emulators:exec --only firestore "node --test scripts/rules.test.mjs"
import { readFileSync } from 'node:fs';
import { test, before, beforeEach, after } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';

const MINE = 'AAAAAAAAAAAA'; // bracelet held by family "fam"
const THEIRS = 'BBBBBBBBBBBB'; // held by "fam2"
const FREE = 'CCCCCCCCCCCC'; // nobody holds it
const now = () => Date.now();
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-nasij',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const t = now();
    const set = (path, data) => db.doc(path).set(data);
    await Promise.all([
      set('users/fam', { role: 'family' }),
      set('users/fam2', { role: 'family' }),
      set('users/vol', { role: 'volunteer' }),
      set('users/vol2', { role: 'volunteer' }),
      set('users/sec', { role: 'security' }),
      set('members/m1', { familyId: 'fam', name: 'سارة' }),
      set(`bracelets/${MINE}`, { familyId: 'fam', at: t }),
      set(`bracelets/${THEIRS}`, { familyId: 'fam2', at: t }),
      // r1: open child case; r2: child case a volunteer took; r3: closed case
      set('reports/r1', { familyId: 'fam', status: 'open', assignedVolunteerId: null, hasCode: true }),
      set('reports/r1/private/health', { condition: 'ربو' }),
      set('reports/r2', { familyId: 'fam', status: 'searching', assignedVolunteerId: 'vol', hasCode: true }),
      set('reports/r2/private/health', { condition: 'ربو' }),
      set('reports/r2/handover/654321', {}),
      set('reports/r3', { familyId: 'fam', status: 'closed', assignedVolunteerId: 'vol' }),
      set('reports/r3/private/health', { condition: 'ربو' }),
      set('braceletTokens/tok1', { braceletId: MINE }),
      set('zones/z1', { name: 'منطقة' }),
    ]);
  });
});

const as = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
const allow = (name, fn) => test(`allow: ${name}`, () => assertSucceeds(fn()));
const deny = (name, fn) => test(`deny: ${name}`, () => assertFails(fn()));

// A family report goes in one batch with its reportLimits counter
function newReport(uid, extra = {}) {
  const db = as(uid);
  const t = now();
  const b = db.batch();
  b.set(db.doc(`reportLimits/${uid}`), { start: t, n: 1, at: t });
  b.set(db.doc('reports/new'), {
    familyId: uid, status: 'open', assignedVolunteerId: null, type: 'lost', createdAt: t,
    braceletId: MINE, description: 'قميص أزرق', area: 'منطقة', member: { name: 'سارة' }, ...extra,
  });
  return b.commit();
}

// A passer-by report: the report, the sticker claim and the per-bracelet counter in one batch
function passerby(token, { claim = true } = {}) {
  const db = as(null);
  const t = now();
  const b = db.batch();
  b.set(db.doc('passerbyReports/p1'), { braceletId: MINE, at: t, location: null });
  if (claim) b.set(db.doc('passerbyClaims/p1'), { token });
  b.set(db.doc(`passerbyLimits/${MINE}`), { start: t, n: 1, at: t });
  return b.commit();
}

const close = (uid, id, closedAs, handover) =>
  as(uid).doc(`reports/${id}`).update({ status: 'closed', closedAs, closedAt: now(), ...(handover ? { handover } : {}) });

// Users and roles
allow('a user reads their own profile', () => as('fam').doc('users/fam').get());
deny('a family reads another user', () => as('fam').doc('users/fam2').get());
allow('security reads any user', () => as('sec').doc('users/fam').get());
allow('a new user picks the family role', () => as('newbie').doc('users/newbie').set({ role: 'family' }));
deny('a user makes themselves security', () => as('newbie').doc('users/newbie').set({ role: 'security' }));
deny('a user writes someone else\'s profile', () => as('fam').doc('users/fam2').set({ role: 'family' }));
deny('a name over 60 characters', () => as('newbie').doc('users/newbie').set({ role: 'family', name: 'x'.repeat(61) }));

// Family members (health and phone live here)
allow('a family reads its own member', () => as('fam').doc('members/m1').get());
deny('another family reads the member', () => as('fam2').doc('members/m1').get());
deny('a volunteer reads a member', () => as('vol').doc('members/m1').get());
allow('security reads a member', () => as('sec').doc('members/m1').get());
allow('a family adds a member', () => as('fam').doc('members/m2').set({ familyId: 'fam', name: 'علي' }));
deny('a family adds a member to another family', () => as('fam').doc('members/m2').set({ familyId: 'fam2', name: 'علي' }));
deny('a description over 300 characters', () => as('fam').doc('members/m2').set({ familyId: 'fam', description: 'x'.repeat(301) }));
deny('another family deletes the member', () => as('fam2').doc('members/m1').delete());
deny('a family hands its member to another family', () => as('fam').doc('members/m1').update({ familyId: 'fam2' }));

// Bracelet locks: one family per bracelet
allow('a family reads its own bracelet lock', () => as('fam').doc(`bracelets/${MINE}`).get());
deny('a family reads another family\'s lock', () => as('fam2').doc(`bracelets/${MINE}`).get());
allow('a family checks a free bracelet', () => as('fam2').doc(`bracelets/${FREE}`).get());
allow('a family links a free bracelet', () => as('fam2').doc(`bracelets/${FREE}`).set({ familyId: 'fam2', at: now() }));
deny('a family takes a bracelet another family holds', () => as('fam2').doc(`bracelets/${MINE}`).set({ familyId: 'fam2', at: now() }));
deny('a link with a made-up time', () => as('fam2').doc(`bracelets/${FREE}`).set({ familyId: 'fam2', at: now() - 3600000 }));
allow('security frees a bracelet', () => as('sec').doc(`bracelets/${MINE}`).delete());

// Reports
allow('a family reports its own bracelet', () => newReport('fam'));
deny('a family reports a bracelet it does not hold', () => newReport('fam', { braceletId: THEIRS }));
deny('a photo inside the report (every volunteer reads it)', () => newReport('fam', { photo: 'data:image/png;base64,AAAA' }));
deny('a report without the rate-limit counter', () => as('fam').doc('reports/new').set({
  familyId: 'fam', status: 'open', assignedVolunteerId: null, braceletId: '', createdAt: now(), member: { name: 'سارة' },
}));
allow('a volunteer reads an open report', () => as('vol').doc('reports/r1').get());
deny('another family reads the report', () => as('fam2').doc('reports/r1').get());
deny('a volunteer reads a closed report', () => as('vol').doc('reports/r3').get());
allow('a volunteer takes an open case', () => as('vol').doc('reports/r1').update({ status: 'searching', assignedVolunteerId: 'vol', acceptedAt: now() }));
deny('a volunteer gives the case to someone else', () => as('vol').doc('reports/r1').update({ status: 'searching', assignedVolunteerId: 'vol2', acceptedAt: now() }));
deny('a volunteer edits the report while taking it', () => as('vol').doc('reports/r1').update({ status: 'searching', assignedVolunteerId: 'vol', acceptedAt: now(), description: 'x' }));
allow('the volunteer hands the child over with the right code', () => close('vol', 'r2', 'found', '654321'));
deny('the volunteer hands the child over with a wrong code', () => close('vol', 'r2', 'found', '000000'));
allow('the volunteer hands the child to security', () => close('vol', 'r2', 'security'));
deny('a child\'s case closed as "helped on the spot"', () => close('vol', 'r2', 'helped'));
deny('a volunteer closes a case that is not theirs', () => close('vol2', 'r2', 'security'));
allow('the family closes its own case', () => close('fam', 'r1', 'found'));

// Private documents: health, phone, photo
allow('the assigned volunteer reads the health note', () => as('vol').doc('reports/r2/private/health').get());
deny('another volunteer reads the health note', () => as('vol2').doc('reports/r2/private/health').get());
deny('a volunteer reads health before taking the case', () => as('vol').doc('reports/r1/private/health').get());
deny('the volunteer reads health after the case closed', () => as('vol').doc('reports/r3/private/health').get());
allow('security reads the health note', () => as('sec').doc('reports/r2/private/health').get());
allow('the family reads its health note', () => as('fam').doc('reports/r2/private/health').get());
deny('the volunteer reads the handover code', () => as('vol').doc('reports/r2/handover/654321').get());
allow('the family reads its handover code', () => as('fam').doc('reports/r2/handover/654321').get());

// Sightings: volunteers write, only security reads
const sighting = (volunteerId) => ({ volunteerId, reportId: 'r1', at: now(), location: null });
allow('a volunteer logs a sighting for an open case', () => as('vol').doc('sightings/s1').set(sighting('vol')));
deny('a volunteer logs a sighting in someone else\'s name', () => as('vol').doc('sightings/s1').set(sighting('vol2')));
deny('a volunteer reads sightings', () => as('vol').collection('sightings').get());
allow('security reads sightings', () => as('sec').collection('sightings').get());

// Passer-by page (no login)
allow('a passer-by reports from the sticker', () => passerby('tok1'));
deny('a passer-by with a wrong token', () => passerby('guess'));
deny('a passer-by report without the sticker claim', () => passerby('tok1', { claim: false }));
deny('a passer-by reads reports', () => as(null).doc('reports/r1').get());
deny('anyone lists the sticker tokens', () => as(null).collection('braceletTokens').get());
allow('the page reads its own sticker token', () => as(null).doc('braceletTokens/tok1').get());

// Volunteers' on-duty location
allow('a volunteer writes their own status', () => as('vol').doc('volunteers/vol').set({ onDuty: true, at: now() }));
deny('a family pretends to be on duty', () => as('fam').doc('volunteers/fam').set({ onDuty: true, at: now() }));
deny('a family reads volunteers\' locations', () => as('fam').doc('volunteers/vol').get());
allow('anyone reads the event zones', () => as(null).doc('zones/z1').get());
