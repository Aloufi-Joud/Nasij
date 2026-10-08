// Coloured warning strip, e.g. "الإشارة تضعف". Tappable when onPress is given.
import { Text } from './Text';
import { Pressable } from './Motion';
import { Ionicons } from '@expo/vector-icons';
import { C, ui } from '../theme';
import type { IconName } from './Header';

const TONE = {
  warn: { color: C.warn, bg: C.warnBg },
  danger: { color: C.danger, bg: C.dangerBg },
  safe: { color: C.safe, bg: C.safeBg },
  info: { color: C.primary, bg: C.techBg },
};

export function Banner(p: { tone: keyof typeof TONE; icon: IconName; text: string; onPress?: () => void }) {
  const t = TONE[p.tone];
  return (
    <Pressable style={[ui.strip, { backgroundColor: t.bg }]} onPress={p.onPress} disabled={!p.onPress}>
      <Ionicons name={p.icon} size={15} color={t.color} />
      <Text style={[ui.stripText, { color: t.color }]}>{p.text}</Text>
    </Pressable>
  );
}
