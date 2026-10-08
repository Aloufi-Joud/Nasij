// "Found": the family closes the case
import { StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import { Ionicons } from '@expo/vector-icons';
import { C, F, ui } from '../../theme';
import { Button } from '../../components/Button';
import { tr } from '../../i18n';

export default function FoundScreen(p: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <>
      <View style={[ui.card, s.card]}>
        <View style={s.icon}>
          <Ionicons name="checkmark" size={36} color="#fff" />
        </View>
        <Text style={s.title}>{tr(`لقيتوا ${p.name}؟`, `Found ${p.name}?`)}</Text>
        <Text style={s.text}>
          {tr(
            'بنقفل البلاغ ونوقف البحث، وتنحذف الصورة والوصف والحالة الصحية من عند المتطوعين.',
            'We’ll close the report and stop the search. The photo, description and health details are deleted from volunteers’ phones.',
          )}
        </Text>
      </View>
      <Button label={tr(`نعم، لقينا ${p.name}`, `Yes, we found ${p.name}`)} icon="checkmark-circle-outline" onPress={p.onConfirm} style={{ marginTop: 18 }} />
      <Button label={tr('لا، رجوع', 'No, go back')} kind="ghost" onPress={p.onCancel} style={{ marginTop: 10 }} />
    </>
  );
}

const s = StyleSheet.create({
  card: { alignItems: 'center', paddingVertical: 26 },
  icon: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.safe, alignItems: 'center', justifyContent: 'center' },
  title: { color: C.primary, fontSize: F.h1, fontWeight: '700', marginTop: 14 },
  text: { color: C.muted, fontSize: F.small, textAlign: 'center', marginTop: 8, lineHeight: 20 },
});
