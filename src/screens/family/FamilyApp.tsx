// Nasij family app: several members, one bracelet each. Measures each signal and alerts when one moves away.
// Same logic as the tested laptop scanner (nasij_scanner.py)
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Image, Modal, ScrollView, StyleSheet, Vibration, View } from 'react-native';
import { Text, TextInput } from '../../components/Text';
import { FadeIn, Pressable } from '../../components/Motion';
import { Ionicons } from '@expo/vector-icons';
import { State, type Device } from 'react-native-ble-plx';
import * as Location from 'expo-location';
import { C, ui } from '../../theme';
import { zones, type Member, type PasserbyAlert, type Point, type Report, type ReportType } from '../../mock';
import { metresBetween } from '../../components/geo';
import { PAIR_RSSI, newPairing, pairStep, type Pairing } from '../../ble/pairing';
import { listen, onBluetoothState } from '../../ble/scanner';
import { LOST_AFTER_MS, WINDOW, braceletMac, cleanMac, parseAlarm, summarize, type Signal, type Trend } from '../../ble/signal';
import { ActionSheet } from '../../components/ActionSheet';
import { Banner } from '../../components/Banner';
import { pickPhoto } from '../../components/PhotoField';
import { BottomNav } from '../../components/BottomNav';
import { Button } from '../../components/Button';
import { Header, HeaderButton, Pill } from '../../components/Header';
import { minSec } from '../../components/digits';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase';
import { claimBracelet, releaseBracelet } from '../../firebase/bracelets';
import { deleteMember, loadMembers, saveMember } from '../../firebase/members';
import { loadProfile, type Profile } from '../../firebase/profile';
import { closeReport, createReport, getHandoverCode, loadMyOpenReports, subscribeReport } from '../../firebase/reports';
import { subscribeLastSeen, type LastSeen } from '../../firebase/sightings';
import { answerPasserbyAlert, subscribePasserbyAlert } from '../../firebase/passerby';
import { areaOf } from '../../firebase/volunteers';
import FoundScreen from './FoundScreen';
import LostScreen from './LostScreen';
import AccountScreen from './AccountScreen';
import AlertsScreen from './AlertsScreen';
import MapScreen from './MapScreen';
import MemberForm from './MemberForm';
import { EMPTY, EVENT_RADIUS_M, KIND_UI, ZONE_UI, failed, formError, offset, type FamMember, type Form, type Live, type LogItem, type LogKind, type Zone } from './shared';
import { langName, tr, place } from '../../i18n';
import { watchBracelets } from '../../../modules/nasij-beacon';

const NEAR = -65;           // stronger than this = near
const FAR = -80;            // weaker than this = far
const HOLD_MS = 3000;       // a new state must last 3 s before we show it
const RESUME_GRACE_MS = 5000; // back from the background: time to hear each bracelet again before "lost"
const GAP = 4;              // extra margin needed to leave NEAR or FAR
const TX_AT_1M = -59;       // average signal at 1 metre (calibrate with the laptop scanner)
const PATH_LOSS = 2.5;      // how fast the signal fades (2 = open air, 3 = crowded)
const PAIR_TIMEOUT_MS = 60000; // linking gives up waiting for the press after 1 minute

// An emergency press waits this long before it reaches volunteers, so the family can cancel a press by mistake
const SOS_DELAY_MS = 15_000;
type PairView = { memberId: string; mac: string; heard: boolean; near: boolean; timedOut: boolean };
type AlertKind = 'SOS' | 'FALL';

// Older member documents miss the newer fields
const fromDoc = (m: Member): FamMember => ({
  id: m.id, name: m.name, kind: m.kind, gender: m.gender ?? 'male', age: m.age ? String(m.age) : '',
  language: m.language ?? 'ar', phone: m.phone ?? '', description: m.description ?? '',
  condition: m.health?.condition ?? '', notes: m.health?.notes ?? '', photo: null, mac: m.braceletId,
});
const toDoc = (m: Form & { id?: string; mac: string | null }) => ({
  id: m.id, name: m.name, kind: m.kind, gender: m.gender, age: Number(m.age) || 0, language: m.language,
  phone: m.phone || null, description: m.description,
  health: m.condition ? { condition: m.condition, notes: m.notes } : null, braceletId: m.mac,
});

// A passer-by report older than this no longer asks the family (it may be from an earlier visit)
const ALERT_FRESH_MS = 15 * 60_000;

const TREND_UI: Record<Trend, string> = {
  get approaching() { return tr('يقترب منك', 'Coming closer'); },
  get away() { return tr('يبتعد عنك', 'Moving away'); },
  get steady() { return tr('ثابت', 'Steady'); },
};

// 0 to 4 bars, like the prototype
function bars(smooth: number) {
  if (smooth >= -60) return 4;
  if (smooth >= -70) return 3;
  if (smooth >= -80) return 2;
  if (smooth >= -90) return 1;
  return 0;
}

// Everything known about one linked bracelet, fed by every packet and read by the 500 ms timer
type Track = {
  history: number[];
  latest: Signal | null;
  // Latest alarm info per slot: 0x21 = double press, 0x23 = no movement (possible fall)
  alarm: Record<number, { triggered: boolean; count: number }>;
  lastCount: Record<number, number>;
  wasTriggered: Record<number, boolean>;
  zone: Zone | null;
  candidate: { zone: Zone | null; since: number };
  radius: number; // while lost, keeps the last known circle
  edge: boolean;
};
const newTrack = (): Track => ({
  history: [], latest: null, alarm: {}, lastCount: {}, wasTriggered: {}, zone: null, candidate: { zone: null, since: 0 }, radius: 10, edge: false,
});

// Linked bracelets this visit, by number (MAC), and phone-side ids already matched to one
const tracks: Record<string, Track> = {};
const knownIds = new Map<string, string>();

// Returns the number of the linked bracelet this packet is from, or null
function identify(device: Device): string | null {
  const known = knownIds.get(device.id);
  if (known && tracks[known]) return known;
  const mac = braceletMac(device);
  if (mac && tracks[mac]) {
    knownIds.set(device.id, mac);
    return mac;
  }
  return null;
}
function forget(mac: string) {
  delete tracks[mac];
  for (const [id, m] of knownIds) if (m === mac) knownIds.delete(id);
}

function getZone(ageMs: number, smooth: number, current: Zone | null): Zone {
  if (ageMs > LOST_AFTER_MS) return 'LOST';
  // Stay in NEAR / FAR until the signal clearly crosses back
  if (current === 'NEAR' && smooth >= NEAR - GAP) return 'NEAR';
  if (current === 'FAR' && smooth < FAR + GAP) return 'FAR';
  if (smooth >= NEAR) return 'NEAR';
  if (smooth >= FAR) return 'MEDIUM';
  return 'FAR';
}

// Rough distance in metres from signal strength, rounded up to a few steps: the signal swings by several dB
// when the phone just turns in the hand, so exact metres would jump around (8 to 18 m standing still)
const METRE_STEPS = [5, 10, 20, 40, 60];
function estimateMetres(smooth: number) {
  const d = Math.pow(10, (TX_AT_1M - smooth) / (10 * PATH_LOSS));
  return METRE_STEPS.find((m) => d <= m) ?? 60;
}

type Tab = 'home' | 'map' | 'alerts' | 'profile';
type Screen = { kind: 'lost' | 'found'; memberId: string } | null;

// shown: false while the demo account has the volunteer side open (this side stays mounted but hidden); full-screen notices wait for it.
// onSwitchRole: demo account only
export default function FamilyApp({ shown = true, onSwitchRole, onLogout }: { shown?: boolean; onSwitchRole?: () => void; onLogout: () => void }) {
  const [bt, setBt] = useState<string>('');
  const [log, setLog] = useState<LogItem[]>([]);
  // Alerts added since the alerts tab was last open: the number on the bell
  const [unread, setUnread] = useState(0);
  const [sos, setSos] = useState<{ kind: AlertKind; who: string; mac: string } | null>(null);
  // Emergency presses waiting to go to volunteers: bracelet → time it will be sent
  const pendingSos = useRef<Record<string, number>>({});
  const [sosPending, setSosPending] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<Tab>('home');
  const [members, setMembers] = useState<FamMember[]>([]);
  // 'new' = adding a member, an id = editing that member, null = form closed. First visit: the form is open.
  const [editing, setEditing] = useState<string | null>('new');
  const [draft, setDraft] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  // The account holder's saved name and phone (edited on the account tab)
  const [profile, setProfile] = useState<Profile>({ name: '', phone: '' });
  const [profileLoaded, setProfileLoaded] = useState(false);
  // Open reports per member id, kept live from Firestore
  const [reports, setReports] = useState<Record<string, Report>>({});
  // Handover code per member id: the volunteer asks for it before handing them over
  const [codes, setCodes] = useState<Record<string, string>>({});
  // Where a volunteer's phone last heard the bracelet of an open report, per member id
  const [seen, setSeen] = useState<Record<string, LastSeen | null>>({});
  const [screen, setScreen] = useState<Screen>(null);
  const [lostAsk, setLostAsk] = useState<string | null>(null); // child whose signal was just lost: ask to report
  const [alerts, setAlerts] = useState<Record<string, PasserbyAlert | null>>({}); // latest passer-by report per bracelet
  const [justFound, setJustFound] = useState<{ name: string; as: Report['closedAs']; took: number; point: string | null; big: boolean } | null>(null);
  const [linkFor, setLinkFor] = useState<string | null>(null); // member whose link panel is open
  const [infoFor, setInfoFor] = useState<string | null>(null); // member whose bracelet info is shown
  // The ••• sheet: the member is kept while it closes, so its title doesn't go blank mid-fade
  const [menuMember, setMenuMember] = useState<FamMember | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [typedMac, setTypedMac] = useState('');
  const [live, setLive] = useState<Record<string, Live>>({});
  const [now, setNow] = useState(() => Date.now());
  const [me, setMe] = useState<Point | null>(null);
  const [eventCenter, setEventCenter] = useState<Point | null>(null);
  const [nearbyList, setNearbyList] = useState<[string, { rssi: number; seen: number }][]>([]);
  const [pairView, setPairView] = useState<PairView | null>(null);
  const nearby = useRef<Record<string, { rssi: number; seen: number }>>({});
  const pairing = useRef<{ memberId: string; p: Pairing } | null>(null);
  const autoReport = useRef<(type: 'emergency' | 'fall', mac: string) => void>(() => {});
  const link = useRef<(memberId: string, mac: string) => void>(() => {});
  const membersRef = useRef<FamMember[]>([]);
  const meRef = useRef<Point | null>(null);
  const centerRef = useRef<Point | null>(null);
  const sosRef = useRef(false);
  // Reports this family closed itself: no big "we found them" screen for those
  const ownClose = useRef(new Set<string>());
  const scrollRef = useRef<ScrollView>(null);

  // The scan timer reads the latest members through a ref
  useEffect(() => {
    membersRef.current = members;
  });

  // Locked phone: iOS warns when a linked bracelet's iBeacon goes out of range (needs the bracelet's iBeacon slot)
  useEffect(() => {
    const messages: Record<string, string> = {};
    for (const m of members) {
      if (m.mac) messages[m.mac] = tr(`ما نسمع سوار ${m.name}. افتح نسيج وتأكد`, `Can't hear ${m.name}'s bracelet. Open Nasij and check`);
    }
    watchBracelets(messages);
  }, [members]);

  // Parent's own location (the circles are drawn around it)
  useEffect(() => {
    let watch: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      watch = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 1 },
        (pos) => {
          const p = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          meRef.current = p;
          centerRef.current ??= p;
          setMe(p);
          setEventCenter(centerRef.current);
        },
      );
    })();
    return () => watch?.remove();
  }, []);

  const addLog = (kind: LogKind, who: string) => {
    setLog((old) => [{ time: new Date().toLocaleTimeString(), kind, who }, ...old].slice(0, 30));
    setUnread((n) => n + 1);
  };

  useEffect(() => {
    const nameOf = (mac: string) => membersRef.current.find((m) => m.mac === mac)?.name ?? '';
    const stopState = onBluetoothState(setBt);
    const stopScan = listen((device) => {
      if (device.rssi == null) return;
      // Remember nearby bracelets for the link panel
      const mac = braceletMac(device);
      if (mac) nearby.current[mac] = { rssi: device.rssi, seen: Date.now() };

      // Linking: wait for a new double press from that bracelet while it is held close
      if (pairing.current) pairStep(pairing.current.p, device.id, mac, device.rssi, parseAlarm(device));

      const linked = identify(device);
      if (!linked) return;
      const tr = tracks[linked];
      const a = parseAlarm(device);
      if (a && (a.frame === 0x21 || a.frame === 0x23)) tr.alarm[a.frame] = { triggered: a.triggered, count: a.count };
      const t = Date.now();
      // Coming back after being lost: start the average fresh
      if (tr.latest && t - tr.latest.lastSeen > LOST_AFTER_MS) tr.history = [];
      tr.history = [...tr.history, device.rssi].slice(-WINDOW);
      tr.latest = { rssi: device.rssi, ...summarize(tr.history), lastSeen: t };
    });

    // iOS stops scanning while the app is in the background: on return, give each bracelet RESUME_GRACE_MS
    // to be heard again instead of calling it lost at once. Short on purpose: a bracelet that really left
    // while the phone was locked is still reported a few seconds after opening the app.
    const resumed = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const graceFrom = Date.now() - LOST_AFTER_MS + RESUME_GRACE_MS;
      for (const tr of Object.values(tracks)) {
        if (tr.latest && tr.latest.lastSeen < graceFrom) tr.latest = { ...tr.latest, lastSeen: graceFrom };
      }
    });

    // Twice a second: decide each bracelet's zone and refresh the screen
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      // Bracelets heard in the last 5 s, strongest (closest) first
      setNearbyList(
        Object.entries(nearby.current)
          .filter(([, v]) => t - v.seen < 5000)
          .sort((a, b) => b[1].rssi - a[1].rssi)
          .slice(0, 4),
      );

      const pr = pairing.current;
      if (pr?.p.pressed) {
        pairing.current = null;
        setPairView(null);
        // Server-side lock: one family per bracelet per visit
        claimBracelet(pr.p.mac)
          .then((ok) =>
            ok ? link.current(pr.memberId, pr.p.mac) : Alert.alert(
                  tr('السوار مرتبط بعائلة ثانية', 'Bracelet linked to another family'),
                  tr('ما يمكن ربطه حتى تنهي العائلة زيارتها.', 'It can’t be linked until that family ends its visit.'),
                ),
          )
          .catch(() => failed(tr('تعذر ربط السوار', 'Couldn’t link the bracelet')));
      } else if (pr) {
        setPairView({
          memberId: pr.memberId,
          mac: pr.p.mac,
          heard: pr.p.rssi !== null,
          near: pr.p.rssi !== null && pr.p.rssi >= PAIR_RSSI,
          timedOut: t - pr.p.since > PAIR_TIMEOUT_MS,
        });
      }

      for (const [mac, at] of Object.entries(pendingSos.current)) {
        if (t < at) continue;
        delete pendingSos.current[mac];
        autoReport.current('emergency', mac);
      }
      setSosPending({ ...pendingSos.current });

      const next: Record<string, Live> = {};
      for (const [mac, tr] of Object.entries(tracks)) {
        const r = tr.latest;
        if (r) {
          const who = nameOf(mac);
          // Emergencies: 0x21 = double press, 0x23 = bracelet stopped moving (possible fall).
          // Alert only on a NEW event: the count goes up, or the alarm flag turns on.
          // The flag stays on for the whole alarm broadcast, so we ignore it while it
          // stays on, otherwise "تم الاستلام" would bring the alert right back.
          for (const [frame, kind] of [[0x21, 'SOS'], [0x23, 'FALL']] as const) {
            const a = tr.alarm[frame];
            if (!a) continue;
            const prev = tr.lastCount[frame];
            const firstSeen = prev === undefined;
            const isNew = (!firstSeen && a.count > prev) || (!firstSeen && a.triggered && !tr.wasTriggered[frame]);
            tr.lastCount[frame] = Math.max(a.count, prev ?? 0);
            tr.wasTriggered[frame] = a.triggered;
            if (!isNew) continue;
            // Always log it, even if another alert is already on screen
            addLog(kind, who);
            Vibration.vibrate([0, 800, 300, 800, 300, 800]);
            if (!sosRef.current) {
              sosRef.current = true;
              setSos({ kind, who, mac });
            }
            // Journey step 5: the alert also reaches the nearest volunteer.
            // A press waits SOS_DELAY_MS first (the family can cancel it); a possible fall goes at once.
            if (kind === 'SOS') pendingSos.current[mac] ??= t + SOS_DELAY_MS;
            else autoReport.current('fall', mac);
          }

          // iOS can wake the app in the background (iBeacon events) while it hears nothing: keep the zone until it is on screen
          const age = AppState.currentState === 'active' ? t - r.lastSeen : 0;
          const raw = getZone(age, r.smooth, tr.zone);
          if (raw !== tr.candidate.zone) tr.candidate = { zone: raw, since: t };
          const confirmed = tr.zone === null || raw === 'LOST' || t - tr.candidate.since >= HOLD_MS ? raw : tr.zone;
          if (confirmed !== 'LOST') tr.radius = estimateMetres(r.smooth);
          if (confirmed !== tr.zone) {
            tr.zone = confirmed;
            addLog(confirmed, who);
            if (confirmed === 'FAR' || confirmed === 'LOST') Vibration.vibrate([0, 500, 200, 500]);
            const child = membersRef.current.find((m) => m.mac === mac && m.kind === 'child');
            if (confirmed === 'LOST' && child) setLostAsk(child.id);
          }

          // Where the bracelet can be: within `radius` of the family. Warn once when that circle reaches the event edge.
          const meP = meRef.current;
          const c = centerRef.current;
          const edge = !!(meP && c && metresBetween(c, meP) + tr.radius > EVENT_RADIUS_M);
          if (edge && !tr.edge) {
            addLog('EDGE', who);
            Vibration.vibrate([0, 500, 200, 500]);
          }
          tr.edge = edge;
        }
        next[mac] = { signal: r, zone: tr.zone, radius: tr.radius, edge: tr.edge };
      }
      setLive(next);
    }, 500);

    return () => {
      stopState();
      stopScan();
      resumed.remove();
      clearInterval(timer);
      // Leaving the screen never drops a waiting help request: send it now (fails safe)
      for (const mac of Object.keys(pendingSos.current)) autoReport.current('emergency', mac);
      pendingSos.current = {};
    };
  }, []);

  useEffect(() => {
    loadProfile()
      .then((p) => {
        setProfile(p);
        setProfileLoaded(true);
        // New members start with the guardian's phone
        setDraft((d) => (d.phone ? d : { ...d, phone: p.phone }));
      })
      .catch(() => {});
  }, []);
  // The members saved on this account come back after login, with their bracelets and open reports.
  // A report whose member is gone, or an older second report for the same member, is closed:
  // otherwise volunteers keep searching for a bracelet that may now be on someone else.
  useEffect(() => {
    (async () => {
      const list = await loadMembers();
      for (const m of list) if (m.braceletId) tracks[m.braceletId] = tracks[m.braceletId] ?? newTrack();
      setMembers(list.map(fromDoc));
      if (list.length) setEditing(null);

      const open: Record<string, Report> = {};
      for (const r of await loadMyOpenReports()) {
        // Older reports carry no memberId: match them by bracelet
        const m = list.find((x) => x.id === r.memberId) ?? list.find((x) => !r.memberId && !!r.braceletId && x.braceletId === r.braceletId);
        if (m && !open[m.id]) open[m.id] = r; // newest first, so a later match is an older duplicate
        else closeReport(r.id, 'found').catch(() => {});
      }
      setReports(open);
      for (const [memberId, r] of Object.entries(open))
        getHandoverCode(r.id)
          .then((code) => code && setCodes((o) => ({ ...o, [memberId]: code })))
          .catch(() => {});
    })().catch(() => {});
  }, []);

  const save = (m: FamMember) =>
    saveMember(toDoc(m)).catch(() => {
      failed(tr('تعذر حفظ البيانات', 'Couldn’t save'));
      return m.id;
    });

  // Optional, but recommended once for a new child: a photo in today's clothes helps a volunteer most
  const recommendPhoto = (id: string, name: string) => {
    const add = async (camera: boolean) => {
      const photo = await pickPhoto(camera);
      if (photo) setMembers((list) => list.map((x) => (x.id === id ? { ...x, photo } : x)));
    };
    Alert.alert(
      tr(`ننصح بتصوير ${name}`, `We recommend a photo of ${name}`),
      tr(
        'صورة بملابسه اليوم تساعد المتطوع يتعرف عليه بسرعة لو ضاع. تبقى في جوالك بس، وما تنرسل إلا مع البلاغ',
        'A photo in today’s clothes helps a volunteer recognise them fast if they get lost. It stays on your phone and is only sent with a report',
      ),
      [
        { text: tr('تخطي', 'Skip'), style: 'cancel' },
        { text: tr('من الألبوم', 'From gallery'), onPress: () => add(false) },
        { text: tr('التقط صورة', 'Take a photo'), onPress: () => add(true) },
      ],
    );
  };

  const saveDraft = async () => {
    if (formError(draft) || saving) return;
    const f = { ...draft, name: draft.name.trim(), description: draft.description.trim(), condition: draft.condition.trim(), notes: draft.notes.trim() };
    const old = members.find((m) => m.id === editing);
    setSaving(true);
    try {
      if (old) {
        const m = { ...old, ...f };
        setMembers((list) => list.map((x) => (x.id === m.id ? m : x)));
        setEditing(null);
        await save(m);
      } else {
        const id = await saveMember(toDoc({ ...f, mac: null }));
        setMembers((list) => [...list, { ...f, id, mac: null }]);
        setEditing(null);
        setLinkFor(id); // next step: link a bracelet to the new member
        if (f.kind === 'child' && !f.photo) recommendPhoto(id, f.name);
      }
    } catch {
      failed(tr('تعذر حفظ البيانات', 'Couldn’t save'));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    link.current = (memberId, mac) => {
      tracks[mac] = newTrack();
      const m = members.find((x) => x.id === memberId);
      if (!m) return;
      const linked = { ...m, mac };
      setMembers((list) => list.map((x) => (x.id === memberId ? linked : x)));
      setLinkFor(null);
      setTypedMac('');
      save(linked);
    };
  });

  // Also closes the member's open report: once released, the bracelet can go to another family,
  // and volunteers must not keep searching for it under this member's name
  const unlink = (m: FamMember) => {
    if (!m.mac) return Promise.resolve();
    const mac = m.mac;
    const r = reports[m.id];
    forget(mac);
    const free = { ...m, mac: null };
    setMembers((list) => list.map((x) => (x.id === m.id ? free : x)));
    if (r) setReports(({ [m.id]: _, ...rest }) => rest);
    if (r) ownClose.current.add(r.id);
    return Promise.allSettled([releaseBracelet(mac), save(free), r && closeReport(r.id, 'found')]);
  };
  const askUnlink = (m: FamMember) =>
    Alert.alert(
      tr('فك السوار؟', 'Unlink the bracelet?'),
      reports[m.id]
        ? tr(`بينقفل بلاغ ${m.name} المفتوح، لأن المتطوعين يدورون بهالسوار.`, `${m.name}'s open report will be closed, because volunteers search by this bracelet.`)
        : tr(`ما راح تقدر تتابع ${m.name} حتى تربط سوار من جديد.`, `You won’t be able to follow ${m.name} until you link a bracelet again.`),
      [
        { text: tr('إلغاء', 'Cancel'), style: 'cancel' },
        { text: tr('فك السوار', 'Unlink'), style: 'destructive', onPress: () => unlink(m) },
      ],
    );

  // Follow the open reports live: a volunteer takes one, or closes it
  const openIds = Object.entries(reports)
    .map(([memberId, r]) => `${memberId}:${r.id}`)
    .join(',');
  useEffect(() => {
    if (!openIds) return;
    const stops = openIds.split(',').map((pair) => {
      const [memberId, reportId] = pair.split(':');
      return subscribeReport(reportId, (r) => {
        if (r && r.status !== 'closed') return setReports((o) => ({ ...o, [memberId]: r }));
        setReports(({ [memberId]: _, ...rest }) => rest);
        setScreen((s) => (s?.memberId === memberId ? null : s));
        if (!r || r.closedAs === 'expired') return; // closed by the hourly cleanup, not because they were found
        // Closed by a volunteer: a full-screen notice (with where to go if handed to security)
        setJustFound({ name: r.member.name, as: r.closedAs, took: (r.closedAt ?? Date.now()) - r.createdAt, point: r.securityPoint ?? null, big: !ownClose.current.has(r.id) });
        addLog('FOUND', r.member.name);
      });
    });
    const seenStops = openIds.split(',').map((pair) => {
      const [memberId, reportId] = pair.split(':');
      return subscribeLastSeen(reportId, (x) => setSeen((o) => ({ ...o, [memberId]: x })));
    });
    return () => [...stops, ...seenStops].forEach((stop) => stop());
  }, [openIds]);

  // A passer-by scanned one of our bracelets' stickers: ask the family whether the person is with them
  const macs = members.map((m) => m.mac).filter(Boolean).join(',');
  useEffect(() => {
    if (!macs) return;
    const stops = macs.split(',').map((mac) =>
      subscribePasserbyAlert(mac, (a) => {
        setAlerts((o) => ({ ...o, [mac]: a }));
        if (a && !a.answer && Date.now() - a.at < ALERT_FRESH_MS) Vibration.vibrate([0, 400, 200, 400]);
      }),
    );
    return () => stops.forEach((stop) => stop());
  }, [macs]);
  const answerAlert = (mac: string, answer: 'with-me' | 'lost') =>
    answerPasserbyAlert(mac, answer).catch(() => failed(tr('تعذر إرسال ردك', 'Couldn’t send your answer')));

  // Volunteers near the bracelet pick it up from Firestore
  const sendReport = async (m: FamMember, type: ReportType, description: string, photo: string | null) => {
    // Handover code for children only: an elder can say who their family is
    const code = m.kind === 'child' ? String(100000 + Math.floor(Math.random() * 900000)) : undefined;
    // ponytail: away from the Expo site (every demo), the report goes to a random zone so volunteers see a real
    // place. Remove at the real event, where the family's own zone is used
    const here = areaOf(me);
    const z = here ? null : zones[Math.floor(Math.random() * zones.length)];
    const r = {
      type,
      braceletId: m.mac ?? '',
      memberId: m.id,
      member: { name: m.name, kind: m.kind, age: Number(m.age) || 0, gender: m.gender, language: m.language },
      photo,
      description,
      health: m.condition ? { condition: m.condition, notes: m.notes } : null,
      phone: m.phone || profile.phone || null,
      // The zone on the event map, so a volunteer knows where to look (the family's own spot means nothing to them)
      area: z ? z.name : here,
      location: z ? offset(z.center, Math.random() * z.radius * 0.6, Math.random() * 360) : me,
    };
    try {
      const id = await createReport({ ...r, code });
      if (code) setCodes((o) => ({ ...o, [m.id]: code }));
      setReports((o) => ({
        ...o,
        [m.id]: { ...r, id, createdAt: Date.now(), status: 'open', assignedVolunteerId: null, closedAs: null, closedAt: null },
      }));
      setScreen(null);
      setJustFound(null);
      addLog('REPORT', m.name);
    } catch {
      failed(tr('تعذر إرسال البلاغ', 'Couldn’t send the report'));
    }
  };
  // Called from the scan timer, so it reads this render's members and reports through a ref.
  // One open report per member: a second press while their case is open adds nothing.
  // The description is how the family said to recognise them, never the alarm itself.
  useEffect(() => {
    autoReport.current = (type, mac) => {
      const m = members.find((x) => x.mac === mac);
      if (m && !reports[m.id]) sendReport(m, type, m.description, m.photo);
    };
  });

  // Closing also deletes the photo, health and phone; the live report then shows "found"
  const confirmFound = (memberId: string) => {
    const r = reports[memberId];
    if (!r) return;
    ownClose.current.add(r.id);
    closeReport(r.id, 'found').catch(() => failed(tr('تعذر إغلاق البلاغ', 'Couldn’t close the report')));
  };

  // Linking starts here: the bracelet is linked only after the press check passes
  const startPair = (memberId: string, mac: string) => {
    const other = members.find((m) => m.mac === mac && m.id !== memberId);
    if (other) return Alert.alert(tr('السوار مربوط', 'Bracelet already linked'), tr(`هذا السوار مربوط بـ${other.name}، فكّه منه أول.`, `This bracelet is linked to ${other.name}, unlink it first.`));
    pairing.current = { memberId, p: newPairing(mac, now) };
    setPairView({ memberId, mac, heard: false, near: false, timedOut: false });
    setTypedMac('');
  };
  const cancelPair = () => {
    pairing.current = null;
    setPairView(null);
  };

  // Delete a member completely, here and in Firestore: details, health, bracelet lock and any open report.
  // Resolves once Firestore is done, so "end of visit" signs out only after the deletes.
  const clearMember = (m: FamMember) => {
    const r = reports[m.id];
    if (r) ownClose.current.add(r.id);
    const done = Promise.allSettled([unlink(m), deleteMember(m.id), r && closeReport(r.id, 'found')]);
    if (pairing.current?.memberId === m.id) cancelPair();
    setMembers((list) => list.filter((x) => x.id !== m.id));
    setReports(({ [m.id]: _, ...rest }) => rest);
    setScreen((s) => (s?.memberId === m.id ? null : s));
    if (editing === m.id) setEditing(null);
    return done;
  };
  const removeMember = (m: FamMember) =>
    Alert.alert(
      tr(`حذف ${m.name}؟`, `Delete ${m.name}?`),
      tr('بتنحذف بياناته وحالته الصحية، وينفك ربط السوار، وينقفل أي بلاغ مفتوح.', 'Their details and health info are deleted, the bracelet is unlinked and any open report is closed.'),
      [
        { text: tr('إلغاء', 'Cancel'), style: 'cancel' },
        { text: tr('حذف', 'Delete'), style: 'destructive', onPress: () => clearMember(m) },
      ],
    );
  // Leaving the event: nothing about the family stays behind, and the bracelets are free for the next visitors
  const endVisit = () =>
    Alert.alert(tr('إنهاء الزيارة؟', 'End visit?'), tr('بتنحذف كل بيانات العائلة والحالة الصحية، وتنفك كل الأساور، وتطلع من حسابك.', 'All family details and health info are deleted, every bracelet is unlinked and you’re signed out.'), [
      { text: tr('إلغاء', 'Cancel'), style: 'cancel' },
      {
        text: tr('إنهاء الزيارة', 'End visit'),
        style: 'destructive',
        onPress: async () => {
          await Promise.allSettled(members.map(clearMember));
          await signOut(auth).catch(() => {});
          onLogout();
        },
      },
    ]);

  const dismissSos = () => {
    sosRef.current = false;
    setSos(null);
    Vibration.cancel();
  };
  // Pressed by mistake: nothing reaches the volunteers
  const cancelSos = (mac: string, who: string) => {
    delete pendingSos.current[mac];
    setSosPending({ ...pendingSos.current });
    addLog('CANCELLED', who);
    if (sos?.mac === mac) dismissSos();
  };
  const sendSosNow = (mac: string) => {
    if (pendingSos.current[mac]) pendingSos.current[mac] = 0; // the next tick sends it
  };
  const leftFor = (mac: string) => Math.max(0, Math.ceil((sosPending[mac] - now) / 1000));
  // Countdown only on a help-request card; a fall card never shows the cancel buttons
  const sosLeft = sos?.kind === 'SOS' && sosPending[sos.mac] !== undefined ? leftFor(sos.mac) : null;
  // Other bracelets' presses waiting while the card shows someone else: each can still be cancelled
  const otherPending = Object.keys(sosPending).filter((mac) => mac !== sos?.mac || sos?.kind !== 'SOS');
  const nameOfMac = (mac: string) => members.find((m) => m.mac === mac)?.name ?? '';

  const btOff = !!bt && bt !== State.PoweredOn;
  const liveOf = (m: FamMember) => (m.mac ? live[m.mac] : undefined);
  const activeCount = members.filter((m) => {
    const l = liveOf(m);
    return l?.signal && l.zone !== 'LOST';
  }).length;
  const warnAny = members.some((m) => {
    const l = liveOf(m);
    return l && (l.zone === 'MEDIUM' || l.zone === 'FAR' || l.zone === 'LOST' || l.edge);
  });
  const openCount = Object.keys(reports).length;
  const screenMember = screen && members.find((m) => m.id === screen.memberId);
  const askMember = members.find((m) => m.id === lostAsk && !reports[m.id] && liveOf(m)?.zone === 'LOST');
  // Unanswered, recent, and no open report for them yet (then volunteers already have it)
  const foundMember = members.find((m) => {
    const a = m.mac ? alerts[m.mac] : null;
    return a && !a.answer && now - a.at < ALERT_FRESH_MS && !reports[m.id];
  });
  const foundAlert = foundMember?.mac ? alerts[foundMember.mac] : null;
  const foundArea = foundAlert ? areaOf(foundAlert.location) : '';

  const renderLink = (m: FamMember) => {
    const pv = pairView?.memberId === m.id ? pairView : null;
    if (pv)
      return (
        <View style={s.linkPanel}>
          <Text style={s.formTitle}>{tr(`تأكيد سوار ${m.name}`, `Confirm ${m.name}’s bracelet`)}</Text>
          <Text style={s.hint}>{tr('عشان نتأكد إن السوار بيدك أنتِ، مو سوار شخص ثاني قريب منك', 'So we know the bracelet is in your hand, not someone else’s nearby')}</Text>
          <Text style={[s.nearMac, { textAlign: 'center', marginVertical: 8 }]}>{pv.mac}</Text>

          <View style={s.stepRow}>
            <Ionicons name={pv.near ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={pv.near ? C.safe : C.faint} />
            <Text style={s.stepText}>{tr('١. لصّقي السوار بالجوال', '1. Hold the bracelet against the phone')}</Text>
          </View>
          <View style={s.stepRow}>
            <Ionicons name="ellipse-outline" size={20} color={C.faint} />
            <Text style={s.stepText}>{tr('٢. اضغطي زر السوار ضغطتين وهو ملاصق (بيصفّر، هذا طبيعي)', '2. Press the bracelet button twice while touching (it beeps, that’s normal)')}</Text>
          </View>

          {!pv.heard && <Text style={s.empty}>{tr('ما نسمع هذا السوار حاليًا، تأكدي من الرقم', 'We can’t hear this bracelet right now, check the number')}</Text>}
          {pv.timedOut && (
            <Banner
              tone="warn"
              icon="alert-circle-outline"
              text={tr('ما وصلنا ضغط من هذا السوار وهو ملاصق. تأكدي إنه نفس السوار اللي بيدك واضغطي مرة ثانية', 'No press reached us from this bracelet while touching. Check it’s the one in your hand and press again')}
            />
          )}
          <Button label={tr('إلغاء', 'Cancel')} kind="ghost" onPress={cancelPair} style={{ marginTop: 12 }} />
        </View>
      );
    return (
      <View style={s.linkPanel}>
        <Text style={s.formTitle}>{tr(`ربط سوار ${m.name}`, `Link ${m.name}’s bracelet`)}</Text>
        <Text style={s.hint}>{tr('لصّقي السوار بالجوال، وبيطلع أول القائمة', 'Hold the bracelet against the phone and it shows first')}</Text>

        {nearbyList.length === 0 && <Text style={s.empty}>{tr('جاري البحث عن أساور قريبة...', 'Looking for nearby bracelets...')}</Text>}
        {nearbyList.map(([mac, v], i) => {
          const owner = members.find((x) => x.mac === mac);
          return (
            <View key={mac} style={s.nearRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.nearMac}>{mac}</Text>
                <Text style={s.nearSub}>
                  {owner ? tr(`مربوط بـ${owner.name}`, `Linked to ${owner.name}`) : i === 0 ? tr('الأقرب', 'Closest') : tr('قريب', 'Nearby')} · {tr('الإشارة', 'signal')} {v.rssi}
                </Text>
              </View>
              {!owner && (
                <Pressable style={s.linkBtn} onPress={() => startPair(m.id, mac)}>
                  <Text style={s.linkText}>{tr('ربط', 'Link')}</Text>
                </Pressable>
              )}
            </View>
          );
        })}

        <Text style={s.label}>{tr('أو اكتبي الرقم المطبوع ورا السوار', 'Or type the number printed on the back')}</Text>
        <View style={s.typedRow}>
          <TextInput
            style={[s.input, { flex: 1 }]}
            value={typedMac}
            onChangeText={(t) => setTypedMac(cleanMac(t))}
            placeholder="785005002D12"
            placeholderTextColor={C.faint}
            autoCapitalize="characters"
            autoCorrect={false}
            textAlign="center"
          />
          <Pressable
            style={[s.linkBtn, typedMac.length !== 12 && { opacity: 0.4 }]}
            onPress={() => typedMac.length === 12 && startPair(m.id, typedMac)}
          >
            <Text style={s.linkText}>{tr('ربط', 'Link')}</Text>
          </Pressable>
        </View>
        <Button label={tr('لاحقًا', 'Later')} kind="ghost" onPress={() => setLinkFor(null)} style={{ marginTop: 10 }} />
      </View>
    );
  };

  const formOpen = !screen && tab === 'home' && !!editing;
  // Seeing the alerts tab reads them all, including ones that arrive while it is open
  if (!screen && tab === 'alerts' && unread) setUnread(0);
  const [mapSeen, setMapSeen] = useState(false);
  if (tab === 'map' && !mapSeen) setMapSeen(true);
  // A new page starts at the top, wherever the list was scrolled to
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [formOpen, tab, screen?.kind]);

  const renderMember = (m: FamMember) => {
    const l = liveOf(m);
    const zone = l?.zone ?? null;
    const reading = l?.signal ?? null;
    const lost = zone === 'LOST';
    const zoneUi = zone ? ZONE_UI[zone] : null;
    const strength = reading && !lost ? bars(reading.smooth) : 0;
    const ago = reading ? Math.round((now - reading.lastSeen) / 1000) : 0;
    const edge = !!l?.edge;
    const warn = zone === 'MEDIUM' || zone === 'FAR' || lost || edge;
    const report = reports[m.id];
    const role = [KIND_UI[m.kind].label, m.age && tr(`${m.age} سنة`, `${m.age} yrs`), langName(m.language)].filter(Boolean).join(' · ');

    return (
      <View key={m.id} style={[ui.card, { marginBottom: 14 }, warn && { borderColor: lost || zone === 'FAR' || edge ? C.dangerBorder : C.warnBorder }]}>
        {edge && <Banner tone="danger" icon="exit-outline" text={tr(`${m.name} قريب من حدود الفعالية أو خارجها`, `${m.name} is near or past the event edge`)} onPress={() => setTab('map')} />}
        {(zone === 'MEDIUM' || zone === 'FAR') && <Banner tone="warn" icon="warning-outline" text={tr(`الإشارة تضعف، ${m.name} يبتعد عنك`, `Signal weakening, ${m.name} is moving away`)} />}
        {lost && <Banner tone="danger" icon="close-circle-outline" text={tr(`انقطعت الإشارة عن سوار ${m.name}`, `Lost signal from ${m.name}’s bracelet`)} />}

        <View style={s.memberRow}>
          <View style={[s.avatar, { backgroundColor: KIND_UI[m.kind].color }]}>
            {m.photo ? <Image source={{ uri: m.photo }} style={s.avatarPhoto} /> : <Text style={s.avatarText}>{m.name[0]}</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <View style={s.nameRow}>
              <Text style={s.memberName}>{m.name}</Text>
              <View style={s.nameTools}>
                <View style={s.bars}>
                  {[1, 2, 3, 4].map((i) => (
                    <View
                      key={i}
                      style={[
                        s.bar,
                        {
                          height: 4 + i * 4,
                          backgroundColor: i <= strength ? (strength <= 1 ? C.danger : strength <= 2 ? C.warn : C.accent) : C.barOff,
                        },
                      ]}
                    />
                  ))}
                </View>
                {m.mac && (
                  <Pressable hitSlop={12} onPress={() => setInfoFor(infoFor === m.id ? null : m.id)} accessibilityRole="button" accessibilityLabel={tr('معلومات السوار', 'Bracelet info')}>
                    <Ionicons name={infoFor === m.id ? 'information-circle' : 'information-circle-outline'} size={22} color={C.accent} />
                  </Pressable>
                )}
                <Pressable style={s.more} hitSlop={10} onPress={() => { setMenuMember(m); setMenuOpen(true); }} accessibilityRole="button" accessibilityLabel={tr('خيارات', 'Options')}>
                  <Ionicons name="ellipsis-horizontal" size={18} color={C.accent} />
                </Pressable>
              </View>
            </View>
            <Text style={s.memberRole}>{role}</Text>
            {!!m.condition && (
              <View style={[s.meta, { marginTop: 4 }]}>
                <Ionicons name="medkit-outline" size={12} color={C.muted} />
                <Text style={s.metaText}>{m.condition}</Text>
              </View>
            )}

            <View style={s.metaRow}>
              <View style={s.meta}>
                <View style={[ui.dot, { backgroundColor: zoneUi?.color ?? C.faint }]} />
                <Text style={[s.metaText, { color: zoneUi?.color ?? C.faint, fontWeight: '600' }]}>
                  {zoneUi?.label ?? (m.mac ? tr('جاري البحث عن السوار...', 'Looking for the bracelet...') : tr('لم يُربط سوار بعد', 'No bracelet linked yet'))}
                </Text>
              </View>
              {reading && (
                <View style={s.meta}>
                  <Ionicons name="time-outline" size={12} color={C.faint} />
                  <Text style={s.metaText}>{ago < 3 ? tr('الآن', 'now') : tr(`قبل ${ago} ث`, `${ago}s ago`)}</Text>
                </View>
              )}
            </View>
            {reading && !lost && (
              <Text style={s.trend}>
                {TREND_UI[reading.trend]} · {tr(`ضمن ${l?.radius} متر تقريبًا`, `within about ${l?.radius} m`)}
              </Text>
            )}
          </View>
        </View>

        {/* Lost child: report it, or close the open report */}
        {m.kind === 'child' && !report && (
          <Button label={tr(`أبلّغ عن ضياع ${m.name}`, `Report ${m.name} missing`)} icon="megaphone-outline" kind="soft" onPress={() => setScreen({ kind: 'lost', memberId: m.id })} style={{ marginTop: 14 }} />
        )}
        {report && (
          <View style={{ marginTop: 14 }}>
            <Banner
              tone="danger"
              icon="megaphone-outline"
              text={
                report.status === 'searching'
                  ? tr('متطوع استلم البلاغ ويدور الحين', 'A volunteer took the report and is searching now')
                  : tr('البلاغ وصل للمتطوعين القريبين، ننتظر أحد يلقاه', 'Report sent to nearby volunteers, waiting for someone to find them')
              }
            />
            {seen[m.id] && (() => {
              const s = seen[m.id]!;
              const min = Math.max(0, Math.floor((now - s.at) / 60_000));
              const where = s.area ? place(s.area) : tr('قرب متطوع', 'near a volunteer');
              const when = min < 1 ? tr('الآن', 'just now') : tr(`قبل ${min} د`, `${min} min ago`);
              return <Banner tone="info" icon="location-outline" text={tr(`آخر إشارة للسوار: ${where} · ${when}`, `Bracelet last heard: ${where} · ${when}`)} />;
            })()}
            {codes[m.id] && (
              <View style={s.codeBox}>
                <Text style={s.codeLabel}>{tr('رمز التسليم', 'Handover code')}</Text>
                <Text style={s.code}>{codes[m.id]}</Text>
                <Text style={s.codeHint}>
                  {tr(
                    `قوله للمتطوع بس لما يسلّمك ${m.name}. ما يسلّمه لأحد بدون هالرمز`,
                    `Tell the volunteer only when they hand ${m.name} to you. They won’t hand over without it`,
                  )}
                </Text>
              </View>
            )}
            <Button label={tr('لقيناه', 'We found them')} icon="checkmark-circle-outline" onPress={() => setScreen({ kind: 'found', memberId: m.id })} />
          </View>
        )}

        {!m.mac && linkFor === m.id && renderLink(m)}

        {/* Bracelet details, behind the ⓘ next to the signal bars */}
        {m.mac && infoFor === m.id && (
          <View style={s.techCard}>
            <Text style={s.techText}>{tr(`رقم السوار: ${m.mac}`, `Bracelet: ${m.mac}`)}</Text>
            {reading && (
              <Text style={s.techText}>
                {tr(`الإشارة الآن ${reading.rssi} · المتوسط ${reading.smooth}`, `Signal now ${reading.rssi} · average ${reading.smooth}`)}
              </Text>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={s.screen}>
      <Header
        sub={tr('نسيج', 'Nasij')}
        title={tr('عائلتي', 'My family')}
        actions={
          <>
            <HeaderButton icon="notifications-outline" label={tr('التنبيهات', 'Alerts')} badge={unread} onPress={() => setTab('alerts')} />
            {onSwitchRole && <HeaderButton icon="swap-horizontal" label={tr('تبديل إلى متطوع', 'Switch to volunteer')} onPress={onSwitchRole} />}
          </>
        }
      >
        <Pill
          dot={activeCount ? C.mint : C.faint}
          text={
            activeCount === 0
              ? tr('لا يوجد سوار نشط', 'No active bracelet')
              : activeCount === 1
                ? tr('سوار واحد نشط', '1 active bracelet')
                : tr(`${activeCount} أساور نشطة`, `${activeCount} active bracelets`)
          }
        />
        {openCount > 0 && <Pill alert icon="megaphone-outline" text={openCount === 1 ? tr('بلاغ مفتوح', '1 open report') : tr(`${openCount} بلاغات مفتوحة`, `${openCount} open reports`)} />}
        {(warnAny || !!sos) && !openCount && <Pill alert icon="warning-outline" text={tr('تنبيه', 'Alert')} />}
      </Header>

      {/* Found and handed to security: full screen, with where to pick them up */}
      {shown && justFound?.big && (
        <Modal visible animationType="fade" onRequestClose={() => setJustFound({ ...justFound, big: false })}>
          <View style={[s.ask, { backgroundColor: C.safe }]}>
            {/* The screen fades in natively; the content follows in a short stagger */}
            <FadeIn pop delay={60} style={s.sosIcon}>
              <Ionicons name="shield-checkmark" size={30} color={C.safe} />
            </FadeIn>
            <FadeIn delay={120}>
              <Text style={s.sosTitle}>{tr(`لقينا ${justFound.name}`, `We found ${justFound.name}`)}</Text>
            </FadeIn>
            <FadeIn delay={170}>
            <Text style={s.askText}>
              {justFound.as === 'security'
                ? tr(
                    `${justFound.name} بأمان عند نقطة الأمن، بعد ${minSec(justFound.took, ' د', ' ث')} من البلاغ. توجّهوا لها مع إثبات الهوية`,
                    `${justFound.name} is safe at the security point, ${minSec(justFound.took, 'm', 's')} after the report. Go there with your ID`,
                  )
                : justFound.as === 'helped'
                  ? tr(
                      `المتطوع وصل لـ${justFound.name} وساعده وهو بخير، بعد ${minSec(justFound.took, ' د', ' ث')} من البلاغ`,
                      `The volunteer reached ${justFound.name} and helped, they’re fine, ${minSec(justFound.took, 'm', 's')} after the report`,
                    )
                  : tr(
                      `الحمد لله على سلامة ${justFound.name}، رجع لكم بعد ${minSec(justFound.took, ' د', ' ث')} من البلاغ. انقفل البلاغ وانحذفت بياناته`,
                      `So glad ${justFound.name} is safe, back with you ${minSec(justFound.took, 'm', 's')} after the report. The report is closed and their details deleted`,
                    )}
            </Text>
            </FadeIn>
            {justFound.point && (
              <FadeIn delay={220} style={s.point}>
                <Ionicons name="location" size={22} color={C.safe} />
                <Text style={s.pointText}>{place(justFound.point)}</Text>
              </FadeIn>
            )}
            <FadeIn delay={justFound.point ? 270 : 220} style={s.askBtns}>
              <Pressable style={[s.sosBtn, s.askBtn]} onPress={() => setJustFound({ ...justFound, big: false })}>
                <Text style={[s.sosBtnText, { color: C.safe }]}>{justFound.as === 'security' ? tr('تمام، رايحين لها', 'OK, on our way') : tr('الحمد لله', 'Thank you')}</Text>
              </Pressable>
            </FadeIn>
          </View>
        </Modal>
      )}

      {/* A passer-by scanned the bracelet's sticker: is the person with you? Their answer shows on the security dashboard */}
      {shown && foundMember && foundAlert && (
        <Modal visible animationType="fade" onRequestClose={() => answerAlert(foundMember.mac!, 'with-me')}>
          <View style={s.ask}>
            <FadeIn pop style={s.sosIcon}>
              <Ionicons name="hand-left-outline" size={30} color={C.danger} />
            </FadeIn>
            <FadeIn delay={50}>
              <Text style={s.sosTitle}>{tr(`شخص أبلغ عن ${foundMember.name}`, `Someone reported ${foundMember.name}`)}</Text>
            </FadeIn>
            <FadeIn delay={90}>
              <Text style={s.askText}>
                {foundArea
                  ? tr(`أحد مسح سوار ${foundMember.name} في ${place(foundArea)}. هو معك؟`, `Someone scanned ${foundMember.name}’s bracelet in ${place(foundArea)}. Are they with you?`)
                  : tr(`أحد مسح سوار ${foundMember.name}. هو معك؟`, `Someone scanned ${foundMember.name}’s bracelet. Are they with you?`)}
              </Text>
            </FadeIn>
            <FadeIn delay={130} style={s.askBtns}>
              <Pressable
                style={[s.sosBtn, s.askBtn]}
                onPress={() => {
                  answerAlert(foundMember.mac!, 'lost');
                  setScreen({ kind: 'lost', memberId: foundMember.id });
                }}
              >
                <Text style={s.sosBtnText}>{tr(`${foundMember.name} ضائع، أبلّغ`, `${foundMember.name} is lost, report`)}</Text>
              </Pressable>
              <Pressable style={[s.sosBtn, s.sosBtnGhost, s.askBtn]} onPress={() => answerAlert(foundMember.mac!, 'with-me')}>
                <Text style={[s.sosBtnText, { color: '#fff' }]}>{tr('لا، معي', 'No, they’re with me')}</Text>
              </Pressable>
            </FadeIn>
          </View>
        </Modal>
      )}

      {/* Signal lost for 20 s: ask full screen whether the child is lost. Goes away by itself if the signal comes back */}
      {shown && askMember && !foundMember && (
        <Modal visible animationType="fade" onRequestClose={() => setLostAsk(null)}>
          <View style={s.ask}>
            {/* Urgent: a tighter stagger than the green one, so the buttons are there within a quarter second */}
            <FadeIn pop style={s.sosIcon}>
              <Ionicons name="bluetooth-outline" size={30} color={C.danger} />
            </FadeIn>
            <FadeIn delay={50}>
              <Text style={s.sosTitle}>{tr(`انقطعت إشارة ${askMember.name}`, `Lost ${askMember.name}’s signal`)}</Text>
            </FadeIn>
            <FadeIn delay={90}>
              <Text style={s.askText}>
                {tr(
                  `ما وصلنا شي من سوار ${askMember.name} من ${LOST_AFTER_MS / 1000} ثانية. هو معك؟`,
                  `Nothing from ${askMember.name}’s bracelet for ${LOST_AFTER_MS / 1000} seconds. Are they with you?`,
                )}
              </Text>
            </FadeIn>
            <FadeIn delay={130} style={s.askBtns}>
              <Pressable style={[s.sosBtn, s.askBtn]} onPress={() => { setScreen({ kind: 'lost', memberId: askMember.id }); setLostAsk(null); }}>
                <Text style={s.sosBtnText}>{tr(`${askMember.name} ضائع، أبلّغ`, `${askMember.name} is lost, report`)}</Text>
              </Pressable>
              <Pressable style={[s.sosBtn, s.sosBtnGhost, s.askBtn]} onPress={() => setLostAsk(null)}>
                <Text style={[s.sosBtnText, { color: '#fff' }]}>{tr('لا، معي', 'No, they’re with me')}</Text>
              </Pressable>
            </FadeIn>
          </View>
        </Modal>
      )}

      {menuMember && (
        <ActionSheet
          visible={menuOpen}
          onClose={() => setMenuOpen(false)}
          title={tr(`إجراءات ${menuMember.name}`, `${menuMember.name} actions`)}
          cancel={tr('إلغاء', 'Cancel')}
          actions={[
            { label: tr(`تعديل بيانات ${menuMember.name}`, `Edit ${menuMember.name}’s details`), icon: 'create-outline', onPress: () => { setDraft(menuMember); setEditing(menuMember.id); } },
            menuMember.mac
              ? { label: tr('فك ارتباط السوار', 'Unlink bracelet'), icon: 'unlink-outline', onPress: () => askUnlink(menuMember) }
              : { label: tr('ربط سوار', 'Link a bracelet'), icon: 'link-outline', onPress: () => setLinkFor(menuMember.id) },
            { label: tr('حذف فرد العائلة', 'Delete family member'), icon: 'trash-outline', destructive: true, onPress: () => removeMember(menuMember) },
          ]}
        />
      )}

      <ScrollView ref={scrollRef} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {/* Emergency */}
        {!!sos && (
          <FadeIn style={s.sos}>
            <View style={s.sosIcon}>
              <Ionicons name="alert" size={30} color={C.danger} />
            </View>
            <Text style={s.sosTitle}>{sos.kind === 'FALL' ? tr('احتمال سقوط', 'Possible fall') : tr('طلب مساعدة', 'Help request')}</Text>
            <Text style={s.sosText}>
              {sos.kind === 'FALL'
                ? tr(`${sos.who} ما تحرك من فترة، تأكدوا منه`, `${sos.who} hasn’t moved for a while, check on them`)
                : tr(`${sos.who} ضغط زر الطوارئ في السوار`, `${sos.who} pressed the bracelet’s emergency button`)}
            </Text>
            {sosLeft !== null ? (
              <>
                <Text style={s.sosCountdown}>
                  {tr(`يوصل للمتطوعين القريبين بعد ${sosLeft} ث`, `Goes to nearby volunteers in ${sosLeft} s`)}
                </Text>
                <View style={s.sosRow}>
                  <Pressable style={[s.sosBtn, { paddingHorizontal: 18 }]} onPress={() => cancelSos(sos.mac, sos.who)}>
                    <Text style={s.sosBtnText}>{tr('ضغطة بالغلط، ألغِ', 'Mistake, cancel')}</Text>
                  </Pressable>
                  <Pressable style={[s.sosBtn, s.sosBtnGhost]} onPress={() => sendSosNow(sos.mac)}>
                    <Text style={[s.sosBtnText, { color: '#fff' }]}>{tr('أرسل الحين', 'Send now')}</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Pressable style={s.sosBtn} onPress={dismissSos}>
                <Text style={s.sosBtnText}>{tr('تم الاستلام', 'Got it')}</Text>
              </Pressable>
            )}
          </FadeIn>
        )}

        {otherPending.map((mac) => (
          <View key={mac} style={s.pendingRow}>
            <Text style={s.pendingText}>
              {tr(`طلب مساعدة من ${nameOfMac(mac)} يوصل للمتطوعين بعد ${leftFor(mac)} ث`, `Help request from ${nameOfMac(mac)} goes to volunteers in ${leftFor(mac)} s`)}
            </Text>
            <Pressable onPress={() => cancelSos(mac, nameOfMac(mac))} hitSlop={8}>
              <Text style={s.pendingCancel}>{tr('ألغِ', 'Cancel')}</Text>
            </Pressable>
          </View>
        ))}

        {btOff && <Banner tone="danger" icon="bluetooth" text={tr('شغّلي البلوتوث عشان نتابع الأساور', 'Turn on Bluetooth so we can track the bracelets')} />}

        {/* Screens and the form fade and lift in; tab switches (tapped all day) only fade */}
        <FadeIn key={screen?.kind ?? (formOpen ? 'form' : tab)} quick={!screen && !formOpen}>
        {screen?.kind === 'lost' && screenMember && (
          <LostScreen
            name={screenMember.name}
            initial={screenMember.description}
            initialPhoto={screenMember.photo}
            hasBracelet={!!screenMember.mac}
            onSend={(d, photo) => sendReport(screenMember, 'lost', d, photo)}
            onCancel={() => setScreen(null)}
          />
        )}
        {screen?.kind === 'found' && screenMember && (
          <FoundScreen name={screenMember.name} onConfirm={() => confirmFound(screenMember.id)} onCancel={() => setScreen(null)} />
        )}

        {formOpen && (
          <MemberForm
            draft={draft}
            onChange={setDraft}
            editingName={members.find((m) => m.id === editing)?.name ?? null}
            saving={saving}
            onSave={saveDraft}
            onCancel={members.length > 0 ? () => setEditing(null) : null}
          />
        )}

        {!screen && tab === 'home' && !editing && (
          <>
            <Text style={ui.sectionTitle}>{tr('أفراد العائلة', 'Family members')}</Text>

            {justFound && (
              <Banner
                tone={justFound.as === 'security' ? 'warn' : 'safe'}
                icon={justFound.as === 'security' ? 'shield-checkmark' : 'checkmark-circle'}
                text={
                  justFound.as === 'security'
                    ? tr(
                        `${justFound.name} عند نقطة الأمن${justFound.point ? `: ${place(justFound.point)}` : ''}. توجّهوا لها مع إثبات الهوية`,
                        `${justFound.name} is at the security point${justFound.point ? `: ${place(justFound.point)}` : ''}. Go there with your ID`,
                      )
                    : tr(
                        `الحمد لله على سلامة ${justFound.name}، انقفل البلاغ خلال ${minSec(justFound.took, ' د', ' ث')} وانحذفت بياناته`,
                        `So glad ${justFound.name} is safe, found in ${minSec(justFound.took, 'm', 's')}. The report is closed and their details deleted`,
                      )
                }
                onPress={() => setJustFound(null)}
              />
            )}

            {members.map(renderMember)}

            <Button
              label={tr('أضف فردًا آخر', 'Add another member')}
              icon="person-add-outline"
              kind="ghost"
              onPress={() => {
                setDraft({ ...EMPTY, phone: profile.phone });
                setEditing('new');
              }}
              style={{ marginBottom: 14 }}
            />

            {/* Quick actions */}
            <Text style={ui.caption}>{tr('إجراءات سريعة', 'Quick actions')}</Text>
            <View style={s.actions}>
              <Pressable style={s.action} onPress={() => setTab('map')}>
                <Ionicons name="location-outline" size={18} color={C.primary} />
                <Text style={s.actionText}>{tr('خريطة العائلة', 'Family map')}</Text>
              </Pressable>
              <Pressable style={s.action} onPress={() => setTab('alerts')}>
                <Ionicons name="notifications-outline" size={18} color={C.danger} />
                <Text style={s.actionText}>{tr('سجل التنبيهات', 'Alert log')}</Text>
              </Pressable>
            </View>
          </>
        )}


        {!screen && tab === 'profile' && (
          <AccountScreen
            key={profileLoaded ? 'loaded' : 'loading'} // the form starts from the saved details once they arrive
            profile={profile}
            onSaved={setProfile}
            memberCount={members.length}
            activeCount={activeCount}
            openCount={openCount}
            onSwitchRole={onSwitchRole}
            onEndVisit={endVisit}
          />
        )}

        {!screen && tab === 'alerts' && <AlertsScreen log={log} />}
        </FadeIn>
        {/* The map stays mounted once opened and is only hidden, so it does not rebuild on every visit */}
        {mapSeen && (
          <View style={{ display: !screen && tab === 'map' ? 'flex' : 'none' }}>
            <MapScreen members={members} live={live} me={me} eventCenter={eventCenter} />
          </View>
        )}
      </ScrollView>

      <BottomNav
        active={tab}
        onChange={(t) => {
          setTab(t);
          if (members.length) setEditing(null);
          setScreen(null);
        }}
        tabs={[
          { key: 'home', label: tr('الرئيسية', 'Home'), icon: 'home-outline', dot: openCount > 0 },
          { key: 'map', label: tr('الخريطة', 'Map'), icon: 'map-outline' },
          { key: 'alerts', label: tr('التنبيهات', 'Alerts'), icon: 'notifications-outline' },
          { key: 'profile', label: tr('حسابي', 'Account'), icon: 'person-circle-outline', dot: !profile.phone },
        ]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: 20, paddingBottom: 110 },

  memberRow: { flexDirection: 'row-reverse', gap: 12, alignItems: 'flex-start' },
  avatar: { width: 52, height: 52, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  avatarPhoto: { width: 52, height: 52, borderRadius: 18 },
  hint: { color: C.muted, fontSize: 12.5, textAlign: 'right', marginBottom: 10 },
  nearRow: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
    backgroundColor: C.fill, borderRadius: 14, padding: 12, marginBottom: 8,
  },
  nearMac: { color: C.primary, fontSize: 14, fontWeight: '700', textAlign: 'right', letterSpacing: 0.5 },
  nearSub: { color: C.faint, fontSize: 12, textAlign: 'right', marginTop: 2 },
  linkBtn: { backgroundColor: C.primary, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  linkText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  typedRow: { flexDirection: 'row-reverse', gap: 10, alignItems: 'stretch' },
  stepRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 8 },
  stepText: { flex: 1, color: C.text, fontSize: 13.5, textAlign: 'right' },
  formTitle: { color: C.primary, fontSize: 16, fontWeight: '700', textAlign: 'right', marginBottom: 6 },
  label: { color: C.muted, fontSize: 12, fontWeight: '600', textAlign: 'right', marginTop: 12, marginBottom: 6 },
  input: ui.input,
  nameRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  memberName: { color: C.primary, fontSize: 18, fontWeight: '800', textAlign: 'right' },
  memberRole: { color: C.muted, fontSize: 12.5, textAlign: 'right', marginTop: 2 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  nameTools: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  more: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.fill, alignItems: 'center', justifyContent: 'center' },
  bar: { width: 4, borderRadius: 2 },
  metaRow: { flexDirection: 'row-reverse', gap: 14, marginTop: 10, flexWrap: 'wrap' },
  meta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5 },
  metaText: { color: C.faint, fontSize: 12.5 },
  trend: { color: C.muted, fontSize: 12.5, textAlign: 'right', marginTop: 6 },

  actions: { flexDirection: 'row-reverse', gap: 12 },
  action: { ...ui.tile, flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  actionText: { color: C.primary, fontSize: 13, fontWeight: '600' },

  techCard: { marginTop: 14, padding: 12, borderRadius: 16, backgroundColor: '#EEF5F4' },
  codeBox: { alignItems: 'center', backgroundColor: '#EEF5F4', borderRadius: 18, padding: 14, marginBottom: 10 },
  codeLabel: { color: C.muted, fontSize: 12, fontWeight: '600' },
  code: { color: C.primary, fontSize: 30, fontWeight: '700', letterSpacing: 8, marginVertical: 2, fontVariant: ['tabular-nums'] },
  codeHint: { color: C.muted, fontSize: 12, textAlign: 'center' },
  linkPanel: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  techText: { color: C.primary, fontSize: 12, textAlign: 'right', marginBottom: 2 },

  sos: {
    backgroundColor: C.danger, borderRadius: 24, padding: 22, marginBottom: 16, alignItems: 'center',
    shadowColor: C.danger, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  sosIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  sosTitle: { color: '#fff', fontSize: 24, fontWeight: '700' },
  ask: { flex: 1, backgroundColor: C.danger, alignItems: 'center', justifyContent: 'center', padding: 28 },
  askText: { color: '#FDECEA', fontSize: 17, marginTop: 10, marginBottom: 18, textAlign: 'center', lineHeight: 26 },
  askBtn: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 15 },
  askBtns: { alignSelf: 'stretch' },
  point: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'stretch', backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 6 },
  pointText: { flexShrink: 1, color: C.primary, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  sosText: { color: '#FDECEA', fontSize: 14, marginTop: 4, textAlign: 'center' },
  sosBtn: { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 11, paddingHorizontal: 34, marginTop: 14 },
  sosBtnText: { color: C.danger, fontSize: 16, fontWeight: '700' },
  pendingRow: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10, marginBottom: 12,
    backgroundColor: C.dangerBg, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14,
  },
  pendingText: { flex: 1, color: C.danger, fontSize: 13.5, fontWeight: '600', textAlign: 'right' },
  pendingCancel: { color: C.danger, fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' },
  sosCountdown: { color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 10, textAlign: 'center' },
  sosRow: { flexDirection: 'row-reverse', gap: 10 },
  sosBtnGhost: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#fff', paddingHorizontal: 18 },

  empty: { color: C.faint, textAlign: 'center', marginTop: 30 },

});
