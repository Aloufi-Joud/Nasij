// Nasij volunteer app (Person 3). Fake data only in Phase 1.
// The app shell renders <VolunteerApp /> when the chosen role is "volunteer".
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, ui } from '../../theme';
import { ME, reports as MOCK_REPORTS, volunteers, type ClosedAs, type Report } from '../../mock';
import AlertCard from './AlertCard';
import CloseCaseScreen from './CloseCaseScreen';
import DutyScreen from './DutyScreen';
import HealthScreen from './HealthScreen';
import ProximityScreen from './ProximityScreen';
import { CLOSED_UI, TYPE_UI, clock } from './labels';
import { useFakeSignal } from './useFakeSignal';

type Tab = 'duty' | 'case' | 'history';
type Step = 'proximity' | 'health' | 'close';
// What stays on the phone after closing: no photo, no description, no health data
type Closed = { id: string; name: string; type: Report['type']; closedAs: ClosedAs; at: number };

const FIRST_REPORT_AFTER_MS = 5000; // demo: first lost-child report arrives 5 s after going on duty

export default function VolunteerApp({ onSwitchRole }: { onSwitchRole?: () => void }) {
  const [tab, setTab] = useState<Tab>('duty');
  const [onDuty, setOnDuty] = useState(false);
  const [incoming, setIncoming] = useState<Report | null>(null);
  const [active, setActive] = useState<Report | null>(null);
  const [step, setStep] = useState<Step>('proximity');
  const [closed, setClosed] = useState<Closed[]>([]);
  const [justClosed, setJustClosed] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const autoSent = useRef(false);

  // Fake signal runs while a case is open, so it keeps going when switching screens
  const fake = useFakeSignal(!!active);

  // Clock for "قبل ٢٠ ث" labels when no signal is ticking
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Latest values for the demo timer below
  const live = useRef({ onDuty, busy: !!active || !!incoming });
  live.current = { onDuty, busy: !!active || !!incoming };

  const receive = (r: Report) => {
    if (!live.current.onDuty || active) return;
    setIncoming({ ...r, createdAt: Date.now(), status: 'open' });
    setTab('duty');
    setJustClosed(null);
    Vibration.vibrate(r.type === 'lost' ? [0, 400, 200, 400] : [0, 800, 300, 800, 300, 800]);
  };

  // Demo: one lost-child report shortly after the first time going on duty
  useEffect(() => {
    if (!onDuty || autoSent.current) return;
    const t = setTimeout(() => {
      autoSent.current = true;
      if (live.current.onDuty && !live.current.busy) receive(MOCK_REPORTS[0]);
    }, FIRST_REPORT_AFTER_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDuty]);

  const toggleDuty = () => {
    if (active) return;
    setOnDuty((v) => !v);
    setIncoming(null);
  };

  const accept = () => {
    if (!incoming) return;
    setActive({ ...incoming, status: 'searching', assignedVolunteerId: ME.id });
    setIncoming(null);
    setStep(incoming.type === 'lost' ? 'proximity' : 'health');
    setTab('case');
    Vibration.cancel();
  };

  const decline = () => {
    setIncoming(null);
    Vibration.cancel();
  };

  // Phase 2: call the backend close function, which also deletes access and medical data
  const closeCase = (as: ClosedAs) => {
    if (!active) return;
    setClosed((old) => [{ id: active.id, name: active.member.name, type: active.type, closedAs: as, at: Date.now() }, ...old]);
    setJustClosed(active.member.name);
    setActive(null);
    setStep('proximity');
    setTab('duty');
  };

  const dutyCount = volunteers.filter((v) => v.id !== ME.id && v.onDuty).length + (onDuty ? 1 : 0);
  const title = tab === 'duty' ? 'المناوبة' : tab === 'case' ? 'البلاغ' : 'سجلي';
  const t = now;

  return (
    <View style={s.screen}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.headerSub}>نسيج · متطوع</Text>
            <Text style={s.headerTitle}>{title}</Text>
          </View>
          {onSwitchRole && (
            <Pressable style={s.headerBtn} onPress={onSwitchRole} hitSlop={6}>
              <Ionicons name="swap-horizontal" size={20} color="#fff" />
            </Pressable>
          )}
        </View>
        <View style={s.pills}>
          <View style={s.pill}>
            <View style={[ui.dot, { backgroundColor: onDuty ? '#7FD69B' : C.faint }]} />
            <Text style={s.pillText}>{onDuty ? 'في المناوبة' : 'خارج المناوبة'}</Text>
          </View>
          {active && (
            <View style={[s.pill, { backgroundColor: 'rgba(212,132,26,0.25)' }]}>
              <Ionicons name={TYPE_UI[active.type].icon} size={14} color="#FFC857" />
              <Text style={[s.pillText, { color: '#FFC857', fontWeight: '700' }]}>بلاغ مفتوح: {active.member.name}</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={s.body}>
        {tab === 'duty' && (
          <>
            {incoming && <AlertCard report={incoming} now={t} onAccept={accept} onDecline={decline} />}
            {active && (
              <Pressable style={[ui.strip, { backgroundColor: C.warnBg }]} onPress={() => setTab('case')}>
                <Ionicons name="arrow-back" size={15} color={C.warn} />
                <Text style={[ui.stripText, { color: C.warn }]}>لديك بلاغ مفتوح عن {active.member.name}، اضغط للعودة إليه</Text>
              </Pressable>
            )}
            <DutyScreen
              onDuty={onDuty}
              onToggle={toggleDuty}
              area={ME.area}
              busy={!!active}
              dutyCount={dutyCount}
              closedCount={closed.length}
              justClosed={justClosed}
              onDismissClosed={() => setJustClosed(null)}
              demoReports={MOCK_REPORTS}
              onSimulate={receive}
            />
          </>
        )}

        {tab === 'case' &&
          (!active ? (
            <View style={s.empty}>
              <Ionicons name="checkmark-done-circle-outline" size={52} color={C.mint} />
              <Text style={s.emptyTitle}>لا يوجد بلاغ مفتوح</Text>
              <Text style={s.emptyText}>{onDuty ? 'بيوصلك تنبيه أول ما يُبلَّغ عن حالة قريبة منك' : 'شغّل المناوبة عشان تستقبل البلاغات'}</Text>
            </View>
          ) : step === 'proximity' ? (
            <ProximityScreen
              report={active}
              signal={fake.signal}
              now={fake.now}
              onRestart={fake.restart}
              onHealth={() => setStep('health')}
              onClose={() => setStep('close')}
            />
          ) : step === 'health' ? (
            <HealthScreen
              report={active}
              now={t}
              onGoTo={() => setStep('proximity')}
              goToLabel={active.type === 'lost' ? 'رجوع للبحث' : 'اتجه إليه'}
            />
          ) : (
            <CloseCaseScreen report={active} onConfirm={closeCase} onCancel={() => setStep('proximity')} />
          ))}

        {tab === 'history' && (
          <>
            <Text style={ui.sectionTitle}>البلاغات المغلقة</Text>
            {closed.length === 0 && <Text style={s.none}>لم تغلق أي بلاغ بعد</Text>}
            {closed.map((c, i) => (
              <View key={`${c.id}-${i}`} style={s.logRow}>
                <Ionicons name={CLOSED_UI[c.closedAs].icon} size={20} color={CLOSED_UI[c.closedAs].color} />
                <View style={{ flex: 1 }}>
                  <Text style={s.logName}>
                    {c.name} · {TYPE_UI[c.type].label}
                  </Text>
                  <Text style={s.logSub}>{CLOSED_UI[c.closedAs].label}</Text>
                </View>
                <Text style={s.logTime}>{clock(c.at)}</Text>
              </View>
            ))}
            {closed.length > 0 && <Text style={s.note}>يبقى في السجل الاسم الأول ونتيجة البلاغ فقط</Text>}
          </>
        )}
      </ScrollView>

      {/* Bottom nav */}
      <View style={s.nav}>
        {(
          [
            { key: 'duty', label: 'المناوبة', icon: 'radio-outline' },
            { key: 'case', label: 'البلاغ', icon: 'search-outline' },
            { key: 'history', label: 'سجلي', icon: 'time-outline' },
          ] as const
        ).map((n) => (
          <Pressable key={n.key} style={s.navItem} onPress={() => setTab(n.key)}>
            <View>
              <Ionicons name={n.icon} size={22} color={tab === n.key ? C.primary : C.faint} />
              {n.key === 'case' && active && <View style={s.navDot} />}
              {n.key === 'duty' && incoming && <View style={s.navDot} />}
            </View>
            <Text style={[s.navText, { color: tab === n.key ? C.primary : C.faint }]}>{n.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    backgroundColor: C.primary, paddingTop: 64, paddingBottom: 18, paddingHorizontal: 22,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
  },
  headerRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  headerSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'right' },
  headerTitle: { color: '#fff', fontSize: F.title, fontWeight: '700', textAlign: 'right' },
  headerBtn: { padding: 9, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)' },
  pills: { flexDirection: 'row-reverse', gap: 10, marginTop: 16, flexWrap: 'wrap' },
  pill: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12,
  },
  pillText: { color: '#fff', fontSize: 12, fontWeight: '500' },

  body: { padding: 20, paddingBottom: 120 },
  empty: { alignItems: 'center', marginTop: 60, paddingHorizontal: 20 },
  emptyTitle: { color: C.primary, fontSize: F.h2, fontWeight: '700', marginTop: 12 },
  emptyText: { color: C.muted, fontSize: F.small, textAlign: 'center', marginTop: 6 },
  none: { color: C.faint, textAlign: 'center', marginTop: 30 },

  logRow: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 13, marginBottom: 8,
  },
  logName: { color: C.text, fontSize: 14, fontWeight: '600', textAlign: 'right' },
  logSub: { color: C.muted, fontSize: 12.5, textAlign: 'right', marginTop: 2 },
  logTime: { color: C.faint, fontSize: 12 },
  note: { color: C.faint, fontSize: 12, textAlign: 'center', marginTop: 8 },

  nav: {
    position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row-reverse', justifyContent: 'space-around',
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, paddingBottom: 30,
  },
  navItem: { alignItems: 'center', gap: 3, minWidth: 70 },
  navText: { fontSize: 11, fontWeight: '600' },
  navDot: {
    position: 'absolute', top: -2, right: -4, width: 9, height: 9, borderRadius: 5,
    backgroundColor: C.danger, borderWidth: 1.5, borderColor: '#fff',
  },
});
