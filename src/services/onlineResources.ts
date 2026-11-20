import { fetchWithTimeout, isDeviceOnline } from './connectivity';
import { dbService, STORES } from './db';
import { DownloadedStudioAsset, StudioAssetCategory } from '../types';

export interface OnlineResourceCandidate {
  id: string;
  title: string;
  category: StudioAssetCategory;
  previewUrl: string;
  thumbUrl?: string;
  downloadUrl: string;
  mimeType: string;
  author: string;
  license: string;
  licenseUrl?: string;
  sourceName: string;
  sourceUrl?: string;
  width?: number;
  height?: number;
  durationSec?: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const SEARCH_CACHE = new Map<string, { ts: number; items: OnlineResourceCandidate[] }>();

const FR_TO_EN_TERMS: Record<string, string> = {
  croix: 'cross',
  colombe: 'dove',
  priere: 'prayer',
  prière: 'prayer',
  ciel: 'sky',
  bougie: 'candle',
  lumiere: 'light',
  lumière: 'light',
  mer: 'ocean',
  ocean: 'ocean',
  océan: 'ocean',
  soleil: 'sun',
  etoile: 'star',
  étoile: 'star',
  montagne: 'mountain',
  montagnes: 'mountains',
  foret: 'forest',
  forêt: 'forest',
  nuage: 'clouds',
  nuages: 'clouds',
  coeur: 'heart',
  cœur: 'heart',
  eglise: 'church',
  église: 'church',
  louange: 'worship',
  paix: 'peace',
  fleur: 'flower',
  fleurs: 'flowers',
  eau: 'water',
  cascade: 'waterfall',
  pluie: 'rain',
  cloche: 'bell',
  harpe: 'harp',
  violon: 'violin',
  flute: 'flute',
  flûte: 'flute',
  guitare: 'guitar',
  livre: 'book',
  feu: 'fire',
  musique: 'music',
  chorale: 'choir',
  chanson: 'song',
  arbre: 'tree',
  nuit: 'night stars',
  lever: 'sunrise',
  coucher: 'sunset',
  aube: 'sunrise',
  couronne: 'crown',
  olivier: 'olive branch',
};

function translateQueryForSearch(raw: string): string {
  const words = raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '';
  let changed = false;
  const mapped = words.map((w) => {
    const clean = w.replace(/[’',.;:!?]/g, '');
    if (FR_TO_EN_TERMS[clean]) {
      changed = true;
      return FR_TO_EN_TERMS[clean];
    }
    return w;
  });
  return changed ? mapped.join(' ') : raw.trim();
}

let probeVideoEl: HTMLVideoElement | null = null;
let probeAudioEl: HTMLAudioElement | null = null;

function canBrowserPlayMime(mime: string, kind: 'video' | 'audio', url?: string): boolean {
  const lowerMime = (mime || '').toLowerCase();
  const lowerUrl = (url || '').toLowerCase();

  if (kind === 'video') {
    // Wikimedia .ogv (Ogg Theora/Vorbis) fails to decode on modern Chromium & Android WebView
    if (lowerMime.includes('ogg') || lowerUrl.endsWith('.ogv')) {
      return false;
    }
    if (typeof document === 'undefined') return true;
    if (!probeVideoEl) probeVideoEl = document.createElement('video');
    if (lowerMime.includes('webm')) {
      return probeVideoEl.canPlayType('video/webm; codecs="vp8"') !== '' ||
        probeVideoEl.canPlayType('video/webm; codecs="vp9"') !== '' ||
        probeVideoEl.canPlayType('video/webm') !== '';
    }
    if (lowerMime.includes('mp4')) {
      return probeVideoEl.canPlayType('video/mp4') !== '';
    }
    return probeVideoEl.canPlayType(lowerMime) !== '';
  }

  if (lowerMime.includes('midi')) return false;
  if (typeof document === 'undefined') return true;
  if (!probeAudioEl) probeAudioEl = document.createElement('audio');
  if (lowerMime.includes('ogg') || lowerUrl.endsWith('.oga') || lowerUrl.endsWith('.ogg')) {
    return probeAudioEl.canPlayType('audio/ogg') !== '';
  }
  if (lowerMime.includes('mpeg') || lowerMime.includes('mp3')) {
    return probeAudioEl.canPlayType('audio/mpeg') !== '';
  }
  if (lowerMime.includes('wav')) {
    return probeAudioEl.canPlayType('audio/wav') !== '';
  }
  if (lowerMime.includes('flac')) {
    return probeAudioEl.canPlayType('audio/flac') !== '';
  }
  return probeAudioEl.canPlayType(lowerMime) !== '';
}

function stripHtml(input?: string): string {
  if (!input) return '';
  return input
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCachedResults(key: string): OnlineResourceCandidate[] | null {
  const entry = SEARCH_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    SEARCH_CACHE.delete(key);
    return null;
  }
  return entry.items;
}

function setCachedResults(key: string, items: OnlineResourceCandidate[]) {
  if (SEARCH_CACHE.size >= 60) {
    const oldestKey = SEARCH_CACHE.keys().next().value;
    if (oldestKey) SEARCH_CACHE.delete(oldestKey);
  }
  SEARCH_CACHE.set(key, { ts: Date.now(), items });
}

export async function searchOnlineIcons(
  query: string,
  signal?: AbortSignal
): Promise<OnlineResourceCandidate[]> {
  if (!isDeviceOnline()) {
    throw new Error('Connexion Internet requise pour rechercher des icônes en ligne.');
  }
  const rawQuery = query.trim() || 'star';
  const translated = translateQueryForSearch(rawQuery);
  const cacheKey = `icon:${translated.toLowerCase()}`;
  const cached = getCachedResults(cacheKey);
  if (cached) return cached;

  const fetchIcons = async (q: string): Promise<OnlineResourceCandidate[]> => {
    const url = `https://api.iconify.design/search?query=${encodeURIComponent(q)}&limit=28`;
    const resp = await fetchWithTimeout(url, { signal }, 7500);
    if (!resp.ok) {
      throw new Error('Impossible de joindre la bibliothèque d’icônes.');
    }
    const data = (await resp.json()) as {
      icons?: string[];
      collections?: Record<
        string,
        {
          name?: string;
          author?: { name?: string };
          license?: { title?: string; url?: string };
        }
      >;
    };

    const icons = Array.isArray(data.icons) ? data.icons : [];
    const collections = data.collections || {};

    return icons.map((fullName) => {
      const [prefix, iconName] = fullName.split(':');
      const col = collections[prefix] || {};
      const svgUrl = `https://api.iconify.design/${encodeURIComponent(prefix)}/${encodeURIComponent(iconName)}.svg`;
      return {
        id: `iconify_${fullName}`,
        title: `${iconName.replace(/[-_]+/g, ' ')} (${col.name || prefix})`,
        category: 'icon',
        previewUrl: svgUrl,
        downloadUrl: svgUrl,
        mimeType: 'image/svg+xml',
        author: col.author?.name || col.name || prefix,
        license: col.license?.title || 'Open Source License',
        licenseUrl: col.license?.url,
        sourceName: 'Iconify',
        sourceUrl: `https://icon-sets.iconify.design/${prefix}/`,
        width: 256,
        height: 256,
      };
    });
  };

  let results = await fetchIcons(translated);
  if (results.length === 0 && translated.toLowerCase() !== rawQuery.toLowerCase()) {
    results = await fetchIcons(rawQuery);
  }
  setCachedResults(cacheKey, results);
  return results;
}

async function queryWikimediaCommons(
  gsrsearch: string,
  category: Exclude<StudioAssetCategory, 'icon'>,
  signal?: AbortSignal
): Promise<OnlineResourceCandidate[]> {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrnamespace: '6',
    gsrlimit: '20',
    gsrsearch,
    prop: 'imageinfo',
    iiprop: 'url|mime|size|extmetadata',
    iiurlwidth: '640',
    format: 'json',
    origin: '*',
  });

  const url = `https://commons.wikimedia.org/w/api.php?${params.toString()}`;
  const resp = await fetchWithTimeout(url, { signal }, 8000);
  if (!resp.ok) {
    throw new Error('Impossible de joindre Wikimedia Commons.');
  }

  const data = (await resp.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          pageid?: number;
          title?: string;
          imageinfo?: Array<{
            url?: string;
            thumburl?: string;
            descriptionurl?: string;
            mime?: string;
            size?: number;
            width?: number;
            height?: number;
            duration?: number;
            extmetadata?: {
              Artist?: { value?: string };
              LicenseShortName?: { value?: string };
              LicenseUrl?: { value?: string };
              ObjectName?: { value?: string };
            };
          }>;
        }
      >;
    };
  };

  const pages = Object.values(data.query?.pages || {});
  const results: OnlineResourceCandidate[] = [];

  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info || !info.url || !info.mime) continue;
    const mime = info.mime.toLowerCase();

    // Keep mobile downloads fast (< 60 MB for video/audio)
    if (info.size && info.size > 60 * 1024 * 1024) continue;

    if (category === 'photo' || category === 'background') {
      if (!/^image\/(jpeg|jpg|png|webp)$/.test(mime)) continue;
    } else if (category === 'illustration') {
      if (!/^image\/(svg\+xml|png|jpeg|webp)$/.test(mime)) continue;
    } else if (category === 'audio') {
      if (mime.includes('midi') || (!mime.startsWith('audio/') && !mime.includes('ogg'))) continue;
      if (!canBrowserPlayMime(mime, 'audio', info.url)) continue;
    } else if (category === 'video') {
      if (!mime.startsWith('video/') && !mime.includes('webm')) continue;
      if (!canBrowserPlayMime(mime, 'video', info.url)) continue;
    }

    const rawTitle =
      stripHtml(info.extmetadata?.ObjectName?.value) ||
      (page.title || '').replace(/^File:/i, '').replace(/\.[^.]+$/, '');
    const author = stripHtml(info.extmetadata?.Artist?.value) || 'Auteur Wikimedia Commons';
    const license = stripHtml(info.extmetadata?.LicenseShortName?.value) || 'Libre / Wikimedia Commons';
    const licenseUrl = info.extmetadata?.LicenseUrl?.value;

    const previewUrl =
      category === 'audio' || category === 'video' ? info.url : info.thumburl || info.url;
    const downloadUrl =
      (category === 'photo' || category === 'background') && info.thumburl ? info.thumburl : info.url;

    results.push({
      id: `commons_${page.pageid || rawTitle}`,
      title: rawTitle.slice(0, 80) || 'Ressource',
      category,
      previewUrl,
      thumbUrl: category === 'video' ? info.thumburl : undefined,
      downloadUrl,
      mimeType: info.mime,
      author: author.slice(0, 80),
      license,
      licenseUrl,
      sourceName: 'Wikimedia Commons',
      sourceUrl: info.descriptionurl,
      width: info.width,
      height: info.height,
      durationSec: info.duration,
    });
  }

  return results;
}

export async function searchOnlineMedia(
  query: string,
  category: Exclude<StudioAssetCategory, 'icon'>,
  signal?: AbortSignal
): Promise<OnlineResourceCandidate[]> {
  if (!isDeviceOnline()) {
    throw new Error('Connexion Internet requise pour rechercher des ressources en ligne.');
  }

  const rawQuery =
    query.trim() || (category === 'audio' ? 'piano' : category === 'video' ? 'clouds' : 'nature');
  const cleanQuery = translateQueryForSearch(rawQuery);
  const cacheKey = `${category}:${cleanQuery.toLowerCase()}`;
  const cached = getCachedResults(cacheKey);
  if (cached) return cached;

  const filetypeFilter =
    category === 'illustration'
      ? 'filetype:drawing'
      : category === 'audio'
        ? 'filetype:audio'
        : category === 'video'
          ? 'filetype:video'
          : 'filetype:bitmap';

  let results = await queryWikimediaCommons(`${cleanQuery} ${filetypeFilter}`, category, signal);

  // If filetype:drawing returns nothing for an illustration query, broaden cleanly to SVG/bitmap illustrations
  if (results.length === 0 && category === 'illustration') {
    results = await queryWikimediaCommons(`${cleanQuery} illustration`, category, signal);
  }

  // Fallback to untranslated query if translation yielded nothing
  if (results.length === 0 && cleanQuery.toLowerCase() !== rawQuery.toLowerCase()) {
    results = await queryWikimediaCommons(`${rawQuery} ${filetypeFilter}`, category, signal);
  }

  setCachedResults(cacheKey, results);
  return results;
}

export async function searchOnlineResources(
  query: string,
  category: StudioAssetCategory,
  signal?: AbortSignal
): Promise<OnlineResourceCandidate[]> {
  if (category === 'icon') {
    return searchOnlineIcons(query, signal);
  }
  return searchOnlineMedia(query, category, signal);
}

export async function downloadAndSaveStudioAsset(
  candidate: OnlineResourceCandidate
): Promise<{ asset: DownloadedStudioAsset; blob: Blob }> {
  if (!isDeviceOnline()) {
    throw new Error('Connexion Internet requise pour télécharger cette ressource.');
  }

  const resp = await fetchWithTimeout(candidate.downloadUrl, {}, 22000);
  if (!resp.ok) {
    throw new Error(`Téléchargement impossible (HTTP ${resp.status}).`);
  }

  const rawBlob = await resp.blob();
  if (!rawBlob || rawBlob.size === 0) {
    throw new Error('Le fichier téléchargé est vide.');
  }

  const mimeType = candidate.mimeType || rawBlob.type || 'application/octet-stream';
  const typedBlob = new Blob([rawBlob], { type: mimeType });
  const now = new Date().toISOString();
  const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const blobKey = `blob_asset_${uid}`;

  await dbService.saveMediaBlob(blobKey, typedBlob, mimeType);

  const asset: DownloadedStudioAsset = {
    id: `asset_${uid}`,
    title: candidate.title,
    category: candidate.category,
    mimeType,
    blobKey,
    author: candidate.author,
    license: candidate.license,
    licenseUrl: candidate.licenseUrl,
    sourceName: candidate.sourceName,
    sourceUrl: candidate.sourceUrl,
    width: candidate.width,
    height: candidate.height,
    durationSec: candidate.durationSec,
    createdAt: now,
  };

  await dbService.put(STORES.DOWNLOADED_ASSETS, asset);
  return { asset, blob: typedBlob };
}
