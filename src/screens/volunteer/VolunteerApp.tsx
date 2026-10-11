// Nasij volunteer app (Person 3), on live data.
// The app shell renders <VolunteerApp /> when the chosen role is "volunteer".
// Reports come from Firestore (src/firebase/reports.ts), the bracelet signal from src/ble.
// Privacy: the photo, description and health of a case live only in this screen's state,
// and are dropped when the case closes. The history tab keeps the first name and the outcome only.
import { useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Vibration, View } from 'react-native';
import { Text } from '../../components/Text';
import { FadeIn, Pressable } from '../../components/Motion';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { C, F, ui } from '../../theme';
import { Header, HeaderButton, Pill } from '../../components/Header';
import { BottomNav } from '../../components/BottomNav';
import type { ClosedAs, Language, PasserbyReport, Report } from '../../mock';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase';
import { loadProfile, type Profile } from '../../firebase/profile';
import { acceptReport, closeReport, getReportHealth, getReportPhone, getReportPhoto, subscribeOpenReports } from '../../firebase/reports';
import { areaOf, goOffDuty, goOnDuty, loadLanguages, renameOnDuty, saveLanguages, updateVolunteerLocation } from '../../firebase/volunteers';
import { subscribePasserbyReports } from '../../firebase/passerby';
import { addSighting } from '../../firebase/sightings';
import AccountScreen from './AccountScreen';
import AlertCard from './AlertCard';
import CloseCaseScreen from './CloseCaseScreen';
import DutyScreen, { TONE, type Notice } from './DutyScreen';
import HealthScreen from './HealthScreen';
import ProximityScreen from './ProximityScreen';
import PasserbyModal from './PasserbyModal';
import { CLOSED_UI, TYPE_UI, clock, since } from './labels';
import { listen, useBraceletSignal } from '../../ble/scanner';
import { braceletMac } from '../../ble/signal';
import { isEn, tr } from '../../i18n';

type Tab = 'duty' | 'case' | 'history' | 'account';
type Step = 'proximity' | 'health' | 'close';
// What stays on the phone after closing: no photo, no description, no health data
type Closed = { id: string; name: string; type: Report['type']; closedAs: ClosedAs | null; at: number };

// Volunteers who speak the member's language get a new report first, everyone else this much later.
// ponytail: 15 s for testing; a minute or two at the event
const LANGUAGE_FIRST_MS = 15_000;

const vibrateFor = (r: Report) => Vibration.vibrate(r.type === 'lost' ? [0, 400, 200, 400] : [0, 800, 300, 800, 300, 800]);

// onLogout: back to the login screen (App.tsx); without it the account tab has no logout row
export default function VolunteerApp({ onSwitchRole, onLogout }: { onSwitchRole?: () => void; onLogout?: () => void }) {
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
  const [passerbyShown, setPasserbyShown] = useState<PasserbyReport | null>(null); // the box over the screen
  const [area, setArea] = useState('');
  const [locationDenied, setLocationDenied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [languages, setLanguages] = useState<Language[]>(['ar']);
  const [profile, setProfile] = useState<Profile>({ name: '', phone: '' }); // name and phone from "My account"
  const [profileLoaded, setProfileLoaded] = useState(false);
  const skipped = useRef(new Set<string>()); // reports this volunteer left for others: not shown again by itself
  const accepting = useRef<string | null>(null);
  // A case given to this volunteer after this time came from security; one from before is this volunteer's own
  // case coming back after the app restarted
  const startedAt = useRef(Date.now());

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
    loadProfile()
      .then((p) => {
        setProfile(p);
        setProfileLoaded(true);
      })
      .catch(() => {});
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

  // The shown report was taken by another volunteer or closed before this one answered.
  // Given to this volunteer by security: the effect below opens it.
  useEffect(() => {
    if (!shownId || accepting.current === shownId) return;
    const r = open.find((x) => x.id === shownId);
    if (r?.status === 'open' || (r && uid && r.assignedVolunteerId === uid)) return;
    dropShown(shownId, r ? tr(`تولّى متطوع آخر بلاغ ${r.member.name}`, `Another volunteer took ${r.member.name}’s report`) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shownId]);

  // A case assigned to this volunteer that this phone is not following: security gave it from the dashboard,
  // or the app restarted in the middle of this volunteer's own case. Open it like an accepted one.
  // ponytail: a second case given while one is already open waits until the first closes
  useEffect(() => {
    if (!onDuty || active || !uid) return;
    const r = open.find((x) => x.status === 'searching' && x.assignedVolunteerId === uid && accepting.current !== x.id);
    if (!r) return;
    const bySecurity = (r.acceptedAt ?? 0) >= startedAt.current;
    take(
      r,
      bySecurity
        ? { text: tr(`أعطاك فريق الأمن بلاغ ${r.member.name}`, `Security gave you ${r.member.name}’s report`), tone: 'warn' }
        : { text: tr(`رجعنا لك بلاغ ${r.member.name} اللي كنت تتابعه`, `Back to ${r.member.name}’s report you were following`), tone: 'warn' },
    );
    vibrateFor(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onDuty, active, uid]);

  // The case this volunteer took was closed by the family or security, or given to someone else
  useEffect(() => {
    if (!active || !onDuty) return;
    const r = open.find((x) => x.id === active.id);
    if (r?.status === 'open') return; // the accept has not reached this list yet
    if (r && r.assignedVolunteerId === uid) return;
    endCase(
      null,
      r
        ? tr(
            `حوّل فريق الأمن بلاغ ${active.member.name} لمتطوع آخر. حُذفت بياناته من جوالك`,
            `Security moved ${active.member.name}’s report to another volunteer. Their details were deleted from your phone`,
          )
        : tr(
            `أُغلق بلاغ ${active.member.name} من العائلة أو فريق الأمن. حُذفت بياناته من جوالك`,
            `${active.member.name}’s report was closed by the family or security. Their details were deleted from your phone`,
          ),
      'warn',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Family phone; tried again on each step change while it has not loaded
  const activeId = active?.id;
  const phoneLoaded = !!active?.phone;
  useEffect(() => {
    if (!activeId || phoneLoaded) return;
    let stale = false;
    getReportPhone(activeId)
      .then((phone) => !stale && setActive((a) => (a && a.id === activeId ? { ...a, phone } : a)))
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [activeId, phoneLoaded, step]);

  // Child's photo: readable only once this volunteer is assigned (accepted, or given the case by security).
  // The live list always carries photo: null. Dropped with the case in endCase; retried on each step change.
  const photoLoaded = !!active?.photo;
  useEffect(() => {
    if (!activeId || photoLoaded) return;
    let stale = false;
    getReportPhoto(activeId)
      .then((photo) => !stale && photo && setActive((a) => (a && a.id === activeId ? { ...a, photo } : a)))
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [activeId, photoLoaded, step]);

  // Search network: while on duty, this phone reports every open report's bracelet it hears as a sighting,
  // even for cases taken by someone else. Other bracelets are ignored. addSighting keeps it to one write
  // per report every 10 s and uses the latest on-duty location.
  const openRef = useRef<Report[]>([]);
  useEffect(() => {
    openRef.current = open;
  });
  useEffect(() => {
    if (!onDuty) return;
    const reportOf = (mac: string) => openRef.current.find((r) => r.braceletId.toUpperCase() === mac);
    // iPhone hides the MAC: learn the phone-side id from EA00, then match the other packets by id
    const ids = new Map<string, string>();
    return listen((d) => {
      const mac = braceletMac(d);
      if (mac && reportOf(mac)) ids.set(d.id, mac);
      const b = ids.get(d.id);
      const r = b && reportOf(b);
      if (r && d.rssi != null) addSighting(r.id, d.rssi).catch(() => {});
    });
  }, [onDuty]);

  // Passer-by reports for the bracelet of the open case
  useEffect(() => {
    if (!active) return;
    return subscribePasserbyReports(active.braceletId, active.createdAt, setPasserby, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);
  const seenPasserby = useRef(0);
  useEffect(() => {
    // A new passer-by report: vibrate and open the box with its point on the map, whatever tab is open
    if (passerby.length > seenPasserby.current) {
      Vibration.vibrate([0, 300, 150, 300, 150, 300]);
      setPasserbyShown(passerby[0]);
    }
    seenPasserby.current = passerby.length;
  }, [passerby]);

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
        await goOnDuty(profile.name); // sets the volunteer role first, so the open reports list is allowed
        setOnDuty(true);
      }
    } catch {
      setNotice({ text: tr('تعذّر الاتصال، تحقق من الإنترنت وحاول مرة ثانية', 'Couldn’t connect, check the internet and try again'), tone: 'danger' });
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
        dropShown(r.id, tr(`تولّى متطوع آخر بلاغ ${r.member.name}`, `Another volunteer took ${r.member.name}’s report`));
        return;
      }
      take(r);
    } catch (e) {
      // permission-denied is the rules, not the internet (e.g. firestore.rules not published after a change)
      const denied = (e as { code?: string }).code === 'permission-denied';
      setNotice({
        text: denied
          ? tr('ما عندك صلاحية تقبل هذا البلاغ', 'You’re not allowed to accept this report')
          : tr('تعذّر قبول البلاغ، تحقق من الإنترنت وحاول مرة ثانية', 'Couldn’t accept the report, check the internet and try again'),
        tone: 'danger',
      });
    } finally {
      accepting.current = null;
    }
  };

  // Opens a case this volunteer now holds, after "I'm searching" or given by security (shared by both)
  function take(r: Report, text?: Notice) {
    if (!uid) return;
    setShownId(null);
    Vibration.cancel();
    setActive({ ...r, status: 'searching', assignedVolunteerId: uid, health: null, phone: null });
    setStep(r.type === 'lost' ? 'proximity' : 'health');
    setTab('case');
    setNotice(text ?? null);
    // Health is readable only now that this volunteer is assigned
    setHealthLoading(true);
    getReportHealth(r.id)
      .then((health) => setActive((a) => (a && a.id === r.id ? { ...a, health } : a)))
      .catch(() => {})
      .finally(() => setHealthLoading(false));
  }

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
    setPasserby([]);
    setPasserbyShown(null);
    setHealthLoading(false);
    setStep('proximity');
    setTab('duty');
    setNotice({ text, tone });
  }

  // The local copy goes at once; the close is sent to the backend (it deletes health and photo there).
  // If the family or security closed it first, the rules refuse the write, which is fine.
  // Handing a child to the family: the close goes first, so a wrong code (refused by the rules) keeps the case open.
  // Any other close drops the local copy at once and sends the close in the background.
  // securityPoint: handed to security, "zone · pavilion" shown to the family
  const closeCase = async (as: ClosedAs, code?: string, securityPoint?: string): Promise<'wrong' | void> => {
    if (!active) return;
    const { id, member } = active;
    const done = () =>
      endCase(
        as,
        tr(
          `أُغلق بلاغ ${member.name}. حُذفت صلاحية السوار وبياناته الصحية من جوالك`,
          `${member.name}’s report is closed. Bracelet access and health details were deleted from your phone`,
        ),
        'safe',
      );
    const lostConnection = () =>
      setNotice({ text: tr(`لم يصل إغلاق بلاغ ${member.name} للنظام، أبلغ فريق الأمن`, `Closing ${member.name}’s report didn’t reach the system, tell security`), tone: 'danger' });
    if (code) {
      try {
        await closeReport(id, as, code);
        done();
      } catch (e) {
        if ((e as { code?: string })?.code === 'permission-denied') return 'wrong';
        lostConnection();
      }
      return;
    }
    done();
    closeReport(id, as, undefined, securityPoint).catch((e: { code?: string }) => {
      if (e?.code !== 'permission-denied' && e?.code !== 'not-found') lostConnection();
    });
  };


  // Logging out ends the shift first, so the location is not kept (an open case blocks it, like going off duty)
  const logout = async () => {
    if (active) return;
    setOnDuty(false);
    setOpen([]);
    setShownId(null);
    Vibration.cancel();
    await goOffDuty().catch(() => {});
    await signOut(auth).catch(() => {});
    onLogout?.();
  };

  const title =
    tab === 'duty' ? tr('المناوبة', 'Duty') : tab === 'case' ? tr('البلاغ', 'Report') : tab === 'history' ? tr('سجلي', 'History') : tr('حسابي', 'Account');

  return (
    <View style={s.screen}>
      <Header
        sub={tr('نسيج · متطوع', 'Nasij · Volunteer')}
        title={title}
        actions={onSwitchRole && <HeaderButton icon="swap-horizontal" label={tr('تبديل إلى عائلة', 'Switch to family')} onPress={onSwitchRole} />}
      >
        <Pill dot={onDuty ? '#7FD69B' : C.faint} text={dutyBusy ? tr('لحظة…', 'One moment…') : onDuty ? tr('في المناوبة', 'On duty') : tr('خارج المناوبة', 'Off duty')} />
        {active && <Pill alert icon={TYPE_UI[active.type].icon} text={tr(`بلاغ مفتوح: ${active.member.name}`, `Open report: ${active.member.name}`)} />}
      </Header>

      <ScrollView contentContainerStyle={s.body}>
        <FadeIn key={tab}>
        {tab === 'duty' && (
          <>
            {incoming && (
              <FadeIn key={incoming.id}>
                <AlertCard report={incoming} now={now} speaks={speaks(incoming)} onAccept={accept} onDecline={skip} />
              </FadeIn>
            )}
            {active && (
              <Pressable style={[ui.strip, { backgroundColor: C.warnBg }]} onPress={() => setTab('case')}>
                <Ionicons name={isEn() ? 'arrow-forward' : 'arrow-back'} size={15} color={C.warn} />
                <Text style={[ui.stripText, { color: C.warn }]}>
                  {tr(`لديك بلاغ مفتوح عن ${active.member.name}، اضغط للعودة إليه`, `You have an open report for ${active.member.name}, tap to return`)}
                </Text>
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

        {/* Notices that belong to the open case (given by security, a close that didn't reach the system) */}
        {tab === 'case' && active && notice && (
          <Pressable style={[ui.strip, { backgroundColor: TONE[notice.tone].bg }]} onPress={() => setNotice(null)}>
            <Ionicons name={TONE[notice.tone].icon} size={16} color={TONE[notice.tone].color} />
            <Text style={[ui.stripText, { color: TONE[notice.tone].color }]}>{notice.text}</Text>
          </Pressable>
        )}

        {/* The family's phone: the volunteer calls them directly, no handover to security needed */}
        {tab === 'case' && active?.phone && (
          <Pressable style={[ui.strip, { backgroundColor: C.safeBg }]} onPress={() => Linking.openURL(`tel:${active.phone}`)}>
            <Ionicons name="call-outline" size={16} color={C.safe} />
            <Text style={[ui.stripText, { color: C.safe }]}>{tr(`اتصل بأهل ${active.member.name}: ${active.phone}`, `Call ${active.member.name}’s family: ${active.phone}`)}</Text>
          </Pressable>
        )}

        {tab === 'case' && active && latestPasserby && (
          <Pressable
            style={[ui.strip, { backgroundColor: C.safeBg }]}
            onPress={() => setPasserbyShown(latestPasserby)}
          >
            <Ionicons name="hand-left-outline" size={16} color={C.safe} />
            <Text style={[ui.stripText, { color: C.safe }]}>
              {tr(`مارّ أبلغ عن سوار ${active.member.name} ${since(latestPasserby.at, now)}`, `A passer-by reported ${active.member.name}’s bracelet ${since(latestPasserby.at, now)}`)}
              {latestPasserby.location ? tr('، اضغط لرؤية مكانه على الخريطة', ', tap to see the place on the map') : ''}
            </Text>
          </Pressable>
        )}

        {tab === 'case' &&
          (!active ? (
            <View style={s.empty}>
              <Ionicons name="checkmark-done-circle-outline" size={52} color={C.mint} />
              <Text style={s.emptyTitle}>{tr('لا يوجد بلاغ مفتوح', 'No open report')}</Text>
              <Text style={s.emptyText}>{onDuty ? tr('بيوصلك تنبيه أول ما يُبلَّغ عن حالة', 'You’ll get an alert as soon as a case is reported') : tr('شغّل المناوبة عشان تستقبل البلاغات', 'Go on duty to receive reports')}</Text>
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
              goToLabel={active.type === 'lost' ? tr('رجوع للبحث', 'Back to search') : tr('اتجه إليه', 'Go to them')}
            />
          ) : (
            <CloseCaseScreen report={active} area={area} onConfirm={closeCase} onCancel={() => setStep('proximity')} />
          ))}

        {tab === 'account' && (
          <AccountScreen
            key={profileLoaded ? 'loaded' : 'loading'} // the form starts from the saved details once they arrive
            profile={profile}
            onSaved={(p) => {
              setProfile(p);
              renameOnDuty(p.name);
            }}
            closedCount={closed.length}
            languageCount={languages.length}
            onDuty={onDuty}
            busy={!!active}
            onSwitchRole={onSwitchRole}
            onLogout={onLogout ? logout : undefined}
          />
        )}

        {tab === 'history' && (
          <>
            <Text style={ui.sectionTitle}>{tr('البلاغات المغلقة', 'Closed reports')}</Text>
            {closed.length === 0 && <Text style={s.none}>{tr('لم تغلق أي بلاغ بعد', 'You haven’t closed any reports yet')}</Text>}
            {closed.map((c, i) => {
              const u = c.closedAs ? CLOSED_UI[c.closedAs] : { icon: 'close-circle' as const, color: C.faint, label: tr('أغلقته العائلة أو الأمن', 'Closed by the family or security') };
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
            {closed.length > 0 && <Text style={s.note}>{tr('يبقى في السجل الاسم الأول ونتيجة البلاغ فقط', 'History keeps only the first name and the outcome')}</Text>}
          </>
        )}
        </FadeIn>
      </ScrollView>

      {active && <PasserbyModal report={active} passerby={passerbyShown} now={now} onClose={() => setPasserbyShown(null)} />}

      <BottomNav
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'duty', label: tr('المناوبة', 'Duty'), icon: 'radio-outline', dot: !!incoming },
          { key: 'case', label: tr('البلاغ', 'Report'), icon: 'search-outline', dot: !!active },
          { key: 'history', label: tr('سجلي', 'History'), icon: 'time-outline' },
          { key: 'account', label: tr('حسابي', 'Account'), icon: 'person-circle-outline', dot: !profile.name },
        ]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: 20, paddingBottom: 120 },
  empty: { alignItems: 'center', marginTop: 60, paddingHorizontal: 20 },
  emptyTitle: { color: C.primary, fontSize: F.h2, fontWeight: '700', marginTop: 12 },
  emptyText: { color: C.muted, fontSize: F.small, textAlign: 'center', marginTop: 6 },
  none: { color: C.faint, textAlign: 'center', marginTop: 30 },

  logRow: { ...ui.tile, flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 10 },
  logName: { color: C.text, fontSize: 14, fontWeight: '600', textAlign: 'right' },
  logSub: { color: C.muted, fontSize: 12.5, textAlign: 'right', marginTop: 2 },
  logTime: { color: C.faint, fontSize: 12, fontVariant: ['tabular-nums'] },
  note: { color: C.faint, fontSize: 12, textAlign: 'center', marginTop: 8 },
});
