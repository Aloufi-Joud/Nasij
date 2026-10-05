// Shared look for the app and the web pages (from the original prototype).
// Plain objects, no react-native import, so web/ can import it too.

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
  warn: '#D4841A',
  danger: '#C0392B',
  warnBg: '#FFF8E6',
  warnBorder: '#F0D080',
  dangerBg: '#FDECEA',
  child: '#D4A574',
  elder: '#7B8EC8',
};

export const F = {
  caption: 12,
  small: 12.5,
  body: 14,
  input: 15,
  button: 16,
  title: 17,
  header: 24,
};

// App text is Arabic, right to left: rows use row-reverse, text aligns right
export const S = {
  row: { flexDirection: 'row-reverse', alignItems: 'center' },
  card: {
    backgroundColor: C.card, borderRadius: 18, padding: 16, borderWidth: 1.5, borderColor: C.border,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
  },
  title: { color: C.primary, fontSize: F.title, fontWeight: '700', textAlign: 'right' },
  label: { color: C.muted, fontSize: F.caption, fontWeight: '600', textAlign: 'right', marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.inputBorder, borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 14, fontSize: F.input, color: C.text,
  },
  button: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: F.button, fontWeight: '700' },
  dangerButton: { backgroundColor: C.danger, borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
} as const;
