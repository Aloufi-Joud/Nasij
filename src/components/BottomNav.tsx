// Bottom tab bar. dot = red marker for something waiting on that tab.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';
import type { IconName } from './Header';

export function BottomNav<K extends string>(p: {
  tabs: { key: K; label: string; icon: IconName; dot?: boolean }[];
  active: K;
  onChange: (key: K) => void;
}) {
  return (
    <View style={s.nav}>
      {p.tabs.map((t) => {
        const color = p.active === t.key ? C.primary : C.faint;
        return (
          <Pressable key={t.key} style={s.item} onPress={() => p.onChange(t.key)}>
            <View>
              <Ionicons name={t.icon} size={22} color={color} />
              {t.dot && <View style={s.dot} />}
            </View>
            <Text style={[s.text, { color }]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  nav: {
    position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row-reverse', justifyContent: 'space-around',
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, paddingBottom: 30,
  },
  item: { alignItems: 'center', gap: 3, minWidth: 70 },
  text: { fontSize: 11, fontWeight: '600' },
  dot: {
    position: 'absolute', top: -2, right: -4, width: 9, height: 9, borderRadius: 5,
    backgroundColor: C.danger, borderWidth: 1.5, borderColor: '#fff',
  },
});
