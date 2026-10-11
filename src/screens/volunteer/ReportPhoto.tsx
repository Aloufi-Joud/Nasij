// Child's photo from the report, or a coloured initial when there is none.
// Tapping a photo opens it full screen (tap anywhere or the X to close), so the volunteer can see the face clearly.
import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '../../components/Text';
import type { Report } from '../../mock';
import { KIND_UI } from './labels';
import { tr } from '../../i18n';

export default function ReportPhoto({ report, size }: { report: Report; size: number }) {
  const [zoom, setZoom] = useState(false);
  const { width, height } = useWindowDimensions();
  const shape = { width: size, height: size, borderRadius: size * 0.28 };
  if (!report.photo)
    return (
      <View style={[s.initial, shape, { backgroundColor: KIND_UI[report.member.kind].color }]}>
        <Text style={[s.initialText, { fontSize: size * 0.42 }]}>{report.member.name[0]}</Text>
      </View>
    );
  const big = Math.min(width - 32, height * 0.7);
  return (
    <>
      <Pressable
        onPress={() => setZoom(true)}
        hitSlop={4}
        accessibilityRole="imagebutton"
        accessibilityLabel={tr(`كبّر صورة ${report.member.name}`, `Enlarge ${report.member.name}’s photo`)}
      >
        <Image source={{ uri: report.photo }} style={[s.photo, shape]} />
        <View style={s.zoomBadge}>
          <Ionicons name="expand" size={11} color="#fff" />
        </View>
      </Pressable>
      <Modal visible={zoom} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setZoom(false)}>
        <Pressable style={s.backdrop} onPress={() => setZoom(false)}>
          <Image source={{ uri: report.photo }} style={{ width: big, height: big, borderRadius: 18 }} resizeMode="contain" />
          <Text style={s.caption}>{report.member.name}</Text>
          <Text style={s.hint}>{tr('اضغط في أي مكان للإغلاق', 'Tap anywhere to close')}</Text>
          <View style={s.close}>
            <Ionicons name="close" size={24} color="#fff" />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  photo: { backgroundColor: '#E5E1D6' },
  initial: { alignItems: 'center', justifyContent: 'center' },
  initialText: { color: '#fff', fontWeight: '700' },
  zoomBadge: {
    position: 'absolute', bottom: 3, left: 3, width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  caption: { color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 16 },
  hint: { color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 6 },
  close: {
    position: 'absolute', top: 54, right: 20, width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center',
  },
});
