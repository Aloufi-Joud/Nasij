// The app font on every Text and TextInput. Weights come from fontWeight: the faces are registered in app.json.
// Screens are written right-to-left; in English, App sets direction 'rtl' on the root, and React Native
// then swaps textAlign left/right by itself (RCTAttributedTextUtils.mm), so Text needs no flip of its own.
import { Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps } from 'react-native';
import { isEn } from '../i18n';

const font = { fontFamily: 'IBM Plex Sans Arabic' };

export function Text(p: TextProps) {
  return <RNText {...p} style={[font, p.style]} />;
}

// React Native does not swap textAlign on a TextInput under the root 'rtl', so inputs flip here:
// 'right' (the default for Arabic-first screens) becomes 'left' in English. 'left' holds Latin text (email) and stays left.
export function TextInput(p: TextInputProps) {
  const flip = isEn() && p.textAlign === 'right';
  return <RNTextInput {...p} textAlign={flip ? 'left' : p.textAlign} style={[font, p.style]} />;
}
