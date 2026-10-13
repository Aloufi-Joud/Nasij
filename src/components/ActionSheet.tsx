// iOS-style action sheet, the same on both platforms: a titled group of rows with icons, and a separate Cancel.
// The sheet rises from below with the drawer curve and leaves the same way, a little faster; the scrim follows it.
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable as RNPressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { C } from '../theme';
import { easeOut } from './Motion';
import { isEn } from '../i18n';
import type { IconName } from './Header';

export type SheetAction = { label: string; icon: IconName; destructive?: boolean; onPress: () => void };

export function ActionSheet(p: { visible: boolean; title: string; actions: SheetAction[]; cancel: string; onClose: () => void }) {
  const [y] = useState(() => new Animated.Value(1));
  // Stays mounted after visible turns false, until the sheet has slid out
  const [shown, setShown] = useState(p.visible);
  if (p.visible && !shown) setShown(true);
  // iOS can't show an Alert while a Modal is still closing, so the chosen action runs once it has gone
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (p.visible) {
      Animated.timing(y, { toValue: 0, duration: 320, easing: Easing.bezier(0.32, 0.72, 0, 1), useNativeDriver: true }).start();
    } else {
      Animated.timing(y, { toValue: 1, duration: 200, easing: easeOut, useNativeDriver: true }).start(({ finished }) => finished && setShown(false));
    }
  }, [p.visible, y]);

  const pick = (a: SheetAction) => {
    if (Platform.OS === 'ios') pending.current = a.onPress;
    p.onClose();
    if (Platform.OS !== 'ios') a.onPress();
  };

  return (
    <Modal
      visible={shown}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={p.onClose}
      onDismiss={() => {
        pending.current?.();
        pending.current = null;
      }}
    >
      <Animated.View style={[s.scrim, { opacity: y.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
        <RNPressable style={StyleSheet.absoluteFill} onPress={p.onClose} accessibilityLabel={p.cancel} />
      </Animated.View>
      {/* A Modal sits outside App's direction setting, so mirror for English here too */}
      <Animated.View style={[s.wrap, { direction: isEn() ? 'rtl' : 'ltr', transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, 320] }) }] }]}>
        <View style={s.group}>
          <Text style={s.title}>{p.title}</Text>
          {p.actions.map((a) => (
            <RNPressable key={a.label} style={({ pressed }) => [s.row, pressed && s.pressed]} onPress={() => pick(a)} accessibilityRole="button">
              <Text style={[s.label, a.destructive && { color: C.danger }]}>{a.label}</Text>
              <Ionicons name={a.icon} size={20} color={a.destructive ? C.danger : C.text} />
            </RNPressable>
          ))}
        </View>
        <RNPressable style={({ pressed }) => [s.group, s.cancel, pressed && s.pressed]} onPress={p.onClose} accessibilityRole="button">
          <Text style={s.cancelText}>{p.cancel}</Text>
        </RNPressable>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  // ponytail: fixed bottom gap for the iPhone home indicator; use safe-area insets if the layout ever needs it exact
  wrap: { position: 'absolute', left: 8, right: 8, bottom: Platform.OS === 'ios' ? 34 : 12, gap: 8 },
  group: { backgroundColor: 'rgba(250,250,250,0.97)', borderRadius: 14, overflow: 'hidden' },
  title: { color: C.muted, fontSize: 13, textAlign: 'center', paddingVertical: 12 },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(60,60,67,0.29)',
  },
  pressed: { backgroundColor: 'rgba(0,0,0,0.06)' },
  label: { color: C.text, fontSize: 17 },
  cancel: { minHeight: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  cancelText: { color: C.text, fontSize: 17, fontWeight: '600' },
});
