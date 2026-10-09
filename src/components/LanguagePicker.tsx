// Language field that opens into a list: one choice for a member, several for a volunteer
import { useState } from 'react';
import { LayoutAnimation, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Pressable } from './Motion';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';
import { LANGUAGES, type Language } from '../mock';
import { langName, tr } from '../i18n';

type Props = { selected: Language[]; onPick: (l: Language) => void; multi?: boolean };

export function LanguagePicker({ selected, onPick, multi }: Props) {
  const [open, setOpen] = useState(false);
  // Occasional open/close: a short ease-out so the list answers at once and doesn't pop in
  const toggle = (v: boolean) => {
    LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeOut', 'opacity'));
    setOpen(v);
  };
  const shown = selected.map(langName).join(tr('، ', ', ')) || tr('اختر', 'Choose');

  return (
    <View style={s.box}>
      <Pressable style={s.field} onPress={() => toggle(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Text style={s.value} numberOfLines={1}>
          {shown}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={C.muted} />
      </Pressable>
      {open &&
        (Object.keys(LANGUAGES) as Language[]).map((l) => {
          const on = selected.includes(l);
          const icon = multi ? (on ? 'checkbox' : 'square-outline') : on ? 'radio-button-on' : 'radio-button-off';
          return (
            <Pressable
              key={l}
              style={s.row}
              onPress={() => {
                onPick(l);
                if (!multi) toggle(false);
              }}
              accessibilityRole={multi ? 'checkbox' : 'radio'}
              accessibilityState={{ checked: on }}
            >
              <Ionicons name={icon} size={20} color={on ? C.primary : C.faint} />
              <Text style={[s.rowText, on && { color: C.primary, fontWeight: '700' }]}>{langName(l)}</Text>
            </Pressable>
          );
        })}
    </View>
  );
}

const s = StyleSheet.create({
  box: { backgroundColor: C.fill, borderRadius: 14, overflow: 'hidden' },
  field: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 13, paddingHorizontal: 14 },
  value: { flex: 1, color: C.text, fontSize: 15, textAlign: 'right' },
  row: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
    paddingVertical: 11, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: 'rgba(14,63,60,0.06)',
  },
  rowText: { flex: 1, color: C.text, fontSize: 14.5, textAlign: 'right' },
});
