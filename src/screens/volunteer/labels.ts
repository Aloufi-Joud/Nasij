// Wording and colours shared by the volunteer screens. Labels are getters so they follow the app language.
import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../../theme';
import type { ClosedAs, Kind, Report, ReportType } from '../../mock';
import { langName, tr } from '../../i18n';

type Icon = ComponentProps<typeof Ionicons>['name'];

export const TYPE_UI: Record<ReportType, { label: string; color: string; bg: string; icon: Icon }> = {
  lost: { get label() { return tr('طفل مفقود', 'Lost child'); }, color: C.warn, bg: C.warnBg, icon: 'search' },
  emergency: { get label() { return tr('طلب مساعدة', 'Help request'); }, color: C.danger, bg: C.dangerBg, icon: 'alert-circle' },
  fall: { get label() { return tr('سقوط محتمل', 'Possible fall'); }, color: C.danger, bg: C.dangerBg, icon: 'body' },
};

export const KIND_UI: Record<Kind, { label: string; color: string }> = {
  child: { get label() { return tr('طفل', 'Child'); }, color: C.child },
  elder: { get label() { return tr('كبير سن', 'Elderly'); }, color: C.elder },
};

export const CLOSED_UI: Record<ClosedAs, { label: string; color: string; icon: Icon }> = {
  found: { get label() { return tr('وُجد وسُلِّم لأهله', 'Found and handed to family'); }, color: C.safe, icon: 'checkmark-circle' },
  security: { get label() { return tr('سُلِّم لفريق الأمن أو الإسعاف', 'Handed to security or ambulance'); }, color: C.primary, icon: 'shield-checkmark' },
  helped: { get label() { return tr('تمت مساعدته', 'Helped'); }, color: C.safe, icon: 'heart-circle' },
  expired: { get label() { return tr('انقفل تلقائيًا بعد مدة طويلة', 'Closed automatically after a long time'); }, color: C.faint, icon: 'time' },
};

// Older reports have no gender or language
export function whoLine(r: Report) {
  const { kind, gender, age, language } = r.member;
  return [
    KIND_UI[kind].label,
    gender && (gender === 'male' ? tr('ذكر', 'Male') : tr('أنثى', 'Female')),
    tr(`${age} سنة`, `${age} yrs`),
    language && tr(`يتكلم ${langName(language)}`, `Speaks ${langName(language)}`),
  ].filter(Boolean).join(' · ');
}

// "منذ دقيقتين" style, short
export function since(ms: number, now: number) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 10) return tr('الآن', 'now');
  if (s < 60) return tr(`قبل ${s} ث`, `${s}s ago`);
  const m = Math.round(s / 60);
  return tr(`قبل ${m} د`, `${m}m ago`);
}

export function clock(ms: number) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
