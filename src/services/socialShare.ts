// Social Sharing Helper for SHALOM (WhatsApp, Gmail, Facebook, Instagram, X, TikTok & Native Web Share)

export type SocialPlatform = 'native' | 'whatsapp' | 'gmail' | 'facebook' | 'instagram' | 'x' | 'tiktok';

export interface SharePayload {
  title: string;
  text: string;
  url?: string;
  file?: File;
}

export async function normalizeMediaToShareFile(
  blob: Blob,
  fileNameBase: string,
  mediaType?: 'image' | 'video' | 'audio',
  mimeHint?: string
): Promise<File> {
  const safeBase = fileNameBase.replace(/[^a-z0-9_-]/gi, '_').slice(0, 48) || 'shalom_media';
  const rawMime = mimeHint || blob.type || '';

  if (mediaType === 'audio' || rawMime.startsWith('audio/')) {
    const ext = rawMime.includes('mp3') || rawMime.includes('mpeg')
      ? 'mp3'
      : rawMime.includes('wav')
      ? 'wav'
      : rawMime.includes('mp4') || rawMime.includes('m4a')
      ? 'm4a'
      : 'webm';
    return new File([blob], `${safeBase}.${ext}`, { type: rawMime || 'audio/wav' });
  }

  if (mediaType === 'video' || rawMime.startsWith('video/')) {
    const ext = rawMime.includes('mp4') ? 'mp4' : 'webm';
    return new File([blob], `${safeBase}.${ext}`, { type: rawMime || 'video/webm' });
  }

  // Image: keep PNG/JPEG as-is, convert exotic types (webp/heic) to JPEG for wide social support
  if (rawMime === 'image/png') {
    return new File([blob], `${safeBase}.png`, { type: 'image/png' });
  }
  if (rawMime === 'image/jpeg' || rawMime === 'image/jpg') {
    return new File([blob], `${safeBase}.jpg`, { type: 'image/jpeg' });
  }

  try {
    const url = URL.createObjectURL(blob);
    const jpegBlob = await new Promise<Blob | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 1080;
        canvas.height = img.naturalHeight || 1080;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((res) => resolve(res), 'image/jpeg', 0.92);
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
    URL.revokeObjectURL(url);
    if (jpegBlob && jpegBlob.size > 0) {
      return new File([jpegBlob], `${safeBase}.jpg`, { type: 'image/jpeg' });
    }
  } catch {
    // fallback below
  }

  return new File([blob], `${safeBase}.jpg`, { type: rawMime || 'image/jpeg' });
}

export async function copyTextQuietly(text: string): Promise<boolean> {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallback below
    }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function triggerFileDownload(file: Blob | File, fileName: string): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function tryNativeShare(payload: SharePayload): Promise<'shared' | 'cancelled' | 'unsupported'> {
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share !== 'function') return 'unsupported';

  const candidates: ShareData[] = [];
  if (payload.file) {
    // Keep file + text + title together first so WhatsApp/Facebook/Instagram/X/TikTok receive both!
    candidates.push({ title: payload.title, text: payload.text, files: [payload.file] });
    candidates.push({ text: payload.text, files: [payload.file] });
    candidates.push({ files: [payload.file] });
  } else {
    candidates.push({
      title: payload.title,
      text: payload.text,
      ...(payload.url ? { url: payload.url } : {}),
    });
  }

  for (const data of candidates) {
    if (nav.canShare && !nav.canShare(data)) continue;
    try {
      await nav.share(data);
      return 'shared';
    } catch (err: unknown) {
      if (err instanceof Error && (err.name === 'AbortError' || err.message?.toLowerCase().includes('cancel'))) {
        return 'cancelled';
      }
    }
  }
  return 'unsupported';
}

export function buildGmailMailtoUrl(payload: SharePayload): string {
  const subject = encodeURIComponent(payload.title || 'Partage SHALOM');
  const body = encodeURIComponent(payload.text || '');
  return `mailto:?subject=${subject}&body=${body}`;
}

export function buildPlatformShareUrl(platform: Exclude<SocialPlatform, 'native'>, payload: SharePayload): string {
  const shareUrl = payload.url || (typeof window !== 'undefined' ? window.location.origin : 'https://shalom.app');
  const encodedText = encodeURIComponent(payload.text);
  const encodedTitle = encodeURIComponent(payload.title || 'Partage SHALOM');
  const encodedUrl = encodeURIComponent(shareUrl);

  switch (platform) {
    case 'whatsapp':
      return `https://wa.me/?text=${encodedText}`;
    case 'gmail':
      return `https://mail.google.com/mail/?view=cm&fs=1&su=${encodedTitle}&body=${encodedText}`;
    case 'facebook':
      return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`;
    case 'x':
      return `https://twitter.com/intent/tweet?text=${encodedText}`;
    case 'instagram':
      return 'https://www.instagram.com/';
    case 'tiktok':
      return 'https://www.tiktok.com/upload';
  }
}

export function formatPrayerShareText(
  title: string,
  focus: string,
  bibleVerse?: string
): string {
  const parts = [`🙏 ${title}`, '', focus];
  if (bibleVerse?.trim()) {
    parts.push('', `📖 ${bibleVerse.trim()}`);
  }
  parts.push('', '— SHALOM');
  return parts.join('\n');
}
