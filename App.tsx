// Nasij app shell: login and role choice, then the family or volunteer screens
import { useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import LoginScreen, { type Role } from './src/screens/LoginScreen';
import FamilyApp from './src/screens/family/FamilyApp';
import { VolunteerApp } from './src/screens/volunteer';
import { useLang } from './src/i18n';

export default function App() {
  // Screens are laid out right-to-left by hand (row-reverse). For English, 'rtl' here mirrors all of it.
  const dir = useLang() === 'en' ? 'rtl' : 'ltr';
  const [role, setRole] = useState<Role | null>(null);
  // Keep a role mounted once opened, so switching back and forth during the demo
  // keeps the linked bracelet, the member and any open report.
  const [opened, setOpened] = useState<Role[]>([]);

  const open = (r: Role) => {
    setRole(r);
    setOpened((old) => (old.includes(r) ? old : [...old, r]));
  };
  const switchRole = () => open(role === 'family' ? 'volunteer' : 'family');

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
          <FamilyApp
            shown={role === 'family'}
            onSwitchRole={switchRole}
            onLogout={() => {
              setRole(null);
              setOpened([]);
            }}
          />
        </View>
      )}
      {opened.includes('volunteer') && (
        <View style={{ flex: 1, display: role === 'volunteer' ? 'flex' : 'none' }}>
          <VolunteerApp
            onSwitchRole={switchRole}
            onLogout={() => {
              setRole(null);
              setOpened([]);
            }}
          />
        </View>
      )}
    </View>
  );
}
