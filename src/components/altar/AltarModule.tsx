import React, { useState, useMemo } from 'react';
import {
  Flame,
  CalendarDays,
  Sparkles,
  Users,
  CheckCircle2,
  Plus,
  Edit3,
  Trash2,
  BookOpen,
  Share2,
  UserPlus,
  Heart,
  Target,
  CheckSquare,
  Square,
} from 'lucide-react';
import { useShalomDB } from '../../hooks/useShalomDB';
import { dbService, STORES } from '../../services/db';
import { useLanguage } from '../../contexts/LanguageContext';
import { useModuleSubView } from '../../contexts/NavigationContext';
import {
  WeeklyAltarDay,
  LifeChangeGoal,
  IntercessionPerson,
  SpiritualCommitment,
} from '../../types';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { SocialShareModal } from '../common/SocialShareModal';
import { SharePayload, formatPrayerShareText } from '../../services/socialShare';
import {
  MediaPickerBox,
  StoredMediaViewer,
  persistOptionalMedia,
  loadMediaAsShareFile,
} from '../common/MediaAttachment';

const DAY_NAMES_FR = [
  'Dimanche',
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
];

const DAY_NAMES_EN = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

// Monday -> Sunday order
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

interface WeekDraftRow {
  prayerTitle: string;
  prayerFocus: string;
  bibleVerse: string;
}

export const AltarModule: React.FC = () => {
  const { lang } = useLanguage();
  const {
    weeklyAltarDays,
    lifeGoals,
    intercessionPeople,
    commitments,
    contacts,
    reloadData,
  } = useShalomDB();

  const isEn = lang === 'en';
  const dayNames = isEn ? DAY_NAMES_EN : DAY_NAMES_FR;
  const todayDow = new Date().getDay();

  const [subTab, setSubTab] = useModuleSubView<'weekly' | 'changes' | 'people' | 'commitments'>(
    'altar',
    'weekly'
  );

  // Single day edit modal
  const [editingDay, setEditingDay] = useState<WeeklyAltarDay | null>(null);
  const [dayTitle, setDayTitle] = useState('');
  const [dayFocus, setDayFocus] = useState('');
  const [dayVerse, setDayVerse] = useState('');
  const [dayMediaFile, setDayMediaFile] = useState<File | null>(null);
  const [dayMediaRemoved, setDayMediaRemoved] = useState(false);

  // Full-week programmer modal
  const [isWeekPlannerOpen, setIsWeekPlannerOpen] = useState(false);
  const [weekDrafts, setWeekDrafts] = useState<Record<number, WeekDraftRow>>({});

  // Life goals modal
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<LifeChangeGoal | null>(null);
  const [goalArea, setGoalArea] = useState('');
  const [goalCurrent, setGoalCurrent] = useState('');
  const [goalDesired, setGoalDesired] = useState('');
  const [goalPrayer, setGoalPrayer] = useState('');
  const [goalMediaFile, setGoalMediaFile] = useState<File | null>(null);
  const [goalMediaRemoved, setGoalMediaRemoved] = useState(false);

  // Intercession person modal
  const [isPersonModalOpen, setIsPersonModalOpen] = useState(false);
  const [personName, setPersonName] = useState('');
  const [personContactId, setPersonContactId] = useState('');
  const [personRelation, setPersonRelation] = useState('');
  const [personTopic, setPersonTopic] = useState('');
  const [personMediaFile, setPersonMediaFile] = useState<File | null>(null);

  // Commitment modal
  const [isCommitmentModalOpen, setIsCommitmentModalOpen] = useState(false);
  const [commitmentTitle, setCommitmentTitle] = useState('');
  const [commitmentCategory, setCommitmentCategory] = useState('Lecture biblique');
  const [commitmentFreq, setCommitmentFreq] = useState('Chaque matin');
  const [commitmentNotes, setCommitmentNotes] = useState('');
  const [commitmentMediaFile, setCommitmentMediaFile] = useState<File | null>(null);

  // Multi-selection state per subtab
  const [selectedDayIds, setSelectedDayIds] = useState<string[]>([]);
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([]);
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);
  const [selectedCommitmentIds, setSelectedCommitmentIds] = useState<string[]>([]);

  const [confirmDelete, setConfirmDelete] = useState<{
    store:
      | typeof STORES.WEEKLY_ALTAR
      | typeof STORES.LIFE_GOALS
      | typeof STORES.INTERCESSION_PEOPLE
      | typeof STORES.COMMITMENTS;
    ids: string[];
    blobKeys: string[];
    label: string;
  } | null>(null);

  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);

  const programmedDays = useMemo(() => {
    const map = new Map<number, WeeklyAltarDay>();
    weeklyAltarDays.forEach((d) => map.set(d.dayOfWeek, d));
    return WEEK_ORDER.map((dow) => map.get(dow)).filter(Boolean) as WeeklyAltarDay[];
  }, [weeklyAltarDays]);

  const todaysAltar = useMemo(
    () => programmedDays.find((d) => d.dayOfWeek === todayDow) || null,
    [programmedDays, todayDow]
  );

  const openWeekPlanner = () => {
    const initial: Record<number, WeekDraftRow> = {};
    const existingMap = new Map(weeklyAltarDays.map((d) => [d.dayOfWeek, d]));
    WEEK_ORDER.forEach((dow) => {
      const existing = existingMap.get(dow);
      initial[dow] = {
        prayerTitle: existing?.prayerTitle || '',
        prayerFocus: existing?.prayerFocus || '',
        bibleVerse: existing?.bibleVerse || '',
      };
    });
    setWeekDrafts(initial);
    setIsWeekPlannerOpen(true);
  };

  const handleSaveWeekPlanner = async (e: React.FormEvent) => {
    e.preventDefault();
    const existingMap = new Map(weeklyAltarDays.map((d) => [d.dayOfWeek, d]));
    const now = new Date().toISOString();

    for (const dow of WEEK_ORDER) {
      const row = weekDrafts[dow];
      if (!row) continue;
      const title = row.prayerTitle.trim();
      const focus = row.prayerFocus.trim();
      const verse = row.bibleVerse.trim();
      if (!title && !focus && !verse) continue;

      const prev = existingMap.get(dow);
      const item: WeeklyAltarDay = {
        id: prev?.id || `day_${dow}`,
        dayOfWeek: dow,
        prayerTitle: title || `${isEn ? 'Prayer for' : 'Prière du'} ${dayNames[dow]}`,
        prayerFocus: focus || title,
        bibleVerse: verse || undefined,
        mediaBlobKey: prev?.mediaBlobKey,
        mediaType: prev?.mediaType,
        mediaMimeType: prev?.mediaMimeType,
        updatedAt: now,
      };
      await dbService.put(STORES.WEEKLY_ALTAR, item);
    }

    setIsWeekPlannerOpen(false);
    reloadData();
  };

  const openEditDay = (day: WeeklyAltarDay) => {
    setEditingDay(day);
    setDayTitle(day.prayerTitle);
    setDayFocus(day.prayerFocus);
    setDayVerse(day.bibleVerse || '');
    setDayMediaFile(null);
    setDayMediaRemoved(false);
  };

  const openCreateDay = (dow: number = todayDow) => {
    const existing = weeklyAltarDays.find((d) => d.dayOfWeek === dow);
    if (existing) {
      openEditDay(existing);
      return;
    }
    openEditDay({
      id: `day_${dow}`,
      dayOfWeek: dow,
      prayerTitle: '',
      prayerFocus: '',
      bibleVerse: '',
      updatedAt: new Date().toISOString(),
    });
  };

  const handleSaveDay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDay) return;

    const mediaMeta = await persistOptionalMedia({
      prefix: 'altar_day',
      pendingFile: dayMediaFile,
      removedExisting: dayMediaRemoved,
      existingBlobKey: editingDay.mediaBlobKey,
      existingMediaType: editingDay.mediaType,
      existingMimeType: editingDay.mediaMimeType,
    });

    const updated: WeeklyAltarDay = {
      ...editingDay,
      prayerTitle:
        dayTitle.trim() || `${isEn ? 'Prayer for' : 'Prière du'} ${dayNames[editingDay.dayOfWeek]}`,
      prayerFocus: dayFocus.trim(),
      bibleVerse: dayVerse.trim() || undefined,
      ...mediaMeta,
      updatedAt: new Date().toISOString(),
    };
    await dbService.put(STORES.WEEKLY_ALTAR, updated);
    setEditingDay(null);
    setDayMediaFile(null);
    reloadData();
  };

  const handleShareDay = async (day: WeeklyAltarDay) => {
    const file = await loadMediaAsShareFile(
      day.mediaBlobKey,
      day.prayerTitle,
      day.mediaType,
      day.mediaMimeType
    );
    setSharePayload({
      title: `${isEn ? 'My Prayer' : 'Ma prière'} (${dayNames[day.dayOfWeek]})`,
      text: formatPrayerShareText(day.prayerTitle, day.prayerFocus, day.bibleVerse),
      file,
    });
  };

  const openNewGoal = () => {
    setEditingGoal(null);
    setGoalArea('');
    setGoalCurrent('');
    setGoalDesired('');
    setGoalPrayer('');
    setGoalMediaFile(null);
    setGoalMediaRemoved(false);
    setIsGoalModalOpen(true);
  };

  const openEditGoal = (g: LifeChangeGoal) => {
    setEditingGoal(g);
    setGoalArea(g.area);
    setGoalCurrent(g.currentHabit);
    setGoalDesired(g.desiredChange);
    setGoalPrayer(g.prayerSupport || '');
    setGoalMediaFile(null);
    setGoalMediaRemoved(false);
    setIsGoalModalOpen(true);
  };

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalDesired.trim()) return;
    const now = new Date().toISOString();
    const mediaMeta = await persistOptionalMedia({
      prefix: 'altar_goal',
      pendingFile: goalMediaFile,
      removedExisting: goalMediaRemoved,
      existingBlobKey: editingGoal?.mediaBlobKey,
      existingMediaType: editingGoal?.mediaType,
      existingMimeType: editingGoal?.mediaMimeType,
    });

    const item: LifeChangeGoal = {
      id: editingGoal?.id || `goal_${Date.now()}`,
      area: goalArea.trim() || (isEn ? 'Character' : 'Caractère'),
      currentHabit: goalCurrent.trim(),
      desiredChange: goalDesired.trim(),
      prayerSupport: goalPrayer.trim(),
      status: editingGoal?.status || 'en_cours',
      ...mediaMeta,
      createdAt: editingGoal?.createdAt || now,
      updatedAt: now,
    };
    await dbService.put(STORES.LIFE_GOALS, item);
    setIsGoalModalOpen(false);
    setGoalMediaFile(null);
    reloadData();
  };

  const toggleGoalStatus = async (g: LifeChangeGoal) => {
    await dbService.put(STORES.LIFE_GOALS, {
      ...g,
      status: g.status === 'accompli' ? 'en_cours' : 'accompli',
      updatedAt: new Date().toISOString(),
    });
    reloadData();
  };

  const handleSelectContact = (contactId: string) => {
    setPersonContactId(contactId);
    const c = contacts.find((item) => item.id === contactId);
    if (c) {
      setPersonName(`${c.firstName} ${c.lastName}`.trim());
      if (!personRelation) setPersonRelation(c.category);
    }
  };

  const handleSavePerson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!personName.trim() || !personTopic.trim()) return;
    const mediaMeta = await persistOptionalMedia({
      prefix: 'altar_person',
      pendingFile: personMediaFile,
    });
    const item: IntercessionPerson = {
      id: `ip_${Date.now()}`,
      name: personName.trim(),
      contactId: personContactId || undefined,
      relation: personRelation.trim(),
      prayerTopic: personTopic.trim(),
      ...mediaMeta,
      createdAt: new Date().toISOString(),
    };
    await dbService.put(STORES.INTERCESSION_PEOPLE, item);
    setPersonName('');
    setPersonContactId('');
    setPersonRelation('');
    setPersonTopic('');
    setPersonMediaFile(null);
    setIsPersonModalOpen(false);
    reloadData();
  };

  const handleMarkPrayedToday = async (person: IntercessionPerson) => {
    await dbService.put(STORES.INTERCESSION_PEOPLE, {
      ...person,
      lastPrayedAt: new Date().toISOString().split('T')[0],
    });
    reloadData();
  };

  const handleSaveCommitment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitmentTitle.trim()) return;
    const mediaMeta = await persistOptionalMedia({
      prefix: 'altar_comm',
      pendingFile: commitmentMediaFile,
    });
    const item: SpiritualCommitment = {
      id: `comm_${Date.now()}`,
      title: commitmentTitle.trim(),
      category: commitmentCategory,
      frequency: commitmentFreq.trim() || (isEn ? 'Daily' : 'Quotidien'),
      startDate: new Date().toISOString().split('T')[0],
      isActive: true,
      notes: commitmentNotes.trim(),
      ...mediaMeta,
      createdAt: new Date().toISOString(),
    };
    await dbService.put(STORES.COMMITMENTS, item);
    setCommitmentTitle('');
    setCommitmentNotes('');
    setCommitmentMediaFile(null);
    setIsCommitmentModalOpen(false);
    reloadData();
  };

  const toggleCommitment = async (c: SpiritualCommitment) => {
    await dbService.put(STORES.COMMITMENTS, {
      ...c,
      isActive: !c.isActive,
    });
    reloadData();
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    if (confirmDelete.blobKeys.length > 0) {
      await dbService.deleteItems(STORES.MEDIA_BLOBS, confirmDelete.blobKeys);
    }
    await dbService.deleteItems(confirmDelete.store, confirmDelete.ids);

    if (confirmDelete.store === STORES.WEEKLY_ALTAR) {
      setSelectedDayIds((prev) => prev.filter((id) => !confirmDelete.ids.includes(id)));
    } else if (confirmDelete.store === STORES.LIFE_GOALS) {
      setSelectedGoalIds((prev) => prev.filter((id) => !confirmDelete.ids.includes(id)));
    } else if (confirmDelete.store === STORES.INTERCESSION_PEOPLE) {
      setSelectedPersonIds((prev) => prev.filter((id) => !confirmDelete.ids.includes(id)));
    } else if (confirmDelete.store === STORES.COMMITMENTS) {
      setSelectedCommitmentIds((prev) => prev.filter((id) => !confirmDelete.ids.includes(id)));
    }

    setConfirmDelete(null);
    reloadData();
  };

  const toggleId = (
    id: string,
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    setter((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAllIds = (
    allIds: string[],
    selected: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    const allSelected = allIds.length > 0 && allIds.every((id) => selected.includes(id));
    setter(allSelected ? [] : allIds);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2 font-display">
            <Flame className="w-6 h-6 text-amber-500" />
            <span>{isEn ? 'My Altar' : 'Mon Autel'}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isEn
              ? 'Weekly prayer preparation, personal transformation, intercession & commitments'
              : 'Préparation de prière hebdomadaire, transformation personnelle, intercession & engagements'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60">
          {[
            { id: 'weekly', label: isEn ? '7-Day Altar' : 'Semaine (7j)' },
            { id: 'changes', label: isEn ? 'Life Changes' : 'À changer' },
            { id: 'people', label: isEn ? 'People' : 'Intercession' },
            { id: 'commitments', label: isEn ? 'Commitments' : 'Engagements' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id as typeof subTab)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                subTab === tab.id
                  ? 'bg-white dark:bg-[#0f2b5c] text-blue-700 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* MA PRIÈRE DU JOUR — Visible only when today's prayer is programmed */}
      {todaysAltar && (
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0b1f42] via-[#132d5e] to-[#1d4285] text-white p-5 sm:p-6 shadow-lg border border-blue-900/50 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-2 max-w-2xl">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-300 uppercase tracking-wider">
                <Sparkles className="w-4 h-4" />
                <span>
                  {isEn
                    ? `My Prayer Today · ${dayNames[todayDow]}`
                    : `Ma prière du jour · ${dayNames[todayDow]}`}
                </span>
              </div>
              <h3 className="text-lg sm:text-xl font-extrabold font-display">
                {todaysAltar.prayerTitle}
              </h3>
              <p className="text-xs sm:text-sm text-blue-100 leading-relaxed whitespace-pre-line">
                {todaysAltar.prayerFocus}
              </p>
              {todaysAltar.bibleVerse && (
                <p className="text-xs font-semibold text-amber-200 flex items-center gap-1.5 pt-1">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>{todaysAltar.bibleVerse}</span>
                </p>
              )}
            </div>

            <div className="flex flex-wrap sm:flex-col gap-2 shrink-0">
              <button
                type="button"
                onClick={() => openEditDay(todaysAltar)}
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{isEn ? 'Edit today' : 'Modifier aujourd’hui'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleShareDay(todaysAltar)}
                className="px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white font-semibold text-xs flex items-center gap-1.5 transition"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{isEn ? 'Share' : 'Partager'}</span>
              </button>
            </div>
          </div>

          {todaysAltar.mediaBlobKey && (
            <div className="max-w-md">
              <StoredMediaViewer
                mediaBlobKey={todaysAltar.mediaBlobKey}
                mediaType={todaysAltar.mediaType}
              />
            </div>
          )}
        </div>
      )}

      {/* TAB 1: 7-DAY PRAYER PLAN */}
      {subTab === 'weekly' && (
        <div className="space-y-4">
          {programmedDays.length === 0 ? (
            <div className="py-12 px-6 text-center rounded-3xl bg-white dark:bg-[#0c1631] border border-dashed border-slate-300 dark:border-slate-800 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
                <CalendarDays className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {isEn ? 'Your Weekly Altar is Empty' : 'Votre semaine de prière est vide'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {isEn
                    ? 'Schedule your prayer topics for the days of the week (Monday to Sunday).'
                    : 'Programmez vos sujets de prière pour les jours de la semaine (Lundi à Dimanche) et suivez Ma prière du jour.'}
                </p>
              </div>
              <button
                type="button"
                onClick={openWeekPlanner}
                className="px-5 py-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 shadow-sm transition"
              >
                <CalendarDays className="w-4 h-4" />
                <span>
                  {isEn
                    ? 'Schedule My Weekly Topics'
                    : 'Programmer mes sujets de la semaine'}
                </span>
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                  <span>
                    {isEn
                      ? `Scheduled Days (${programmedDays.length}/7)`
                      : `Sujets de la semaine programmés (${programmedDays.length}/7)`}
                  </span>
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={openWeekPlanner}
                    className="px-3 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Plan week' : 'Compléter la semaine'}</span>
                  </button>
                </div>
              </div>

              {/* Bulk selection bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <button
                  type="button"
                  onClick={() =>
                    toggleAllIds(
                      programmedDays.map((d) => d.id),
                      selectedDayIds,
                      setSelectedDayIds
                    )
                  }
                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 hover:text-blue-700"
                >
                  {programmedDays.length > 0 &&
                  programmedDays.every((d) => selectedDayIds.includes(d.id)) ? (
                    <CheckSquare className="w-4 h-4 text-blue-600" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                  <span>Tout sélectionner ({selectedDayIds.length})</span>
                </button>

                {selectedDayIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const blobs = programmedDays
                        .filter((d) => selectedDayIds.includes(d.id) && d.mediaBlobKey)
                        .map((d) => d.mediaBlobKey as string);
                      setConfirmDelete({
                        store: STORES.WEEKLY_ALTAR,
                        ids: selectedDayIds,
                        blobKeys: blobs,
                        label: `${selectedDayIds.length} jour(s) sélectionné(s)`,
                      });
                    }}
                    className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Supprimer ({selectedDayIds.length})</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {programmedDays.map((day) => {
                  const isToday = day.dayOfWeek === todayDow;
                  const isSel = selectedDayIds.includes(day.id);
                  return (
                    <div
                      key={day.id}
                      className={`p-4 rounded-2xl border transition flex flex-col justify-between gap-3 ${
                        isSel
                          ? 'border-blue-600 ring-2 ring-blue-600/20 bg-white dark:bg-[#0c1631]'
                          : isToday
                            ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-400 dark:border-amber-600 shadow-sm'
                            : 'bg-white dark:bg-[#0c1631] border-slate-200/80 dark:border-slate-800/80'
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs gap-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleId(day.id, setSelectedDayIds)}
                              aria-label="Sélectionner ce jour"
                              className="text-slate-400 hover:text-blue-600"
                            >
                              {isSel ? (
                                <CheckSquare className="w-4 h-4 text-blue-600" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                            <span
                              className={`font-extrabold uppercase tracking-wider ${
                                isToday
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-blue-700 dark:text-blue-400'
                              }`}
                            >
                              {dayNames[day.dayOfWeek]}
                              {isToday ? (isEn ? ' · Today' : ' · Aujourd’hui') : ''}
                            </span>
                          </div>
                          {day.bibleVerse && (
                            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                              {day.bibleVerse}
                            </span>
                          )}
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                          {day.prayerTitle}
                        </h4>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          {day.prayerFocus}
                        </p>
                        {day.mediaBlobKey && (
                          <StoredMediaViewer
                            mediaBlobKey={day.mediaBlobKey}
                            mediaType={day.mediaType}
                            className="mt-2"
                          />
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                        <button
                          type="button"
                          onClick={() => handleShareDay(day)}
                          className="p-1.5 rounded-lg text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                          title={isEn ? 'Share' : 'Partager'}
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditDay(day)}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>{isEn ? 'Edit' : 'Modifier'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDelete({
                              store: STORES.WEEKLY_ALTAR,
                              ids: [day.id],
                              blobKeys: day.mediaBlobKey ? [day.mediaBlobKey] : [],
                              label: `${dayNames[day.dayOfWeek]} (${day.prayerTitle})`,
                            })
                          }
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {!todaysAltar && (
                <div className="pt-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => openCreateDay(todayDow)}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>
                      {isEn
                        ? `Prepare ${dayNames[todayDow]}'s Prayer`
                        : `Préparer la prière de ${dayNames[todayDow]}`}
                    </span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB 2: CE QUE JE VEUX CHANGER DANS MA VIE */}
      {subTab === 'changes' && (
        <div className="space-y-4">
          {lifeGoals.length === 0 ? (
            <div className="py-12 px-6 text-center rounded-3xl bg-white dark:bg-[#0c1631] border border-dashed border-slate-300 dark:border-slate-800 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 flex items-center justify-center mx-auto">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {isEn ? 'What I Want to Change in My Life' : 'Ce que je veux changer dans ma vie'}
                </h3>
                <p className="text-xs text-slate-500">
                  {isEn
                    ? 'Write down areas of transformation you surrender to God.'
                    : 'Notez le premier domaine que vous souhaitez transformer avec l’aide de Dieu.'}
                </p>
              </div>
              <button
                type="button"
                onClick={openNewGoal}
                className="px-5 py-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>{isEn ? 'Add My First Goal' : 'Ajouter mon premier objectif'}</span>
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {isEn ? 'What I Want to Change in My Life' : 'Ce que je veux changer dans ma vie'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isEn
                      ? 'Areas of growth surrendered to God with concrete steps'
                      : 'Domaines de transformation confiés à Dieu avec des étapes concrètes'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openNewGoal}
                  className="px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isEn ? 'Add' : 'Nouveau'}</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <button
                  type="button"
                  onClick={() =>
                    toggleAllIds(
                      lifeGoals.map((g) => g.id),
                      selectedGoalIds,
                      setSelectedGoalIds
                    )
                  }
                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 hover:text-blue-700"
                >
                  {lifeGoals.every((g) => selectedGoalIds.includes(g.id)) ? (
                    <CheckSquare className="w-4 h-4 text-blue-600" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                  <span>Tout sélectionner ({selectedGoalIds.length})</span>
                </button>

                {selectedGoalIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const blobs = lifeGoals
                        .filter((g) => selectedGoalIds.includes(g.id) && g.mediaBlobKey)
                        .map((g) => g.mediaBlobKey as string);
                      setConfirmDelete({
                        store: STORES.LIFE_GOALS,
                        ids: selectedGoalIds,
                        blobKeys: blobs,
                        label: `${selectedGoalIds.length} objectif(s)`,
                      });
                    }}
                    className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Supprimer ({selectedGoalIds.length})</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {lifeGoals.map((g) => {
                  const isSel = selectedGoalIds.includes(g.id);
                  return (
                    <div
                      key={g.id}
                      className={`p-4 rounded-2xl border space-y-2.5 transition ${
                        isSel
                          ? 'border-blue-600 ring-2 ring-blue-600/20 bg-white dark:bg-[#0c1631]'
                          : g.status === 'accompli'
                            ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50'
                            : 'bg-white dark:bg-[#0c1631] border-slate-200/80 dark:border-slate-800/80'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            onClick={() => toggleId(g.id, setSelectedGoalIds)}
                            aria-label="Sélectionner cet objectif"
                            className="text-slate-400 hover:text-blue-600 shrink-0"
                          >
                            {isSel ? (
                              <CheckSquare className="w-4 h-4 text-blue-600" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                          <span className="font-bold text-blue-700 dark:text-blue-400 truncate">
                            {g.area} ·{' '}
                            {g.status === 'accompli'
                              ? isEn
                                ? 'Achieved'
                                : 'Accompli'
                              : isEn
                                ? 'In progress'
                                : 'En progrès'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => toggleGoalStatus(g)}
                            className="p-1.5 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
                            title={isEn ? 'Toggle completed' : 'Marquer accompli / en cours'}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditGoal(g)}
                            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmDelete({
                                store: STORES.LIFE_GOALS,
                                ids: [g.id],
                                blobKeys: g.mediaBlobKey ? [g.mediaBlobKey] : [],
                                label: g.desiredChange,
                              })
                            }
                            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {g.desiredChange}
                      </h4>

                      {g.currentHabit && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          <strong>{isEn ? 'Current point:' : 'Point de départ :'}</strong> {g.currentHabit}
                        </p>
                      )}

                      {g.prayerSupport && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 italic">
                          « {g.prayerSupport} »
                        </p>
                      )}

                      {g.mediaBlobKey && (
                        <StoredMediaViewer
                          mediaBlobKey={g.mediaBlobKey}
                          mediaType={g.mediaType}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 3: LES PERSONNES POUR LESQUELLES JE PRIE */}
      {subTab === 'people' && (
        <div className="space-y-4">
          {intercessionPeople.length === 0 ? (
            <div className="py-12 px-6 text-center rounded-3xl bg-white dark:bg-[#0c1631] border border-dashed border-slate-300 dark:border-slate-800 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 flex items-center justify-center mx-auto">
                <Users className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {isEn ? 'People I Pray For' : 'Les personnes pour lesquelles je prie'}
                </h3>
                <p className="text-xs text-slate-500">
                  {isEn
                    ? 'Add family members, friends, pastors, or anyone on your heart.'
                    : 'Ajoutez une première personne à porter fidèlement dans la prière.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPersonModalOpen(true)}
                className="px-5 py-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 shadow-sm"
              >
                <UserPlus className="w-4 h-4" />
                <span>{isEn ? 'Add a Person' : 'Ajouter une personne'}</span>
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {isEn ? 'People I Pray For' : 'Les personnes pour lesquelles je prie'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isEn
                      ? 'Your personal intercession list linked with your contacts'
                      : 'Votre liste d’intercession personnelle reliée à vos contacts'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPersonModalOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{isEn ? 'Add' : 'Nouvelle personne'}</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <button
                  type="button"
                  onClick={() =>
                    toggleAllIds(
                      intercessionPeople.map((p) => p.id),
                      selectedPersonIds,
                      setSelectedPersonIds
                    )
                  }
                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 hover:text-blue-700"
                >
                  {intercessionPeople.every((p) => selectedPersonIds.includes(p.id)) ? (
                    <CheckSquare className="w-4 h-4 text-blue-600" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                  <span>Tout sélectionner ({selectedPersonIds.length})</span>
                </button>

                {selectedPersonIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const blobs = intercessionPeople
                        .filter((p) => selectedPersonIds.includes(p.id) && p.mediaBlobKey)
                        .map((p) => p.mediaBlobKey as string);
                      setConfirmDelete({
                        store: STORES.INTERCESSION_PEOPLE,
                        ids: selectedPersonIds,
                        blobKeys: blobs,
                        label: `${selectedPersonIds.length} personne(s)`,
                      });
                    }}
                    className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Supprimer ({selectedPersonIds.length})</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {intercessionPeople.map((person) => {
                  const isSel = selectedPersonIds.includes(person.id);
                  return (
                    <div
                      key={person.id}
                      className={`p-4 rounded-2xl bg-white dark:bg-[#0c1631] border space-y-2.5 transition ${
                        isSel
                          ? 'border-blue-600 ring-2 ring-blue-600/20'
                          : 'border-slate-200/80 dark:border-slate-800/80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() => toggleId(person.id, setSelectedPersonIds)}
                            aria-label="Sélectionner cette personne"
                            className="text-slate-400 hover:text-blue-600 mt-0.5 shrink-0"
                          >
                            {isSel ? (
                              <CheckSquare className="w-4 h-4 text-blue-600" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                          <div>
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                              <span>{person.name}</span>
                            </h4>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {person.relation || (isEn ? 'Intercession' : 'Intercession')}
                              {person.lastPrayedAt
                                ? ` · ${isEn ? 'Last prayed:' : 'Prié le'} ${person.lastPrayedAt}`
                                : ''}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDelete({
                              store: STORES.INTERCESSION_PEOPLE,
                              ids: [person.id],
                              blobKeys: person.mediaBlobKey ? [person.mediaBlobKey] : [],
                              label: person.name,
                            })
                          }
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                        {person.prayerTopic}
                      </p>

                      {person.mediaBlobKey && (
                        <StoredMediaViewer
                          mediaBlobKey={person.mediaBlobKey}
                          mediaType={person.mediaType}
                        />
                      )}

                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => handleMarkPrayedToday(person)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-1.5"
                        >
                          <Heart className="w-3.5 h-3.5" />
                          <span>{isEn ? 'Prayed today' : 'J’ai prié aujourd’hui'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 4: MES ENGAGEMENTS SPIRITUELS */}
      {subTab === 'commitments' && (
        <div className="space-y-4">
          {commitments.length === 0 ? (
            <div className="py-12 px-6 text-center rounded-3xl bg-white dark:bg-[#0c1631] border border-dashed border-slate-300 dark:border-slate-800 space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
                <Target className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-md mx-auto">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {isEn ? 'My Spiritual Commitments' : 'Mes engagements spirituels'}
                </h3>
                <p className="text-xs text-slate-500">
                  {isEn
                    ? 'Define a simple, joyful commitment before the Lord.'
                    : 'Prenez un premier engagement personnel devant le Seigneur.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCommitmentModalOpen(true)}
                className="px-5 py-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>{isEn ? 'First Commitment' : 'Nouvel engagement'}</span>
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {isEn ? 'My Spiritual Commitments' : 'Mes engagements spirituels'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {isEn
                      ? 'Covenants and faithful disciplines before the Lord'
                      : 'Engagements personnels et disciplines de foi devant le Seigneur'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCommitmentModalOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isEn ? 'New' : 'Nouvel engagement'}</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <button
                  type="button"
                  onClick={() =>
                    toggleAllIds(
                      commitments.map((c) => c.id),
                      selectedCommitmentIds,
                      setSelectedCommitmentIds
                    )
                  }
                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 hover:text-blue-700"
                >
                  {commitments.every((c) => selectedCommitmentIds.includes(c.id)) ? (
                    <CheckSquare className="w-4 h-4 text-blue-600" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                  <span>Tout sélectionner ({selectedCommitmentIds.length})</span>
                </button>

                {selectedCommitmentIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const blobs = commitments
                        .filter((c) => selectedCommitmentIds.includes(c.id) && c.mediaBlobKey)
                        .map((c) => c.mediaBlobKey as string);
                      setConfirmDelete({
                        store: STORES.COMMITMENTS,
                        ids: selectedCommitmentIds,
                        blobKeys: blobs,
                        label: `${selectedCommitmentIds.length} engagement(s)`,
                      });
                    }}
                    className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Supprimer ({selectedCommitmentIds.length})</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {commitments.map((c) => {
                  const isSel = selectedCommitmentIds.includes(c.id);
                  return (
                    <div
                      key={c.id}
                      className={`p-4 rounded-2xl bg-white dark:bg-[#0c1631] border space-y-2 transition ${
                        isSel
                          ? 'border-blue-600 ring-2 ring-blue-600/20'
                          : 'border-slate-200/80 dark:border-slate-800/80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <button
                            type="button"
                            onClick={() => toggleId(c.id, setSelectedCommitmentIds)}
                            aria-label="Sélectionner cet engagement"
                            className="text-slate-400 hover:text-blue-600 mt-0.5 shrink-0"
                          >
                            {isSel ? (
                              <CheckSquare className="w-4 h-4 text-blue-600" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                          <div className="space-y-0.5 min-w-0">
                            <div className="text-[11px] font-bold text-blue-700 dark:text-blue-400">
                              {c.category} · {c.frequency} ·{' '}
                              {c.isActive
                                ? isEn
                                  ? 'Active'
                                  : 'Actif'
                                : isEn
                                  ? 'Paused'
                                  : 'En pause'}
                            </div>
                            <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <Target className="w-4 h-4 text-amber-500 shrink-0" />
                              <span>{c.title}</span>
                            </h4>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => toggleCommitment(c)}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold"
                          >
                            {c.isActive
                              ? isEn
                                ? 'Pause'
                                : 'Pause'
                              : isEn
                                ? 'Resume'
                                : 'Activer'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmDelete({
                                store: STORES.COMMITMENTS,
                                ids: [c.id],
                                blobKeys: c.mediaBlobKey ? [c.mediaBlobKey] : [],
                                label: c.title,
                              })
                            }
                            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {c.notes && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          {c.notes}
                        </p>
                      )}

                      {c.mediaBlobKey && (
                        <StoredMediaViewer
                          mediaBlobKey={c.mediaBlobKey}
                          mediaType={c.mediaType}
                        />
                      )}

                      <p className="text-[11px] text-slate-400 tabular-nums">
                        {isEn ? 'Started:' : 'Depuis le'} {c.startDate}
                      </p>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal Programmer toute la semaine */}
      <Modal
        isOpen={isWeekPlannerOpen}
        onClose={() => setIsWeekPlannerOpen(false)}
        title={isEn ? 'Schedule Weekly Prayer Topics' : 'Programmer mes sujets de la semaine'}
        subtitle={
          isEn
            ? 'Fill the days you wish to prepare (Monday – Sunday)'
            : 'Remplissez les jours que vous souhaitez préparer (Lundi à Dimanche)'
        }
        maxWidth="lg"
      >
        <form onSubmit={handleSaveWeekPlanner} className="space-y-4 text-xs">
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {WEEK_ORDER.map((dow) => {
              const row = weekDrafts[dow] || { prayerTitle: '', prayerFocus: '', bibleVerse: '' };
              return (
                <div
                  key={dow}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2"
                >
                  <div className="font-extrabold text-blue-700 dark:text-blue-400 uppercase tracking-wider text-[11px]">
                    {dayNames[dow]}
                    {dow === todayDow ? (isEn ? ' · Today' : ' · Aujourd’hui') : ''}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder={isEn ? 'Prayer title...' : 'Titre du sujet (ex: Famille, Grâce...)'}
                      value={row.prayerTitle}
                      onChange={(e) =>
                        setWeekDrafts((prev) => ({
                          ...prev,
                          [dow]: { ...row, prayerTitle: e.target.value },
                        }))
                      }
                      className="px-3 py-2 rounded-xl bg-white dark:bg-[#0c1631] border border-slate-200 dark:border-slate-700"
                    />
                    <input
                      type="text"
                      placeholder={isEn ? 'Verse (optional)' : 'Verset (ex: Psaume 23:1)'}
                      value={row.bibleVerse}
                      onChange={(e) =>
                        setWeekDrafts((prev) => ({
                          ...prev,
                          [dow]: { ...row, bibleVerse: e.target.value },
                        }))
                      }
                      className="px-3 py-2 rounded-xl bg-white dark:bg-[#0c1631] border border-slate-200 dark:border-slate-700"
                    />
                  </div>
                  <textarea
                    rows={2}
                    placeholder={isEn ? 'Prayer points / meditation...' : 'Points de prière...'}
                    value={row.prayerFocus}
                    onChange={(e) =>
                      setWeekDrafts((prev) => ({
                        ...prev,
                        [dow]: { ...row, prayerFocus: e.target.value },
                      }))
                    }
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#0c1631] border border-slate-200 dark:border-slate-700"
                  />
                </div>
              );
            })}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsWeekPlannerOpen(false)}
              className="px-4 py-2 rounded-xl text-slate-500 font-semibold"
            >
              {isEn ? 'Cancel' : 'Annuler'}
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold"
            >
              {isEn ? 'Save Week' : 'Enregistrer ma semaine'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Edit Single Weekly Altar Day */}
      <Modal
        isOpen={!!editingDay}
        onClose={() => {
          setEditingDay(null);
          setDayMediaFile(null);
        }}
        title={
          editingDay
            ? `${isEn ? 'Prepare prayer' : 'Préparer la prière'} — ${dayNames[editingDay.dayOfWeek]}`
            : ''
        }
        maxWidth="md"
      >
        <form onSubmit={handleSaveDay} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold mb-1">
              {isEn ? 'Prayer Title' : 'Titre du sujet de prière'}
            </label>
            <input
              type="text"
              required
              value={dayTitle}
              onChange={(e) => setDayTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">
              {isEn ? 'Prayer Focus / Points' : 'Contenu & points de prière'}
            </label>
            <textarea
              rows={4}
              required
              value={dayFocus}
              onChange={(e) => setDayFocus(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">
              {isEn ? 'Bible Verse (optional)' : 'Verset biblique d’appui (facultatif)'}
            </label>
            <input
              type="text"
              placeholder="Ex: Psaume 91:1-2"
              value={dayVerse}
              onChange={(e) => setDayVerse(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            />
          </div>

          <MediaPickerBox
            pendingFile={dayMediaFile}
            existingBlobKey={editingDay?.mediaBlobKey}
            existingMediaType={editingDay?.mediaType}
            removedExisting={dayMediaRemoved}
            onSelectFile={setDayMediaFile}
            onRemoveExisting={() => setDayMediaRemoved(true)}
          />

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditingDay(null)}
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

      {/* Modal Add/Edit Life Change Goal */}
      <Modal
        isOpen={isGoalModalOpen}
        onClose={() => {
          setIsGoalModalOpen(false);
          setGoalMediaFile(null);
        }}
        title={isEn ? 'What I Want to Change in My Life' : 'Ce que je veux changer dans ma vie'}
        maxWidth="md"
      >
        <form onSubmit={handleSaveGoal} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold mb-1">
              {isEn ? 'Life Area' : 'Domaine concerné'}
            </label>
            <input
              type="text"
              placeholder={isEn ? 'Ex: Patience, Speech, Time discipline' : 'Ex: Patience, Paroles, Discipline, Pardon'}
              value={goalArea}
              onChange={(e) => setGoalArea(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">
              {isEn ? 'What I want to leave behind (optional)' : 'Habitude actuelle à transformer'}
            </label>
            <input
              type="text"
              placeholder={isEn ? 'Ex: Reacting with impatience' : 'Ex: M’inquiéter rapidement face aux imprévus'}
              value={goalCurrent}
              onChange={(e) => setGoalCurrent(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">
              {isEn ? 'Desired Change *' : 'Changement souhaité *'}
            </label>
            <textarea
              rows={3}
              required
              placeholder={isEn ? 'Ex: Respond with gentleness and prayer first' : 'Ex: Répondre avec douceur et prier avant de réagir'}
              value={goalDesired}
              onChange={(e) => setGoalDesired(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            />
          </div>
          <div>
            <label className="block font-semibold mb-1">
              {isEn ? 'Prayer / Verse' : 'Prière ou verset d’appui'}
            </label>
            <input
              type="text"
              placeholder="Ex: Philippiens 4:6-7"
              value={goalPrayer}
              onChange={(e) => setGoalPrayer(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            />
          </div>

          <MediaPickerBox
            pendingFile={goalMediaFile}
            existingBlobKey={editingGoal?.mediaBlobKey}
            existingMediaType={editingGoal?.mediaType}
            removedExisting={goalMediaRemoved}
            onSelectFile={setGoalMediaFile}
            onRemoveExisting={() => setGoalMediaRemoved(true)}
          />

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsGoalModalOpen(false)}
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

      {/* Modal Add Person to Pray For */}
      <Modal
        isOpen={isPersonModalOpen}
        onClose={() => {
          setIsPersonModalOpen(false);
          setPersonMediaFile(null);
        }}
        title={isEn ? 'Add a Person to Pray For' : 'Ajouter une personne pour qui prier'}
        maxWidth="md"
      >
        <form onSubmit={handleSavePerson} className="space-y-4 text-xs">
          {contacts.length > 0 && (
            <div>
              <label className="block font-semibold mb-1">
                {isEn ? 'Pick from my contacts (optional)' : 'Choisir dans mes contacts (facultatif)'}
              </label>
              <select
                value={personContactId}
                onChange={(e) => handleSelectContact(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              >
                <option value="">
                  {isEn ? '— Enter manually —' : '— Saisie manuelle —'}
                </option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.firstName} {c.lastName} ({c.phone})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">
                {isEn ? 'Name *' : 'Nom / Prénom *'}
              </label>
              <input
                type="text"
                required
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">
                {isEn ? 'Relation' : 'Lien (famille, ami, pasteur...)'}
              </label>
              <input
                type="text"
                value={personRelation}
                onChange={(e) => setPersonRelation(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">
              {isEn ? 'Prayer Subject *' : 'Sujet de prière pour cette personne *'}
            </label>
            <textarea
              rows={3}
              required
              value={personTopic}
              onChange={(e) => setPersonTopic(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            />
          </div>

          <MediaPickerBox
            pendingFile={personMediaFile}
            onSelectFile={setPersonMediaFile}
          />

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsPersonModalOpen(false)}
              className="px-4 py-2 rounded-xl text-slate-500 font-semibold"
            >
              {isEn ? 'Cancel' : 'Annuler'}
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold"
            >
              {isEn ? 'Add' : 'Ajouter'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Add Spiritual Commitment */}
      <Modal
        isOpen={isCommitmentModalOpen}
        onClose={() => {
          setIsCommitmentModalOpen(false);
          setCommitmentMediaFile(null);
        }}
        title={isEn ? 'New Spiritual Commitment' : 'Nouvel engagement spirituel'}
        maxWidth="md"
      >
        <form onSubmit={handleSaveCommitment} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold mb-1">
              {isEn ? 'Commitment Title *' : 'Engagement *'}
            </label>
            <input
              type="text"
              required
              placeholder={isEn ? 'Ex: Read 1 chapter of the Bible every morning' : 'Ex: Lire un chapitre de la Bible chaque matin'}
              value={commitmentTitle}
              onChange={(e) => setCommitmentTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">{isEn ? 'Category' : 'Catégorie'}</label>
              <select
                value={commitmentCategory}
                onChange={(e) => setCommitmentCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              >
                <option value="Lecture biblique">{isEn ? 'Bible reading' : 'Lecture biblique'}</option>
                <option value="Prière">{isEn ? 'Prayer' : 'Prière'}</option>
                <option value="Jeûne">{isEn ? 'Fasting' : 'Jeûne'}</option>
                <option value="Service & Amour">{isEn ? 'Service & Love' : 'Service & Amour'}</option>
                <option value="Générosité">{isEn ? 'Generosity' : 'Générosité'}</option>
                <option value="Sanctification">{isEn ? 'Holiness' : 'Sanctification'}</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold mb-1">{isEn ? 'Frequency' : 'Fréquence'}</label>
              <input
                type="text"
                value={commitmentFreq}
                onChange={(e) => setCommitmentFreq(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold mb-1">{isEn ? 'Notes' : 'Notes personnelles'}</label>
            <textarea
              rows={2}
              value={commitmentNotes}
              onChange={(e) => setCommitmentNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            />
          </div>

          <MediaPickerBox
            pendingFile={commitmentMediaFile}
            onSelectFile={setCommitmentMediaFile}
          />

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsCommitmentModalOpen(false)}
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

      <ConfirmDialog
        isOpen={!!confirmDelete}
        title={isEn ? 'Delete selection?' : 'Confirmer la suppression ?'}
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

      <SocialShareModal
        isOpen={!!sharePayload}
        onClose={() => setSharePayload(null)}
        payload={sharePayload}
      />
    </div>
  );
};
