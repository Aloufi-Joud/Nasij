// Language field that opens into a list: one choice for a member, several for a volunteer
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../theme';
import { LANGUAGES, type Language } from '../mock';

type Props = { selected: Language[]; onPick: (l: Language) => void; multi?: boolean };

export function LanguagePicker({ selected, onPick, multi }: Props) {
  const [open, setOpen] = useState(false);
  const shown = selected.map((l) => LANGUAGES[l]).join('، ') || 'اختر';

  return (
    <View style={s.box}>
      <Pressable style={s.field} onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
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
                if (!multi) setOpen(false);
              }}
              accessibilityRole={multi ? 'checkbox' : 'radio'}
              accessibilityState={{ checked: on }}
            >
              <Ionicons name={icon} size={20} color={on ? C.primary : C.faint} />
              <Text style={[s.rowText, on && { color: C.primary, fontWeight: '700' }]}>{LANGUAGES[l]}</Text>
            </Pressable>
          );
        })}
    </View>
  );
}

const s = StyleSheet.create({
  box: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.inputBorder, borderRadius: 12, overflow: 'hidden' },
  field: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 14 },
  value: { flex: 1, color: C.text, fontSize: 15, textAlign: 'right' },
  row: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
    paddingVertical: 11, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: C.border,
  },
  rowText: { flex: 1, color: C.text, fontSize: 14.5, textAlign: 'right' },
});
