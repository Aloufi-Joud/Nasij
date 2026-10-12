// A photo of the person in today's clothes: take it with the camera or pick it from the gallery.
// Kept as a data URI, the form firestore.rules accepts for a report photo.
import { Alert, Image, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { Pressable } from './Motion';
import { C, F } from '../theme';
import { reports } from '../mock';
import { tr } from '../i18n';

// Builds installed before expo-image-picker have no native module: fall back to the demo photo there
const FAKE_PHOTO = reports[0].photo;
let ImagePicker: typeof import('expo-image-picker') | null = null;
// eslint-disable-next-line @typescript-eslint/no-require-imports
try { ImagePicker = require('expo-image-picker'); } catch {}

// Same cap as firestore.rules for private/photo (the photo is stored inside the document)
const MAX_PHOTO = 700_000;

// ponytail: size is kept down by JPEG quality only; a large camera photo can still pass the cap and be refused.
// Resize with expo-image-manipulator if that happens often
export async function pickPhoto(camera: boolean): Promise<string | null> {
  if (!ImagePicker) return FAKE_PHOTO;
  const opts = { mediaTypes: ['images'] as ('images')[], allowsEditing: true, quality: camera ? 0.1 : 0.2, base64: true };
  let res;
  if (camera) {
    try {
      if (!(await ImagePicker.requestCameraPermissionsAsync()).granted) {
        Alert.alert(tr('الكاميرا مقفلة', 'Camera is off'), tr('اسمحي لنسيج بالكاميرا من الإعدادات، أو اختاري صورة من الألبوم', 'Allow Nasij to use the camera in Settings, or pick a photo from the gallery'));
        return null;
      }
      res = await ImagePicker.launchCameraAsync(opts);
    } catch {
      // Builds made before the camera permission was added to app.json
      Alert.alert(tr('الكاميرا غير متاحة', 'Camera not available'), tr('اختاري صورة من الألبوم', 'Pick a photo from the gallery'));
      return null;
    }
  } else res = await ImagePicker.launchImageLibraryAsync(opts);
  const b64 = res.canceled ? null : res.assets[0].base64;
  if (!b64) return null;
  const uri = `data:image/jpeg;base64,${b64}`;
  if (uri.length >= MAX_PHOTO) {
    Alert.alert(tr('الصورة كبيرة', 'Photo too large'), tr('قصّي الصورة أقرب على الشخص وجربي مرة ثانية', 'Crop the photo closer to the person and try again'));
    return null;
  }
  return uri;
}

export function PhotoField(p: { value: string | null; onChange: (photo: string | null) => void }) {
  const pick = async (camera: boolean) => {
    const photo = await pickPhoto(camera);
    if (photo) p.onChange(photo);
  };
  if (p.value)
    return (
      <View style={s.box}>
        <Image source={{ uri: p.value }} style={s.photo} />
        <Pressable style={s.remove} hitSlop={8} onPress={() => p.onChange(null)} accessibilityRole="button" accessibilityLabel={tr('حذف الصورة', 'Remove photo')}>
          <Ionicons name="close" size={16} color="#fff" />
        </Pressable>
      </View>
    );
  return (
    <View style={[s.box, s.empty]}>
      <Pressable style={s.option} onPress={() => pick(true)}>
        <Ionicons name="camera-outline" size={26} color={C.accent} />
        <Text style={s.optionText}>{tr('التقط صورة', 'Take a photo')}</Text>
      </Pressable>
      <View style={s.divider} />
      <Pressable style={s.option} onPress={() => pick(false)}>
        <Ionicons name="images-outline" size={26} color={C.accent} />
        <Text style={s.optionText}>{tr('من الألبوم', 'From gallery')}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  box: { height: 150, borderRadius: 18, backgroundColor: C.fill, overflow: 'hidden', marginBottom: 6 },
  empty: { flexDirection: 'row-reverse', alignItems: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.inputBorder },
  option: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 4 },
  optionText: { color: C.accent, fontSize: F.small, fontWeight: '600' },
  divider: { width: 1, height: '50%', backgroundColor: C.inputBorder },
  photo: { width: '100%', height: '100%' },
  remove: {
    position: 'absolute', top: 8, left: 8, width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },
});
