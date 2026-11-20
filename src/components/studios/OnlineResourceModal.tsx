import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Download,
  Loader2,
  WifiOff,
  FolderCheck,
  Globe,
  ExternalLink,
  Trash2,
  Plus,
  Image as ImageIcon,
  Music,
  Film,
  Sparkles,
  Play,
  AlertCircle,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { useLanguage } from '../../contexts/LanguageContext';
import { useShalomDB } from '../../hooks/useShalomDB';
import { useOnlineStatus } from '../../services/connectivity';
import { dbService, STORES } from '../../services/db';
import {
  downloadAndSaveStudioAsset,
  OnlineResourceCandidate,
  searchOnlineResources,
} from '../../services/onlineResources';
import { DownloadedStudioAsset, StudioAssetCategory } from '../../types';

interface OnlineResourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  allowedCategories: StudioAssetCategory[];
  defaultCategory?: StudioAssetCategory;
  onSelectAsset: (asset: DownloadedStudioAsset, blob: Blob) => void | Promise<void>;
  title?: string;
}

const CATEGORY_LABELS: Record<StudioAssetCategory, { fr: string; en: string }> = {
  photo: { fr: 'Photos', en: 'Photos' },
  illustration: { fr: 'Illustrations', en: 'Illustrations' },
  icon: { fr: 'Icônes', en: 'Icons' },
  background: { fr: 'Arrière-plans', en: 'Backgrounds' },
  video: { fr: 'Vidéos', en: 'Videos' },
  audio: { fr: 'Musiques & Sons', en: 'Music & SFX' },
};

const QUICK_TERMS: Record<StudioAssetCategory, string[]> = {
  photo: ['sky light', 'mountains', 'forest sun', 'bible book', 'ocean wave'],
  illustration: ['dove', 'olive branch', 'sun', 'candle', 'book'],
  icon: ['heart', 'star', 'music', 'church', 'book', 'sun', 'prayer'],
  background: ['sunset clouds', 'golden bokeh', 'stars night', 'water texture'],
  video: ['clouds', 'ocean waves', 'candle light', 'waterfall'],
  audio: ['piano', 'bell', 'ambient', 'rain', 'flute'],
};

export const OnlineResourceModal: React.FC<OnlineResourceModalProps> = ({
  isOpen,
  onClose,
  allowedCategories,
  defaultCategory,
  onSelectAsset,
  title,
}) => {
  const { lang } = useLanguage();
  const isEn = lang === 'en';
  const isOnline = useOnlineStatus();
  const { downloadedAssets, reloadData } = useShalomDB();

  const [sourceTab, setSourceTab] = useState<'online' | 'local'>(() =>
    isOnline ? 'online' : 'local'
  );
  const [category, setCategory] = useState<StudioAssetCategory>(
    defaultCategory || allowedCategories[0] || 'photo'
  );
  const [localCatFilter, setLocalCatFilter] = useState<'all' | StudioAssetCategory>('all');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OnlineResourceCandidate[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [insertingId, setInsertingId] = useState<string | null>(null);
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [localPreviewUrls, setLocalPreviewUrls] = useState<Record<string, string>>({});

  const searchAbortRef = useRef<AbortController | null>(null);
  const searchSeqRef = useRef(0);

  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      setCategory(defaultCategory || allowedCategories[0] || 'photo');
      setSourceTab(isOnline ? 'online' : 'local');
      setLocalCatFilter('all');
      setPreviewVideoId(null);
      setInsertingId(null);
      setErrorMsg(null);
    }
    if (!isOpen && wasOpenRef.current) {
      searchAbortRef.current?.abort();
      searchAbortRef.current = null;
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, defaultCategory, allowedCategories, isOnline]);

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
    };
  }, []);

  const filteredLocalAssets = useMemo(() => {
    const allowed = downloadedAssets.filter((a) => allowedCategories.includes(a.category));
    if (localCatFilter === 'all') return allowed;
    return allowed.filter((a) => a.category === localCatFilter);
  }, [downloadedAssets, allowedCategories, localCatFilter]);

  const totalLocalAllowed = useMemo(
    () => downloadedAssets.filter((a) => allowedCategories.includes(a.category)).length,
    [downloadedAssets, allowedCategories]
  );

  // Build object URLs for downloaded local assets preview (lazy-safe)
  useEffect(() => {
    if (!isOpen || sourceTab !== 'local') return;
    let cancelled = false;
    const created: string[] = [];

    (async () => {
      const next: Record<string, string> = {};
      for (const item of filteredLocalAssets) {
        const blob = await dbService.getMediaBlob(item.blobKey);
        if (blob && !cancelled) {
          const url = URL.createObjectURL(blob);
          created.push(url);
          next[item.id] = url;
        }
      }
      if (!cancelled) setLocalPreviewUrls(next);
    })();

    return () => {
      cancelled = true;
      created.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [isOpen, sourceTab, filteredLocalAssets]);

  const handleSearch = async (overrideQuery?: string, overrideCat?: StudioAssetCategory) => {
    const targetCat = overrideCat || category;
    const q = (overrideQuery ?? query).trim();
    if (overrideQuery !== undefined) setQuery(overrideQuery);
    if (!isOnline) {
      setErrorMsg(
        isEn
          ? 'Search requires an Internet connection. Your downloaded library works offline.'
          : 'La recherche en ligne nécessite une connexion Internet. Votre bibliothèque téléchargée reste disponible hors ligne.'
      );
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    const seq = ++searchSeqRef.current;

    setIsSearching(true);
    setErrorMsg(null);
    setPreviewVideoId(null);

    try {
      const items = await searchOnlineResources(q, targetCat, controller.signal);
      if (seq !== searchSeqRef.current) return;
      setResults(items);
      if (items.length === 0) {
        setErrorMsg(
          isEn
            ? 'No compatible free resources found for this search. Try another keyword.'
            : 'Aucune ressource compatible trouvée pour cette recherche. Essayez un autre mot-clé (ex: clouds, ocean, piano, star).'
        );
      }
    } catch (err: unknown) {
      if (seq !== searchSeqRef.current) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setErrorMsg(
        err instanceof Error
          ? err.message
          : isEn
            ? 'Online search error.'
            : 'Erreur de recherche en ligne.'
      );
    } finally {
      if (seq === searchSeqRef.current) {
        setIsSearching(false);
      }
    }
  };

  const handleDownloadAndInsert = async (candidate: OnlineResourceCandidate) => {
    setDownloadingId(candidate.id);
    setErrorMsg(null);
    try {
      const { asset, blob } = await downloadAndSaveStudioAsset(candidate);
      await reloadData();
      await onSelectAsset(asset, blob);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : isEn
            ? 'Could not download or insert this resource.'
            : 'Impossible de télécharger ou d’insérer cette ressource.'
      );
    } finally {
      setDownloadingId(null);
    }
  };

  const handleInsertLocalAsset = async (asset: DownloadedStudioAsset) => {
    setInsertingId(asset.id);
    setErrorMsg(null);
    try {
      const blob = await dbService.getMediaBlob(asset.blobKey);
      if (!blob || blob.size === 0) {
        setErrorMsg(
          isEn
            ? 'This offline file is missing or empty.'
            : 'Ce fichier hors ligne est introuvable ou vide dans le stockage.'
        );
        return;
      }
      await onSelectAsset(asset, blob);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : isEn
            ? 'Unable to insert this offline resource into the project.'
            : 'Impossible d’insérer cette ressource (format non pris en charge par cet appareil).'
      );
    } finally {
      setInsertingId(null);
    }
  };

  const handleDeleteLocalAsset = async (asset: DownloadedStudioAsset) => {
    setErrorMsg(null);
    await dbService.deleteItem(STORES.MEDIA_BLOBS, asset.blobKey);
    await dbService.deleteItem(STORES.DOWNLOADED_ASSETS, asset.id);
    await reloadData();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="3xl"
      title={title || (isEn ? 'Creative Resources Library' : 'Bibliothèque de ressources')}
      subtitle={
        isEn
          ? 'Search free Wikimedia & Iconify assets or reuse downloaded offline files'
          : 'Recherchez des ressources libres en ligne et sauvegardez-les localement pour le mode hors-ligne'
      }
    >
      <div className="space-y-4 text-xs">
        {/* Source Tabs */}
        <div className="studio-scroll-x flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
          <button
            type="button"
            onClick={() => {
              setSourceTab('online');
              setErrorMsg(null);
            }}
            className={`min-h-[44px] px-4 py-2 rounded-xl font-bold flex items-center gap-2 shrink-0 transition ${
              sourceTab === 'online'
                ? 'bg-blue-700 text-white'
                : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-200'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>{isEn ? 'Online Search' : 'Recherche en ligne'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSourceTab('local');
              setErrorMsg(null);
            }}
            className={`min-h-[44px] px-4 py-2 rounded-xl font-bold flex items-center gap-2 shrink-0 transition ${
              sourceTab === 'local'
                ? 'bg-blue-700 text-white'
                : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-200'
            }`}
          >
            <FolderCheck className="w-4 h-4" />
            <span>
              {isEn ? 'Offline Library' : 'Téléchargées hors-ligne'} ({totalLocalAllowed})
            </span>
          </button>
        </div>

        {/* Shared Error Banner (visible in BOTH Online and Offline tabs!) */}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 font-semibold flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {sourceTab === 'online' && (
          <div className="space-y-3">
            {!isOnline && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <WifiOff className="w-4 h-4 shrink-0" />
                  <span>
                    {isEn
                      ? 'Offline mode active: online search is unavailable, but all downloaded resources work offline.'
                      : 'Mode hors-ligne actif : la recherche en ligne est indisponible. Utilisez vos ressources déjà téléchargées.'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSourceTab('local')}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold shrink-0"
                >
                  {isEn ? 'Open Local' : 'Ouvrir hors-ligne'}
                </button>
              </div>
            )}

            {/* Category selector */}
            <div className="studio-scroll-x flex items-center gap-1.5 pb-1">
              {allowedCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    searchAbortRef.current?.abort();
                    setIsSearching(false);
                    setCategory(cat);
                    setResults([]);
                    setPreviewVideoId(null);
                    setErrorMsg(null);
                  }}
                  className={`min-h-[44px] px-3.5 py-2 rounded-xl font-semibold shrink-0 border transition ${
                    category === cat
                      ? 'bg-[#0b1f42] dark:bg-blue-700 text-white border-transparent'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {isEn ? CATEGORY_LABELS[cat].en : CATEGORY_LABELS[cat].fr}
                </button>
              ))}
            </div>

            {/* Search bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearch();
              }}
              className="flex gap-2"
            >
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    category === 'icon'
                      ? isEn
                        ? 'Search icons (e.g. heart, star, music, book)...'
                        : 'Rechercher une icône (ex: croix, étoile, heart, music)...'
                      : isEn
                        ? 'Search free resources (e.g. sky, piano, nature)...'
                        : 'Rechercher (ex: nuages, ciel, soleil, piano, bible)...'
                  }
                  className="w-full min-h-[44px] pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-medium"
                />
              </div>
              <button
                type="submit"
                disabled={!isOnline}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-bold flex items-center gap-1.5 shrink-0"
              >
                {isSearching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                <span>{isEn ? 'Search' : 'Rechercher'}</span>
              </button>
            </form>

            {/* Quick keywords */}
            <div className="studio-scroll-x flex items-center gap-1.5 pb-1">
              <span className="text-[11px] font-semibold text-slate-500 shrink-0">
                {isEn ? 'Suggestions:' : 'Idées :'}
              </span>
              {QUICK_TERMS[category].map((term) => (
                <button
                  key={term}
                  type="button"
                  disabled={!isOnline}
                  onClick={() => handleSearch(term)}
                  className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold shrink-0 disabled:opacity-50"
                >
                  {term}
                </button>
              ))}
            </div>

            {/* Results Grid */}
            {results.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[46vh] overflow-y-auto pr-1">
                {results.map((item) => {
                  const isBusy = downloadingId === item.id;
                  const showVideoPlayer = previewVideoId === item.id;
                  return (
                    <div
                      key={item.id}
                      className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-2.5"
                    >
                      <div className="space-y-2">
                        {item.category === 'audio' ? (
                          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-bold">
                              <Music className="w-4 h-4 shrink-0" />
                              <span className="truncate">{item.title}</span>
                            </div>
                            <audio src={item.previewUrl} controls preload="none" className="w-full h-9" />
                          </div>
                        ) : item.category === 'video' ? (
                          showVideoPlayer ? (
                            <video
                              src={item.previewUrl}
                              controls
                              autoPlay
                              muted
                              playsInline
                              className="w-full h-36 rounded-xl bg-black object-cover"
                            />
                          ) : (
                            <div className="relative w-full h-36 rounded-xl bg-slate-900 overflow-hidden">
                              {item.thumbUrl ? (
                                <img
                                  src={item.thumbUrl}
                                  alt={item.title}
                                  referrerPolicy="no-referrer"
                                  loading="lazy"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-400">
                                  <Film className="w-8 h-8" />
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => setPreviewVideoId(item.id)}
                                className="absolute inset-0 bg-black/35 hover:bg-black/45 flex items-center justify-center text-white font-bold gap-1.5 transition"
                              >
                                <span className="w-10 h-10 rounded-full bg-white/90 text-slate-950 flex items-center justify-center shadow">
                                  <Play className="w-4 h-4 fill-current ml-0.5" />
                                </span>
                              </button>
                              {item.durationSec && (
                                <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/75 text-white text-[10px] font-bold tabular-nums">
                                  {Math.round(item.durationSec)}s
                                </span>
                              )}
                            </div>
                          )
                        ) : item.category === 'icon' ? (
                          <div className="w-full h-24 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center p-3">
                            <img
                              src={item.previewUrl}
                              alt={item.title}
                              referrerPolicy="no-referrer"
                              loading="lazy"
                              className="w-14 h-14 object-contain"
                            />
                          </div>
                        ) : (
                          <img
                            src={item.previewUrl}
                            alt={item.title}
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            className="w-full h-32 rounded-xl object-cover bg-slate-200 dark:bg-slate-800"
                          />
                        )}

                        <div>
                          <div className="font-bold text-slate-900 dark:text-white truncate">
                            {item.title}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {item.author} · {item.license}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={!!downloadingId}
                          onClick={() => handleDownloadAndInsert(item)}
                          className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-bold flex items-center justify-center gap-1.5"
                        >
                          {isBusy ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Download className="w-4 h-4" />
                          )}
                          <span>{isEn ? 'Download & Add' : 'Ajouter au projet'}</span>
                        </button>
                        {item.sourceUrl && (
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            title={item.sourceName}
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!isSearching && results.length === 0 && !errorMsg && (
              <div className="p-8 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 text-center text-slate-500 space-y-1.5">
                <Sparkles className="w-6 h-6 text-amber-500 mx-auto" />
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  {isEn
                    ? 'Search real free creative assets from Wikimedia Commons & Iconify'
                    : 'Recherchez de vraies ressources libres (Wikimedia Commons & Iconify)'}
                </p>
                <p className="text-[11px]">
                  {isEn
                    ? 'Every downloaded item is stored inside SHALOM with its author & license for offline reuse.'
                    : 'Chaque élément téléchargé est conservé localement avec auteur & licence pour rester utilisable en mode avion.'}
                </p>
              </div>
            )}
          </div>
        )}

        {sourceTab === 'local' && (
          <div className="space-y-3">
            {allowedCategories.length > 1 && totalLocalAllowed > 0 && (
              <div className="studio-scroll-x flex items-center gap-1.5 pb-1">
                <button
                  type="button"
                  onClick={() => setLocalCatFilter('all')}
                  className={`min-h-[38px] px-3 py-1.5 rounded-lg font-semibold shrink-0 ${
                    localCatFilter === 'all'
                      ? 'bg-[#0b1f42] dark:bg-blue-700 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {isEn ? 'All' : 'Tout'} ({totalLocalAllowed})
                </button>
                {allowedCategories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setLocalCatFilter(cat)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-lg font-semibold shrink-0 ${
                      localCatFilter === cat
                        ? 'bg-[#0b1f42] dark:bg-blue-700 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {isEn ? CATEGORY_LABELS[cat].en : CATEGORY_LABELS[cat].fr}
                  </button>
                ))}
              </div>
            )}

            {filteredLocalAssets.length === 0 ? (
              <div className="p-8 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 text-center text-slate-500">
                {isEn
                  ? 'No downloaded resources yet for this category.'
                  : 'Aucune ressource téléchargée dans cette catégorie pour le moment.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[50vh] overflow-y-auto pr-1">
                {filteredLocalAssets.map((asset) => {
                  const url = localPreviewUrls[asset.id];
                  const isInserting = insertingId === asset.id;
                  const showLocalVid = previewVideoId === asset.id;
                  return (
                    <div
                      key={asset.id}
                      className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-2.5"
                    >
                      <div className="space-y-2">
                        {asset.category === 'audio' ? (
                          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-bold">
                              <Music className="w-4 h-4 shrink-0" />
                              <span className="truncate">{asset.title}</span>
                            </div>
                            {url && <audio src={url} controls preload="none" className="w-full h-9" />}
                          </div>
                        ) : asset.category === 'video' ? (
                          url && showLocalVid ? (
                            <video
                              src={url}
                              controls
                              autoPlay
                              muted
                              playsInline
                              className="w-full h-32 rounded-xl bg-black object-cover"
                            />
                          ) : (
                            <button
                              type="button"
                              disabled={!url}
                              onClick={() => url && setPreviewVideoId(asset.id)}
                              className="w-full h-32 rounded-xl bg-slate-900 text-white flex flex-col items-center justify-center gap-1.5 hover:bg-slate-800 transition"
                            >
                              <span className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center">
                                <Play className="w-4 h-4 fill-current ml-0.5" />
                              </span>
                              <span className="text-[11px] font-semibold text-slate-300">
                                {isEn ? 'Tap to preview video' : 'Lire l’aperçu vidéo'}
                              </span>
                            </button>
                          )
                        ) : url ? (
                          <img
                            src={url}
                            alt={asset.title}
                            className={`w-full ${
                              asset.category === 'icon'
                                ? 'h-24 object-contain p-3 bg-white dark:bg-slate-800'
                                : 'h-32 object-cover'
                            } rounded-xl`}
                          />
                        ) : (
                          <div className="w-full h-24 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center">
                            <ImageIcon className="w-6 h-6 text-slate-400" />
                          </div>
                        )}

                        <div>
                          <div className="font-bold text-slate-900 dark:text-white truncate">
                            {asset.title}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {asset.author || asset.sourceName} · {asset.license || 'Libre'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={!!insertingId}
                          onClick={() => handleInsertLocalAsset(asset)}
                          className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-bold flex items-center justify-center gap-1.5"
                        >
                          {isInserting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Plus className="w-4 h-4" />
                          )}
                          <span>{isEn ? 'Use in project' : 'Insérer'}</span>
                        </button>
                        <button
                          type="button"
                          disabled={!!insertingId}
                          onClick={() => handleDeleteLocalAsset(asset)}
                          aria-label={isEn ? 'Delete resource' : 'Supprimer cette ressource'}
                          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
