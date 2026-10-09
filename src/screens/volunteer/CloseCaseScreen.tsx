// Close case: handed to the family, helped on the spot (emergency press or fall only), or handed to security.
// Closing deletes this volunteer's access to the bracelet and the medical data.
// Handing a child to the family needs the code from the family's app, so a stranger cannot claim the child.
// This screen never knows the right code: the typed code goes with the close, and the rules check it.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../components/Text';
import { Pressable } from '../../components/Motion';
import { Ionicons } from '@expo/vector-icons';
import { C, F, ui } from '../../theme';
import type { ClosedAs, Report } from '../../mock';
import ReportPhoto from './ReportPhoto';
import { CLOSED_UI, whoLine } from './labels';
import { latinDigits } from '../../components/digits';
import { tr } from '../../i18n';

// onConfirm resolves to 'wrong' when the rules refused the typed code
type Props = {
  report: Report;
  onConfirm: (as: ClosedAs, code?: string) => Promise<'wrong' | void>;
  onCancel: () => void;
};

export default function CloseCaseScreen({ report: r, onConfirm, onCancel }: Props) {
  const [choice, setChoice] = useState<ClosedAs | null>(null);
  const [typed, setTyped] = useState('');
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const needsCode = choice === 'found' && !!r.hasCode;
  const ready = !!choice && (!needsCode || typed.length === 6) && !busy;
  const confirm = async () => {
    if (!ready) return;
    setBusy(true);
    const result = await onConfirm(choice, needsCode ? typed : undefined).finally(() => setBusy(false));
    if (result === 'wrong') setWrong(true);
  };
  const lost = r.type === 'lost';
  const sub: Partial<Record<ClosedAs, string>> = {
    found: lost ? tr('تواصلت مع أهله وصار معهم', 'I reached the family, they’re together') : tr('وصل أهله وصار معهم', 'The family arrived, they’re together'),
    helped: tr('ساعدته وهو بخير، وما احتاج أحد يستلمه', 'I helped, they’re fine, no handover needed'),
    security: lost
      ? tr('ما قدرت أوصل لأهله، سلّمته لنقطة الأمن', 'Couldn’t reach the family, handed to a security point')
      : tr('سلّمته للأمن أو للإسعاف', 'Handed to security or ambulance'),
  };
  // A lost child goes back to the family; an emergency press may only need a hand
  const options: ClosedAs[] = lost ? ['found', 'security'] : ['helped', 'found', 'security'];

  return (
    <>
      <Text style={ui.sectionTitle}>{tr('إغلاق البلاغ', 'Close report')}</Text>

      <View style={[ui.card, s.who]}>
        <ReportPhoto report={r} size={50} />
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{r.member.name}</Text>
          <Text style={ui.muted}>{whoLine(r)}</Text>
        </View>
      </View>

      <Text style={ui.caption}>{tr('كيف انتهى البلاغ؟', 'How did it end?')}</Text>
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

      {needsCode && (
        <View style={[ui.card, { marginTop: 14 }]}>
          <Text style={s.codeTitle}>{tr('رمز التسليم', 'Handover code')}</Text>
          <Text style={ui.muted}>
            {tr(
              `اطلب من ولي الأمر يفتح تطبيق نسيج ويقرأ لك الرمز، وتأكد إن ${r.member.name} يعرفه ويرتاح له`,
              `Ask the guardian to open Nasij and read you the code, and check ${r.member.name} knows them and is at ease`,
            )}
          </Text>
          <TextInput
            style={[s.codeInput, wrong && { borderColor: C.danger }]}
            value={typed}
            onChangeText={(t) => {
              setTyped(latinDigits(t).slice(0, 6));
              setWrong(false);
            }}
            placeholder={tr('٦ أرقام', '6 digits')}
            placeholderTextColor={C.faint}
            keyboardType="number-pad"
            textAlign="center"
          />
          {wrong && <Text style={s.codeWrong}>{tr('الرمز غلط، لا تسلّمه. إذا شاكّ، سلّمه لنقطة الأمن', 'Wrong code, don’t hand over. If in doubt, take them to a security point')}</Text>}
        </View>
      )}

      <View style={s.privacy}>
        <Ionicons name="trash-outline" size={15} color={C.accent} />
        <Text style={s.privacyText}>{tr('عند الإغلاق تُحذف صلاحيتك على السوار، وتُحذف بياناته الصحية وصورته من جوالك', 'On closing, your access to the bracelet ends and their health details and photo are deleted from your phone')}</Text>
      </View>

      <Pressable style={[ui.btn, { marginTop: 18 }, !ready && { opacity: 0.4 }]} disabled={!ready} onPress={confirm}>
        <Text style={ui.btnText}>{busy ? tr('جارٍ التحقق…', 'Checking…') : tr('تأكيد وإغلاق البلاغ', 'Confirm and close')}</Text>
      </Pressable>
      <Pressable style={s.cancel} onPress={onCancel} hitSlop={6}>
        <Text style={s.cancelText}>{tr('رجوع، البلاغ ما زال مفتوحًا', 'Back, the report stays open')}</Text>
      </Pressable>
    </>
  );
}

const s = StyleSheet.create({
  who: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, padding: 14 },
  name: { color: C.primary, fontSize: F.h2, fontWeight: '700', textAlign: 'right' },
  option: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 12,
    ...ui.tile, borderWidth: 2, padding: 15,
  },
  optTitle: { color: C.text, fontSize: 16, fontWeight: '700', textAlign: 'right', marginBottom: 2 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.barOff, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 11, height: 11, borderRadius: 6 },
  privacy: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 6, marginTop: 16, paddingHorizontal: 4 },
  privacyText: { color: C.accent, fontSize: 12.5, textAlign: 'right', flex: 1, lineHeight: 19 },
  cancel: { alignItems: 'center', paddingTop: 14 },
  codeTitle: { color: C.primary, fontSize: 16, fontWeight: '700', textAlign: 'right', marginBottom: 4 },
  codeInput: {
    ...ui.input, marginTop: 12, fontSize: 24, fontWeight: '700', letterSpacing: 8, fontVariant: ['tabular-nums'],
  },
  codeWrong: { color: C.danger, fontSize: 13, fontWeight: '600', textAlign: 'right', marginTop: 8 },
  cancelText: { color: C.muted, fontSize: 13.5, fontWeight: '600' },
});
