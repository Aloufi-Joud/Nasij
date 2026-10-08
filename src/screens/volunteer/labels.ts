// Wording and colours shared by the volunteer screens
import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../../theme';
import { LANGUAGES, type ClosedAs, type Kind, type Report, type ReportType } from '../../mock';

type Icon = ComponentProps<typeof Ionicons>['name'];

export const TYPE_UI: Record<ReportType, { label: string; color: string; bg: string; icon: Icon }> = {
  lost: { label: 'طفل مفقود', color: C.warn, bg: C.warnBg, icon: 'search' },
  emergency: { label: 'طلب مساعدة', color: C.danger, bg: C.dangerBg, icon: 'alert-circle' },
  fall: { label: 'سقوط محتمل', color: C.danger, bg: C.dangerBg, icon: 'body' },
};

export const KIND_UI: Record<Kind, { label: string; color: string }> = {
  child: { label: 'طفل', color: C.child },
  elder: { label: 'كبير سن', color: C.elder },
};

export const CLOSED_UI: Record<ClosedAs, { label: string; color: string; icon: Icon }> = {
  found: { label: 'وُجد وسُلِّم لأهله', color: C.safe, icon: 'checkmark-circle' },
  security: { label: 'سُلِّم لفريق الأمن أو الإسعاف', color: C.primary, icon: 'shield-checkmark' },
  helped: { label: 'تمت مساعدته', color: C.safe, icon: 'heart-circle' },
};

// Older reports have no gender or language
export function whoLine(r: Report) {
  const { kind, gender, age, language } = r.member;
  return [
    KIND_UI[kind].label,
    gender && (gender === 'male' ? 'ذكر' : 'أنثى'),
    `${age} سنة`,
    language && `يتكلم ${LANGUAGES[language]}`,
  ].filter(Boolean).join(' · ');
}

// "منذ دقيقتين" style, short and Arabic
export function since(ms: number, now: number) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 10) return 'الآن';
  if (s < 60) return `قبل ${s} ث`;
  const m = Math.round(s / 60);
  return `قبل ${m} د`;
}

export function clock(ms: number) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
