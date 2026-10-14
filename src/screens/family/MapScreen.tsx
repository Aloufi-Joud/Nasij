// Map tab: one circle per bracelet around the parent, inside the event boundary,
// and for a reported member, where a volunteer's phone last heard the bracelet
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import MapView, { Circle, Marker } from 'react-native-maps';
import { C, ui } from '../../theme';
import type { Point } from '../../mock';
import { place, tr } from '../../i18n';
import type { LastSeen } from '../../firebase/sightings';
import { EVENT_RADIUS_M, ZONE_UI, offset, type FamMember, type Live, type Zone } from './shared';

const CIRCLE_FILL: Record<Zone, string> = {
  NEAR: 'rgba(27,107,58,0.16)',
  MEDIUM: 'rgba(212,132,26,0.16)',
  FAR: 'rgba(192,57,43,0.16)',
  LOST: 'rgba(192,57,43,0.10)',
};

type Props = {
  members: FamMember[];
  live: Record<string, Live>;
  me: Point | null;
  eventCenter: Point | null;
  seen: Record<string, LastSeen | null>; // by member id, only members with an open report
  now: number;
  shown: boolean; // the tab stays mounted and is hidden with display: none
};

const LAST_SEEN_RADIUS_M = 30; // the rounded location (about 20 m) plus how far the volunteer's phone hears the bracelet

export default function MapScreen({ members, live, me, eventCenter, seen, now, shown }: Props) {
  const liveOf = (m: FamMember) => (m.mac ? live[m.mac] : undefined);
  // The circles do not come back when the hidden map is shown again (new keys for the circles alone
  // did not help on the phone), so the map itself is built afresh on every visit, like the first open
  const [visit, setVisit] = useState(0);
  const [wasShown, setWasShown] = useState(shown);
  if (shown !== wasShown) {
    setWasShown(shown);
    if (shown) setVisit((v) => v + 1);
  }
  const ago = (at: number) => {
    const min = Math.max(0, Math.floor((now - at) / 60_000));
    return min < 1 ? tr('الآن', 'just now') : tr(`قبل ${min} د`, `${min} min ago`);
  };
  return (
    <>
      <Text style={ui.sectionTitle}>{tr('خريطة العائلة', 'Family map')}</Text>
      <View style={[s.mapBox, { height: 420 }]}>
        {me ? (
          <MapView
            key={visit}
            style={StyleSheet.absoluteFill}
            showsUserLocation
            initialRegion={{ ...me, latitudeDelta: 0.0004, longitudeDelta: 0.0004 }}
          >
            {eventCenter && (
              <Circle
                center={eventCenter}
                radius={EVENT_RADIUS_M}
                strokeColor={C.primary}
                strokeWidth={2}
                lineDashPattern={[8, 6]}
                fillColor="transparent"
              />
            )}
            {/* One circle per bracelet, all around the parent (the signal gives distance, not direction),
                with the member's name on its edge. Names sit at different angles so equal circles do not hide each other. */}
            {members.map((m, i) => {
              const l = liveOf(m);
              if (!l?.zone) return null;
              const color = ZONE_UI[l.zone].color;
              return [
                <Circle key={`c-${m.id}`} center={me} radius={l.radius} strokeColor={color} strokeWidth={2} fillColor={CIRCLE_FILL[l.zone]} />,
                <Marker key={`n-${m.id}`} coordinate={offset(me, l.radius, (i * 70) % 360)} anchor={{ x: 0.5, y: 0.5 }}>
                  <View style={[s.mapName, { borderColor: color }]}>
                    <Text style={[s.mapNameText, { color }]}>{m.name}</Text>
                  </View>
                </Marker>,
              ];
            })}
            {members.map((m) => {
              const p = seen[m.id]?.location;
              if (!p) return null;
              return [
                <Circle key={`sc-${m.id}`} center={p} radius={LAST_SEEN_RADIUS_M} strokeColor={C.danger} strokeWidth={2} lineDashPattern={[6, 4]} fillColor="rgba(192,57,43,0.12)" />,
                <Marker key={`sn-${m.id}`} coordinate={p} anchor={{ x: 0.5, y: 0.5 }}>
                  <View style={[s.mapName, { borderColor: C.danger }]}>
                    <Text style={[s.mapNameText, { color: C.danger }]}>{tr(`آخر إشارة: ${m.name}`, `Last heard: ${m.name}`)}</Text>
                  </View>
                </Marker>,
              ];
            })}
          </MapView>
        ) : (
          <Text style={s.mapWait}>{tr('جاري تحديد موقعك...', 'Finding your location...')}</Text>
        )}
      </View>
      {members.map((m) => {
        const x = seen[m.id];
        if (!x?.location) return null;
        const where = x.area ? tr(` في ${place(x.area)}`, ` in ${place(x.area)}`) : '';
        return (
          <Text key={`s-${m.id}`} style={[s.mapNote, { color: C.danger }]}>
            {tr(`متطوع سمع سوار ${m.name}${where} ${ago(x.at)}`, `A volunteer heard ${m.name}’s bracelet${where} ${ago(x.at)}`)}
          </Text>
        );
      })}
      {members.map((m) => {
        const l = liveOf(m);
        if (!l?.zone) return null;
        return (
          <Text key={m.id} style={s.mapNote}>
            {l.zone === 'LOST'
              ? tr(`${m.name}: آخر مرة كان ضمن ${l.radius} متر منك تقريبًا`, `${m.name}: last seen within about ${l.radius} m of you`)
              : tr(`${m.name} ضمن ${l.radius} متر منك تقريبًا`, `${m.name} is within about ${l.radius} m of you`)}
          </Text>
        );
      })}
    </>
  );
}

const s = StyleSheet.create({
  mapBox: { width: '100%', borderRadius: 24, overflow: 'hidden', backgroundColor: '#E5E1D6', justifyContent: 'center' },
  mapName: { backgroundColor: '#fff', borderWidth: 1.5, borderRadius: 10, paddingVertical: 2, paddingHorizontal: 8 },
  mapNameText: { fontSize: 12, fontWeight: '700' },
  mapWait: { textAlign: 'center', color: C.muted },
  mapNote: { color: C.muted, fontSize: 14, textAlign: 'center', marginTop: 10 },
});
