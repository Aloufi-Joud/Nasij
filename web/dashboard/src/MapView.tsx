import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { C } from '../../../src/theme';
import type { Report, Volunteer, Zone } from '../../../src/mock';
import { SITE, bearing, offset, type LiveEvent } from './live';
import { drawExpoSite, zoneColour } from './expoSite';

type Props = {
  zones: Zone[];
  reports: Report[];
  volunteers: Volunteer[];
  lastSignal: LiveEvent | undefined;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

const at = (p: { latitude: number; longitude: number }): L.LatLngTuple => [p.latitude, p.longitude];
// Leaflet renders tooltip strings as HTML; names come from users, so pass them as text
const text = (s: string) => Object.assign(document.createElement('span'), { textContent: s });
const colour = (r: Report) => (r.type === 'lost' ? C.warn : C.danger);

// Drawn Expo 2030 site (no real map tiles): round site, 5 petal zones, central hub
export default function MapView({ zones, reports, volunteers, lastSignal, selectedId, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map>(null);
  const markers = useRef(new Map<string, L.CircleMarker>());
  const pulses = useRef(new Map<string, L.CircleMarker>());
  const vols = useRef(new Map<string, L.CircleMarker>());
  const pick = useRef(onSelect);
  pick.current = onSelect;

  useEffect(() => {
    const m = L.map(box.current!, { zoomControl: true, attributionControl: false, zoomSnap: 0.25 }).setView(at(SITE.center), 15);

    // reports and their rings sit above the walking volunteers so they stay clickable
    m.createPane('reports').style.zIndex = '450';
    m.createPane('labels').style.zIndex = '440';
    const bounds = drawExpoSite(m, zones);
    // one name per zone: in the middle of its slice, or at the top of the central plaza
    for (const z of zones) {
      const hub = !zoneColour(z.id);
      const label = text(z.name);
      label.style.borderColor = zoneColour(z.id) ?? C.accent;
      L.tooltip({ pane: 'labels', permanent: true, direction: 'center', className: hub ? 'zone-label hub' : 'zone-label' })
        .setLatLng(at(hub ? offset(z.center, z.radius * 0.55, 90) : offset(SITE.center, SITE.radius * 0.7, bearing(z.center))))
        .setContent(label)
        .addTo(m);
    }
    m.fitBounds(bounds, { padding: [24, 24] });
    // names need room: compact when the core is small on screen (phones), hidden when zoomed far out
    const fit = () => {
      const px = m.latLngToContainerPoint(at(offset(SITE.center, SITE.radius, 0))).x - m.latLngToContainerPoint(at(SITE.center)).x;
      box.current?.classList.toggle('far', px < 90);
      box.current?.classList.toggle('compact', px < 200);
    };
    m.on('zoomend', fit);
    // the grid settles after the map is created; keep Leaflet's size (and the label mode) in step
    const resize = new ResizeObserver(() => {
      m.invalidateSize();
      fit();
    });
    resize.observe(box.current!);
    map.current = m;
    return () => {
      resize.disconnect();
      m.remove();
      for (const ref of [markers, pulses, vols]) ref.current.clear();
    };
  }, [zones]);

  // Reports change live: redraw only their markers, so the map keeps its zoom
  useEffect(() => {
    const m = map.current!;
    const layer = L.layerGroup().addTo(m);
    for (const r of reports) {
      if (!r.location) continue;
      const pulse = L.circleMarker(at(r.location), {
        pane: 'reports', radius: 9, stroke: false, fillColor: colour(r), fillOpacity: 0.5, interactive: false,
        className: `pulse${r.type === 'lost' ? '' : ' urgent'}`,
      }).addTo(layer);
      pulses.current.set(r.id, pulse);
      const mk = L.circleMarker(at(r.location), { pane: 'reports', radius: 9, color: '#fff', weight: 2, fillColor: colour(r), fillOpacity: 1 })
        .bindTooltip(text(r.member.name))
        .on('click', () => pick.current(r.id))
        .addTo(layer);
      markers.current.set(r.id, mk);
    }
    return () => {
      layer.remove();
      markers.current.clear();
      pulses.current.clear();
    };
  }, [zones, reports]);

  // Volunteers move: move existing markers instead of redrawing the map, drop those gone off duty
  useEffect(() => {
    const m = map.current!;
    for (const [id, mk] of vols.current) {
      if (volunteers.some((v) => v.id === id)) continue;
      mk.remove();
      vols.current.delete(id);
    }
    for (const v of volunteers) {
      const mk = vols.current.get(v.id);
      if (mk) mk.setLatLng(at(v.location));
      else
        vols.current.set(
          v.id,
          L.circleMarker(at(v.location), { radius: 6, color: '#fff', weight: 2, fillColor: C.primary, fillOpacity: 1 })
            .bindTooltip(text(`${v.name}، في الخدمة`))
            .addTo(m),
        );
    }
  }, [zones, volunteers]);

  // A volunteer heard a bracelet: flash that report's ring
  useEffect(() => {
    const el = lastSignal?.reportId && pulses.current.get(lastSignal.reportId)?.getElement();
    if (!el) return;
    el.classList.remove('ping');
    void (el as SVGElement).getBoundingClientRect(); // restart the animation
    el.classList.add('ping');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSignal?.id]);

  useEffect(() => {
    for (const [id, mk] of markers.current) {
      const on = id === selectedId;
      mk.setRadius(on ? 13 : 9).setStyle({ weight: on ? 4 : 2, color: on ? C.primary : '#fff' });
      if (on) {
        mk.bringToFront();
        map.current?.panTo(mk.getLatLng(), { animate: !matchMedia('(prefers-reduced-motion: reduce)').matches });
      }
    }
  }, [selectedId, reports]);

  return <div ref={box} className="map-box" />;
}
