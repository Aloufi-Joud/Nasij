// Incoming report: child's photo and description (or an elderly emergency), "I'm searching" button
import { StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import { Pressable } from '../../components/Motion';
import { Ionicons } from '@expo/vector-icons';
import { C, F, ui } from '../../theme';
import type { Report } from '../../mock';
import { langName, tr, place } from '../../i18n';
import ReportPhoto from './ReportPhoto';
import { TYPE_UI, since, whoLine } from './labels';

// speaks = this volunteer speaks the member's language
type Props = { report: Report; now: number; speaks: boolean; onAccept: () => void; onDecline: () => void };

export default function AlertCard({ report: r, now, speaks, onAccept, onDecline }: Props) {
  const t = TYPE_UI[r.type];
  const lost = r.type === 'lost';
  const urgentText =
    r.type === 'emergency'
      ? tr(`${r.member.name} ضغط زر الطوارئ في السوار مرتين`, `${r.member.name} pressed the bracelet’s emergency button twice`)
      : tr(`سوار ${r.member.name} توقف عن الحركة ٣ دقائق`, `${r.member.name}’s bracelet hasn’t moved for 3 minutes`);

  return (
    <View style={[s.card, { borderColor: lost ? C.warnBorder : C.dangerBorder }]}>
      <View style={[s.head, { backgroundColor: lost ? C.warnBg : C.danger }]}>
        <Ionicons name={t.icon} size={18} color={lost ? C.warn : '#fff'} />
        <Text style={[s.headText, { color: lost ? C.warn : '#fff' }]}>{tr(`بلاغ جديد: ${t.label}`, `New report: ${t.label}`)}</Text>
        <Text style={[s.headTime, { color: lost ? C.warn : '#FDECEA' }]}>{since(r.createdAt, now)}</Text>
      </View>

      <View style={s.body}>
        {lost ? (
          <View style={s.photoWrap}>
            <ReportPhoto report={r} size={132} />
          </View>
        ) : (
          <Text style={s.urgent}>{urgentText}</Text>
        )}

        <View style={s.nameRow}>
          {!lost && <ReportPhoto report={r} size={44} />}
          <View style={{ flex: lost ? undefined : 1, alignItems: lost ? 'center' : 'flex-end' }}>
            <Text style={[s.name, lost && { textAlign: 'center' }]}>{r.member.name}</Text>
            <Text style={[ui.muted, lost && { textAlign: 'center' }]}>{whoLine(r)}</Text>
          </View>
        </View>

        {speaks && r.member.language && r.member.language !== 'ar' && (
          <View style={s.badge}>
            <Ionicons name="chatbubbles-outline" size={15} color={C.safe} />
            <Text style={s.badgeText}>
              {tr(
                `تتكلم لغته (${langName(r.member.language)})، أنت الأنسب لهذا البلاغ`,
                `You speak their language (${langName(r.member.language)}), you’re the best fit`,
              )}
            </Text>
          </View>
        )}

        {!!r.description.trim() && (
          <View style={s.box}>
            <Text style={s.boxLabel}>{lost ? tr('الوصف من الأهل', 'Description from the family') : tr('كيف تتعرف عليه', 'How to recognise them')}</Text>
            <Text style={s.boxText}>{r.description}</Text>
          </View>
        )}

        <View style={s.info}>
          <Ionicons name="location-outline" size={15} color={C.accent} />
          <Text style={s.infoText}>{tr(`آخر مكان معروف: ${r.area}`, `Last known place: ${place(r.area)}`)}</Text>
        </View>
        {r.health && (
          <View style={s.info}>
            <Ionicons name="medkit-outline" size={15} color={C.danger} />
            <Text style={s.infoText}>{tr('لديه حالة صحية، تظهر تفاصيلها لمن يقبل البلاغ فقط', 'Has a health condition, details shown only to whoever accepts')}</Text>
          </View>
        )}

        <Pressable style={[ui.btn, { marginTop: 16 }, !lost && { backgroundColor: C.danger }]} onPress={onAccept}>
          <Ionicons name={lost ? 'search' : 'walk'} size={19} color="#fff" />
          <Text style={ui.btnText}>{lost ? tr('أنا أبحث', 'I’m searching') : tr('أنا متجه إليه', 'I’m on my way')}</Text>
        </Pressable>
        <Pressable style={s.decline} onPress={onDecline} hitSlop={6}>
          <Text style={s.declineText}>{tr('لست قريبًا، اترك البلاغ لغيري', 'Not nearby, leave it for someone else')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: C.card, borderRadius: 24, borderWidth: 2, overflow: 'hidden', marginBottom: 18,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  head: { flexDirection: 'row-reverse', alignItems: 'center', gap: 7, paddingVertical: 11, paddingHorizontal: 14 },
  headText: { fontSize: 14, fontWeight: '700', textAlign: 'right' },
  headTime: { fontSize: 12, flex: 1, textAlign: 'left' },
  body: { padding: 16 },
  photoWrap: { alignItems: 'center', marginBottom: 10 },
  urgent: { color: C.danger, fontSize: F.body, fontWeight: '700', textAlign: 'right', marginBottom: 12 },
  nameRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, justifyContent: 'center' },
  name: { color: C.primary, fontSize: 22, fontWeight: '700', textAlign: 'right' },
  box: { backgroundColor: C.fill, borderRadius: 14, padding: 12, marginTop: 14 },
  badge: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 7, marginTop: 12,
    backgroundColor: C.safeBg, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10,
  },
  badgeText: { color: C.safe, fontSize: F.small, fontWeight: '700', textAlign: 'right', flex: 1 },
  boxLabel: { color: C.faint, fontSize: 12, fontWeight: '700', textAlign: 'right', marginBottom: 4 },
  boxText: { color: C.text, fontSize: F.body, lineHeight: 23, textAlign: 'right' },
  info: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 7, marginTop: 10 },
  infoText: { color: C.muted, fontSize: F.small, textAlign: 'right', flex: 1 },
  decline: { alignItems: 'center', paddingTop: 13 },
  declineText: { color: C.muted, fontSize: 13.5, fontWeight: '600' },
});
