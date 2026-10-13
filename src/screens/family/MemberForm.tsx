// Adding or editing a family member: its own page, not a card inside the list.
// The draft lives in FamilyApp (the ••• menu fills it, and the guardian's phone arrives after login).
import { StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../components/Text';
import { Pressable } from '../../components/Motion';
import { Ionicons } from '@expo/vector-icons';
import { C, ui } from '../../theme';
import { MAX_AGE } from '../../mock';
import { Button } from '../../components/Button';
import { PhotoField } from '../../components/PhotoField';
import { LanguagePicker } from '../../components/LanguagePicker';
import { latinDigits } from '../../components/digits';
import { isEn, tr } from '../../i18n';
import { GENDER_UI, KIND_UI, formError, type Form } from './shared';

type Props = {
  draft: Form;
  onChange: (f: Form) => void;
  editingName: string | null; // the member being edited, or null for a new one
  saving: boolean;
  onSave: () => void;
  onCancel: (() => void) | null; // null on the first visit: there is no list to go back to
};

export default function MemberForm({ draft, onChange: setDraft, editingName, saving, onSave, onCancel }: Props) {
  const draftError = formError(draft);
  const chips = <T extends string>(options: Record<T, string>, value: T, set: (v: T) => void) => (
    <View style={[s.chips, { flexWrap: 'wrap' }]}>
      {(Object.keys(options) as T[]).map((k) => (
        <Pressable
          key={k}
          onPress={() => set(k)}
          style={[s.chip, value === k && { backgroundColor: C.primary, borderColor: C.primary }]}
        >
          <Text style={[s.chipText, value === k && { color: '#fff' }]}>{options[k]}</Text>
        </Pressable>
      ))}
    </View>
  );
  return (
    <>
      {onCancel && (
        <Pressable style={s.back} hitSlop={8} onPress={onCancel}>
          <Ionicons name={isEn() ? 'arrow-back' : 'arrow-forward'} size={18} color={C.accent} />
          <Text style={s.backText}>{tr('أفراد العائلة', 'Family members')}</Text>
        </Pressable>
      )}
      <View style={[ui.card, { marginBottom: 14 }]}>
        <Text style={s.formTitle}>{editingName ? tr(`تعديل بيانات ${editingName}`, `Edit ${editingName}`) : tr('أضف فردًا من العائلة', 'Add a family member')}</Text>

        <Text style={s.label}>{tr('الاسم', 'Name')}</Text>
        <TextInput
          style={s.input}
          value={draft.name}
          maxLength={60}
          onChangeText={(name) => setDraft({ ...draft, name })}
          placeholder={tr('مثلًا: سنا', 'e.g. Sana')}
          placeholderTextColor={C.faint}
          textAlign="right"
        />

        <Text style={s.label}>{tr('النوع', 'Type')}</Text>
        {chips({ child: KIND_UI.child.label, elder: KIND_UI.elder.label }, draft.kind, (kind) => setDraft({ ...draft, kind }))}

        <Text style={s.label}>{tr('الجنس', 'Gender')}</Text>
        {chips(GENDER_UI, draft.gender, (gender) => setDraft({ ...draft, gender }))}

        <Text style={s.label}>{tr('العمر', 'Age')}</Text>
        <TextInput
          style={s.input}
          value={draft.age}
          onChangeText={(age) => setDraft({ ...draft, age: latinDigits(age).slice(0, 3) })}
          placeholder={draft.kind === 'child' ? tr(`من 0 إلى ${MAX_AGE.child}`, `0 to ${MAX_AGE.child}`) : tr(`حتى ${MAX_AGE.elder}`, `up to ${MAX_AGE.elder}`)}
          placeholderTextColor={C.faint}
          keyboardType="number-pad"
          textAlign="right"
        />

        <Text style={s.label}>{tr('لغته', 'Their language')}</Text>
        <LanguagePicker selected={[draft.language]} onPick={(language) => setDraft({ ...draft, language })} />
        <Text style={[s.hint, { marginTop: 6 }]}>{tr('المتطوع اللي يتكلم لغته يوصله البلاغ أول', 'A volunteer who speaks their language gets the report first')}</Text>

        <Text style={s.label}>{draft.kind === 'child' ? tr('رقم جوال ولي الأمر', 'Guardian’s phone') : tr('رقم جوال للتواصل (اختياري)', 'Contact phone (optional)')}</Text>
        <TextInput
          style={s.input}
          value={draft.phone}
          maxLength={20}
          onChangeText={(phone) => setDraft({ ...draft, phone: latinDigits(phone).slice(0, 15) })}
          placeholder="05XXXXXXXX"
          placeholderTextColor={C.faint}
          keyboardType="phone-pad"
          textAlign="right"
        />
        <Text style={[s.hint, { marginTop: 6 }]}>{tr('يشوفه المتطوع اللي يستلم البلاغ بس، عشان يتواصل معكم مباشرة', 'Only the volunteer who takes the report sees it, to reach you directly')}</Text>

        <Text style={s.label}>{tr('كيف يتعرف عليه المتطوع؟ (اختياري)', 'How can a volunteer recognise them? (optional)')}</Text>
        <TextInput
          style={[s.input, { minHeight: 70 }]}
          value={draft.description}
          maxLength={300}
          onChangeText={(description) => setDraft({ ...draft, description })}
          placeholder={tr('مثلًا: ثوب أبيض وشماغ أحمر، يمشي بعكاز', 'e.g. white thobe, red shemagh, walks with a cane')}
          placeholderTextColor={C.faint}
          multiline
          textAlign="right"
          textAlignVertical="top"
        />

        <Text style={s.label}>{tr('صورة بملابسه اليوم (اختياري، ننصح فيها)', 'Photo in today’s clothes (optional, recommended)')}</Text>
        <PhotoField value={draft.photo} onChange={(photo) => setDraft({ ...draft, photo })} />
        <Text style={s.hint}>{tr('تبقى في جوالك بس، وما تنرسل إلا مع البلاغ للمتطوع اللي يستلمه', 'Stays on your phone, only sent with a report to the volunteer who takes it')}</Text>

        <Text style={s.label}>{tr('حالة صحية (اختياري)', 'Health condition (optional)')}</Text>
        <TextInput
          style={s.input}
          value={draft.condition}
          maxLength={100}
          onChangeText={(condition) => setDraft({ ...draft, condition })}
          placeholder={tr('مثلًا: ربو، سكري', 'e.g. asthma, diabetes')}
          placeholderTextColor={C.faint}
          textAlign="right"
        />
        {!!draft.condition.trim() && (
          <>
            <Text style={s.label}>{tr('وش لازم يسوي المتطوع؟', 'What should the volunteer do?')}</Text>
            <TextInput
              style={[s.input, { minHeight: 70 }]}
              value={draft.notes}
              maxLength={300}
              onChangeText={(notes) => setDraft({ ...draft, notes })}
              placeholder={tr('مثلًا: البخاخ في الجيب الأمامي لشنطته', 'e.g. inhaler in the front pocket of their bag')}
              placeholderTextColor={C.faint}
              multiline
              textAlign="right"
              textAlignVertical="top"
            />
          </>
        )}
        <Text style={[s.hint, { marginTop: 6 }]}>{tr('تظهر لمتطوع واحد بس وقت البلاغ، وتنحذف لما ينقفل', 'Shown to one volunteer only during a report, deleted when it closes')}</Text>

        {!!draftError && !!draft.name.trim() && <Text style={s.formError}>{draftError}</Text>}
        <Button label={saving ? tr('جارٍ الحفظ…', 'Saving…') : tr('حفظ', 'Save')} onPress={onSave} disabled={!!draftError || saving} style={{ marginTop: 12 }} />
        {onCancel && <Button label={tr('إلغاء', 'Cancel')} kind="ghost" onPress={onCancel} style={{ marginTop: 10 }} />}
      </View>
    </>
  );
}

const s = StyleSheet.create({
  back: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, alignSelf: 'flex-end', marginBottom: 12 },
  backText: { color: C.accent, fontSize: 14, fontWeight: '700' },
  hint: { color: C.muted, fontSize: 12.5, textAlign: 'right', marginBottom: 10 },
  formTitle: { color: C.primary, fontSize: 16, fontWeight: '700', textAlign: 'right', marginBottom: 6 },
  label: { color: C.muted, fontSize: 12, fontWeight: '600', textAlign: 'right', marginTop: 12, marginBottom: 6 },
  input: ui.input,
  chips: { flexDirection: 'row-reverse', gap: 10 },
  chip: { flex: 1, borderWidth: 1.5, borderColor: 'transparent', borderRadius: 14, paddingVertical: 12, alignItems: 'center', backgroundColor: C.fill },
  chipText: { color: C.text, fontSize: 14, fontWeight: '600' },
  formError: { color: C.danger, fontSize: 13, fontWeight: '600', textAlign: 'right', marginTop: 12 },
});
