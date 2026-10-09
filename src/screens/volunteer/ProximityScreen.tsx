// Proximity: big "approaching / moving away" indicator and signal bars.
// Readings and direction come from src/ble (useBraceletSignal in VolunteerApp).
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import { Pressable } from '../../components/Motion';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { C, F, ui } from '../../theme';
import { place, tr } from '../../i18n';
import type { Report } from '../../mock';
import ReportPhoto from './ReportPhoto';
import { TYPE_UI, whoLine } from './labels';
import type { Signal, Trend } from '../../ble/signal';
import { bars, estimateMetres, zoneOf } from './signalView';

type Icon = ComponentProps<typeof Ionicons>['name'];
type Props = {
  report: Report;
  signal: Signal | null; // null = not heard yet
  now: number;
  onHealth: () => void;
  onClose: () => void;
};

const TREND_VIEW: Record<Trend, { label: string; hint: string; color: string; bg: string; icon: Icon }> = {
  approaching: { get label() { return tr('تقترب منه', 'Getting closer'); }, get hint() { return tr('استمر في نفس الاتجاه', 'Keep going this way'); }, color: C.safe, bg: C.safeBg, icon: 'arrow-up' },
  away: { get label() { return tr('تبتعد عنه', 'Moving away'); }, get hint() { return tr('ارجع للاتجاه اللي جيت منه', 'Go back the way you came'); }, color: C.danger, bg: C.dangerBg, icon: 'arrow-down' },
  steady: { get label() { return tr('المسافة ثابتة', 'Distance steady'); }, get hint() { return tr('جرّب تمشي باتجاه مختلف', 'Try a different direction'); }, color: C.accent, bg: C.techBg, icon: 'remove' },
};

export default function ProximityScreen({ report: r, signal, now, onHealth, onClose }: Props) {
  const zone = zoneOf(signal, now);
  const lost = zone === 'LOST';
  const heard = !!signal && !lost;
  const view = heard
    ? TREND_VIEW[signal.trend]
    : {
        label: lost ? tr('انقطعت الإشارة', 'Signal lost') : tr('لم يلتقط جوالك السوار بعد', 'Your phone hasn’t picked up the bracelet yet'),
        hint: lost ? tr('ارجع لآخر مكان التقطت فيه الإشارة', 'Go back to where you last had the signal') : tr(`امشِ في المنطقة: ${r.area}`, `Walk around: ${place(r.area)}`),
        color: lost ? C.danger : C.faint,
        bg: lost ? C.dangerBg : C.fill,
        icon: (lost ? 'close' : 'radio-outline') as Icon,
      };
  const strength = heard ? bars(signal.smooth) : 0;
  const metres = heard ? estimateMetres(signal.smooth) : null;
  const ago = signal ? Math.round((now - signal.lastSeen) / 1000) : null;
  const lostChild = r.type === 'lost';

  // Pulse while searching; faster when close
  const [pulse] = useState(() => new Animated.Value(0));
  const period = strength >= 3 ? 700 : strength >= 1 ? 1100 : 1600;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: period, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    );
    pulse.setValue(0);
    loop.start();
    return () => loop.stop();
  }, [period, pulse]);
  const ring = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }],
  };

  return (
    <>
      {/* Who we are looking for */}
      <View style={[ui.card, s.who]}>
        <ReportPhoto report={r} size={58} />
        <View style={{ flex: 1 }}>
          <View style={s.whoTop}>
            <Text style={s.whoName}>{r.member.name}</Text>
            <View style={[s.chip, { backgroundColor: TYPE_UI[r.type].bg }]}>
              <Text style={[s.chipText, { color: TYPE_UI[r.type].color }]}>{TYPE_UI[r.type].label}</Text>
            </View>
          </View>
          <Text style={ui.muted}>{whoLine(r)}</Text>
          <Text style={s.desc} numberOfLines={2}>
            {r.description}
          </Text>
        </View>
      </View>

      {zone === 'NEAR' && (
        <View style={[ui.strip, { backgroundColor: C.safeBg, marginTop: 12, marginBottom: 0 }]}>
          <Ionicons name="eye-outline" size={16} color={C.safe} />
          <Text style={[ui.stripText, { color: C.safe }]}>{tr('السوار قريب جدًا منك، ابحث حولك بعينك', 'The bracelet is very close, look around you')}</Text>
        </View>
      )}

      {/* Big direction indicator */}
      <View style={s.center}>
        <View style={s.circleWrap}>
          {heard && <Animated.View style={[s.ring, { borderColor: view.color }, ring]} />}
          <View style={[s.circle, { backgroundColor: view.bg, borderColor: view.color }]}>
            <Ionicons name={view.icon} size={76} color={view.color} />
          </View>
        </View>
        <Text style={[s.trendLabel, { color: view.color }]}>{view.label}</Text>
        <Text style={s.trendHint}>{view.hint}</Text>
      </View>

      {/* Signal, distance, last heard */}
      <View style={s.metrics}>
        <View style={s.metric}>
          <View style={s.bigBars}>
            {[1, 2, 3, 4].map((i) => (
              <View
                key={i}
                style={[
                  s.bigBar,
                  {
                    height: 8 + i * 9,
                    backgroundColor:
                      i <= strength ? (strength <= 1 ? C.danger : strength <= 2 ? C.warn : C.safe) : C.barOff,
                  },
                ]}
              />
            ))}
          </View>
          <Text style={s.metricLabel}>{tr('قوة الإشارة', 'Signal')}</Text>
        </View>
        <View style={s.metric}>
          <Text style={s.metricNum}>{metres == null ? '—' : metres <= 2 ? '≤ 2' : `${metres}`}</Text>
          <Text style={s.metricLabel}>{tr('متر تقريبًا', 'metres approx.')}</Text>
        </View>
        <View style={s.metric}>
          <Text style={s.metricNum}>{ago == null ? '—' : ago < 2 ? tr('الآن', 'now') : tr(`${ago} ث`, `${ago}s`)}</Text>
          <Text style={s.metricLabel}>{tr('آخر إشارة', 'Last signal')}</Text>
        </View>
      </View>

      <View style={s.actions}>
        <Pressable style={ui.btn} onPress={onClose}>
          <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
          <Text style={ui.btnText}>{lostChild ? tr('وجدته، أغلق البلاغ', 'Found them, close report') : tr('وصلت إليه، أغلق البلاغ', 'I’m with them, close report')}</Text>
        </Pressable>
        {r.health && (
          <Pressable style={ui.btnGhost} onPress={onHealth}>
            <Ionicons name="medkit-outline" size={18} color={C.danger} />
            <Text style={ui.btnGhostText}>{tr('الحالة الصحية', 'Health condition')}</Text>
          </Pressable>
        )}
      </View>

      {/* Raw reading, for checking against the laptop scanner */}
      {signal && (
        <View style={s.tech}>
          <Text style={s.techText}>
            {/* ⁦ ⁩ keep "-92" from flipping to "92-" inside Arabic text */}
            {tr(
              `قراءة السوار · الإشارة الآن ⁦${signal.rssi}⁩ · المتوسط ⁦${signal.smooth}⁩`,
              `Bracelet reading · signal now ${signal.rssi} · average ${signal.smooth}`,
            )}
          </Text>
        </View>
      )}
    </>
  );
}

const s = StyleSheet.create({
  who: { flexDirection: 'row-reverse', gap: 12, alignItems: 'flex-start', padding: 14 },
  whoTop: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  whoName: { color: C.primary, fontSize: F.h2, fontWeight: '700', textAlign: 'right' },
  chip: { borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  chipText: { fontSize: 11.5, fontWeight: '700' },
  desc: { color: C.text, fontSize: F.small, textAlign: 'right', marginTop: 5, lineHeight: 20 },

  center: { alignItems: 'center', marginTop: 26 },
  circleWrap: { width: 190, height: 190, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: 170, height: 170, borderRadius: 85, borderWidth: 3 },
  circle: { width: 170, height: 170, borderRadius: 85, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  trendLabel: { fontSize: 28, fontWeight: '800', marginTop: 12, textAlign: 'center' },
  trendHint: { color: C.muted, fontSize: 14, marginTop: 4, textAlign: 'center' },

  metrics: { flexDirection: 'row-reverse', gap: 10, marginTop: 22 },
  metric: {
    flex: 1, alignItems: 'center', justifyContent: 'flex-end', minHeight: 92,
    ...ui.tile, padding: 12,
  },
  bigBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 46 },
  bigBar: { width: 9, borderRadius: 3 },
  metricNum: { color: C.primary, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  metricLabel: { color: C.muted, fontSize: 12, marginTop: 6, textAlign: 'center' },

  actions: { gap: 10, marginTop: 22 },
  tech: { marginTop: 18, padding: 12, borderRadius: 14, backgroundColor: C.techBg },
  techText: { color: C.primary, fontSize: 12, textAlign: 'right' },
});
