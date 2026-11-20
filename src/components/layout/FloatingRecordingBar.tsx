import React, { useState } from 'react';
import { Mic, Video, Pause, Play, Square, Maximize2 } from 'lucide-react';
import { useGlobalRecording } from '../../contexts/RecordingContext';

interface FloatingRecordingBarProps {
  activeTab: string;
  onReturnToParole: () => void;
}

export const FloatingRecordingBar: React.FC<FloatingRecordingBarProps> = ({
  activeTab,
  onReturnToParole,
}) => {
  const {
    recorderState,
    isRecordingModalOpen,
    setIsRecordingModalOpen,
    pauseOrResume,
    stopRecording,
    appWasBackgrounded,
  } = useGlobalRecording();
  const [isStopping, setIsStopping] = useState(false);

  // Show the floating shortcut indicator whenever recording is active AND either:
  // - the recording modal is minimized/closed, OR
  // - the user navigated away from the 'parole' tab, OR
  // - the user returned after leaving the app
  const shouldShow =
    recorderState.isRecording &&
    (!isRecordingModalOpen || activeTab !== 'parole' || appWasBackgrounded);

  if (!shouldShow) return null;

  const mins = Math.floor(recorderState.durationSeconds / 60);
  const secs = recorderState.durationSeconds % 60;
  const formattedTime = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  const handleQuickStop = async () => {
    if (isStopping) return;
    setIsStopping(true);
    try {
      await stopRecording();
      onReturnToParole();
      setIsRecordingModalOpen(true);
    } finally {
      setIsStopping(false);
    }
  };

  const handleOpenRecorder = () => {
    onReturnToParole();
    setIsRecordingModalOpen(true);
  };

  return (
    <div
      role="region"
      aria-label="Enregistrement en cours"
      className="fixed bottom-16 lg:bottom-5 right-3 left-3 sm:left-auto sm:right-5 z-50 sm:w-auto max-w-md mx-auto"
    >
      <div className="px-3.5 py-2.5 rounded-2xl bg-[#0b1f42] text-white border border-red-500/60 shadow-2xl flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleOpenRecorder}
          className="flex items-center gap-2.5 min-w-0 text-left"
        >
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-bold leading-none">
              {recorderState.mode === 'video' ? (
                <Video className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              ) : (
                <Mic className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              )}
              <span className="truncate">
                {recorderState.isPaused ? 'En pause' : 'Enregistrement'}
              </span>
              <span className="font-mono tabular-nums text-red-300">{formattedTime}</span>
            </div>
            <span className="text-[10px] text-blue-200 block truncate mt-0.5">
              Touchez pour revenir ou arrêter et sauvegarder
            </span>
          </div>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={pauseOrResume}
            className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center transition"
            title={recorderState.isPaused ? 'Reprendre' : 'Mettre en pause'}
          >
            {recorderState.isPaused ? (
              <Play className="w-3.5 h-3.5 fill-current" />
            ) : (
              <Pause className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={handleQuickStop}
            disabled={isStopping}
            className="px-2.5 h-8 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-[11px] font-bold flex items-center gap-1 transition"
            title="Arrêter et retrouver l'enregistrement"
          >
            <Square className="w-3 h-3 fill-current" />
            <span>Arrêter</span>
          </button>

          <button
            type="button"
            onClick={handleOpenRecorder}
            className="w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-500 flex items-center justify-center transition"
            title="Ouvrir Parole Divine"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
