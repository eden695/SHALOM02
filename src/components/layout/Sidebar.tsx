import React from 'react';
import {
  Home,
  Flame,
  HeartHandshake,
  TrendingUp,
  Mic,
  Sparkles,
  Vault,
  Calendar,
  Users,
  MessageSquare,
  Settings,
  Lock,
} from 'lucide-react';
import { LockableFeatureId } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';

interface SidebarProps {
  userName?: string;
  userAvatarUrl?: string;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  lockedFeatures: LockableFeatureId[];
}

export interface NavItem {
  id: string;
  labelKey: string;
  fallbackLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  lockId?: LockableFeatureId;
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', labelKey: 'nav.dashboard', fallbackLabel: 'Accueil', icon: Home },
  { id: 'altar', labelKey: 'nav.altar', fallbackLabel: 'Mon Autel', icon: Flame, lockId: 'altar' },
  {
    id: 'prayers',
    labelKey: 'nav.prayers',
    fallbackLabel: 'Prières & Témoignages',
    icon: HeartHandshake,
    lockId: 'prayers',
  },
  {
    id: 'journey',
    labelKey: 'nav.journey',
    fallbackLabel: 'Parcours Spirituel',
    icon: TrendingUp,
    lockId: 'journey',
  },
  { id: 'parole', labelKey: 'nav.parole', fallbackLabel: 'Parole Divine', icon: Mic, lockId: 'parole' },
  {
    id: 'studios',
    labelKey: 'nav.studios',
    fallbackLabel: 'Studios Créatifs',
    icon: Sparkles,
    lockId: 'studios',
  },
  {
    id: 'vault',
    labelKey: 'nav.vault',
    fallbackLabel: 'Coffre Spirituel',
    icon: Vault,
    lockId: 'vault',
  },
  {
    id: 'calendar',
    labelKey: 'nav.calendar',
    fallbackLabel: 'Mon Calendrier',
    icon: Calendar,
    lockId: 'calendar',
  },
  {
    id: 'contacts',
    labelKey: 'nav.contacts',
    fallbackLabel: 'Mes Contacts',
    icon: Users,
    lockId: 'contacts',
  },
  {
    id: 'messaging',
    labelKey: 'nav.messaging',
    fallbackLabel: 'Partage WhatsApp / SMS',
    icon: MessageSquare,
    lockId: 'messaging',
  },
  {
    id: 'settings',
    labelKey: 'nav.settings',
    fallbackLabel: 'Paramètres',
    icon: Settings,
    lockId: 'settings',
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  userName,
  userAvatarUrl,
  activeTab,
  onSelectTab,
  lockedFeatures,
}) => {
  const { t } = useLanguage();
  const displayName = userName?.trim() || 'Utilisateur';

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-white dark:bg-[#091229] border-r border-slate-200/80 dark:border-slate-800/80 h-screen sticky top-0 select-none">
      {/* Brand Block */}
      <div className="px-5 py-5 border-b border-slate-100 dark:border-slate-800/80">
        <div
          onClick={() => onSelectTab('dashboard')}
          className="flex items-center gap-3 cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl overflow-hidden border border-amber-400/40 bg-[#0b1f42] shrink-0 shadow-xs">
            <img
              src="./shalom_logo.jpg"
              alt="SHALOM"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover scale-[1.06]"
            />
          </div>
          <div className="min-w-0">
            <span className="text-lg font-extrabold tracking-tight text-[#0b1f42] dark:text-white font-display block leading-none">
              SHALOM
            </span>
            <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400 block truncate mt-1">
              {t('sidebar.subtitle')}
            </span>
          </div>
        </div>

        <div className="mt-3.5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full overflow-hidden bg-[#0b1f42] text-white flex items-center justify-center text-xs font-bold shrink-0 border border-amber-400/50">
            {userAvatarUrl ? (
              <img src={userAvatarUrl} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <span>{displayName.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
            {displayName}
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const isLocked = item.lockId ? lockedFeatures.includes(item.lockId) : false;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[13px] font-medium transition-colors ${
                isActive
                  ? 'bg-[#0b1f42] text-white dark:bg-blue-700 dark:text-white font-semibold shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2.5 truncate">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-amber-300' : 'text-slate-400'}`} />
                <span className="truncate">{t(item.labelKey, item.fallbackLabel)}</span>
              </span>
              {isLocked && (
                <Lock className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-amber-200' : 'text-slate-400'}`} />
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-400 dark:text-slate-500">
        <p className="italic">{t('sidebar.motto')}</p>
      </div>
    </aside>
  );
};
