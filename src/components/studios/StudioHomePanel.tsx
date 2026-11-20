import React, { useEffect, useState } from 'react';
import {
  Plus,
  LayoutTemplate,
  FolderOpen,
  Copy,
  Trash2,
  ArrowRight,
  Film,
  Music2,
  Presentation,
  Palette,
} from 'lucide-react';
import { StudioKind, StudioProjectRecord } from '../../types';
import { dbService } from '../../services/db';
import { useLanguage } from '../../contexts/LanguageContext';
import { ConfirmDialog } from '../common/ConfirmDialog';

export interface StudioTemplateCard {
  id: string;
  title: string;
  subtitle: string;
  formatLabel: string;
  previewBg: string;
  previewTextColor?: string;
  previewAccent?: string;
  sampleHeading: string;
  sampleSub?: string;
}

interface StudioHomePanelProps {
  studio: StudioKind;
  studioTitle: string;
  studioDescription: string;
  headerIcon: React.ReactNode;
  blankLabel: string;
  blankFormats?: Array<{ id: string; label: string; dimensions?: string }>;
  templates: StudioTemplateCard[];
  recentProjects: StudioProjectRecord[];
  onCreateBlank: (formatId?: string) => void;
  onSelectTemplate: (templateId: string) => void;
  onOpenProject: (project: StudioProjectRecord) => void;
  onDuplicateProject: (project: StudioProjectRecord) => void;
  onDeleteProject: (project: StudioProjectRecord) => void;
  extraContent?: React.ReactNode;
}

const STUDIO_THEMES: Record<
  StudioKind,
  {
    heroGradient: string;
    accentColor: string;
    cardFallbackBg: string;
  }
> = {
  design: {
    heroGradient: 'from-[#0b1f42] via-[#132f63] to-[#1d4ed8]',
    accentColor: 'text-blue-700 dark:text-blue-400',
    cardFallbackBg: 'from-slate-900 via-[#102654] to-[#1e40af]',
  },
  presentation: {
    heroGradient: 'from-[#0f2942] via-[#123d5e] to-[#0f766e]',
    accentColor: 'text-teal-700 dark:text-teal-400',
    cardFallbackBg: 'from-[#0f2942] via-[#134e4a] to-[#0f766e]',
  },
  video: {
    heroGradient: 'from-[#111827] via-[#1e1b4b] to-[#4338ca]',
    accentColor: 'text-indigo-700 dark:text-indigo-400',
    cardFallbackBg: 'from-slate-950 via-indigo-950 to-indigo-800',
  },
  audio: {
    heroGradient: 'from-[#0c2333] via-[#0f3b4c] to-[#0369a1]',
    accentColor: 'text-sky-700 dark:text-sky-400',
    cardFallbackBg: 'from-slate-950 via-sky-950 to-cyan-800',
  },
};

function getFormatFrameDimensions(id: string, dimensions?: string): { w: number; h: number } {
  const src = `${id} ${dimensions || ''}`.toLowerCase();
  if (src.includes('9:16') || src.includes('story') || src.includes('vertical')) {
    return { w: 16, h: 26 };
  }
  if (src.includes('4:5') || src.includes('portrait') || src.includes('a4')) {
    return { w: 18, h: 24 };
  }
  if (src.includes('16:9') || src.includes('landscape') || src.includes('youtube')) {
    return { w: 28, h: 17 };
  }
  if (src.includes('4:3')) {
    return { w: 24, h: 19 };
  }
  return { w: 21, h: 21 };
}

function renderFallbackGraphic(studio: StudioKind, title: string, accentFallbackBg: string) {
  if (studio === 'audio') {
    return (
      <div
        className={`w-full h-28 rounded-xl bg-gradient-to-br ${accentFallbackBg} text-white p-3.5 flex flex-col justify-between relative overflow-hidden`}
      >
        <div className="flex items-center justify-between opacity-75">
          <Music2 className="w-4 h-4" />
          <span className="text-[10px] font-medium tracking-wide">Audio multipiste</span>
        </div>
        <div className="flex items-end gap-1 h-9 opacity-85" aria-hidden="true">
          {[35, 70, 50, 90, 62, 85, 40, 75, 55, 95, 48, 68, 38, 80, 45].map((pct, i) => (
            <div
              key={i}
              style={{ height: `${pct}%` }}
              className="flex-1 rounded-sm bg-sky-300/75"
            />
          ))}
        </div>
      </div>
    );
  }

  if (studio === 'video') {
    return (
      <div
        className={`w-full h-28 rounded-xl bg-gradient-to-br ${accentFallbackBg} text-white p-3.5 flex flex-col justify-between relative overflow-hidden`}
      >
        <div className="flex items-center justify-between opacity-80">
          <Film className="w-4 h-4" />
          <span className="text-[10px] font-medium tracking-wide">Montage vidéo</span>
        </div>
        <div className="space-y-1.5" aria-hidden="true">
          <div className="text-xs font-bold text-white/95 truncate">{title}</div>
          <div className="grid grid-cols-4 gap-1 h-4">
            <div className="rounded bg-indigo-400/50 col-span-2" />
            <div className="rounded bg-amber-300/60" />
            <div className="rounded bg-sky-300/50" />
          </div>
        </div>
      </div>
    );
  }

  const Icon = studio === 'presentation' ? Presentation : Palette;
  return (
    <div
      className={`w-full h-28 rounded-xl bg-gradient-to-br ${accentFallbackBg} text-white p-3.5 flex flex-col justify-between relative overflow-hidden`}
    >
      <div className="flex items-center justify-between opacity-80">
        <Icon className="w-4 h-4" />
        <span className="text-[10px] font-medium tracking-wide">
          {studio === 'presentation' ? 'Diaporama' : 'Création graphique'}
        </span>
      </div>
      <div className="text-xs font-bold text-white/95 line-clamp-2 leading-snug">{title}</div>
    </div>
  );
}

export const StudioHomePanel: React.FC<StudioHomePanelProps> = ({
  studio,
  studioTitle,
  studioDescription,
  headerIcon,
  blankLabel,
  blankFormats,
  templates,
  recentProjects,
  onCreateBlank,
  onSelectTemplate,
  onOpenProject,
  onDuplicateProject,
  onDeleteProject,
  extraContent,
}) => {
  const { lang } = useLanguage();
  const isEn = lang === 'en';
  const [confirmDelete, setConfirmDelete] = useState<StudioProjectRecord | null>(null);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});

  const theme = STUDIO_THEMES[studio];

  useEffect(() => {
    let cancelled = false;
    const createdUrls: string[] = [];

    const loadThumbnails = async () => {
      const next: Record<string, string> = {};
      for (const proj of recentProjects) {
        if (!proj.thumbnailBlobKey) continue;
        try {
          const blob = await dbService.getMediaBlob(proj.thumbnailBlobKey);
          if (cancelled) break;
          if (blob) {
            const url = URL.createObjectURL(blob);
            createdUrls.push(url);
            next[proj.id] = url;
          }
        } catch {
          // ignore corrupted thumbnail blob
        }
      }
      if (!cancelled) {
        setThumbUrls(next);
      } else {
        createdUrls.forEach((u) => URL.revokeObjectURL(u));
      }
    };

    loadThumbnails();

    return () => {
      cancelled = true;
      createdUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [recentProjects]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200 min-w-0">
      {/* Studio Workspace Header */}
      <section
        className={`p-5 sm:p-6 rounded-3xl bg-gradient-to-br ${theme.heroGradient} text-white shadow-lg flex flex-col lg:flex-row lg:items-center justify-between gap-5`}
      >
        <div className="space-y-2 min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
              {headerIcon}
            </div>
            <div className="min-w-0">
              <h3 className="text-lg sm:text-xl font-extrabold font-display tracking-tight text-balance">
                {studioTitle}
              </h3>
              <div className="text-[12px] text-blue-100/85 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
                <span>
                  {templates.length} {isEn ? 'templates' : 'modèles'}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {recentProjects.length} {isEn ? 'saved projects' : 'projets enregistrés'}
                </span>
                <span aria-hidden="true">·</span>
                <span>{isEn ? '100% offline' : '100 % hors ligne'}</span>
              </div>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-blue-50/90 max-w-2xl leading-relaxed">
            {studioDescription}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onCreateBlank(blankFormats?.[0]?.id)}
          className="min-h-[48px] px-5 py-3 rounded-2xl bg-amber-400 hover:bg-amber-300 active:scale-[0.98] text-slate-950 text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 shadow-md transition whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4 stroke-[2.75]" />
          <span>{blankLabel}</span>
        </button>
      </section>

      {/* Proportional Quick Start Formats */}
      {blankFormats && blankFormats.length > 0 && (
        <section className="space-y-2.5 min-w-0">
          <h4 className="text-xs font-bold tracking-wide text-slate-600 dark:text-slate-300">
            {isEn ? 'Create from Blank Canvas' : 'Créer depuis un format vierge'}
          </h4>
          <div className="studio-scroll-x flex gap-2.5 pb-1.5">
            {blankFormats.map((fmt) => {
              const box = getFormatFrameDimensions(fmt.id, fmt.dimensions);
              return (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => onCreateBlank(fmt.id)}
                  className="min-h-[52px] px-3.5 py-2.5 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 text-left shrink-0 transition flex items-center gap-3 active:scale-[0.98]"
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-900 flex items-center justify-center shrink-0">
                    <span
                      aria-hidden="true"
                      style={{ width: `${box.w}px`, height: `${box.h}px` }}
                      className="rounded-[3px] border-2 border-blue-700 dark:border-blue-400 bg-blue-500/10 block"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">
                      {fmt.label}
                    </div>
                    {fmt.dimensions && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                        {fmt.dimensions}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Recent Editable Projects */}
      <section className="space-y-3 min-w-0">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-blue-700 dark:text-blue-400" />
            <span>
              {isEn
                ? `Recent Projects (${recentProjects.length})`
                : `Mes projets récents (${recentProjects.length})`}
            </span>
          </h4>
        </div>

        {recentProjects.length === 0 ? (
          <div className="p-6 rounded-2xl bg-white dark:bg-[#0c1631] border border-dashed border-slate-300 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 text-center">
            {isEn
              ? 'No saved projects yet. Create a blank canvas or start from a template below.'
              : 'Aucun projet enregistré pour le moment. Créez un projet vierge ou sélectionnez un modèle ci-dessous.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {recentProjects.map((proj) => {
              const thumbUrl = thumbUrls[proj.id];
              return (
                <article
                  key={proj.id}
                  className="p-3.5 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-3 hover:border-blue-400 dark:hover:border-blue-600 transition"
                >
                  <button
                    type="button"
                    onClick={() => onOpenProject(proj)}
                    className="text-left space-y-2.5 group focus-visible:outline-none"
                  >
                    {thumbUrl ? (
                      <div className="w-full h-28 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                        <img
                          src={thumbUrl}
                          alt={proj.title}
                          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                        />
                      </div>
                    ) : (
                      renderFallbackGraphic(studio, proj.title, theme.cardFallbackBg)
                    )}

                    <div className="space-y-0.5 min-w-0">
                      <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {proj.title}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums flex flex-wrap items-center gap-x-1.5">
                        <span>
                          {new Date(proj.updatedAt).toLocaleDateString(isEn ? 'en-US' : 'fr-FR', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {proj.formatLabel && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="truncate">{proj.formatLabel}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenProject(proj)}
                      className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <span>{isEn ? 'Open Editor' : 'Modifier'}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDuplicateProject(proj)}
                      aria-label={isEn ? 'Duplicate project' : 'Dupliquer le projet'}
                      title={isEn ? 'Duplicate' : 'Dupliquer'}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(proj)}
                      aria-label={isEn ? 'Delete project' : 'Supprimer le projet'}
                      title={isEn ? 'Delete' : 'Supprimer'}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Templates Gallery */}
      <section className="space-y-3 min-w-0">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <LayoutTemplate className="w-4 h-4 text-amber-500" />
            <span>
              {isEn ? 'Templates Ready to Customize' : 'Modèles prêts à personnaliser'}
            </span>
          </h4>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => onSelectTemplate(tpl.id)}
              className="group text-left p-3.5 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 transition flex flex-col gap-3 active:scale-[0.99]"
            >
              <div
                style={{
                  background: tpl.previewBg,
                  color: tpl.previewTextColor || '#ffffff',
                }}
                className="w-full h-32 rounded-xl p-4 flex flex-col justify-between relative overflow-hidden"
              >
                <div className="flex items-center justify-between gap-2 text-[11px] font-semibold opacity-85">
                  <span className="truncate">{tpl.formatLabel}</span>
                </div>

                {tpl.previewAccent && (
                  <div
                    aria-hidden="true"
                    style={{ backgroundColor: tpl.previewAccent }}
                    className="w-10 h-1 rounded-full opacity-90"
                  />
                )}

                <div className="min-w-0">
                  <div className="font-display font-extrabold text-sm leading-tight line-clamp-2 text-balance">
                    {tpl.sampleHeading}
                  </div>
                  {tpl.sampleSub && (
                    <div className="text-[11px] opacity-80 mt-1 truncate">{tpl.sampleSub}</div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {tpl.title}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {tpl.subtitle}
                  </div>
                </div>
                <span
                  className={`text-xs font-bold ${theme.accentColor} shrink-0 group-hover:translate-x-0.5 transition-transform whitespace-nowrap`}
                >
                  {isEn ? 'Use →' : 'Utiliser →'}
                </span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {extraContent}

      <ConfirmDialog
        isOpen={!!confirmDelete}
        title={isEn ? 'Delete project?' : 'Supprimer ce projet ?'}
        message={
          confirmDelete
            ? `${isEn ? 'Delete' : 'Supprimer'} « ${confirmDelete.title} » ?`
            : ''
        }
        confirmLabel={isEn ? 'Delete' : 'Supprimer'}
        cancelLabel={isEn ? 'Cancel' : 'Annuler'}
        isDestructive
        onConfirm={() => {
          if (confirmDelete) onDeleteProject(confirmDelete);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
};
