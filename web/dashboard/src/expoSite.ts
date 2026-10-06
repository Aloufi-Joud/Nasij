// Drawn base map of the Expo 2030 Riyadh site, styled after the published masterplan:
// desert, highways, landscaped site boundary, and the round core split into the five zones.
// ponytail: hand-placed approximation in metres around SITE.center, not survey data.
import L from 'leaflet';
import type { Zone } from '../../../src/mock';
import { SITE, offset, sectorOf } from './live';

type XY = [number, number]; // metres east, north of the site centre

const ll = ([x, y]: XY): L.LatLngTuple => {
  const lat = SITE.center.latitude + y / 111320;
  return [lat, SITE.center.longitude + x / (111320 * Math.cos((SITE.center.latitude * Math.PI) / 180))];
};

// Site boundary: west side along the diagonal highway, curved top, east side along the vertical highway
const BOUNDARY: XY[] = [
  [-1895, -1190], [-1815, -1060], [-1095, 130], [-535, 1020], [-395, 1160], [-85, 1230], [365, 1200],
  [815, 1090], [1065, 960], [1165, 800], [1175, -1100], [1115, -1190],
];
const HIGHWAYS: XY[][] = [
  [[-2095, -1900], [-2015, -1320], [-1235, -50], [-665, 1150], [-395, 1750]], // west diagonal
  [[1315, -1900], [1315, 900], [1335, 1400], [1435, 2000]], // east
  [[1315, 950], [1085, 1290], [565, 1460], [-585, 1520]], // interchange towards the north
  [[-2535, -1320], [1865, -1320]], // south
];
const ZONE_COLOUR: Record<string, string> = {
  z1: '#9B2C2C', // Kingdom
  z2: '#E8731A', // Thriving Communities
  z3: '#2B4C9B', // Transformative Technology
  z4: '#F2B01E', // International Cooperation
  z5: '#7CB518', // Sustainable Solutions
};
export const zoneColour = (id: string) => ZONE_COLOUR[id];

function inside([x, y]: XY, poly: XY[]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// Seeded random, so the plots look the same on every load
function seeded(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

export function drawExpoSite(m: L.Map, zones: Zone[]) {
  const canvas = L.canvas({ padding: 0.5 }); // hundreds of decorative shapes: canvas is far cheaper than SVG
  const flat = { renderer: canvas, interactive: false };
  const R = SITE.radius;

  for (const road of HIGHWAYS) {
    L.polyline(road.map(ll), { ...flat, color: '#B3AA99', weight: 11 }).addTo(m);
    L.polyline(road.map(ll), { ...flat, color: '#F4EFE4', weight: 1.5, dashArray: '8 8' }).addTo(m);
  }

  L.polygon(BOUNDARY.map(ll), { ...flat, color: '#C8553D', weight: 2, fillColor: '#DCE6B8', fillOpacity: 1 }).addTo(m);

  // pastel plots in the landscaped ring between the core and the boundary
  const rand = seeded(2030);
  const PLOT = 120;
  for (let x = -1200; x < 1500; x += PLOT) {
    for (let y = -1200; y < 1200; y += PLOT) {
      const c: XY = [x + PLOT / 2, y + PLOT / 2];
      if (Math.hypot(...c) < R + 80 || !inside(c, BOUNDARY) || rand() < 0.55) continue;
      const fill = ['#EFC6CC', '#C9DFA5', '#F1E3B6', '#E7D2E6'][Math.floor(rand() * 4)];
      const inset = 10 + rand() * 25; // uneven plot sizes
      L.rectangle([ll([x + inset, y + inset]), ll([x + PLOT - 10, y + PLOT - 10])], { ...flat, stroke: false, fillColor: fill, fillOpacity: 0.6 }).addTo(m);
    }
  }

  // the core: one slice per zone, tinted in the zone colour, filled with building blocks
  const hub = zones.find((z) => !zoneColour(z.id));
  const hubR = hub?.radius ?? 130;
  for (const z of zones) {
    const colour = zoneColour(z.id);
    if (!colour) continue;
    const [from, to] = sectorOf(z);
    const ring: L.LatLngTuple[] = [];
    for (let a = from; a <= to + 0.01; a += 3) ring.push(at(offset(SITE.center, R, a)));
    for (let a = to; a >= from - 0.01; a -= 3) ring.push(at(offset(SITE.center, hubR, a)));
    L.polygon(ring, { ...flat, color: '#FFFFFF', weight: 3, fillColor: colour, fillOpacity: 0.3 }).addTo(m);
  }
  const BLOCK = 46;
  for (let x = -R; x < R; x += BLOCK) {
    for (let y = -R; y < R; y += BLOCK) {
      const c: XY = [x + BLOCK / 2, y + BLOCK / 2];
      const d = Math.hypot(...c);
      if (d > R - 20 || d < hubR + 25) continue;
      L.rectangle([ll([x + 6, y + 6]), ll([x + BLOCK - 6, y + BLOCK - 6])], {
        ...flat, color: '#8E8A82', weight: 0.6, fillColor: '#ECEAE4', fillOpacity: 0.6,
      }).addTo(m);
    }
  }

  // central plaza on top
  L.circle(at(SITE.center), { ...flat, radius: hubR, color: '#5E8C85', weight: 2, fillColor: '#FFFFFF', fillOpacity: 1 }).addTo(m);

  // open on the core, where the cases are; zoom out to see the whole site
  return L.latLngBounds([ll([-R - 250, -R - 250]), ll([R + 250, R + 250])]);
}

const at = (p: { latitude: number; longitude: number }): L.LatLngTuple => [p.latitude, p.longitude];
