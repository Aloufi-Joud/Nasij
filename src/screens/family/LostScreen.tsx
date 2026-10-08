// "My child is lost": clothing description and photo, then send to nearby volunteers
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, F, ui } from '../../theme';
import { reports } from '../../mock';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';

// ponytail: fake photo until expo-image-picker joins the next Mac install
const FAKE_PHOTO = reports[0].photo;

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
      <Text style={ui.sectionTitle}>{p.name} ضائع</Text>
      <Banner
        tone="info"
        icon="lock-closed-outline"
        text="المتطوعون القريبون بيشوفون الصورة والوصف بس، وتنحذف أول ما تلقونه"
      />

      <View style={ui.card}>
        <Text style={s.label}>صورة حديثة</Text>
        <Pressable style={s.photoBox} onPress={() => setPhoto(photo ? null : FAKE_PHOTO)}>
          {photo ? (
            <Image source={{ uri: photo }} style={s.photo} />
          ) : (
            <>
              <Ionicons name="camera-outline" size={30} color={C.accent} />
              <Text style={s.photoText}>اختر صورة</Text>
            </>
          )}
        </Pressable>
        {photo && <Text style={s.hint}>اضغط على الصورة لحذفها</Text>}

        <Text style={s.label}>وش لابس؟</Text>
        <TextInput
          style={[s.input, s.multi]}
          value={description}
          onChangeText={setDescription}
          placeholder="مثلًا: فستان أصفر وحذاء أبيض، شعرها مربوط"
          placeholderTextColor={C.faint}
          multiline
          textAlign="right"
          textAlignVertical="top"
        />
      </View>

      <Button
        label="أرسل البلاغ للمتطوعين"
        icon="megaphone-outline"
        kind="danger"
        onPress={() => p.onSend(description.trim(), photo)}
        disabled={!ready}
        style={{ marginTop: 18 }}
      />
      <Button label="إلغاء" kind="ghost" onPress={p.onCancel} style={{ marginTop: 10 }} />
    </>
  );
}

const s = StyleSheet.create({
  label: { color: C.muted, fontSize: 12, fontWeight: '600', textAlign: 'right', marginBottom: 6, marginTop: 4 },
  photoBox: {
    height: 150, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.inputBorder,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 6,
  },
  photo: { width: '100%', height: '100%' },
  photoText: { color: C.accent, fontSize: F.small, fontWeight: '600', marginTop: 4 },
  hint: { color: C.faint, fontSize: 12, textAlign: 'center', marginBottom: 6 },
  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.inputBorder, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14, fontSize: F.body, color: C.text,
  },
  multi: { minHeight: 90 },
});
