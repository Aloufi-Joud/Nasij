// On-duty mode: the volunteer turns receiving reports on or off
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, ui } from '../../theme';
import type { Report, ReportType } from '../../mock';
import { TYPE_UI } from './labels';

type Props = {
  onDuty: boolean;
  onToggle: () => void;
  area: string;
  busy: boolean; // a case is open, so the toggle is locked
  dutyCount: number; // volunteers on duty now
  closedCount: number; // cases this volunteer closed in this session
  justClosed: string | null; // name from the case just closed, for the confirmation strip
  onDismissClosed: () => void;
  demoReports: Report[];
  onSimulate: (report: Report) => void;
};

export default function DutyScreen(p: Props) {
  const canSimulate = p.onDuty && !p.busy;

  return (
    <>
      {p.justClosed && (
        <Pressable style={[ui.strip, { backgroundColor: C.safeBg }]} onPress={p.onDismissClosed}>
          <Ionicons name="checkmark-circle" size={16} color={C.safe} />
          <Text style={[ui.stripText, { color: C.safe }]}>
            أُغلق بلاغ {p.justClosed}. حُذفت صلاحية السوار وبياناته الصحية من جوالك
          </Text>
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
            <Text style={ui.muted}>{p.onDuty ? 'تصلك البلاغات القريبة منك' : 'لن تصلك أي بلاغات'}</Text>
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
              <Text style={s.detailText}>منطقتك: {p.area}</Text>
            </View>
            <View style={s.detail}>
              <Ionicons name="lock-closed-outline" size={15} color={C.accent} />
              <Text style={s.detailText}>جوالك يتعرّف فقط على الأساور المبلَّغ عنها، ولا يرى أي سوار آخر</Text>
            </View>
          </View>
        )}
        {p.busy && <Text style={s.locked}>أغلق البلاغ الحالي قبل إنهاء المناوبة</Text>}
      </View>

      <View style={s.stats}>
        <View style={s.stat}>
          <Text style={s.statNum}>{p.dutyCount}</Text>
          <Text style={s.statLabel}>متطوعين في المناوبة</Text>
        </View>
        <View style={s.stat}>
          <Text style={s.statNum}>{p.closedCount}</Text>
          <Text style={s.statLabel}>بلاغات أغلقتها</Text>
        </View>
      </View>

      {/* Demo: in Phase 2 reports arrive from Firebase instead */}
      <Text style={ui.caption}>تجربة البلاغات (بيانات وهمية)</Text>
      <View style={s.demo}>
        {p.demoReports.map((r) => (
          <DemoButton key={r.id} type={r.type} name={r.member.name} disabled={!canSimulate} onPress={() => p.onSimulate(r)} />
        ))}
      </View>
      {!p.onDuty && <Text style={s.demoHint}>شغّل المناوبة عشان تجرّب البلاغات</Text>}
    </>
  );
}

function DemoButton(p: { type: ReportType; name: string; disabled: boolean; onPress: () => void }) {
  const t = TYPE_UI[p.type];
  return (
    <Pressable style={[s.demoBtn, p.disabled && { opacity: 0.4 }]} disabled={p.disabled} onPress={p.onPress}>
      <Ionicons name={t.icon} size={18} color={t.color} />
      <Text style={s.demoText}>{t.label}</Text>
      <Text style={s.demoName}>{p.name}</Text>
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

  stats: { flexDirection: 'row-reverse', gap: 12, marginTop: 14 },
  stat: { flex: 1, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, borderRadius: 14, padding: 13 },
  statNum: { color: C.primary, fontSize: 22, fontWeight: '700', textAlign: 'right' },
  statLabel: { color: C.muted, fontSize: 12, textAlign: 'right', marginTop: 2 },

  demo: { gap: 8 },
  demoBtn: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
    backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed', borderRadius: 14, padding: 13,
  },
  demoText: { color: C.text, fontSize: 14, fontWeight: '600', textAlign: 'right' },
  demoName: { color: C.faint, fontSize: 13, flex: 1, textAlign: 'left' },
  demoHint: { color: C.faint, fontSize: 12, textAlign: 'center', marginTop: 10 },
});
