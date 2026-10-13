// Alerts tab: this visit's zone changes, presses and reports, newest first
import { StyleSheet, View } from 'react-native';
import { Text } from '../../components/Text';
import { C, ui } from '../../theme';
import { tr } from '../../i18n';
import { ZONE_UI, type LogItem } from './shared';

export default function AlertsScreen({ log }: { log: LogItem[] }) {
  return (
    <>
      <Text style={ui.sectionTitle}>{tr('التنبيهات', 'Alerts')}</Text>
      {log.length === 0 && <Text style={s.empty}>{tr('لا توجد تنبيهات بعد', 'No alerts yet')}</Text>}
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
  );
}

const s = StyleSheet.create({
  empty: { color: C.faint, textAlign: 'center', marginTop: 30 },
  logRow: { ...ui.tile, flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 10 },
  logDot: { width: 10, height: 10, borderRadius: 5 },
  logLabel: { flex: 1, fontSize: 14, fontWeight: '600', textAlign: 'right' },
  logTime: { color: C.faint, fontSize: 12, fontVariant: ['tabular-nums'] },
});
