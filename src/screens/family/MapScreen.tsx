// Map tab: one circle per bracelet around the parent, inside the event boundary
import { StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import MapView, { Circle, Marker } from 'react-native-maps';
import { C, ui } from '../../theme';
import type { Point } from '../../mock';
import { tr } from '../../i18n';
import { EVENT_RADIUS_M, ZONE_UI, offset, type FamMember, type Live, type Zone } from './shared';

const CIRCLE_FILL: Record<Zone, string> = {
  NEAR: 'rgba(27,107,58,0.16)',
  MEDIUM: 'rgba(212,132,26,0.16)',
  FAR: 'rgba(192,57,43,0.16)',
  LOST: 'rgba(192,57,43,0.10)',
};

type Props = { members: FamMember[]; live: Record<string, Live>; me: Point | null; eventCenter: Point | null };

export default function MapScreen({ members, live, me, eventCenter }: Props) {
  const liveOf = (m: FamMember) => (m.mac ? live[m.mac] : undefined);
  return (
    <>
      <Text style={ui.sectionTitle}>{tr('خريطة العائلة', 'Family map')}</Text>
      <View style={[s.mapBox, { height: 420 }]}>
        {me ? (
          <MapView
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
          </MapView>
        ) : (
          <Text style={s.mapWait}>{tr('جاري تحديد موقعك...', 'Finding your location...')}</Text>
        )}
      </View>
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
