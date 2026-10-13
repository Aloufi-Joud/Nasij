// A volunteer scanned a bracelet's sticker and tapped "I'm a volunteer" on the report page: the page opened
// nasij://bracelet?t=<token>, and this screen shows that bracelet's member (the rules allow only that one).
import { useEffect, useState } from 'react';
import { Linking, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { C, F, ui } from '../theme';
import type { Member } from '../mock';
import { memberOfSticker } from '../firebase/members';
import { KIND_UI, GENDER_UI } from './family/shared';
import { langName, tr } from '../i18n';

// The sticker token in a nasij:// link, or null
export function stickerToken(url: string | null): string | null {
  const m = url?.match(/^nasij:\/\/bracelet\?t=([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

export default function StickerScreen({ token, onClose }: { token: string; onClose: () => void }) {
  // undefined: loading, null: nobody on this bracelet (or unknown sticker), 'error': no internet or refused
  const [member, setMember] = useState<Member | null | 'error' | undefined>(undefined);

  useEffect(() => {
    memberOfSticker(token).then(setMember, () => setMember('error'));
  }, [token]);

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.body}>
        <Text style={ui.sectionTitle}>{tr('بيانات السوار', 'Bracelet details')}</Text>
        {member === undefined ? (
          <Text style={ui.muted}>{tr('جارٍ القراءة…', 'Reading…')}</Text>
        ) : member === 'error' ? (
          <Text style={ui.muted}>{tr('تعذّرت القراءة، تحقق من الإنترنت وتأكد إنك في المناوبة', 'Couldn’t read it, check the internet and make sure you’re on duty')}</Text>
        ) : !member ? (
          <Text style={ui.muted}>{tr('ما فيه شخص مسجّل على هذا السوار الحين. ابقَ معه وأبلغ فريق الأمن', 'Nobody is registered on this bracelet now. Stay with them and tell security')}</Text>
        ) : (
          <>
            <View style={ui.card}>
              <Text style={s.name}>{member.name}</Text>
              <Text style={ui.muted}>
                {[KIND_UI[member.kind].label, GENDER_UI[member.gender], tr(`${member.age} سنة`, `${member.age} years`), langName(member.language)].join(' · ')}
              </Text>
              {!!member.description && <Text style={[ui.text, s.gap]}>{member.description}</Text>}
            </View>
            {member.health && (
              <View style={[ui.card, s.gap, { borderColor: C.danger }]}>
                <Text style={[ui.text, { fontWeight: '800', color: C.danger }]}>{member.health.condition}</Text>
                {!!member.health.notes && <Text style={[ui.text, s.gap]}>{member.health.notes}</Text>}
              </View>
            )}
            {member.phone && (
              <Button
                style={s.gap}
                icon="call"
                label={tr(`اتصل بالعائلة ${member.phone}`, `Call the family ${member.phone}`)}
                onPress={() => Linking.openURL(`tel:${member.phone}`)}
              />
            )}
          </>
        )}
        <Button style={s.gap} kind="ghost" label={tr('إغلاق', 'Close')} onPress={onClose} />
      </ScrollView>
    </Modal>
  );
}

const s = StyleSheet.create({
  body: { padding: 20, paddingTop: 28 },
  name: { color: C.text, fontSize: F.h1, fontWeight: '800', textAlign: 'right', marginBottom: 4 },
  gap: { marginTop: 14 },
});
