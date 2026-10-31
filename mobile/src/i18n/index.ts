import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

void i18n.use(initReactI18next).init({
  lng: 'en', fallbackLng: 'en', supportedLngs: ['en'],
  resources: { en: { translation: {
    home: 'Good morning', analytics: 'Analytics', assistant: 'AI Assistant', tools: 'Business tools', profile: 'Profile',
  } } },
  interpolation: { escapeValue: false },
});

export default i18n;
