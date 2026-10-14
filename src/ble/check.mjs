// Self-check for the bracelet logic. Run: node src/ble/check.mjs
import assert from 'node:assert';
import { metresBetween } from '../components/geo.ts';
import { newPairing, pairStep } from './pairing.ts';
import { braceletMac, parseAlarm, summarize } from './signal.ts';
import { addHearing, newPress, relayPlace } from './relay.ts';

const MAC = '785005002D12';
const press = (count) => ({ frame: 0x21, count });

// Held close and pressed: linked
let p = newPairing(MAC, 0);
pairStep(p, 'id1', MAC, -50, null); // EA00 packet: learn the phone-side id
pairStep(p, 'id1', null, -50, press(4)); // first count = baseline
assert.equal(p.pressed, false);
pairStep(p, 'id1', null, -50, press(5));
assert.equal(p.pressed, true);

// Pressed from far away: does not count, a close press still works after
p = newPairing(MAC, 0);
pairStep(p, 'id1', MAC, -85, press(4));
pairStep(p, 'id1', null, -85, press(5));
assert.equal(p.pressed, false);
pairStep(p, 'id1', null, -55, press(5)); // same press, now close: still not new
assert.equal(p.pressed, false);
pairStep(p, 'id1', null, -55, press(6));
assert.equal(p.pressed, true);

// Another bracelet pressed next to the phone: ignored
p = newPairing(MAC, 0);
pairStep(p, 'id2', 'AAAAAAAAAAAA', -40, press(1));
pairStep(p, 'id2', null, -40, press(2));
assert.equal(p.pressed, false);

// Event boundary distance: 0.001 degrees of latitude is about 111 m
const d = metresBetween({ latitude: 24.774, longitude: 46.738 }, { latitude: 24.775, longitude: 46.738 });
assert.ok(Math.abs(d - 111) < 1, String(d));

// Direction (agreed method): last 3 vs average of 6, ±3 dB
assert.equal(summarize([-80, -80, -80, -70, -70, -70]).trend, 'approaching');
assert.equal(summarize([-70, -70, -70, -80, -80, -80]).trend, 'away');
assert.equal(summarize([-70, -71, -70, -71, -70, -71]).trend, 'steady');
assert.equal(summarize([-70, -72]).smooth, -71);

// Packets: MAC from the last 6 bytes of EA00, alarm from FEE0
const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const ea00 = { serviceData: { '0000ea00-0000-1000-8000-00805f9b34fb': b64([1, 2, 3, 0x78, 0x50, 0x05, 0x00, 0x2d, 0x12]) } };
assert.equal(braceletMac(ea00), MAC);
const fee0 = { serviceData: { '0000fee0-0000-1000-8000-00805f9b34fb': b64([0x21, 0x02, 0x01, 0x05]) } };
assert.deepEqual(parseAlarm(fee0), { frame: 0x21, triggered: true, count: 261 });

console.log('bracelet check ok');

// Volunteer relay: a new press is a count going up; the first packet counts only if its alarm flag is on
const counts = new Map();
assert.equal(newPress(counts, MAC, { frame: 0x21, triggered: false, count: 4 }), false);
assert.equal(newPress(counts, MAC, { frame: 0x21, triggered: true, count: 4 }), false);
assert.equal(newPress(counts, MAC, { frame: 0x21, triggered: true, count: 5 }), true);
assert.equal(newPress(counts, MAC, { frame: 0x23, triggered: true, count: 9 }), false);
assert.equal(newPress(new Map(), MAC, { frame: 0x21, triggered: true, count: 5 }), true);

// Two volunteers 100 m apart: the place leans towards the stronger signal, which gets the report first
let relay = addHearing(null, 'a', -80, { latitude: 24.9, longitude: 46.7 });
relay = addHearing(relay, 'b', -60, { latitude: 24.901, longitude: 46.7 });
const at = relayPlace(relay);
assert.equal(relay.best, 'b');
assert.deepEqual(relay.by, ['a', 'b']);
assert.ok(at.latitude > 24.9005 && at.latitude < 24.901, String(at.latitude));
