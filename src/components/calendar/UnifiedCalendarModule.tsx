import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Plus,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  CheckCircle2,
  Trash2,
  CheckSquare,
  Square,
  Image as ImageIcon,
  Share2,
  X,
} from 'lucide-react';
import { dbService, STORES } from '../../services/db';
import { useShalomDB } from '../../hooks/useShalomDB';
import { CalendarActivity, CalendarActivityType } from '../../types';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { SocialShareModal } from '../common/SocialShareModal';
import { SharePayload, normalizeMediaToShareFile } from '../../services/socialShare';

export const PERSONAL_ACTIVITY_TYPES: Array<{ id: CalendarActivityType; label: string; color: string }> = [
  { id: 'priere', label: 'Temps de prière', color: '#1d4ed8' },
  { id: 'meditation', label: 'Méditation biblique', color: '#0284c7' },
  { id: 'jeune', label: 'Jeûne & consécration', color: '#7c3aed' },
  { id: 'culte', label: 'Culte / Assemblée', color: '#059669' },
  { id: 'reunion', label: 'Rencontre fraternelle', color: '#d97706' },
  { id: 'autre', label: 'Autre rendez-vous', color: '#475569' },
];

interface PersonalCalendarEvent {
  id: string;
  title: string;
  activityType: CalendarActivityType;
  date: string;
  time: string;
  location?: string;
  description?: string;
  status: 'a_venir' | 'accompli';
  mediaBlobKey?: string;
  mediaType?: 'image' | 'video';
  mediaMimeType?: string;
  raw?: CalendarActivity;
}

const EventMediaPreview: React.FC<{
  blobKey?: string;
  mediaType?: 'image' | 'video';
}> = ({ blobKey, mediaType }) => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objUrl: string | null = null;
    if (blobKey) {
      dbService.getMediaBlob(blobKey).then((blob) => {
        if (active && blob && blob.size > 0) {
          objUrl = URL.createObjectURL(blob);
          setUrl(objUrl);
        }
      });
    }
    return () => {
      active = false;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [blobKey]);

  if (!blobKey || !url) return null;

  return (
    <div className="mt-2 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 max-w-sm">
      {mediaType === 'video' ? (
        <video src={url} controls playsInline className="w-full max-h-48 object-contain" />
      ) : (
        <img
          src={url}
          alt="Affiche de l'événement"
          className="w-full max-h-48 object-cover"
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  );
};

export const UnifiedCalendarModule: React.FC = () => {
  const { calendarActivities, prayers, reloadData } = useShalomDB();

  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedActivityIds, setSelectedActivityIds] = useState<string[]>([]);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);

  const [form, setForm] = useState<{
    title: string;
    activityType: CalendarActivityType;
    date: string;
    time: string;
    location: string;
    description: string;
  }>({
    title: '',
    activityType: 'priere',
    date: new Date().toISOString().split('T')[0],
    time: '07h00',
    location: '',
    description: '',
  });

  const [eventMediaFile, setEventMediaFile] = useState<{
    file: File;
    mediaType: 'image' | 'video';
    previewUrl: string;
  } | null>(null);

  const unifiedItems = useMemo<PersonalCalendarEvent[]>(() => {
    const items: PersonalCalendarEvent[] = calendarActivities.map((c) => ({
      id: c.id,
      title: c.title,
      activityType: c.activityType,
      date: c.date,
      time: c.time,
      location: c.location,
      description: c.description,
      status: c.status,
      mediaBlobKey: c.mediaBlobKey,
      mediaType: c.mediaType,
      mediaMimeType: c.mediaMimeType,
      raw: c,
    }));

    prayers.forEach((p) => {
      if (p.nextFollowUpDate && p.status !== 'exaucee' && p.status !== 'archivee') {
        items.push({
          id: `pr_${p.id}`,
          title: `Rappel prière : ${p.title}`,
          activityType: 'priere',
          date: p.nextFollowUpDate,
          time: 'Rappel',
          description: p.description,
          status: 'a_venir',
        });
      }
    });

    return items.sort((a, b) => a.date.localeCompare(b.date));
  }, [calendarActivities, prayers]);

  const filteredItems = unifiedItems.filter((item) => {
    const matchType = typeFilter === 'all' || item.activityType === typeFilter;
    const matchDay = !selectedDay || item.date === selectedDay;
    return matchType && matchDay;
  });

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthTitle = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(
    currentMonth
  );

  const handleSelectEventMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (eventMediaFile?.previewUrl) URL.revokeObjectURL(eventMediaFile.previewUrl);
    const mediaType: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image';
    setEventMediaFile({
      file,
      mediaType,
      previewUrl: URL.createObjectURL(file),
    });
    e.target.value = '';
  };

  const handleSaveActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;

    const id = `cal_${Date.now()}`;
    let mediaBlobKey: string | undefined;
    let mediaType: 'image' | 'video' | undefined;
    let mediaMimeType: string | undefined;

    if (eventMediaFile) {
      mediaBlobKey = `cal_media_${id}`;
      mediaType = eventMediaFile.mediaType;
      mediaMimeType = eventMediaFile.file.type;
      await dbService.saveMediaBlob(mediaBlobKey, eventMediaFile.file, mediaMimeType);
      URL.revokeObjectURL(eventMediaFile.previewUrl);
    }

    const activity: CalendarActivity = {
      id,
      title: form.title.trim(),
      activityType: form.activityType,
      date: form.date,
      time: form.time.trim() || '07h00',
      location: form.location.trim() || undefined,
      description: form.description.trim() || undefined,
      status: 'a_venir',
      mediaBlobKey,
      mediaType,
      mediaMimeType,
      createdAt: new Date().toISOString(),
    };

    await dbService.put(STORES.CALENDAR_ACTIVITIES, activity);
    setIsModalOpen(false);
    setEventMediaFile(null);
    setForm({
      title: '',
      activityType: 'priere',
      date: new Date().toISOString().split('T')[0],
      time: '07h00',
      location: '',
      description: '',
    });
    reloadData();
  };

  const handleToggleAccomplished = async (item: CalendarActivity) => {
    await dbService.put(STORES.CALENDAR_ACTIVITIES, {
      ...item,
      status: item.status === 'accompli' ? 'a_venir' : 'accompli',
    });
    reloadData();
  };

  const handleConfirmDeleteCalendarItem = async () => {
    if (!deletingId) return;
    const item = calendarActivities.find((c) => c.id === deletingId);
    if (item?.mediaBlobKey) {
      await dbService.deleteItem(STORES.MEDIA_BLOBS, item.mediaBlobKey);
    }
    await dbService.deleteItem(STORES.CALENDAR_ACTIVITIES, deletingId);
    setSelectedActivityIds((prev) => prev.filter((id) => id !== deletingId));
    setDeletingId(null);
    reloadData();
  };

  const deletableVisibleIds = filteredItems.filter((i) => !!i.raw).map((i) => i.id);

  const handleToggleSelectActivity = (id: string) => {
    setSelectedActivityIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleToggleAllActivities = () => {
    const allSelected =
      deletableVisibleIds.length > 0 &&
      deletableVisibleIds.every((id) => selectedActivityIds.includes(id));
    setSelectedActivityIds(allSelected ? [] : deletableVisibleIds);
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedActivityIds.length === 0) return;
    const blobKeys = calendarActivities
      .filter((c) => selectedActivityIds.includes(c.id) && c.mediaBlobKey)
      .map((c) => c.mediaBlobKey as string);
    if (blobKeys.length > 0) {
      await dbService.deleteItems(STORES.MEDIA_BLOBS, blobKeys);
    }
    await dbService.deleteItems(STORES.CALENDAR_ACTIVITIES, selectedActivityIds);
    setSelectedActivityIds([]);
    setIsBulkDeleteOpen(false);
    reloadData();
  };

  const handleShareEvent = async (item: PersonalCalendarEvent) => {
    const info = getTypeInfo(item.activityType);
    const text = `📅 *ÉVÉNEMENT À VENIR — SHALOM*\n\n*${item.title}*\nCatégorie : ${info.label}\n📆 Date : ${item.date} à ${item.time}${
      item.location ? `\n📍 Lieu : ${item.location}` : ''
    }${item.description ? `\n\n${item.description}` : ''}\n\nSoyez bénis !`;

    let file: File | undefined;
    if (item.mediaBlobKey) {
      const blob = await dbService.getMediaBlob(item.mediaBlobKey);
      if (blob && blob.size > 0) {
        file = await normalizeMediaToShareFile(
          blob,
          `evenement_${item.title}`,
          item.mediaType || 'image',
          item.mediaMimeType
        );
      }
    }

    setSharePayload({
      title: item.title,
      text,
      file,
    });
  };

  const getTypeInfo = (t: CalendarActivityType) =>
    PERSONAL_ACTIVITY_TYPES.find((a) => a.id === t) || { id: t, label: 'Rendez-vous', color: '#1d4ed8' };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2 font-display">
            <CalendarIcon className="w-6 h-6 text-blue-700 dark:text-blue-400" />
            <span>Mon Calendrier Spirituel</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Temps de prière, méditations, jeûnes, événements avec image/vidéo et partage social
          </p>
        </div>

        {unifiedItems.length > 0 && (
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Ajouter un moment</span>
          </button>
        )}
      </div>

      {/* Filters */}
      {unifiedItems.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="text-xs px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
          >
            <option value="all">Tous les moments ({unifiedItems.length})</option>
            {PERSONAL_ACTIVITY_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>

          {selectedDay && (
            <button
              type="button"
              onClick={() => setSelectedDay(null)}
              className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:underline"
            >
              Jour sélectionné : {selectedDay} · Tout afficher
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Month Grid */}
        <div className="lg:col-span-2 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 self-start">
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h3 className="text-sm font-bold capitalize text-slate-900 dark:text-white">
              {monthTitle}
            </h3>
            <button
              type="button"
              onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-400 mb-2">
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`empty_${i}`} className="h-10" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const dayNum = idx + 1;
              const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const dayEvents = unifiedItems.filter((item) => item.date === iso);
              const isSelected = selectedDay === iso;
              const isToday = iso === new Date().toISOString().split('T')[0];

              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => setSelectedDay(isSelected ? null : iso)}
                  className={`h-10 rounded-xl flex flex-col items-center justify-center text-xs tabular-nums transition relative ${
                    isSelected
                      ? 'bg-[#0b1f42] text-white font-bold dark:bg-blue-700'
                      : isToday
                      ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 font-bold border border-amber-300/60'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <span>{dayNum}</span>
                  {dayEvents.length > 0 && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                        isSelected ? 'bg-amber-300' : 'bg-blue-600'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* List */}
        <div className="lg:col-span-3 space-y-3">
          {deletableVisibleIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <button
                type="button"
                onClick={handleToggleAllActivities}
                className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 hover:text-blue-700"
              >
                {deletableVisibleIds.every((id) => selectedActivityIds.includes(id)) &&
                deletableVisibleIds.length > 0 ? (
                  <CheckSquare className="w-4 h-4 text-blue-600" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400" />
                )}
                <span>Tout sélectionner ({selectedActivityIds.length})</span>
              </button>

              {selectedActivityIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsBulkDeleteOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Supprimer ({selectedActivityIds.length})</span>
                </button>
              )}
            </div>
          )}

          {filteredItems.map((item) => {
            const info = getTypeInfo(item.activityType);
            const isSelected = !!item.raw && selectedActivityIds.includes(item.id);
            return (
              <div
                key={item.id}
                className={`p-4 rounded-2xl bg-white dark:bg-[#0c1631] border flex flex-col gap-3 shadow-xs transition ${
                  isSelected
                    ? 'border-blue-600 ring-2 ring-blue-600/20'
                    : 'border-slate-200/80 dark:border-slate-800/80'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                      {item.raw && (
                        <button
                          type="button"
                          onClick={() => handleToggleSelectActivity(item.id)}
                          aria-label="Sélectionner cet événement"
                          className="text-slate-400 hover:text-blue-600"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      )}
                      <span style={{ color: info.color }}>{info.label}</span>
                      <span className="text-slate-300">·</span>
                      <span className="tabular-nums text-slate-600 dark:text-slate-300">
                        {item.date}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {item.time}
                      </span>
                      {item.status === 'accompli' && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="text-emerald-600 dark:text-emerald-400">Accompli</span>
                        </>
                      )}
                    </div>

                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">{item.title}</h4>

                    {item.location && (
                      <p className="text-[11px] text-slate-500 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {item.location}
                      </p>
                    )}

                    {item.description && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 pt-1">
                        {item.description}
                      </p>
                    )}

                    {item.mediaBlobKey && (
                      <EventMediaPreview blobKey={item.mediaBlobKey} mediaType={item.mediaType} />
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleShareEvent(item)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 flex items-center gap-1"
                      title="Partager cet événement sur les réseaux sociaux"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Partager</span>
                    </button>

                    {item.raw && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleToggleAccomplished(item.raw!)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1 ${
                            item.status === 'accompli'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{item.status === 'accompli' ? 'Accompli' : 'Valider'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingId(item.raw!.id)}
                          aria-label="Supprimer ce moment"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {filteredItems.length === 0 && (
            <div className="py-12 px-6 text-center rounded-2xl bg-white dark:bg-[#0c1631] border border-dashed border-slate-300 dark:border-slate-800 space-y-3">
              <CalendarIcon className="w-9 h-9 text-blue-600 dark:text-blue-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {unifiedItems.length === 0
                  ? 'Votre calendrier spirituel est vide.'
                  : 'Aucun moment planifié pour cette sélection.'}
              </p>
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Planifier mon premier moment</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          if (eventMediaFile?.previewUrl) URL.revokeObjectURL(eventMediaFile.previewUrl);
          setEventMediaFile(null);
        }}
        title="Planifier un moment ou événement"
      >
        <form onSubmit={handleSaveActivity} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">Titre *</label>
              <input
                type="text"
                required
                placeholder="Ex: Temps de prière, Jeûne, Culte spécial..."
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Type *</label>
              <select
                value={form.activityType}
                onChange={(e) =>
                  setForm({ ...form, activityType: e.target.value as CalendarActivityType })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              >
                {PERSONAL_ACTIVITY_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">Date *</label>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Horaire *</label>
              <input
                type="text"
                required
                placeholder="07h00"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">Lieu (facultatif)</label>
            <input
              type="text"
              placeholder="Maison, Parc, Assemblée..."
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            />
          </div>

          <div>
            <label className="block font-semibold mb-1">Notes</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            />
          </div>

          {/* Image or Video attachment for event */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Image ou vidéo d’annonce (facultatif)
              </span>
              <label className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold text-blue-700 dark:text-blue-400 cursor-pointer flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Choisir image / vidéo</span>
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleSelectEventMedia}
                  className="hidden"
                />
              </label>
            </div>

            {eventMediaFile && (
              <div className="relative rounded-lg overflow-hidden bg-black">
                {eventMediaFile.mediaType === 'video' ? (
                  <video src={eventMediaFile.previewUrl} controls className="w-full max-h-40" />
                ) : (
                  <img
                    src={eventMediaFile.previewUrl}
                    alt="Aperçu de l'événement"
                    className="w-full max-h-40 object-cover"
                  />
                )}
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(eventMediaFile.previewUrl);
                    setEventMediaFile(null);
                  }}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 font-semibold text-slate-500"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-blue-700 text-white font-bold"
            >
              Enregistrer
            </button>
          </div>
        </form>
      </Modal>

      <SocialShareModal
        isOpen={!!sharePayload}
        onClose={() => setSharePayload(null)}
        payload={sharePayload}
      />

      <ConfirmDialog
        isOpen={!!deletingId}
        title="Supprimer ce moment du calendrier ?"
        message="Cette action supprimera définitivement ce rendez-vous de votre calendrier."
        confirmLabel="Oui, supprimer"
        cancelLabel="Annuler"
        isDestructive
        onConfirm={handleConfirmDeleteCalendarItem}
        onCancel={() => setDeletingId(null)}
      />

      <ConfirmDialog
        isOpen={isBulkDeleteOpen}
        title="Supprimer les moments sélectionnés ?"
        message={`Vous allez supprimer définitivement ${selectedActivityIds.length} événement(s) de votre calendrier.`}
        confirmLabel="Oui, supprimer en masse"
        cancelLabel="Annuler"
        isDestructive
        onConfirm={handleConfirmBulkDelete}
        onCancel={() => setIsBulkDeleteOpen(false)}
      />
    </div>
  );
};
