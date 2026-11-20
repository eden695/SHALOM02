import React, { useState, useEffect } from 'react';
import {
  Settings,
  Shield,
  Download,
  Upload,
  HardDrive,
  User,
  Lock,
  CheckCircle2,
  Sun,
  Moon,
  KeyRound,
  Grid3X3,
  Hash,
  Image as ImageIcon,
  Camera,
  Trash2,
  BookOpen,
  RotateCcw,
  Loader2,
  Sparkles,
  Globe,
  Bell,
  BellOff,
  Clock,
  Info,
  Wifi,
  WifiOff,
  RefreshCw,
  FileText,
  ShieldCheck,
  Lightbulb,
  Eraser,
  Smartphone,
} from 'lucide-react';
import { dbService, STORES } from '../../services/db';
import { useShalomDB } from '../../hooks/useShalomDB';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { useLanguage, WORLD_LANGUAGES } from '../../contexts/LanguageContext';
import { useModuleSubView } from '../../contexts/NavigationContext';
import { useOnlineStatus } from '../../services/connectivity';
import { Modal } from '../common/Modal';
import {
  getNotificationSettings,
  saveNotificationSettings,
  getUsageTipsEnabled,
  setUsageTipsEnabled,
  requestReminderNotificationPermission,
  showLocalReminderNotification,
} from '../../services/notifications';
import {
  hashSecret,
  getSecurityConfig,
  getEffectiveAutoLockSeconds,
  saveSecurityConfig,
  setAppSessionUnlocked,
  LOCKABLE_FEATURES,
} from '../../services/security';
import {
  UserProfile,
  LockMode,
  LockableFeatureId,
  SecurityConfig,
  AppLanguage,
  NotificationSettings,
} from '../../types';
import { PatternGrid } from '../security/PatternGrid';
import { LaunchLockWizardModal } from '../security/LaunchLockWizardModal';

interface SettingsModuleProps {
  initialSubTab?: string;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onLockNow: () => void;
  onSecurityChanged: (cfg: SecurityConfig) => void;
}

const INACTIVITY_OPTIONS = [
  { value: 0, label: 'Désactivé (Jamais)' },
  { value: 15, label: 'Après 15 secondes' },
  { value: 30, label: 'Après 30 secondes' },
  { value: 60, label: 'Après 1 minute' },
  { value: 180, label: 'Après 3 minutes' },
  { value: 300, label: 'Après 5 minutes' },
  { value: 900, label: 'Après 15 minutes' },
  { value: 1800, label: 'Après 30 minutes' },
];

export const SettingsModule: React.FC<SettingsModuleProps> = ({
  initialSubTab = 'general',
  isDarkMode,
  onToggleDarkMode,
  onLockNow,
  onSecurityChanged,
}) => {
  const { userProfile, reloadData } = useShalomDB();
  const { lang, setLang, t, currentLanguageInfo } = useLanguage();
  const isOnline = useOnlineStatus();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [subTab, setSubTab] = useModuleSubView<string>('settings', initialSubTab || 'general');

  const [langSearch, setLangSearch] = useState('');
  const [draftLanguage, setDraftLanguage] = useState<AppLanguage>(
    (userProfile?.language as AppLanguage) || lang
  );
  const [langAppliedNotice, setLangAppliedNotice] = useState<string | null>(null);

  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [userForm, setUserForm] = useState<UserProfile>({
    id: userProfile?.id || 'user_main',
    fullName: userProfile?.fullName || 'Utilisateur',
    phone: userProfile?.phone || '',
    email: userProfile?.email || '',
    avatarDataUrl: userProfile?.avatarDataUrl || undefined,
    dashboardVerseText: userProfile?.dashboardVerseText || '',
    dashboardVerseRef: userProfile?.dashboardVerseRef || '',
    theme: userProfile?.theme || 'light',
    language: userProfile?.language || lang,
    createdAt: userProfile?.createdAt || new Date().toISOString(),
  });

  // Security Protection Config State
  const [securityConfig, setSecurityConfig] = useState<SecurityConfig>(() => getSecurityConfig());
  const [draftLockMode, setDraftLockMode] = useState<LockMode>(() => getSecurityConfig().lockMode);
  const [draftLockOnLaunch, setDraftLockOnLaunch] = useState<boolean>(
    () => getSecurityConfig().lockOnLaunch
  );
  const [draftLockedFeatures, setDraftLockedFeatures] = useState<LockableFeatureId[]>(
    () => getSecurityConfig().lockedFeatures
  );
  const [draftAutoLockSeconds, setDraftAutoLockSeconds] = useState<number>(() =>
    getEffectiveAutoLockSeconds(getSecurityConfig())
  );
  const [isLaunchWizardOpen, setIsLaunchWizardOpen] = useState(false);

  // Notification Reminders & Usage Tips State
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>(() =>
    getNotificationSettings()
  );
  const [notifPermission, setNotifPermission] = useState<string>(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported'
  );
  const [notifNotice, setNotifNotice] = useState<string | null>(null);
  const [showUsageTips, setShowUsageTips] = useState<boolean>(() => getUsageTipsEnabled());

  // About / Update / Legal Modals State
  const [updateCheckStatus, setUpdateCheckStatus] = useState<
    'idle' | 'checking' | 'up-to-date' | 'available' | 'offline' | 'error'
  >('idle');
  const [updateCheckMessage, setUpdateCheckMessage] = useState<string | null>(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [patternStep1, setPatternStep1] = useState<string>('');
  const [patternStep2, setPatternStep2] = useState<string>('');
  const [securityNotice, setSecurityNotice] = useState<string | null>(null);
  const [isSavingSecurity, setIsSavingSecurity] = useState(false);

  const [storageStats, setStorageStats] = useState<{
    usageMB: number;
    quotaMB: number;
    percentage: number;
    persisted: boolean;
  }>({ usageMB: 0, quotaMB: 1000, percentage: 0, persisted: false });
  const [backupLoading, setBackupLoading] = useState(false);
  const [cacheClearing, setCacheClearing] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [storageActionMessage, setStorageActionMessage] = useState<string | null>(null);

  useEffect(() => {
    if (userProfile) {
      setUserForm(userProfile);
      if (userProfile.language) {
        setDraftLanguage(userProfile.language as AppLanguage);
      }
    }
    dbService.getStorageEstimate().then(setStorageStats);
  }, [userProfile]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        setUserForm((prev) => ({ ...prev, avatarDataUrl: dataUrl }));
      };
      if (typeof reader.result === 'string') {
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleApplyAndSaveLanguage = async () => {
    setLangAppliedNotice(null);
    const chosen = draftLanguage || lang;
    const nextProfile: UserProfile = {
      ...userForm,
      language: chosen,
    };
    setLang(chosen);
    setUserForm(nextProfile);
    await dbService.put(STORES.PROFILES, nextProfile);
    setLangAppliedNotice(
      chosen === 'en' ? 'Language applied and saved.' : 'Langue appliquée et enregistrée.'
    );
    reloadData();
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveNotice(null);
    setIsSavingProfile(true);
    try {
      const chosenLang = draftLanguage || userForm.language || lang;
      const cleaned: UserProfile = {
        ...userForm,
        fullName: userForm.fullName.trim() || 'Utilisateur',
        dashboardVerseText: userForm.dashboardVerseText?.trim() || '',
        dashboardVerseRef: userForm.dashboardVerseRef?.trim() || '',
        language: chosenLang,
        showUsageTips,
      };
      setLang(chosenLang);
      setUsageTipsEnabled(showUsageTips);
      await Promise.all([
        dbService.put(STORES.PROFILES, cleaned),
        new Promise((resolve) => setTimeout(resolve, 250)),
      ]);
      setUserForm(cleaned);
      setSaveNotice(
        chosenLang === 'en'
          ? 'Your profile, language, and preferences have been saved.'
          : 'Vos paramètres, langue, profil et préférences ont bien été enregistrés.'
      );
      reloadData();
    } catch {
      setSaveNotice('Une erreur est survenue lors de l’enregistrement.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const toggleFeatureLock = (featureId: LockableFeatureId) => {
    setDraftLockedFeatures((prev) =>
      prev.includes(featureId) ? prev.filter((id) => id !== featureId) : [...prev, featureId]
    );
  };

  // Interactive Switch Handler for Launch Lock -> Opens configuration wizard
  const handleToggleLaunchLockSwitch = (nextChecked: boolean) => {
    setSecurityNotice(null);
    if (nextChecked) {
      setIsLaunchWizardOpen(true);
      return;
    }

    // Turning OFF launch lock
    setDraftLockOnLaunch(false);
    if (securityConfig.isEnabled) {
      if (draftLockedFeatures.length === 0) {
        const disabled: SecurityConfig = {
          isEnabled: false,
          lockMode: draftLockMode,
          secretHash: '',
          lockOnLaunch: false,
          lockedFeatures: [],
          autoLockMinutes: 0,
          autoLockSeconds: 0,
        };
        saveSecurityConfig(disabled);
        setSecurityConfig(disabled);
        setDraftAutoLockSeconds(0);
        onSecurityChanged(disabled);
        setAppSessionUnlocked(true);
        setSecurityNotice('Verrouillage au lancement désactivé.');
      } else {
        const updated: SecurityConfig = {
          ...securityConfig,
          lockOnLaunch: false,
        };
        saveSecurityConfig(updated);
        setSecurityConfig(updated);
        onSecurityChanged(updated);
        setSecurityNotice('Verrouillage au lancement retiré. Les modules sélectionnés restent protégés.');
      }
    }
  };

  const handleWizardComplete = ({
    lockMode,
    secretHash,
  }: {
    lockMode: LockMode;
    secretHash: string;
  }) => {
    const nextConfig: SecurityConfig = {
      isEnabled: true,
      lockMode,
      secretHash,
      lockOnLaunch: true,
      lockedFeatures: draftLockedFeatures,
      autoLockMinutes: Math.round(draftAutoLockSeconds / 60),
      autoLockSeconds: draftAutoLockSeconds,
    };
    saveSecurityConfig(nextConfig);
    setSecurityConfig(nextConfig);
    setDraftLockMode(lockMode);
    setDraftLockOnLaunch(true);
    onSecurityChanged(nextConfig);
    setAppSessionUnlocked(true);
    setIsLaunchWizardOpen(false);
    setNewPin('');
    setConfirmPin('');
    setNewPassword('');
    setConfirmPassword('');
    setPatternStep1('');
    setPatternStep2('');
    setSecurityNotice(
      'Verrouillage au lancement activé ! Votre protection est active dès maintenant sur cet appareil.'
    );
  };

  const handleInactivitySelectChange = (seconds: number) => {
    setDraftAutoLockSeconds(seconds);
    if (securityConfig.isEnabled && securityConfig.secretHash) {
      const updated: SecurityConfig = {
        ...securityConfig,
        autoLockSeconds: seconds,
        autoLockMinutes: Math.round(seconds / 60),
      };
      saveSecurityConfig(updated);
      setSecurityConfig(updated);
      onSecurityChanged(updated);
      const label =
        INACTIVITY_OPTIONS.find((opt) => opt.value === seconds)?.label || `${seconds} s`;
      setSecurityNotice(`Délai d’inactivité mis à jour : ${label}.`);
    }
  };

  const handleSaveSecurityPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    setSecurityNotice(null);

    let secretToHash = '';
    const needsNewSecret =
      !securityConfig.secretHash ||
      securityConfig.lockMode !== draftLockMode ||
      newPin.length > 0 ||
      newPassword.length > 0 ||
      patternStep1.length > 0;

    if (needsNewSecret) {
      if (draftLockMode === 'pin') {
        if (!/^\d{4}$/.test(newPin)) {
          setSecurityNotice('Le code PIN doit contenir exactement 4 chiffres.');
          return;
        }
        if (newPin !== confirmPin) {
          setSecurityNotice('Les deux codes PIN ne correspondent pas.');
          return;
        }
        secretToHash = newPin;
      } else if (draftLockMode === 'password') {
        if (newPassword.length < 4) {
          setSecurityNotice('Le mot de passe doit contenir au moins 4 caractères.');
          return;
        }
        if (newPassword !== confirmPassword) {
          setSecurityNotice('Les deux mots de passe ne correspondent pas.');
          return;
        }
        secretToHash = newPassword;
      } else if (draftLockMode === 'pattern') {
        if (!patternStep1 || patternStep1.split('-').length < 4) {
          setSecurityNotice('Tracez un schéma reliant au moins 4 points.');
          return;
        }
        if (patternStep1 !== patternStep2) {
          setSecurityNotice('Les deux schémas tracés ne correspondent pas.');
          setPatternStep1('');
          setPatternStep2('');
          return;
        }
        secretToHash = patternStep1;
      }
    }

    setIsSavingSecurity(true);
    try {
      const finalHash = secretToHash ? await hashSecret(secretToHash) : securityConfig.secretHash;

      if (!draftLockOnLaunch && draftLockedFeatures.length === 0) {
        setSecurityNotice(
          'Activez « Bloquer le lancement de l’application » ou cochez au moins une fonctionnalité à protéger.'
        );
        return;
      }

      const nextConfig: SecurityConfig = {
        isEnabled: true,
        lockMode: draftLockMode,
        secretHash: finalHash,
        lockOnLaunch: draftLockOnLaunch,
        lockedFeatures: draftLockedFeatures,
        autoLockMinutes: Math.round(draftAutoLockSeconds / 60),
        autoLockSeconds: draftAutoLockSeconds,
      };

      await new Promise((resolve) => setTimeout(resolve, 250));
      saveSecurityConfig(nextConfig);
      setSecurityConfig(nextConfig);
      onSecurityChanged(nextConfig);
      setAppSessionUnlocked(true);

      setNewPin('');
      setConfirmPin('');
      setNewPassword('');
      setConfirmPassword('');
      setPatternStep1('');
      setPatternStep2('');
      setSecurityNotice('Protection enregistrée et activée avec succès.');
    } finally {
      setIsSavingSecurity(false);
    }
  };

  const handleDisableSecurity = () => {
    const disabled: SecurityConfig = {
      isEnabled: false,
      lockMode: draftLockMode,
      secretHash: '',
      lockOnLaunch: false,
      lockedFeatures: [],
      autoLockMinutes: 0,
      autoLockSeconds: 0,
    };
    saveSecurityConfig(disabled);
    setSecurityConfig(disabled);
    setDraftLockOnLaunch(false);
    setDraftLockedFeatures([]);
    setDraftAutoLockSeconds(0);
    onSecurityChanged(disabled);
    setAppSessionUnlocked(true);
    setSecurityNotice('Protection désactivée.');
  };

  const handleUpdateReminder = async (
    key: keyof NotificationSettings,
    patch: Partial<{ enabled: boolean; time: string }>
  ) => {
    const next: NotificationSettings = {
      ...notifSettings,
      [key]: {
        ...notifSettings[key],
        ...patch,
      },
    };
    setNotifSettings(next);
    saveNotificationSettings(next);

    if (patch.enabled) {
      const perm = await requestReminderNotificationPermission();
      setNotifPermission(perm);
      if (perm === 'granted') {
        setNotifNotice('Rappel activé et enregistré.');
      } else if (perm === 'denied') {
        setNotifNotice(
          'Rappel enregistré. Les notifications système sont bloquées par l’appareil, mais le rappel s’affichera dans SHALOM.'
        );
      } else {
        setNotifNotice('Rappel enregistré (alerte intégrée dans SHALOM active).');
      }
    } else if (patch.enabled === false) {
      setNotifNotice('Ce rappel a été désactivé.');
    } else {
      setNotifNotice('Heure du rappel mise à jour.');
    }
  };

  const handleToggleUsageTips = (nextValue: boolean) => {
    setShowUsageTips(nextValue);
    setUsageTipsEnabled(nextValue);
    setUserForm((prev) => ({ ...prev, showUsageTips: nextValue }));
    setSaveNotice(
      nextValue
        ? 'Les conseils d’utilisation sont activés sur l’accueil.'
        : 'Les conseils d’utilisation ont été masqués.'
    );
  };

  const handleClearCacheOnly = async () => {
    setCacheClearing(true);
    setStorageActionMessage(null);
    try {
      let deletedCount = 0;
      if (typeof window !== 'undefined' && 'caches' in window) {
        const keys = await window.caches.keys();
        await Promise.all(keys.map((key) => window.caches.delete(key)));
        deletedCount = keys.length;
      }
      const stats = await dbService.getStorageEstimate();
      setStorageStats(stats);
      setStorageActionMessage(
        deletedCount > 0
          ? `Cache vidé (${deletedCount} espace(s) supprimé(s)). Toutes vos données personnelles sont intactes.`
          : 'Aucun fichier en cache à supprimer. Vos données personnelles restent intactes.'
      );
    } catch {
      setStorageActionMessage(
        'Cache non accessible dans cet environnement ; vos données personnelles sont intactes.'
      );
    } finally {
      setCacheClearing(false);
    }
  };

  const handleCheckForUpdates = async () => {
    if (!isOnline) {
      setUpdateCheckStatus('offline');
      setUpdateCheckMessage(
        'Connexion Internet requise pour vérifier la disponibilité d’une nouvelle version.'
      );
      return;
    }

    setUpdateCheckStatus('checking');
    setUpdateCheckMessage('Vérification en cours...');
    try {
      let hasNewSw = false;
      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) {
            await reg.update();
            if (reg.waiting || reg.installing) {
              hasNewSw = true;
            }
          }
        } catch {
          // ignore SW check errors
        }
      }

      let hasNewHtmlBundle = false;
      try {
        const res = await fetch(`./index.html?check=${Date.now()}`, { cache: 'no-store' });
        if (res.ok) {
          const html = await res.text();
          const remoteMatches = Array.from(html.matchAll(/assets\/index-[A-Za-z0-9_-]+\.js/g)).map(
            (m) => m[0]
          );
          const currentScripts = Array.from(document.querySelectorAll('script[src]')).map(
            (s) => s.getAttribute('src') || ''
          );
          if (remoteMatches.length > 0 && currentScripts.some((s) => s.includes('assets/index-'))) {
            const matchesCurrent = remoteMatches.some((rm) =>
              currentScripts.some((cs) => cs.includes(rm))
            );
            if (!matchesCurrent) {
              hasNewHtmlBundle = true;
            }
          }
        }
      } catch {
        // ignore fetch issue
      }

      if (hasNewSw || hasNewHtmlBundle) {
        setUpdateCheckStatus('available');
        setUpdateCheckMessage(
          'Une nouvelle version de SHALOM est disponible ! Appuyez sur « Actualiser l’application ».'
        );
      } else {
        setUpdateCheckStatus('up-to-date');
        setUpdateCheckMessage(
          `Vous utilisez déjà la dernière version (${__SHALOM_APP_VERSION__}).`
        );
      }
    } catch {
      setUpdateCheckStatus('error');
      setUpdateCheckMessage('Impossible de joindre le serveur de mise à jour pour le moment.');
    }
  };

  const handleDownloadBackup = async () => {
    try {
      setBackupLoading(true);
      const jsonBackup = await dbService.exportBackup(false);
      const blob = new Blob([jsonBackup], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `shalom_sauvegarde_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setRestoreMessage('Sauvegarde JSON téléchargée.');
    } catch {
      setRestoreMessage('Erreur lors de la sauvegarde.');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const content = evt.target?.result as string;
      if (!content) return;
      const result = await dbService.restoreBackup(content);
      setRestoreMessage(result.message);
      if (result.success) reloadData();
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDownloadLogo = async (format: 'png' | 'jpg') => {
    const fileName = `shalom_logo_512x512.${format}`;
    try {
      const response = await fetch(`./${fileName}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setSaveNotice(`Logo ${fileName} téléchargé.`);
    } catch {
      setSaveNotice('Erreur lors du téléchargement du logo.');
    }
  };

  const TABS = [
    { id: 'general', label: 'Profil & Apparence', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Sécurité', icon: Shield },
    { id: 'backup', label: 'Sauvegarde & Cache', icon: HardDrive },
    { id: 'about', label: 'À propos', icon: Info },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-200 max-w-5xl">
      {/* Page Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2.5 font-display tracking-tight">
              <Settings className="w-6 h-6 text-blue-700 dark:text-blue-400 shrink-0" />
              <span>Paramètres & Sécurité</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Profil personnel · rappels · verrouillage hors ligne · sauvegarde locale
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 self-start sm:self-auto">
            {isOnline ? (
              <Wifi className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            )}
            <span>{isOnline ? 'En ligne · Mode local actif' : 'Mode hors ligne autonome'}</span>
          </div>
        </div>

        {/* Modern Horizontal Touch-Scrollable Section Tabs */}
        <div className="studio-scroll-x p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 gap-1.5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`min-h-[44px] px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl transition flex items-center gap-2 whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-white dark:bg-[#0f2b5c] text-blue-700 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 1. Mon Profil & Apparence */}
      {subTab === 'general' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form onSubmit={handleSaveProfile} className="lg:col-span-7 space-y-5">
            {saveNotice && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{saveNotice}</span>
              </div>
            )}

            <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 space-y-5 shadow-xs">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-bold text-xs uppercase tracking-wider">
                <User className="w-4 h-4" />
                <span>Mon Profil</span>
              </div>

              {/* Photo de profil utilisateur */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800">
                <div className="w-16 h-16 rounded-full overflow-hidden bg-[#0b1f42] text-white flex items-center justify-center font-bold text-xl shrink-0 border-2 border-amber-400/50">
                  {userForm.avatarDataUrl ? (
                    <img
                      src={userForm.avatarDataUrl}
                      alt={userForm.fullName || 'Profil'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>{(userForm.fullName || 'U').trim().charAt(0).toUpperCase()}</span>
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">
                    Photo de profil
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition">
                      <Camera className="w-4 h-4" />
                      <span>{userForm.avatarDataUrl ? 'Changer la photo' : 'Ajouter une photo'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAvatarChange}
                        className="hidden"
                      />
                    </label>
                    {userForm.avatarDataUrl && (
                      <button
                        type="button"
                        onClick={() => setUserForm({ ...userForm, avatarDataUrl: undefined })}
                        className="min-h-[44px] px-3 py-2 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-1.5"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>Retirer</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-slate-700 dark:text-slate-300">
                    Nom complet / Prénom
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: David Kouassi"
                    value={userForm.fullName}
                    onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })}
                    className="w-full min-h-[44px] px-3.5 py-2 text-xs sm:text-sm rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-slate-700 dark:text-slate-300">
                    Téléphone
                  </label>
                  <input
                    type="tel"
                    placeholder="+225 00 00 00 00"
                    value={userForm.phone || ''}
                    onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                    className="w-full min-h-[44px] px-3.5 py-2 text-xs sm:text-sm rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                  />
                </div>
              </div>

              {/* Verset affiché à l'Accueil */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs font-bold text-blue-700 dark:text-blue-400">
                    <BookOpen className="w-4 h-4" />
                    <span>Verset affiché à l’Accueil</span>
                  </span>
                  {(userForm.dashboardVerseText || userForm.dashboardVerseRef) && (
                    <button
                      type="button"
                      onClick={() =>
                        setUserForm({ ...userForm, dashboardVerseText: '', dashboardVerseRef: '' })
                      }
                      className="text-xs font-semibold text-slate-500 hover:text-blue-700 flex items-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Verset par défaut</span>
                    </button>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-slate-700 dark:text-slate-300">
                    Texte du verset
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Collez ici le verset à afficher sur l’écran d’accueil..."
                    value={userForm.dashboardVerseText || ''}
                    onChange={(e) =>
                      setUserForm({ ...userForm, dashboardVerseText: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5 text-slate-700 dark:text-slate-300">
                    Référence (facultatif)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Psaume 23:1"
                    value={userForm.dashboardVerseRef || ''}
                    onChange={(e) =>
                      setUserForm({ ...userForm, dashboardVerseRef: e.target.value })
                    }
                    className="w-full min-h-[44px] px-3.5 py-2 text-xs sm:text-sm rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                  />
                </div>
              </div>

              {/* Langue */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                  {t('settings.languageLabel')}
                </label>
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <Globe className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
                    <span>
                      {currentLanguageInfo.nativeName} ({currentLanguageInfo.code}) ·{' '}
                      {t('settings.languageDesc')}
                    </span>
                  </div>

                  <input
                    type="text"
                    value={langSearch}
                    onChange={(e) => setLangSearch(e.target.value)}
                    placeholder="Rechercher une langue (Français, English, Lingala, Swahili, Español...)"
                    className="w-full min-h-[44px] px-3.5 py-2 text-xs rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                  />

                  <select
                    value={draftLanguage}
                    onChange={(e) => {
                      setDraftLanguage(e.target.value as AppLanguage);
                      setLangAppliedNotice(null);
                    }}
                    size={5}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                  >
                    {WORLD_LANGUAGES.filter((opt) => {
                      const q = langSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        opt.nativeName.toLowerCase().includes(q) ||
                        opt.labelFr.toLowerCase().includes(q) ||
                        opt.code.toLowerCase().includes(q)
                      );
                    }).map((opt) => (
                      <option key={opt.code} value={opt.code}>
                        {opt.nativeName} — {opt.labelFr} ({opt.code})
                      </option>
                    ))}
                  </select>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span className="text-xs text-slate-500">
                      Sélectionnée : <strong>{draftLanguage}</strong>
                      {draftLanguage !== lang ? ' (non encore appliquée)' : ' (active)'}
                    </span>
                    <button
                      type="button"
                      onClick={handleApplyAndSaveLanguage}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold flex items-center gap-1.5 transition"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Appliquer la langue</span>
                    </button>
                  </div>

                  {langAppliedNotice && (
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      {langAppliedNotice}
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSavingProfile}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-70 text-white font-bold text-xs sm:text-sm shadow-sm transition inline-flex items-center gap-2"
                >
                  {isSavingProfile ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Enregistrement...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Enregistrer le profil</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>

          {/* Colonne Apparence & Logo officiel */}
          <div className="lg:col-span-5 space-y-5">
            <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 space-y-4 shadow-xs">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-bold text-xs uppercase tracking-wider">
                <Sun className="w-4 h-4" />
                <span>Apparence & Conseils</span>
              </div>

              <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800">
                <div>
                  <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white block">
                    Mode Sombre / Nuit
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Confort visuel pour la lecture du soir
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onToggleDarkMode}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-2 text-xs font-bold"
                >
                  {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
                  <span>{isDarkMode ? 'Activé' : 'Désactivé'}</span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800">
                <div className="flex items-start gap-2.5">
                  <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white block">
                      Conseils d’utilisation
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Astuces pratiques sur l’écran d’accueil
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleUsageTips(!showUsageTips)}
                  className={`min-h-[44px] px-4 py-2 rounded-xl border text-xs font-bold shrink-0 transition ${
                    showUsageTips
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {showUsageTips ? 'Activés' : 'Désactivés'}
                </button>
              </div>
            </div>

            <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 space-y-4 shadow-xs">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-bold text-xs uppercase tracking-wider">
                <ImageIcon className="w-4 h-4" />
                <span>Logo officiel SHALOM (512 × 512)</span>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-sm border border-slate-200/70 dark:border-slate-700/70 shrink-0 bg-slate-100 dark:bg-slate-900">
                  <img
                    src="./shalom_logo_512x512.png"
                    alt="Logo SHALOM 512x512"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                  />
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Téléchargez l’emblème officiel haute netteté 512×512 px pour vos visuels ou documents.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadLogo('png')}
                  className="min-h-[44px] flex-1 px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition"
                >
                  <Download className="w-4 h-4" />
                  <span>PNG transparent</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadLogo('jpg')}
                  className="min-h-[44px] flex-1 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                >
                  <Download className="w-4 h-4" />
                  <span>JPG plein cadre</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Notifications & Rappels */}
      {subTab === 'notifications' && (
        <div className="max-w-3xl space-y-5">
          <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 space-y-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-bold text-xs uppercase tracking-wider">
                  <Bell className="w-4 h-4" />
                  <span>Rappels quotidiens de vie spirituelle</span>
                </div>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Activez séparément et réglez l’heure de chaque rappel (100 % local hors ligne).
                </p>
              </div>

              <button
                type="button"
                onClick={async () => {
                  const perm = await requestReminderNotificationPermission();
                  setNotifPermission(perm);
                  const sent = showLocalReminderNotification(
                    'SHALOM · Test de rappel',
                    'Vos rappels spirituels quotidiens sont prêts.'
                  );
                  setNotifNotice(
                    sent
                      ? 'Notification de test envoyée avec succès.'
                      : 'Aperçu enregistré. Le rappel s’affichera en bannière dans l’application.'
                  );
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold flex items-center gap-2 self-start sm:self-auto"
              >
                <Bell className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Tester une alerte</span>
              </button>
            </div>

            {notifNotice && (
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{notifNotice}</span>
              </div>
            )}

            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200/80 dark:border-slate-800 rounded-2xl overflow-hidden">
              {[
                {
                  key: 'dailyPrayer' as const,
                  title: 'Rappel quotidien de prière',
                  desc: 'Un moment dédié chaque jour pour votre vie de prière et d’intercession.',
                },
                {
                  key: 'meditation' as const,
                  title: 'Rappel de méditation',
                  desc: 'Une pause calme pour méditer la Parole et cultiver la paix intérieure.',
                },
                {
                  key: 'bibleReading' as const,
                  title: 'Rappel de lecture biblique',
                  desc: 'Un rendez-vous régulier pour lire votre passage biblique du jour.',
                },
              ].map((item) => {
                const cfg = notifSettings[item.key];
                return (
                  <div
                    key={item.key}
                    className={`p-4 sm:p-5 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                      cfg.enabled
                        ? 'bg-blue-50/40 dark:bg-blue-950/20'
                        : 'bg-slate-50/40 dark:bg-slate-900/40'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {cfg.enabled ? (
                        <Bell className="w-5 h-5 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5" />
                      ) : (
                        <BellOff className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                          {item.title}
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {item.desc}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-auto">
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                        <Clock className="w-4 h-4 text-slate-400" />
                        <input
                          type="time"
                          value={cfg.time}
                          onChange={(e) => handleUpdateReminder(item.key, { time: e.target.value })}
                          className="min-h-[44px] px-3 py-1.5 text-xs font-bold tabular-nums rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => handleUpdateReminder(item.key, { enabled: !cfg.enabled })}
                        className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold shrink-0 border transition ${
                          cfg.enabled
                            ? 'bg-blue-700 text-white border-blue-700'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {cfg.enabled ? 'Activé' : 'Désactivé'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>
                Autorisation système :{' '}
                <strong className="text-slate-800 dark:text-slate-200">
                  {notifPermission === 'granted'
                    ? 'Accordée'
                    : notifPermission === 'denied'
                    ? 'Refusée (alerte interne active)'
                    : notifPermission === 'unsupported'
                    ? 'Non supportée (alerte interne active)'
                    : 'Non demandée'}
                </strong>
              </span>
              {notifPermission === 'default' && (
                <button
                  type="button"
                  onClick={async () => {
                    const perm = await requestReminderNotificationPermission();
                    setNotifPermission(perm);
                  }}
                  className="text-blue-700 dark:text-blue-400 font-bold hover:underline"
                >
                  Autoriser les notifications
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Sécurité & Verrouillage */}
      {subTab === 'security' && (
        <form onSubmit={handleSaveSecurityPolicy} className="max-w-3xl space-y-6">
          <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 space-y-6 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-bold text-xs uppercase tracking-wider">
                  <Shield className="w-4 h-4" />
                  <span>Sécurité interne SHALOM (Hors ligne)</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Verrouillage autonome par PIN, mot de passe ou schéma — indépendant du verrouillage système du téléphone.
                </p>
              </div>
              {securityConfig.isEnabled && (
                <button
                  type="button"
                  onClick={handleDisableSecurity}
                  className="min-h-[44px] px-4 py-2 rounded-xl border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  Tout désactiver
                </button>
              )}
            </div>

            {securityNotice && (
              <div className="p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 text-xs font-semibold text-blue-800 dark:text-blue-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{securityNotice}</span>
              </div>
            )}

            {/* Étape 1 : Interrupteur Bloquer le lancement -> ouvre l'assistant immédiat */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                1. Protection au lancement & Modules
              </h3>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Lock className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0" />
                    <span>Bloquer le lancement de l’application</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Active un écran de déverrouillage dès l’ouverture de SHALOM. En activant cet interrupteur, vous configurez immédiatement votre code ou schéma.
                  </p>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={draftLockOnLaunch}
                  onClick={() => handleToggleLaunchLockSwitch(!draftLockOnLaunch)}
                  className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                    draftLockOnLaunch ? 'bg-blue-700' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-sm transition-transform ${
                      draftLockOnLaunch ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {draftLockOnLaunch && securityConfig.secretHash && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-xs">
                  <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                    Verrouillage au lancement actif ({securityConfig.lockMode === 'pin' ? 'Code PIN' : securityConfig.lockMode === 'password' ? 'Mot de passe' : 'Schéma 3×3'}).
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsLaunchWizardOpen(true)}
                    className="font-bold text-blue-700 dark:text-blue-400 hover:underline"
                  >
                    Modifier via l’assistant
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                {LOCKABLE_FEATURES.map((feat) => {
                  const checked = draftLockedFeatures.includes(feat.id);
                  return (
                    <label
                      key={feat.id}
                      className={`min-h-[44px] px-3.5 py-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 cursor-pointer transition ${
                        checked
                          ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/30 text-blue-900 dark:text-blue-200 font-semibold'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <span className="truncate">{feat.label}</span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleFeatureLock(feat.id)}
                        className="w-4 h-4 accent-blue-700 shrink-0"
                      />
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Étape 2 : Verrouillage automatique après inactivité (secondes) */}
            <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                2. Verrouillage automatique après inactivité
              </h3>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <Clock className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white block">
                      Délai avant verrouillage automatique
                    </span>
                    <span className="text-xs text-slate-500">
                      Verrouille SHALOM automatiquement sans aucune action (y compris après 15 ou 30 secondes ; suspendu pendant un enregistrement actif).
                    </span>
                  </div>
                </div>
                <select
                  value={draftAutoLockSeconds}
                  onChange={(e) => handleInactivitySelectChange(Number(e.target.value))}
                  className="min-h-[44px] px-3.5 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white shrink-0"
                >
                  {INACTIVITY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Étape 3 : Mode & Modification manuelle du secret */}
            <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                3. Méthode de déverrouillage
              </h3>

              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { id: 'pin', label: 'Code PIN', icon: Hash },
                  { id: 'password', label: 'Mot de passe', icon: KeyRound },
                  { id: 'pattern', label: 'Schéma 3×3', icon: Grid3X3 },
                ].map((m) => {
                  const Icon = m.icon;
                  const active = draftLockMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setDraftLockMode(m.id as LockMode);
                        setSecurityNotice(null);
                      }}
                      className={`min-h-[56px] p-3 rounded-2xl border flex flex-col items-center justify-center gap-1.5 text-xs font-semibold transition ${
                        active
                          ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 ring-2 ring-blue-600/20'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-3">
                {securityConfig.secretHash && securityConfig.lockMode === draftLockMode && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
                    Un secret ({draftLockMode}) est déjà configuré. Laissez vide pour le conserver ou saisissez-en un nouveau.
                  </p>
                )}

                {draftLockMode === 'pin' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-semibold mb-1">Nouveau PIN (4 chiffres)</label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="••••"
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, ''))}
                        className="w-full min-h-[44px] px-3 py-2 text-center font-mono tracking-widest rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1">Confirmer le PIN</label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="••••"
                        value={confirmPin}
                        onChange={(e) => setConfirmPin(e.target.value.replace(/[^0-9]/g, ''))}
                        className="w-full min-h-[44px] px-3 py-2 text-center font-mono tracking-widest rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                      />
                    </div>
                  </div>
                )}

                {draftLockMode === 'password' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block font-semibold mb-1">Mot de passe</label>
                      <input
                        type="password"
                        placeholder="Min. 4 caractères"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1">Confirmer</label>
                      <input
                        type="password"
                        placeholder="Confirmer"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                      />
                    </div>
                  </div>
                )}

                {draftLockMode === 'pattern' && (
                  <div className="text-center space-y-2">
                    {!patternStep1 ? (
                      <PatternGrid
                        key="pattern-step-1"
                        label="Étape 1/2 : Tracez votre schéma (min. 4 points)"
                        onPatternComplete={(pat) => {
                          if (pat.split('-').length >= 4) {
                            setSecurityNotice(null);
                            setPatternStep1(pat);
                          } else {
                            setSecurityNotice('Reliez au moins 4 points.');
                          }
                        }}
                      />
                    ) : !patternStep2 ? (
                      <div className="space-y-2">
                        <PatternGrid
                          key="pattern-step-2"
                          label="Étape 2/2 : Confirmez le même schéma"
                          onPatternComplete={(pat) => {
                            if (pat !== patternStep1) {
                              setSecurityNotice('Les deux schémas ne correspondent pas. Tracez à nouveau.');
                              return;
                            }
                            setSecurityNotice(null);
                            setPatternStep2(pat);
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setPatternStep1('');
                            setPatternStep2('');
                          }}
                          className="text-xs text-slate-500 underline"
                        >
                          Recommencer
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          Schéma confirmé et prêt à être enregistré.
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setPatternStep1('');
                            setPatternStep2('');
                          }}
                          className="text-xs text-slate-500 underline"
                        >
                          Tracer un autre schéma
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
              {securityConfig.isEnabled && (
                <button
                  type="button"
                  onClick={onLockNow}
                  className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-semibold flex items-center gap-1.5"
                >
                  <Lock className="w-4 h-4" />
                  <span>Verrouiller maintenant</span>
                </button>
              )}
              <button
                type="submit"
                disabled={isSavingSecurity}
                className="min-h-[44px] px-6 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-70 text-white text-xs sm:text-sm font-bold flex items-center gap-2"
              >
                {isSavingSecurity ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Enregistrement...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Enregistrer la protection</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* 4. Sauvegarde & Cache */}
      {subTab === 'backup' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 space-y-4 shadow-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-bold text-xs uppercase tracking-wider">
                <HardDrive className="w-4 h-4" />
                <span>Stockage Local Haute Capacité</span>
              </div>
              {storageStats.persisted && (
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  Mémoire persistante active
                </span>
              )}
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="tabular-nums">Utilisé : {storageStats.usageMB} Mo</span>
                <span className="tabular-nums">
                  Capacité :{' '}
                  {storageStats.quotaMB >= 1024
                    ? `${(storageStats.quotaMB / 1024).toFixed(1)} Go`
                    : `${storageStats.quotaMB} Mo`}
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-blue-700 rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(2, storageStats.percentage)}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Vos audios, vidéos, projets des studios, livres et contacts sont stockés localement sur cet appareil dans IndexedDB.
              </p>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                {!storageStats.persisted && (
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await dbService.requestPersistentStorage();
                      const stats = await dbService.getStorageEstimate();
                      setStorageStats(stats);
                      setStorageActionMessage(
                        ok
                          ? 'Mémoire persistante haute capacité activée.'
                          : 'La mémoire maximale disponible sur cet appareil est déjà allouée.'
                      );
                    }}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Activer la mémoire étendue</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={async () => {
                    const count = await dbService.purgeOrphanMediaBlobs();
                    const stats = await dbService.getStorageEstimate();
                    setStorageStats(stats);
                    setStorageActionMessage(
                      count > 0
                        ? `${count} fichier(s) résiduel(s) nettoyé(s).`
                        : 'Mémoire déjà propre et optimisée.'
                    );
                  }}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold"
                >
                  Optimiser la mémoire
                </button>

                <button
                  type="button"
                  onClick={handleClearCacheOnly}
                  disabled={cacheClearing}
                  className="min-h-[44px] px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-bold flex items-center gap-1.5 disabled:opacity-60"
                >
                  {cacheClearing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Eraser className="w-4 h-4" />
                  )}
                  <span>Vider uniquement le cache</span>
                </button>
              </div>

              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                « Vider uniquement le cache » efface uniquement le cache système temporaire sans jamais supprimer vos données personnelles.
              </p>

              {storageActionMessage && (
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  {storageActionMessage}
                </p>
              )}
            </div>
          </div>

          <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 space-y-4 shadow-xs">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-bold text-xs uppercase tracking-wider">
              <Download className="w-4 h-4" />
              <span>Exporter / Restaurer (JSON)</span>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Exportez l’ensemble de vos données SHALOM dans un fichier JSON pour les conserver ou les restaurer sur un autre appareil.
            </p>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleDownloadBackup}
                disabled={backupLoading}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>Télécharger Sauvegarde</span>
              </button>

              <label className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>Restaurer</span>
                <input type="file" accept=".json" onChange={handleRestoreFile} className="hidden" />
              </label>
            </div>

            {restoreMessage && (
              <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {restoreMessage}
              </p>
            )}
          </div>
        </div>
      )}

      {/* 5. À propos */}
      {subTab === 'about' && (
        <div className="max-w-3xl space-y-5">
          <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 space-y-5 shadow-xs">
            <div className="flex items-center gap-4">
              <img
                src="./shalom_logo.jpg"
                alt="SHALOM"
                referrerPolicy="no-referrer"
                className="w-16 h-16 rounded-2xl object-cover border border-slate-200 dark:border-slate-700 shadow-xs"
              />
              <div>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white font-display">
                  SHALOM · Plateforme Chrétienne Hors Ligne
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Compagnon spirituel personnel · Fonctionnement complet sans connexion Internet
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 block">Version installée</span>
                <strong className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5 block tabular-nums">
                  v{__SHALOM_APP_VERSION__}
                </strong>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 block">Date de dernière mise à jour</span>
                <strong className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5 block tabular-nums">
                  {__SHALOM_BUILD_DATE__}
                </strong>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 block">État de connexion</span>
                <div className="flex items-center gap-1.5 mt-0.5 font-bold">
                  {isOnline ? (
                    <>
                      <Wifi className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-emerald-700 dark:text-emerald-300">En ligne (connecté)</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span className="text-amber-700 dark:text-amber-300">Hors ligne</span>
                    </>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800">
                <span className="text-slate-500 block">Stockage local</span>
                <strong className="text-xs font-bold text-slate-900 dark:text-white mt-0.5 block tabular-nums">
                  {storageStats.usageMB} Mo /{' '}
                  {storageStats.quotaMB >= 1024
                    ? `${(storageStats.quotaMB / 1024).toFixed(1)} Go`
                    : `${storageStats.quotaMB} Mo`}{' '}
                  · {storageStats.persisted ? 'Persistant' : 'Standard'}
                </strong>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/60 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <Smartphone className="w-4 h-4 text-blue-700 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white block">
                      Installation & Utilisation hors ligne (PWA)
                    </span>
                    <span className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed block mt-0.5">
                      {isInstalled
                        ? 'SHALOM est installée sur cet appareil. Toutes vos données (prières, studios, coffre, contacts) fonctionnent sans connexion Internet.'
                        : isIOS
                          ? 'Sur iPhone / iPad (Safari) : touchez Partager puis « Sur l’écran d’accueil » pour utiliser SHALOM hors ligne.'
                          : 'Installez SHALOM sur l’écran d’accueil Android ou ordinateur pour la lancer à tout moment, même en mode avion.'}
                    </span>
                  </div>
                </div>

                {isInstalled ? (
                  <span className="px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-xs font-bold shrink-0">
                    Installée · Mode autonome prêt
                  </span>
                ) : isInstallable ? (
                  <button
                    type="button"
                    onClick={install}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold flex items-center gap-1.5 shrink-0"
                  >
                    <Download className="w-4 h-4" />
                    <span>Installer SHALOM</span>
                  </button>
                ) : (
                  <span className="text-[11px] font-semibold text-blue-800 dark:text-blue-300 shrink-0">
                    {isIOS ? 'Safari : Partager → Écran d’accueil' : 'Chrome / Edge : Menu ⋮ → Installer'}
                  </span>
                )}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white block">
                    Disponibilité d’une nouvelle version
                  </span>
                  <span className="text-xs text-slate-500">
                    Vérifie manuellement si une mise à jour est disponible en ligne
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleCheckForUpdates}
                  disabled={updateCheckStatus === 'checking'}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${updateCheckStatus === 'checking' ? 'animate-spin' : ''}`}
                  />
                  <span>Vérifier les mises à jour</span>
                </button>
              </div>

              {updateCheckMessage && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold flex flex-wrap items-center justify-between gap-2 ${
                    updateCheckStatus === 'available'
                      ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                      : updateCheckStatus === 'up-to-date'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span>{updateCheckMessage}</span>
                  {updateCheckStatus === 'available' && (
                    <button
                      type="button"
                      onClick={async () => {
                        if ('serviceWorker' in navigator) {
                          const reg = await navigator.serviceWorker.getRegistration();
                          if (reg?.waiting) {
                            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                          }
                        }
                        window.location.reload();
                      }}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold"
                    >
                      Actualiser l’application
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowTermsModal(true)}
                className="min-h-[56px] p-4 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-left flex items-center gap-3 transition"
              >
                <FileText className="w-5 h-5 text-blue-700 dark:text-blue-400 shrink-0" />
                <div>
                  <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white block">
                    Conditions d’utilisation
                  </span>
                  <span className="text-xs text-slate-500">Consulter les conditions</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setShowPrivacyModal(true)}
                className="min-h-[56px] p-4 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-left flex items-center gap-3 transition"
              >
                <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white block">
                    Politique de confidentialité
                  </span>
                  <span className="text-xs text-slate-500">Protection de vos données</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assistant de configuration immédiate au lancement */}
      <LaunchLockWizardModal
        isOpen={isLaunchWizardOpen}
        initialMode={draftLockMode}
        onCancel={() => {
          setIsLaunchWizardOpen(false);
          setDraftLockOnLaunch(securityConfig.lockOnLaunch && !!securityConfig.secretHash);
        }}
        onComplete={handleWizardComplete}
      />

      {/* Modale Conditions d'utilisation */}
      <Modal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
        title="Conditions d’utilisation de SHALOM"
        subtitle={`Version v${__SHALOM_APP_VERSION__} · Dernière mise à jour : ${__SHALOM_BUILD_DATE__}`}
        maxWidth="2xl"
      >
        <div className="space-y-4 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-1">1. Objet de l’application</h4>
            <p>
              SHALOM est un espace spirituel personnel hors ligne destiné à accompagner la prière, la méditation, les studios créatifs (graphique, présentation, vidéo, audio) et la conservation locale de ressources bibliques.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-1">2. Usage personnel et responsabilité</h4>
            <p>
              Vous demeurez entièrement propriétaire et responsable des contenus que vous rédigez, enregistrez, importez ou partagez depuis votre appareil.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-1">3. Services et ressources en ligne</h4>
            <p>
              Lorsque vous choisissez volontairement d’effectuer une recherche en ligne (livres dans le Coffre Spirituel ou ressources des studios) ou de partager via Gmail/WhatsApp/SMS, vous accédez à des services externes soumis à leurs propres conditions et licences.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-1">4. Sauvegarde de vos données</h4>
            <p>
              Utilisez régulièrement « Exporter / Restaurer (JSON) » dans Sauvegarde & Cache pour conserver une copie portable de vos données.
            </p>
          </div>
        </div>
      </Modal>

      {/* Modale Politique de confidentialité */}
      <Modal
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
        title="Politique de confidentialité de SHALOM"
        subtitle="Approche 100 % locale et confidentielle"
        maxWidth="2xl"
      >
        <div className="space-y-4 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-1">1. Stockage strictement local</h4>
            <p>
              SHALOM fonctionne sans compte cloud imposé : vos prières, autels, projets des studios, contacts, enregistrements et livres du Coffre Spirituel sont enregistrés exclusivement sur votre appareil.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-1">2. Aucune collecte ni revente</h4>
            <p>
              SHALOM ne collecte, ne vend et ne transmet aucune de vos données spirituelles ou personnelles à des serveurs publicitaires ou tiers.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-1">3. Sécurité locale</h4>
            <p>
              Votre code PIN, mot de passe ou schéma est transformé localement par hachage SHA-256 avant enregistrement sur votre appareil.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white mb-1">4. Recherches en ligne volontaires</h4>
            <p>
              Seules les recherches volontaires de ressources ou de livres en ligne effectuent une requête réseau directe. Tout le reste de l’application fonctionne en mode avion.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
};
