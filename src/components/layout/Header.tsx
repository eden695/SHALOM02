import React, { useState } from 'react';
import { Sun, Moon, ShieldCheck, Shield, Download, ArrowLeft, Home } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { useLanguage } from '../../contexts/LanguageContext';
import { Modal } from '../common/Modal';

interface HeaderProps {
  pageTitle: string;
  showBackButton?: boolean;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  isSecurityEnabled: boolean;
  isUnlocked: boolean;
  onLockClick: () => void;
  onGoBack: () => void;
  onGoHome: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  pageTitle,
  showBackButton = false,
  isDarkMode,
  onToggleDarkMode,
  isSecurityEnabled,
  isUnlocked,
  onLockClick,
  onGoBack,
  onGoHome,
}) => {
  const { isInstallable, install, isIOS } = usePWAInstall();
  const { t } = useLanguage();
  const [showIosPrompt, setShowIosPrompt] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 w-full bg-white/90 dark:bg-[#060d1d]/90 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          {showBackButton ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onGoBack}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-100 text-xs font-bold flex items-center gap-1.5 shrink-0 transition"
                aria-label={t('header.back')}
                title={t('header.back')}
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{t('header.back')}</span>
              </button>
              <button
                type="button"
                onClick={onGoHome}
                className="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/70 text-blue-700 dark:text-blue-200 border border-blue-200/70 dark:border-blue-800/60 text-xs font-bold flex items-center gap-1.5 shrink-0 transition"
                aria-label={t('header.home')}
                title={t('header.home')}
              >
                <Home className="w-4 h-4" />
                <span className="hidden sm:inline">{t('header.home')}</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onGoHome}
              className="lg:hidden w-8 h-8 rounded-lg overflow-hidden border border-amber-400/40 bg-[#0b1f42] shrink-0"
              aria-label="SHALOM"
            >
              <img
                src="./shalom_logo.jpg"
                alt="SHALOM"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover scale-[1.06]"
              />
            </button>
          )}

          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate font-display">
              {pageTitle}
            </h1>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 lg:hidden leading-none mt-0.5">
              {t('header.tagline')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isInstallable && (
            <button
              type="button"
              onClick={install}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('header.install')}</span>
            </button>
          )}

          {isIOS && (
            <button
              type="button"
              onClick={() => setShowIosPrompt(true)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              + iOS
            </button>
          )}

          {isSecurityEnabled && (
            <button
              type="button"
              onClick={onLockClick}
              className={`h-9 px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-semibold border transition ${
                isUnlocked
                  ? 'text-emerald-700 border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 dark:text-emerald-300'
                  : 'text-amber-700 border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 dark:text-amber-300'
              }`}
              title={t('header.lock')}
            >
              {isUnlocked ? <ShieldCheck className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
              <span className="hidden sm:inline">{t('header.lock')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleDarkMode}
            aria-label="Basculer le thème"
            className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/70 dark:border-slate-800 transition"
          >
            {isDarkMode ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>
        </div>
      </header>

      <Modal
        isOpen={showIosPrompt}
        onClose={() => setShowIosPrompt(false)}
        title="Installer SHALOM sur iPhone / iPad"
        maxWidth="sm"
      >
        <div className="space-y-4 text-center">
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed text-left">
            1. Touchez l’icône <strong>Partager</strong> dans Safari.<br />
            2. Touchez <strong>Sur l’écran d’accueil</strong>.<br />
            3. Accédez à SHALOM même hors-ligne.
          </p>
          <button
            type="button"
            onClick={() => setShowIosPrompt(false)}
            className="w-full rounded-xl bg-blue-700 py-2 text-xs font-semibold text-white hover:bg-blue-800"
          >
            Compris
          </button>
        </div>
      </Modal>
    </>
  );
};
