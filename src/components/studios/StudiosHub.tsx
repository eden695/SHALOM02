import React from 'react';
import { Palette, Music, Film, Presentation, Sparkles } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { useModuleSubView } from '../../contexts/NavigationContext';
import { StudioKind } from '../../types';
import { CreativeStudioModule } from './CreativeStudioModule';
import { PresentationStudioModule } from './PresentationStudioModule';
import { AudioStudioModule } from './AudioStudioModule';
import { VideoStudioModule } from './VideoStudioModule';

export const StudiosHub: React.FC = () => {
  const { lang } = useLanguage();
  const isEn = lang === 'en';
  const [activeStudio, setActiveStudio] = useModuleSubView<StudioKind>('studios', 'design');

  const studioTabs: Array<{ id: StudioKind; label: string; icon: React.ReactNode }> = [
    {
      id: 'design',
      label: isEn ? 'Graphic' : 'Studio Graphique',
      icon: <Palette className="w-4 h-4" />,
    },
    {
      id: 'presentation',
      label: isEn ? 'Presentation' : 'Présentation',
      icon: <Presentation className="w-4 h-4" />,
    },
    {
      id: 'video',
      label: isEn ? 'Video' : 'Studio Vidéo',
      icon: <Film className="w-4 h-4" />,
    },
    {
      id: 'audio',
      label: isEn ? 'Audio' : 'Studio Audio',
      icon: <Music className="w-4 h-4" />,
    },
  ];

  return (
    <div className="space-y-6 w-full min-w-0 overflow-x-clip animate-in fade-in duration-200">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2 font-display">
            <Sparkles className="w-6 h-6 text-amber-500" />
            <span>{isEn ? 'Christian Creative Studios' : 'Studios de Création SHALOM'}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isEn
              ? 'Graphic Design, Presentations, Video & Audio Studios — full local creation + online asset search.'
              : 'Studio Graphique, Présentation, Vidéo & Audio — création locale hors-ligne et ressources en ligne.'}
          </p>
        </div>

        <div className="studio-scroll-x flex items-center gap-1.5 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60">
          {studioTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveStudio(tab.id)}
              className={`min-h-[44px] px-3.5 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 shrink-0 transition ${
                activeStudio === tab.id
                  ? 'bg-white dark:bg-[#0f2b5c] text-blue-700 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {activeStudio === 'design' && <CreativeStudioModule />}
      {activeStudio === 'presentation' && <PresentationStudioModule />}
      {activeStudio === 'video' && <VideoStudioModule />}
      {activeStudio === 'audio' && <AudioStudioModule />}
    </div>
  );
};
