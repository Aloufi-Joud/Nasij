// Dark teal header used by every screen set
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F } from '../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Header(p: { sub: string; title: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <View style={s.header}>
      <View style={s.row}>
        <View>
          <Text style={s.sub}>{p.sub}</Text>
          <Text style={s.title}>{p.title}</Text>
        </View>
        <View style={s.actions}>{p.actions}</View>
      </View>
      {p.children && <View style={s.pills}>{p.children}</View>}
    </View>
  );
}

export function HeaderButton(p: { icon: IconName; onPress: () => void; badge?: number; label: string }) {
  return (
    <Pressable style={s.btn} onPress={p.onPress} hitSlop={6} accessibilityLabel={p.label}>
      <Ionicons name={p.icon} size={21} color="#fff" />
      {!!p.badge && (
        <View style={s.badge}>
          <Text style={s.badgeText}>{Math.min(p.badge, 9)}</Text>
        </View>
      )}
    </Pressable>
  );
}

// Small status chip under the title. alert = amber, for warnings.
export function Pill(p: { text: string; dot?: string; icon?: IconName; alert?: boolean }) {
  const color = p.alert ? '#FFC857' : '#fff';
  return (
    <View style={[s.pill, p.alert && { backgroundColor: 'rgba(212,132,26,0.25)' }]}>
      {p.dot && <View style={[s.dot, { backgroundColor: p.dot }]} />}
      {p.icon && <Ionicons name={p.icon} size={14} color={color} />}
      <Text style={[s.pillText, { color }, p.alert && { fontWeight: '700' }]}>{p.text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    backgroundColor: C.primary, paddingTop: 64, paddingBottom: 18, paddingHorizontal: 22,
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
  },
  row: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  sub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'right' },
  title: { color: '#fff', fontSize: F.title, fontWeight: '700', textAlign: 'right' },
  actions: { flexDirection: 'row-reverse', gap: 8 },
  btn: { padding: 9, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)' },
  badge: {
    position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: 9,
    backgroundColor: C.danger, borderWidth: 2, borderColor: C.primary, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  pills: { flexDirection: 'row-reverse', gap: 10, marginTop: 16, flexWrap: 'wrap' },
  pill: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12,
  },
  pillText: { fontSize: 12, fontWeight: '500' },
  dot: { width: 9, height: 9, borderRadius: 5 },
});
