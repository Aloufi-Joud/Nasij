// Health condition: shown only to the volunteer who accepted the report.
// Opens first for an elderly emergency or possible fall, and from the proximity screen
// for a lost child with a health condition.
import { Linking, StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import { Pressable } from '../../components/Motion';
import { Ionicons } from '@expo/vector-icons';
import { C, F, ui } from '../../theme';
import type { Report, ReportType } from '../../mock';
import ReportPhoto from './ReportPhoto';
import { TYPE_UI, since, whoLine } from './labels';
import { tr } from '../../i18n';

const AMBULANCE = '997'; // Saudi Red Crescent

const STEPS: Record<ReportType, string[]> = {
  get emergency() {
    return [
      tr('اتجه إليه الآن وتأكد أنه بخير', 'Go to them now and check they’re okay'),
      tr('إذا كان مصابًا أو لا يستجيب اتصل بالإسعاف فورًا', 'If they’re hurt or not responding, call an ambulance right away'),
      tr('ابقَ معه، وأخبر المسعفين بحالته الصحية', 'Stay with them and tell the paramedics about their condition'),
    ];
  },
  get fall() {
    return [
      tr('اتجه إليه الآن، قد يكون سقط', 'Go to them now, they may have fallen'),
      tr('لا تحرّكه إذا اشتكى من ألم أو لم يقدر يقوم', 'Don’t move them if they’re in pain or can’t get up'),
      tr('اتصل بالإسعاف إذا كان مصابًا أو لا يستجيب، وابقَ معه حتى يصلوا', 'Call an ambulance if they’re hurt or not responding, and stay until it arrives'),
    ];
  },
  get lost() {
    return [
      tr('عند العثور عليه انتبه لحالته قبل أي شيء', 'Once found, check on their condition first'),
      tr('إذا احتاج مساعدة طبية اتصل بالإسعاف', 'If they need medical help, call an ambulance'),
      tr('أخبر الأمن أو الإسعاف بحالته عند التسليم', 'Tell security or paramedics about their condition at handover'),
    ];
  },
};

type Props = {
  report: Report;
  now: number;
  loading?: boolean; // health is fetched after accepting
  onGoTo: () => void; // open the proximity screen
  goToLabel: string;
};

export default function HealthScreen({ report: r, now, loading, onGoTo, goToLabel }: Props) {
  const t = TYPE_UI[r.type];
  const urgent = r.type !== 'lost';

  return (
    <>
      {urgent && (
        <View style={s.banner}>
          <View style={s.bannerIcon}>
            <Ionicons name={t.icon} size={28} color={C.danger} />
          </View>
          <Text style={s.bannerTitle}>{t.label}</Text>
          <Text style={s.bannerText}>
            {r.member.name} · {since(r.createdAt, now)}
          </Text>
        </View>
      )}

      <View style={[ui.card, s.who]}>
        <ReportPhoto report={r} size={50} />
        <View style={{ flex: 1 }}>
          <Text style={s.name}>{r.member.name}</Text>
          <Text style={ui.muted}>{whoLine(r)}</Text>
        </View>
      </View>

      <Text style={ui.caption}>{tr('الحالة الصحية', 'Health condition')}</Text>
      {r.health ? (
        <View style={[ui.card, { borderColor: C.dangerBorder }]}>
          <View style={s.condRow}>
            <Ionicons name="medkit" size={20} color={C.danger} />
            <Text style={s.cond}>{r.health.condition}</Text>
          </View>
          <Text style={s.notes}>{r.health.notes}</Text>
          <Text style={s.from}>{tr('كتبتها العائلة عند إضافته', 'Written by the family when adding them')}</Text>
        </View>
      ) : (
        <View style={ui.card}>
          <Text style={ui.muted}>{loading ? tr('جارٍ تحميل الحالة الصحية…', 'Loading health details…') : tr('لم تضف العائلة حالة صحية', 'The family added no health condition')}</Text>
        </View>
      )}

      <Text style={ui.caption}>{tr('ماذا تفعل', 'What to do')}</Text>
      <View style={ui.card}>
        {STEPS[r.type].map((step, i) => (
          <View key={i} style={[s.step, i > 0 && { marginTop: 10 }]}>
            <View style={s.num}>
              <Text style={s.numText}>{i + 1}</Text>
            </View>
            <Text style={s.stepText}>{step}</Text>
          </View>
        ))}
      </View>

      <View style={s.actions}>
        <Pressable style={[ui.btn, { backgroundColor: C.danger }]} onPress={() => Linking.openURL(`tel:${AMBULANCE}`)}>
          <Ionicons name="call" size={19} color="#fff" />
          <Text style={ui.btnText}>{tr(`اتصل بالإسعاف ${AMBULANCE}`, `Call ambulance ${AMBULANCE}`)}</Text>
        </Pressable>
        <Pressable style={ui.btnGhost} onPress={onGoTo}>
          <Ionicons name={urgent ? 'navigate-outline' : 'arrow-forward'} size={18} color={C.primary} />
          <Text style={ui.btnGhostText}>{goToLabel}</Text>
        </Pressable>
      </View>

      <View style={s.privacy}>
        <Ionicons name="lock-closed-outline" size={14} color={C.accent} />
        <Text style={s.privacyText}>{tr('هذه البيانات تظهر لك وحدك لأنك قبلت البلاغ، وتُحذف من جوالك عند إغلاقه', 'Only you see this because you accepted the report. It’s deleted from your phone when it closes')}</Text>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  banner: {
    backgroundColor: C.danger, borderRadius: 22, padding: 18, alignItems: 'center', marginBottom: 14,
    shadowColor: C.danger, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
  bannerIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  bannerTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  bannerText: { color: '#FDECEA', fontSize: 14, marginTop: 3 },
  who: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, padding: 14 },
  name: { color: C.primary, fontSize: F.h2, fontWeight: '700', textAlign: 'right' },
  condRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  cond: { color: C.danger, fontSize: 19, fontWeight: '700', textAlign: 'right' },
  notes: { color: C.text, fontSize: F.body, lineHeight: 24, textAlign: 'right', marginTop: 8 },
  from: { color: C.faint, fontSize: 11.5, textAlign: 'right', marginTop: 8 },
  step: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 10 },
  num: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.techBg, alignItems: 'center', justifyContent: 'center' },
  numText: { color: C.primary, fontSize: 12.5, fontWeight: '700' },
  stepText: { color: C.text, fontSize: 14.5, textAlign: 'right', flex: 1, lineHeight: 22 },
  actions: { gap: 10, marginTop: 20 },
  privacy: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 6, marginTop: 16, paddingHorizontal: 4 },
  privacyText: { color: C.accent, fontSize: 12, textAlign: 'right', flex: 1, lineHeight: 18 },
});
