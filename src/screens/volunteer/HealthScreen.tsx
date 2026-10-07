// Health condition: shown only to the volunteer who accepted the report.
// Opens first for an elderly emergency or possible fall, and from the proximity screen
// for a lost child with a health condition.
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, ui } from '../../theme';
import type { Report, ReportType } from '../../mock';
import ReportPhoto from './ReportPhoto';
import { TYPE_UI, since, whoLine } from './labels';

const AMBULANCE = '997'; // Saudi Red Crescent

const STEPS: Record<ReportType, string[]> = {
  emergency: ['اتجه إليه الآن وتأكد أنه بخير', 'إذا كان مصابًا أو لا يستجيب اتصل بالإسعاف فورًا', 'ابقَ معه، وأخبر المسعفين بحالته الصحية'],
  fall: [
    'اتجه إليه الآن، قد يكون سقط',
    'لا تحرّكه إذا اشتكى من ألم أو لم يقدر يقوم',
    'اتصل بالإسعاف إذا كان مصابًا أو لا يستجيب، وابقَ معه حتى يصلوا',
  ],
  lost: ['عند العثور عليه انتبه لحالته قبل أي شيء', 'إذا احتاج مساعدة طبية اتصل بالإسعاف', 'أخبر الأمن أو الإسعاف بحالته عند التسليم'],
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

      <Text style={ui.caption}>الحالة الصحية</Text>
      {r.health ? (
        <View style={[ui.card, { borderColor: C.dangerBorder }]}>
          <View style={s.condRow}>
            <Ionicons name="medkit" size={20} color={C.danger} />
            <Text style={s.cond}>{r.health.condition}</Text>
          </View>
          <Text style={s.notes}>{r.health.notes}</Text>
          <Text style={s.from}>كتبتها العائلة عند إضافته</Text>
        </View>
      ) : (
        <View style={ui.card}>
          <Text style={ui.muted}>{loading ? 'جارٍ تحميل الحالة الصحية…' : 'لم تضف العائلة حالة صحية'}</Text>
        </View>
      )}

      <Text style={ui.caption}>ماذا تفعل</Text>
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
          <Text style={ui.btnText}>اتصل بالإسعاف {AMBULANCE}</Text>
        </Pressable>
        <Pressable style={ui.btnGhost} onPress={onGoTo}>
          <Ionicons name={urgent ? 'navigate-outline' : 'arrow-forward'} size={18} color={C.primary} />
          <Text style={ui.btnGhostText}>{goToLabel}</Text>
        </Pressable>
      </View>

      <View style={s.privacy}>
        <Ionicons name="lock-closed-outline" size={14} color={C.accent} />
        <Text style={s.privacyText}>هذه البيانات تظهر لك وحدك لأنك قبلت البلاغ، وتُحذف من جوالك عند إغلاقه</Text>
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
