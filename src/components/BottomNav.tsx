// Bottom tab bar. dot = red marker for something waiting on that tab.
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Pressable } from './Motion';
import { Ionicons } from '@expo/vector-icons';
import { C, shadow } from '../theme';
import type { IconName } from './Header';

export function BottomNav<K extends string>(p: {
  tabs: { key: K; label: string; icon: IconName; dot?: boolean }[];
  active: K;
  onChange: (key: K) => void;
}) {
  return (
    <View style={s.nav}>
      {p.tabs.map((t) => {
        const on = p.active === t.key;
        const color = on ? C.primary : C.faint;
        // Active tab gets the filled icon, so the state reads by shape, not just colour
        const icon = (on ? t.icon.replace(/-outline$/, '') : t.icon) as IconName;
        return (
          <Pressable key={t.key} style={[s.item, on && s.itemOn]} onPress={() => p.onChange(t.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <View>
              <Ionicons name={icon} size={22} color={color} />
              {t.dot && <View style={s.dot} />}
            </View>
            <Text style={[s.text, { color }]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Floating bar: sits above the content with a soft shadow, active tab gets a tinted pill
const s = StyleSheet.create({
  nav: {
    position: 'absolute', bottom: 22, left: 16, right: 16, flexDirection: 'row-reverse', gap: 4,
    backgroundColor: '#fff', borderRadius: 26, padding: 6, ...shadow.card, shadowOpacity: 0.12,
  },
  item: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 8, borderRadius: 20 },
  itemOn: { backgroundColor: C.techBg },
  text: { fontSize: 11, fontWeight: '700' },
  dot: {
    position: 'absolute', top: -2, right: -4, width: 9, height: 9, borderRadius: 5,
    backgroundColor: C.danger, borderWidth: 1.5, borderColor: '#fff',
  },
});
