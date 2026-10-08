// App language: Arabic (default) or English. Every screen string is written as tr('عربي', 'English'),
// so both languages sit together at the call site. App re-renders the whole tree when the language changes.
// ponytail: the choice is not saved, the app opens in Arabic each time; persist it if users ask
import { useSyncExternalStore } from 'react';
import type { Language } from './mock';

export type UiLang = 'ar' | 'en';

let lang: UiLang = 'ar';
const subs = new Set<() => void>();

export const isEn = () => lang === 'en';
export const tr = (ar: string, en: string) => (lang === 'en' ? en : ar);

export function toggleLang() {
  lang = lang === 'en' ? 'ar' : 'en';
  subs.forEach((f) => f());
}

export function useLang() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => lang,
  );
}

// Names of the languages a member speaks, in the app's language
const AR_NAMES: Record<Language, string> = {
  ar: 'العربية', en: 'الإنجليزية', ur: 'الأردية', hi: 'الهندية', bn: 'البنغالية', id: 'الإندونيسية', fr: 'الفرنسية', tr: 'التركية',
};
const EN_NAMES: Record<Language, string> = {
  ar: 'Arabic', en: 'English', ur: 'Urdu', hi: 'Hindi', bn: 'Bengali', id: 'Indonesian', fr: 'French', tr: 'Turkish',
};
export const langName = (l: Language) => (lang === 'en' ? EN_NAMES : AR_NAMES)[l];
