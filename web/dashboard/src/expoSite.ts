// Drawn base map of the Expo 2030 Riyadh site, laid out after the published masterplan: highways, the site
// boundary with the city around it, a green belt, and the round core split into the five zones.
// Each zone has its own street grid; blocks split into lots of mixed size, and every building is drawn
// raised (walls, roof, shadow) seen from the south, so the site reads like a 3D model.
// It is painted once onto two canvases (city, then a sharper core) and shown as image overlays.
// ponytail: hand-placed approximation in metres around SITE.center, not survey data.
import L from 'leaflet';
import type { Zone } from '../../../src/mock';
import { SITE, bearing } from './live';

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
  [[-2200, -3000], [-2095, -1900], [-2015, -1320], [-1235, -50], [-665, 1150], [-395, 1750], [-120, 3000]], // west diagonal
  [[1315, -3000], [1315, 900], [1335, 1400], [1435, 2000], [1600, 3000]], // east
  [[1315, 950], [1085, 1290], [565, 1460], [-585, 1520], [-1600, 1640], [-3200, 1700]], // interchange towards the north
  [[-3200, -1320], [2800, -1320]], // south
];
const ZONE_COLOUR: Record<string, string> = {
  z1: '#C8454F', // Kingdom
  z2: '#E07A2C', // Thriving Communities
  z3: '#4A78D6', // Transformative Technology
  z4: '#E3AE2A', // International Cooperation
  z5: '#6FAE34', // Sustainable Solutions
};
export const zoneColour = (id: string) => ZONE_COLOUR[id];

const GROUND = '#EEEAE0';
const DESERT = '#E6DFCD';
const ROAD = '#FBFAF6';
const PARK = '#D3E2BC';
const TREE = '#A8C88A';
const WATER = '#A9CCE0';
const CITY = ['#C9CDD2', '#D3CDC1', '#BEC7CF', '#CFC9BD'];
const SAND = ['#DCD3C0', '#D5CDBD', '#E0D8C6', '#CFC7B5'];
// An Narjis: everything west of the west highway (kept 70 m off the road)
const NARJIS: XY[] = [[-3200, -3000], [-2270, -3000], [-2165, -1900], [-2085, -1320], [-1305, -50], [-735, 1150], [-465, 1750], [-190, 3000], [-3200, 3000]];
// south of the south road (towards Princess Nourah University), built in the same fabric
const SOUTH: XY[] = [[-1700, -1400], [1240, -1400], [1240, -2700], [-1500, -2700]];
// everything drawn, in metres [x0, y0, size]: the map never pans or zooms out past it
const WORLD = [-3100, -2900, 5800] as const;

// Seeded random, so the site looks the same on every load
function seeded(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

// colour (#hex or rgb()) moved toward white (t > 0) or black (t < 0)
function shade(colour: string, t: number) {
  const n = parseInt(colour.slice(1), 16);
  const rgb = colour.startsWith('rgb') ? colour.match(/\d+/g)!.map(Number) : [n >> 16, (n >> 8) & 255, n & 255];
  const to = t > 0 ? 255 : 0;
  const k = Math.abs(t);
  const c = rgb.map((v) => Math.round(v + (to - v) * k));
  return `rgb(${c.join(',')})`;
}

const rot = ([x, y]: XY, a: number): XY => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

function hull(pts: XY[]) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: XY, a: XY, b: XY) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: XY[]) => {
    const out: XY[] = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    out.pop();
    return out;
  };
  return [...half(p), ...half(p.reverse())];
}

// A building: its footprint (4 corners), height in metres and colour
type Building = { base: XY[]; h: number; colour: string };
// seen from the south: the roof shifts north (and a little west) with height; the shadow falls east
const LIFT: XY = [-0.12, 0.55];
const SUN: XY = [0.45, -0.25];

// One canvas per area, drawing in metres with north up
function sheet(x0: number, y0: number, size: number, px: number) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d')!;
  const s = px / size;
  ctx.setTransform(s, 0, 0, -s, -x0 * s, (y0 + size) * s);
  const poly = (pts: XY[]) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };
  const fill = (pts: XY[], colour: string) => {
    poly(pts);
    ctx.fillStyle = colour;
    ctx.fill();
  };
  const line = (pts: XY[], colour: string, width: number, dash: number[] = []) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.setLineDash(dash);
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.setLineDash([]);
  };
  const disc = (x: number, y: number, r: number, colour: string) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = colour;
    ctx.fill();
  };
  const dots = (list: [XY, number][], colour: string) => {
    ctx.beginPath();
    for (const [[x, y], r] of list) {
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fillStyle = colour;
    ctx.fill();
  };
  const buildings = (list: Building[]) => {
    const up = (b: Building, [dx, dy]: XY) => b.base.map(([x, y]): XY => [x + dx * b.h, y + dy * b.h]);
    ctx.globalAlpha = 0.16;
    for (const b of list) fill(hull([...b.base, ...up(b, SUN)]), '#3A3528');
    ctx.globalAlpha = 1;
    // back (north) to front, so nearer buildings cover the ones behind
    for (const b of [...list].sort((p, q) => q.base[0][1] + q.base[2][1] - p.base[0][1] - p.base[2][1])) {
      const roof = up(b, LIFT);
      fill(hull([...b.base, ...roof]), shade(b.colour, -0.28));
      fill(roof, b.colour);
      ctx.strokeStyle = shade(b.colour, 0.35);
      ctx.lineWidth = 0.6;
      poly(roof);
      ctx.stroke();
    }
  };
  return { canvas, ctx, poly, fill, line, disc, dots, buildings, bounds: L.latLngBounds([ll([x0, y0]), ll([x0 + size, y0 + size])]) };
}

// Uneven street lines from -span to span
function streets(rand: () => number, span: number, min: number, spread: number) {
  const out = [-span];
  while (out[out.length - 1] < span) out.push(out[out.length - 1] + min + rand() * spread);
  return out;
}

// Split a block into lots (alternating cuts at a random point) and call back for each lot
function lots(rand: () => number, x: number, y: number, w: number, h: number, max: number, each: (x: number, y: number, w: number, h: number) => void) {
  if (w <= max && h <= max) return each(x, y, w, h);
  const t = 0.3 + rand() * 0.4;
  if (w >= h) {
    lots(rand, x, y, w * t, h, max, each);
    lots(rand, x + w * t, y, w * (1 - t), h, max, each);
  } else {
    lots(rand, x, y, w, h * t, max, each);
    lots(rand, x, y + h * t, w, h * (1 - t), max, each);
  }
}

type Grid = {
  rand: () => number;
  angle: number; // radians the street grid is turned by
  span: number;
  keep: (p: XY) => boolean; // whether a lot centre belongs to this area
  colour: (p: XY, h: number) => string;
  height: (p: XY) => number;
  park: number; // share of blocks left as gardens
  max: number; // largest lot side
};
// Lay a turned street grid over an area: blocks become lots with buildings, a few become gardens with trees
function city(g: Grid, parks: XY[][], trees: [XY, number][]): Building[] {
  const { rand } = g;
  const out: Building[] = [];
  const xs = streets(rand, g.span, 48, 50);
  const ys = streets(rand, g.span, 40, 42);
  const turn = (p: XY) => rot(p, g.angle);
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < ys.length; j++) {
      const road = (i % 4 === 0 ? 7 : 4) + (j % 3 === 0 ? 2 : 0);
      const [x, y, w, h] = [xs[i] + road, ys[j] + road, xs[i + 1] - xs[i] - road * 2, ys[j + 1] - ys[j] - road * 2];
      const mid = turn([x + w / 2, y + h / 2]);
      if (!g.keep(mid)) continue;
      if (rand() < g.park) {
        parks.push([[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map((p) => turn(p as XY)));
        for (let k = 0; k < (w * h) / 90; k++) trees.push([turn([x + rand() * w, y + rand() * h]), 2 + rand() * 3]);
        continue;
      }
      // now and then one large pavilion instead of lots
      const big = rand() < 0.08;
      lots(rand, x, y, w, h, big ? 999 : g.max, (lx, ly, lw, lh) => {
        if (rand() < 0.12) return; // courtyard or car park
        const gap = big ? 4 : 1.2 + rand() * 1.5;
        const c = turn([lx + lw / 2, ly + lh / 2]);
        if (!g.keep(c)) return;
        const h = big ? 14 + rand() * 10 : g.height(c);
        out.push({
          base: ([[lx + gap, ly + gap], [lx + lw - gap, ly + gap], [lx + lw - gap, ly + lh - gap], [lx + gap, ly + lh - gap]] as XY[]).map(turn),
          h,
          colour: g.colour(c, h),
        });
      });
    }
  }
  return out;
}

function inside([x, y]: XY, poly: XY[]) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const offMid = ([x, y]: XY, mid: number) => ((Math.atan2(y, x) * 180) / Math.PI - mid + 540) % 360 - 180;
const ring = (r: number, wobble: number, phase: number, from = 0, to = 360): XY[] => {
  const out: XY[] = [];
  for (let a = from; a <= to + 0.01; a += 2) out.push([Math.cos((a * Math.PI) / 180), Math.sin((a * Math.PI) / 180)].map((v) => v * (r + wobble * Math.sin((a * Math.PI) / 60 + phase))) as XY);
  return out;
};

// Painted once per page (drawing takes a moment, the map is rebuilt on every visit). The canvases go on the
// map as they are: an image overlay that takes a canvas instead of a URL, so nothing is encoded to PNG
let painted: { canvas: HTMLCanvasElement; bounds: L.LatLngBounds }[] | null = null;
const CanvasOverlay = L.ImageOverlay.extend({
  _initImage(this: { _url: HTMLCanvasElement; _image: HTMLCanvasElement; _zoomAnimated: boolean }) {
    const el = (this._image = this._url);
    L.DomUtil.addClass(el, 'leaflet-image-layer');
    if (this._zoomAnimated) L.DomUtil.addClass(el, 'leaflet-zoom-animated');
  },
}) as unknown as new (canvas: HTMLCanvasElement, bounds: L.LatLngBounds, options: L.ImageOverlayOptions) => L.ImageOverlay;

function paint(zones: Zone[]) {
  const R = SITE.radius;
  const hubR = zones.find((z) => !zoneColour(z.id))?.radius ?? 130;
  const BELT = R + 130;
  const slices = zones.filter((z) => zoneColour(z.id)).map((z) => ({ mid: bearing(z.center), colour: zoneColour(z.id)! }));

  // Around the site the land is still open desert, crossed by the highways (as on today's maps):
  // An Narjis is built up west of the King Salman road, and the same fabric continues south of the south road.
  // Their own random seed, so the site itself always comes out the same
  const out = sheet(WORLD[0], WORLD[1], WORLD[2], 3200);
  out.fill([[WORLD[0], WORLD[1]], [WORLD[0] + WORLD[2], WORLD[1]], [WORLD[0] + WORLD[2], WORLD[1] + WORLD[2]], [WORLD[0], WORLD[1] + WORLD[2]]], DESERT);
  const near = seeded(966);
  const aside: XY[][] = [];
  const asideTrees: [XY, number][] = [];
  const vacant = ([x, y]: XY) => Math.sin(x / 260) * Math.sin(y / 230 + 2) + 0.5 * Math.sin((x - y) / 170) > 0.85; // empty plots, as in Riyadh's newer districts
  const town = city(
    {
      rand: near, angle: 0, span: WORLD[2], park: 0.04, max: 30,
      keep: (p) => (inside(p, NARJIS) || inside(p, SOUTH)) && !vacant(p),
      height: () => 3 + near() ** 2 * 8,
      colour: () => SAND[Math.floor(near() * SAND.length)],
    },
    aside, asideTrees,
  );
  for (const p of aside) out.fill(p, PARK);
  out.dots(asideTrees, TREE);
  out.buildings(town);
  const rand = seeded(2030);
  const parks: XY[][] = [];
  const trees: [XY, number][] = [];
  for (const road of HIGHWAYS) {
    out.line(road, '#D6CDBA', 34);
    out.line(road, ROAD, 26);
    out.line(road, '#E2DACA', 1.5, [14, 14]);
  }
  out.fill(BOUNDARY, GROUND);
  const blocks = city(
    {
      rand, angle: (32 * Math.PI) / 180, span: 2600, park: 0.16, max: 46,
      keep: (p) => inside(p, BOUNDARY) && Math.hypot(...p) > BELT + 20,
      height: () => 3 + rand() ** 2 * 14,
      colour: () => CITY[Math.floor(rand() * CITY.length)],
    },
    parks, trees,
  );
  for (const p of parks) out.fill(p, PARK);
  out.dots(trees, TREE);
  out.buildings(blocks);
  out.line([...BOUNDARY, BOUNDARY[0]], '#C9BFA6', 3);

  // The core, sharper: green belt, five zones with their own grids, ring roads, avenues, central plaza
  const core = sheet(-BELT - 20, -BELT - 20, (BELT + 20) * 2, 2800);
  const belt = ring(BELT, 4, 0);
  core.fill(belt, PARK);
  const beltTrees: [XY, number][] = [];
  for (let k = 0; k < 900; k++) {
    const a = rand() * Math.PI * 2;
    const r = R + 30 + rand() * (BELT - R - 40);
    beltTrees.push([[Math.cos(a) * r, Math.sin(a) * r], 2.5 + rand() * 3.5]);
  }
  core.dots(beltTrees, TREE);
  core.line([...ring(R + 75, 10, 1.3), ring(R + 75, 10, 1.3)[0]], '#EDE7D6', 5);
  core.fill(ring(R + 14, 3, 2), GROUND);

  const coreParks: XY[][] = [];
  const coreTrees: [XY, number][] = [];
  let all: Building[] = [];
  slices.forEach((s, i) => {
    all = all.concat(
      city(
        {
          rand, angle: ((s.mid + 12 * (i % 2 ? 1 : -1)) * Math.PI) / 180, span: R + 40, park: 0.08, max: 30,
          keep: (p) => {
            const d = Math.hypot(...p);
            return d < R - 6 && d > hubR + 22 && Math.abs(offMid(p, s.mid)) < 36 - (14 / d) * 57.3;
          },
          // taller towards the plaza, a few landmark towers
          height: (p) => (rand() < 0.04 ? 30 + rand() * 25 : 4 + rand() ** 1.6 * 14 + (1 - Math.hypot(...p) / R) * 14),
          colour: (_, h) => shade(s.colour, 0.62 - Math.min(h, 45) / 45 * 0.55),
        },
        coreParks, coreTrees,
      ),
    );
  });
  for (const p of coreParks) core.fill(p, PARK);
  core.dots(coreTrees, TREE);
  // ring roads and the avenues between zones cut through on top, like real roads
  core.line([...ring(R * 0.56, 7, 0.4), ring(R * 0.56, 7, 0.4)[0]], ROAD, 9);
  core.line([...ring(R * 0.8, 6, 2.1), ring(R * 0.8, 6, 2.1)[0]], ROAD, 7);
  core.line([...ring(R + 6, 0, 0), ring(R + 6, 0, 0)[0]], ROAD, 12);
  for (const s of slices) {
    for (const edge of [s.mid - 36, s.mid + 36]) {
      const pts: XY[] = [];
      for (let r = hubR; r <= R + 8; r += 20) {
        const a = ((edge + 3 * Math.sin(r / 140)) * Math.PI) / 180;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      core.line(pts, ROAD, 15);
    }
  }
  core.buildings(all);

  // central plaza: paving rings, paths to each avenue, a fountain and trees
  core.fill(ring(hubR + 8, 0, 0), '#F6F2E8');
  for (const r of [hubR * 0.45, hubR * 0.75]) core.line([...ring(r, 0, 0), ring(r, 0, 0)[0]], '#E4DCCB', 2);
  for (const s of slices) {
    const a = (s.mid * Math.PI) / 180;
    core.line([[Math.cos(a) * 30, Math.sin(a) * 30], [Math.cos(a) * hubR, Math.sin(a) * hubR]], '#E4DCCB', 6);
  }
  core.dots(Array.from({ length: 40 }, (_, k): [XY, number] => [[Math.cos((k / 40) * Math.PI * 2) * hubR * 0.92, Math.sin((k / 40) * Math.PI * 2) * hubR * 0.92], 4]), TREE);
  core.disc(0, 0, 24, WATER);
  core.disc(0, 0, 9, '#D6E8F2');

  return [out, core].map((s) => ({ canvas: s.canvas, bounds: s.bounds }));
}

export function drawExpoSite(m: L.Map, zones: Zone[]) {
  painted ??= paint(zones);
  for (const p of painted) new CanvasOverlay(p.canvas, p.bounds, { interactive: false }).addTo(m);
  const R = SITE.radius;
  return {
    // open on the core, where the cases are; zoom out to see the whole site
    view: L.latLngBounds([ll([-R - 250, -R - 250]), ll([R + 250, R + 250])]),
    world: painted[0].bounds,
  };
}
