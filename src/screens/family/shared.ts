// What the family pages share: members as the family edits them, zones and their labels, and the map helpers
import { Alert } from 'react-native';
import { C } from '../../theme';
import { MAX_AGE, type Gender, type Kind, type Language, type Point } from '../../mock';
import type { Signal } from '../../ble/signal';
import { tr } from '../../i18n';

// ponytail: event boundary = circle around the family's first location, so it can be tested anywhere.
// Phase 2: the real event boundary from Firestore.
export const EVENT_RADIUS_M = 150;

export type Zone = 'NEAR' | 'MEDIUM' | 'FAR' | 'LOST';
export type LogKind = Zone | 'SOS' | 'FALL' | 'REPORT' | 'FOUND' | 'EDGE' | 'CANCELLED';
export type LogItem = { time: string; kind: LogKind; who: string };
// What the screen shows per bracelet, copied from the tracks twice a second
export type Live = { signal: Signal | null; zone: Zone | null; radius: number; edge: boolean; accuracy: Accuracy | null };
// How much to trust the distance: from how far apart the last readings are. near/far = metres from the strongest/weakest one.
export type Accuracy = { level: 'measuring' | 'good' | 'fair' | 'poor'; near: number; far: number };

// A member as the family edits it (age and phone as typed), plus the linked bracelet
export type Form = {
  name: string; kind: Kind; gender: Gender; age: string; language: Language;
  phone: string; description: string; condition: string; notes: string;
  photo: string | null; // today's clothes: on this phone only (never in members/), sent with a report
};
export type FamMember = Form & { id: string; mac: string | null };
export const EMPTY: Form = {
  name: '', kind: 'child', gender: 'male', age: '', language: 'ar', phone: '', description: '', condition: '', notes: '', photo: null,
};
export const KIND_UI: Record<Kind, { label: string; color: string }> = {
  child: { get label() { return tr('طفل', 'Child'); }, color: C.child },
  elder: { get label() { return tr('كبير سن', 'Elderly'); }, color: C.elder },
};
export const GENDER_UI: Record<Gender, string> = {
  get male() { return tr('ذكر', 'Male'); },
  get female() { return tr('أنثى', 'Female'); },
};

// What stops the form from saving, or null. A child needs a parent's phone: the volunteer calls it.
export function formError(f: Form): string | null {
  if (!f.name.trim()) return tr('اكتب الاسم', 'Enter the name');
  if (!f.age) return tr('اكتب العمر', 'Enter the age');
  if (Number(f.age) > MAX_AGE[f.kind])
    return tr(`العمر لازم يكون ${MAX_AGE[f.kind]} سنة أو أقل لـ${KIND_UI[f.kind].label}`, `Age must be ${MAX_AGE[f.kind]} or under for ${KIND_UI[f.kind].label.toLowerCase()}`);
  if (f.kind === 'child' && !f.phone) return tr('اكتب رقم جوال ولي الأمر', 'Enter the guardian’s phone number');
  if (f.phone && !/^\d{9,15}$/.test(f.phone)) return tr('رقم الجوال غير صحيح', 'Invalid phone number');
  return null;
}

export const ZONE_UI: Record<LogKind, { label: string; color: string }> = {
  SOS: { get label() { return tr('طلب مساعدة', 'Help request'); }, color: C.danger },
  CANCELLED: { get label() { return tr('ألغيت طلب المساعدة: ضغطة بالغلط', 'Help request cancelled: pressed by mistake'); }, color: C.muted },
  FALL: { get label() { return tr('احتمال سقوط', 'Possible fall'); }, color: C.danger },
  REPORT: { get label() { return tr('بلاغ للمتطوعين', 'Reported to volunteers'); }, color: C.danger },
  FOUND: { get label() { return tr('انقفل البلاغ', 'Report closed'); }, color: C.safe },
  EDGE: { get label() { return tr('قرب حدود الفعالية', 'Near the event edge'); }, color: C.danger },
  NEAR: { get label() { return tr('قريب منك', 'Close to you'); }, color: C.safe },
  MEDIUM: { get label() { return tr('مسافة متوسطة', 'Medium distance'); }, color: C.warn },
  FAR: { get label() { return tr('بعيد عنك', 'Far from you'); }, color: C.danger },
  LOST: { get label() { return tr('انقطعت الإشارة', 'Signal lost'); }, color: C.danger },
};

export const failed = (title: string) => Alert.alert(title, tr('تأكد من الاتصال بالإنترنت وحاول مرة ثانية.', 'Check your internet connection and try again.'));

// The point `metres` away from p in direction `deg` (0 = north), for the name on each circle's edge
export function offset(p: Point, metres: number, deg: number): Point {
  const rad = (deg * Math.PI) / 180;
  return {
    latitude: p.latitude + (metres * Math.cos(rad)) / 111_320,
    longitude: p.longitude + (metres * Math.sin(rad)) / (111_320 * Math.cos((p.latitude * Math.PI) / 180)),
  };
}
