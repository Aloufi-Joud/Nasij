// Nasij: find the bracelet, measure signal, alert when it moves away
// Same logic as the tested laptop scanner (nasij_scanner.py)
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, Vibration, View } from 'react-native';
import { BleManager, Device, State } from 'react-native-ble-plx';
import MapView, { Circle } from 'react-native-maps';
import * as Location from 'expo-location';

const manager = new BleManager();
const BRACELET_MAC = '785005002D12'; // MOKO W6R (printed under the QR on the back)
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

const ZONE_UI: Record<LogKind, { label: string; color: string }> = {
  SOS: { label: 'طلب مساعدة', color: '#B91C1C' },
  NEAR: { label: 'قريب', color: '#16A34A' },
  MEDIUM: { label: 'متوسط', color: '#D97706' },
  FAR: { label: 'بعيد', color: '#DC2626' },
  LOST: { label: 'انقطعت الإشارة', color: '#991B1B' },
};
const TREND_UI: Record<Trend, string> = {
  approaching: 'يقترب ⬆',
  away: 'يبتعد ⬇',
  steady: 'ثابت',
};

function toBytes(b64: string) {
  return Array.from(atob(b64), (c) => c.charCodeAt(0));
}
function toHex(bytes: number[]) {
  return bytes.map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// Phone-side IDs of devices already confirmed as our bracelet
const knownIds = new Set<string>();

// Returns the bracelet ID, or null if this is not our bracelet
function identify(device: Device): string | null {
  if (knownIds.has(device.id)) return BRACELET_MAC;
  // MOKO W6R: service data EA00 (scan response), last 6 bytes = its MAC
  for (const [uuid, b64] of Object.entries(device.serviceData ?? {})) {
    if (!b64 || !uuid.toLowerCase().includes('ea00')) continue;
    const b = toBytes(b64);
    if (b.length >= 6 && toHex(b.slice(-6)) === BRACELET_MAC) {
      knownIds.add(device.id);
      return BRACELET_MAC;
    }
  }
  // ESP32 stand-in: manufacturer data FF FF 'N' 'S' id status
  if (device.manufacturerData) {
    const b = toBytes(device.manufacturerData);
    if (b.length >= 6 && b[0] === 0xff && b[1] === 0xff && b[2] === 0x4e && b[3] === 0x53) {
      return `ESP-${b[4]}`;
    }
  }
  return null;
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
  NEAR: 'rgba(22,163,74,0.18)',
  MEDIUM: 'rgba(217,119,6,0.18)',
  FAR: 'rgba(220,38,38,0.18)',
  LOST: 'rgba(153,27,27,0.12)',
};

function avg(list: number[]) {
  return list.reduce((a, b) => a + b, 0) / list.length;
}

export default function App() {
  const [bt, setBt] = useState<string>('');
  const [reading, setReading] = useState<Reading | null>(null);
  const [zone, setZone] = useState<Zone | null>(null);
  const [log, setLog] = useState<{ time: string; zone: LogKind }[]>([]);
  const [sos, setSos] = useState(false);
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

  let label = 'جاري البحث عن السوار...';
  let color = '#9CA3AF';
  if (bt && bt !== State.PoweredOn) label = 'شغّلي البلوتوث';
  else if (zone) ({ label, color } = ZONE_UI[zone]);

  const lost = zone === 'LOST';
  const strength = reading && !lost ? Math.max(0, Math.min(1, (reading.smooth + 100) / 60)) : 0;
  // While lost, keep showing the last known circle
  if (reading && !lost) lastRadius.current = estimateMetres(reading.smooth);
  const radius = lastRadius.current;

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>نسيج</Text>

      {sos && (
        <View style={styles.sos}>
          <Text style={styles.sosTitle}>🆘 طلب مساعدة</Text>
          <Text style={styles.sosText}>ضغط زر الطوارئ في السوار مرتين</Text>
          <Pressable
            style={styles.sosBtn}
            onPress={() => {
              sosRef.current = false;
              setSos(false);
              Vibration.cancel();
            }}
          >
            <Text style={styles.sosBtnText}>تم الاستلام</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.mapBox}>
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
          <Text style={styles.mapWait}>جاري تحديد موقعك...</Text>
        )}
      </View>
      {zone && (
        <Text style={styles.mapNote}>
          {lost ? `آخر مرة كان ضمن ${radius} متر منك تقريبًا` : `طفلك ضمن ${radius} متر منك تقريبًا`}
        </Text>
      )}

      <View style={styles.card}>
        <Text style={[styles.status, { color }]}>{label}</Text>
        {reading && !lost && <Text style={styles.trend}>{TREND_UI[reading.trend]}</Text>}

        <View style={styles.barBg}>
          <View style={[styles.bar, { width: `${strength * 100}%`, backgroundColor: color }]} />
        </View>

        {reading && (
          <>
            <Text style={styles.row}>رقم السوار: {reading.id}</Text>
            <Text style={styles.row}>الإشارة الآن: {reading.rssi}</Text>
            <Text style={styles.row}>متوسط الإشارة: {reading.smooth}</Text>
            <Text style={styles.row}>آخر نداء قبل: {Math.round((now - reading.lastSeen) / 1000)} ث</Text>
          </>
        )}
      </View>

      <Text style={styles.logTitle}>سجل التغييرات</Text>
      <ScrollView style={styles.log}>
        {log.map((item, i) => (
          <Text key={i} style={[styles.logRow, { color: ZONE_UI[item.zone].color }]}>
            {item.time}   {ZONE_UI[item.zone].label}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F4F1EA', alignItems: 'center', paddingTop: 60, paddingHorizontal: 20 },
  title: { fontSize: 30, fontWeight: '700', color: '#1F4E4A', marginBottom: 12 },
  sos: { width: '100%', backgroundColor: '#B91C1C', borderRadius: 20, padding: 18, marginBottom: 12, alignItems: 'center' },
  sosTitle: { color: '#fff', fontSize: 28, fontWeight: '700' },
  sosText: { color: '#FEE2E2', fontSize: 16, marginTop: 4 },
  sosBtn: { backgroundColor: '#fff', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 28, marginTop: 12 },
  sosBtnText: { color: '#B91C1C', fontSize: 17, fontWeight: '700' },
  mapBox: { width: '100%', height: 260, borderRadius: 20, overflow: 'hidden', backgroundColor: '#E5E7EB', justifyContent: 'center' },
  mapWait: { textAlign: 'center', color: '#6B7280' },
  mapNote: { fontSize: 15, color: '#374151', marginTop: 8, marginBottom: 12 },
  card: { width: '100%', backgroundColor: '#fff', borderRadius: 20, padding: 20 },
  status: { fontSize: 30, fontWeight: '700', textAlign: 'center' },
  trend: { fontSize: 18, textAlign: 'center', color: '#4B5563', marginTop: 4 },
  barBg: { height: 14, backgroundColor: '#E5E7EB', borderRadius: 7, overflow: 'hidden', marginVertical: 14 },
  bar: { height: '100%', borderRadius: 7 },
  row: { fontSize: 17, textAlign: 'right', color: '#374151', marginBottom: 6 },
  logTitle: { alignSelf: 'flex-end', fontSize: 16, fontWeight: '700', color: '#1F4E4A', marginTop: 16, marginBottom: 6 },
  log: { width: '100%', flex: 1 },
  logRow: { fontSize: 15, textAlign: 'right', marginBottom: 4 },
});
