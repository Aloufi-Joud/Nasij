// Nasij volunteer app (Person 3), on live data.
// The app shell renders <VolunteerApp /> when the chosen role is "volunteer".
// Reports come from Firestore (src/firebase/reports.ts), the bracelet signal from src/ble.
// Privacy: the photo, description and health of a case live only in this screen's state,
// and are dropped when the case closes. The history tab keeps the first name and the outcome only.
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { C, F, ui } from '../../theme';
import type { ClosedAs, Language, PasserbyReport, Report } from '../../mock';
import { auth } from '../../firebase';
import { acceptReport, closeReport, getReportContact, getReportHealth, subscribeOpenReports } from '../../firebase/reports';
import { areaOf, goOffDuty, goOnDuty, loadLanguages, saveLanguages, updateVolunteerLocation } from '../../firebase/volunteers';
import { subscribePasserbyReports } from '../../firebase/passerby';
import AlertCard from './AlertCard';
import CloseCaseScreen from './CloseCaseScreen';
import DutyScreen, { type Notice } from './DutyScreen';
import HealthScreen from './HealthScreen';
import ProximityScreen from './ProximityScreen';
import { CLOSED_UI, TYPE_UI, clock, since } from './labels';
import { useBraceletSignal } from '../../ble/scanner';

type Tab = 'duty' | 'case' | 'history';
type Step = 'proximity' | 'health' | 'close';
// What stays on the phone after closing: no photo, no description, no health data
type Closed = { id: string; name: string; type: Report['type']; closedAs: ClosedAs | null; at: number };

// Volunteers who speak the member's language get a new report first, everyone else this much later.
// ponytail: 15 s for testing; a minute or two at the event
const LANGUAGE_FIRST_MS = 15_000;

const vibrateFor = (r: Report) => Vibration.vibrate(r.type === 'lost' ? [0, 400, 200, 400] : [0, 800, 300, 800, 300, 800]);

export default function VolunteerApp({ onSwitchRole }: { onSwitchRole?: () => void }) {
  const [tab, setTab] = useState<Tab>('duty');
  const [onDuty, setOnDuty] = useState(false);
  const [dutyBusy, setDutyBusy] = useState(false); // turning duty on or off
  const [open, setOpen] = useState<Report[]>([]); // live: open and searching reports, without health
  const [shownId, setShownId] = useState<string | null>(null); // report shown in the alert card
  const [active, setActive] = useState<Report | null>(null); // the case this volunteer took
  const [healthLoading, setHealthLoading] = useState(false);
  const [step, setStep] = useState<Step>('proximity');
  const [closed, setClosed] = useState<Closed[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [passerby, setPasserby] = useState<PasserbyReport[]>([]);
  const [area, setArea] = useState('');
  const [locationDenied, setLocationDenied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [languages, setLanguages] = useState<Language[]>(['ar']);
  // Handover code of the active case, never shown. null = older report without one, undefined = not loaded yet
  const [handoverCode, setHandoverCode] = useState<string | null | undefined>(undefined);
  const skipped = useRef(new Set<string>()); // reports this volunteer left for others: not shown again by itself
  const accepting = useRef<string | null>(null);

  const uid = auth.currentUser?.uid ?? null;

  // Real signal of the reported bracelet while a case is open, so it keeps going when switching screens
  const bracelet = useBraceletSignal(active?.braceletId ?? null);

  // Clock for "قبل ٢٠ ث" labels when no signal is ticking
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    loadLanguages().then((l) => l && setLanguages(l)).catch(() => {});
  }, []);
  const toggleLanguage = (l: Language) => {
    const next = languages.includes(l) ? languages.filter((x) => x !== l) : [...languages, l];
    setLanguages(next);
    saveLanguages(next).catch(() => {});
  };
  // Older reports carry no language: everyone counts as a speaker
  const speaks = (r: Report) => !r.member.language || languages.includes(r.member.language);

  // Leaving the app (logout): go off duty, so the location is not kept
  useEffect(() => () => void goOffDuty().catch(() => {}), []);

  // Open reports, live, while on duty
  useEffect(() => {
    if (!onDuty) return;
    return subscribeOpenReports(setOpen);
  }, [onDuty]);

  // Location while on duty: shown as the zone here, written to volunteers/{uid} for the dashboard
  useEffect(() => {
    if (!onDuty) return;
    let watch: Location.LocationSubscription | null = null;
    let stopped = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (stopped) return;
      setLocationDenied(status !== 'granted');
      if (status !== 'granted') return;
      watch = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 10 }, (pos) => {
        const p = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setArea(areaOf(p));
        updateVolunteerLocation(p).catch(() => {});
      });
      if (stopped) watch.remove();
    })();
    return () => {
      stopped = true;
      watch?.remove();
    };
  }, [onDuty]);

  // A new open report: show it, unless busy or already left for others.
  // Speakers of the member's language get it at once, the rest after LANGUAGE_FIRST_MS.
  useEffect(() => {
    if (!onDuty || active || shownId) return;
    const next = open.find(
      (r) => r.status === 'open' && !skipped.current.has(r.id) && (speaks(r) || now - r.createdAt >= LANGUAGE_FIRST_MS),
    );
    if (!next) return;
    setShownId(next.id);
    setTab('duty');
    setNotice(null);
    vibrateFor(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onDuty, active, shownId, now, languages]);

  // The shown report was taken by another volunteer or closed before this one answered
  useEffect(() => {
    if (!shownId || accepting.current === shownId) return;
    const r = open.find((x) => x.id === shownId);
    if (r?.status !== 'open') dropShown(shownId, r ? `تولّى متطوع آخر بلاغ ${r.member.name}` : null);
  }, [open, shownId]);

  // The case this volunteer took was closed by the family or security, or given to someone else
  useEffect(() => {
    if (!active || !onDuty) return;
    const r = open.find((x) => x.id === active.id);
    if (r?.status === 'open') return; // the accept has not reached this list yet
    if (r && r.assignedVolunteerId === uid) return;
    endCase(
      null,
      r
        ? `حوّل فريق الأمن بلاغ ${active.member.name} لمتطوع آخر. حُذفت بياناته من جوالك`
        : `أُغلق بلاغ ${active.member.name} من العائلة أو فريق الأمن. حُذفت بياناته من جوالك`,
      'warn',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Family phone and handover code; tried again on each step change while it has not loaded
  const activeId = active?.id;
  useEffect(() => {
    if (!activeId || handoverCode !== undefined) return;
    let stale = false;
    getReportContact(activeId)
      .then(({ phone, code }) => {
        if (stale) return;
        setActive((a) => (a && a.id === activeId ? { ...a, phone } : a));
        setHandoverCode(code);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [activeId, handoverCode, step]);

  // Passer-by reports for the bracelet of the open case
  useEffect(() => {
    if (!active) return;
    return subscribePasserbyReports(active.braceletId, active.createdAt, setPasserby, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);
  const seenPasserby = useRef(0);
  useEffect(() => {
    if (passerby.length > seenPasserby.current) Vibration.vibrate([0, 300, 150, 300]);
    seenPasserby.current = passerby.length;
  }, [passerby.length]);

  const incoming = open.find((r) => r.id === shownId) ?? null;
  const waiting = open.filter((r) => r.status === 'open');
  const latestPasserby = (active && passerby.find((p) => p.braceletId === active.braceletId.toUpperCase())) || null;

  const toggleDuty = async () => {
    if (active || dutyBusy) return;
    setDutyBusy(true);
    try {
      if (onDuty) {
        setOnDuty(false);
        setOpen([]);
        setShownId(null);
        skipped.current.clear();
        Vibration.cancel();
        await goOffDuty();
      } else {
        await goOnDuty(); // sets the volunteer role first, so the open reports list is allowed
        setOnDuty(true);
      }
    } catch {
      setNotice({ text: 'تعذّر الاتصال، تحقق من الإنترنت وحاول مرة ثانية', tone: 'danger' });
    } finally {
      setDutyBusy(false);
    }
  };

  const accept = async () => {
    if (!incoming || !uid || accepting.current) return;
    const r = incoming;
    accepting.current = r.id;
    try {
      // Transaction: if two volunteers tap at once, only one gets the case
      if (!(await acceptReport(r.id, uid))) {
        dropShown(r.id, `تولّى متطوع آخر بلاغ ${r.member.name}`);
        return;
      }
      setShownId(null);
      Vibration.cancel();
      setActive({ ...r, status: 'searching', assignedVolunteerId: uid, health: null, phone: null });
      setStep(r.type === 'lost' ? 'proximity' : 'health');
      setTab('case');
      // Health is readable only now that this volunteer is assigned
      setHealthLoading(true);
      getReportHealth(r.id)
        .then((health) => setActive((a) => (a && a.id === r.id ? { ...a, health } : a)))
        .catch(() => {})
        .finally(() => setHealthLoading(false));
      setHandoverCode(undefined);
    } catch {
      setNotice({ text: 'تعذّر قبول البلاغ، تحقق من الإنترنت وحاول مرة ثانية', tone: 'danger' });
    } finally {
      accepting.current = null;
    }
  };

  // Leaves the shown report for others: it stays in the open list but does not pop up again
  function dropShown(id: string | null, text: string | null) {
    if (id) skipped.current.add(id);
    setShownId(null);
    Vibration.cancel();
    if (text) setNotice({ text, tone: 'warn' });
  }
  const skip = () => dropShown(shownId, null);

  // Drops the case and everything it carried (photo, description, health) from this phone
  function endCase(as: ClosedAs | null, text: string, tone: Notice['tone']) {
    if (!active) return;
    setClosed((old) => [{ id: active.id, name: active.member.name, type: active.type, closedAs: as, at: Date.now() }, ...old]);
    setActive(null);
    setHandoverCode(undefined);
    setPasserby([]);
    setHealthLoading(false);
    setStep('proximity');
    setTab('duty');
    setNotice({ text, tone });
  }

  // The local copy goes at once; the close is sent to the backend (it deletes health and photo there).
  // If the family or security closed it first, the rules refuse the write, which is fine.
  const closeCase = (as: ClosedAs) => {
    if (!active) return;
    const { id, member } = active;
    endCase(as, `أُغلق بلاغ ${member.name}. حُذفت صلاحية السوار وبياناته الصحية من جوالك`, 'safe');
    closeReport(id, as).catch((e: { code?: string }) => {
      if (e?.code !== 'permission-denied' && e?.code !== 'not-found')
        setNotice({ text: `لم يصل إغلاق بلاغ ${member.name} للنظام، أبلغ فريق الأمن`, tone: 'danger' });
    });
  };

  const title = tab === 'duty' ? 'المناوبة' : tab === 'case' ? 'البلاغ' : 'سجلي';

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
            <Text style={s.pillText}>{dutyBusy ? 'لحظة…' : onDuty ? 'في المناوبة' : 'خارج المناوبة'}</Text>
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
            {incoming && <AlertCard report={incoming} now={now} speaks={speaks(incoming)} onAccept={accept} onDecline={skip} />}
            {active && (
              <Pressable style={[ui.strip, { backgroundColor: C.warnBg }]} onPress={() => setTab('case')}>
                <Ionicons name="arrow-back" size={15} color={C.warn} />
                <Text style={[ui.stripText, { color: C.warn }]}>لديك بلاغ مفتوح عن {active.member.name}، اضغط للعودة إليه</Text>
              </Pressable>
            )}
            <DutyScreen
              onDuty={onDuty}
              onToggle={toggleDuty}
              area={area}
              locationDenied={locationDenied}
              busy={!!active || dutyBusy}
              closedCount={closed.length}
              notice={notice}
              onDismissNotice={() => setNotice(null)}
              waiting={waiting.filter((r) => r.id !== shownId)}
              now={now}
              onShow={(r) => {
                setShownId(r.id);
                setNotice(null);
              }}
              languages={languages}
              onToggleLanguage={toggleLanguage}
            />
          </>
        )}

        {/* The family's phone: the volunteer calls them directly, no handover to security needed */}
        {tab === 'case' && active?.phone && (
          <Pressable style={[ui.strip, { backgroundColor: C.safeBg }]} onPress={() => Linking.openURL(`tel:${active.phone}`)}>
            <Ionicons name="call-outline" size={16} color={C.safe} />
            <Text style={[ui.stripText, { color: C.safe }]}>اتصل بأهل {active.member.name}: {active.phone}</Text>
          </Pressable>
        )}

        {tab === 'case' && active && latestPasserby && (
          <Pressable
            style={[ui.strip, { backgroundColor: C.safeBg }]}
            disabled={!latestPasserby.location}
            onPress={() =>
              latestPasserby.location &&
              Linking.openURL(`https://maps.apple.com/?ll=${latestPasserby.location.latitude},${latestPasserby.location.longitude}`)
            }
          >
            <Ionicons name="hand-left-outline" size={16} color={C.safe} />
            <Text style={[ui.stripText, { color: C.safe }]}>
              مارّ أبلغ عن سوار {active.member.name} {since(latestPasserby.at, now)}
              {latestPasserby.location ? '، اضغط لفتح موقعه' : ''}
            </Text>
          </Pressable>
        )}

        {tab === 'case' &&
          (!active ? (
            <View style={s.empty}>
              <Ionicons name="checkmark-done-circle-outline" size={52} color={C.mint} />
              <Text style={s.emptyTitle}>لا يوجد بلاغ مفتوح</Text>
              <Text style={s.emptyText}>{onDuty ? 'بيوصلك تنبيه أول ما يُبلَّغ عن حالة' : 'شغّل المناوبة عشان تستقبل البلاغات'}</Text>
            </View>
          ) : step === 'proximity' ? (
            <ProximityScreen
              report={active}
              signal={bracelet.signal}
              now={bracelet.now}
              onHealth={() => setStep('health')}
              onClose={() => setStep('close')}
            />
          ) : step === 'health' ? (
            <HealthScreen
              report={active}
              now={now}
              loading={healthLoading}
              onGoTo={() => setStep('proximity')}
              goToLabel={active.type === 'lost' ? 'رجوع للبحث' : 'اتجه إليه'}
            />
          ) : (
            <CloseCaseScreen report={active} code={handoverCode} onConfirm={closeCase} onCancel={() => setStep('proximity')} />
          ))}

        {tab === 'history' && (
          <>
            <Text style={ui.sectionTitle}>البلاغات المغلقة</Text>
            {closed.length === 0 && <Text style={s.none}>لم تغلق أي بلاغ بعد</Text>}
            {closed.map((c, i) => {
              const u = c.closedAs ? CLOSED_UI[c.closedAs] : { icon: 'close-circle' as const, color: C.faint, label: 'أغلقته العائلة أو الأمن' };
              return (
                <View key={`${c.id}-${i}`} style={s.logRow}>
                  <Ionicons name={u.icon} size={20} color={u.color} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.logName}>
                      {c.name} · {TYPE_UI[c.type].label}
                    </Text>
                    <Text style={s.logSub}>{u.label}</Text>
                  </View>
                  <Text style={s.logTime}>{clock(c.at)}</Text>
                </View>
              );
            })}
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
