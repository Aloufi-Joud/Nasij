// Nasij shared theme (Step 0 draft: agree on it together, then everyone imports from here)
// Colours match the original prototype and the current App.tsx.
// Type-only import, so the web pages can import this file too.
import type { TextStyle, ViewStyle } from 'react-native';

export const C = {
  primary: '#0E3F3C',
  accent: '#5E8C85',
  mint: '#A8C8C4',
  bg: '#F5F3EC',
  fill: '#EFECE3', // inputs, unselected chips, quiet surfaces
  card: '#FFFFFF',
  border: '#ECE8DD',
  inputBorder: '#E0DACE',
  text: '#1A1A1A',
  muted: '#6B7280',
  faint: '#9CA3AF',
  safe: '#1B6B3A',
  safeBg: '#E7F3EB',
  warn: '#D4841A',
  warnBg: '#FFF8E6',
  warnBorder: '#F0D080',
  danger: '#C0392B',
  dangerBg: '#FDECEA',
  dangerBorder: '#F5A5A0',
  techBg: '#EEF5F4',
  barOff: '#D4CFC4',
  child: '#D4A574',
  elder: '#7B8EC8',
};

export const F = {
  title: 28,
  h1: 22,
  h2: 17,
  body: 15,
  small: 13,
  tiny: 11,
};

// Soft, wide shadows tinted with the brand teal: surfaces lift without hard edges
export const shadow = {
  card: { shadowColor: '#0E3F3C', shadowOpacity: 0.07, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3 },
  tile: { shadowColor: '#0E3F3C', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
} satisfies Record<string, ViewStyle>;

const btnBase: ViewStyle = {
  borderRadius: 16,
  paddingVertical: 16,
  paddingHorizontal: 18,
  alignItems: 'center',
  justifyContent: 'center',
  flexDirection: 'row-reverse',
  gap: 8,
};

// Shared building blocks. App text is Arabic, so rows use row-reverse and text aligns right.
export const ui = {
  // Borderless white surface. The transparent border keeps room for warn/selected border colours.
  card: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...shadow.card,
  },
  // Smaller list row / stat surface
  tile: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...shadow.tile,
  },
  // Filled input: quiet until typed in
  input: {
    backgroundColor: C.fill,
    borderWidth: 1.5,
    borderColor: 'transparent',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    fontSize: 15,
    color: C.text,
  },
  row: { flexDirection: 'row-reverse', alignItems: 'center' },
  sectionTitle: { color: C.primary, fontSize: F.h1, fontWeight: '800', textAlign: 'right', marginBottom: 14 },
  caption: { color: C.muted, fontSize: 12.5, fontWeight: '700', textAlign: 'right', marginTop: 24, marginBottom: 10 },
  text: { color: C.text, fontSize: F.body, textAlign: 'right' },
  muted: { color: C.muted, fontSize: F.small, textAlign: 'right', lineHeight: 19 },
  btn: { ...btnBase, backgroundColor: C.primary },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  // Secondary action: tinted fill instead of an outline
  btnGhost: { ...btnBase, backgroundColor: C.techBg },
  btnGhostText: { color: C.primary, fontSize: 15, fontWeight: '700' },
  strip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  stripText: { fontSize: 13, fontWeight: '600', textAlign: 'right', flexShrink: 1, lineHeight: 19 },
  dot: { width: 9, height: 9, borderRadius: 5 },
} satisfies Record<string, ViewStyle | TextStyle>;
