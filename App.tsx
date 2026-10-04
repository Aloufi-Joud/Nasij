// Nasij: find the bracelet, measure signal, alert when it moves away
// Same logic as the tested laptop scanner (nasij_scanner.py)
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, Vibration, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BleManager, Device, State } from 'react-native-ble-plx';
import MapView, { Circle } from 'react-native-maps';
import * as Location from 'expo-location';

const manager = new BleManager();
// Linked bracelet number (MAC, printed under the QR on the back). Set in the app.
let linkedMac: string | null = null;
const LOST_AFTER_MS = 10000; // no packet for 10 s = signal lost
const WINDOW = 6;           // average the last 6 readings
const NEAR = -65;           // stronger than this = near
const FAR = -80;            // weaker than this = far
const HOLD_MS = 3000;       // a new state must last 3 s before we show it
const GAP = 4;              // extra margin needed to leave NEAR or FAR
const TX_AT_1M = -59;       // average signal at 1 metre (calibrate with the laptop scanner)
const PATH_LOSS = 2.5;      // how fast the signal fades (2 = open air, 3 = crowded)

type Zone = 'NEAR' | 'MEDIUM' | 'FAR' | 'LOST';
type LogKind = Zone | 'SOS';
type Trend = 'approaching' | 'away' | 'steady';
type Reading = { id: string; rssi: number; smooth: number; trend: Trend; lastSeen: number };

// Colors from the original prototype
const C = {
  primary: '#0E3F3C',
  accent: '#5E8C85',
  mint: '#A8C8C4',
  bg: '#F4F4E9',
  card: '#FFFFFF',
  border: '#E8E4D8',
  text: '#1A1A1A',
  muted: '#6B7280',
  faint: '#9CA3AF',
  safe: '#1B6B3A',
  warn: '#D4841A',
  danger: '#C0392B',
  warnBg: '#FFF8E6',
  warnBorder: '#F0D080',
  dangerBg: '#FDECEA',
};

// The person wearing the bracelet, entered by the family in the app
type Kind = 'child' | 'elder';
type Member = { name: string; kind: Kind; age: string };
const KIND_UI: Record<Kind, { label: string; color: string }> = {
  child: { label: 'طفل', color: '#D4A574' },
  elder: { label: 'كبير سن', color: '#7B8EC8' },
};

const ZONE_UI: Record<LogKind, { label: string; color: string }> = {
  SOS: { label: 'طلب مساعدة', color: C.danger },
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

function toBytes(b64: string) {
  return Array.from(atob(b64), (c) => c.charCodeAt(0));
}
function toHex(bytes: number[]) {
  return bytes.map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// Phone-side IDs of devices already confirmed as our bracelet
const knownIds = new Set<string>();

// Any MOKO bracelet nearby: service data EA00 (scan response), last 6 bytes = its MAC
function braceletMac(device: Device): string | null {
  for (const [uuid, b64] of Object.entries(device.serviceData ?? {})) {
    if (!b64 || !uuid.toLowerCase().includes('ea00')) continue;
    const b = toBytes(b64);
    if (b.length >= 6) return toHex(b.slice(-6));
  }
  return null;
}

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

// Bracelet number as printed: 12 hex characters
function cleanMac(text: string) {
  return text.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 12);
}

// MOKO alarm info (service data FEE0): frame type, status flag, trigger count
// Frame 0x21 = double press slot. Status bit1 = alarm triggered.
function parseAlarm(device: Device) {
  for (const [uuid, b64] of Object.entries(device.serviceData ?? {})) {
    if (!b64 || !uuid.toLowerCase().includes('fee0')) continue;
    const b = toBytes(b64);
    if (b.length < 4) continue;
    return { frame: b[0], triggered: (b[1] & 0x02) !== 0, count: (b[2] << 8) | b[3] };
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

function avg(list: number[]) {
  return list.reduce((a, b) => a + b, 0) / list.length;
}

export default function App() {
  const [bt, setBt] = useState<string>('');
  const [reading, setReading] = useState<Reading | null>(null);
  const [zone, setZone] = useState<Zone | null>(null);
  const [log, setLog] = useState<{ time: string; zone: LogKind }[]>([]);
  const [sos, setSos] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const [member, setMember] = useState<Member | null>(null);
  const [editing, setEditing] = useState(true);
  const [draft, setDraft] = useState<Member>({ name: '', kind: 'child', age: '' });
  const [mac, setMac] = useState<string | null>(null);
  const [typedMac, setTypedMac] = useState('');
  const nearby = useRef<Record<string, { rssi: number; seen: number }>>({});
  const alarm = useRef<{ triggered: boolean; count: number } | null>(null);
  const lastCount = useRef<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [me, setMe] = useState<{ latitude: number; longitude: number } | null>(null);
  const lastRadius = useRef(10);

  const latest = useRef<Reading | null>(null);
  const sosRef = useRef(false);
  const wasTriggered = useRef(false);
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
        (pos) => setMe({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      );
    })();
    return () => watch?.remove();
  }, []);

  useEffect(() => {
    const sub = manager.onStateChange((state) => {
      setBt(state);
      if (state !== State.PoweredOn) return;
      manager.startDeviceScan(null, { allowDuplicates: true }, (error, device) => {
        if (error || !device || device.rssi == null) return;
        // Remember nearby bracelets for the link screen
        const mac = braceletMac(device);
        if (mac) nearby.current[mac] = { rssi: device.rssi, seen: Date.now() };

        const id = identify(device);
        if (!id) return;
        const a = parseAlarm(device);
        if (a && a.frame === 0x21) alarm.current = { triggered: a.triggered, count: a.count };
        const t = Date.now();
        // Coming back after being lost: start the average fresh
        if (latest.current && t - latest.current.lastSeen > LOST_AFTER_MS) history.current = [];
        history.current = [...history.current, device.rssi].slice(-WINDOW);
        const full = avg(history.current);
        const diff = avg(history.current.slice(-3)) - full;
        latest.current = {
          id,
          rssi: device.rssi,
          smooth: Math.round(full),
          trend: diff > 3 ? 'approaching' : diff < -3 ? 'away' : 'steady',
          lastSeen: t,
        };
      });
    }, true);

    // Twice a second: decide the zone and refresh the screen
    const timer = setInterval(() => {
      const r = latest.current;
      const t = Date.now();
      setNow(t);
      setReading(r);
      if (!r) return;

      // Emergency: double press seen (alarm flag on, or the press count went up)
      // Alert only on a NEW press: the count goes up, or the alarm flag turns on.
      // The flag stays on for the whole alarm broadcast (30 s), so we ignore it
      // while it stays on, otherwise "تم الاستلام" would bring the alert right back.
      const a = alarm.current;
      if (a) {
        const firstSeen = lastCount.current === null;
        const newPress =
          (!firstSeen && a.count > (lastCount.current ?? 0)) ||
          (!firstSeen && a.triggered && !wasTriggered.current);
        lastCount.current = Math.max(a.count, lastCount.current ?? 0);
        wasTriggered.current = a.triggered;
        if (newPress && !sosRef.current) {
          sosRef.current = true;
          setSos(true);
          setLog((old) => [{ time: new Date().toLocaleTimeString(), zone: 'SOS' as LogKind }, ...old].slice(0, 20));
          Vibration.vibrate([0, 800, 300, 800, 300, 800]);
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
      sub.remove();
      manager.stopDeviceScan();
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
  const warn = zone === 'MEDIUM' || zone === 'FAR' || lost;

  const who = member?.name || 'الفرد';
  const memberColor = member ? KIND_UI[member.kind].color : C.faint;
  const memberRole = member
    ? `${KIND_UI[member.kind].label}${member.age ? ` · ${member.age} سنة` : ''}`
    : '';

  const saveDraft = () => {
    if (!draft.name.trim()) return;
    setMember({ ...draft, name: draft.name.trim() });
    setEditing(false);
  };

  const link = (m: string) => {
    linkedMac = m;
    knownIds.clear();
    history.current = [];
    latest.current = null;
    alarm.current = null;
    lastCount.current = null;
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

  // Bracelets heard in the last 5 s, strongest (closest) first
  const nearbyList = Object.entries(nearby.current)
    .filter(([, v]) => now - v.seen < 5000)
    .sort((a, b) => b[1].rssi - a[1].rssi)
    .slice(0, 4);

  const dismissSos = () => {
    sosRef.current = false;
    setSos(false);
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

  return (
    <View style={s.screen}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.headerSub}>نسيج</Text>
            <Text style={s.headerTitle}>عائلتي</Text>
          </View>
          <Pressable style={s.bellBtn} onPress={() => setTab('alerts')}>
            <Ionicons name="notifications-outline" size={22} color="#fff" />
            {log.length > 0 && (
              <View style={s.bellDot}>
                <Text style={s.bellDotText}>{Math.min(log.length, 9)}</Text>
              </View>
            )}
          </Pressable>
        </View>

        <View style={s.pills}>
          <View style={s.pill}>
            <View style={[s.dot, { backgroundColor: reading && !lost ? C.mint : C.faint }]} />
            <Text style={s.pillText}>{reading && !lost ? 'سوار واحد نشط' : 'لا يوجد سوار نشط'}</Text>
          </View>
          {(warn || sos) && (
            <View style={[s.pill, { backgroundColor: 'rgba(212,132,26,0.25)' }]}>
              <Ionicons name="warning-outline" size={14} color="#FFC857" />
              <Text style={[s.pillText, { color: '#FFC857', fontWeight: '700' }]}>تنبيه</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={s.body}>
        {/* Emergency */}
        {sos && (
          <View style={s.sos}>
            <View style={s.sosIcon}>
              <Ionicons name="alert" size={30} color={C.danger} />
            </View>
            <Text style={s.sosTitle}>طلب مساعدة</Text>
            <Text style={s.sosText}>{who} ضغط زر الطوارئ في السوار</Text>
            <Pressable style={s.sosBtn} onPress={dismissSos}>
              <Text style={s.sosBtnText}>تم الاستلام</Text>
            </Pressable>
          </View>
        )}

        {btOff && (
          <View style={[s.strip, { backgroundColor: C.dangerBg }]}>
            <Ionicons name="bluetooth" size={16} color={C.danger} />
            <Text style={[s.stripText, { color: C.danger }]}>شغّلي البلوتوث عشان نتابع السوار</Text>
          </View>
        )}

        {tab === 'home' && (
          <>
            <Text style={s.sectionTitle}>أفراد العائلة</Text>

            {editing && (
              <View style={[s.card, { marginBottom: 14 }]}>
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
                  onChangeText={(age) => setDraft({ ...draft, age: age.replace(/[^0-9٠-٩]/g, '') })}
                  placeholder="مثلًا: ٨"
                  placeholderTextColor={C.faint}
                  keyboardType="number-pad"
                  textAlign="right"
                />

                <Pressable style={[s.saveBtn, !draft.name.trim() && { opacity: 0.4 }]} onPress={saveDraft}>
                  <Text style={s.saveText}>حفظ</Text>
                </Pressable>
              </View>
            )}

            {!mac && (
              <View style={[s.card, { marginBottom: 14 }]}>
                <Text style={s.formTitle}>ربط السوار</Text>
                <Text style={s.hint}>قرّبي السوار من الجوال، وبيطلع أول القائمة</Text>

                {nearbyList.length === 0 && <Text style={s.empty}>جاري البحث عن أساور قريبة...</Text>}
                {nearbyList.map(([m, v], i) => (
                  <View key={m} style={s.nearRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.nearMac}>{m}</Text>
                      <Text style={s.nearSub}>{i === 0 ? 'الأقرب' : 'قريب'} · الإشارة {v.rssi}</Text>
                    </View>
                    <Pressable style={s.linkBtn} onPress={() => link(m)}>
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
                    onPress={() => typedMac.length === 12 && link(typedMac)}
                  >
                    <Text style={s.linkText}>ربط</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Member card */}
            <View
              style={[
                s.card,
                warn && { borderColor: lost || zone === 'FAR' ? '#F5A5A0' : C.warnBorder },
              ]}
            >
              {zone === 'MEDIUM' || zone === 'FAR' ? (
                <View style={[s.strip, { backgroundColor: C.warnBg }]}>
                  <Ionicons name="warning-outline" size={14} color={C.warn} />
                  <Text style={[s.stripText, { color: C.warn }]}>الإشارة تضعف، {who} يبتعد عنك</Text>
                </View>
              ) : null}
              {lost && (
                <View style={[s.strip, { backgroundColor: C.dangerBg }]}>
                  <Ionicons name="close-circle-outline" size={14} color={C.danger} />
                  <Text style={[s.stripText, { color: C.danger }]}>انقطعت الإشارة عن السوار</Text>
                </View>
              )}

              <View style={s.memberRow}>
                <View style={[s.avatar, { backgroundColor: memberColor }]}>
                  <Text style={s.avatarText}>{who[0]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={s.nameRow}>
                    <View style={s.nameWrap}>
                      <Text style={s.memberName}>{who}</Text>
                      <Pressable
                        hitSlop={10}
                        onPress={() => {
                          if (member) setDraft(member);
                          setEditing(true);
                        }}
                      >
                        <Ionicons name="create-outline" size={16} color={C.accent} />
                      </Pressable>
                    </View>
                    <View style={s.bars}>
                      {[1, 2, 3, 4].map((i) => (
                        <View
                          key={i}
                          style={[
                            s.bar,
                            {
                              height: 4 + i * 4,
                              backgroundColor:
                                i <= strength ? (strength <= 1 ? C.danger : strength <= 2 ? C.warn : C.accent) : '#D4CFC4',
                            },
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                  {!!memberRole && <Text style={s.memberRole}>{memberRole}</Text>}

                  <View style={s.metaRow}>
                    <View style={s.meta}>
                      <View style={[s.dot, { backgroundColor: zoneUi?.color ?? C.faint }]} />
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
            </View>

            {/* Quick actions */}
            <Text style={s.caption}>إجراءات سريعة</Text>
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

        {tab === 'map' && (
          <>
            <Text style={s.sectionTitle}>خريطة العائلة</Text>
            {renderMap(420)}
            {!!mapNote && <Text style={s.mapNote}>{mapNote}</Text>}
          </>
        )}

        {tab === 'alerts' && (
          <>
            <Text style={s.sectionTitle}>التنبيهات</Text>
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

      {/* Bottom nav */}
      <View style={s.nav}>
        {(
          [
            { key: 'home', label: 'الرئيسية', icon: 'home-outline' },
            { key: 'map', label: 'الخريطة', icon: 'map-outline' },
            { key: 'alerts', label: 'التنبيهات', icon: 'notifications-outline' },
          ] as const
        ).map((t) => (
          <Pressable key={t.key} style={s.navItem} onPress={() => setTab(t.key)}>
            <Ionicons name={t.icon} size={22} color={tab === t.key ? C.primary : C.faint} />
            <Text style={[s.navText, { color: tab === t.key ? C.primary : C.faint }]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  header: {
    backgroundColor: C.primary,
    paddingTop: 64,
    paddingBottom: 18,
    paddingHorizontal: 22,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  headerSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'right' },
  headerTitle: { color: '#fff', fontSize: 24, fontWeight: '700', textAlign: 'right' },
  bellBtn: { padding: 9, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)' },
  bellDot: {
    position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: 9,
    backgroundColor: C.danger, borderWidth: 2, borderColor: C.primary, alignItems: 'center', justifyContent: 'center',
  },
  bellDotText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  pills: { flexDirection: 'row-reverse', gap: 10, marginTop: 16 },
  pill: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12,
  },
  pillText: { color: '#fff', fontSize: 12, fontWeight: '500' },
  dot: { width: 9, height: 9, borderRadius: 5 },

  body: { padding: 20, paddingBottom: 110 },
  sectionTitle: { color: C.primary, fontSize: 17, fontWeight: '700', textAlign: 'right', marginBottom: 12 },
  caption: { color: C.faint, fontSize: 12, fontWeight: '700', textAlign: 'right', marginTop: 22, marginBottom: 10 },

  card: {
    backgroundColor: C.card, borderRadius: 18, padding: 16, borderWidth: 1.5, borderColor: C.border,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
  },
  strip: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
    borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10, marginBottom: 12,
  },
  stripText: { fontSize: 12.5, fontWeight: '600', textAlign: 'right', flexShrink: 1 },
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
  nameWrap: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  formTitle: { color: C.primary, fontSize: 16, fontWeight: '700', textAlign: 'right', marginBottom: 6 },
  label: { color: C.muted, fontSize: 12, fontWeight: '600', textAlign: 'right', marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E0DACE', borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14, fontSize: 15, color: C.text,
  },
  chips: { flexDirection: 'row-reverse', gap: 10 },
  chip: { flex: 1, borderWidth: 1.5, borderColor: '#E0DACE', borderRadius: 12, paddingVertical: 11, alignItems: 'center', backgroundColor: '#fff' },
  chipText: { color: C.text, fontSize: 14, fontWeight: '600' },
  saveBtn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 18 },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
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

  nav: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row-reverse', justifyContent: 'space-around',
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, paddingBottom: 30,
  },
  navItem: { alignItems: 'center', gap: 3, minWidth: 70 },
  navText: { fontSize: 11, fontWeight: '600' },
});
