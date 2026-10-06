// Fake live feed for the demo: volunteers walk around the site, pick up bracelet signals
// and enter zones. ponytail: delete this file once Firestore subscriptions drive the dashboard.
import { useEffect, useState } from 'react';
import { zones, type Point, type Report, type Volunteer, type Zone } from '../../../src/mock';
import { metresBetween } from '../../../src/components/geo';

// Drawn Expo 2030 site, shared with MapView (approximation of the published masterplan, not survey data)
export const SITE = { center: { latitude: 24.909, longitude: 46.705 }, radius: 650 };

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

export type LiveEvent = { id: number; at: number; text: string; kind: 'report' | 'signal' | 'move'; reportId?: string };

const TICK = 700; // ms
const STEP = 6; // metres per tick, a brisk walk sped up for the demo
const HEARD = 60; // metres: a phone hears the bracelet (10 to 30 m in a crowd, stretched for the demo)
const randomSpot = () => offset(SITE.center, Math.sqrt(Math.random()) * SITE.radius * 0.9, Math.random() * 360);
const EXTRA = ['متطوع ٤', 'متطوع ٥', 'متطوع ٦', 'متطوع ٧', 'متطوع ٨', 'متطوع ٩'];

export function useLive(base: Volunteer[], reports: Report[]) {
  const [state, setState] = useState(() => {
    const vols = [
      ...base.filter((v) => v.onDuty),
      ...EXTRA.map((name, i) => ({ id: `sim${i}`, name, onDuty: true, area: '', location: randomSpot() })),
    ];
    let id = 0;
    const events: LiveEvent[] = reports.map((r) => ({
      id: id++,
      at: r.createdAt,
      kind: 'report' as const,
      reportId: r.id,
      text: `بلاغ جديد: ${r.member.name}، ${r.type === 'lost' ? 'مفقود' : r.type === 'fall' ? 'سقوط محتمل' : 'طوارئ'}`,
    }));
    return { vols, events: events.sort((a, b) => b.at - a.at), at: Date.now() };
  });

  useEffect(() => {
    const targets = new Map<string, Point>();
    const lastHeard = new Map<string, number>();
    let id = 1000;
    const timer = setInterval(() => {
      setState((s) => {
        const now = Date.now();
        const fresh: LiveEvent[] = [];
        const vols = s.vols.map((v) => {
          let target = targets.get(v.id);
          if (!target || metresBetween(v.location, target) < STEP) {
            // half the time head for an open case, otherwise patrol
            const r = Math.random() < 0.5 ? reports[Math.floor(Math.random() * reports.length)] : null;
            target = r?.location ? offset(r.location, 15 + Math.random() * 30, Math.random() * 360) : randomSpot();
            targets.set(v.id, target);
          }
          const d = metresBetween(v.location, target);
          const k = Math.min(1, STEP / d);
          const location = {
            latitude: v.location.latitude + (target.latitude - v.location.latitude) * k,
            longitude: v.location.longitude + (target.longitude - v.location.longitude) * k,
          };

          const before = zoneOf(v.location);
          const after = zoneOf(location);
          if (after && after.id !== before?.id && Math.random() < 0.5) {
            fresh.push({ id: id++, at: now, kind: 'move', text: `${v.name} دخل ${after.name}` });
          }
          for (const r of reports) {
            if (!r.location) continue;
            const dist = metresBetween(location, r.location);
            const key = v.id + r.id;
            if (dist < HEARD && now - (lastHeard.get(key) ?? 0) > 15_000) {
              lastHeard.set(key, now);
              const where = zoneOf(location)?.name;
              fresh.push({ id: id++, at: now, kind: 'signal', reportId: r.id, text: `${v.name} التقط إشارة سوار ${r.member.name}${where ? ` في ${where}` : ''}` });
            }
          }
          return { ...v, location };
        });
        return { vols, events: fresh.length ? [...fresh.reverse(), ...s.events].slice(0, 30) : s.events, at: now };
      });
    }, TICK);
    return () => clearInterval(timer);
  }, [reports]);

  return state;
}
