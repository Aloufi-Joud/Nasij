// Live data for the security dashboard, straight from Firestore, plus the site geometry.
// Security is allowed to see everything, health included.
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../../src/firebase';
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

// ponytail: demo mode, no login and mock data, only in `npm run dev`. Remove once a security account exists.
export const DEMO = import.meta.env.DEV;

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

function useMock() {
  const [reports, setReports] = useState(mockReports);
  const [closed, setClosed] = useState(demoClosed);
  const memberOf = (braceletId: string) => mockMembers.find((m) => m.braceletId?.toUpperCase() === braceletId.toUpperCase());
  const events: LiveEvent[] = reports.map((r) => ({ id: r.id, at: r.createdAt, kind: 'report' as const, reportId: r.id, text: `بلاغ جديد: ${r.member.name}، ${TYPE[r.type]}` }));
  const sightings: Sighting[] = zones.slice(0, 2).map((z, i) => ({ id: `ds${i}`, reportId: 'demo-closed', volunteerId: v.id, rssi: -70, at: t + (90 + i * 60) * 1000, area: z.name, location: z.center }));
  const actions = {
    assign: async (id: string, volunteerId: string) =>
      setReports((rs) => rs.map((r) => (r.id === id ? { ...r, status: 'searching' as const, assignedVolunteerId: volunteerId, acceptedAt: Date.now() } : r))),
    reunite: async (id: string) => setClosed((cs) => cs.map((r) => (r.id === id ? { ...r, reunitedAt: Date.now(), photo: null } : r))),
    healthOf: async (id: string) => [...reports, ...closed].find((r) => r.id === id)?.health ?? null,
    phoneOf: async () => '0500000000',
    photoOf: async (id: string) => [...reports, ...closed].find((r) => r.id === id)?.photo ?? null,
  };
  return { reports, closed, sightings, volunteers: mockVolunteers.filter((x) => x.onDuty), passerby: mockPasserby, alerts: [] as (PasserbyAlert & { id: string })[], events, memberOf, ...actions };
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
      const r = reports.find((x) => x.id === s.reportId);
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
