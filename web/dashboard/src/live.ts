// Live data for the security dashboard, straight from Firestore, plus the site geometry.
// Security is allowed to see everything, health included.
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from '../../../src/firebase';
import { assignReport, getReportHealth, getReportPhone, getReportPhoto, reuniteAtSecurity, subscribeOpenReports } from '../../../src/firebase/reports';
import { zones, members as mockMembers, reports as mockReports, volunteers as mockVolunteers, passerbyReports as mockPasserby, type Member, type PasserbyAlert, type PasserbyReport, type Point, type Report, type Sighting, type Volunteer, type Zone } from '../../../src/mock';
import { metresBetween } from '../../../src/components/geo';

// Drawn Expo 2030 site, shared with MapView (approximation of the published masterplan, not survey data)
export const SITE = { center: { latitude: 24.909, longitude: 46.705 }, radius: 650 };

export const TYPE: Record<Report['type'], string> = { lost: 'مفقود', emergency: 'طوارئ', fall: 'سقوط محتمل' };

export const at = (p: Point): [number, number] => [p.latitude, p.longitude];

export function offset(p: Point, metres: number, deg: number): Point {
  const a = (deg * Math.PI) / 180;
  return {
    latitude: p.latitude + (metres * Math.sin(a)) / 111320,
    longitude: p.longitude + (metres * Math.cos(a)) / (111320 * Math.cos((p.latitude * Math.PI) / 180)),
  };
}

// Compass angle (degrees, 0 = east, anticlockwise) of a point seen from the site centre
export const bearing = (p: Point) =>
  (Math.atan2(p.latitude - SITE.center.latitude, (p.longitude - SITE.center.longitude) * Math.cos((p.latitude * Math.PI) / 180)) * 180) / Math.PI;

// The core is split into slices: each zone owns the 72° around the direction of its centre,
// the zone sitting on the site centre is the central plaza
const isHub = (z: Zone) => metresBetween(z.center, SITE.center) < 20;
export const sectorOf = (z: Zone): [number, number] => [bearing(z.center) - 36, bearing(z.center) + 36];

export function zoneOf(p: Point | null): Zone | undefined {
  if (!p) return;
  const d = metresBetween(p, SITE.center);
  const hub = zones.find(isHub);
  if (hub && d <= hub.radius) return hub;
  if (d > SITE.radius) return;
  const gap = (z: Zone) => Math.abs(((bearing(p) - bearing(z.center) + 540) % 360) - 180);
  return zones.filter((z) => !isHub(z)).reduce((a, b) => (gap(b) < gap(a) ? b : a));
}

export type LiveEvent = { id: string; at: number; text: string; kind: 'report' | 'signal' | 'passerby'; reportId?: string };

const SINCE_MS = 12 * 60 * 60_000; // the feed and passer-by list cover today's event only

function useCollection<T>(name: string, ...filters: ReturnType<typeof where>[]): T[] {
  const [rows, setRows] = useState<T[]>([]);
  useEffect(
    () => onSnapshot(query(collection(db, name), ...filters), (snap) => setRows(snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name],
  );
  return rows;
}

// Demo mode: no login, made-up data only (nothing from Firestore). In `npm run dev`, or on the live site with
// ?demo for showing the judges: more reports, two that arrive during the demo, and assigned volunteers walk to the case
export const DEMO = import.meta.env.DEV || new URLSearchParams(location.search).has('demo');

// One finished case (timeline and "found in" time without a bracelet) and one child waiting at the security point
const t = Date.now() - 20 * 60_000;
const v = mockVolunteers[1];
const demoClosed: Report[] = [
  { ...mockReports[0], id: 'demo-closed', createdAt: t, status: 'closed', assignedVolunteerId: v.id, acceptedAt: t + 40_000, closedAs: 'found', closedAt: t + 4 * 60_000 + 12_000, photo: null },
  {
    ...mockReports[1], id: 'demo-desk', member: { name: 'ريم', kind: 'child', age: 5 }, photo: null, description: 'فستان أزرق وقبعة بيضاء',
    createdAt: t + 8 * 60_000, status: 'closed', assignedVolunteerId: v.id, acceptedAt: t + 9 * 60_000, closedAs: 'security', closedAt: t + 14 * 60_000, reunitedAt: null,
  },
];

// More made-up cases and volunteers spread over the zones
const zoneAt = (i: number, metres: number, deg: number) => offset(zones[i].center, metres, deg);
const demoReport = (id: string, type: Report['type'], name: string, kind: Member['kind'], age: number, zone: number, where: string, description: string, minutesAgo: number, deg: number): Report => ({
  id, type, braceletId: `DEMO${id.toUpperCase()}`, member: { name, kind, age }, photo: null, description, health: null, phone: null,
  area: `${zones[zone].name}، ${where}`, location: zoneAt(zone, 70, deg), createdAt: Date.now() - minutesAgo * 60_000,
  status: 'open', assignedVolunteerId: null, closedAs: null, closedAt: null,
});
const demoReports: Report[] = [
  ...mockReports,
  demoReport('r5', 'lost', 'ليان', 'child', 4, 2, 'عند جناح الروبوتات', 'بلوزة زهرية وتنورة بيضاء، تحمل دمية صغيرة', 4, 200),
  demoReport('r6', 'lost', 'سعد', 'elder', 81, 4, 'قرب الحديقة العمودية', 'ثوب رمادي ونظارة طبية، ضعيف السمع', 9, 120),
  demoReport('r7', 'lost', 'عمر', 'child', 7, 3, 'عند مدخل الأجنحة الدولية', 'تيشيرت أخضر عليه شعار إكسبو وكاب أسود', 0.5, 300),
];
// arrive while the demo runs: [seconds after opening, report]
const arriving: [number, () => Report][] = [
  [40, () => demoReport('r8', 'lost', 'نورة', 'child', 5, 0, 'قرب المسرح المفتوح', 'فستان أبيض بنقاط حمراء وصندل وردي', 0, 160)],
  [100, () => demoReport('r9', 'fall', 'محمد', 'elder', 70, 1, 'منطقة المطاعم', 'ثوب أبيض وعصا خشبية', 0, 20)],
];
const demoVolunteers: Volunteer[] = [
  ...mockVolunteers.filter((x) => x.onDuty),
  { id: 'v4', name: 'متطوع ٤', onDuty: true, area: zones[3].name, location: zoneAt(3, 150, 0) },
  { id: 'v5', name: 'متطوع ٥', onDuty: true, area: zones[4].name, location: zoneAt(4, 120, 90) },
  { id: 'v6', name: 'متطوع ٦', onDuty: true, area: zones[0].name, location: zoneAt(0, 160, 300) },
];
const WALK = 2; // metres per 250 ms tick: a brisk walk sped up for the demo
const HEAR = 40; // the volunteer's phone picks up the bracelet this close
const HELP_MS = 5000; // after reaching the person, the volunteer closes the case this much later

// Signed in as security (on the normal link first: the browser keeps the session), the demo also shows the app's
// real open reports. Each one joins the made-up cases once: assigning and closing it stays in this page, Firestore is untouched
function useRealReports(onChange: (reports: Report[]) => void) {
  useEffect(() => {
    let stop = () => {};
    const off = onAuthStateChanged(auth, async (u) => {
      stop();
      stop = () => {};
      onChange([]);
      if (!u) return;
      const role = await getDoc(doc(db, 'users', u.uid)).then((d) => d.data()?.role, () => null);
      if (role === 'security' && auth.currentUser?.uid === u.uid) stop = subscribeOpenReports(onChange);
    });
    return () => {
      off();
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// A report made away from the site (testing from home) is moved into a zone, so the demo volunteers can walk to it
const onSite = (r: Report): Report =>
  r.location && zoneOf(r.location) ? r : { ...r, location: zoneAt(r.id.charCodeAt(0) % zones.length, 70, r.id.charCodeAt(1) * 7) };

function useMock() {
  const [reports, setReports] = useState(demoReports);
  const [seen] = useState(() => new Set<string>());
  useRealReports((real) => {
    const ids = new Set(real.map((r) => r.id));
    const fresh = real.filter((r) => !seen.has(r.id)).map(onSite);
    fresh.forEach((r) => seen.add(r.id));
    // one the family cancelled or closed in the app leaves too, unless a demo volunteer already took it
    setReports((rs) => [...rs.filter((r) => !seen.has(r.id) || ids.has(r.id) || r.status !== 'open'), ...fresh]);
  });
  const [closed, setClosed] = useState(demoClosed);
  const [volunteers, setVolunteers] = useState(demoVolunteers);
  const [loaded] = useState(Date.now);
  const [sightings, setSightings] = useState<Sighting[]>(() =>
    zones.slice(0, 2).map((z, i) => ({ id: `ds${i}`, reportId: 'demo-closed', volunteerId: v.id, rssi: -70, at: t + (90 + i * 60) * 1000, area: z.name, location: z.center })),
  );
  useEffect(() => {
    const timers = arriving.map(([sec, make]) => setTimeout(() => setReports((rs) => [...rs, make()]), sec * 1000));
    return () => timers.forEach(clearTimeout);
  }, []);
  // Each assigned volunteer walks straight to their case; near it, their phone hears the bracelet once.
  // A few seconds after reaching the person they close it: a lost person handed to the family, others helped on the spot
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setBeat((b) => b + 1), 250);
    return () => clearInterval(i);
  }, []);
  const [arrived] = useState(() => new Map<string, number>());
  useEffect(() => {
    const now = Date.now();
    const heard: Sighting[] = [];
    const done: Report[] = [];
    const next = volunteers.map((x) => {
      const r = reports.find((r) => r.assignedVolunteerId === x.id && r.location);
      if (!r?.location) return x;
      const d = metresBetween(x.location, r.location);
      if (d < HEAR && !sightings.some((s) => s.reportId === r.id && s.volunteerId === x.id)) {
        heard.push({ id: `s-${r.id}-${x.id}`, reportId: r.id, volunteerId: x.id, rssi: -62, at: now, area: zoneOf(r.location)?.name ?? r.area, location: r.location });
      }
      if (d <= 6) {
        if (!arrived.has(r.id)) arrived.set(r.id, now);
        else if (now - arrived.get(r.id)! >= HELP_MS) done.push({ ...r, status: 'closed', closedAs: r.type === 'lost' ? 'found' : 'helped', closedAt: now });
        return x;
      }
      const k = Math.min(WALK, d - 6) / d;
      const location = { latitude: x.location.latitude + (r.location.latitude - x.location.latitude) * k, longitude: x.location.longitude + (r.location.longitude - x.location.longitude) * k };
      return { ...x, location, area: zoneOf(location)?.name ?? x.area };
    });
    if (next.some((x, i) => x !== volunteers[i])) setVolunteers(next);
    if (heard.length) setSightings((ss) => [...ss, ...heard]);
    if (done.length) {
      setReports((rs) => rs.filter((r) => !done.some((c) => c.id === r.id)));
      setClosed((cs) => [...done, ...cs]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat]);
  const memberOf = (braceletId: string) => mockMembers.find((m) => m.braceletId?.toUpperCase() === braceletId.toUpperCase());
  const name = (id: string) => volunteers.find((x) => x.id === id)?.name ?? 'متطوع';
  const events: LiveEvent[] = [
    ...reports.map((r) => ({ id: r.id, at: r.createdAt, kind: 'report' as const, reportId: r.id, text: `بلاغ جديد: ${r.member.name}، ${TYPE[r.type]}` })),
    ...sightings.flatMap((s) => {
      const r = [...reports, ...closed].find((x) => x.id === s.reportId);
      return r ? [{ id: s.id, at: s.at, kind: 'signal' as const, reportId: r.id, text: `${name(s.volunteerId)} التقط إشارة سوار ${r.member.name} في ${s.area}` }] : [];
    }),
    ...closed.filter((r) => r.closedAt! > loaded).map((r) => ({
      id: `c-${r.id}`, at: r.closedAt!, kind: 'report' as const, reportId: r.id,
      text: r.closedAs === 'found' ? `${name(r.assignedVolunteerId!)} سلّم ${r.member.name} لعائلته` : `${name(r.assignedVolunteerId!)} ساعد ${r.member.name} في مكانه`,
    })),
  ].sort((a, b) => b.at - a.at);
  const actions = {
    assign: async (id: string, volunteerId: string) =>
      setReports((rs) => rs.map((r) => (r.id === id ? { ...r, status: 'searching' as const, assignedVolunteerId: volunteerId, acceptedAt: Date.now() } : r))),
    reunite: async (id: string) => setClosed((cs) => cs.map((r) => (r.id === id ? { ...r, reunitedAt: Date.now(), photo: null } : r))),
    // a real report's health, phone and photo come from Firestore (security may read them)
    healthOf: async (id: string) => (seen.has(id) ? getReportHealth(id) : [...reports, ...closed].find((r) => r.id === id)?.health ?? null),
    phoneOf: async (id: string) => (seen.has(id) ? getReportPhone(id) : '0500000000'),
    photoOf: async (id: string) => (seen.has(id) ? getReportPhoto(id) : [...reports, ...closed].find((r) => r.id === id)?.photo ?? null),
  };
  return { reports, closed, sightings, volunteers, passerby: mockPasserby, alerts: [] as (PasserbyAlert & { id: string })[], events, memberOf, ...actions };
}

export const useLive = DEMO ? useMock : useFirestore;

function useFirestore() {
  const [reports, setReports] = useState<Report[]>([]);
  useEffect(() => subscribeOpenReports(setReports), []);
  const since = useState(() => Date.now() - SINCE_MS)[0];
  const volunteers = useCollection<Volunteer>('volunteers', where('onDuty', '==', true));
  const sightings = useCollection<Sighting>('sightings', where('at', '>=', since));
  const passerby = useCollection<PasserbyReport>('passerbyReports', where('at', '>=', since));
  // The family's answer to the latest passer-by report of each bracelet (id = bracelet number)
  const alerts = useCollection<PasserbyAlert & { id: string }>('passerbyAlerts');
  // Cases closed today, for the timeline and "found in" time. A range on closedAt skips open reports (null)
  const closed = useCollection<Report>('reports', where('closedAt', '>=', since)).sort((a, b) => b.closedAt! - a.closedAt!);
  // Bracelet number → family (from the server-side lock) → that family's member wearing it.
  // The lock decides the family, so another family writing the same braceletId on their member is ignored.
  const bracelets = useCollection<{ id: string; familyId: string }>('bracelets');
  const members = useCollection<Member & { familyId: string }>('members');
  const memberOf = (braceletId: string) => {
    const mac = braceletId.toUpperCase();
    const familyId = bracelets.find((b) => b.id === mac)?.familyId;
    return members.find((m) => m.familyId === familyId && m.braceletId?.toUpperCase() === mac);
  };

  const name = (id: string) => volunteers.find((v) => v.id === id)?.name ?? 'متطوع';
  const events: LiveEvent[] = [
    ...reports.map((r) => ({
      id: r.id, at: r.createdAt, kind: 'report' as const, reportId: r.id,
      text: `بلاغ جديد: ${r.member.name}، ${TYPE[r.type]}`,
    })),
    ...sightings.flatMap((s) => {
      const r = [...reports, ...closed].find((x) => x.id === s.reportId);
      return r ? [{ id: s.id, at: s.at, kind: 'signal' as const, reportId: r.id, text: `${name(s.volunteerId)} التقط إشارة سوار ${r.member.name}${s.area ? ` في ${s.area}` : ''}` }] : [];
    }),
    ...passerby.map((p) => {
      const r = reports.find((x) => x.braceletId.toUpperCase() === p.braceletId.toUpperCase());
      return { id: p.id, at: p.at, kind: 'passerby' as const, reportId: r?.id, text: `مارّ أبلغ عن ${memberOf(p.braceletId)?.name ?? 'سوار غير مربوط'}` };
    }),
  ].sort((a, b) => b.at - a.at).slice(0, 30);

  return {
    reports, closed, sightings, volunteers, passerby, alerts, events, memberOf,
    assign: assignReport, reunite: reuniteAtSecurity, healthOf: getReportHealth, phoneOf: getReportPhone, photoOf: getReportPhoto,
  };
}
