import React, { useEffect, useState } from 'react';
import { Image as ImageIcon, Video, Upload, Trash2 } from 'lucide-react';
import { dbService, STORES } from '../../services/db';
import { normalizeMediaToShareFile } from '../../services/socialShare';

export async function persistOptionalMedia(params: {
  prefix: string;
  pendingFile: File | null;
  removedExisting?: boolean;
  existingBlobKey?: string;
  existingMediaType?: 'image' | 'video';
  existingMimeType?: string;
}): Promise<{
  mediaBlobKey?: string;
  mediaType?: 'image' | 'video';
  mediaMimeType?: string;
}> {
  const {
    prefix,
    pendingFile,
    removedExisting,
    existingBlobKey,
    existingMediaType,
    existingMimeType,
  } = params;

  if (pendingFile) {
    if (existingBlobKey) {
      await dbService.deleteItem(STORES.MEDIA_BLOBS, existingBlobKey).catch(() => {});
    }
    const isVideo = pendingFile.type.startsWith('video/');
    const mediaType: 'image' | 'video' = isVideo ? 'video' : 'image';
    const mediaMimeType = pendingFile.type || (isVideo ? 'video/mp4' : 'image/jpeg');
    const newKey = `media_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await dbService.saveMediaBlob(newKey, pendingFile, mediaMimeType);
    return {
      mediaBlobKey: newKey,
      mediaType,
      mediaMimeType,
    };
  }

  if (removedExisting) {
    if (existingBlobKey) {
      await dbService.deleteItem(STORES.MEDIA_BLOBS, existingBlobKey).catch(() => {});
    }
    return {
      mediaBlobKey: undefined,
      mediaType: undefined,
      mediaMimeType: undefined,
    };
  }

  return {
    mediaBlobKey: existingBlobKey,
    mediaType: existingMediaType,
    mediaMimeType: existingMimeType,
  };
}

export async function loadMediaAsShareFile(
  blobKey?: string,
  title?: string,
  mediaType?: 'image' | 'video',
  mimeType?: string
): Promise<File | undefined> {
  if (!blobKey) return undefined;
  try {
    const blob = await dbService.getMediaBlob(blobKey);
    if (!blob || blob.size === 0) return undefined;
    return await normalizeMediaToShareFile(
      blob,
      title || 'shalom_partage',
      mediaType || (blob.type.startsWith('video/') ? 'video' : 'image'),
      mimeType || blob.type
    );
  } catch {
    return undefined;
  }
}

export const StoredMediaViewer: React.FC<{
  mediaBlobKey?: string;
  mediaType?: 'image' | 'video';
  alt?: string;
  className?: string;
}> = ({ mediaBlobKey, mediaType, alt = 'Média associé', className = '' }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [resolvedType, setResolvedType] = useState<'image' | 'video'>(mediaType || 'image');

  useEffect(() => {
    if (!mediaBlobKey) {
      setUrl(null);
      return;
    }
    let active = true;
    let objectUrl: string | null = null;
    dbService
      .getMediaBlob(mediaBlobKey)
      .then((blob) => {
        if (!active || !blob || blob.size === 0) return;
        const isVid =
          mediaType === 'video' || (blob.type && blob.type.startsWith('video/'));
        setResolvedType(isVid ? 'video' : 'image');
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaBlobKey, mediaType]);

  if (!url) return null;

  if (resolvedType === 'video') {
    return (
      <div className={`rounded-xl overflow-hidden bg-black border border-slate-200 dark:border-slate-800 ${className}`}>
        <video
          src={url}
          controls
          playsInline
          className="w-full max-h-60 object-contain mx-auto"
        />
      </div>
    );
  }

  return (
    <div className={`rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 ${className}`}>
      <img
        src={url}
        alt={alt}
        className="w-full max-h-56 object-cover"
      />
    </div>
  );
};

interface MediaPickerBoxProps {
  pendingFile: File | null;
  existingBlobKey?: string;
  existingMediaType?: 'image' | 'video';
  removedExisting?: boolean;
  onSelectFile: (file: File | null) => void;
  onRemoveExisting?: () => void;
  label?: string;
}

export const MediaPickerBox: React.FC<MediaPickerBoxProps> = ({
  pendingFile,
  existingBlobKey,
  existingMediaType,
  removedExisting,
  onSelectFile,
  onRemoveExisting,
  label = 'Image ou vidéo associée (optionnel)',
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<'image' | 'video'>('image');

  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPreviewUrl(url);
    setPreviewType(pendingFile.type.startsWith('video/') ? 'video' : 'image');
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [pendingFile]);

  const showExisting = !pendingFile && !!existingBlobKey && !removedExisting;

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
        {label}
      </label>

      {previewUrl ? (
        <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black/95">
          {previewType === 'video' ? (
            <video src={previewUrl} controls playsInline className="w-full max-h-48 object-contain" />
          ) : (
            <img src={previewUrl} alt="Aperçu média" className="w-full max-h-48 object-cover" />
          )}
          <button
            type="button"
            onClick={() => onSelectFile(null)}
            className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold flex items-center gap-1 shadow-sm"
          >
            <Trash2 className="w-3 h-3" />
            <span>Retirer</span>
          </button>
        </div>
      ) : showExisting ? (
        <div className="relative">
          <StoredMediaViewer mediaBlobKey={existingBlobKey} mediaType={existingMediaType} />
          {onRemoveExisting && (
            <button
              type="button"
              onClick={onRemoveExisting}
              className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 hover:underline"
            >
              <Trash2 className="w-3 h-3" />
              <span>Retirer le média existant</span>
            </button>
          )}
        </div>
      ) : null}

      <label className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:border-blue-500 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer transition">
        <ImageIcon className="w-4 h-4 text-blue-600" />
        <Video className="w-4 h-4 text-emerald-600" />
        <Upload className="w-3.5 h-3.5 text-slate-400" />
        <span>{previewUrl || showExisting ? 'Remplacer par une image ou vidéo' : 'Ajouter une image ou vidéo'}</span>
        <input
          type="file"
          accept="image/*,video/*"
          onChange={(e) => {
            const file = e.target.files?.[0] || null;
            if (file) onSelectFile(file);
            e.target.value = '';
          }}
          className="hidden"
        />
      </label>
    </div>
  );
};
