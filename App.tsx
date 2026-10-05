// Nasij app shell: login and role choice, then the family or volunteer screens
import { useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import LoginScreen, { type Role } from './src/screens/LoginScreen';
import FamilyApp from './src/screens/family/FamilyApp';
import { VolunteerApp } from './src/screens/volunteer';

export default function App() {
  const [role, setRole] = useState<Role | null>(null);
  // Keep a role mounted once opened, so switching back and forth during the demo
  // keeps the linked bracelet, the member and any open report.
  const [opened, setOpened] = useState<Role[]>([]);

  const open = (r: Role) => {
    setRole(r);
    setOpened((old) => (old.includes(r) ? old : [...old, r]));
  };
  const switchRole = () => open(role === 'family' ? 'volunteer' : 'family');

  if (!role) return <LoginScreen onLogin={open} />;

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      {opened.includes('family') && (
        <View style={{ flex: 1, display: role === 'family' ? 'flex' : 'none' }}>
          <FamilyApp onSwitchRole={switchRole} />
        </View>
      )}
      {opened.includes('volunteer') && (
        <View style={{ flex: 1, display: role === 'volunteer' ? 'flex' : 'none' }}>
          <VolunteerApp onSwitchRole={switchRole} />
        </View>
      )}
    </View>
  );
}
