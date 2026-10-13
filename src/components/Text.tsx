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
  const align = flip ? 'left' : p.textAlign;
  // letterSpacing 0 by default: iOS reuses native inputs, and spacing left from another input (the 6-digit code)
  // pulls Arabic letters apart (the placeholder showed "أ و  معلم  قر يب").
  // Alignment also goes in the style: otherwise Latin text (a password) follows its own direction and sits on the left in Arabic
  return <RNTextInput {...p} textAlign={align} style={[font, { letterSpacing: 0 }, align && { textAlign: align }, p.style]} />;
}
