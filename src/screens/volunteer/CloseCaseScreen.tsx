// Close case: handed to the family, helped on the spot (emergency press or fall only), or handed to security.
// Closing deletes this volunteer's access to the bracelet and the medical data.
// Handing over to the family needs the code from the family's app, so a stranger cannot claim the child.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, ui } from '../../theme';
import type { ClosedAs, Report } from '../../mock';
import ReportPhoto from './ReportPhoto';
import { CLOSED_UI, whoLine } from './labels';
import { latinDigits } from '../../components/digits';

// code: handover code of the report; null on older reports (no check then);
// undefined while it could not be loaded, which blocks "handed to the family" (fails closed)
type Props = { report: Report; code: string | null | undefined; onConfirm: (as: ClosedAs) => void; onCancel: () => void };

export default function CloseCaseScreen({ report: r, code, onConfirm, onCancel }: Props) {
  const [choice, setChoice] = useState<ClosedAs | null>(null);
  const [typed, setTyped] = useState('');
  const needsCode = choice === 'found' && code !== null;
  const wrong = needsCode && typed.length === 4 && typed !== code;
  const ready = !!choice && (!needsCode || (!!code && typed === code));
  const lost = r.type === 'lost';
  const sub: Record<ClosedAs, string> = {
    found: lost ? 'تواصلت مع أهله وصار معهم' : 'وصل أهله وصار معهم',
    helped: 'ساعدته وهو بخير، وما احتاج أحد يستلمه',
    security: lost ? 'ما قدرت أوصل لأهله، سلّمته لنقطة الأمن' : 'سلّمته للأمن أو للإسعاف',
  };
  // A lost child goes back to the family; an emergency press may only need a hand
  const options: ClosedAs[] = lost ? ['found', 'security'] : ['helped', 'found', 'security'];

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
        {options.map((k) => {
          const on = choice === k;
          const u = CLOSED_UI[k];
          return (
            <Pressable
              key={k}
              onPress={() => setChoice(k)}
              style={[s.option, on && { borderColor: u.color, backgroundColor: k === 'security' ? C.techBg : C.safeBg }]}
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

      {needsCode && code === undefined && (
        <Text style={s.codeWrong}>ما قدرنا نجيب رمز التسليم، تأكد من الإنترنت وارجع لهالشاشة. إذا ما ضبط، سلّمه لنقطة الأمن</Text>
      )}
      {needsCode && !!code && (
        <View style={[ui.card, { marginTop: 14 }]}>
          <Text style={s.codeTitle}>رمز التسليم</Text>
          <Text style={ui.muted}>اطلب من ولي الأمر يفتح تطبيق نسيج ويقرأ لك الرمز، وتأكد إن {r.member.name} يعرفه ويرتاح له</Text>
          <TextInput
            style={[s.codeInput, wrong && { borderColor: C.danger }]}
            value={typed}
            onChangeText={(t) => setTyped(latinDigits(t).slice(0, 4))}
            placeholder="٤ أرقام"
            placeholderTextColor={C.faint}
            keyboardType="number-pad"
            textAlign="center"
          />
          {wrong && <Text style={s.codeWrong}>الرمز غلط، لا تسلّمه. إذا شاكّ، سلّمه لنقطة الأمن</Text>}
        </View>
      )}

      <View style={s.privacy}>
        <Ionicons name="trash-outline" size={15} color={C.accent} />
        <Text style={s.privacyText}>عند الإغلاق تُحذف صلاحيتك على السوار، وتُحذف بياناته الصحية وصورته من جوالك</Text>
      </View>

      <Pressable style={[ui.btn, { marginTop: 18 }, !ready && { opacity: 0.4 }]} disabled={!ready} onPress={() => ready && onConfirm(choice)}>
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
  codeTitle: { color: C.primary, fontSize: 16, fontWeight: '700', textAlign: 'right', marginBottom: 4 },
  codeInput: {
    marginTop: 12, backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.inputBorder, borderRadius: 12,
    paddingVertical: 12, fontSize: 24, fontWeight: '700', letterSpacing: 8, color: C.text,
  },
  codeWrong: { color: C.danger, fontSize: 13, fontWeight: '600', textAlign: 'right', marginTop: 8 },
  cancelText: { color: C.muted, fontSize: 13.5, fontWeight: '600' },
});
