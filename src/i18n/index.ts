import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { usePrefs } from '../store/prefs';
import { en } from './en';
import { it } from './it';

const lang = usePrefs.getState().lang;
document.documentElement.lang = lang;

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, it: { translation: it } },
  lng: lang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes
});

// Language switch → i18next (EN/IT switch in every top bar, saved per user).
usePrefs.subscribe((s, prev) => {
  if (s.lang !== prev.lang) void i18n.changeLanguage(s.lang);
});

export default i18n;
