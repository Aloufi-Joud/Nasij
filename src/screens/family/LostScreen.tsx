// "My child is lost": clothing description (required) and photo (optional), then send to nearby volunteers
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../components/Text';
import { C, ui } from '../../theme';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { PhotoField } from '../../components/PhotoField';
import { tr } from '../../i18n';

export default function LostScreen(p: {
  name: string;
  initial: string; // description saved with the member, editable here
  initialPhoto: string | null; // photo taken when the member was added, if any
  hasBracelet: boolean;
  onSend: (description: string, photo: string | null) => void;
  onCancel: () => void;
}) {
  const [description, setDescription] = useState(p.initial);
  const [photo, setPhoto] = useState<string | null>(p.initialPhoto);
  const ready = !!description.trim();

  return (
    <>
      <Text style={ui.sectionTitle}>{tr(`${p.name} ضائع`, `${p.name} is lost`)}</Text>
      <Banner
        tone="info"
        icon="lock-closed-outline"
        text={tr('المتطوعون القريبون يشوفون الوصف، والصورة يشوفها بس المتطوع اللي يستلم البلاغ، وتنحذف أول ما تلقونه', 'Nearby volunteers see the description; only the volunteer who takes the case sees the photo, deleted as soon as you find them')}
      />

      {!p.hasBracelet && (
        <Banner tone="warn" icon="watch-outline" text={tr('ما فيه سوار مربوط، المتطوعين بيدورون بالوصف والصورة. أضف صورة إذا تقدر', 'No bracelet linked: volunteers will search by the description and photo. Add a photo if you can')} />
      )}

      <View style={ui.card}>
        <Text style={s.label}>{tr('صورة بملابسه اليوم (اختياري)', 'Photo in today’s clothes (optional)')}</Text>
        <PhotoField value={photo} onChange={setPhoto} />

        <Text style={s.label}>{tr('وش لابس؟ (مطلوب)', 'What are they wearing? (required)')}</Text>
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
  input: ui.input,
  multi: { minHeight: 90 },
});
