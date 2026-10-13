// Login and role choice with Firebase Auth (email and password).
// Only families sign up here; volunteer accounts are made by the event (Firebase console) and pick "volunteer" on first sign-in.
// The role picked at sign-up is the account's role for good: signing in as the other one is refused.
// Except the demo account, which opens either side and has the switch button.
import { useState } from 'react';
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../components/Text';
import { FadeIn, Pressable } from '../components/Motion';
import { Ionicons } from '@expo/vector-icons';
import { C, F, shadow, ui } from '../theme';
import { Button } from '../components/Button';
import { LangButton, type IconName } from '../components/Header';
import { tr } from '../i18n';

export type Role = 'family' | 'volunteer';

// ponytail: demo account picked by email in the app; fine while roles are self-chosen anyway (see the "later" list)
export const DEMO_EMAIL = 'test@gmail.com';
export const isDemo = (email?: string | null) => email?.trim().toLowerCase() === DEMO_EMAIL;

const ROLES = (): { key: Role; title: string; text: string; icon: IconName }[] => [
  { key: 'family', title: tr('عائلة', 'Family'), text: tr('اربط سوار طفلك أو كبير السن وتابعه', 'Link your child’s or elder’s bracelet and keep track'), icon: 'people-outline' },
  { key: 'volunteer', title: tr('متطوع', 'Volunteer'), text: tr('استقبل البلاغات القريبة وساعد في البحث', 'Get nearby reports and help search'), icon: 'hand-left-outline' },
];

export default function LoginScreen({ onLogin }: { onLogin: (role: Role) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [signingUp, setSigningUp] = useState(false); // new family account
  // Firebase Auth needs a valid email and a password of 6 or more characters
  const ready = /^\S+@\S+\.\S+$/.test(email.trim()) && password.length >= 6 && (signingUp || !!role) && !busy;

  const switchMode = () => {
    setSigningUp(!signingUp);
    setError('');
    setInfo('');
  };

  const signUp = async () => {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const mail = email.trim();
      const cred = await createUserWithEmailAndPassword(auth, mail, password);
      await setDoc(doc(db, 'users', cred.user.uid), { email: mail, role: 'family' }, { merge: true });
      onLogin('family');
    } catch (e: any) {
      setError(
        e.code === 'auth/email-already-in-use' ? tr('تعذر إنشاء الحساب بهذا البريد، جرّب تسجيل الدخول', 'Couldn’t sign up with this email, try signing in')
        : e.code === 'auth/network-request-failed' ? tr('لا يوجد اتصال بالإنترنت', 'No internet connection')
        : tr('تعذر إنشاء الحساب، حاول مرة أخرى', 'Could not sign up, try again'),
      );
    } finally {
      setBusy(false);
    }
  };

  const login = async () => {
    if (!role) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const mail = email.trim();
      const cred = await signInWithEmailAndPassword(auth, mail, password);
      const ref = doc(db, 'users', cred.user.uid);
      const saved = (await getDoc(ref)).data()?.role as string | undefined;
      if (saved && saved !== role && !isDemo(mail)) {
        await signOut(auth).catch(() => {});
        return setError(
          saved === 'family' ? tr('هذا الحساب مسجّل كعائلة، اختر "عائلة"', 'This account is registered as family, pick "Family"')
          : saved === 'volunteer' ? tr('هذا الحساب مسجّل كمتطوع، اختر "متطوع"', 'This account is registered as a volunteer, pick "Volunteer"')
          : tr('هذا الحساب ما يدخل من التطبيق', 'This account can’t sign in to the app'),
        );
      }
      // Saved once: at sign-up, or for an older account made before roles were kept.
      // The demo account saves each pick, as before (the volunteer side needs role volunteer in the rules)
      if (!saved || isDemo(mail)) await setDoc(ref, { email: mail, role }, { merge: true });
      onLogin(role);
    } catch (e: any) {
      // One message for a wrong email or password, so the screen never tells which emails have accounts
      setError(
        ['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(e.code) ? tr('البريد أو كلمة المرور غير صحيحة', 'Wrong email or password')
        : e.code === 'auth/network-request-failed' ? tr('لا يوجد اتصال بالإنترنت', 'No internet connection')
        : e.code === 'auth/too-many-requests' ? tr('محاولات كثيرة، حاول بعد قليل', 'Too many attempts, try again shortly')
        : tr('تعذر تسجيل الدخول، حاول مرة أخرى', 'Could not sign in, try again'),
      );
    } finally {
      setBusy(false);
    }
  };

  // Same message whether or not the email has an account
  const resetPassword = async () => {
    const mail = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(mail)) return setError(tr('اكتب بريدك الإلكتروني أول', 'Enter your email first'));
    setError('');
    await sendPasswordResetEmail(auth, mail).catch(() => {});
    setInfo(tr('إذا كان البريد مسجّلًا، بيوصلك رابط لتغيير كلمة المرور', 'If this email has an account, a reset link is on its way'));
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
      <View style={s.top}>
        <LangButton dark />
      </View>
      {/* Seen once per visit, so it can afford a short staggered entrance */}
      <FadeIn pop style={s.logo}>
        <Image source={require('../../assets/splash-icon.png')} style={s.mark} />
      </FadeIn>
      <FadeIn delay={60}>
        <Text style={s.name}>{tr('نسيج', 'Nasij')}</Text>
        <Text style={s.tagline}>{tr('ما أحد يضيع في الزحام', 'No one gets lost in the crowd')}</Text>
      </FadeIn>

      <FadeIn delay={120}>

      <Text style={ui.caption}>{tr('البريد الإلكتروني', 'Email')}</Text>
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

      <Text style={ui.caption}>{tr('كلمة المرور', 'Password')}</Text>
      <TextInput
        style={s.input}
        value={password}
        onChangeText={setPassword}
        placeholder={tr('٦ أحرف أو أكثر', '6 characters or more')}
        placeholderTextColor={C.faint}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="password"
        textAlign="right"
      />

      {signingUp ? (
        <Text style={[ui.muted, s.note]}>
          {tr('إنشاء الحساب للعائلات فقط. حسابات المتطوعين تجهّزها إدارة الفعالية.', 'Sign-up is for families only. Volunteer accounts are set up by the event.')}
        </Text>
      ) : (
      <>
      <Text style={ui.caption}>{tr('أنا', 'I am')}</Text>
      {ROLES().map((r) => {
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

      <Pressable onPress={resetPassword} hitSlop={8} style={{ marginTop: 10 }}>
        <Text style={s.forgot}>{tr('نسيت كلمة المرور؟', 'Forgot password?')}</Text>
      </Pressable>
      </>
      )}

      {!!error && <Text style={s.error}>{error}</Text>}
      {!!info && <Text style={s.info}>{info}</Text>}
      {signingUp ? (
        <Button label={busy ? tr('جارٍ الإنشاء…', 'Signing up…') : tr('إنشاء حساب عائلة', 'Create family account')} onPress={signUp} disabled={!ready} style={{ marginTop: 22 }} />
      ) : (
        <Button label={busy ? tr('جارٍ الدخول…', 'Signing in…') : tr('دخول', 'Sign in')} onPress={login} disabled={!ready} style={{ marginTop: 22 }} />
      )}
      <Pressable onPress={switchMode} hitSlop={8} style={{ marginTop: 16 }}>
        <Text style={s.switch}>
          {signingUp ? tr('عندك حساب؟ سجّل دخول', 'Have an account? Sign in') : tr('عائلة جديدة؟ أنشئ حساب', 'New family? Create an account')}
        </Text>
      </Pressable>
      </FadeIn>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  body: { padding: 24, paddingTop: 56 },
  top: { flexDirection: 'row', marginBottom: 10 }, // button sits at the far (end) corner
  logo: {
    width: 84, height: 84, borderRadius: 28, backgroundColor: C.primary,
    alignSelf: 'center', alignItems: 'center', justifyContent: 'center',
    ...shadow.card, shadowOpacity: 0.25,
  },
  mark: { width: 56, height: 56 },
  note: { textAlign: 'right', marginTop: 4 },
  switch: { color: C.accent, fontSize: F.body, fontWeight: '600', textAlign: 'center' },
  name: { color: C.primary, fontSize: 34, fontWeight: '800', textAlign: 'center', marginTop: 16 },
  tagline: { color: C.muted, fontSize: F.body, textAlign: 'center', marginTop: 4, marginBottom: 10 },
  input: { ...ui.input, fontSize: 16 },
  role: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, marginBottom: 10 },
  roleOn: { borderColor: C.primary },
  roleIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: C.techBg, alignItems: 'center', justifyContent: 'center' },
  error: { color: C.danger, fontSize: F.body, textAlign: 'right', marginTop: 14 },
  info: { color: C.safe, fontSize: F.body, textAlign: 'right', marginTop: 14 },
  forgot: { color: C.accent, fontSize: 13.5, fontWeight: '600', textAlign: 'right' },
  roleTitle: { color: C.primary, fontSize: F.h2, fontWeight: '700', textAlign: 'right', marginBottom: 2 },
});
