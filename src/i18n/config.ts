import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import zhTW from './locales/zh-TW.json';
import zhHK from './locales/zh-HK.json';
import zhCN from './locales/zh-CN.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import es from './locales/es.json';
import de from './locales/de.json';
import fr from './locales/fr.json';
import vi from './locales/vi.json';
import pt from './locales/pt.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en.translation },
      'zh-TW': { translation: zhTW.translation },
      'zh-HK': { translation: zhHK.translation },
      'zh-CN': { translation: zhCN.translation },
      zh: { translation: zhCN.translation }, // fallback for zh
      ja: { translation: ja.translation },
      ko: { translation: ko.translation },
      es: { translation: es.translation },
      de: { translation: de.translation },
      fr: { translation: fr.translation },
      vi: { translation: vi.translation },
      pt: { translation: pt.translation },
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already does escaping
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    }
  });

export default i18n;
