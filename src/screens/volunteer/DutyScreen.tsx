// On-duty mode: the volunteer turns receiving reports on or off
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, ui } from '../../theme';
import { LANGUAGES, type Language, type Report, type ReportType } from '../../mock';
import { TYPE_UI, since } from './labels';

export type Notice = { text: string; tone: 'safe' | 'warn' | 'danger' };

type Props = {
  onDuty: boolean;
  onToggle: () => void;
  area: string; // '' = outside the event or location unknown
  locationDenied: boolean;
  busy: boolean; // a case is open, so the toggle is locked
  closedCount: number; // cases this volunteer closed in this session
  notice: Notice | null; // case closed, taken by someone else, or an error
  onDismissNotice: () => void;
  waiting: Report[]; // open reports nobody has taken yet
  now: number;
  onShow: (report: Report) => void;
  languages: Language[]; // languages this volunteer speaks
  onToggleLanguage: (l: Language) => void;
};

const TONE = {
  safe: { color: C.safe, bg: C.safeBg, icon: 'checkmark-circle' },
  warn: { color: C.warn, bg: C.warnBg, icon: 'information-circle' },
  danger: { color: C.danger, bg: C.dangerBg, icon: 'alert-circle' },
} as const;

export default function DutyScreen(p: Props) {
  const tone = p.notice ? TONE[p.notice.tone] : null;

  return (
    <>
      {p.notice && tone && (
        <Pressable style={[ui.strip, { backgroundColor: tone.bg }]} onPress={p.onDismissNotice}>
          <Ionicons name={tone.icon} size={16} color={tone.color} />
          <Text style={[ui.stripText, { color: tone.color }]}>{p.notice.text}</Text>
        </Pressable>
      )}

      <Text style={ui.sectionTitle}>وضع المناوبة</Text>

      <View style={[ui.card, p.onDuty && { borderColor: C.mint }]}>
        <View style={s.dutyRow}>
          <View style={[s.dutyIcon, { backgroundColor: p.onDuty ? C.safeBg : '#F0EEE6' }]}>
            <Ionicons name={p.onDuty ? 'radio' : 'radio-outline'} size={26} color={p.onDuty ? C.safe : C.faint} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.dutyTitle}>{p.onDuty ? 'أنت في المناوبة' : 'أنت خارج المناوبة'}</Text>
            <Text style={ui.muted}>{p.onDuty ? 'تصلك البلاغات المفتوحة في الفعالية' : 'لن تصلك أي بلاغات'}</Text>
          </View>
          <Pressable
            onPress={p.onToggle}
            disabled={p.busy}
            hitSlop={8}
            style={[s.toggle, p.onDuty && s.toggleOn, p.busy && { opacity: 0.4 }]}
            accessibilityRole="switch"
            accessibilityState={{ checked: p.onDuty, disabled: p.busy }}
          >
            <View style={[s.knob, p.onDuty && s.knobOn]} />
          </Pressable>
        </View>

        {p.onDuty && (
          <View style={s.details}>
            <View style={s.detail}>
              <Ionicons name="location-outline" size={15} color={C.accent} />
              <Text style={s.detailText}>
                {p.locationDenied ? 'الموقع غير مفعّل، لن يظهر مكانك لفريق الأمن' : `منطقتك: ${p.area || 'خارج مناطق الفعالية'}`}
              </Text>
            </View>
            <View style={s.detail}>
              <Ionicons name="lock-closed-outline" size={15} color={C.accent} />
              <Text style={s.detailText}>جوالك يتعرّف فقط على الأساور المبلَّغ عنها، ولا يرى أي سوار آخر</Text>
            </View>
          </View>
        )}
        {p.busy && <Text style={s.locked}>أغلق البلاغ الحالي قبل إنهاء المناوبة</Text>}
      </View>

      <Text style={ui.caption}>اللغات اللي تتكلمها</Text>
      <View style={s.langs}>
        {(Object.keys(LANGUAGES) as Language[]).map((l) => {
          const on = p.languages.includes(l);
          return (
            <Pressable
              key={l}
              onPress={() => p.onToggleLanguage(l)}
              style={[s.lang, on && s.langOn]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
            >
              <Text style={[s.langText, on && { color: '#fff' }]}>{LANGUAGES[l]}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={s.langHint}>بلاغات من يتكلم لغتك توصلك أول</Text>

      <View style={s.stats}>
        <View style={s.stat}>
          <Text style={s.statNum}>{p.onDuty ? p.waiting.length : '—'}</Text>
          <Text style={s.statLabel}>بلاغات تنتظر متطوعًا</Text>
        </View>
        <View style={s.stat}>
          <Text style={s.statNum}>{p.closedCount}</Text>
          <Text style={s.statLabel}>بلاغات أغلقتها</Text>
        </View>
      </View>

      {/* Open reports nobody took yet, including ones this volunteer skipped */}
      {p.onDuty && p.waiting.length > 0 && (
        <>
          <Text style={ui.caption}>بلاغات مفتوحة</Text>
          <View style={s.demo}>
            {p.waiting.map((r) => (
              <ReportRow key={r.id} type={r.type} name={r.member.name} when={since(r.createdAt, p.now)} disabled={p.busy} onPress={() => p.onShow(r)} />
            ))}
          </View>
        </>
      )}
    </>
  );
}

function ReportRow(p: { type: ReportType; name: string; when: string; disabled: boolean; onPress: () => void }) {
  const t = TYPE_UI[p.type];
  return (
    <Pressable style={[s.demoBtn, p.disabled && { opacity: 0.4 }]} disabled={p.disabled} onPress={p.onPress}>
      <Ionicons name={t.icon} size={18} color={t.color} />
      <Text style={s.demoText}>{t.label}</Text>
      <Text style={s.demoName}>
        {p.name} · {p.when}
      </Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  dutyRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  dutyIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dutyTitle: { color: C.primary, fontSize: F.h2, fontWeight: '700', textAlign: 'right', marginBottom: 2 },
  toggle: { width: 58, height: 34, borderRadius: 17, backgroundColor: C.barOff, padding: 3, justifyContent: 'center' },
  toggleOn: { backgroundColor: C.safe },
  // RTL: off = knob on the right, on = knob on the left
  knob: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff', alignSelf: 'flex-end' },
  knobOn: { alignSelf: 'flex-start' },
  details: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border, gap: 8 },
  detail: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 7 },
  detailText: { color: C.muted, fontSize: F.small, textAlign: 'right', flex: 1 },
  locked: { color: C.warn, fontSize: 12.5, fontWeight: '600', textAlign: 'right', marginTop: 10 },

  langs: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 },
  lang: { borderWidth: 1.5, borderColor: C.border, borderRadius: 20, paddingVertical: 7, paddingHorizontal: 13, backgroundColor: C.card },
  langOn: { backgroundColor: C.primary, borderColor: C.primary },
  langText: { color: C.text, fontSize: 13, fontWeight: '600' },
  langHint: { color: C.faint, fontSize: 12, textAlign: 'right', marginTop: 6 },

  stats: { flexDirection: 'row-reverse', gap: 12, marginTop: 14 },
  stat: { flex: 1, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, borderRadius: 14, padding: 13 },
  statNum: { color: C.primary, fontSize: 22, fontWeight: '700', textAlign: 'right' },
  statLabel: { color: C.muted, fontSize: 12, textAlign: 'right', marginTop: 2 },

  demo: { gap: 8 },
  demoBtn: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
    backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, borderRadius: 14, padding: 13,
  },
  demoText: { color: C.text, fontSize: 14, fontWeight: '600', textAlign: 'right' },
  demoName: { color: C.faint, fontSize: 13, flex: 1, textAlign: 'left' },
});
