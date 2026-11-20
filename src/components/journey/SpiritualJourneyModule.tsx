import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Clock,
  BookOpen,
  Heart,
  Sparkles,
  Award,
  Plus,
  Trash2,
  CheckCircle2,
  Calendar,
  Sun,
  CheckSquare,
  Square,
} from 'lucide-react';
import { useShalomDB } from '../../hooks/useShalomDB';
import { dbService, STORES } from '../../services/db';
import { useLanguage } from '../../contexts/LanguageContext';
import { useModuleSubView } from '../../contexts/NavigationContext';
import {
  SpiritualHabitLog,
  SpiritualHabitType,
  PersonalProgram,
} from '../../types';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import {
  MediaPickerBox,
  StoredMediaViewer,
  persistOptionalMedia,
} from '../common/MediaAttachment';

export const SpiritualJourneyModule: React.FC = () => {
  const { lang } = useLanguage();
  const { habitLogs, personalPrograms, reloadData } = useShalomDB();
  const isEn = lang === 'en';

  const currentYear = new Date().getFullYear();
  const todayIso = new Date().toISOString().split('T')[0];

  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [logType, setLogType] = useState<SpiritualHabitType>('priere');
  const [logDate, setLogDate] = useState(todayIso);
  const [logMinutes, setLogMinutes] = useState('15');
  const [logNote, setLogNote] = useState('');
  const [logVerseRef, setLogVerseRef] = useState('');
  const [logVerseText, setLogVerseText] = useState('');
  const [logPendingMedia, setLogPendingMedia] = useState<File | null>(null);

  const [isProgramModalOpen, setIsProgramModalOpen] = useState(false);
  const [progTitle, setProgTitle] = useState('');
  const [progTheme, setProgTheme] = useState('');
  const [progStartDate, setProgStartDate] = useState(todayIso);
  const [progTargetDays, setProgTargetDays] = useState('7');
  const [progPendingMedia, setProgPendingMedia] = useState<File | null>(null);

  const [progressView, setProgressView] = useModuleSubView<'weekly' | 'monthly'>(
    'journey',
    'weekly'
  );
  const [filterHabit, setFilterHabit] = useState<SpiritualHabitType | 'all'>('all');

  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<{
    store: typeof STORES.HABIT_LOGS | typeof STORES.PERSONAL_PROGRAMS;
    ids: string[];
    blobKeys: string[];
    label: string;
  } | null>(null);

  const isEmptyJourney = habitLogs.length === 0 && personalPrograms.length === 0;

  const habitConfig: Record<
    SpiritualHabitType,
    { label: string; unitLabel: string; colorClass: string; barColor: string }
  > = {
    priere: {
      label: isEn ? 'Prayer' : 'Prière',
      unitLabel: isEn ? 'Time spent' : 'Temps consacré',
      colorClass: 'text-blue-700 dark:text-blue-400',
      barColor: 'bg-blue-600',
    },
    meditation: {
      label: isEn ? 'Meditation' : 'Méditation',
      unitLabel: isEn ? 'Reflections recorded' : 'Réflexions enregistrées',
      colorClass: 'text-indigo-700 dark:text-indigo-400',
      barColor: 'bg-indigo-600',
    },
    jeune: {
      label: isEn ? 'Fasting' : 'Jeûne',
      unitLabel: isEn ? 'Voluntary fasting days' : 'Jours déclarés volontairement',
      colorClass: 'text-amber-700 dark:text-amber-400',
      barColor: 'bg-amber-500',
    },
    memorisation: {
      label: isEn ? 'Memorization' : 'Mémorisation',
      unitLabel: isEn ? 'Verses learned' : 'Versets appris',
      colorClass: 'text-emerald-700 dark:text-emerald-400',
      barColor: 'bg-emerald-600',
    },
    gratitude: {
      label: isEn ? 'Gratitude' : 'Gratitude',
      unitLabel: isEn ? 'Thanksgiving topics' : 'Sujets de reconnaissance',
      colorClass: 'text-rose-700 dark:text-rose-400',
      barColor: 'bg-rose-500',
    },
  };

  const summary = useMemo(() => {
    const prayerMinutes = habitLogs
      .filter((h) => h.type === 'priere')
      .reduce((acc, h) => acc + (h.durationMinutes || 15), 0);
    const meditationCount = habitLogs.filter((h) => h.type === 'meditation').length;
    const fastingDays = new Set(
      habitLogs.filter((h) => h.type === 'jeune').map((h) => h.date)
    ).size;
    const versesCount = habitLogs.filter((h) => h.type === 'memorisation').length;
    const gratitudeCount = habitLogs.filter((h) => h.type === 'gratitude').length;

    const programsThisYear = personalPrograms.filter(
      (p) => p.year === currentYear || p.startDate.startsWith(String(currentYear))
    );
    const completedProgramsThisYear = programsThisYear.filter((p) => p.status === 'termine').length;

    return {
      prayerMinutes,
      meditationCount,
      fastingDays,
      versesCount,
      gratitudeCount,
      programsCount: programsThisYear.length,
      completedProgramsThisYear,
    };
  }, [habitLogs, personalPrograms, currentYear]);

  const weeklyData = useMemo(() => {
    const days: Array<{ iso: string; label: string; count: number; minutes: number }> = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      const dayLabel = new Intl.DateTimeFormat(isEn ? 'en-US' : 'fr-FR', {
        weekday: 'short',
      }).format(d);
      const matching = habitLogs.filter((h) => h.date === iso);
      days.push({
        iso,
        label: dayLabel,
        count: matching.length,
        minutes: matching.reduce((sum, item) => sum + (item.durationMinutes || 0), 0),
      });
    }
    const maxCount = Math.max(1, ...days.map((d) => d.count));
    return { days, maxCount };
  }, [habitLogs, isEn]);

  const monthlyData = useMemo(() => {
    const now = new Date();
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const inMonth = habitLogs.filter((h) => h.date.startsWith(monthPrefix));
    const buckets = [
      { label: isEn ? 'Week 1 (1–7)' : 'Sem. 1 (1–7)', count: 0 },
      { label: isEn ? 'Week 2 (8–14)' : 'Sem. 2 (8–14)', count: 0 },
      { label: isEn ? 'Week 3 (15–21)' : 'Sem. 3 (15–21)', count: 0 },
      { label: isEn ? 'Week 4 (22–31)' : 'Sem. 4 (22–31)', count: 0 },
    ];
    inMonth.forEach((item) => {
      const dayNum = parseInt(item.date.split('-')[2] || '1', 10);
      if (dayNum <= 7) buckets[0].count++;
      else if (dayNum <= 14) buckets[1].count++;
      else if (dayNum <= 21) buckets[2].count++;
      else buckets[3].count++;
    });
    const maxCount = Math.max(1, ...buckets.map((b) => b.count));
    return { buckets, maxCount, totalMonth: inMonth.length };
  }, [habitLogs, isEn]);

  const encouragementMessage = useMemo(() => {
    const activeLast7Days = weeklyData.days.filter((d) => d.count > 0).length;
    if (habitLogs.length === 0) {
      return isEn
        ? 'Welcome to your spiritual journey! Every small moment with God counts. Start gently whenever you are ready.'
        : 'Bienvenue dans votre parcours spirituel ! Chaque petit pas avec Dieu compte. Commencez doucement à votre rythme.';
    }
    if (activeLast7Days === 0) {
      return isEn
        ? 'The Lord’s mercies are new every morning (Lam. 3:22-23). Pause whenever you can — there is no pressure or guilt here.'
        : 'Les bontés de l’Éternel se renouvellent chaque matin (Lamentations 3:22-23). Reprenez simplement aujourd’hui avec paix et sans culpabilité.';
    }
    if (activeLast7Days < 4) {
      return isEn
        ? `You nurtured your faith on ${activeLast7Days} day(s) this week. Celebrate every step forward — grace walks with you!`
        : `Vous avez nourri votre foi ${activeLast7Days} jour(s) cette semaine. Réjouissez-vous de chaque pas — la grâce marche avec vous !`;
    }
    return isEn
      ? `Wonderful faithfulness! ${activeLast7Days} days of fellowship this week. Keep walking in joy and peace.`
      : `Belle fidélité ! ${activeLast7Days} jours de communion cette semaine. Continuez dans la joie et la paix du Seigneur.`;
  }, [weeklyData, habitLogs.length, isEn]);

  const openLogModal = (defaultType?: SpiritualHabitType) => {
    if (defaultType) setLogType(defaultType);
    setLogDate(todayIso);
    setLogMinutes('15');
    setLogNote('');
    setLogVerseRef('');
    setLogVerseText('');
    setLogPendingMedia(null);
    setIsLogModalOpen(true);
  };

  const handleSaveHabitLog = async (e: React.FormEvent) => {
    e.preventDefault();
    const mediaMeta = await persistOptionalMedia({
      prefix: 'journey_log',
      pendingFile: logPendingMedia,
    });
    const item: SpiritualHabitLog = {
      id: `hab_${Date.now()}`,
      type: logType,
      date: logDate || todayIso,
      durationMinutes: logType === 'priere' ? Math.max(1, parseInt(logMinutes, 10) || 15) : undefined,
      note: logNote.trim() || undefined,
      verseRef: logType === 'memorisation' ? logVerseRef.trim() || undefined : undefined,
      verseText: logType === 'memorisation' ? logVerseText.trim() || undefined : undefined,
      ...mediaMeta,
      createdAt: new Date().toISOString(),
    };
    await dbService.put(STORES.HABIT_LOGS, item);
    setLogPendingMedia(null);
    setIsLogModalOpen(false);
    reloadData();
  };

  const handleSaveProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!progTitle.trim()) return;
    const start = progStartDate || todayIso;
    const yr = parseInt(start.split('-')[0] || String(currentYear), 10);
    const mediaMeta = await persistOptionalMedia({
      prefix: 'journey_prog',
      pendingFile: progPendingMedia,
    });
    const prog: PersonalProgram = {
      id: `prog_${Date.now()}`,
      title: progTitle.trim(),
      theme: progTheme.trim() || (isEn ? 'Spiritual Growth' : 'Croissance spirituelle'),
      startDate: start,
      targetDays: Math.max(1, parseInt(progTargetDays, 10) || 7),
      completedDays: 0,
      status: 'en_cours',
      year: yr,
      ...mediaMeta,
      createdAt: new Date().toISOString(),
    };
    await dbService.put(STORES.PERSONAL_PROGRAMS, prog);
    setProgTitle('');
    setProgTheme('');
    setProgPendingMedia(null);
    setIsProgramModalOpen(false);
    reloadData();
  };

  const handleAdvanceProgramDay = async (prog: PersonalProgram) => {
    const nextDays = Math.min(prog.targetDays, prog.completedDays + 1);
    await dbService.put(STORES.PERSONAL_PROGRAMS, {
      ...prog,
      completedDays: nextDays,
      status: nextDays >= prog.targetDays ? 'termine' : 'en_cours',
    });
    reloadData();
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    if (confirmDelete.blobKeys.length > 0) {
      await dbService.deleteItems(STORES.MEDIA_BLOBS, confirmDelete.blobKeys);
    }
    await dbService.deleteItems(confirmDelete.store, confirmDelete.ids);

    if (confirmDelete.store === STORES.HABIT_LOGS) {
      setSelectedLogIds((prev) => prev.filter((id) => !confirmDelete.ids.includes(id)));
    } else {
      setSelectedProgramIds((prev) => prev.filter((id) => !confirmDelete.ids.includes(id)));
    }
    setConfirmDelete(null);
    reloadData();
  };

  const filteredLogs = useMemo(() => {
    if (filterHabit === 'all') return habitLogs;
    return habitLogs.filter((h) => h.type === filterHabit);
  }, [habitLogs, filterHabit]);

  const toggleLogId = (id: string) => {
    setSelectedLogIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleAllLogs = () => {
    const visible = filteredLogs.slice(0, 50).map((l) => l.id);
    const allSel = visible.length > 0 && visible.every((id) => selectedLogIds.includes(id));
    setSelectedLogIds(allSel ? [] : visible);
  };

  const toggleProgId = (id: string) => {
    setSelectedProgramIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleAllProgs = () => {
    const allIds = personalPrograms.map((p) => p.id);
    const allSel = allIds.length > 0 && allIds.every((id) => selectedProgramIds.includes(id));
    setSelectedProgramIds(allSel ? [] : allIds);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2 font-display">
            <TrendingUp className="w-6 h-6 text-blue-700 dark:text-blue-400" />
            <span>{isEn ? 'My Spiritual Journey' : 'Mon Parcours Spirituel'}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isEn
              ? 'Track prayer, meditation, fasting, memorization, gratitude & annual programs'
              : 'Suivi bienveillant de vos habitudes et programmes personnels depuis le début de l’année'}
          </p>
        </div>

        {!isEmptyJourney && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openLogModal('priere')}
              className="px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{isEn ? 'Log Moment' : 'Enregistrer un temps'}</span>
            </button>
            <button
              type="button"
              onClick={() => setIsProgramModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5"
            >
              <Award className="w-4 h-4" />
              <span>{isEn ? 'New Program' : 'Nouveau programme'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Gentle Encouraging Card — Direct text without "Encouragement du jour" heading */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-50 to-sky-50 dark:from-emerald-950/30 dark:to-blue-950/30 border border-emerald-200/80 dark:border-emerald-900/50 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
          <Sun className="w-5 h-5" />
        </div>
        <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed font-medium">
          {encouragementMessage}
        </p>
      </div>

      {isEmptyJourney ? (
        <div className="py-12 px-6 text-center rounded-3xl bg-white dark:bg-[#0c1631] border border-dashed border-slate-300 dark:border-slate-800 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 flex items-center justify-center mx-auto">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {isEn ? 'Start Your Spiritual Journey' : 'Commencer votre suivi spirituel'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isEn
                ? 'Record your first prayer, meditation, fasting day, Bible memorization or personal program.'
                : 'Enregistrez votre premier moment de prière, méditation, gratitude ou verset appris.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => openLogModal('priere')}
            className="px-5 py-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>{isEn ? 'Record My First Moment' : 'Enregistrer mon premier temps'}</span>
          </button>
        </div>
      ) : (
        <>
          {/* 5 Habits + Annual Personal Programs KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <button
              type="button"
              onClick={() => openLogModal('priere')}
              className="text-left p-3.5 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 hover:border-blue-500 transition"
            >
              <div className="text-[11px] font-bold text-blue-700 dark:text-blue-400 flex items-center justify-between">
                <span>{habitConfig.priere.label}</span>
                <Clock className="w-3.5 h-3.5" />
              </div>
              <div className="text-xl font-extrabold tabular-nums text-slate-900 dark:text-white mt-1.5">
                {summary.prayerMinutes} min
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">{habitConfig.priere.unitLabel}</div>
            </button>

            <button
              type="button"
              onClick={() => openLogModal('meditation')}
              className="text-left p-3.5 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 hover:border-indigo-500 transition"
            >
              <div className="text-[11px] font-bold text-indigo-700 dark:text-indigo-400 flex items-center justify-between">
                <span>{habitConfig.meditation.label}</span>
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div className="text-xl font-extrabold tabular-nums text-slate-900 dark:text-white mt-1.5">
                {summary.meditationCount}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {habitConfig.meditation.unitLabel}
              </div>
            </button>

            <button
              type="button"
              onClick={() => openLogModal('jeune')}
              className="text-left p-3.5 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 hover:border-amber-500 transition"
            >
              <div className="text-[11px] font-bold text-amber-700 dark:text-amber-400 flex items-center justify-between">
                <span>{habitConfig.jeune.label}</span>
                <Calendar className="w-3.5 h-3.5" />
              </div>
              <div className="text-xl font-extrabold tabular-nums text-slate-900 dark:text-white mt-1.5">
                {summary.fastingDays} {isEn ? 'd' : 'j'}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">{habitConfig.jeune.unitLabel}</div>
            </button>

            <button
              type="button"
              onClick={() => openLogModal('memorisation')}
              className="text-left p-3.5 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 hover:border-emerald-500 transition"
            >
              <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 flex items-center justify-between">
                <span>{habitConfig.memorisation.label}</span>
                <BookOpen className="w-3.5 h-3.5" />
              </div>
              <div className="text-xl font-extrabold tabular-nums text-slate-900 dark:text-white mt-1.5">
                {summary.versesCount}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {habitConfig.memorisation.unitLabel}
              </div>
            </button>

            <button
              type="button"
              onClick={() => openLogModal('gratitude')}
              className="text-left p-3.5 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 hover:border-rose-500 transition"
            >
              <div className="text-[11px] font-bold text-rose-700 dark:text-rose-400 flex items-center justify-between">
                <span>{habitConfig.gratitude.label}</span>
                <Heart className="w-3.5 h-3.5" />
              </div>
              <div className="text-xl font-extrabold tabular-nums text-slate-900 dark:text-white mt-1.5">
                {summary.gratitudeCount}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {habitConfig.gratitude.unitLabel}
              </div>
            </button>

            <div className="p-3.5 rounded-2xl bg-[#0b1f42] text-white border border-blue-900">
              <div className="text-[11px] font-bold text-amber-300 flex items-center justify-between">
                <span>{isEn ? `Programs ${currentYear}` : `Programmes ${currentYear}`}</span>
                <Award className="w-3.5 h-3.5" />
              </div>
              <div className="text-xl font-extrabold tabular-nums mt-1.5">
                {summary.programsCount}
              </div>
              <div className="text-[11px] text-blue-200 mt-0.5">
                {isEn
                  ? `${summary.completedProgramsThisYear} completed since Jan 1`
                  : `${summary.completedProgramsThisYear} terminé(s) depuis janv.`}
              </div>
            </div>
          </div>

          {/* Weekly & Monthly Progression + Annual Personal Programs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Weekly / Monthly Chart */}
            <div className="p-5 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {isEn ? 'Spiritual Progression' : 'Progression hebdomadaire & mensuelle'}
                </h3>
                <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setProgressView('weekly')}
                    className={`px-2.5 py-1 rounded-md transition ${
                      progressView === 'weekly'
                        ? 'bg-white dark:bg-[#0f2b5c] text-blue-700 dark:text-white shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    {isEn ? 'Weekly' : 'Semaine'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setProgressView('monthly')}
                    className={`px-2.5 py-1 rounded-md transition ${
                      progressView === 'monthly'
                        ? 'bg-white dark:bg-[#0f2b5c] text-blue-700 dark:text-white shadow-xs'
                        : 'text-slate-500'
                    }`}
                  >
                    {isEn ? 'Monthly' : 'Mois'}
                  </button>
                </div>
              </div>

              {progressView === 'weekly' ? (
                <div className="grid grid-cols-7 gap-2 items-end h-40 pt-4">
                  {weeklyData.days.map((d) => {
                    const heightPct =
                      d.count === 0
                        ? 8
                        : Math.max(18, Math.round((d.count / weeklyData.maxCount) * 100));
                    return (
                      <div key={d.iso} className="flex flex-col items-center justify-end h-full gap-1.5">
                        <span className="text-[11px] font-bold tabular-nums text-slate-600 dark:text-slate-300">
                          {d.count}
                        </span>
                        <div className="w-full max-w-[32px] flex-1 flex items-end">
                          <div
                            style={{ height: `${heightPct}%` }}
                            className={`w-full rounded-t-lg transition-all ${
                              d.count > 0
                                ? 'bg-blue-700 dark:bg-blue-500'
                                : 'bg-slate-200 dark:bg-slate-800'
                            }`}
                          />
                        </div>
                        <span className="text-[11px] capitalize text-slate-500">{d.label}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  {monthlyData.buckets.map((b) => {
                    const widthPct =
                      b.count === 0
                        ? 4
                        : Math.max(12, Math.round((b.count / monthlyData.maxCount) * 100));
                    return (
                      <div key={b.label} className="space-y-1 text-xs">
                        <div className="flex justify-between font-semibold">
                          <span className="text-slate-600 dark:text-slate-300">{b.label}</span>
                          <span className="tabular-nums text-slate-900 dark:text-white">
                            {b.count} {isEn ? 'moments' : 'temps enregistrés'}
                          </span>
                        </div>
                        <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            style={{ width: `${widthPct}%` }}
                            className={`h-full rounded-full transition-all ${
                              b.count > 0
                                ? 'bg-emerald-600 dark:bg-emerald-500'
                                : 'bg-slate-300 dark:bg-slate-700'
                            }`}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-[11px] text-slate-500 pt-1">
                    {isEn
                      ? `Total this month: ${monthlyData.totalMonth} spiritual entries.`
                      : `Total ce mois-ci : ${monthlyData.totalMonth} moments enregistrés.`}
                  </p>
                </div>
              )}
            </div>

            {/* Annual Personal Programs */}
            <div className="p-5 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {isEn
                      ? `Personal Programs (${currentYear})`
                      : `Mes programmes personnels (${currentYear})`}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {isEn
                      ? `${summary.programsCount} program(s) since January 1, ${currentYear}`
                      : `${summary.programsCount} programme(s) suivi(s) depuis le 1er janvier ${currentYear}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsProgramModalOpen(true)}
                  className="text-xs font-bold text-blue-700 dark:text-blue-400 hover:underline"
                >
                  + {isEn ? 'Add' : 'Ajouter'}
                </button>
              </div>

              {personalPrograms.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <button
                    type="button"
                    onClick={toggleAllProgs}
                    className="font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 hover:text-blue-700"
                  >
                    {personalPrograms.every((p) => selectedProgramIds.includes(p.id)) ? (
                      <CheckSquare className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                    <span>Tout sélectionner ({selectedProgramIds.length})</span>
                  </button>

                  {selectedProgramIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const blobs = personalPrograms
                          .filter((p) => selectedProgramIds.includes(p.id) && p.mediaBlobKey)
                          .map((p) => p.mediaBlobKey as string);
                        setConfirmDelete({
                          store: STORES.PERSONAL_PROGRAMS,
                          ids: selectedProgramIds,
                          blobKeys: blobs,
                          label: `${selectedProgramIds.length} programme(s)`,
                        });
                      }}
                      className="px-2.5 py-1 rounded-lg bg-red-600 text-white font-bold flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Supprimer ({selectedProgramIds.length})</span>
                    </button>
                  )}
                </div>
              )}

              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {personalPrograms.map((p) => {
                  const pct = Math.min(100, Math.round((p.completedDays / p.targetDays) * 100));
                  const isSel = selectedProgramIds.includes(p.id);
                  return (
                    <div
                      key={p.id}
                      className={`p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border space-y-2 transition ${
                        isSel
                          ? 'border-blue-600 ring-2 ring-blue-600/20'
                          : 'border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <button
                            type="button"
                            onClick={() => toggleProgId(p.id)}
                            aria-label="Sélectionner ce programme"
                            className="text-slate-400 hover:text-blue-600 mt-0.5 shrink-0"
                          >
                            {isSel ? (
                              <CheckSquare className="w-4 h-4 text-blue-600" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {p.title}
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              {p.theme} · {p.startDate} ·{' '}
                              {p.status === 'termine'
                                ? isEn
                                  ? 'Completed'
                                  : 'Accompli'
                                : isEn
                                  ? 'Ongoing'
                                  : 'En cours'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {p.status !== 'termine' && (
                            <button
                              type="button"
                              onClick={() => handleAdvanceProgramDay(p)}
                              className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>+1 {isEn ? 'd' : 'j'}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmDelete({
                                store: STORES.PERSONAL_PROGRAMS,
                                ids: [p.id],
                                blobKeys: p.mediaBlobKey ? [p.mediaBlobKey] : [],
                                label: p.title,
                              })
                            }
                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {p.mediaBlobKey && (
                        <StoredMediaViewer
                          mediaBlobKey={p.mediaBlobKey}
                          mediaType={p.mediaType}
                        />
                      )}

                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <div
                            style={{ width: `${pct}%` }}
                            className="h-full bg-blue-700 dark:bg-blue-500 rounded-full transition-all"
                          />
                        </div>
                        <span className="text-[11px] font-bold tabular-nums text-slate-600 dark:text-slate-300">
                          {p.completedDays}/{p.targetDays} {isEn ? 'd' : 'j'}
                        </span>
                      </div>
                    </div>
                  );
                })}

                {personalPrograms.length === 0 && (
                  <p className="text-xs text-slate-500 text-center py-6">
                    {isEn
                      ? 'Create a personal program (e.g. 21-day prayer, Bible reading, fasting retreat).'
                      : 'Ajoutez un programme personnel (ex : 21 jours de prière, lecture des Psaumes, retraite de jeûne).'}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Journal of Spiritual Habits */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {isEn ? 'Habit Journal & Reflections' : 'Journal des habitudes & versets mémorisés'}
              </h3>
              {habitLogs.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(['all', 'priere', 'meditation', 'jeune', 'memorisation', 'gratitude'] as const).map(
                    (f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFilterHabit(f)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                          filterHabit === f
                            ? 'bg-blue-700 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {f === 'all' ? (isEn ? 'All' : 'Tout') : habitConfig[f].label}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>

            {filteredLogs.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  onClick={toggleAllLogs}
                  className="font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 hover:text-blue-700"
                >
                  {filteredLogs.slice(0, 50).length > 0 &&
                  filteredLogs.slice(0, 50).every((l) => selectedLogIds.includes(l.id)) ? (
                    <CheckSquare className="w-4 h-4 text-blue-600" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                  <span>Tout sélectionner ({selectedLogIds.length})</span>
                </button>

                {selectedLogIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const blobs = habitLogs
                        .filter((l) => selectedLogIds.includes(l.id) && l.mediaBlobKey)
                        .map((l) => l.mediaBlobKey as string);
                      setConfirmDelete({
                        store: STORES.HABIT_LOGS,
                        ids: selectedLogIds,
                        blobKeys: blobs,
                        label: `${selectedLogIds.length} entrée(s) du journal`,
                      });
                    }}
                    className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Supprimer ({selectedLogIds.length})</span>
                  </button>
                )}
              </div>
            )}

            <div className="space-y-2.5">
              {filteredLogs.slice(0, 50).map((log) => {
                const isSel = selectedLogIds.includes(log.id);
                return (
                  <div
                    key={log.id}
                    className={`p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border flex items-start justify-between gap-3 transition ${
                      isSel
                        ? 'border-blue-600 ring-2 ring-blue-600/20'
                        : 'border-slate-200/70 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => toggleLogId(log.id)}
                        aria-label="Sélectionner cette entrée"
                        className="text-slate-400 hover:text-blue-600 mt-0.5 shrink-0"
                      >
                        {isSel ? (
                          <CheckSquare className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>

                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className={`font-bold ${habitConfig[log.type].colorClass}`}>
                            {habitConfig[log.type].label}
                          </span>
                          <span className="text-slate-300">·</span>
                          <span className="text-slate-500 tabular-nums">{log.date}</span>
                          {log.durationMinutes && (
                            <>
                              <span className="text-slate-300">·</span>
                              <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                                {log.durationMinutes} min
                              </span>
                            </>
                          )}
                          {log.verseRef && (
                            <>
                              <span className="text-slate-300">·</span>
                              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                {log.verseRef}
                              </span>
                            </>
                          )}
                        </div>
                        {log.verseText && (
                          <p className="text-xs italic font-serif text-slate-700 dark:text-slate-200">
                            « {log.verseText} »
                          </p>
                        )}
                        {log.note && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                            {log.note}
                          </p>
                        )}
                        {log.mediaBlobKey && (
                          <StoredMediaViewer
                            mediaBlobKey={log.mediaBlobKey}
                            mediaType={log.mediaType}
                            className="max-w-sm"
                          />
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setConfirmDelete({
                          store: STORES.HABIT_LOGS,
                          ids: [log.id],
                          blobKeys: log.mediaBlobKey ? [log.mediaBlobKey] : [],
                          label: `${habitConfig[log.type].label} (${log.date})`,
                        })
                      }
                      className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}

              {filteredLogs.length === 0 && (
                <p className="text-xs text-slate-500 text-center py-6">
                  {isEn
                    ? 'No entries yet. Tap any habit card above to record a moment.'
                    : 'Aucune entrée enregistrée. Cliquez sur « Enregistrer un temps » ou une carte ci-dessus.'}
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* Modal Log Habit */}
      <Modal
        isOpen={isLogModalOpen}
        onClose={() => {
          setIsLogModalOpen(false);
          setLogPendingMedia(null);
        }}
        title={isEn ? 'Record Spiritual Moment' : 'Enregistrer une habitude spirituelle'}
        maxWidth="md"
      >
        <form onSubmit={handleSaveHabitLog} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">{isEn ? 'Habit' : 'Habitude'}</label>
              <select
                value={logType}
                onChange={(e) => setLogType(e.target.value as SpiritualHabitType)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              >
                <option value="priere">{habitConfig.priere.label}</option>
                <option value="meditation">{habitConfig.meditation.label}</option>
                <option value="jeune">{habitConfig.jeune.label}</option>
                <option value="memorisation">{habitConfig.memorisation.label}</option>
                <option value="gratitude">{habitConfig.gratitude.label}</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold mb-1">{isEn ? 'Date' : 'Date'}</label>
              <input
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />
            </div>
          </div>

          {logType === 'priere' && (
            <div>
              <label className="block font-semibold mb-1">
                {isEn ? 'Time spent (minutes)' : 'Temps consacré (en minutes)'}
              </label>
              <input
                type="number"
                min={1}
                value={logMinutes}
                onChange={(e) => setLogMinutes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />
            </div>
          )}

          {logType === 'memorisation' && (
            <div className="space-y-3">
              <div>
                <label className="block font-semibold mb-1">
                  {isEn ? 'Verse Reference' : 'Référence du verset appris'}
                </label>
                <input
                  type="text"
                  placeholder="Ex: Psaume 119:11"
                  value={logVerseRef}
                  onChange={(e) => setLogVerseRef(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">
                  {isEn ? 'Verse Text' : 'Texte du verset'}
                </label>
                <textarea
                  rows={2}
                  value={logVerseText}
                  onChange={(e) => setLogVerseText(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block font-semibold mb-1">
              {logType === 'meditation'
                ? isEn
                  ? 'Recorded reflection'
                  : 'Réflexion enregistrée'
                : logType === 'gratitude'
                  ? isEn
                    ? 'Thanksgiving subject'
                    : 'Sujet de reconnaissance'
                  : isEn
                    ? 'Personal note (optional)'
                    : 'Note personnelle (facultatif)'}
            </label>
            <textarea
              rows={3}
              value={logNote}
              onChange={(e) => setLogNote(e.target.value)}
              placeholder={
                logType === 'jeune'
                  ? isEn
                    ? 'Voluntary fasting intention...'
                    : 'Intention volontaire de ce jour de jeûne...'
                  : undefined
              }
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            />
          </div>

          <MediaPickerBox
            pendingFile={logPendingMedia}
            onSelectFile={setLogPendingMedia}
          />

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsLogModalOpen(false)}
              className="px-4 py-2 rounded-xl text-slate-500 font-semibold"
            >
              {isEn ? 'Cancel' : 'Annuler'}
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold"
            >
              {isEn ? 'Save' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal New Personal Program */}
      <Modal
        isOpen={isProgramModalOpen}
        onClose={() => {
          setIsProgramModalOpen(false);
          setProgPendingMedia(null);
        }}
        title={isEn ? 'New Personal Spiritual Program' : 'Nouveau programme personnel'}
        maxWidth="md"
      >
        <form onSubmit={handleSaveProgram} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold mb-1">
              {isEn ? 'Program Title *' : 'Titre du programme *'}
            </label>
            <input
              type="text"
              required
              placeholder={isEn ? 'Ex: 21 Days of Prayer & Gratitude' : 'Ex: 21 jours de prière et de gratitude'}
              value={progTitle}
              onChange={(e) => setProgTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">{isEn ? 'Theme' : 'Thème'}</label>
            <input
              type="text"
              placeholder={isEn ? 'Ex: Faith renewal, Peace, Wisdom' : 'Ex: Renouvellement, Paix, Sagesse'}
              value={progTheme}
              onChange={(e) => setProgTheme(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">{isEn ? 'Start Date' : 'Date de début'}</label>
              <input
                type="date"
                value={progStartDate}
                onChange={(e) => setProgStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">
                {isEn ? 'Duration (days)' : 'Durée cible (jours)'}
              </label>
              <input
                type="number"
                min={1}
                max={365}
                value={progTargetDays}
                onChange={(e) => setProgTargetDays(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />
            </div>
          </div>

          <MediaPickerBox
            pendingFile={progPendingMedia}
            onSelectFile={setProgPendingMedia}
          />

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsProgramModalOpen(false)}
              className="px-4 py-2 rounded-xl text-slate-500 font-semibold"
            >
              {isEn ? 'Cancel' : 'Annuler'}
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold"
            >
              {isEn ? 'Create Program' : 'Créer le programme'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmDelete}
        title={isEn ? 'Delete selection?' : 'Supprimer la sélection ?'}
        message={
          confirmDelete
            ? `${isEn ? 'Are you sure you want to delete' : 'Voulez-vous supprimer'} « ${confirmDelete.label} » ?`
            : ''
        }
        confirmLabel={isEn ? 'Delete' : 'Supprimer'}
        cancelLabel={isEn ? 'Cancel' : 'Annuler'}
        isDestructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
};
