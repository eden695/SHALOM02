import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  Video,
  Play,
  Pause,
  Square,
  Volume2,
  Trash2,
  Search,
  User,
  Layers,
  HardDrive,
  Upload,
  Download,
  AlertCircle,
  CheckCircle2,
  Plus,
  SwitchCamera,
  Camera,
  X,
  Image as ImageIcon,
  CheckSquare,
  Square as CheckboxEmpty,
  Minimize2,
  Share2,
} from 'lucide-react';
import { MediaRecordingManager } from '../../services/audioVideoRecorder';
import { useGlobalRecording } from '../../contexts/RecordingContext';
import { dbService, STORES } from '../../services/db';
import { useShalomDB } from '../../hooks/useShalomDB';
import { RecordedParole, ParoleType, ActivityGenre } from '../../types';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { SocialShareModal } from '../common/SocialShareModal';
import { SharePayload, normalizeMediaToShareFile } from '../../services/socialShare';

export const ParoleModule: React.FC = () => {
  const { recordings, reloadData } = useShalomDB();
  const {
    recorderState,
    captureMethod,
    setCaptureMethod,
    facingMode,
    setFacingMode,
    isRecordingModalOpen,
    setIsRecordingModalOpen,
    finishedRecording,
    setFinishedRecording,
    startAudio,
    startVideo,
    pauseOrResume,
    switchCamera,
    capturePhotoFromVideo,
    acquirePhotoStream,
    stopRecording,
    cancelRecording,
  } = useGlobalRecording();

  const [activeFilterType, setActiveFilterType] = useState<string>('all');
  const [selectedActivity, setSelectedActivity] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [isSwitchingCamera, setIsSwitchingCamera] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState<{
    title: string;
    type: ParoleType;
    speaker: string;
    moderator: string;
    activityGenre: ActivityGenre;
    bibleVerse: string;
    notes: string;
  }>({
    title: '',
    type: 'predication',
    speaker: '',
    moderator: '',
    activityGenre: 'culte_dominical',
    bibleVerse: '',
    notes: '',
  });

  // Playback modal
  const [playingParole, setPlayingParole] = useState<RecordedParole | null>(null);
  const [playingBlobUrl, setPlayingBlobUrl] = useState<string | null>(null);
  const [playingPhotoUrls, setPlayingPhotoUrls] = useState<string[]>([]);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  // Share modal
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);

  // Live photos captured while recording a Parole
  const [capturedPhotos, setCapturedPhotos] = useState<Array<{ blob: Blob; previewUrl: string }>>([]);
  const [photoFlashNotice, setPhotoFlashNotice] = useState<string | null>(null);
  const [isAudioPhotoCamOpen, setIsAudioPhotoCamOpen] = useState(false);
  const [audioPhotoCamFacing, setAudioPhotoCamFacing] = useState<'user' | 'environment'>('environment');
  const audioPhotoVideoRef = useRef<HTMLVideoElement | null>(null);
  const audioPhotoStreamRef = useRef<MediaStream | null>(null);

  // Delete & Bulk Selection modals
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedParoleIds, setSelectedParoleIds] = useState<string[]>([]);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);

  const [storageInfo, setStorageInfo] = useState<{ usageMB: number; quotaMB: number; persisted?: boolean }>({
    usageMB: 0,
    quotaMB: 0,
    persisted: false,
  });

  const formatQuota = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} Go` : `${mb} Mo`);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    dbService.getStorageEstimate().then((info) => {
      setStorageInfo({ usageMB: info.usageMB, quotaMB: info.quotaMB, persisted: info.persisted });
    });
  }, []);

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const stopAudioPhotoCam = () => {
    if (audioPhotoStreamRef.current) {
      audioPhotoStreamRef.current.getTracks().forEach((t) => t.stop());
      audioPhotoStreamRef.current = null;
    }
    if (audioPhotoVideoRef.current) {
      audioPhotoVideoRef.current.srcObject = null;
    }
    setIsAudioPhotoCamOpen(false);
  };

  const resetFormAndPreview = () => {
    stopAudioPhotoCam();
    if (finishedRecording?.previewUrl) {
      URL.revokeObjectURL(finishedRecording.previewUrl);
    }
    setCapturedPhotos((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return [];
    });
    setPhotoFlashNotice(null);
    setFinishedRecording(null);
    setSaveError(null);
    setFormData({
      title: '',
      type: 'predication',
      speaker: '',
      moderator: '',
      activityGenre: 'culte_dominical',
      bibleVerse: '',
      notes: '',
    });
  };

  const handleStartRecording = async () => {
    setSaveError(null);
    try {
      if (finishedRecording?.previewUrl) {
        URL.revokeObjectURL(finishedRecording.previewUrl);
        setFinishedRecording(null);
      }

      if (captureMethod === 'mic') {
        await startAudio();
      } else if (captureMethod === 'video') {
        await startVideo(videoPreviewRef.current, facingMode);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Impossible d'accéder au microphone/caméra.";
      setSaveError(msg);
    }
  };

  const handleSwitchCamera = async () => {
    if (isSwitchingCamera) return;
    setSaveError(null);
    if (!recorderState.isRecording) {
      setFacingMode(facingMode === 'user' ? 'environment' : 'user');
      return;
    }
    setIsSwitchingCamera(true);
    try {
      await switchCamera();
    } catch (err: unknown) {
      setSaveError(
        err instanceof Error ? err.message : 'Impossible de changer de caméra sur cet appareil.'
      );
    } finally {
      setIsSwitchingCamera(false);
    }
  };

  const showPhotoCapturedFeedback = () => {
    setPhotoFlashNotice('Photo enregistrée !');
    setTimeout(() => setPhotoFlashNotice(null), 1600);
  };

  const handleOpenAudioPhotoCam = async (facing: 'user' | 'environment' = audioPhotoCamFacing) => {
    setSaveError(null);
    try {
      if (audioPhotoStreamRef.current) {
        audioPhotoStreamRef.current.getTracks().forEach((t) => t.stop());
        audioPhotoStreamRef.current = null;
      }
      const stream = await acquirePhotoStream(facing);
      audioPhotoStreamRef.current = stream;
      setIsAudioPhotoCamOpen(true);
      setTimeout(() => {
        if (audioPhotoVideoRef.current) {
          audioPhotoVideoRef.current.srcObject = stream;
          audioPhotoVideoRef.current.muted = true;
          audioPhotoVideoRef.current.play().catch(() => {});
        }
      }, 60);
    } catch {
      setSaveError("Impossible d'ouvrir l'appareil photo pendant cet enregistrement.");
    }
  };

  const handleCapturePhotoDuringRecording = async () => {
    setSaveError(null);
    if (captureMethod === 'video' && recorderState.isRecording) {
      const blob = await capturePhotoFromVideo();
      if (blob && blob.size > 0) {
        const previewUrl = URL.createObjectURL(blob);
        setCapturedPhotos((prev) => [...prev, { blob, previewUrl }]);
        showPhotoCapturedFeedback();
      } else {
        setSaveError('Caméra en cours de chargement, réessayez dans une seconde.');
      }
      return;
    }

    if (isAudioPhotoCamOpen) {
      const blob = await MediaRecordingManager.capturePhotoFromVideoElement(audioPhotoVideoRef.current);
      if (blob && blob.size > 0) {
        const previewUrl = URL.createObjectURL(blob);
        setCapturedPhotos((prev) => [...prev, { blob, previewUrl }]);
        showPhotoCapturedFeedback();
      }
      return;
    }

    await handleOpenAudioPhotoCam(audioPhotoCamFacing);
  };

  const handleImportPhotoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const added: Array<{ blob: Blob; previewUrl: string }> = [];
    Array.from(files).forEach((f) => {
      if (f.type.startsWith('image/')) {
        added.push({ blob: f, previewUrl: URL.createObjectURL(f) });
      }
    });
    if (added.length > 0) {
      setCapturedPhotos((prev) => [...prev, ...added]);
      showPhotoCapturedFeedback();
    }
    e.target.value = '';
  };

  const handleRemoveCapturedPhoto = (idx: number) => {
    setCapturedPhotos((prev) => {
      const target = prev[idx];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleStopRecording = async () => {
    try {
      const result = await stopRecording();
      if (!result) {
        setSaveError(
          "L'enregistrement est vide (0 octet). Vérifiez que le microphone n'est pas coupé et autorisez l'accès."
        );
      }
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Erreur à l'arrêt de l'enregistrement.");
    }
  };

  const handleImportMediaFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaveError(null);

    if (finishedRecording?.previewUrl) {
      URL.revokeObjectURL(finishedRecording.previewUrl);
    }

    const mediaType: 'audio' | 'video' = file.type.startsWith('video/') ? 'video' : 'audio';
    const previewUrl = URL.createObjectURL(file);

    const mediaEl = document.createElement(mediaType);
    mediaEl.preload = 'metadata';
    mediaEl.src = previewUrl;
    mediaEl.onloadedmetadata = () => {
      const duration = isFinite(mediaEl.duration) ? Math.round(mediaEl.duration) : 60;
      setFinishedRecording({
        blob: file,
        mimeType: file.type || (mediaType === 'video' ? 'video/mp4' : 'audio/mpeg'),
        duration,
        mediaType,
        previewUrl,
      });
    };
    mediaEl.onerror = () => {
      setFinishedRecording({
        blob: file,
        mimeType: file.type || (mediaType === 'video' ? 'video/mp4' : 'audio/mpeg'),
        duration: 60,
        mediaType,
        previewUrl,
      });
    };
  };

  const handleCloseOrMinimizeModal = () => {
    if (recorderState.isRecording) {
      // Minimize modal while keeping recording alive! FloatingRecordingBar appears automatically.
      setIsRecordingModalOpen(false);
      return;
    }
    resetFormAndPreview();
    setIsRecordingModalOpen(false);
  };

  const handleCancelRecording = () => {
    cancelRecording();
    resetFormAndPreview();
    setIsRecordingModalOpen(false);
  };

  const handleSaveParole = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    if (!formData.title.trim() || !formData.speaker.trim()) {
      setSaveError('Veuillez renseigner le titre et le prédicateur.');
      return;
    }

    setIsSaving(true);
    try {
      let finalResult = finishedRecording;

      if (recorderState.isRecording) {
        finalResult = await stopRecording();
      }

      if (!finalResult || !finalResult.blob || finalResult.blob.size === 0) {
        setSaveError(
          'Veuillez enregistrer ou importer un fichier audio/vidéo avant de sauvegarder la parole.'
        );
        setIsSaving(false);
        return;
      }

      const id = `parole_${Date.now()}`;
      const blobKey = `blob_${id}`;
      await dbService.saveMediaBlob(blobKey, finalResult.blob, finalResult.mimeType);

      const photoBlobKeys: string[] = [];
      for (let i = 0; i < capturedPhotos.length; i++) {
        const p = capturedPhotos[i];
        const pKey = `photo_${id}_${i}`;
        await dbService.saveMediaBlob(pKey, p.blob, p.blob.type || 'image/jpeg');
        photoBlobKeys.push(pKey);
      }

      const sizeKB = finalResult.blob.size / 1024;
      const sizeFormatted =
        sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(sizeKB))} Ko`;

      const newParole: RecordedParole = {
        id,
        title: formData.title.trim(),
        type: formData.type,
        speaker: formData.speaker.trim(),
        moderator: formData.moderator.trim() || undefined,
        activityGenre: formData.activityGenre,
        bibleVerse: formData.bibleVerse.trim() || undefined,
        notes: formData.notes.trim() || undefined,
        date: new Date().toISOString().split('T')[0],
        durationSeconds: finalResult.duration,
        mediaType: finalResult.mediaType,
        mimeType: finalResult.mimeType,
        blobKey,
        photoBlobKeys: photoBlobKeys.length > 0 ? photoBlobKeys : undefined,
        fileSizeFormatted: sizeFormatted,
        createdAt: new Date().toISOString(),
      };

      await dbService.put(STORES.RECORDINGS, newParole);
      const info = await dbService.getStorageEstimate();
      setStorageInfo({ usageMB: info.usageMB, quotaMB: info.quotaMB, persisted: info.persisted });

      resetFormAndPreview();
      setIsRecordingModalOpen(false);
      await reloadData();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePlayParole = async (parole: RecordedParole) => {
    setPlaybackError(null);
    if (playingBlobUrl) {
      URL.revokeObjectURL(playingBlobUrl);
      setPlayingBlobUrl(null);
    }
    setPlayingPhotoUrls((prev) => {
      prev.forEach((u) => URL.revokeObjectURL(u));
      return [];
    });
    setPlayingParole(parole);

    if (parole.photoBlobKeys && parole.photoBlobKeys.length > 0) {
      const urls: string[] = [];
      for (const pKey of parole.photoBlobKeys) {
        try {
          const pBlob = await dbService.getMediaBlob(pKey);
          if (pBlob && pBlob.size > 0) {
            urls.push(URL.createObjectURL(pBlob));
          }
        } catch {
          // ignore
        }
      }
      setPlayingPhotoUrls(urls);
    }

    if (!parole.blobKey) {
      setPlaybackError('Aucun fichier audio ou vidéo associé à cette fiche.');
      return;
    }

    try {
      const blob = await dbService.getMediaBlob(parole.blobKey);
      if (!blob || blob.size === 0) {
        setPlaybackError("Le fichier média n'a pas été trouvé dans le stockage local.");
        return;
      }
      const typedBlob = blob.type ? blob : new Blob([blob], { type: parole.mimeType || 'audio/webm' });
      const url = URL.createObjectURL(typedBlob);
      setPlayingBlobUrl(url);
    } catch {
      setPlaybackError('Erreur lors du chargement du fichier média.');
    }
  };

  const handleShareParole = async (parole: RecordedParole) => {
    const text = `🎙️ *PAROLE DIVINE — SHALOM*\n\n*${parole.title}*\nPar ${parole.speaker} (${parole.date})${
      parole.bibleVerse ? `\n📖 ${parole.bibleVerse}` : ''
    }${parole.notes ? `\n\n${parole.notes}` : ''}`;

    let file: File | undefined;
    if (parole.blobKey) {
      const blob = await dbService.getMediaBlob(parole.blobKey);
      if (blob && blob.size > 0) {
        file = await normalizeMediaToShareFile(
          blob,
          parole.title,
          parole.mediaType,
          parole.mimeType
        );
      }
    }

    setSharePayload({
      title: parole.title,
      text,
      file,
    });
  };

  const handleDownloadParole = () => {
    if (!playingBlobUrl || !playingParole) return;
    const ext = playingParole.mimeType.includes('mp4') ? 'mp4' : 'webm';
    const a = document.createElement('a');
    a.href = playingBlobUrl;
    a.download = `${playingParole.title.replace(/[^a-z0-9]/gi, '_')}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleConfirmDelete = async () => {
    if (!deletingId) return;
    const item = recordings.find((r) => r.id === deletingId);
    const blobsToDelete: string[] = [];
    if (item?.blobKey) blobsToDelete.push(item.blobKey);
    if (item?.photoBlobKeys) blobsToDelete.push(...item.photoBlobKeys);
    if (blobsToDelete.length > 0) {
      await dbService.deleteItems(STORES.MEDIA_BLOBS, blobsToDelete);
    }
    await dbService.deleteItem(STORES.RECORDINGS, deletingId);
    setSelectedParoleIds((prev) => prev.filter((id) => id !== deletingId));
    setDeletingId(null);
    if (playingParole?.id === deletingId) {
      setPlayingParole(null);
    }
    const info = await dbService.getStorageEstimate();
    setStorageInfo({ usageMB: info.usageMB, quotaMB: info.quotaMB, persisted: info.persisted });
    reloadData();
  };

  const handleToggleSelectParole = (id: string) => {
    setSelectedParoleIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleToggleAllFilteredParoles = () => {
    const ids = filteredRecordings.map((r) => r.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedParoleIds.includes(id));
    setSelectedParoleIds(allSelected ? [] : ids);
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedParoleIds.length === 0) return;
    const blobsToDelete: string[] = [];
    recordings.forEach((r) => {
      if (selectedParoleIds.includes(r.id)) {
        if (r.blobKey) blobsToDelete.push(r.blobKey);
        if (r.photoBlobKeys) blobsToDelete.push(...r.photoBlobKeys);
      }
    });
    if (blobsToDelete.length > 0) {
      await dbService.deleteItems(STORES.MEDIA_BLOBS, blobsToDelete);
    }
    await dbService.deleteItems(STORES.RECORDINGS, selectedParoleIds);
    if (playingParole && selectedParoleIds.includes(playingParole.id)) {
      setPlayingParole(null);
    }
    setSelectedParoleIds([]);
    setIsBulkDeleteOpen(false);
    const info = await dbService.getStorageEstimate();
    setStorageInfo({ usageMB: info.usageMB, quotaMB: info.quotaMB, persisted: info.persisted });
    reloadData();
  };

  const ACTIVITY_GENRES: { id: ActivityGenre; label: string }[] = [
    { id: 'culte_dominical', label: 'Culte Dominical' },
    { id: 'culte_enseignement', label: 'Culte d’Enseignement' },
    { id: 'reunion_priere', label: 'Réunion de Prière' },
    { id: 'seminaire', label: 'Séminaire' },
    { id: 'veillee', label: 'Veillée de Prière' },
    { id: 'convention', label: 'Convention' },
    { id: 'conference', label: 'Conférence' },
    { id: 'formation', label: 'Formation des Disciples' },
    { id: 'reunion_speciale', label: 'Réunion Spéciale' },
    { id: 'autre', label: 'Autre' },
  ];

  const filteredRecordings = recordings.filter((r) => {
    const matchesSearch =
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.speaker.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.bibleVerse && r.bibleVerse.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesType = activeFilterType === 'all' || r.type === activeFilterType;
    const matchesActivity = selectedActivity === 'all' || r.activityGenre === selectedActivity;
    return matchesSearch && matchesType && matchesActivity;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight font-display">
            Parole Divine & Enregistrements
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Enregistrez, écoutez et archivez vos prédications, exhortations et enseignements hors-ligne
          </p>
        </div>

        {(recordings.length > 0 || recorderState.isRecording || !!finishedRecording) && (
          <button
            type="button"
            onClick={() => {
              if (!recorderState.isRecording && !finishedRecording) {
                resetFormAndPreview();
              }
              setIsRecordingModalOpen(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs active:scale-[0.98] transition self-start sm:self-auto"
          >
            {recorderState.isRecording ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-red-400 animate-pulse" />
                <span>Reprendre la capture ({formatSeconds(recorderState.durationSeconds)})</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>Nouvelle Parole</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Storage bar & Filters shown only when recordings exist */}
      {recordings.length > 0 && (
        <>
          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>
                Stockage local utilisé : <strong className="tabular-nums">{storageInfo.usageMB} Mo</strong> · Capacité disponible : <strong className="tabular-nums">{formatQuota(storageInfo.quotaMB)}</strong>
              </span>
            </div>
            <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
              Capture continue avec indicateur flottant actif
            </span>
          </div>

          <div className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center justify-between">
            <div className="flex flex-1 gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Rechercher par thème, prédicateur, verset..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white dark:bg-[#0c1631] border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                />
              </div>

              <select
                value={selectedActivity}
                onChange={(e) => setSelectedActivity(e.target.value)}
                className="text-xs px-3 py-2 rounded-xl bg-white dark:bg-[#0c1631] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200"
              >
                <option value="all">Toutes activités</option>
                {ACTIVITY_GENRES.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 self-start sm:self-auto">
              {[
                { id: 'all', label: 'Tout' },
                { id: 'predication', label: 'Prédications' },
                { id: 'enseignement', label: 'Enseignements' },
                { id: 'exhortation', label: 'Exhortations' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveFilterType(item.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                    activeFilterType === item.id
                      ? 'bg-white dark:bg-[#0f2b5c] text-blue-700 dark:text-blue-200 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Bulk Selection Bar */}
      {filteredRecordings.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <button
            type="button"
            onClick={handleToggleAllFilteredParoles}
            className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 hover:text-blue-700"
          >
            {selectedParoleIds.length === filteredRecordings.length && filteredRecordings.length > 0 ? (
              <CheckSquare className="w-4 h-4 text-blue-600" />
            ) : (
              <CheckboxEmpty className="w-4 h-4 text-slate-400" />
            )}
            <span>Tout sélectionner ({selectedParoleIds.length})</span>
          </button>

          {selectedParoleIds.length > 0 && (
            <button
              type="button"
              onClick={() => setIsBulkDeleteOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Supprimer la sélection ({selectedParoleIds.length})</span>
            </button>
          )}
        </div>
      )}

      {/* Recordings List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredRecordings.map((parole) => {
          const activityObj = ACTIVITY_GENRES.find((a) => a.id === parole.activityGenre);
          const isSelected = selectedParoleIds.includes(parole.id);

          return (
            <div
              key={parole.id}
              className={`p-5 rounded-2xl bg-white dark:bg-[#0c1631] border flex flex-col justify-between space-y-4 transition ${
                isSelected
                  ? 'border-blue-600 ring-2 ring-blue-600/20'
                  : 'border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleSelectParole(parole.id)}
                      aria-label="Sélectionner cet enregistrement"
                      className="text-slate-400 hover:text-blue-600"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <CheckboxEmpty className="w-4 h-4" />
                      )}
                    </button>
                    <span className="font-semibold text-blue-700 dark:text-blue-400 capitalize">
                      {parole.type} · {parole.mediaType === 'video' ? 'Vidéo' : 'Audio'}
                    </span>
                  </div>
                  <span className="tabular-nums">{parole.date}</span>
                </div>

                <h3 className="text-base font-bold text-slate-900 dark:text-white line-clamp-2">
                  {parole.title}
                </h3>

                <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>{parole.speaker}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-slate-400" />
                    <span>{activityObj?.label || 'Culte'}</span>
                  </div>
                  {parole.bibleVerse && (
                    <p className="text-xs text-amber-700 dark:text-amber-400 font-serif italic">
                      {parole.bibleVerse}
                    </p>
                  )}
                  {parole.photoBlobKeys && parole.photoBlobKeys.length > 0 && (
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>
                        {parole.photoBlobKeys.length} photo{parole.photoBlobKeys.length > 1 ? 's' : ''} jointe{parole.photoBlobKeys.length > 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                  {parole.notes && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 pt-1">
                      {parole.notes}
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePlayParole(parole)}
                    className="px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{parole.mediaType === 'video' ? 'Lire vidéo' : 'Écouter'}</span>
                  </button>
                  <span className="text-xs text-slate-500 tabular-nums">
                    {formatSeconds(parole.durationSeconds)}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleShareParole(parole)}
                    aria-label="Partager"
                    className="p-2 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition"
                  >
                    <Share2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingId(parole.id)}
                    aria-label="Supprimer"
                    className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filteredRecordings.length === 0 && (
          <div className="col-span-full py-14 px-6 text-center rounded-2xl bg-white dark:bg-[#0c1631] border border-dashed border-slate-300 dark:border-slate-800 space-y-3">
            <Mic className="w-10 h-10 text-blue-600 dark:text-blue-400 mx-auto" />
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Aucune parole enregistrée pour le moment
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              Enregistrez votre première prédication audio, vidéo ou importez un fichier depuis votre téléphone.
            </p>
            <button
              type="button"
              onClick={() => {
                if (!recorderState.isRecording && !finishedRecording) {
                  resetFormAndPreview();
                }
                setIsRecordingModalOpen(true);
              }}
              className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Enregistrer ma première Parole</span>
            </button>
          </div>
        )}
      </div>

      {/* Modal: New Parole */}
      <Modal
        isOpen={isRecordingModalOpen}
        onClose={handleCloseOrMinimizeModal}
        title="Nouvelle Parole Divine"
        subtitle="Capture audio/vidéo directe ou importation de fichier média"
        maxWidth="xl"
      >
        <div className="space-y-4">
          {!recorderState.isRecording && (
            <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setCaptureMethod('mic')}
                className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition ${
                  captureMethod === 'mic'
                    ? 'bg-white dark:bg-[#0f2b5c] text-blue-700 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Audio Micro</span>
              </button>
              <button
                type="button"
                onClick={() => setCaptureMethod('video')}
                className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition ${
                  captureMethod === 'video'
                    ? 'bg-white dark:bg-[#0f2b5c] text-blue-700 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Video className="w-3.5 h-3.5" />
                <span>Vidéo Caméra</span>
              </button>
              <button
                type="button"
                onClick={() => setCaptureMethod('import')}
                className={`py-2 text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 transition ${
                  captureMethod === 'import'
                    ? 'bg-white dark:bg-[#0f2b5c] text-blue-700 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Importer Fichier</span>
              </button>
            </div>
          )}

          {/* Capture Studio Panel */}
          <div className="p-5 rounded-2xl bg-[#0b1736] text-white flex flex-col items-center justify-center min-h-[190px] relative overflow-hidden">
            {captureMethod === 'video' && (
              <div className={`relative w-full mb-3 ${recorderState.isRecording ? 'block' : 'hidden'}`}>
                <video
                  ref={videoPreviewRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full min-h-[280px] max-h-[68vh] object-cover rounded-xl bg-black"
                />
                {recorderState.isRecording && (
                  <button
                    type="button"
                    onClick={handleSwitchCamera}
                    disabled={isSwitchingCamera}
                    className="absolute top-2.5 right-2.5 px-3 py-1.5 rounded-full bg-slate-950/75 hover:bg-slate-900 backdrop-blur-xs border border-white/20 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-md transition disabled:opacity-50"
                  >
                    <SwitchCamera className="w-3.5 h-3.5 text-amber-300" />
                    <span>
                      {isSwitchingCamera
                        ? 'Basculement...'
                        : facingMode === 'user'
                        ? 'Caméra avant · Basculer'
                        : 'Caméra arrière · Basculer'}
                    </span>
                  </button>
                )}
              </div>
            )}

            {recorderState.isRecording ? (
              <div className="space-y-3 text-center w-full max-w-xs">
                <div className="flex items-center justify-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-xs font-bold tracking-wide text-red-300">
                    {recorderState.isPaused ? 'En pause' : 'Capture en cours...'}
                  </span>
                </div>

                <div className="text-4xl font-extrabold tabular-nums font-mono">
                  {formatSeconds(recorderState.durationSeconds)}
                </div>

                {/* Real-time Audio Level Meter */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-blue-200">
                    <span>Signal Microphone</span>
                    <span className="tabular-nums">{recorderState.audioLevel}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 transition-all duration-75 rounded-full"
                      style={{ width: `${Math.max(4, recorderState.audioLevel)}%` }}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={pauseOrResume}
                    className="p-2.5 rounded-full bg-slate-800 hover:bg-slate-700 text-white transition"
                    title={recorderState.isPaused ? 'Reprendre' : 'Pause'}
                  >
                    {recorderState.isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  </button>

                  <button
                    type="button"
                    onClick={handleCapturePhotoDuringRecording}
                    className="px-3.5 py-2.5 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow-xs"
                  >
                    <Camera className="w-4 h-4" />
                    <span>{captureMethod === 'mic' && isAudioPhotoCamOpen ? 'Capturer photo' : 'Prendre photo'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleStopRecording}
                    className="px-4 py-2.5 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold text-xs flex items-center gap-1.5 transition"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Terminer</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsRecordingModalOpen(false)}
                  className="inline-flex items-center gap-1.5 text-[11px] text-blue-200 hover:text-white pt-1 underline"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>Réduire et continuer l’enregistrement</span>
                </button>

                {photoFlashNotice && (
                  <div className="text-[11px] font-bold text-emerald-300 animate-pulse">
                    {photoFlashNotice}
                  </div>
                )}

                {captureMethod === 'mic' && isAudioPhotoCamOpen && (
                  <div className="mt-3 p-2 rounded-xl bg-slate-900/90 border border-white/15 space-y-2">
                    <div className="relative">
                      <video
                        ref={audioPhotoVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full max-h-44 object-cover rounded-lg bg-black"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const next = audioPhotoCamFacing === 'user' ? 'environment' : 'user';
                          setAudioPhotoCamFacing(next);
                          handleOpenAudioPhotoCam(next);
                        }}
                        className="absolute top-2 right-2 px-2.5 py-1 rounded-full bg-slate-950/75 text-white text-[10px] font-bold flex items-center gap-1 border border-white/20"
                      >
                        <SwitchCamera className="w-3 h-3 text-amber-300" />
                        <span>{audioPhotoCamFacing === 'user' ? 'Avant' : 'Arrière'}</span>
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={stopAudioPhotoCam}
                      className="text-[11px] text-slate-300 hover:text-white underline"
                    >
                      Masquer la caméra photo
                    </button>
                  </div>
                )}
              </div>
            ) : finishedRecording ? (
              <div className="space-y-3 text-center w-full max-w-md">
                <div className="flex items-center justify-center gap-2 text-emerald-400 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Média prêt ({formatSeconds(finishedRecording.duration)} ·{' '}
                    {(finishedRecording.blob.size / 1024).toFixed(0)} Ko)
                  </span>
                </div>

                {finishedRecording.mediaType === 'video' ? (
                  <video
                    src={finishedRecording.previewUrl}
                    controls
                    playsInline
                    className="w-full rounded-xl max-h-[58vh] object-contain bg-black"
                  />
                ) : (
                  <audio src={finishedRecording.previewUrl} controls className="w-full" />
                )}

                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(finishedRecording.previewUrl);
                    setFinishedRecording(null);
                  }}
                  className="text-xs text-slate-300 hover:text-white underline"
                >
                  Recommencer ou remplacer le média
                </button>
              </div>
            ) : captureMethod === 'import' ? (
              <div className="space-y-3 text-center">
                <Upload className="w-8 h-8 text-blue-300 mx-auto" />
                <p className="text-xs text-slate-300 max-w-xs">
                  Sélectionnez un enregistrement audio (.mp3, .m4a, .wav, .webm) ou vidéo (.mp4, .webm) déjà présent sur votre téléphone.
                </p>
                <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold cursor-pointer transition">
                  <Upload className="w-4 h-4" />
                  <span>Choisir un fichier</span>
                  <input
                    type="file"
                    accept="audio/*,video/*"
                    onChange={handleImportMediaFile}
                    className="hidden"
                  />
                </label>
              </div>
            ) : (
              <div className="space-y-3 text-center">
                <div className="w-12 h-12 rounded-full bg-blue-600/30 text-blue-300 flex items-center justify-center mx-auto">
                  {captureMethod === 'mic' ? <Mic className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                </div>
                {captureMethod === 'video' && (
                  <div className="flex items-center justify-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setFacingMode('user')}
                      className={`px-2.5 py-1 rounded-lg ${facingMode === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}
                    >
                      Caméra avant
                    </button>
                    <button
                      type="button"
                      onClick={() => setFacingMode('environment')}
                      className={`px-2.5 py-1 rounded-lg ${facingMode === 'environment' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}
                    >
                      Caméra arrière
                    </button>
                  </div>
                )}
                <p className="text-xs text-slate-300 max-w-xs">
                  Accordez l’accès au microphone pour capter clairement la voix du prédicateur.
                </p>
                <button
                  type="button"
                  onClick={handleStartRecording}
                  className="px-6 py-2.5 rounded-full bg-red-600 hover:bg-red-500 text-white font-bold text-xs inline-flex items-center gap-2 transition"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-white" />
                  <span>Démarrer l’enregistrement</span>
                </button>
              </div>
            )}
          </div>

          {/* Captured Photos Strip */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-amber-500" />
                <span>Photos associées ({capturedPhotos.length})</span>
              </span>

              <label className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-blue-700 dark:text-blue-400 cursor-pointer flex items-center gap-1">
                <ImageIcon className="w-3 h-3" />
                <span>Ajouter une image</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImportPhotoFile}
                  className="hidden"
                />
              </label>
            </div>

            {capturedPhotos.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {capturedPhotos.map((photo, idx) => (
                  <div key={photo.previewUrl} className="relative group rounded-lg overflow-hidden aspect-square bg-black border border-slate-200 dark:border-slate-700">
                    <img
                      src={photo.previewUrl}
                      alt={`Capture ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveCapturedPhoto(idx)}
                      aria-label="Retirer cette photo"
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center shadow-sm"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Pendant l’enregistrement audio ou vidéo, cliquez sur « Prendre photo » à tout moment pour capturer l’instant.
              </p>
            )}
          </div>

          {saveError && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{saveError}</span>
            </div>
          )}

          {/* Metadata Form */}
          <form onSubmit={handleSaveParole} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Titre / Thème de la parole *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: La paix qui surpasse toute intelligence..."
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Type *
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as ParoleType })}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="predication">Prédication</option>
                  <option value="enseignement">Enseignement</option>
                  <option value="exhortation">Exhortation</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Prédicateur / Enseignant *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Pasteur David..."
                  value={formData.speaker}
                  onChange={(e) => setFormData({ ...formData, speaker: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Modérateur
                </label>
                <input
                  type="text"
                  placeholder="Ex: Frère Thomas..."
                  value={formData.moderator}
                  onChange={(e) => setFormData({ ...formData, moderator: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Genre d’activité
                </label>
                <select
                  value={formData.activityGenre}
                  onChange={(e) => setFormData({ ...formData, activityGenre: e.target.value as ActivityGenre })}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                >
                  {ACTIVITY_GENRES.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Référence biblique
                </label>
                <input
                  type="text"
                  placeholder="Ex: Jean 14:27"
                  value={formData.bibleVerse}
                  onChange={(e) => setFormData({ ...formData, bibleVerse: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Notes & Points clés
              </label>
              <textarea
                rows={2}
                placeholder="Résumé du message..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={handleCancelRecording}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50 rounded-xl"
              >
                {isSaving ? 'Enregistrement...' : 'Sauvegarder la Parole'}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Playback Modal */}
      {playingParole && (
        <Modal
          isOpen={!!playingParole}
          onClose={() => {
            setPlayingParole(null);
            if (playingBlobUrl) URL.revokeObjectURL(playingBlobUrl);
            setPlayingBlobUrl(null);
            setPlayingPhotoUrls((prev) => {
              prev.forEach((u) => URL.revokeObjectURL(u));
              return [];
            });
          }}
          title={playingParole.title}
          subtitle={`Par ${playingParole.speaker} · ${playingParole.date}`}
        >
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-[#0b1736] text-white flex flex-col items-center justify-center">
              {playingBlobUrl ? (
                playingParole.mediaType === 'video' ? (
                  <video
                    src={playingBlobUrl}
                    controls
                    autoPlay
                    playsInline
                    className="w-full rounded-xl max-h-[65vh] object-contain bg-black"
                  />
                ) : (
                  <div className="w-full space-y-3">
                    <div className="flex items-center justify-center gap-2 text-blue-300 text-xs">
                      <Volume2 className="w-5 h-5" />
                      <span>Lecture audio haute fidélité</span>
                    </div>
                    <audio src={playingBlobUrl} controls autoPlay className="w-full" />
                  </div>
                )
              ) : (
                <div className="py-6 text-center text-red-300 text-xs space-y-1">
                  <AlertCircle className="w-7 h-7 mx-auto mb-1" />
                  <p>{playbackError || 'Chargement du média...'}</p>
                </div>
              )}
            </div>

            {playingPhotoUrls.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-amber-500" />
                  <span>Photos prises pendant l’enregistrement ({playingPhotoUrls.length})</span>
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {playingPhotoUrls.map((url, idx) => (
                    <div
                      key={url}
                      className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black aspect-video group"
                    >
                      <img src={url} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                      <a
                        href={url}
                        download={`${playingParole.title.replace(/[^a-z0-9]/gi, '_')}_photo_${idx + 1}.jpg`}
                        className="absolute bottom-1.5 right-1.5 px-2 py-1 rounded-lg bg-slate-950/75 text-white text-[10px] font-bold flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        <span>JPG</span>
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
              {playingParole.bibleVerse && (
                <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 text-amber-900 dark:text-amber-200 font-serif italic">
                  {playingParole.bibleVerse}
                </div>
              )}
              {playingParole.notes && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="font-bold block mb-1">Notes :</span>
                  <p className="leading-relaxed whitespace-pre-wrap">{playingParole.notes}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                {playingBlobUrl && (
                  <button
                    type="button"
                    onClick={handleDownloadParole}
                    className="px-3.5 py-2 text-xs font-semibold text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-xl flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Télécharger</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleShareParole(playingParole)}
                  className="px-3.5 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-xl flex items-center gap-1.5"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Partager</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPlayingParole(null);
                  if (playingBlobUrl) URL.revokeObjectURL(playingBlobUrl);
                  setPlayingBlobUrl(null);
                  setPlayingPhotoUrls((prev) => {
                    prev.forEach((u) => URL.revokeObjectURL(u));
                    return [];
                  });
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-xl"
              >
                Fermer
              </button>
            </div>
          </div>
        </Modal>
      )}

      <SocialShareModal
        isOpen={!!sharePayload}
        onClose={() => setSharePayload(null)}
        payload={sharePayload}
      />

      <ConfirmDialog
        isOpen={!!deletingId}
        title="Supprimer cet enregistrement ?"
        message="Cette action supprimera définitivement le fichier audio/vidéo et sa fiche du stockage local."
        confirmLabel="Supprimer définitivement"
        isDestructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingId(null)}
      />

      <ConfirmDialog
        isOpen={isBulkDeleteOpen}
        title="Supprimer les fichiers sélectionnés ?"
        message={`Vous allez supprimer définitivement ${selectedParoleIds.length} enregistrement(s) (audio, vidéo et photos associés) pour libérer de la mémoire.`}
        confirmLabel="Oui, supprimer en masse"
        isDestructive
        onConfirm={handleConfirmBulkDelete}
        onCancel={() => setIsBulkDeleteOpen(false)}
      />
    </div>
  );
};
