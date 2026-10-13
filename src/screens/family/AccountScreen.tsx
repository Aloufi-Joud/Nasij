// Account tab for the guardian: name and phone (users/{uid}), sign-in email and password, settings.
// Changing the email or the password asks for the current password first (Firebase wants a recent sign-in).
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
import { failed } from './shared';

type Msg = { ok: boolean; text: string } | null;

type Props = {
  profile: Profile; // saved name and phone (loaded by FamilyApp, which remounts this page once it arrives)
  onSaved: (p: Profile) => void;
  memberCount: number;
  activeCount: number;
  openCount: number;
  onSwitchRole?: () => void; // demo account only
  onEndVisit: () => void;
};

// Firebase Auth errors as the guardian should read them
const authError = (e: { code?: string }) =>
  e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' ? tr('كلمة المرور غير صحيحة', 'Wrong password')
  : e.code === 'auth/email-already-in-use' ? tr('هذا الإيميل مستخدم في حساب ثاني', 'That email is used by another account')
  : e.code === 'auth/invalid-email' ? tr('اكتب إيميل صحيح', 'Enter a valid email')
  : e.code === 'auth/requires-recent-login' ? tr('ادخل كلمة المرور القديمة من جديد', 'Enter your old password again')
  : e.code === 'auth/too-many-requests' ? tr('محاولات كثيرة، حاول بعد قليل', 'Too many attempts, try again shortly')
  : e.code === 'auth/network-request-failed' ? tr('لا يوجد اتصال بالإنترنت', 'No internet connection')
  : tr('تعذر التغيير، حاول مرة أخرى', 'Couldn’t change it, try again');

export default function AccountScreen({ profile, onSaved, memberCount, activeCount, openCount, onSwitchRole, onEndVisit }: Props) {
  const [profileDraft, setProfileDraft] = useState<Profile>(profile);
  const [profileSaved, setProfileSaved] = useState(false);
  // Changing the sign-in email: the new email, the current password, and the result line
  const [login, setLogin] = useState(() => ({ current: '', email: auth.currentUser?.email ?? '' }));
  const [loginMsg, setLoginMsg] = useState<Msg>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  // Changing the password: form open, old password, and the new one twice
  const [pw, setPw] = useState({ open: false, old: '', next: '', again: '' });
  const [pwMsg, setPwMsg] = useState<Msg>(null);
  const [pwBusy, setPwBusy] = useState(false);

  const profileError = !profileDraft.name.trim()
    ? tr('اكتب اسمك', 'Enter your name')
    : !/^\d{9,15}$/.test(profileDraft.phone)
      ? tr('اكتب رقم جوال صحيح', 'Enter a valid phone number')
      : null;
  const profileDirty = profileDraft.name.trim() !== profile.name || profileDraft.phone !== profile.phone;
  const newEmail = login.email.trim().toLowerCase();
  const loginDirty = newEmail !== (auth.currentUser?.email ?? '').toLowerCase();
  const loginError = !loginDirty
    ? null
    : !/^\S+@\S+\.\S+$/.test(newEmail)
      ? tr('اكتب إيميل صحيح', 'Enter a valid email')
      : !login.current
        ? tr('اكتب كلمة المرور الحالية', 'Enter your current password')
        : null;
  const saveLogin = async () => {
    if (loginError) return;
    setLoginBusy(true);
    setLoginMsg(null);
    try {
      await changeEmail(login.current, newEmail);
      setLogin({ current: '', email: auth.currentUser?.email ?? '' });
      setLoginMsg({ ok: true, text: tr(`أرسلنا رابط تأكيد إلى ${newEmail}، يتغير الإيميل بعد ما تفتحه`, `We sent a confirmation link to ${newEmail}. The email changes once you open it`) });
    } catch (e: any) {
      setLoginMsg({ ok: false, text: authError(e) });
    } finally {
      setLoginBusy(false);
    }
  };
  const saveMyProfile = () => {
    if (profileError) return;
    const p = { name: profileDraft.name.trim(), phone: profileDraft.phone };
    onSaved(p);
    setProfileSaved(true);
    saveProfile(p).catch(() => {
      setProfileSaved(false);
      failed(tr('تعذر حفظ بياناتك', 'Couldn’t save your details'));
    });
  };
  const saveDetails = () => {
    if (profileDirty) saveMyProfile();
    if (loginDirty) saveLogin();
  };
  const detailsBlocked = loginBusy || (!profileDirty && !loginDirty) || (profileDirty && !!profileError) || (loginDirty && !!loginError);

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
    } catch (e: any) {
      setPwMsg({ ok: false, text: authError(e) });
    } finally {
      setPwBusy(false);
    }
  };
  const closePw = () => {
    setPw({ open: false, old: '', next: '', again: '' });
    setPwMsg(null);
  };

  // One row of the account settings list
  const settingRow = (icon: IconName, label: string, onPress: () => void, o: { value?: string; divider?: boolean } = {}) => (
    <Pressable style={[s.setRow, o.divider && s.setDivider]} onPress={onPress}>
      <View style={s.setIcon}>
        <Ionicons name={icon} size={18} color={C.primary} />
      </View>
      <Text style={s.setLabel}>{label}</Text>
      {!!o.value && <Text style={s.setValue}>{o.value}</Text>}
      <Ionicons name={isEn() ? 'chevron-forward' : 'chevron-back'} size={16} color={C.faint} />
    </Pressable>
  );

  return (
    <>
      {/* Who is signed in */}
      <View style={[ui.card, s.meCard]}>
        <View style={s.meAvatar}>
          <Text style={s.meAvatarText}>{profile.name.trim().charAt(0) || '؟'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.memberName} numberOfLines={1}>{profile.name || tr('ولي الأمر', 'Guardian')}</Text>
          <Text style={s.memberRole} numberOfLines={1}>{auth.currentUser?.email ?? ''}</Text>
        </View>
      </View>

      {!profile.phone && (
        <Banner tone="warn" icon="call-outline" text={tr('أضف رقم جوالك عشان يتواصل معك المتطوع', 'Add your phone so a volunteer can reach you')} />
      )}

      <View style={s.stats}>
        {[
          { n: memberCount, label: tr('أفراد', 'Members'), color: C.primary },
          { n: activeCount, label: tr('أساور نشطة', 'Active bracelets'), color: C.safe },
          { n: openCount, label: tr('بلاغات مفتوحة', 'Open reports'), color: openCount ? C.danger : C.faint },
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
          style={s.input}
          value={profileDraft.name}
          maxLength={60}
          onChangeText={(name) => {
            setProfileDraft({ ...profileDraft, name });
            setProfileSaved(false);
          }}
          placeholder={tr('مثلًا: أبو سنا', 'e.g. Sana’s dad')}
          placeholderTextColor={C.faint}
          textAlign="right"
        />

        <Text style={s.label}>{tr('رقم جوالك', 'Your phone')}</Text>
        <TextInput
          style={s.input}
          value={profileDraft.phone}
          maxLength={20}
          onChangeText={(phone) => {
            setProfileDraft({ ...profileDraft, phone: latinDigits(phone).slice(0, 15) });
            setProfileSaved(false);
          }}
          placeholder="05XXXXXXXX"
          placeholderTextColor={C.faint}
          keyboardType="phone-pad"
          textAlign="right"
        />

        <Text style={s.label}>{tr('الإيميل', 'Email')}</Text>
        <TextInput
          style={s.input}
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

        {/* Firebase asks for the current password before the email can change */}
        {loginDirty && (
          <>
            <Text style={s.label}>{tr('كلمة المرور الحالية', 'Current password')}</Text>
            <TextInput
              style={s.input}
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

        {!!profileError && !!profileDraft.name.trim() && <Text style={s.formError}>{profileError}</Text>}
        {!!loginError && !!newEmail && <Text style={s.hint}>{loginError}</Text>}
        {loginMsg && !loginMsg.ok && <Text style={s.formError}>{loginMsg.text}</Text>}
        {!profileDirty && !loginDirty && (profileSaved || !!loginMsg?.ok) ? (
          <View style={s.savedRow}>
            <Ionicons name="checkmark-circle" size={18} color={C.safe} />
            <Text style={[s.saved, { marginTop: 0, flexShrink: 1 }]}>{loginMsg?.ok ? loginMsg.text : tr('انحفظت بياناتك', 'Your details are saved')}</Text>
          </View>
        ) : (
          <Button label={loginBusy ? tr('جارٍ الحفظ…', 'Saving…') : tr('حفظ', 'Save')} onPress={saveDetails} disabled={detailsBlocked} style={{ marginTop: 14 }} />
        )}

        {/* Password: its own button, old password first, then the new one twice */}
        <View style={s.pwBox}>
          {!pw.open ? (
            <>
              {pwMsg?.ok && (
                <View style={[s.savedRow, { marginTop: 0, marginBottom: 10 }]}>
                  <Ionicons name="checkmark-circle" size={18} color={C.safe} />
                  <Text style={[s.saved, { marginTop: 0 }]}>{pwMsg.text}</Text>
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
                style={s.input}
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
                style={s.input}
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
                style={s.input}
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
        {settingRow('language-outline', tr('لغة التطبيق', 'App language'), toggleLang, { value: tr('العربية', 'English') })}
        {onSwitchRole && settingRow('swap-horizontal', tr('التبديل إلى متطوع', 'Switch to volunteer'), onSwitchRole, { divider: true })}
        <Pressable style={[s.setRow, s.setDivider]} onPress={onEndVisit}>
          <View style={[s.setIcon, { backgroundColor: C.dangerBg }]}>
            <Ionicons name="exit-outline" size={18} color={C.danger} />
          </View>
          <Text style={[s.setLabel, { color: C.danger }]}>{tr('إنهاء الزيارة', 'End visit')}</Text>
        </Pressable>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  hint: { color: C.muted, fontSize: 12.5, textAlign: 'right', marginBottom: 10 },
  label: { color: C.muted, fontSize: 12, fontWeight: '600', textAlign: 'right', marginTop: 12, marginBottom: 6 },
  input: ui.input,
  memberName: { color: C.primary, fontSize: 18, fontWeight: '800', textAlign: 'right' },
  memberRole: { color: C.muted, fontSize: 12.5, textAlign: 'right', marginTop: 2 },
  saved: { color: C.safe, fontSize: 13, fontWeight: '600', textAlign: 'right', marginTop: 12 },
  formError: { color: C.danger, fontSize: 13, fontWeight: '600', textAlign: 'right', marginTop: 12 },
  meCard: { flexDirection: 'row-reverse', alignItems: 'center', gap: 14, marginBottom: 14 },
  meAvatar: { width: 60, height: 60, borderRadius: 20, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  meAvatarText: { color: '#fff', fontSize: 26, fontWeight: '800' },
  stats: { flexDirection: 'row-reverse', gap: 10 },
  stat: { ...ui.tile, flex: 1, alignItems: 'center', paddingVertical: 12 },
  statNum: { fontSize: 24, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { color: C.muted, fontSize: 12, fontWeight: '600', marginTop: 2 },
  savedRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, paddingVertical: 14, borderRadius: 16, backgroundColor: C.safeBg },
  setRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 13 },
  setDivider: { borderTopWidth: 1, borderTopColor: C.border },
  setIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: C.techBg, alignItems: 'center', justifyContent: 'center' },
  setLabel: { flex: 1, color: C.text, fontSize: 15, fontWeight: '600', textAlign: 'right' },
  setValue: { color: C.muted, fontSize: 13.5 },
  pwBox: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.border },
  pwActions: { flexDirection: 'row-reverse', gap: 10, marginTop: 14 },
});
