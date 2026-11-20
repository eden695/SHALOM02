import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, X } from 'lucide-react';
import { useShalomDB } from './hooks/useShalomDB';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { RecordingProvider, useGlobalRecording } from './contexts/RecordingContext';
import { NavigationProvider, useNavigation } from './contexts/NavigationContext';
import { Header } from './components/layout/Header';
import { Sidebar, NAV_ITEMS } from './components/layout/Sidebar';
import { BottomNav } from './components/layout/BottomNav';
import { FloatingRecordingBar } from './components/layout/FloatingRecordingBar';
import { Dashboard } from './components/dashboard/Dashboard';
import { AltarModule } from './components/altar/AltarModule';
import { PrayerModule } from './components/prayers/PrayerModule';
import { SpiritualJourneyModule } from './components/journey/SpiritualJourneyModule';
import { ParoleModule } from './components/parole/ParoleModule';
import { StudiosHub } from './components/studios/StudiosHub';
import { SpiritualVaultModule } from './components/vault/SpiritualVaultModule';
import { UnifiedCalendarModule } from './components/calendar/UnifiedCalendarModule';
import { ContactsModule } from './components/contacts/ContactsModule';
import { MessagingModule } from './components/messaging/MessagingModule';
import { SettingsModule } from './components/settings/SettingsModule';
import { LockModal } from './components/security/LockModal';
import {
  getSecurityConfig,
  getEffectiveAutoLockSeconds,
  isAppSessionUnlocked,
  setAppSessionUnlocked,
  isFeatureSessionUnlocked,
  unlockFeatureSession,
  lockAllSessions,
} from './services/security';
import { checkDueReminders, DueReminderPayload } from './services/notifications';
import { Contact, SecurityConfig, LockableFeatureId } from './types';

const LOCKABLE_IDS: LockableFeatureId[] = [
  'altar',
  'prayers',
  'journey',
  'parole',
  'studios',
  'vault',
  'calendar',
  'contacts',
  'messaging',
  'settings',
];

interface ShellProps {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  securityConfig: SecurityConfig;
  setSecurityConfig: React.Dispatch<React.SetStateAction<SecurityConfig>>;
  isLaunchLockOpen: boolean;
  setIsLaunchLockOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

function ShalomAppShell({
  isDarkMode,
  toggleDarkMode,
  securityConfig,
  setSecurityConfig,
  isLaunchLockOpen,
  setIsLaunchLockOpen,
}: ShellProps) {
  const { userProfile, loading } = useShalomDB();
  const { t, lang } = useLanguage();
  const isEn = lang === 'en';
  const { activeTab, canGoBack, navigateTo, goBack, goHome } = useNavigation();

  const [pendingFeatureUnlock, setPendingFeatureUnlock] = useState<{
    tab: string;
    subView?: string;
    lockId: LockableFeatureId;
  } | null>(null);

  const { recorderState } = useGlobalRecording();
  const [activeReminderBanner, setActiveReminderBanner] = useState<DueReminderPayload | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const isRecordingRef = useRef<boolean>(false);
  isRecordingRef.current = recorderState.isRecording;

  const handleLockNow = useCallback(() => {
    lockAllSessions();
    if (securityConfig.isEnabled && securityConfig.secretHash) {
      setIsLaunchLockOpen(true);
    }
  }, [securityConfig.isEnabled, securityConfig.secretHash, setIsLaunchLockOpen]);

  // Automatic inactivity lock monitor (supports seconds precision: 15s, 30s, 1min...)
  const autoLockSeconds = getEffectiveAutoLockSeconds(securityConfig);
  useEffect(() => {
    if (!securityConfig.isEnabled || !securityConfig.secretHash || autoLockSeconds <= 0) {
      return;
    }

    lastActivityRef.current = Date.now();
    const touchActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const thresholdMs = autoLockSeconds * 1000;
    const checkInactivity = () => {
      if (isRecordingRef.current) {
        lastActivityRef.current = Date.now();
        return;
      }
      if (!isLaunchLockOpen && Date.now() - lastActivityRef.current >= thresholdMs) {
        handleLockNow();
      }
    };

    window.addEventListener('pointerdown', touchActivity, { passive: true });
    window.addEventListener('keydown', touchActivity, { passive: true });
    window.addEventListener('touchstart', touchActivity, { passive: true });
    window.addEventListener('input', touchActivity, { passive: true });
    window.addEventListener('scroll', touchActivity, { passive: true });
    document.addEventListener('visibilitychange', checkInactivity);

    const pollIntervalMs = autoLockSeconds <= 60 ? 1000 : 5000;
    const intervalId = window.setInterval(checkInactivity, pollIntervalMs);

    return () => {
      window.removeEventListener('pointerdown', touchActivity);
      window.removeEventListener('keydown', touchActivity);
      window.removeEventListener('touchstart', touchActivity);
      window.removeEventListener('input', touchActivity);
      window.removeEventListener('scroll', touchActivity);
      document.removeEventListener('visibilitychange', checkInactivity);
      window.clearInterval(intervalId);
    };
  }, [
    securityConfig.isEnabled,
    securityConfig.secretHash,
    autoLockSeconds,
    isLaunchLockOpen,
    handleLockNow,
  ]);

  // Scheduled local prayer/meditation/bible reminders
  useEffect(() => {
    const runCheck = () => {
      const due = checkDueReminders(isEn);
      if (due) {
        setActiveReminderBanner(due);
      }
    };
    runCheck();
    const timer = window.setInterval(runCheck, 25000);
    return () => window.clearInterval(timer);
  }, [isEn]);

  const handleSelectTab = (tab: string, subView?: string) => {
    const isFeatureProtected =
      securityConfig.isEnabled &&
      !!securityConfig.secretHash &&
      LOCKABLE_IDS.includes(tab as LockableFeatureId) &&
      securityConfig.lockedFeatures.includes(tab as LockableFeatureId) &&
      !isFeatureSessionUnlocked(tab as LockableFeatureId);

    if (isFeatureProtected) {
      setPendingFeatureUnlock({
        tab,
        subView,
        lockId: tab as LockableFeatureId,
      });
      return;
    }

    navigateTo(tab, subView);
  };

  useEffect(() => {
    if (
      securityConfig.isEnabled &&
      !!securityConfig.secretHash &&
      LOCKABLE_IDS.includes(activeTab as LockableFeatureId) &&
      securityConfig.lockedFeatures.includes(activeTab as LockableFeatureId) &&
      !isFeatureSessionUnlocked(activeTab as LockableFeatureId)
    ) {
      goHome();
    }
  }, [activeTab, securityConfig, goHome]);

  const [campaignContacts, setCampaignContacts] = useState<Contact[] | undefined>(undefined);
  const [campaignMessage, setCampaignMessage] = useState<string | undefined>(undefined);

  const handleStartCampaignWithContacts = (targetContacts: Contact[], initialMsg?: string) => {
    setCampaignContacts(targetContacts);
    setCampaignMessage(initialMsg);
    handleSelectTab('messaging');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f7f8fa] dark:bg-[#060d1d] text-slate-800 dark:text-slate-100 p-4">
        <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-amber-400/50 shadow-xl mb-4 animate-pulse">
          <img
            src="./shalom_logo.jpg"
            alt="SHALOM"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover scale-[1.06]"
          />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-[#0b1f42] dark:text-white font-display">
          SHALOM
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Chargement de votre espace personnel...
        </p>
      </div>
    );
  }

  const activeNavItem = NAV_ITEMS.find((item) => item.id === activeTab);
  const pageTitle = activeNavItem
    ? t(activeNavItem.labelKey, activeNavItem.fallbackLabel)
    : 'SHALOM';

  return (
    <div className="min-h-screen flex bg-[#f7f8fa] dark:bg-[#060d1d] text-slate-900 dark:text-slate-100 transition-colors">
      <Sidebar
        userName={userProfile?.fullName}
        userAvatarUrl={userProfile?.avatarDataUrl}
        activeTab={activeTab}
        onSelectTab={(tab) => handleSelectTab(tab)}
        lockedFeatures={securityConfig.isEnabled ? securityConfig.lockedFeatures : []}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          pageTitle={pageTitle}
          showBackButton={canGoBack}
          isDarkMode={isDarkMode}
          onToggleDarkMode={toggleDarkMode}
          isSecurityEnabled={securityConfig.isEnabled}
          isUnlocked={isAppSessionUnlocked() || !isLaunchLockOpen}
          onLockClick={handleLockNow}
          onGoBack={goBack}
          onGoHome={goHome}
        />

        {activeReminderBanner && (
          <div className="max-w-5xl w-full mx-auto px-4 sm:px-6 pt-3">
            <div className="p-3.5 rounded-2xl bg-blue-700 text-white shadow-md flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <Bell className="w-4 h-4 text-amber-300 shrink-0" />
                <div className="min-w-0 text-xs">
                  <div className="font-bold truncate">{activeReminderBanner.title}</div>
                  <div className="text-blue-100 truncate">{activeReminderBanner.body}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveReminderBanner(null)}
                className="p-1.5 rounded-lg hover:bg-white/15 shrink-0"
                aria-label="Fermer le rappel"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 min-w-0 overflow-x-clip max-w-5xl w-full mx-auto p-4 sm:p-6 pb-24 lg:pb-10">
          {activeTab === 'dashboard' && (
            <Dashboard
              onNavigate={handleSelectTab}
              onOpenNewPrayer={() => handleSelectTab('prayers', 'requests')}
              onOpenNewParole={() => handleSelectTab('parole')}
              onOpenShareModal={() => handleSelectTab('messaging')}
            />
          )}

          {activeTab === 'altar' && <AltarModule />}

          {activeTab === 'prayers' && (
            <PrayerModule
              onShareWithContacts={(recipients, text) => {
                setCampaignContacts(recipients);
                setCampaignMessage(text);
                handleSelectTab('messaging');
              }}
              onOpenWhatsAppShare={(text: string) => {
                setCampaignContacts(undefined);
                setCampaignMessage(text);
                handleSelectTab('messaging');
              }}
            />
          )}

          {activeTab === 'journey' && <SpiritualJourneyModule />}

          {activeTab === 'parole' && <ParoleModule />}

          {activeTab === 'studios' && <StudiosHub />}

          {activeTab === 'vault' && <SpiritualVaultModule />}

          {activeTab === 'calendar' && <UnifiedCalendarModule />}

          {activeTab === 'contacts' && (
            <ContactsModule onStartCampaignWithContacts={handleStartCampaignWithContacts} />
          )}

          {activeTab === 'messaging' && (
            <MessagingModule
              initialContacts={campaignContacts}
              initialMessage={campaignMessage}
              onClose={() => {
                setCampaignContacts(undefined);
                setCampaignMessage(undefined);
                goBack();
              }}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsModule
              isDarkMode={isDarkMode}
              onToggleDarkMode={toggleDarkMode}
              onLockNow={handleLockNow}
              onSecurityChanged={(cfg) => setSecurityConfig(cfg)}
            />
          )}
        </main>
      </div>

      <FloatingRecordingBar
        activeTab={activeTab}
        onReturnToParole={() => handleSelectTab('parole')}
      />

      <BottomNav
        activeTab={activeTab}
        onSelectTab={(tab) => handleSelectTab(tab)}
        lockedFeatures={securityConfig.isEnabled ? securityConfig.lockedFeatures : []}
      />

      {securityConfig.isEnabled && securityConfig.secretHash && (
        <LockModal
          isOpen={isLaunchLockOpen}
          lockMode={securityConfig.lockMode}
          storedHash={securityConfig.secretHash}
          title="Ouverture Protégée — SHALOM"
          subtitle="Saisissez votre identification pour ouvrir l’application"
          onUnlocked={() => {
            setAppSessionUnlocked(true);
            setIsLaunchLockOpen(false);
          }}
        />
      )}

      {pendingFeatureUnlock && securityConfig.secretHash && (
        <LockModal
          isOpen={!!pendingFeatureUnlock}
          lockMode={securityConfig.lockMode}
          storedHash={securityConfig.secretHash}
          title="Fonctionnalité Verrouillée"
          subtitle="Confirmez votre identité pour accéder à cet espace"
          onUnlocked={() => {
            unlockFeatureSession(pendingFeatureUnlock.lockId);
            const target = pendingFeatureUnlock.tab;
            const subView = pendingFeatureUnlock.subView;
            setPendingFeatureUnlock(null);
            navigateTo(target, subView);
          }}
          onCancel={() => setPendingFeatureUnlock(null)}
        />
      )}
    </div>
  );
}

export default function App() {
  const { userProfile } = useShalomDB();

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('shalom_theme');
      if (saved) return saved === 'dark';
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('shalom_theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('shalom_theme', 'light');
      }
    } catch {
      if (isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode((prev) => !prev);

  const [securityConfig, setSecurityConfig] = useState<SecurityConfig>(() => getSecurityConfig());
  const [isLaunchLockOpen, setIsLaunchLockOpen] = useState<boolean>(() => {
    const cfg = getSecurityConfig();
    return cfg.isEnabled && cfg.lockOnLaunch && !!cfg.secretHash && !isAppSessionUnlocked();
  });

  return (
    <LanguageProvider initialLanguage={userProfile?.language}>
      <RecordingProvider>
        <NavigationProvider isLaunchLocked={isLaunchLockOpen}>
          <ShalomAppShell
            isDarkMode={isDarkMode}
            toggleDarkMode={toggleDarkMode}
            securityConfig={securityConfig}
            setSecurityConfig={setSecurityConfig}
            isLaunchLockOpen={isLaunchLockOpen}
            setIsLaunchLockOpen={setIsLaunchLockOpen}
          />
        </NavigationProvider>
      </RecordingProvider>
    </LanguageProvider>
  );
}
