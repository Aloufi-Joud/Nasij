// Full-width button: primary (teal), danger (red) or ghost (outlined)
import type { StyleProp, ViewStyle } from 'react-native';
import { Text } from './Text';
import { Pressable } from './Motion';
import { Ionicons } from '@expo/vector-icons';
import { C, ui } from '../theme';
import type { IconName } from './Header';

export function Button(p: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'danger' | 'ghost';
  icon?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const ghost = p.kind === 'ghost';
  const color = ghost ? C.primary : '#fff';
  return (
    <Pressable
      style={[ghost ? ui.btnGhost : ui.btn, p.kind === 'danger' && { backgroundColor: C.danger }, p.disabled && { opacity: 0.4 }, p.style]}
      onPress={p.onPress}
      disabled={p.disabled}
    >
      {p.icon && <Ionicons name={p.icon} size={18} color={color} />}
      <Text style={ghost ? ui.btnGhostText : ui.btnText}>{p.label}</Text>
    </Pressable>
  );
}
