// Arabic keyboards type ٠-٩. Keep digits only, as 0-9, so Number() works.
export function latinDigits(text: string) {
  return text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[^0-9]/g, '');
}
