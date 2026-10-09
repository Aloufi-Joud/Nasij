// Arabic keyboards type ٠-٩. Keep digits only, as 0-9, so Number() works.
export function latinDigits(text: string) {
  return text.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[^0-9]/g, '');
}

// A duration as "2m 14s" (units passed in, so Arabic and the dashboard can use it): time from report to found
export function minSec(ms: number, m: string, s: string) {
  const sec = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(sec / 60)}${m} ${sec % 60}${s}`;
}
