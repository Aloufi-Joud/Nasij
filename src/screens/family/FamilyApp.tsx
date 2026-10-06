// Nasij family app: find the bracelet, measure signal, alert when it moves away
// Same logic as the tested laptop scanner (nasij_scanner.py)
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { State, type Device } from 'react-native-ble-plx';
import MapView, { Circle } from 'react-native-maps';
import * as Location from 'expo-location';
import { C, ui } from '../../theme';
import type { Kind, Point, Report } from '../../mock';
import { metresBetween } from '../../components/geo';
import { PAIR_RSSI, newPairing, pairStep, type Pairing } from '../../ble/pairing';
import { listen, onBluetoothState } from '../../ble/scanner';
import { LOST_AFTER_MS, WINDOW, braceletMac, cleanMac, parseAlarm, summarize, type Trend } from '../../ble/signal';
import { Banner } from '../../components/Banner';
import { BottomNav } from '../../components/BottomNav';
import { Button } from '../../components/Button';
import { Header, HeaderButton, Pill } from '../../components/Header';
import { latinDigits } from '../../components/digits';
import FoundScreen from './FoundScreen';
import LostScreen from './LostScreen';

// Linked bracelet number (MAC, printed under the QR on the back). Set in the app.
let linkedMac: string | null = null;
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
type PairView = { mac: string; heard: boolean; near: boolean; timedOut: boolean };
type AlertKind = 'SOS' | 'FALL';
type Reading = { id: string; rssi: number; smooth: number; trend: Trend; lastSeen: number };

// The person wearing the bracelet, entered by the family in the app
// ponytail: local form shape (age as text, health as two fields); becomes mock.ts Member with Firebase
type Member = { name: string; kind: Kind; age: string; condition: string; notes: string };
const EMPTY: Member = { name: '', kind: 'child', age: '', condition: '', notes: '' };
const KIND_UI: Record<Kind, { label: string; color: string }> = {
  child: { label: 'طفل', color: C.child },
  elder: { label: 'كبير سن', color: C.elder },
};

const ZONE_UI: Record<LogKind, { label: string; color: string }> = {
  SOS: { label: 'طلب مساعدة', color: C.danger },
  FALL: { label: 'احتمال سقوط', color: C.danger },
  REPORT: { label: 'بلاغ ضياع للمتطوعين', color: C.danger },
  FOUND: { label: 'تم العثور عليه وانقفل البلاغ', color: C.safe },
  EDGE: { label: 'قرب حدود الفعالية', color: C.danger },
  NEAR: { label: 'قريب منك', color: C.safe },
  MEDIUM: { label: 'مسافة متوسطة', color: C.warn },
  FAR: { label: 'بعيد عنك', color: C.danger },
  LOST: { label: 'انقطعت الإشارة', color: C.danger },
};
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

// Phone-side IDs of devices already confirmed as our bracelet
const knownIds = new Set<string>();

// Returns the linked bracelet's number, or null if this is not it
function identify(device: Device): string | null {
  if (!linkedMac) return null;
  if (knownIds.has(device.id)) return linkedMac;
  if (braceletMac(device) === linkedMac) {
    knownIds.add(device.id);
    return linkedMac;
  }
  return null;
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
type Screen = 'lost' | 'found' | null;

export default function FamilyApp({ onSwitchRole }: { onSwitchRole: () => void }) {
  const [bt, setBt] = useState<string>('');
  const [reading, setReading] = useState<Reading | null>(null);
  const [zone, setZone] = useState<Zone | null>(null);
  const [log, setLog] = useState<{ time: string; zone: LogKind }[]>([]);
  const [sos, setSos] = useState<AlertKind | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [member, setMember] = useState<Member | null>(null);
  const [editing, setEditing] = useState(true);
  const [draft, setDraft] = useState<Member>(EMPTY);
  // Open "my child is lost" report. Phase 2: lives in Firestore.
  const [report, setReport] = useState<Report | null>(null);
  const [screen, setScreen] = useState<Screen>(null);
  const [justFound, setJustFound] = useState(false);
  const [mac, setMac] = useState<string | null>(null);
  const [typedMac, setTypedMac] = useState('');
  const nearby = useRef<Record<string, { rssi: number; seen: number }>>({});
  // Latest alarm info per bracelet slot: 0x21 = double press, 0x23 = no movement (possible fall)
  const alarm = useRef<Record<number, { triggered: boolean; count: number }>>({});
  const lastCount = useRef<Record<number, number>>({});
  const [now, setNow] = useState(Date.now());
  const [me, setMe] = useState<Point | null>(null);
  const [eventCenter, setEventCenter] = useState<Point | null>(null);
  const lastRadius = useRef(10);
  const pairing = useRef<Pairing | null>(null);
  const [pairView, setPairView] = useState<PairView | null>(null);

  const latest = useRef<Reading | null>(null);
  const sosRef = useRef(false);
  const wasTriggered = useRef<Record<number, boolean>>({});
  const history = useRef<number[]>([]);
  const zoneRef = useRef<Zone | null>(null);
  const candidate = useRef<{ zone: Zone | null; since: number }>({ zone: null, since: 0 });

  // Parent's own location (the circle is drawn around it)
  useEffect(() => {
    let watch: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      watch = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 1 },
        (pos) => {
          const p = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          setMe(p);
          setEventCenter((c) => c ?? p);
        },
      );
    })();
    return () => watch?.remove();
  }, []);

  useEffect(() => {
    const stopState = onBluetoothState(setBt);
    const stopScan = listen((device) => {
      if (device.rssi == null) return;
      // Remember nearby bracelets for the link screen
      const mac = braceletMac(device);
      if (mac) nearby.current[mac] = { rssi: device.rssi, seen: Date.now() };

      // Linking: wait for a new double press from that bracelet while it is held close
      if (pairing.current) pairStep(pairing.current, device.id, mac, device.rssi, parseAlarm(device));

      const id = identify(device);
      if (!id) return;
      const a = parseAlarm(device);
      if (a && (a.frame === 0x21 || a.frame === 0x23)) alarm.current[a.frame] = { triggered: a.triggered, count: a.count };
      const t = Date.now();
      // Coming back after being lost: start the average fresh
      if (latest.current && t - latest.current.lastSeen > LOST_AFTER_MS) history.current = [];
      history.current = [...history.current, device.rssi].slice(-WINDOW);
      latest.current = { id, rssi: device.rssi, ...summarize(history.current), lastSeen: t };
    });

    // Twice a second: decide the zone and refresh the screen
    const timer = setInterval(() => {
      const r = latest.current;
      const t = Date.now();
      setNow(t);
      setReading(r);

      const p = pairing.current;
      if (p?.pressed) {
        pairing.current = null;
        setPairView(null);
        link(p.mac);
      } else if (p) {
        setPairView({
          mac: p.mac,
          heard: p.rssi !== null,
          near: p.rssi !== null && p.rssi >= PAIR_RSSI,
          timedOut: t - p.since > PAIR_TIMEOUT_MS,
        });
      }

      if (!r) return;

      // Emergencies: 0x21 = double press, 0x23 = bracelet stopped moving (possible fall).
      // Alert only on a NEW event: the count goes up, or the alarm flag turns on.
      // The flag stays on for the whole alarm broadcast, so we ignore it while it
      // stays on, otherwise "تم الاستلام" would bring the alert right back.
      for (const [frame, kind] of [[0x21, 'SOS'], [0x23, 'FALL']] as const) {
        const a = alarm.current[frame];
        if (!a) continue;
        const prev = lastCount.current[frame];
        const firstSeen = prev === undefined;
        const isNew =
          (!firstSeen && a.count > prev) || (!firstSeen && a.triggered && !wasTriggered.current[frame]);
        lastCount.current[frame] = Math.max(a.count, prev ?? 0);
        wasTriggered.current[frame] = a.triggered;
        if (!isNew) continue;
        // Always log it, even if another alert is already on screen
        setLog((old) => [{ time: new Date().toLocaleTimeString(), zone: kind as LogKind }, ...old].slice(0, 20));
        Vibration.vibrate([0, 800, 300, 800, 300, 800]);
        if (!sosRef.current) {
          sosRef.current = true;
          setSos(kind);
        }
      }

      const raw = getZone(t - r.lastSeen, r.smooth, zoneRef.current);
      if (raw !== candidate.current.zone) candidate.current = { zone: raw, since: t };
      const confirmed =
        zoneRef.current === null || raw === 'LOST' || t - candidate.current.since >= HOLD_MS
          ? raw
          : zoneRef.current;

      if (confirmed !== zoneRef.current) {
        zoneRef.current = confirmed;
        setZone(confirmed);
        setLog((old) => [{ time: new Date().toLocaleTimeString(), zone: confirmed }, ...old].slice(0, 20));
        if (confirmed === 'FAR' || confirmed === 'LOST') Vibration.vibrate([0, 500, 200, 500]);
      }
    }, 500);

    return () => {
      stopState();
      stopScan();
      clearInterval(timer);
    };
  }, []);

  const lost = zone === 'LOST';
  const zoneUi = zone ? ZONE_UI[zone] : null;
  const strength = reading && !lost ? bars(reading.smooth) : 0;
  // While lost, keep showing the last known circle
  if (reading && !lost) lastRadius.current = estimateMetres(reading.smooth);
  const radius = lastRadius.current;
  const ago = reading ? Math.round((now - reading.lastSeen) / 1000) : 0;
  const btOff = !!bt && bt !== State.PoweredOn;
  // Where the bracelet can be: within `radius` of the family. Warn when that circle reaches the event edge.
  const nearEdge = !!(reading && me && eventCenter && metresBetween(eventCenter, me) + radius > EVENT_RADIUS_M);
  const warn = zone === 'MEDIUM' || zone === 'FAR' || lost || nearEdge;

  const who = member?.name || 'الفرد';
  const memberColor = member ? KIND_UI[member.kind].color : C.faint;
  const memberRole = member
    ? `${KIND_UI[member.kind].label}${member.age ? ` · ${member.age} سنة` : ''}`
    : '';

  const saveDraft = () => {
    if (!draft.name.trim()) return;
    setMember({ ...draft, name: draft.name.trim(), condition: draft.condition.trim(), notes: draft.notes.trim() });
    setEditing(false);
  };

  const addLog = (kind: LogKind) =>
    setLog((old) => [{ time: new Date().toLocaleTimeString(), zone: kind }, ...old].slice(0, 20));

  // Log and vibrate once each time the bracelet reaches the event edge
  useEffect(() => {
    if (!nearEdge) return;
    addLog('EDGE');
    Vibration.vibrate([0, 500, 200, 500]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearEdge]);

  // Phase 2: create the report in Firestore; volunteers near the bracelet get temporary access
  const sendLost = (description: string, photo: string | null) => {
    if (!member) return;
    setReport({
      id: `r${Date.now()}`,
      type: 'lost',
      braceletId: mac ?? '',
      member: { name: member.name, kind: member.kind, age: Number(member.age) || 0 },
      photo,
      description,
      health: member.condition ? { condition: member.condition, notes: member.notes } : null,
      area: 'قرب موقع العائلة',
      location: me,
      createdAt: Date.now(),
      status: 'open',
      assignedVolunteerId: null,
      closedAs: null,
      closedAt: null,
    });
    setScreen(null);
    setJustFound(false);
    addLog('REPORT');
  };

  // Phase 2: the backend close function also deletes access, photo and health data
  const confirmFound = () => {
    setReport(null);
    setScreen(null);
    setJustFound(true);
    addLog('FOUND');
  };

  const link = (m: string) => {
    linkedMac = m;
    knownIds.clear();
    history.current = [];
    latest.current = null;
    alarm.current = {};
    lastCount.current = {};
    wasTriggered.current = {};
    zoneRef.current = null;
    setZone(null);
    setReading(null);
    setMac(m);
    setTypedMac('');
  };
  const unlink = () => {
    linkedMac = null;
    knownIds.clear();
    latest.current = null;
    zoneRef.current = null;
    setZone(null);
    setReading(null);
    setMac(null);
  };

  // Linking starts here: the bracelet is linked only after the press check passes
  const startPair = (m: string) => {
    pairing.current = newPairing(m, Date.now());
    setPairView({ mac: m, heard: false, near: false, timedOut: false });
    setTypedMac('');
  };
  const cancelPair = () => {
    pairing.current = null;
    setPairView(null);
  };

  // Delete the member completely: details, health, bracelet link and any open report.
  // Phase 2: also deletes the member and the bracelet link in Firestore.
  const removeMember = () =>
    Alert.alert(`حذف ${who}؟`, 'بتنحذف بياناته وحالته الصحية، وينفك ربط السوار، وينقفل أي بلاغ مفتوح.', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: () => {
          unlink();
          cancelPair();
          setMember(null);
          setDraft(EMPTY);
          setEditing(true);
          setReport(null);
          setScreen(null);
          setJustFound(false);
        },
      },
    ]);

  // Bracelets heard in the last 5 s, strongest (closest) first
  const nearbyList = Object.entries(nearby.current)
    .filter(([, v]) => now - v.seen < 5000)
    .sort((a, b) => b[1].rssi - a[1].rssi)
    .slice(0, 4);

  const dismissSos = () => {
    sosRef.current = false;
    setSos(null);
    Vibration.cancel();
  };

  const mapNote = zone
    ? lost
      ? `آخر مرة كان ضمن ${radius} متر منك تقريبًا`
      : `${who} ضمن ${radius} متر منك تقريبًا`
    : '';

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
          {zone && (
            <Circle
              center={me}
              radius={radius}
              strokeColor={ZONE_UI[zone].color}
              strokeWidth={2}
              fillColor={CIRCLE_FILL[zone]}
            />
          )}
        </MapView>
      ) : (
        <Text style={s.mapWait}>جاري تحديد موقعك...</Text>
      )}
    </View>
  );

  const openReport = !!report;

  return (
    <View style={s.screen}>
      <Header
        sub="نسيج"
        title="عائلتي"
        actions={
          <>
            <HeaderButton icon="notifications-outline" label="التنبيهات" badge={log.length} onPress={() => setTab('alerts')} />
            <HeaderButton icon="swap-horizontal" label="تبديل إلى متطوع" onPress={onSwitchRole} />
          </>
        }
      >
        <Pill dot={reading && !lost ? C.mint : C.faint} text={reading && !lost ? 'سوار واحد نشط' : 'لا يوجد سوار نشط'} />
        {report && <Pill alert icon="megaphone-outline" text={`بلاغ مفتوح: ${report.member.name}`} />}
        {(warn || !!sos) && !report && <Pill alert icon="warning-outline" text="تنبيه" />}
      </Header>

      <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {/* Emergency */}
        {!!sos && (
          <View style={s.sos}>
            <View style={s.sosIcon}>
              <Ionicons name="alert" size={30} color={C.danger} />
            </View>
            <Text style={s.sosTitle}>{sos === 'FALL' ? 'احتمال سقوط' : 'طلب مساعدة'}</Text>
            <Text style={s.sosText}>
              {sos === 'FALL' ? `${who} ما تحرك من فترة، تأكدوا منه` : `${who} ضغط زر الطوارئ في السوار`}
            </Text>
            <Pressable style={s.sosBtn} onPress={dismissSos}>
              <Text style={s.sosBtnText}>تم الاستلام</Text>
            </Pressable>
          </View>
        )}

        {btOff && <Banner tone="danger" icon="bluetooth" text="شغّلي البلوتوث عشان نتابع السوار" />}

        {screen === 'lost' && member && (
          <LostScreen name={member.name} onSend={sendLost} onCancel={() => setScreen(null)} />
        )}
        {screen === 'found' && report && (
          <FoundScreen name={report.member.name} onConfirm={confirmFound} onCancel={() => setScreen(null)} />
        )}

        {!screen && tab === 'home' && (
          <>
            <Text style={ui.sectionTitle}>أفراد العائلة</Text>

            {justFound && (
              <Banner
                tone="safe"
                icon="checkmark-circle"
                text="الحمد لله على السلامة، انقفل البلاغ وانحذفت بياناته"
                onPress={() => setJustFound(false)}
              />
            )}

            {editing && (
              <View style={[ui.card, { marginBottom: 14 }]}>
                <Text style={s.formTitle}>{member ? 'تعديل بيانات الفرد' : 'أضف فردًا من العائلة'}</Text>

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
                <View style={s.chips}>
                  {(['child', 'elder'] as Kind[]).map((k) => (
                    <Pressable
                      key={k}
                      onPress={() => setDraft({ ...draft, kind: k })}
                      style={[s.chip, draft.kind === k && { backgroundColor: C.primary, borderColor: C.primary }]}
                    >
                      <Text style={[s.chipText, draft.kind === k && { color: '#fff' }]}>{KIND_UI[k].label}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={s.label}>العمر</Text>
                <TextInput
                  style={s.input}
                  value={draft.age}
                  onChangeText={(age) => setDraft({ ...draft, age: latinDigits(age).slice(0, 3) })}
                  placeholder="مثلًا: 8"
                  placeholderTextColor={C.faint}
                  keyboardType="number-pad"
                  textAlign="right"
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

                <Button label="حفظ" onPress={saveDraft} disabled={!draft.name.trim()} style={{ marginTop: 12 }} />
                {member && <Button label="إلغاء" kind="ghost" onPress={() => setEditing(false)} style={{ marginTop: 10 }} />}
              </View>
            )}

            {!mac && pairView && (
              <View style={[ui.card, { marginBottom: 14 }]}>
                <Text style={s.formTitle}>تأكيد السوار</Text>
                <Text style={s.hint}>عشان نتأكد إن السوار بيدك أنتِ، مو سوار شخص ثاني قريب منك</Text>
                <Text style={[s.nearMac, { textAlign: 'center', marginVertical: 8 }]}>{pairView.mac}</Text>

                <View style={s.stepRow}>
                  <Ionicons
                    name={pairView.near ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={pairView.near ? C.safe : C.faint}
                  />
                  <Text style={s.stepText}>١. قرّبي السوار من الجوال</Text>
                </View>
                <View style={s.stepRow}>
                  <Ionicons name="ellipse-outline" size={20} color={C.faint} />
                  <Text style={s.stepText}>٢. اضغطي زر السوار ضغطتين وهو قريب (بيصفّر، هذا طبيعي)</Text>
                </View>

                {!pairView.heard && <Text style={s.empty}>ما نسمع هذا السوار حاليًا، تأكدي من الرقم</Text>}
                {pairView.timedOut && (
                  <Banner
                    tone="warn"
                    icon="alert-circle-outline"
                    text="ما وصلنا ضغط من هذا السوار. تأكدي إنه نفس السوار اللي بيدك واضغطي مرة ثانية"
                  />
                )}
                <Button label="إلغاء" kind="ghost" onPress={cancelPair} style={{ marginTop: 12 }} />
              </View>
            )}

            {!mac && !pairView && (
              <View style={[ui.card, { marginBottom: 14 }]}>
                <Text style={s.formTitle}>ربط السوار</Text>
                <Text style={s.hint}>قرّبي السوار من الجوال، وبيطلع أول القائمة</Text>

                {nearbyList.length === 0 && <Text style={s.empty}>جاري البحث عن أساور قريبة...</Text>}
                {nearbyList.map(([m, v], i) => (
                  <View key={m} style={s.nearRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.nearMac}>{m}</Text>
                      <Text style={s.nearSub}>{i === 0 ? 'الأقرب' : 'قريب'} · الإشارة {v.rssi}</Text>
                    </View>
                    <Pressable style={s.linkBtn} onPress={() => startPair(m)}>
                      <Text style={s.linkText}>ربط</Text>
                    </Pressable>
                  </View>
                ))}

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
                    onPress={() => typedMac.length === 12 && startPair(typedMac)}
                  >
                    <Text style={s.linkText}>ربط</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Member card */}
            <View style={[ui.card, warn && { borderColor: lost || zone === 'FAR' || nearEdge ? C.dangerBorder : C.warnBorder }]}>
              {nearEdge && (
                <Banner tone="danger" icon="exit-outline" text={`${who} قريب من حدود الفعالية أو خارجها`} onPress={() => setTab('map')} />
              )}
              {(zone === 'MEDIUM' || zone === 'FAR') && (
                <Banner tone="warn" icon="warning-outline" text={`الإشارة تضعف، ${who} يبتعد عنك`} />
              )}
              {lost && <Banner tone="danger" icon="close-circle-outline" text="انقطعت الإشارة عن السوار" />}

              <View style={s.memberRow}>
                <View style={[s.avatar, { backgroundColor: memberColor }]}>
                  <Text style={s.avatarText}>{who[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={s.nameRow}>
                    <Text style={s.memberName}>{who}</Text>
                    <View style={s.bars}>
                      {[1, 2, 3, 4].map((i) => (
                        <View
                          key={i}
                          style={[
                            s.bar,
                            {
                              height: 4 + i * 4,
                              backgroundColor:
                                i <= strength ? (strength <= 1 ? C.danger : strength <= 2 ? C.warn : C.accent) : C.barOff,
                            },
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                  {!!memberRole && <Text style={s.memberRole}>{memberRole}</Text>}
                  {!!member?.condition && (
                    <View style={[s.meta, { marginTop: 4 }]}>
                      <Ionicons name="medkit-outline" size={12} color={C.muted} />
                      <Text style={s.metaText}>{member.condition}</Text>
                    </View>
                  )}

                  <View style={s.metaRow}>
                    <View style={s.meta}>
                      <View style={[ui.dot, { backgroundColor: zoneUi?.color ?? C.faint }]} />
                      <Text style={[s.metaText, { color: zoneUi?.color ?? C.faint, fontWeight: '600' }]}>
                        {zoneUi?.label ?? (mac ? 'جاري البحث عن السوار...' : 'لم يُربط سوار بعد')}
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
                      {TREND_UI[reading.trend]} · ضمن {radius} متر تقريبًا
                    </Text>
                  )}
                </View>
              </View>

              {member && !editing && (
                <View style={s.memberActions}>
                  <Pressable
                    style={s.smallBtn}
                    hitSlop={6}
                    onPress={() => {
                      setDraft(member);
                      setEditing(true);
                    }}
                  >
                    <Ionicons name="create-outline" size={15} color={C.accent} />
                    <Text style={[s.smallBtnText, { color: C.accent }]}>تعديل البيانات</Text>
                  </Pressable>
                  <Pressable style={s.smallBtn} hitSlop={6} onPress={removeMember}>
                    <Ionicons name="trash-outline" size={15} color={C.danger} />
                    <Text style={[s.smallBtnText, { color: C.danger }]}>حذف</Text>
                  </Pressable>
                </View>
              )}

              {/* Lost child: report it, or close the open report */}
              {member?.kind === 'child' && !report && (
                <Button
                  label={`${who} ضائع`}
                  icon="search"
                  kind="danger"
                  onPress={() => setScreen('lost')}
                  style={{ marginTop: 14 }}
                />
              )}
              {report && (
                <View style={{ marginTop: 14 }}>
                  <Banner tone="danger" icon="megaphone-outline" text="البلاغ وصل للمتطوعين القريبين، وهم يدورون الحين" />
                  <Button label="لقيناه" icon="checkmark-circle-outline" onPress={() => setScreen('found')} />
                </View>
              )}
            </View>

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

            {/* Technical details for the demo */}
            {mac && (
              <View style={s.techCard}>
                <Text style={s.techText}>رقم السوار: {mac}</Text>
                {reading && (
                  <Text style={s.techText}>
                    الإشارة الآن {reading.rssi} · المتوسط {reading.smooth}
                  </Text>
                )}
                <Pressable onPress={unlink} hitSlop={8}>
                  <Text style={s.unlink}>تغيير السوار</Text>
                </Pressable>
              </View>
            )}
          </>
        )}

        {!screen && tab === 'map' && (
          <>
            <Text style={ui.sectionTitle}>خريطة العائلة</Text>
            {renderMap(420)}
            {!!mapNote && <Text style={s.mapNote}>{mapNote}</Text>}
          </>
        )}

        {!screen && tab === 'alerts' && (
          <>
            <Text style={ui.sectionTitle}>التنبيهات</Text>
            {log.length === 0 && <Text style={s.empty}>لا توجد تنبيهات بعد</Text>}
            {log.map((item, i) => (
              <View key={i} style={s.logRow}>
                <View style={[s.logDot, { backgroundColor: ZONE_UI[item.zone].color }]} />
                <Text style={[s.logLabel, { color: ZONE_UI[item.zone].color }]}>{ZONE_UI[item.zone].label}</Text>
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
          { key: 'home', label: 'الرئيسية', icon: 'home-outline', dot: openReport },
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

  techCard: { marginTop: 18, padding: 12, borderRadius: 14, backgroundColor: '#EEF5F4' },
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
