// Nasij family app: several members, one bracelet each. Measures each signal and alerts when one moves away.
// Same logic as the tested laptop scanner (nasij_scanner.py)
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { State, type Device } from 'react-native-ble-plx';
import MapView, { Circle } from 'react-native-maps';
import * as Location from 'expo-location';
import { C, ui } from '../../theme';
import { LANGUAGES, MAX_AGE, type Gender, type Kind, type Language, type Member, type Point, type Report, type ReportType } from '../../mock';
import { metresBetween } from '../../components/geo';
import { PAIR_RSSI, newPairing, pairStep, type Pairing } from '../../ble/pairing';
import { listen, onBluetoothState } from '../../ble/scanner';
import { LOST_AFTER_MS, WINDOW, braceletMac, cleanMac, parseAlarm, summarize, type Signal, type Trend } from '../../ble/signal';
import { Banner } from '../../components/Banner';
import { BottomNav } from '../../components/BottomNav';
import { Button } from '../../components/Button';
import { Header, HeaderButton, Pill } from '../../components/Header';
import { latinDigits } from '../../components/digits';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase';
import { claimBracelet, releaseBracelet } from '../../firebase/bracelets';
import { deleteMember, loadMembers, saveMember } from '../../firebase/members';
import { closeReport, createReport, subscribeReport } from '../../firebase/reports';
import FoundScreen from './FoundScreen';
import LostScreen from './LostScreen';

const NEAR = -65;           // stronger than this = near
const FAR = -80;            // weaker than this = far
const HOLD_MS = 3000;       // a new state must last 3 s before we show it
const GAP = 4;              // extra margin needed to leave NEAR or FAR
const TX_AT_1M = -59;       // average signal at 1 metre (calibrate with the laptop scanner)
const PATH_LOSS = 2.5;      // how fast the signal fades (2 = open air, 3 = crowded)
const PAIR_TIMEOUT_MS = 60000; // linking gives up waiting for the press after 1 minute
// ponytail: event boundary = circle around the family's first location, so it can be tested anywhere.
// Phase 2: the real event boundary from Firestore.
const EVENT_RADIUS_M = 150;

type Zone = 'NEAR' | 'MEDIUM' | 'FAR' | 'LOST';
type LogKind = Zone | 'SOS' | 'FALL' | 'REPORT' | 'FOUND' | 'EDGE';
type PairView = { memberId: string; mac: string; heard: boolean; near: boolean; timedOut: boolean };
type AlertKind = 'SOS' | 'FALL';

// A member as the family edits it (age and phone as typed), plus the linked bracelet
type Form = {
  name: string; kind: Kind; gender: Gender; age: string; language: Language;
  phone: string; description: string; condition: string; notes: string;
};
type FamMember = Form & { id: string; mac: string | null };
const EMPTY: Form = {
  name: '', kind: 'child', gender: 'male', age: '', language: 'ar', phone: '', description: '', condition: '', notes: '',
};
const KIND_UI: Record<Kind, { label: string; color: string }> = {
  child: { label: 'طفل', color: C.child },
  elder: { label: 'كبير سن', color: C.elder },
};
const GENDER_UI: Record<Gender, string> = { male: 'ذكر', female: 'أنثى' };

// Older member documents miss the newer fields
const fromDoc = (m: Member): FamMember => ({
  id: m.id, name: m.name, kind: m.kind, gender: m.gender ?? 'male', age: m.age ? String(m.age) : '',
  language: m.language ?? 'ar', phone: m.phone ?? '', description: m.description ?? '',
  condition: m.health?.condition ?? '', notes: m.health?.notes ?? '', mac: m.braceletId,
});
const toDoc = (m: Form & { id?: string; mac: string | null }) => ({
  id: m.id, name: m.name, kind: m.kind, gender: m.gender, age: Number(m.age) || 0, language: m.language,
  phone: m.phone || null, description: m.description,
  health: m.condition ? { condition: m.condition, notes: m.notes } : null, braceletId: m.mac,
});

// What stops the form from saving, or null. A child needs a parent's phone: the volunteer calls it.
function formError(f: Form): string | null {
  if (!f.name.trim()) return 'اكتب الاسم';
  if (!f.age) return 'اكتب العمر';
  if (Number(f.age) > MAX_AGE[f.kind]) return `العمر لازم يكون ${MAX_AGE[f.kind]} سنة أو أقل لـ${KIND_UI[f.kind].label}`;
  if (f.kind === 'child' && !f.phone) return 'اكتب رقم جوال ولي الأمر';
  if (f.phone && !/^\d{9,15}$/.test(f.phone)) return 'رقم الجوال غير صحيح';
  return null;
}

const ZONE_UI: Record<LogKind, { label: string; color: string }> = {
  SOS: { label: 'طلب مساعدة', color: C.danger },
  FALL: { label: 'احتمال سقوط', color: C.danger },
  REPORT: { label: 'بلاغ للمتطوعين', color: C.danger },
  FOUND: { label: 'انقفل البلاغ', color: C.safe },
  EDGE: { label: 'قرب حدود الفعالية', color: C.danger },
  NEAR: { label: 'قريب منك', color: C.safe },
  MEDIUM: { label: 'مسافة متوسطة', color: C.warn },
  FAR: { label: 'بعيد عنك', color: C.danger },
  LOST: { label: 'انقطعت الإشارة', color: C.danger },
};
const failed = (title: string) => Alert.alert(title, 'تأكد من الاتصال بالإنترنت وحاول مرة ثانية.');

const TREND_UI: Record<Trend, string> = {
  approaching: 'يقترب منك',
  away: 'يبتعد عنك',
  steady: 'ثابت',
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
// What the screen shows per bracelet, copied from the tracks twice a second
type Live = { signal: Signal | null; zone: Zone | null; radius: number; edge: boolean };

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

// Rough distance in metres from signal strength
function estimateMetres(smooth: number) {
  const d = Math.pow(10, (TX_AT_1M - smooth) / (10 * PATH_LOSS));
  return Math.max(2, Math.min(60, Math.round(d)));
}

const CIRCLE_FILL: Record<Zone, string> = {
  NEAR: 'rgba(27,107,58,0.16)',
  MEDIUM: 'rgba(212,132,26,0.16)',
  FAR: 'rgba(192,57,43,0.16)',
  LOST: 'rgba(192,57,43,0.10)',
};

type Tab = 'home' | 'map' | 'alerts';
type Screen = { kind: 'lost' | 'found'; memberId: string } | null;

export default function FamilyApp({ onSwitchRole, onLogout }: { onSwitchRole: () => void; onLogout: () => void }) {
  const [bt, setBt] = useState<string>('');
  const [log, setLog] = useState<{ time: string; kind: LogKind; who: string }[]>([]);
  const [sos, setSos] = useState<{ kind: AlertKind; who: string } | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [members, setMembers] = useState<FamMember[]>([]);
  // 'new' = adding a member, an id = editing that member, null = form closed. First visit: the form is open.
  const [editing, setEditing] = useState<string | null>('new');
  const [draft, setDraft] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  // Open reports per member id, kept live from Firestore
  const [reports, setReports] = useState<Record<string, Report>>({});
  const [screen, setScreen] = useState<Screen>(null);
  const [justFound, setJustFound] = useState<string | null>(null);
  const [linkFor, setLinkFor] = useState<string | null>(null); // member whose link panel is open
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

  // The scan timer reads the latest members through a ref
  useEffect(() => {
    membersRef.current = members;
  });

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

  const addLog = (kind: LogKind, who: string) =>
    setLog((old) => [{ time: new Date().toLocaleTimeString(), kind, who }, ...old].slice(0, 30));

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
            ok ? link.current(pr.memberId, pr.p.mac) : Alert.alert('السوار مرتبط بعائلة ثانية', 'ما يمكن ربطه حتى تنهي العائلة زيارتها.'),
          )
          .catch(() => failed('تعذر ربط السوار'));
      } else if (pr) {
        setPairView({
          memberId: pr.memberId,
          mac: pr.p.mac,
          heard: pr.p.rssi !== null,
          near: pr.p.rssi !== null && pr.p.rssi >= PAIR_RSSI,
          timedOut: t - pr.p.since > PAIR_TIMEOUT_MS,
        });
      }

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
              setSos({ kind, who });
            }
            // Journey step 5: the alert also reaches the nearest volunteer
            autoReport.current(kind === 'SOS' ? 'emergency' : 'fall', mac);
          }

          const raw = getZone(t - r.lastSeen, r.smooth, tr.zone);
          if (raw !== tr.candidate.zone) tr.candidate = { zone: raw, since: t };
          const confirmed = tr.zone === null || raw === 'LOST' || t - tr.candidate.since >= HOLD_MS ? raw : tr.zone;
          if (confirmed !== 'LOST') tr.radius = estimateMetres(r.smooth);
          if (confirmed !== tr.zone) {
            tr.zone = confirmed;
            addLog(confirmed, who);
            if (confirmed === 'FAR' || confirmed === 'LOST') Vibration.vibrate([0, 500, 200, 500]);
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
      clearInterval(timer);
    };
  }, []);

  // The members saved on this account come back after login, with their bracelets
  useEffect(() => {
    loadMembers()
      .then((list) => {
        for (const m of list) if (m.braceletId) tracks[m.braceletId] = tracks[m.braceletId] ?? newTrack();
        setMembers(list.map(fromDoc));
        if (list.length) setEditing(null);
      })
      .catch(() => {});
  }, []);

  const save = (m: FamMember) =>
    saveMember(toDoc(m)).catch(() => {
      failed('تعذر حفظ البيانات');
      return m.id;
    });

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
      }
    } catch {
      failed('تعذر حفظ البيانات');
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

  const unlink = (m: FamMember) => {
    if (!m.mac) return Promise.resolve();
    const mac = m.mac;
    forget(mac);
    const free = { ...m, mac: null };
    setMembers((list) => list.map((x) => (x.id === m.id ? free : x)));
    return Promise.allSettled([releaseBracelet(mac), save(free)]);
  };

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
        if (!r) return;
        setJustFound(r.member.name);
        addLog('FOUND', r.member.name);
      });
    });
    return () => stops.forEach((stop) => stop());
  }, [openIds]);

  // Volunteers near the bracelet pick it up from Firestore
  const sendReport = async (m: FamMember, type: ReportType, description: string, photo: string | null) => {
    const r = {
      type,
      braceletId: m.mac ?? '',
      member: { name: m.name, kind: m.kind, age: Number(m.age) || 0, gender: m.gender, language: m.language },
      photo,
      description,
      health: m.condition ? { condition: m.condition, notes: m.notes } : null,
      phone: m.phone || null,
      area: 'قرب موقع العائلة',
      location: me,
    };
    try {
      const id = await createReport(r);
      setReports((o) => ({
        ...o,
        [m.id]: { ...r, id, createdAt: Date.now(), status: 'open', assignedVolunteerId: null, closedAs: null, closedAt: null },
      }));
      setScreen(null);
      setJustFound(null);
      addLog('REPORT', m.name);
    } catch {
      failed('تعذر إرسال البلاغ');
    }
  };
  // Called from the scan timer, so it reads this render's members and reports through a ref.
  // One open report per member: a second press while their case is open adds nothing.
  // The description is how the family said to recognise them, never the alarm itself.
  useEffect(() => {
    autoReport.current = (type, mac) => {
      const m = members.find((x) => x.mac === mac);
      if (m && !reports[m.id]) sendReport(m, type, m.description, null);
    };
  });

  // Closing also deletes the photo, health and phone; the live report then shows "found"
  const confirmFound = (memberId: string) => {
    const r = reports[memberId];
    if (r) closeReport(r.id, 'found').catch(() => failed('تعذر إغلاق البلاغ'));
  };

  // Linking starts here: the bracelet is linked only after the press check passes
  const startPair = (memberId: string, mac: string) => {
    const other = members.find((m) => m.mac === mac && m.id !== memberId);
    if (other) return Alert.alert('السوار مربوط', `هذا السوار مربوط بـ${other.name}، فكّه منه أول.`);
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
    const done = Promise.allSettled([unlink(m), deleteMember(m.id), r && closeReport(r.id, 'found')]);
    if (pairing.current?.memberId === m.id) cancelPair();
    setMembers((list) => list.filter((x) => x.id !== m.id));
    setReports(({ [m.id]: _, ...rest }) => rest);
    setScreen((s) => (s?.memberId === m.id ? null : s));
    if (editing === m.id) setEditing(null);
    return done;
  };
  const removeMember = (m: FamMember) =>
    Alert.alert(`حذف ${m.name}؟`, 'بتنحذف بياناته وحالته الصحية، وينفك ربط السوار، وينقفل أي بلاغ مفتوح.', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'حذف', style: 'destructive', onPress: () => clearMember(m) },
    ]);
  // Leaving the event: nothing about the family stays behind, and the bracelets are free for the next visitors
  const endVisit = () =>
    Alert.alert('إنهاء الزيارة؟', 'بتنحذف كل بيانات العائلة والحالة الصحية، وتنفك كل الأساور، وتطلع من حسابك.', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'إنهاء الزيارة',
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
  const draftError = formError(draft);

  const renderMap = (height: number) => (
    <View style={[s.mapBox, { height }]}>
      {me ? (
        <MapView
          style={StyleSheet.absoluteFill}
          showsUserLocation
          initialRegion={{ ...me, latitudeDelta: 0.0004, longitudeDelta: 0.0004 }}
        >
          {eventCenter && (
            <Circle
              center={eventCenter}
              radius={EVENT_RADIUS_M}
              strokeColor={C.primary}
              strokeWidth={2}
              lineDashPattern={[8, 6]}
              fillColor="transparent"
            />
          )}
          {members.map((m) => {
            const l = liveOf(m);
            return (
              l?.zone && (
                <Circle
                  key={m.id}
                  center={me}
                  radius={l.radius}
                  strokeColor={ZONE_UI[l.zone].color}
                  strokeWidth={2}
                  fillColor={CIRCLE_FILL[l.zone]}
                />
              )
            );
          })}
        </MapView>
      ) : (
        <Text style={s.mapWait}>جاري تحديد موقعك...</Text>
      )}
    </View>
  );

  const renderForm = () => {
    const old = members.find((m) => m.id === editing);
    const chips = <T extends string>(options: Record<T, string>, value: T, set: (v: T) => void) => (
      <View style={[s.chips, { flexWrap: 'wrap' }]}>
        {(Object.keys(options) as T[]).map((k) => (
          <Pressable
            key={k}
            onPress={() => set(k)}
            style={[s.chip, value === k && { backgroundColor: C.primary, borderColor: C.primary }]}
          >
            <Text style={[s.chipText, value === k && { color: '#fff' }]}>{options[k]}</Text>
          </Pressable>
        ))}
      </View>
    );
    return (
      <View style={[ui.card, { marginBottom: 14 }]}>
        <Text style={s.formTitle}>{old ? `تعديل بيانات ${old.name}` : 'أضف فردًا من العائلة'}</Text>

        <Text style={s.label}>الاسم</Text>
        <TextInput
          style={s.input}
          value={draft.name}
          onChangeText={(name) => setDraft({ ...draft, name })}
          placeholder="مثلًا: سنا"
          placeholderTextColor={C.faint}
          textAlign="right"
        />

        <Text style={s.label}>النوع</Text>
        {chips({ child: KIND_UI.child.label, elder: KIND_UI.elder.label }, draft.kind, (kind) => setDraft({ ...draft, kind }))}

        <Text style={s.label}>الجنس</Text>
        {chips(GENDER_UI, draft.gender, (gender) => setDraft({ ...draft, gender }))}

        <Text style={s.label}>العمر</Text>
        <TextInput
          style={s.input}
          value={draft.age}
          onChangeText={(age) => setDraft({ ...draft, age: latinDigits(age).slice(0, 3) })}
          placeholder={draft.kind === 'child' ? `من 0 إلى ${MAX_AGE.child}` : `حتى ${MAX_AGE.elder}`}
          placeholderTextColor={C.faint}
          keyboardType="number-pad"
          textAlign="right"
        />

        <Text style={s.label}>لغته</Text>
        {chips(LANGUAGES, draft.language, (language) => setDraft({ ...draft, language }))}
        <Text style={[s.hint, { marginTop: 6 }]}>المتطوع اللي يتكلم لغته يوصله البلاغ أول</Text>

        <Text style={s.label}>{draft.kind === 'child' ? 'رقم جوال ولي الأمر' : 'رقم جوال للتواصل (اختياري)'}</Text>
        <TextInput
          style={s.input}
          value={draft.phone}
          onChangeText={(phone) => setDraft({ ...draft, phone: latinDigits(phone).slice(0, 15) })}
          placeholder="05XXXXXXXX"
          placeholderTextColor={C.faint}
          keyboardType="phone-pad"
          textAlign="right"
        />
        <Text style={[s.hint, { marginTop: 6 }]}>يشوفه المتطوع اللي يستلم البلاغ بس، عشان يتواصل معكم مباشرة</Text>

        <Text style={s.label}>كيف يتعرف عليه المتطوع؟ (اختياري)</Text>
        <TextInput
          style={[s.input, { minHeight: 70 }]}
          value={draft.description}
          onChangeText={(description) => setDraft({ ...draft, description })}
          placeholder="مثلًا: ثوب أبيض وشماغ أحمر، يمشي بعكاز"
          placeholderTextColor={C.faint}
          multiline
          textAlign="right"
          textAlignVertical="top"
        />

        <Text style={s.label}>حالة صحية (اختياري)</Text>
        <TextInput
          style={s.input}
          value={draft.condition}
          onChangeText={(condition) => setDraft({ ...draft, condition })}
          placeholder="مثلًا: ربو، سكري"
          placeholderTextColor={C.faint}
          textAlign="right"
        />
        {!!draft.condition.trim() && (
          <>
            <Text style={s.label}>وش لازم يسوي المتطوع؟</Text>
            <TextInput
              style={[s.input, { minHeight: 70 }]}
              value={draft.notes}
              onChangeText={(notes) => setDraft({ ...draft, notes })}
              placeholder="مثلًا: البخاخ في الجيب الأمامي لشنطته"
              placeholderTextColor={C.faint}
              multiline
              textAlign="right"
              textAlignVertical="top"
            />
          </>
        )}
        <Text style={[s.hint, { marginTop: 6 }]}>تظهر لمتطوع واحد بس وقت البلاغ، وتنحذف لما ينقفل</Text>

        {!!draftError && !!draft.name.trim() && <Text style={s.formError}>{draftError}</Text>}
        <Button label={saving ? 'جارٍ الحفظ…' : 'حفظ'} onPress={saveDraft} disabled={!!draftError || saving} style={{ marginTop: 12 }} />
        {members.length > 0 && <Button label="إلغاء" kind="ghost" onPress={() => setEditing(null)} style={{ marginTop: 10 }} />}
      </View>
    );
  };

  const renderLink = (m: FamMember) => {
    const pv = pairView?.memberId === m.id ? pairView : null;
    if (pv)
      return (
        <View style={s.linkPanel}>
          <Text style={s.formTitle}>تأكيد سوار {m.name}</Text>
          <Text style={s.hint}>عشان نتأكد إن السوار بيدك أنتِ، مو سوار شخص ثاني قريب منك</Text>
          <Text style={[s.nearMac, { textAlign: 'center', marginVertical: 8 }]}>{pv.mac}</Text>

          <View style={s.stepRow}>
            <Ionicons name={pv.near ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={pv.near ? C.safe : C.faint} />
            <Text style={s.stepText}>١. لصّقي السوار بالجوال</Text>
          </View>
          <View style={s.stepRow}>
            <Ionicons name="ellipse-outline" size={20} color={C.faint} />
            <Text style={s.stepText}>٢. اضغطي زر السوار ضغطتين وهو ملاصق (بيصفّر، هذا طبيعي)</Text>
          </View>

          {!pv.heard && <Text style={s.empty}>ما نسمع هذا السوار حاليًا، تأكدي من الرقم</Text>}
          {pv.timedOut && (
            <Banner
              tone="warn"
              icon="alert-circle-outline"
              text="ما وصلنا ضغط من هذا السوار وهو ملاصق. تأكدي إنه نفس السوار اللي بيدك واضغطي مرة ثانية"
            />
          )}
          <Button label="إلغاء" kind="ghost" onPress={cancelPair} style={{ marginTop: 12 }} />
        </View>
      );
    return (
      <View style={s.linkPanel}>
        <Text style={s.formTitle}>ربط سوار {m.name}</Text>
        <Text style={s.hint}>لصّقي السوار بالجوال، وبيطلع أول القائمة</Text>

        {nearbyList.length === 0 && <Text style={s.empty}>جاري البحث عن أساور قريبة...</Text>}
        {nearbyList.map(([mac, v], i) => {
          const owner = members.find((x) => x.mac === mac);
          return (
            <View key={mac} style={s.nearRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.nearMac}>{mac}</Text>
                <Text style={s.nearSub}>
                  {owner ? `مربوط بـ${owner.name}` : i === 0 ? 'الأقرب' : 'قريب'} · الإشارة {v.rssi}
                </Text>
              </View>
              {!owner && (
                <Pressable style={s.linkBtn} onPress={() => startPair(m.id, mac)}>
                  <Text style={s.linkText}>ربط</Text>
                </Pressable>
              )}
            </View>
          );
        })}

        <Text style={s.label}>أو اكتبي الرقم المطبوع ورا السوار</Text>
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
            <Text style={s.linkText}>ربط</Text>
          </Pressable>
        </View>
        <Button label="لاحقًا" kind="ghost" onPress={() => setLinkFor(null)} style={{ marginTop: 10 }} />
      </View>
    );
  };

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
    const role = [KIND_UI[m.kind].label, GENDER_UI[m.gender], m.age && `${m.age} سنة`, LANGUAGES[m.language]].filter(Boolean).join(' · ');

    return (
      <View key={m.id} style={[ui.card, { marginBottom: 14 }, warn && { borderColor: lost || zone === 'FAR' || edge ? C.dangerBorder : C.warnBorder }]}>
        {edge && <Banner tone="danger" icon="exit-outline" text={`${m.name} قريب من حدود الفعالية أو خارجها`} onPress={() => setTab('map')} />}
        {(zone === 'MEDIUM' || zone === 'FAR') && <Banner tone="warn" icon="warning-outline" text={`الإشارة تضعف، ${m.name} يبتعد عنك`} />}
        {lost && <Banner tone="danger" icon="close-circle-outline" text={`انقطعت الإشارة عن سوار ${m.name}`} />}

        <View style={s.memberRow}>
          <View style={[s.avatar, { backgroundColor: KIND_UI[m.kind].color }]}>
            <Text style={s.avatarText}>{m.name[0]}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={s.nameRow}>
              <Text style={s.memberName}>{m.name}</Text>
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
                  {zoneUi?.label ?? (m.mac ? 'جاري البحث عن السوار...' : 'لم يُربط سوار بعد')}
                </Text>
              </View>
              {reading && (
                <View style={s.meta}>
                  <Ionicons name="time-outline" size={12} color={C.faint} />
                  <Text style={s.metaText}>{ago < 3 ? 'الآن' : `قبل ${ago} ث`}</Text>
                </View>
              )}
            </View>
            {reading && !lost && (
              <Text style={s.trend}>
                {TREND_UI[reading.trend]} · ضمن {l?.radius} متر تقريبًا
              </Text>
            )}
          </View>
        </View>

        {/* Lost child: report it, or close the open report */}
        {m.kind === 'child' && !report && (
          <Button label={`${m.name} ضائع`} icon="search" kind="danger" onPress={() => setScreen({ kind: 'lost', memberId: m.id })} style={{ marginTop: 14 }} />
        )}
        {report && (
          <View style={{ marginTop: 14 }}>
            <Banner
              tone="danger"
              icon="megaphone-outline"
              text={report.status === 'searching' ? 'متطوع استلم البلاغ ويدور الحين' : 'البلاغ وصل للمتطوعين القريبين، ننتظر أحد يستلمه'}
            />
            <Button label="لقيناه" icon="checkmark-circle-outline" onPress={() => setScreen({ kind: 'found', memberId: m.id })} />
          </View>
        )}

        {!m.mac && linkFor === m.id && renderLink(m)}

        {/* Technical details for the demo */}
        {m.mac && (
          <View style={s.techCard}>
            <Text style={s.techText}>رقم السوار: {m.mac}</Text>
            {reading && (
              <Text style={s.techText}>
                الإشارة الآن {reading.rssi} · المتوسط {reading.smooth}
              </Text>
            )}
          </View>
        )}

        <View style={s.memberActions}>
          <Pressable
            style={s.smallBtn}
            hitSlop={6}
            onPress={() => {
              setDraft(m);
              setEditing(m.id);
            }}
          >
            <Ionicons name="create-outline" size={15} color={C.accent} />
            <Text style={[s.smallBtnText, { color: C.accent }]}>تعديل</Text>
          </Pressable>
          {m.mac ? (
            <Pressable style={s.smallBtn} hitSlop={6} onPress={() => unlink(m)}>
              <Ionicons name="unlink-outline" size={15} color={C.accent} />
              <Text style={[s.smallBtnText, { color: C.accent }]}>فك السوار</Text>
            </Pressable>
          ) : (
            linkFor !== m.id && (
              <Pressable style={s.smallBtn} hitSlop={6} onPress={() => setLinkFor(m.id)}>
                <Ionicons name="link-outline" size={15} color={C.accent} />
                <Text style={[s.smallBtnText, { color: C.accent }]}>ربط سوار</Text>
              </Pressable>
            )
          )}
          <Pressable style={s.smallBtn} hitSlop={6} onPress={() => removeMember(m)}>
            <Ionicons name="trash-outline" size={15} color={C.danger} />
            <Text style={[s.smallBtnText, { color: C.danger }]}>حذف</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={s.screen}>
      <Header
        sub="نسيج"
        title="عائلتي"
        actions={
          <>
            <HeaderButton icon="notifications-outline" label="التنبيهات" badge={log.length} onPress={() => setTab('alerts')} />
            <HeaderButton icon="swap-horizontal" label="تبديل إلى متطوع" onPress={onSwitchRole} />
            <HeaderButton icon="exit-outline" label="إنهاء الزيارة" onPress={endVisit} />
          </>
        }
      >
        <Pill
          dot={activeCount ? C.mint : C.faint}
          text={activeCount === 0 ? 'لا يوجد سوار نشط' : activeCount === 1 ? 'سوار واحد نشط' : `${activeCount} أساور نشطة`}
        />
        {openCount > 0 && <Pill alert icon="megaphone-outline" text={openCount === 1 ? 'بلاغ مفتوح' : `${openCount} بلاغات مفتوحة`} />}
        {(warnAny || !!sos) && !openCount && <Pill alert icon="warning-outline" text="تنبيه" />}
      </Header>

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {/* Emergency */}
        {!!sos && (
          <View style={s.sos}>
            <View style={s.sosIcon}>
              <Ionicons name="alert" size={30} color={C.danger} />
            </View>
            <Text style={s.sosTitle}>{sos.kind === 'FALL' ? 'احتمال سقوط' : 'طلب مساعدة'}</Text>
            <Text style={s.sosText}>
              {sos.kind === 'FALL' ? `${sos.who} ما تحرك من فترة، تأكدوا منه` : `${sos.who} ضغط زر الطوارئ في السوار`}
            </Text>
            <Pressable style={s.sosBtn} onPress={dismissSos}>
              <Text style={s.sosBtnText}>تم الاستلام</Text>
            </Pressable>
          </View>
        )}

        {btOff && <Banner tone="danger" icon="bluetooth" text="شغّلي البلوتوث عشان نتابع الأساور" />}

        {screen?.kind === 'lost' && screenMember && (
          <LostScreen
            name={screenMember.name}
            initial={screenMember.description}
            onSend={(d, photo) => sendReport(screenMember, 'lost', d, photo)}
            onCancel={() => setScreen(null)}
          />
        )}
        {screen?.kind === 'found' && screenMember && (
          <FoundScreen name={screenMember.name} onConfirm={() => confirmFound(screenMember.id)} onCancel={() => setScreen(null)} />
        )}

        {!screen && tab === 'home' && (
          <>
            <Text style={ui.sectionTitle}>أفراد العائلة</Text>

            {justFound && (
              <Banner
                tone="safe"
                icon="checkmark-circle"
                text={`الحمد لله على سلامة ${justFound}، انقفل البلاغ وانحذفت بياناته`}
                onPress={() => setJustFound(null)}
              />
            )}

            {editing && renderForm()}
            {members.map(renderMember)}

            {!editing && (
              <Button
                label="أضف فردًا آخر"
                icon="person-add-outline"
                kind="ghost"
                onPress={() => {
                  setDraft(EMPTY);
                  setEditing('new');
                }}
                style={{ marginBottom: 14 }}
              />
            )}

            {/* Quick actions */}
            <Text style={ui.caption}>إجراءات سريعة</Text>
            <View style={s.actions}>
              <Pressable style={s.action} onPress={() => setTab('map')}>
                <Ionicons name="location-outline" size={18} color={C.primary} />
                <Text style={s.actionText}>خريطة العائلة</Text>
              </Pressable>
              <Pressable style={s.action} onPress={() => setTab('alerts')}>
                <Ionicons name="notifications-outline" size={18} color={C.danger} />
                <Text style={s.actionText}>سجل التنبيهات</Text>
              </Pressable>
            </View>
          </>
        )}

        {!screen && tab === 'map' && (
          <>
            <Text style={ui.sectionTitle}>خريطة العائلة</Text>
            {renderMap(420)}
            {members.map((m) => {
              const l = liveOf(m);
              if (!l?.zone) return null;
              return (
                <Text key={m.id} style={s.mapNote}>
                  {l.zone === 'LOST' ? `${m.name}: آخر مرة كان ضمن ${l.radius} متر منك تقريبًا` : `${m.name} ضمن ${l.radius} متر منك تقريبًا`}
                </Text>
              );
            })}
          </>
        )}

        {!screen && tab === 'alerts' && (
          <>
            <Text style={ui.sectionTitle}>التنبيهات</Text>
            {log.length === 0 && <Text style={s.empty}>لا توجد تنبيهات بعد</Text>}
            {log.map((item, i) => (
              <View key={i} style={s.logRow}>
                <View style={[s.logDot, { backgroundColor: ZONE_UI[item.kind].color }]} />
                <Text style={[s.logLabel, { color: ZONE_UI[item.kind].color }]}>
                  {item.who ? `${item.who}: ` : ''}
                  {ZONE_UI[item.kind].label}
                </Text>
                <Text style={s.logTime}>{item.time}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <BottomNav
        active={tab}
        onChange={(t) => {
          setTab(t);
          setScreen(null);
        }}
        tabs={[
          { key: 'home', label: 'الرئيسية', icon: 'home-outline', dot: openCount > 0 },
          { key: 'map', label: 'الخريطة', icon: 'map-outline' },
          { key: 'alerts', label: 'التنبيهات', icon: 'notifications-outline' },
        ]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: 20, paddingBottom: 110 },

  memberRow: { flexDirection: 'row-reverse', gap: 12, alignItems: 'flex-start' },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  hint: { color: C.muted, fontSize: 12.5, textAlign: 'right', marginBottom: 10 },
  nearRow: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 10, marginBottom: 8,
  },
  nearMac: { color: C.primary, fontSize: 14, fontWeight: '700', textAlign: 'right', letterSpacing: 0.5 },
  nearSub: { color: C.faint, fontSize: 12, textAlign: 'right', marginTop: 2 },
  linkBtn: { backgroundColor: C.primary, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  linkText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  typedRow: { flexDirection: 'row-reverse', gap: 10, alignItems: 'stretch' },
  unlink: { color: C.accent, fontSize: 12.5, fontWeight: '700', textAlign: 'right', marginTop: 6 },
  memberActions: {
    flexDirection: 'row-reverse', gap: 18, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border,
  },
  smallBtn: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5 },
  smallBtnText: { fontSize: 13, fontWeight: '700' },
  stepRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 8 },
  stepText: { flex: 1, color: C.text, fontSize: 13.5, textAlign: 'right' },
  formTitle: { color: C.primary, fontSize: 16, fontWeight: '700', textAlign: 'right', marginBottom: 6 },
  label: { color: C.muted, fontSize: 12, fontWeight: '600', textAlign: 'right', marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E0DACE', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: C.text,
  },
  chips: { flexDirection: 'row-reverse', gap: 10 },
  chip: { flex: 1, borderWidth: 1.5, borderColor: '#E0DACE', borderRadius: 12, paddingVertical: 11, alignItems: 'center', backgroundColor: '#fff' },
  chipText: { color: C.text, fontSize: 14, fontWeight: '600' },
  nameRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  memberName: { color: C.primary, fontSize: 17, fontWeight: '700', textAlign: 'right' },
  memberRole: { color: C.muted, fontSize: 12.5, textAlign: 'right', marginTop: 2 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar: { width: 4, borderRadius: 2 },
  metaRow: { flexDirection: 'row-reverse', gap: 14, marginTop: 10, flexWrap: 'wrap' },
  meta: { flexDirection: 'row-reverse', alignItems: 'center', gap: 5 },
  metaText: { color: C.faint, fontSize: 12.5 },
  trend: { color: C.muted, fontSize: 12.5, textAlign: 'right', marginTop: 6 },

  actions: { flexDirection: 'row-reverse', gap: 12 },
  action: {
    flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 8,
    backgroundColor: C.card, borderWidth: 1.5, borderColor: C.border, borderRadius: 14, padding: 13,
  },
  actionText: { color: C.primary, fontSize: 13, fontWeight: '600' },

  techCard: { marginTop: 14, padding: 12, borderRadius: 14, backgroundColor: '#EEF5F4' },
  linkPanel: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border },
  formError: { color: C.danger, fontSize: 13, fontWeight: '600', textAlign: 'right', marginTop: 12 },
  techText: { color: C.primary, fontSize: 12, textAlign: 'right', marginBottom: 2 },

  sos: {
    backgroundColor: C.danger, borderRadius: 22, padding: 20, marginBottom: 16, alignItems: 'center',
    shadowColor: C.danger, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  sosIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  sosTitle: { color: '#fff', fontSize: 24, fontWeight: '700' },
  sosText: { color: '#FDECEA', fontSize: 14, marginTop: 4, textAlign: 'center' },
  sosBtn: { backgroundColor: '#fff', borderRadius: 14, paddingVertical: 11, paddingHorizontal: 34, marginTop: 14 },
  sosBtnText: { color: C.danger, fontSize: 16, fontWeight: '700' },

  mapBox: { width: '100%', borderRadius: 20, overflow: 'hidden', backgroundColor: '#E5E1D6', justifyContent: 'center', borderWidth: 1.5, borderColor: C.border },
  mapWait: { textAlign: 'center', color: C.muted },
  mapNote: { color: C.muted, fontSize: 14, textAlign: 'center', marginTop: 10 },

  empty: { color: C.faint, textAlign: 'center', marginTop: 30 },
  logRow: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 13, marginBottom: 8,
  },
  logDot: { width: 10, height: 10, borderRadius: 5 },
  logLabel: { flex: 1, fontSize: 14, fontWeight: '600', textAlign: 'right' },
  logTime: { color: C.faint, fontSize: 12 },

});
