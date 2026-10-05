// Login and role choice. Phase 1: no real login, the phone number is not checked.
// Phase 2: Firebase Auth.
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, ui } from '../theme';
import { Button } from '../components/Button';
import type { IconName } from '../components/Header';
import { latinDigits } from '../components/digits';

export type Role = 'family' | 'volunteer';

const ROLES: { key: Role; title: string; text: string; icon: IconName }[] = [
  { key: 'family', title: 'عائلة', text: 'اربط سوار طفلك أو كبير السن وتابعه', icon: 'people-outline' },
  { key: 'volunteer', title: 'متطوع', text: 'استقبل البلاغات القريبة وساعد في البحث', icon: 'hand-left-outline' },
];

export default function LoginScreen({ onLogin }: { onLogin: (role: Role) => void }) {
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const ready = phone.length === 10 && !!role;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
      <View style={s.logo}>
        <Ionicons name="shield-checkmark" size={38} color="#fff" />
      </View>
      <Text style={s.name}>نسيج</Text>
      <Text style={s.tagline}>ما أحد يضيع في الزحام</Text>

      <Text style={ui.caption}>رقم الجوال</Text>
      <TextInput
        style={s.input}
        value={phone}
        onChangeText={(t) => setPhone(latinDigits(t).slice(0, 10))}
        placeholder="05xxxxxxxx"
        placeholderTextColor={C.faint}
        keyboardType="phone-pad"
        textAlign="center"
      />

      <Text style={ui.caption}>أنا</Text>
      {ROLES.map((r) => {
        const on = role === r.key;
        return (
          <Pressable key={r.key} style={[ui.card, s.role, on && s.roleOn]} onPress={() => setRole(r.key)}>
            <View style={[s.roleIcon, on && { backgroundColor: C.primary }]}>
              <Ionicons name={r.icon} size={24} color={on ? '#fff' : C.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.roleTitle}>{r.title}</Text>
              <Text style={ui.muted}>{r.text}</Text>
            </View>
            <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? C.primary : C.faint} />
          </Pressable>
        );
      })}

      <Button label="دخول" onPress={() => role && onLogin(role)} disabled={!ready} style={{ marginTop: 22 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: 24, paddingTop: 90 },
  logo: {
    width: 76, height: 76, borderRadius: 24, backgroundColor: C.primary,
    alignSelf: 'center', alignItems: 'center', justifyContent: 'center',
  },
  name: { color: C.primary, fontSize: 30, fontWeight: '700', textAlign: 'center', marginTop: 14 },
  tagline: { color: C.muted, fontSize: F.body, textAlign: 'center', marginTop: 4, marginBottom: 10 },
  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.inputBorder, borderRadius: 12,
    paddingVertical: 13, fontSize: 18, color: C.text, letterSpacing: 1,
  },
  role: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 10 },
  roleOn: { borderColor: C.primary },
  roleIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: C.techBg, alignItems: 'center', justifyContent: 'center' },
  roleTitle: { color: C.primary, fontSize: F.h2, fontWeight: '700', textAlign: 'right', marginBottom: 2 },
});
