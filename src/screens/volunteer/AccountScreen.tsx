// "My account" for the volunteer (task 7): same page as the family's profile tab in FamilyApp.tsx.
// Name and phone live in users/{uid} (src/firebase/profile.ts); the name is what security sees on the dashboard.
// Changing the email or the password asks for the current password first (Firebase wants a recent sign-in).
// Logout asks inline, not with Alert.alert: Alert does nothing in the browser, where the volunteer side is tested.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../components/Text';
import { Pressable } from '../../components/Motion';
import { Ionicons } from '@expo/vector-icons';
import { C, ui } from '../../theme';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import type { IconName } from '../../components/Header';
import { latinDigits } from '../../components/digits';
import { auth } from '../../firebase';
import { changeEmail, changePassword, confirmPassword, saveProfile, type Profile } from '../../firebase/profile';
import { isEn, toggleLang, tr } from '../../i18n';

type Msg = { ok: boolean; text: string } | null;

type Props = {
  profile: Profile; // saved name and phone (loaded by VolunteerApp, which remounts this page once it arrives)
  onSaved: (p: Profile) => void;
  closedCount: number; // cases closed in this session
  languageCount: number;
  onDuty: boolean;
  busy: boolean; // a case is open: logging out is locked
  onSwitchRole?: () => void;
  onLogout?: () => Promise<void>;
};

// Same wording as the family app
const authError = (e: { code?: string }) =>
  e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' ? tr('كلمة المرور غير صحيحة', 'Wrong password')
  : e.code === 'auth/email-already-in-use' ? tr('هذا الإيميل مستخدم في حساب ثاني', 'That email is used by another account')
  : e.code === 'auth/invalid-email' ? tr('اكتب إيميل صحيح', 'Enter a valid email')
  : e.code === 'auth/requires-recent-login' ? tr('ادخل كلمة المرور القديمة من جديد', 'Enter your old password again')
  : e.code === 'auth/too-many-requests' ? tr('محاولات كثيرة، حاول بعد قليل', 'Too many attempts, try again shortly')
  : e.code === 'auth/network-request-failed' ? tr('لا يوجد اتصال بالإنترنت', 'No internet connection')
  : tr('تعذر التغيير، حاول مرة أخرى', 'Couldn’t change it, try again');

export default function AccountScreen(p: Props) {
  const [draft, setDraft] = useState<Profile>(p.profile);
  const [savedOnce, setSavedOnce] = useState(false);
  const [saveMsg, setSaveMsg] = useState<Msg>(null);
  const [login, setLogin] = useState(() => ({ current: '', email: auth.currentUser?.email ?? '' }));
  const [loginMsg, setLoginMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ open: false, old: '', next: '', again: '' });
  const [pwMsg, setPwMsg] = useState<Msg>(null);
  const [pwBusy, setPwBusy] = useState(false);
  const [askLogout, setAskLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const profileError = !draft.name.trim()
    ? tr('اكتب اسمك', 'Enter your name')
    : !/^\d{9,15}$/.test(draft.phone)
      ? tr('اكتب رقم جوال صحيح', 'Enter a valid phone number')
      : null;
  const profileDirty = draft.name.trim() !== p.profile.name || draft.phone !== p.profile.phone;
  const newEmail = login.email.trim().toLowerCase();
  const loginDirty = newEmail !== (auth.currentUser?.email ?? '').toLowerCase();
  const loginError = !loginDirty
    ? null
    : !/^\S+@\S+\.\S+$/.test(newEmail)
      ? tr('اكتب إيميل صحيح', 'Enter a valid email')
      : !login.current
        ? tr('اكتب كلمة المرور الحالية', 'Enter your current password')
        : null;
  const blocked = busy || (!profileDirty && !loginDirty) || (profileDirty && !!profileError) || (loginDirty && !!loginError);

  const save = async () => {
    if (blocked) return;
    setBusy(true);
    setSaveMsg(null);
    setLoginMsg(null);
    if (profileDirty) {
      const next = { name: draft.name.trim(), phone: draft.phone };
      try {
        await saveProfile(next);
        p.onSaved(next);
        setSavedOnce(true);
      } catch {
        setSaveMsg({ ok: false, text: tr('تعذر حفظ بياناتك، تحقق من الإنترنت', 'Couldn’t save your details, check the internet') });
      }
    }
    if (loginDirty) {
      try {
        await changeEmail(login.current, newEmail);
        setLogin({ current: '', email: auth.currentUser?.email ?? '' });
        setLoginMsg({ ok: true, text: tr(`أرسلنا رابط تأكيد إلى ${newEmail}، يتغير الإيميل بعد ما تفتحه`, `We sent a confirmation link to ${newEmail}. The email changes once you open it`) });
      } catch (e) {
        setLoginMsg({ ok: false, text: authError(e as { code?: string }) });
      }
    }
    setBusy(false);
  };

  const pwError = pw.next.length < 6
    ? tr('كلمة المرور ٦ أحرف أو أكثر', 'Password needs 6 characters or more')
    : pw.next !== pw.again
      ? tr('كلمتا المرور غير متطابقتين', 'Passwords don’t match')
      : null;
  const saveNewPassword = async () => {
    if (pwError || !pw.old) return;
    setPwBusy(true);
    setPwMsg(null);
    try {
      await confirmPassword(pw.old);
      await changePassword(pw.next);
      setPw({ open: false, old: '', next: '', again: '' });
      setPwMsg({ ok: true, text: tr('تغيّرت كلمة المرور', 'Password changed') });
    } catch (e) {
      setPwMsg({ ok: false, text: authError(e as { code?: string }) });
    } finally {
      setPwBusy(false);
    }
  };
  const closePw = () => {
    setPw({ open: false, old: '', next: '', again: '' });
    setPwMsg(null);
  };

  const logout = async () => {
    if (!p.onLogout || p.busy) return;
    setLoggingOut(true);
    await p.onLogout().catch(() => setLoggingOut(false));
  };

  const row = (icon: IconName, label: string, onPress: () => void, o: { value?: string; divider?: boolean; danger?: boolean } = {}) => (
    <Pressable style={[s.setRow, o.divider && s.setDivider]} onPress={onPress}>
      <View style={[s.setIcon, o.danger && { backgroundColor: C.dangerBg }]}>
        <Ionicons name={icon} size={18} color={o.danger ? C.danger : C.primary} />
      </View>
      <Text style={[s.setLabel, o.danger && { color: C.danger }]}>{label}</Text>
      {!!o.value && <Text style={s.setValue}>{o.value}</Text>}
      {!o.danger && <Ionicons name={isEn() ? 'chevron-forward' : 'chevron-back'} size={16} color={C.faint} />}
    </Pressable>
  );

  const allSaved = !profileDirty && !loginDirty && (savedOnce || !!loginMsg?.ok);

  return (
    <>
      {/* Who is signed in */}
      <View style={[ui.card, s.meCard]}>
        <View style={s.meAvatar}>
          <Text style={s.meAvatarText}>{p.profile.name.trim().charAt(0) || '؟'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.meName} numberOfLines={1}>{p.profile.name || tr('متطوع', 'Volunteer')}</Text>
          <Text style={s.meSub} numberOfLines={1}>{auth.currentUser?.email ?? ''}</Text>
        </View>
      </View>

      {!p.profile.name && (
        <Banner tone="warn" icon="person-outline" text={tr('اكتب اسمك عشان يعرفك فريق الأمن في لوحة المتابعة', 'Add your name so security knows who you are on the dashboard')} />
      )}

      <View style={s.stats}>
        {[
          { n: p.onDuty ? tr('نعم', 'Yes') : tr('لا', 'No'), label: tr('في المناوبة', 'On duty'), color: p.onDuty ? C.safe : C.faint },
          { n: String(p.closedCount), label: tr('بلاغات أغلقتها', 'Reports closed'), color: C.primary },
          { n: String(p.languageCount), label: tr('لغات تتكلمها', 'Languages'), color: C.primary },
        ].map((x) => (
          <View key={x.label} style={s.stat}>
            <Text style={[s.statNum, { color: x.color }]}>{x.n}</Text>
            <Text style={s.statLabel} numberOfLines={1}>{x.label}</Text>
          </View>
        ))}
      </View>

      <Text style={ui.caption}>{tr('بياناتي', 'My details')}</Text>
      <View style={ui.card}>
        <Text style={[s.label, { marginTop: 0 }]}>{tr('اسمك', 'Your name')}</Text>
        <TextInput
          style={ui.input}
          value={draft.name}
          maxLength={60}
          onChangeText={(name) => {
            setDraft({ ...draft, name });
            setSavedOnce(false);
          }}
          placeholder={tr('الاسم اللي يشوفه فريق الأمن', 'The name security sees')}
          placeholderTextColor={C.faint}
          textAlign="right"
        />

        <Text style={s.label}>{tr('رقم جوالك', 'Your phone')}</Text>
        <TextInput
          style={ui.input}
          value={draft.phone}
          maxLength={20}
          onChangeText={(phone) => {
            setDraft({ ...draft, phone: latinDigits(phone).slice(0, 15) });
            setSavedOnce(false);
          }}
          placeholder="05XXXXXXXX"
          placeholderTextColor={C.faint}
          keyboardType="phone-pad"
          textAlign="right"
        />

        <Text style={s.label}>{tr('الإيميل', 'Email')}</Text>
        <TextInput
          style={ui.input}
          value={login.email}
          onChangeText={(email) => {
            setLogin({ ...login, email });
            setLoginMsg(null);
          }}
          placeholder="name@example.com"
          placeholderTextColor={C.faint}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textAlign="right"
        />

        {loginDirty && (
          <>
            <Text style={s.label}>{tr('كلمة المرور الحالية', 'Current password')}</Text>
            <TextInput
              style={ui.input}
              value={login.current}
              onChangeText={(current) => {
                setLogin({ ...login, current });
                setLoginMsg(null);
              }}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textAlign="right"
            />
          </>
        )}

        {!!profileError && profileDirty && !!draft.name.trim() && <Text style={s.formError}>{profileError}</Text>}
        {!!loginError && !!newEmail && <Text style={s.hint}>{loginError}</Text>}
        {saveMsg && !saveMsg.ok && <Text style={s.formError}>{saveMsg.text}</Text>}
        {loginMsg && !loginMsg.ok && <Text style={s.formError}>{loginMsg.text}</Text>}
        {allSaved ? (
          <View style={s.savedRow}>
            <Ionicons name="checkmark-circle" size={18} color={C.safe} />
            <Text style={[s.saved, { flexShrink: 1 }]}>{loginMsg?.ok ? loginMsg.text : tr('انحفظت بياناتك', 'Your details are saved')}</Text>
          </View>
        ) : (
          <Button label={busy ? tr('جارٍ الحفظ…', 'Saving…') : tr('حفظ', 'Save')} onPress={save} disabled={blocked} style={{ marginTop: 14 }} />
        )}

        {/* Password: its own button, old password first, then the new one twice */}
        <View style={s.pwBox}>
          {!pw.open ? (
            <>
              {pwMsg?.ok && (
                <View style={[s.savedRow, { marginTop: 0, marginBottom: 10 }]}>
                  <Ionicons name="checkmark-circle" size={18} color={C.safe} />
                  <Text style={s.saved}>{pwMsg.text}</Text>
                </View>
              )}
              <Button
                label={tr('تغيير كلمة المرور', 'Change password')}
                icon="key-outline"
                kind="ghost"
                onPress={() => {
                  setPw({ ...pw, open: true });
                  setPwMsg(null);
                }}
              />
            </>
          ) : (
            <>
              <Text style={[s.label, { marginTop: 0 }]}>{tr('كلمة المرور القديمة', 'Old password')}</Text>
              <TextInput
                style={ui.input}
                value={pw.old}
                onChangeText={(old) => {
                  setPw({ ...pw, old });
                  setPwMsg(null);
                }}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                textAlign="right"
              />
              <Text style={s.label}>{tr('كلمة المرور الجديدة', 'New password')}</Text>
              <TextInput
                style={ui.input}
                value={pw.next}
                onChangeText={(next) => {
                  setPw({ ...pw, next });
                  setPwMsg(null);
                }}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textAlign="right"
              />
              <Text style={s.label}>{tr('أكّد كلمة المرور الجديدة', 'Confirm new password')}</Text>
              <TextInput
                style={ui.input}
                value={pw.again}
                onChangeText={(again) => {
                  setPw({ ...pw, again });
                  setPwMsg(null);
                }}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                textAlign="right"
              />
              {!!pwError && !!pw.again && <Text style={s.hint}>{pwError}</Text>}
              {pwMsg && !pwMsg.ok && <Text style={s.formError}>{pwMsg.text}</Text>}
              <View style={s.pwActions}>
                <Button
                  label={pwBusy ? tr('لحظة…', 'One moment…') : tr('غيّر كلمة المرور', 'Change password')}
                  onPress={saveNewPassword}
                  disabled={pwBusy || !pw.old || !!pwError}
                  style={{ flex: 1 }}
                />
                <Button label={tr('إلغاء', 'Cancel')} kind="ghost" onPress={closePw} style={{ flex: 1 }} />
              </View>
            </>
          )}
        </View>
      </View>

      <Text style={ui.caption}>{tr('الإعدادات', 'Settings')}</Text>
      <View style={[ui.card, { paddingVertical: 4 }]}>
        {row('language-outline', tr('لغة التطبيق', 'App language'), toggleLang, { value: tr('العربية', 'English') })}
        {p.onSwitchRole && row('swap-horizontal', tr('التبديل إلى عائلة', 'Switch to family'), p.onSwitchRole, { divider: true })}
        {p.onLogout &&
          (!askLogout ? (
            row('log-out-outline', tr('تسجيل الخروج', 'Log out'), () => setAskLogout(true), { divider: true, danger: true })
          ) : (
            <View style={[s.setDivider, { paddingVertical: 12 }]}>
              <Text style={s.askText}>
                {p.busy
                  ? tr('عندك بلاغ مفتوح، أغلقه قبل ما تطلع', 'You have an open report, close it before logging out')
                  : tr('تطلع من حسابك؟ تنتهي مناوبتك ويُحذف موقعك من النظام', 'Log out? Your shift ends and your location is removed from the system')}
              </Text>
              <View style={s.pwActions}>
                {!p.busy && (
                  <Button label={loggingOut ? tr('لحظة…', 'One moment…') : tr('اطلع', 'Log out')} kind="danger" onPress={logout} disabled={loggingOut} style={{ flex: 1 }} />
                )}
                <Button label={tr('إلغاء', 'Cancel')} kind="ghost" onPress={() => setAskLogout(false)} style={{ flex: 1 }} />
              </View>
            </View>
          ))}
      </View>
    </>
  );
}

const s = StyleSheet.create({
  meCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14, marginBottom: 14 },
  meAvatar: { width: 60, height: 60, borderRadius: 20, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  meAvatarText: { color: '#fff', fontSize: 26, fontWeight: '800' },
  meName: { color: C.primary, fontSize: 18, fontWeight: '800', textAlign: 'right' },
  meSub: { color: C.muted, fontSize: 12.5, textAlign: 'right', marginTop: 2 },
  stats: { flexDirection: 'row-reverse', gap: 10 },
  stat: { ...ui.tile, flex: 1, alignItems: 'center', paddingVertical: 12 },
  statNum: { fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { color: C.muted, fontSize: 12, fontWeight: '600', marginTop: 2 },
  label: { color: C.muted, fontSize: 12, fontWeight: '600', textAlign: 'right', marginTop: 12, marginBottom: 6 },
  hint: { color: C.muted, fontSize: 12.5, textAlign: 'right', marginTop: 10 },
  formError: { color: C.danger, fontSize: 13, fontWeight: '600', textAlign: 'right', marginTop: 12 },
  savedRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, paddingVertical: 14, borderRadius: 16, backgroundColor: C.safeBg },
  saved: { color: C.safe, fontSize: 13, fontWeight: '600', textAlign: 'right' },
  pwBox: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.border },
  pwActions: { flexDirection: 'row-reverse', gap: 10, marginTop: 14 },
  setRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 13 },
  setDivider: { borderTopWidth: 1, borderTopColor: C.border },
  setIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: C.techBg, alignItems: 'center', justifyContent: 'center' },
  setLabel: { flex: 1, color: C.text, fontSize: 15, fontWeight: '600', textAlign: 'right' },
  setValue: { color: C.muted, fontSize: 13.5 },
  askText: { color: C.text, fontSize: 14, fontWeight: '600', textAlign: 'right' },
});
