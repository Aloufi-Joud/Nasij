// The app font on every Text and TextInput. Weights come from fontWeight: the faces are registered in app.json.
// Screens are written right-to-left; in English, App sets direction 'rtl' on the root, and React Native
// then swaps textAlign left/right by itself (RCTAttributedTextUtils.mm), so Text needs no flip of its own.
import { Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps } from 'react-native';
import { isEn } from '../i18n';

const font = { fontFamily: 'IBM Plex Sans Arabic' };

export function Text(p: TextProps) {
  return <RNText {...p} style={[font, p.style]} />;
}

// An input set to 'left' holds Latin text (email) in both languages: pre-swap it so it stays left in English
export function TextInput(p: TextInputProps) {
  const left = isEn() && p.textAlign === 'left';
  return <RNTextInput {...p} textAlign={left ? 'right' : p.textAlign} style={[font, p.style]} />;
}
