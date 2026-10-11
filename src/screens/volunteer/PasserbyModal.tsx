// A passer-by reported the bracelet of the open case: a box over the whole screen, so the volunteer notices,
// with a map pin at the place the report was sent from (when the passer-by shared their location).
import { Linking, Modal, Platform, StyleSheet, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../components/Text';
import { Pressable } from '../../components/Motion';
import { C, F, ui } from '../../theme';
import { place, tr } from '../../i18n';
import type { PasserbyReport, Point, Report } from '../../mock';
import { areaOf } from '../../firebase/volunteers';
import { clock, since } from './labels';

type Props = {
  report: Report; // the open case
  passerby: PasserbyReport | null; // null = closed
  now: number;
  onClose: () => void;
};

// Opens the phone's maps app with a pin on the point (Apple Maps needs q= to drop a pin, ll= alone only centres)
export function openInMaps({ latitude, longitude }: Point, label: string) {
  const ll = `${latitude},${longitude}`;
  const q = encodeURIComponent(label);
  const google = `https://www.google.com/maps/search/?api=1&query=${ll}`;
  const url =
    Platform.OS === 'ios'
      ? `https://maps.apple.com/?ll=${ll}&q=${q}`
      : Platform.OS === 'android'
        ? `geo:${ll}?q=${ll}(${q})`
        : google;
  Linking.openURL(url).catch(() => Linking.openURL(google).catch(() => {}));
}

export default function PasserbyModal({ report: r, passerby: p, now, onClose }: Props) {
  const loc = p?.location ?? null;
  const zone = areaOf(loc);
  const pinLabel = tr(`بلاغ مارّ: ${r.member.name}`, `Passer-by report: ${r.member.name}`);
  return (
    <Modal visible={!!p} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={s.backdrop}>
        {p && (
          <View style={s.box}>
            <View style={s.top}>
              <View style={s.icon}>
                <Ionicons name="hand-left" size={24} color={C.safe} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{tr(`مارّ أبلغ عن سوار ${r.member.name}`, `A passer-by reported ${r.member.name}’s bracelet`)}</Text>
                <Text style={ui.muted}>
                  {clock(p.at)} · {since(p.at, now)}
                  {zone ? tr(` · قرب ${zone}`, ` · near ${place(zone)}`) : ''}
                </Text>
              </View>
            </View>

            {loc ? (
              <>
                <View style={s.map}>
                  <MapView
                    style={StyleSheet.absoluteFill}
                    showsUserLocation
                    initialRegion={{ ...loc, latitudeDelta: 0.002, longitudeDelta: 0.002 }}
                  >
                    <Marker coordinate={loc} title={pinLabel} description={clock(p.at)} pinColor={C.danger} />
                  </MapView>
                </View>
                <Text style={s.note}>
                  {tr('الدبوس الأحمر هو مكان المارّ لحظة إرسال البلاغ', 'The red pin is where the passer-by was when they sent the report')}
                </Text>
                <Pressable style={[ui.btn, { marginTop: 12 }]} onPress={() => openInMaps(loc, pinLabel)}>
                  <Ionicons name="navigate" size={18} color="#fff" />
                  <Text style={ui.btnText}>{tr('افتح المسار في الخرائط', 'Get directions in Maps')}</Text>
                </Pressable>
              </>
            ) : (
              <View style={s.noLoc}>
                <Ionicons name="location-outline" size={18} color={C.warn} />
                <Text style={[ui.stripText, { color: C.warn }]}>
                  {tr('المارّ ما شارك موقعه، ابحث بإشارة السوار', 'The passer-by didn’t share their location, follow the bracelet signal')}
                </Text>
              </View>
            )}

            <Pressable style={[ui.btnGhost, { marginTop: 10 }]} onPress={onClose}>
              <Text style={ui.btnGhostText}>{tr('تم، رجوع للبحث', 'OK, back to search')}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8,30,26,0.55)', justifyContent: 'center', padding: 18 },
  box: { ...ui.card, borderColor: C.safe, borderWidth: 2 },
  top: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 14 },
  icon: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.safeBg, alignItems: 'center', justifyContent: 'center' },
  title: { color: C.primary, fontSize: F.h2, fontWeight: '800', textAlign: 'right' },
  map: { height: 230, borderRadius: 16, overflow: 'hidden', backgroundColor: C.fill },
  note: { color: C.muted, fontSize: 12, textAlign: 'right', marginTop: 8 },
  noLoc: { ...ui.strip, backgroundColor: C.warnBg, marginBottom: 0 },
});
