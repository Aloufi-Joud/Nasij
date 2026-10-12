// On-duty mode: the volunteer turns receiving reports on or off
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import { Pressable, easeOut } from '../../components/Motion';
import { Ionicons } from '@expo/vector-icons';
import { C, F, ui } from '../../theme';
import type { Language, Report, ReportType } from '../../mock';
import { LanguagePicker } from '../../components/LanguagePicker';
import { TYPE_UI, since } from './labels';
import { isEn, tr, place } from '../../i18n';

// text is read at render, so the notice follows a language switch
export type Notice = { text: () => string; tone: 'safe' | 'warn' | 'danger' };

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

export const TONE = {
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
          <Text style={[ui.stripText, { color: tone.color }]}>{p.notice.text()}</Text>
        </Pressable>
      )}

      <Text style={ui.sectionTitle}>{tr('وضع المناوبة', 'Duty mode')}</Text>

      <View style={[ui.card, p.onDuty && { borderColor: C.mint }]}>
        <View style={s.dutyRow}>
          <View style={[s.dutyIcon, { backgroundColor: p.onDuty ? C.safeBg : C.fill }]}>
            <Ionicons name={p.onDuty ? 'radio' : 'radio-outline'} size={26} color={p.onDuty ? C.safe : C.faint} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.dutyTitle}>{p.onDuty ? tr('أنت في المناوبة', 'You’re on duty') : tr('أنت خارج المناوبة', 'You’re off duty')}</Text>
            <Text style={ui.muted}>{p.onDuty ? tr('تصلك البلاغات المفتوحة في الفعالية', 'You get open reports at the event') : tr('لن تصلك أي بلاغات', 'You won’t get any reports')}</Text>
          </View>
          <Pressable
            onPress={p.onToggle}
            disabled={p.busy}
            hitSlop={8}
            style={[s.toggle, p.busy && { opacity: 0.4 }]}
            accessibilityRole="switch"
            accessibilityState={{ checked: p.onDuty, disabled: p.busy }}
          >
            <Switch on={p.onDuty} />
          </Pressable>
        </View>

        {p.onDuty && (
          <View style={s.details}>
            <View style={s.detail}>
              <Ionicons name="location-outline" size={15} color={C.accent} />
              <Text style={s.detailText}>
                {p.locationDenied
                  ? tr('الموقع غير مفعّل، لن يظهر مكانك لفريق الأمن', 'Location is off, security won’t see where you are')
                  : tr(`منطقتك: ${p.area || 'خارج مناطق الفعالية'}`, `Your area: ${p.area ? place(p.area) : 'outside the event zones'}`)}
              </Text>
            </View>
            <View style={s.detail}>
              <Ionicons name="lock-closed-outline" size={15} color={C.accent} />
              <Text style={s.detailText}>{tr('جوالك يتعرّف فقط على الأساور المبلَّغ عنها، ولا يرى أي سوار آخر', 'Your phone only recognises reported bracelets, never any other')}</Text>
            </View>
          </View>
        )}
        {p.busy && <Text style={s.locked}>{tr('أغلق البلاغ الحالي قبل إنهاء المناوبة', 'Close the current report before going off duty')}</Text>}
      </View>

      <Text style={ui.caption}>{tr('اللغات اللي تتكلمها', 'Languages you speak')}</Text>
      <LanguagePicker multi selected={p.languages} onPick={p.onToggleLanguage} />
      <Text style={s.langHint}>{tr('بلاغات من يتكلم لغتك توصلك أول', 'Reports for people who speak your language reach you first')}</Text>

      <View style={s.stats}>
        <View style={s.stat}>
          <Text style={s.statNum}>{p.onDuty ? p.waiting.length : '—'}</Text>
          <Text style={s.statLabel}>{tr('بلاغات تنتظر متطوعًا', 'Waiting for a volunteer')}</Text>
        </View>
        <View style={s.stat}>
          <Text style={s.statNum}>{p.closedCount}</Text>
          <Text style={s.statLabel}>{tr('بلاغات أغلقتها', 'Reports you closed')}</Text>
        </View>
      </View>

      {/* Open reports nobody took yet, including ones this volunteer skipped */}
      {p.onDuty && p.waiting.length > 0 && (
        <>
          <Text style={ui.caption}>{tr('بلاغات مفتوحة', 'Open reports')}</Text>
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

// Knob slides and the green track fades in, following the real duty state (it can flip a moment after the tap)
function Switch({ on }: { on: boolean }) {
  const [v] = useState(() => new Animated.Value(on ? 1 : 0));
  useEffect(() => {
    Animated.timing(v, { toValue: on ? 1 : 0, duration: 220, easing: easeOut, useNativeDriver: true }).start();
  }, [v, on]);
  // Off = knob at the start side, on = slid to the end (left in Arabic, right in English)
  const slide = { transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, isEn() ? 24 : -24] }) }] };
  return (
    <>
      <Animated.View style={[s.trackOn, { opacity: v }]} />
      <Animated.View style={[s.knob, slide]} />
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
  dutyIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dutyTitle: { color: C.primary, fontSize: F.h2, fontWeight: '700', textAlign: 'right', marginBottom: 2 },
  toggle: { width: 58, height: 34, borderRadius: 17, backgroundColor: C.barOff, padding: 3, justifyContent: 'center' },
  trackOn: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: 17, backgroundColor: C.safe },
  knob: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff', alignSelf: 'flex-end',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2,
  },
  details: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border, gap: 8 },
  detail: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 7 },
  detailText: { color: C.muted, fontSize: F.small, textAlign: 'right', flex: 1 },
  locked: { color: C.warn, fontSize: 12.5, fontWeight: '600', textAlign: 'right', marginTop: 10 },

  langHint: { color: C.faint, fontSize: 12, textAlign: 'right', marginTop: 6 },

  stats: { flexDirection: 'row-reverse', gap: 12, marginTop: 14 },
  stat: { ...ui.tile, flex: 1 },
  statNum: { color: C.primary, fontSize: 26, fontWeight: '800', textAlign: 'right', fontVariant: ['tabular-nums'] },
  statLabel: { color: C.muted, fontSize: 12, textAlign: 'right', marginTop: 2 },

  demo: { gap: 8 },
  demoBtn: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
    ...ui.tile,
  },
  demoText: { color: C.text, fontSize: 14, fontWeight: '600', textAlign: 'right' },
  demoName: { color: C.faint, fontSize: 13, flex: 1, textAlign: 'left' },
});
