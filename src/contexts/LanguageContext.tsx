import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppLanguage } from '../types';

const LANG_STORAGE_KEY = 'shalom_language';

export interface LanguageOption {
  code: string;
  nativeName: string;
  labelFr: string;
  rtl?: boolean;
}

export const WORLD_LANGUAGES: LanguageOption[] = [
  { code: 'fr', nativeName: 'Français', labelFr: 'Français' },
  { code: 'en', nativeName: 'English', labelFr: 'Anglais' },
  { code: 'es', nativeName: 'Español', labelFr: 'Espagnol' },
  { code: 'pt', nativeName: 'Português', labelFr: 'Portugais' },
  { code: 'it', nativeName: 'Italiano', labelFr: 'Italien' },
  { code: 'de', nativeName: 'Deutsch', labelFr: 'Allemand' },
  { code: 'nl', nativeName: 'Nederlands', labelFr: 'Néerlandais' },
  { code: 'ln', nativeName: 'Lingála', labelFr: 'Lingala' },
  { code: 'sw', nativeName: 'Kiswahili', labelFr: 'Swahili' },
  { code: 'wo', nativeName: 'Wolof', labelFr: 'Wolof' },
  { code: 'bm', nativeName: 'Bamanankan', labelFr: 'Bambara' },
  { code: 'yo', nativeName: 'Yorùbá', labelFr: 'Yoruba' },
  { code: 'ig', nativeName: 'Igbo', labelFr: 'Igbo' },
  { code: 'ha', nativeName: 'Hausa', labelFr: 'Haoussa' },
  { code: 'rw', nativeName: 'Kinyarwanda', labelFr: 'Kinyarwanda' },
  { code: 'rn', nativeName: 'Kirundi', labelFr: 'Kirundi' },
  { code: 'mg', nativeName: 'Malagasy', labelFr: 'Malgache' },
  { code: 'am', nativeName: 'አማርኛ', labelFr: 'Amharique' },
  { code: 'zu', nativeName: 'isiZulu', labelFr: 'Zoulou' },
  { code: 'xh', nativeName: 'isiXhosa', labelFr: 'Xhosa' },
  { code: 'af', nativeName: 'Afrikaans', labelFr: 'Afrikaans' },
  { code: 'ht', nativeName: 'Kreyòl Ayisyen', labelFr: 'Créole haïtien' },
  { code: 'ar', nativeName: 'العربية', labelFr: 'Arabe', rtl: true },
  { code: 'he', nativeName: 'עברית', labelFr: 'Hébreu', rtl: true },
  { code: 'fa', nativeName: 'فارسی', labelFr: 'Persan', rtl: true },
  { code: 'ur', nativeName: 'اردو', labelFr: 'Ourdou', rtl: true },
  { code: 'zh', nativeName: '中文', labelFr: 'Chinois (Mandarin)' },
  { code: 'ja', nativeName: '日本語', labelFr: 'Japonais' },
  { code: 'ko', nativeName: '한국어', labelFr: 'Coréen' },
  { code: 'hi', nativeName: 'हिन्दी', labelFr: 'Hindi' },
  { code: 'bn', nativeName: 'বাংলা', labelFr: 'Bengali' },
  { code: 'ta', nativeName: 'தமிழ்', labelFr: 'Tamoul' },
  { code: 'vi', nativeName: 'Tiếng Việt', labelFr: 'Vietnamien' },
  { code: 'id', nativeName: 'Bahasa Indonesia', labelFr: 'Indonésien' },
  { code: 'ms', nativeName: 'Bahasa Melayu', labelFr: 'Malais' },
  { code: 'tl', nativeName: 'Tagalog / Filipino', labelFr: 'Tagalog' },
  { code: 'th', nativeName: 'ไทย', labelFr: 'Thaï' },
  { code: 'ru', nativeName: 'Русский', labelFr: 'Russe' },
  { code: 'uk', nativeName: 'Українська', labelFr: 'Ukrainien' },
  { code: 'pl', nativeName: 'Polski', labelFr: 'Polonais' },
  { code: 'ro', nativeName: 'Română', labelFr: 'Roumain' },
  { code: 'el', nativeName: 'Ελληνικά', labelFr: 'Grec' },
  { code: 'tr', nativeName: 'Türkçe', labelFr: 'Turc' },
  { code: 'sv', nativeName: 'Svenska', labelFr: 'Suédois' },
  { code: 'no', nativeName: 'Norsk', labelFr: 'Norvégien' },
  { code: 'da', nativeName: 'Dansk', labelFr: 'Danois' },
  { code: 'fi', nativeName: 'Suomi', labelFr: 'Finnois' },
  { code: 'cs', nativeName: 'Čeština', labelFr: 'Tchèque' },
  { code: 'sk', nativeName: 'Slovenčina', labelFr: 'Slovaque' },
  { code: 'hu', nativeName: 'Magyar', labelFr: 'Hongrois' },
  { code: 'bg', nativeName: 'Български', labelFr: 'Bulgare' },
  { code: 'hr', nativeName: 'Hrvatski', labelFr: 'Croate' },
  { code: 'sr', nativeName: 'Српски', labelFr: 'Serbe' },
  { code: 'ca', nativeName: 'Català', labelFr: 'Catalan' },
  { code: 'eu', nativeName: 'Euskara', labelFr: 'Basque' },
  { code: 'gl', nativeName: 'Galego', labelFr: 'Galicien' },
  { code: 'ga', nativeName: 'Gaeilge', labelFr: 'Irlandais' },
  { code: 'sq', nativeName: 'Shqip', labelFr: 'Albanais' },
  { code: 'hy', nativeName: 'Հայերեն', labelFr: 'Arménien' },
  { code: 'ka', nativeName: 'ქართული', labelFr: 'Géorgien' },
  { code: 'la', nativeName: 'Latine', labelFr: 'Latin' },
];

const TRANSLATIONS: Record<string, Record<string, string>> = {
  fr: {
    'nav.dashboard': 'Accueil',
    'nav.altar': 'Mon Autel',
    'nav.prayers': 'Prières & Témoignages',
    'nav.journey': 'Parcours Spirituel',
    'nav.parole': 'Parole Divine',
    'nav.studios': 'Studios Créatifs',
    'nav.vault': 'Coffre Spirituel',
    'nav.calendar': 'Mon Calendrier',
    'nav.contacts': 'Mes Contacts',
    'nav.messaging': 'Partage WhatsApp / SMS',
    'nav.settings': 'Paramètres',
    'header.back': 'Retour',
    'header.home': 'Menu principal',
    'header.tagline': 'SHALOM · La foi au quotidien',
    'header.install': 'Installer',
    'header.lock': 'Verrouiller',
    'sidebar.subtitle': 'Compagnon Spirituel',
    'sidebar.motto': 'La foi au quotidien, la paix dans le cœur.',
    'bottom.home': 'Accueil',
    'bottom.altar': 'Autel',
    'bottom.prayers': 'Prières',
    'bottom.parole': 'Parole',
    'bottom.more': 'Plus',
    'bottom.menuTitle': 'Menu SHALOM',
    'dashboard.peace': 'Paix du Seigneur',
    'dashboard.newPrayer': 'Nouvelle prière',
    'dashboard.recordParole': 'Enregistrer Parole',
    'dashboard.share': 'Partager WhatsApp / SMS',
    'dashboard.activePrayers': 'Mes prières actives',
    'dashboard.testimonies': 'Témoignages',
    'dashboard.recordedParoles': 'Paroles enregistrées',
    'dashboard.upcomingEvents': 'Rendez-vous à venir',
    'dashboard.recentPrayers': 'Mes Dernières Prières',
    'dashboard.seeAll': 'Tout voir',
    'dashboard.upcomingTitle': 'Prochains Rendez-vous',
    'dashboard.openCalendar': 'Ouvrir mon calendrier →',
    'settings.title': 'Paramètres & Sécurité',
    'settings.subtitle': 'Profil personnel, langue, protection au choix et sauvegarde locale',
    'settings.tabGeneral': 'Mon Profil',
    'settings.tabSecurity': 'Protection au choix',
    'settings.tabBackup': 'Sauvegarde',
    'settings.languageLabel': 'Langue de l’application (Toutes les langues)',
    'settings.languageDesc': 'Choisissez n’importe quelle langue d’affichage dans la liste complète',
    'settings.save': 'Enregistrer',
    'settings.saving': 'Enregistrement en cours...',
    'common.cancel': 'Annuler',
    'common.save': 'Enregistrer',
    'common.delete': 'Supprimer',
    'common.share': 'Partager',
    'common.close': 'Fermer',
  },
  en: {
    'nav.dashboard': 'Home',
    'nav.altar': 'My Altar',
    'nav.prayers': 'Prayers & Testimonies',
    'nav.journey': 'Spiritual Journey',
    'nav.parole': 'Divine Word',
    'nav.studios': 'Creative Studios',
    'nav.vault': 'Spiritual Vault',
    'nav.calendar': 'My Calendar',
    'nav.contacts': 'My Contacts',
    'nav.messaging': 'WhatsApp / SMS Share',
    'nav.settings': 'Settings',
    'header.back': 'Back',
    'header.home': 'Home',
    'header.tagline': 'SHALOM · Daily Faith',
    'header.install': 'Install',
    'header.lock': 'Lock',
    'sidebar.subtitle': 'Spiritual Companion',
    'sidebar.motto': 'Daily faith, peace in the heart.',
    'bottom.home': 'Home',
    'bottom.altar': 'Altar',
    'bottom.prayers': 'Prayers',
    'bottom.parole': 'Word',
    'bottom.more': 'More',
    'bottom.menuTitle': 'SHALOM Menu',
    'dashboard.peace': 'Peace of the Lord',
    'dashboard.newPrayer': 'New Prayer',
    'dashboard.recordParole': 'Record Word',
    'dashboard.share': 'Share WhatsApp / SMS',
    'dashboard.activePrayers': 'Active Prayers',
    'dashboard.testimonies': 'Testimonies',
    'dashboard.recordedParoles': 'Recorded Words',
    'dashboard.upcomingEvents': 'Upcoming Events',
    'dashboard.recentPrayers': 'My Latest Prayers',
    'dashboard.seeAll': 'See all',
    'dashboard.upcomingTitle': 'Upcoming Schedule',
    'dashboard.openCalendar': 'Open my calendar →',
    'settings.title': 'Settings & Security',
    'settings.subtitle': 'Personal profile, language, optional lock & local backup',
    'settings.tabGeneral': 'My Profile',
    'settings.tabSecurity': 'Security Lock',
    'settings.tabBackup': 'Backup',
    'settings.languageLabel': 'Application Language (All Languages)',
    'settings.languageDesc': 'Choose any display language from the full world language selector',
    'settings.save': 'Save',
    'settings.saving': 'Saving...',
    'common.cancel': 'Cancel',
    'common.save': 'Save',
    'common.delete': 'Delete',
    'common.share': 'Share',
    'common.close': 'Close',
  },
  es: {
    'nav.dashboard': 'Inicio',
    'nav.altar': 'Mi Altar',
    'nav.prayers': 'Oraciones y Testimonios',
    'nav.journey': 'Camino Espiritual',
    'nav.parole': 'Palabra Divina',
    'nav.studios': 'Estudios Creativos',
    'nav.vault': 'Cofre Espiritual',
    'nav.calendar': 'Mi Calendario',
    'nav.contacts': 'Mis Contactos',
    'nav.messaging': 'Compartir WhatsApp / SMS',
    'nav.settings': 'Ajustes',
    'header.back': 'Volver',
    'header.home': 'Inicio',
    'header.tagline': 'SHALOM · Fe diaria',
    'header.install': 'Instalar',
    'header.lock': 'Bloquear',
    'sidebar.subtitle': 'Compañero Espiritual',
    'sidebar.motto': 'Fe cotidiana, paz en el corazón.',
    'bottom.home': 'Inicio',
    'bottom.altar': 'Altar',
    'bottom.prayers': 'Oraciones',
    'bottom.parole': 'Palabra',
    'bottom.more': 'Más',
    'bottom.menuTitle': 'Menú SHALOM',
    'dashboard.peace': 'Paz del Señor',
    'dashboard.newPrayer': 'Nueva oración',
    'dashboard.recordParole': 'Grabar Palabra',
    'dashboard.share': 'Compartir WhatsApp / SMS',
    'dashboard.activePrayers': 'Oraciones activas',
    'dashboard.testimonies': 'Testimonios',
    'dashboard.recordedParoles': 'Palabras grabadas',
    'dashboard.upcomingEvents': 'Próximos eventos',
    'settings.languageLabel': 'Idioma de la aplicación (Todos los idiomas)',
    'settings.languageDesc': 'Elige cualquier idioma de visualización',
    'settings.save': 'Guardar',
  },
  pt: {
    'nav.dashboard': 'Início',
    'nav.altar': 'Meu Altar',
    'nav.prayers': 'Orações e Testemunhos',
    'nav.journey': 'Jornada Espiritual',
    'nav.parole': 'Palavra Divina',
    'nav.studios': 'Estúdios Criativos',
    'nav.vault': 'Cofre Espiritual',
    'nav.calendar': 'Meu Calendário',
    'nav.contacts': 'Meus Contatos',
    'nav.messaging': 'Partilhar WhatsApp / SMS',
    'nav.settings': 'Definições',
    'header.back': 'Voltar',
    'header.home': 'Início',
    'header.tagline': 'SHALOM · Fé diária',
    'header.install': 'Instalar',
    'header.lock': 'Bloquear',
    'sidebar.subtitle': 'Companheiro Espiritual',
    'sidebar.motto': 'Fé diária, paz no coração.',
    'bottom.home': 'Início',
    'bottom.altar': 'Altar',
    'bottom.prayers': 'Orações',
    'bottom.parole': 'Palavra',
    'bottom.more': 'Mais',
    'bottom.menuTitle': 'Menu SHALOM',
    'dashboard.peace': 'Paz do Senhor',
    'dashboard.newPrayer': 'Nova oração',
    'dashboard.recordParole': 'Gravar Palavra',
    'dashboard.share': 'Partilhar WhatsApp / SMS',
    'dashboard.activePrayers': 'Orações ativas',
    'dashboard.testimonies': 'Testemunhos',
    'dashboard.recordedParoles': 'Palavras gravadas',
    'dashboard.upcomingEvents': 'Próximos eventos',
    'settings.languageLabel': 'Idioma do aplicativo (Todos os idiomas)',
    'settings.languageDesc': 'Escolha qualquer idioma de exibição',
    'settings.save': 'Salvar',
  },
  ln: {
    'nav.dashboard': 'Liboso',
    'nav.altar': 'Etumbelo na Ngai',
    'nav.prayers': 'Mabondeli & Matatoli',
    'nav.journey': 'Mobembo ya Molimo',
    'nav.parole': 'Liloba ya Nzambe',
    'nav.studios': 'Bisika ya Kosala',
    'nav.vault': 'Sanduku ya Molimo',
    'nav.calendar': 'Manaka na Ngai',
    'nav.contacts': 'Baninga na Ngai',
    'nav.messaging': 'Kotinda WhatsApp / SMS',
    'nav.settings': 'Mibeko',
    'header.back': 'Zonga',
    'header.home': 'Liboso',
    'bottom.home': 'Liboso',
    'bottom.altar': 'Etumbelo',
    'bottom.prayers': 'Mabondeli',
    'bottom.parole': 'Liloba',
    'bottom.more': 'Mosusu',
    'dashboard.peace': 'Kimya ya Nkolo',
  },
  sw: {
    'nav.dashboard': 'Nyumbani',
    'nav.altar': 'Madhabahu Yangu',
    'nav.prayers': 'Maombi & Shuhuda',
    'nav.journey': 'Safari ya Kiroho',
    'nav.parole': 'Neno la Mungu',
    'nav.studios': 'Studio za Ubunifu',
    'nav.vault': 'Hazina ya Kiroho',
    'nav.calendar': 'Kalenda Yangu',
    'nav.contacts': 'Anwani Zangu',
    'nav.messaging': 'Shiriki WhatsApp / SMS',
    'nav.settings': 'Mipangilio',
    'header.back': 'Rudi',
    'header.home': 'Nyumbani',
    'bottom.home': 'Nyumbani',
    'bottom.altar': 'Madhabahu',
    'bottom.prayers': 'Maombi',
    'bottom.parole': 'Neno',
    'bottom.more': 'Zaidi',
    'dashboard.peace': 'Amani ya Bwana',
  },
  de: {
    'nav.dashboard': 'Startseite',
    'nav.altar': 'Mein Altar',
    'nav.prayers': 'Gebete & Zeugnisse',
    'nav.journey': 'Geistlicher Weg',
    'nav.parole': 'Gottes Wort',
    'nav.studios': 'Kreativ-Studios',
    'nav.vault': 'Geistlicher Tresor',
    'nav.calendar': 'Mein Kalender',
    'nav.contacts': 'Meine Kontakte',
    'nav.messaging': 'WhatsApp / SMS teilen',
    'nav.settings': 'Einstellungen',
    'header.back': 'Zurück',
    'header.home': 'Startseite',
    'bottom.home': 'Start',
    'bottom.altar': 'Altar',
    'bottom.prayers': 'Gebete',
    'bottom.parole': 'Wort',
    'bottom.more': 'Mehr',
    'dashboard.peace': 'Friede des Herrn',
  },
  it: {
    'nav.dashboard': 'Home',
    'nav.altar': 'Il Mio Altare',
    'nav.prayers': 'Preghiere e Testimonianze',
    'nav.journey': 'Cammino Spirituale',
    'nav.parole': 'Parola Divina',
    'nav.studios': 'Studi Creativi',
    'nav.vault': 'Scrigno Spirituale',
    'nav.calendar': 'Il Mio Calendario',
    'nav.contacts': 'I Miei Contatti',
    'nav.messaging': 'Condividi WhatsApp / SMS',
    'nav.settings': 'Impostazioni',
    'header.back': 'Indietro',
    'header.home': 'Home',
    'bottom.home': 'Home',
    'bottom.altar': 'Altare',
    'bottom.prayers': 'Preghiere',
    'bottom.parole': 'Parola',
    'bottom.more': 'Altro',
    'dashboard.peace': 'Pace del Signore',
  },
  ar: {
    'nav.dashboard': 'الرئيسية',
    'nav.altar': 'مذبحي',
    'nav.prayers': 'الصلوات والشهادات',
    'nav.journey': 'المسيرة الروحية',
    'nav.parole': 'الكلمة الإلهية',
    'nav.studios': 'استوديوهات الإبداع',
    'nav.vault': 'الخزنة الروحية',
    'nav.calendar': 'تقويمي',
    'nav.contacts': 'جهات الاتصال',
    'nav.messaging': 'مشاركة واتساب / رسائل',
    'nav.settings': 'الإعدادات',
    'header.back': 'رجوع',
    'header.home': 'الرئيسية',
    'bottom.home': 'الرئيسية',
    'bottom.altar': 'المذبح',
    'bottom.prayers': 'الصلوات',
    'bottom.parole': 'الكلمة',
    'bottom.more': 'المزيد',
    'dashboard.peace': 'سلام الرب',
  },
  zh: {
    'nav.dashboard': '首页',
    'nav.altar': '我的祭坛',
    'nav.prayers': '祷告与见证',
    'nav.journey': '灵修历程',
    'nav.parole': '神圣话语',
    'nav.studios': '创作工作室',
    'nav.vault': '属灵宝库',
    'nav.calendar': '我的日历',
    'nav.contacts': '我的联系人',
    'nav.messaging': 'WhatsApp / 短信分享',
    'nav.settings': '设置',
    'header.back': '返回',
    'header.home': '首页',
    'bottom.home': '首页',
    'bottom.altar': '祭坛',
    'bottom.prayers': '祷告',
    'bottom.parole': '圣言',
    'bottom.more': '更多',
    'dashboard.peace': '主赐平安',
  },
  ht: {
    'nav.dashboard': 'Akèy',
    'nav.altar': 'Lotèl Mwen',
    'nav.prayers': 'Lapriyè & Temwayaj',
    'nav.journey': 'Pakou Espirityèl',
    'nav.parole': 'Pawòl Bondye',
    'nav.studios': 'Estidyo Kreyasyon',
    'nav.vault': 'Kòf Espirityèl',
    'nav.calendar': 'Kalandriye Mwen',
    'nav.contacts': 'Kontak Mwen',
    'nav.messaging': 'Pataje WhatsApp / SMS',
    'nav.settings': 'Paramèt',
    'header.back': 'Retounen',
    'header.home': 'Akèy',
    'bottom.home': 'Akèy',
    'bottom.altar': 'Lotèl',
    'bottom.prayers': 'Lapriyè',
    'bottom.parole': 'Pawòl',
    'bottom.more': 'Plis',
    'dashboard.peace': 'Lapè Seyè a',
  },
};

interface LanguageContextValue {
  lang: AppLanguage;
  setLang: (next: AppLanguage) => void;
  t: (key: string, fallback?: string) => string;
  currentLanguageInfo: LanguageOption;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: 'fr',
  setLang: () => {},
  t: (k, f) => f || k,
  currentLanguageInfo: WORLD_LANGUAGES[0],
});

export const LanguageProvider: React.FC<{
  initialLanguage?: AppLanguage;
  children: React.ReactNode;
}> = ({ initialLanguage, children }) => {
  const [lang, setLangState] = useState<AppLanguage>(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved && saved.trim()) return saved;
    } catch {
      // ignore
    }
    return initialLanguage || 'fr';
  });

  useEffect(() => {
    if (initialLanguage && initialLanguage.trim()) {
      try {
        if (!localStorage.getItem(LANG_STORAGE_KEY)) {
          setLangState(initialLanguage);
        }
      } catch {
        setLangState(initialLanguage);
      }
    }
  }, [initialLanguage]);

  const currentLanguageInfo =
    WORLD_LANGUAGES.find((l) => l.code === lang) || {
      code: lang,
      nativeName: lang.toUpperCase(),
      labelFr: lang.toUpperCase(),
    };

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = currentLanguageInfo.rtl ? 'rtl' : 'ltr';
  }, [lang, currentLanguageInfo.rtl]);

  const setLang = useCallback((next: AppLanguage) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const t = useCallback(
    (key: string, fallback?: string) => {
      const dict = TRANSLATIONS[lang];
      if (dict && dict[key]) return dict[key];
      if (lang === 'fr') return TRANSLATIONS.fr[key] || fallback || key;
      return TRANSLATIONS.en[key] || TRANSLATIONS.fr[key] || fallback || key;
    },
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, currentLanguageInfo }}>
      {children}
    </LanguageContext.Provider>
  );
};

export function useLanguage() {
  return useContext(LanguageContext);
}
