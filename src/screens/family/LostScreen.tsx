// "My child is lost": clothing description and photo, then send to nearby volunteers
import { useState } from 'react';
import { Alert, Image, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../components/Text';
import { Pressable } from '../../components/Motion';
import { Ionicons } from '@expo/vector-icons';
import { C, F, ui } from '../../theme';
import { reports } from '../../mock';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { tr } from '../../i18n';

// Builds installed before expo-image-picker have no native module: fall back to the demo photo there
const FAKE_PHOTO = reports[0].photo;
let ImagePicker: typeof import('expo-image-picker') | null = null;
// eslint-disable-next-line @typescript-eslint/no-require-imports
try { ImagePicker = require('expo-image-picker'); } catch {}

// Same cap as firestore.rules for private/photo (the photo is stored inside the document)
const MAX_PHOTO = 700_000;

async function pickPhoto(): Promise<string | null> {
  if (!ImagePicker) return FAKE_PHOTO;
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.2, base64: true });
  const b64 = res.canceled ? null : res.assets[0].base64;
  if (!b64) return null;
  const uri = `data:image/jpeg;base64,${b64}`;
  if (uri.length >= MAX_PHOTO) {
    Alert.alert(tr('الصورة كبيرة', 'Photo too large'), tr('قصّي الصورة على وجه الطفل وجربي مرة ثانية', "Crop the photo to the child's face and try again"));
    return null;
  }
  return uri;
}

export default function LostScreen(p: {
  name: string;
  initial: string; // description saved with the member, editable here
  onSend: (description: string, photo: string | null) => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState(p.initial);
  const [photo, setPhoto] = useState<string | null>(null);
  const ready = !!description.trim();

  return (
    <>
      <Text style={ui.sectionTitle}>{tr(`${p.name} ضائع`, `${p.name} is lost`)}</Text>
      <Banner
        tone="info"
        icon="lock-closed-outline"
        text={tr('المتطوعون القريبون يشوفون الوصف، والصورة يشوفها بس المتطوع اللي يستلم البلاغ، وتنحذف أول ما تلقونه', 'Nearby volunteers see the description; only the volunteer who takes the case sees the photo, deleted as soon as you find them')}
      />

      <View style={ui.card}>
        <Text style={s.label}>{tr('صورة حديثة', 'Recent photo')}</Text>
        <Pressable style={s.photoBox} onPress={async () => setPhoto(photo ? null : await pickPhoto())}>
          {photo ? (
            <Image source={{ uri: photo }} style={s.photo} />
          ) : (
            <>
              <Ionicons name="camera-outline" size={30} color={C.accent} />
              <Text style={s.photoText}>{tr('اختر صورة', 'Choose a photo')}</Text>
            </>
          )}
        </Pressable>
        {photo && <Text style={s.hint}>{tr('اضغط على الصورة لحذفها', 'Tap the photo to remove it')}</Text>}

        <Text style={s.label}>{tr('وش لابس؟', 'What are they wearing?')}</Text>
        <TextInput
          style={[s.input, s.multi]}
          value={description}
          maxLength={300}
          onChangeText={setDescription}
          placeholder={tr('مثلًا: فستان أصفر وحذاء أبيض، شعرها مربوط', 'e.g. yellow dress, white shoes, hair tied up')}
          placeholderTextColor={C.faint}
          multiline
          textAlign="right"
          textAlignVertical="top"
        />
      </View>

      <Button
        label={tr('أرسل البلاغ للمتطوعين', 'Send report to volunteers')}
        icon="megaphone-outline"
        kind="danger"
        onPress={() => p.onSend(description.trim(), photo)}
        disabled={!ready}
        style={{ marginTop: 18 }}
      />
      <Button label={tr('إلغاء', 'Cancel')} kind="ghost" onPress={p.onCancel} style={{ marginTop: 10 }} />
    </>
  );
}

const s = StyleSheet.create({
  label: { color: C.muted, fontSize: 12, fontWeight: '600', textAlign: 'right', marginBottom: 6, marginTop: 4 },
  photoBox: {
    height: 150, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.inputBorder, backgroundColor: C.fill,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 6,
  },
  photo: { width: '100%', height: '100%' },
  photoText: { color: C.accent, fontSize: F.small, fontWeight: '600', marginTop: 4 },
  hint: { color: C.faint, fontSize: 12, textAlign: 'center', marginBottom: 6 },
  input: ui.input,
  multi: { minHeight: 90 },
});
