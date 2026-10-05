// "Found": the family closes the case
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, ui } from '../../theme';
import { Button } from '../../components/Button';

export default function FoundScreen(p: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <>
      <View style={[ui.card, s.card]}>
        <View style={s.icon}>
          <Ionicons name="checkmark" size={36} color="#fff" />
        </View>
        <Text style={s.title}>لقيتوا {p.name}؟</Text>
        <Text style={s.text}>
          بنقفل البلاغ ونوقف البحث، وتنحذف الصورة والوصف والحالة الصحية من عند المتطوعين.
        </Text>
      </View>
      <Button label={`نعم، لقينا ${p.name}`} icon="checkmark-circle-outline" onPress={p.onConfirm} style={{ marginTop: 18 }} />
      <Button label="لا، رجوع" kind="ghost" onPress={p.onCancel} style={{ marginTop: 10 }} />
    </>
  );
}

const s = StyleSheet.create({
  card: { alignItems: 'center', paddingVertical: 26 },
  icon: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.safe, alignItems: 'center', justifyContent: 'center' },
  title: { color: C.primary, fontSize: F.h1, fontWeight: '700', marginTop: 14 },
  text: { color: C.muted, fontSize: F.small, textAlign: 'center', marginTop: 8, lineHeight: 20 },
});
