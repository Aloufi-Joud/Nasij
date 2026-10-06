// Login and role choice with Firebase Auth (email and password).
// A new email is signed up on the spot, so the demo needs no separate sign-up screen.
import { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, ui } from '../theme';
import { Button } from '../components/Button';
import type { IconName } from '../components/Header';

export type Role = 'family' | 'volunteer';

const ROLES: { key: Role; title: string; text: string; icon: IconName }[] = [
  { key: 'family', title: 'عائلة', text: 'اربط سوار طفلك أو كبير السن وتابعه', icon: 'people-outline' },
  { key: 'volunteer', title: 'متطوع', text: 'استقبل البلاغات القريبة وساعد في البحث', icon: 'hand-left-outline' },
];

export default function LoginScreen({ onLogin }: { onLogin: (role: Role) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Firebase Auth needs a valid email and a password of 6 or more characters
  const ready = /^\S+@\S+\.\S+$/.test(email.trim()) && password.length >= 6 && !!role && !busy;

  const login = async () => {
    if (!role) return;
    setBusy(true);
    setError('');
    try {
      const mail = email.trim();
      const cred = await signInWithEmailAndPassword(auth, mail, password).catch(async (e) => {
        // Unknown email: sign up. A known email with the wrong password fails here with email-already-in-use.
        if (e.code !== 'auth/invalid-credential' && e.code !== 'auth/user-not-found') throw e;
        return createUserWithEmailAndPassword(auth, mail, password);
      });
      await setDoc(doc(db, 'users', cred.user.uid), { email: mail, role }, { merge: true });
      onLogin(role);
    } catch (e: any) {
      setError(
        e.code === 'auth/email-already-in-use' || e.code === 'auth/wrong-password' ? 'كلمة المرور غير صحيحة'
        : e.code === 'auth/network-request-failed' ? 'لا يوجد اتصال بالإنترنت'
        : e.code === 'auth/too-many-requests' ? 'محاولات كثيرة، حاول بعد قليل'
        : 'تعذر تسجيل الدخول، حاول مرة أخرى',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
      <View style={s.logo}>
        <Ionicons name="shield-checkmark" size={38} color="#fff" />
      </View>
      <Text style={s.name}>نسيج</Text>
      <Text style={s.tagline}>ما أحد يضيع في الزحام</Text>

      <Text style={ui.caption}>البريد الإلكتروني</Text>
      <TextInput
        style={s.input}
        value={email}
        onChangeText={setEmail}
        placeholder="name@example.com"
        placeholderTextColor={C.faint}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textAlign="left"
      />

      <Text style={ui.caption}>كلمة المرور</Text>
      <TextInput
        style={s.input}
        value={password}
        onChangeText={setPassword}
        placeholder="٦ أحرف أو أكثر"
        placeholderTextColor={C.faint}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="password"
        textAlign="right"
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

      {!!error && <Text style={s.error}>{error}</Text>}
      <Button label={busy ? 'جارٍ الدخول…' : 'دخول'} onPress={login} disabled={!ready} style={{ marginTop: 22 }} />
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
    paddingVertical: 13, paddingHorizontal: 14, fontSize: 16, color: C.text,
  },
  role: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 10 },
  roleOn: { borderColor: C.primary },
  roleIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: C.techBg, alignItems: 'center', justifyContent: 'center' },
  error: { color: C.danger, fontSize: F.body, textAlign: 'right', marginTop: 14 },
  roleTitle: { color: C.primary, fontSize: F.h2, fontWeight: '700', textAlign: 'right', marginBottom: 2 },
});
