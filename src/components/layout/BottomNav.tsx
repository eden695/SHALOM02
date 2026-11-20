import React, { useState, useEffect } from 'react';
import { Home, Flame, HeartHandshake, Mic, Menu, X, Lock } from 'lucide-react';
import { LockableFeatureId } from '../../types';
import { NAV_ITEMS } from './Sidebar';
import { useLanguage } from '../../contexts/LanguageContext';
import { useNavigationOptional } from '../../contexts/NavigationContext';

interface BottomNavProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  lockedFeatures: LockableFeatureId[];
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
  lockedFeatures,
}) => {
  const { t } = useLanguage();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const nav = useNavigationOptional();
  const registerOverlay = nav?.registerOverlay;
  const unregisterOverlay = nav?.unregisterOverlay;

  useEffect(() => {
    if (!drawerOpen) return;
    registerOverlay?.('bottom-nav-drawer', () => setDrawerOpen(false), 'Menu');
    return () => {
      unregisterOverlay?.('bottom-nav-drawer');
    };
  }, [drawerOpen, registerOverlay, unregisterOverlay]);

  const primaryTabs = [
    { id: 'dashboard', label: t('bottom.home'), icon: Home },
    { id: 'altar', label: t('bottom.altar'), icon: Flame },
    { id: 'prayers', label: t('bottom.prayers'), icon: HeartHandshake },
    { id: 'parole', label: t('bottom.parole'), icon: Mic },
  ];

  return (
    <>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#060d1d]/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800/80 pb-[env(safe-area-inset-bottom,4px)]">
        <div className="grid grid-cols-5 h-14 max-w-lg mx-auto px-1 items-center">
          {primaryTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  onSelectTab(tab.id);
                  setDrawerOpen(false);
                }}
                className={`flex flex-col items-center justify-center min-h-[44px] py-1 transition-colors ${
                  isActive
                    ? 'text-blue-700 dark:text-blue-400 font-bold'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] tracking-tight mt-0.5 leading-none">
                  {tab.label}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setDrawerOpen((prev) => !prev)}
            className={`flex flex-col items-center justify-center min-h-[44px] py-1 transition-colors ${
              drawerOpen
                ? 'text-blue-700 dark:text-blue-400 font-bold'
                : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            {drawerOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            <span className="text-[10px] tracking-tight mt-0.5 leading-none">{t('bottom.more')}</span>
          </button>
        </div>
      </nav>

      {/* Mobile Drawer */}
      {drawerOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-slate-950/60 backdrop-blur-xs flex items-end"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="w-full bg-white dark:bg-[#0c1631] rounded-t-3xl p-5 pb-20 border-t border-slate-200 dark:border-slate-800 shadow-2xl max-h-[75vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 px-1">
              {t('bottom.menuTitle')}
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const isLocked = item.lockId ? lockedFeatures.includes(item.lockId) : false;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onSelectTab(item.id);
                      setDrawerOpen(false);
                    }}
                    className={`p-3 rounded-2xl border text-left flex items-center justify-between gap-2 transition ${
                      isActive
                        ? 'bg-[#0b1f42] text-white border-[#0b1f42] dark:bg-blue-700 dark:border-blue-700'
                        : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="text-xs font-semibold truncate">
                        {t(item.labelKey, item.fallbackLabel)}
                      </span>
                    </span>
                    {isLocked && <Lock className="w-3 h-3 shrink-0 opacity-75" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
