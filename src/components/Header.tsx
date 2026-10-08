// Dark teal header used by every screen set
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Pressable } from './Motion';
import { Ionicons } from '@expo/vector-icons';
import { C, F } from '../theme';
import { isEn, toggleLang } from '../i18n';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Header(p: { sub: string; title: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <View style={s.header}>
      {/* Faint woven rings: a quiet nod to the name, behind everything */}
      <View style={[s.ring, { top: -70, left: -50 }]} />
      <View style={[s.ring, { top: -20, left: -110, width: 200, height: 200 }]} />
      <View style={s.row}>
        <View>
          <Text style={s.sub}>{p.sub}</Text>
          <Text style={s.title}>{p.title}</Text>
        </View>
        <View style={s.actions}>
          <LangButton />
          {p.actions}
        </View>
      </View>
      {p.children && <View style={s.pills}>{p.children}</View>}
    </View>
  );
}

export function HeaderButton(p: { icon: IconName; onPress: () => void; badge?: number; label: string }) {
  return (
    <Pressable style={s.btn} onPress={p.onPress} hitSlop={6} accessibilityLabel={p.label}>
      <Ionicons name={p.icon} size={20} color="#fff" />
      {!!p.badge && (
        <View style={s.badge}>
          <Text style={s.badgeText}>{Math.min(p.badge, 9)}</Text>
        </View>
      )}
    </Pressable>
  );
}

// Switches the whole app between Arabic and English; shows the language it switches to
export function LangButton(p: { dark?: boolean }) {
  return (
    <Pressable
      style={[s.btn, p.dark && { backgroundColor: C.techBg }]}
      onPress={toggleLang}
      hitSlop={6}
      accessibilityLabel={isEn() ? 'التبديل إلى العربية' : 'Switch to English'}
    >
      <Text style={[s.lang, p.dark && { color: C.primary }]}>{isEn() ? 'ع' : 'EN'}</Text>
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
    backgroundColor: C.primary, paddingTop: 60, paddingBottom: 20, paddingHorizontal: 22,
    borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden',
  },
  ring: { position: 'absolute', width: 240, height: 240, borderRadius: 120, borderWidth: 1.5, borderColor: 'rgba(168,200,196,0.14)' },
  row: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  sub: { color: C.mint, fontSize: 13, fontWeight: '600', textAlign: 'right', marginBottom: 2 },
  title: { color: '#fff', fontSize: F.title, fontWeight: '800', textAlign: 'right' },
  actions: { flexDirection: 'row-reverse', gap: 8 },
  btn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  lang: { color: '#fff', fontSize: 14, fontWeight: '700' },
  badge: {
    position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: C.danger, borderWidth: 2, borderColor: C.primary, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700', fontVariant: ['tabular-nums'] },
  pills: { flexDirection: 'row-reverse', gap: 8, marginTop: 18, flexWrap: 'wrap' },
  pill: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12,
  },
  pillText: { fontSize: 12.5, fontWeight: '600' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
