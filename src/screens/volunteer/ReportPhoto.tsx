// Child's photo from the report, or a coloured initial when there is none
import { Image, StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import type { Report } from '../../mock';
import { KIND_UI } from './labels';

export default function ReportPhoto({ report, size }: { report: Report; size: number }) {
  const shape = { width: size, height: size, borderRadius: size * 0.28 };
  if (report.photo) return <Image source={{ uri: report.photo }} style={[s.photo, shape]} />;
  return (
    <View style={[s.initial, shape, { backgroundColor: KIND_UI[report.member.kind].color }]}>
      <Text style={[s.initialText, { fontSize: size * 0.42 }]}>{report.member.name[0]}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  photo: { backgroundColor: '#E5E1D6' },
  initial: { alignItems: 'center', justifyContent: 'center' },
  initialText: { color: '#fff', fontWeight: '700' },
});
