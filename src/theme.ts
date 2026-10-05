// Nasij shared theme (Step 0 draft: agree on it together, then everyone imports from here)
// Colours match the original prototype and the current App.tsx.
// Type-only import, so the web pages can import this file too.
import type { TextStyle, ViewStyle } from 'react-native';

export const C = {
  primary: '#0E3F3C',
  accent: '#5E8C85',
  mint: '#A8C8C4',
  bg: '#F4F4E9',
  card: '#FFFFFF',
  border: '#E8E4D8',
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
  title: 24,
  h1: 20,
  h2: 17,
  body: 15,
  small: 13,
  tiny: 11,
};

// Shared building blocks. App text is Arabic, so rows use row-reverse and text aligns right.
export const ui = {
  card: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  row: { flexDirection: 'row-reverse', alignItems: 'center' },
  sectionTitle: { color: C.primary, fontSize: F.h2, fontWeight: '700', textAlign: 'right', marginBottom: 12 },
  caption: { color: C.faint, fontSize: 12, fontWeight: '700', textAlign: 'right', marginTop: 22, marginBottom: 10 },
  text: { color: C.text, fontSize: F.body, textAlign: 'right' },
  muted: { color: C.muted, fontSize: F.small, textAlign: 'right' },
  btn: {
    backgroundColor: C.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row-reverse',
    gap: 8,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnGhost: {
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row-reverse',
    gap: 8,
  },
  btnGhostText: { color: C.primary, fontSize: 15, fontWeight: '700' },
  strip: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  stripText: { fontSize: 12.5, fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  dot: { width: 9, height: 9, borderRadius: 5 },
} satisfies Record<string, ViewStyle | TextStyle>;
