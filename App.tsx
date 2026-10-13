// Nasij app shell: login, then the family or volunteer screens.
// An account only opens its own side; the demo account (DEMO_EMAIL) can switch between both.
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import LoginScreen, { isDemo, type Role } from './src/screens/LoginScreen';
import FamilyApp from './src/screens/family/FamilyApp';
import StickerScreen, { stickerToken } from './src/screens/StickerScreen';
import { VolunteerApp } from './src/screens/volunteer';
import { auth } from './src/firebase';
import { useLang } from './src/i18n';
import { watchBracelets } from './modules/nasij-beacon';

export default function App() {
  // Screens are laid out right-to-left by hand (row-reverse). For English, 'rtl' here mirrors all of it.
  const dir = useLang() === 'en' ? 'rtl' : 'ltr';
  const [role, setRole] = useState<Role | null>(null);
  // Demo account: keep a side mounted once opened, so switching back and forth during the demo
  // keeps the linked bracelet, the member and any open report.
  const [opened, setOpened] = useState<Role[]>([]);
  // A bracelet sticker opened from the report page (nasij://bracelet?t=...): shown once the volunteer side is open
  const [sticker, setSticker] = useState<string | null>(null);
  useEffect(() => {
    const take = (url: string | null) => {
      const t = stickerToken(url);
      if (t) setSticker(t);
    };
    Linking.getInitialURL().then(take, () => {});
    const sub = Linking.addEventListener('url', (e) => take(e.url));
    return () => sub.remove();
  }, []);
  // Signed out (or not signed in yet after a restart): iOS keeps watching bracelets across launches, so stop it
  useEffect(() => {
    if (!role) watchBracelets({});
  }, [role]);
  // The splash should hide by itself once the first screen draws; hide it here too in case that signal never comes
  useEffect(() => {
    SplashScreen.hide();
  }, []);

  const open = (r: Role) => {
    setRole(r);
    setOpened((old) => (old.includes(r) ? old : [...old, r]));
  };
  const switchRole = isDemo(auth.currentUser?.email) ? () => open(role === 'family' ? 'volunteer' : 'family') : undefined;
  const logout = () => {
    setRole(null);
    setOpened([]);
  };

  if (!role)
    return (
      <View style={{ flex: 1, direction: dir }}>
        <LoginScreen onLogin={open} />
      </View>
    );

  return (
    <View style={{ flex: 1, direction: dir }}>
      <StatusBar style="light" />
      {opened.includes('family') && (
        <View style={{ flex: 1, display: role === 'family' ? 'flex' : 'none' }}>
          <FamilyApp shown={role === 'family'} onSwitchRole={switchRole} onLogout={logout} />
        </View>
      )}
      {opened.includes('volunteer') && (
        <View style={{ flex: 1, display: role === 'volunteer' ? 'flex' : 'none' }}>
          <VolunteerApp onSwitchRole={switchRole} onLogout={logout} />
        </View>
      )}
      {role === 'volunteer' && sticker && <StickerScreen key={sticker} token={sticker} onClose={() => setSticker(null)} />}
    </View>
  );
}
