// Close case: "found" (handed to the family) or "handed to security".
// Closing deletes this volunteer's access to the bracelet and the medical data.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, ui } from '../../theme';
import type { ClosedAs, Report } from '../../mock';
import ReportPhoto from './ReportPhoto';
import { CLOSED_UI, whoLine } from './labels';

type Props = { report: Report; onConfirm: (as: ClosedAs) => void; onCancel: () => void };

export default function CloseCaseScreen({ report: r, onConfirm, onCancel }: Props) {
  const [choice, setChoice] = useState<ClosedAs | null>(null);
  const lost = r.type === 'lost';
  const sub: Record<ClosedAs, string> = {
    found: lost ? 'الطفل الآن مع أهله' : 'وصلت إليه وهو بخير أو مع أهله',
    security: lost ? 'سلّمته لنقطة الأمن ليتواصلوا مع أهله' : 'سلّمته للأمن أو للإسعاف',
  };

  return (
    <>
      <Text style={ui.sectionTitle}>إغلاق البلاغ</Text>

      <View style={[ui.card, s.who]}>
        <ReportPhoto report={r} size={50} />
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{r.member.name}</Text>
          <Text style={ui.muted}>{whoLine(r)}</Text>
        </View>
      </View>

      <Text style={ui.caption}>كيف انتهى البلاغ؟</Text>
      <View style={{ gap: 10 }}>
        {(['found', 'security'] as ClosedAs[]).map((k) => {
          const on = choice === k;
          const u = CLOSED_UI[k];
          return (
            <Pressable
              key={k}
              onPress={() => setChoice(k)}
              style={[s.option, on && { borderColor: u.color, backgroundColor: k === 'found' ? C.safeBg : C.techBg }]}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <Ionicons name={on ? u.icon : (`${u.icon}-outline` as typeof u.icon)} size={28} color={on ? u.color : C.faint} />
              <View style={{ flex: 1 }}>
                <Text style={[s.optTitle, on && { color: u.color }]}>{u.label}</Text>
                <Text style={ui.muted}>{sub[k]}</Text>
              </View>
              <View style={[s.radio, on && { borderColor: u.color }]}>{on && <View style={[s.radioDot, { backgroundColor: u.color }]} />}</View>
            </Pressable>
          );
        })}
      </View>

      <View style={s.privacy}>
        <Ionicons name="trash-outline" size={15} color={C.accent} />
        <Text style={s.privacyText}>عند الإغلاق تُحذف صلاحيتك على السوار، وتُحذف بياناته الصحية وصورته من جوالك</Text>
      </View>

      <Pressable style={[ui.btn, { marginTop: 18 }, !choice && { opacity: 0.4 }]} disabled={!choice} onPress={() => choice && onConfirm(choice)}>
        <Text style={ui.btnText}>تأكيد وإغلاق البلاغ</Text>
      </Pressable>
      <Pressable style={s.cancel} onPress={onCancel} hitSlop={6}>
        <Text style={s.cancelText}>رجوع، البلاغ ما زال مفتوحًا</Text>
      </Pressable>
    </>
  );
}

const s = StyleSheet.create({
  who: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, padding: 14 },
  name: { color: C.primary, fontSize: F.h2, fontWeight: '700', textAlign: 'right' },
  option: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 12,
    backgroundColor: C.card, borderWidth: 2, borderColor: C.border, borderRadius: 16, padding: 15,
  },
  optTitle: { color: C.text, fontSize: 16, fontWeight: '700', textAlign: 'right', marginBottom: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.barOff, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 11, height: 11, borderRadius: 6 },
  privacy: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 6, marginTop: 16, paddingHorizontal: 4 },
  privacyText: { color: C.accent, fontSize: 12.5, textAlign: 'right', flex: 1, lineHeight: 19 },
  cancel: { alignItems: 'center', paddingTop: 14 },
  cancelText: { color: C.muted, fontSize: 13.5, fontWeight: '600' },
});
