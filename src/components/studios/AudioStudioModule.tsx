import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Mic,
  Square,
  Upload,
  Music,
  Scissors,
  Trash2,
  Download,
  Share2,
  Save,
  Loader2,
  CheckCircle2,
  Volume2,
  VolumeX,
  Wand2,
  Play,
  Copy,
  Plus,
  Layers,
  Sliders,
  AlignLeft,
  Archive,
  ArrowLeft,
  Globe,
} from 'lucide-react';
import { Mp3Encoder } from '@breezystack/lamejs';
import { useShalomDB } from '../../hooks/useShalomDB';
import { dbService, STORES } from '../../services/db';
import { useLanguage } from '../../contexts/LanguageContext';
import {
  DownloadedStudioAsset,
  RecordedParole,
  StudioProjectRecord,
  VaultDocument,
} from '../../types';
import { SocialShareModal } from '../common/SocialShareModal';
import { SharePayload } from '../../services/socialShare';
import { StudioHomePanel, StudioTemplateCard } from './StudioHomePanel';
import { OnlineResourceModal } from './OnlineResourceModal';

interface AudioTrack {
  id: string;
  name: string;
  color: string;
  volume: number;
  muted: boolean;
  solo: boolean;
}

interface AudioClipItem {
  id: string;
  trackId: string;
  name: string;
  buffer: AudioBuffer;
  blobKey?: string;
  startTimeSec: number;
  trimStart: number;
  trimEnd: number;
  gain: number;
  pan: number;
  fadeInSec: number;
  fadeOutSec: number;
  playbackRate: number;
  removeSilence: boolean;
}

interface MasterFxSettings {
  bassGainDb: number;
  trebleGainDb: number;
  echoAmount: number;
  normalizeCompressor: boolean;
}

interface SerializedAudioProject {
  version: 1;
  masterGain: number;
  fx: MasterFxSettings;
  tracks: AudioTrack[];
  clips: Array<
    Omit<AudioClipItem, 'buffer'> & {
      blobKey: string;
    }
  >;
}

const DEFAULT_TRACKS: AudioTrack[] = [
  { id: 'track_1', name: 'Piste 1 · Voix', color: '#2563eb', volume: 1.0, muted: false, solo: false },
  { id: 'track_2', name: 'Piste 2 · Musique', color: '#d97706', volume: 0.45, muted: false, solo: false },
  {
    id: 'track_3',
    name: 'Piste 3 · Ambiance / Effets',
    color: '#059669',
    volume: 0.75,
    muted: false,
    solo: false,
  },
];

const TRACK_COLORS = ['#2563eb', '#d97706', '#059669', '#9333ea', '#e11d48', '#0891b2'];

const AUDIO_TEMPLATES: StudioTemplateCard[] = [
  {
    id: 'meditation_douce',
    title: 'Méditation & Fond doux',
    subtitle: 'Voix + Accord Do majeur chaleureux prêt à enregistrer',
    formatLabel: 'Multipiste',
    previewBg: 'linear-gradient(135deg, #0b1f42 0%, #1e3a8a 100%)',
    previewAccent: '#38bdf8',
    sampleHeading: 'Méditation & Prière Guidée',
    sampleSub: 'Fond harmonique inclus hors-ligne',
  },
  {
    id: 'lecture_musique',
    title: 'Lecture biblique + Musique',
    subtitle: 'Cloche d’ouverture + Accord Sol chaleureux',
    formatLabel: '3 Pistes',
    previewBg: 'linear-gradient(135deg, #064e3b 0%, #059669 100%)',
    previewAccent: '#fbbf24',
    sampleHeading: 'Lecture & Exhortation',
    sampleSub: 'Intro douce & nappe musicale',
  },
  {
    id: 'podcast_priere',
    title: 'Podcast Prière & Voix claire',
    subtitle: 'Compresseur activé + EQ optimisé pour la voix',
    formatLabel: 'Podcast',
    previewBg: 'linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)',
    previewAccent: '#fde68a',
    sampleHeading: 'Émission & Témoignage Audio',
    sampleSub: 'Master vocal équilibré',
  },
];

function encodeWavFromAudioBuffer(buffer: AudioBuffer): Blob {
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataByteSize = length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataByteSize);
  const view = new DataView(arrayBuffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataByteSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataByteSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function encodeMp3FromAudioBuffer(buffer: AudioBuffer): Blob {
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const encoder = new Mp3Encoder(numChannels, sampleRate, 128);
  const mp3Chunks: BlobPart[] = [];

  const toInt16 = (floatArr: Float32Array) => {
    const out = new Int16Array(floatArr.length);
    for (let i = 0; i < floatArr.length; i++) {
      const s = Math.max(-1, Math.min(1, floatArr[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  };

  const left = toInt16(buffer.getChannelData(0));
  const right = numChannels > 1 ? toInt16(buffer.getChannelData(1)) : undefined;
  const blockSize = 1152;

  for (let i = 0; i < left.length; i += blockSize) {
    const lChunk = left.subarray(i, i + blockSize);
    const rChunk = right ? right.subarray(i, i + blockSize) : undefined;
    const encoded = encoder.encodeBuffer(lChunk, rChunk);
    if (encoded.length > 0) {
      mp3Chunks.push(new Uint8Array(encoded));
    }
  }

  const flushed = encoder.flush();
  if (flushed.length > 0) {
    mp3Chunks.push(new Uint8Array(flushed));
  }

  return new Blob(mp3Chunks, { type: 'audio/mp3' });
}

function stripSilencesFromBuffer(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  startSec: number,
  endSec: number
): AudioBuffer {
  const sr = buffer.sampleRate;
  const startIdx = Math.max(0, Math.floor(startSec * sr));
  const endIdx = Math.min(buffer.length, Math.floor(endSec * sr));
  const windowSize = Math.floor(sr * 0.05);
  const minSilentWindows = 6;
  const rmsThreshold = 0.012;

  const ch0 = buffer.getChannelData(0);
  const keepRanges: Array<[number, number]> = [];
  let silentRun = 0;
  let blockStart = startIdx;

  for (let pos = startIdx; pos < endIdx; pos += windowSize) {
    const winEnd = Math.min(endIdx, pos + windowSize);
    let sumSq = 0;
    for (let i = pos; i < winEnd; i++) {
      sumSq += ch0[i] * ch0[i];
    }
    const rms = Math.sqrt(sumSq / Math.max(1, winEnd - pos));
    if (rms < rmsThreshold) {
      silentRun++;
      if (silentRun === minSilentWindows) {
        const cutEnd = Math.max(blockStart, pos - windowSize * (minSilentWindows - 2));
        if (cutEnd > blockStart) keepRanges.push([blockStart, cutEnd]);
      }
    } else {
      if (silentRun >= minSilentWindows) {
        blockStart = Math.max(startIdx, pos - windowSize);
      }
      silentRun = 0;
    }
  }

  if (silentRun < minSilentWindows && endIdx > blockStart) {
    keepRanges.push([blockStart, endIdx]);
  }
  if (keepRanges.length === 0) {
    keepRanges.push([startIdx, endIdx]);
  }

  const totalSamples = keepRanges.reduce((acc, [a, b]) => acc + (b - a), 0);
  const out = ctx.createBuffer(buffer.numberOfChannels, Math.max(1, totalSamples), sr);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    let writePos = 0;
    for (const [a, b] of keepRanges) {
      dst.set(src.subarray(a, b), writePos);
      writePos += b - a;
    }
  }
  return out;
}

function buildPreparedBuffer(ctx: BaseAudioContext, clip: AudioClipItem): AudioBuffer {
  const s = Math.max(0, Math.min(clip.trimStart, clip.buffer.duration - 0.05));
  const e = Math.max(s + 0.05, Math.min(clip.trimEnd, clip.buffer.duration));
  if (clip.removeSilence) {
    return stripSilencesFromBuffer(ctx, clip.buffer, s, e);
  }
  const startFrame = Math.floor(s * clip.buffer.sampleRate);
  const endFrame = Math.floor(e * clip.buffer.sampleRate);
  const frameCount = Math.max(1, endFrame - startFrame);
  const out = ctx.createBuffer(clip.buffer.numberOfChannels, frameCount, clip.buffer.sampleRate);
  for (let c = 0; c < clip.buffer.numberOfChannels; c++) {
    out.getChannelData(c).set(clip.buffer.getChannelData(c).subarray(startFrame, endFrame));
  }
  return out;
}

function synthesizePadBuffer(
  ctx: BaseAudioContext,
  preset: 'silence' | 'c_major' | 'g_warm' | 'soft_bell',
  durationSec: number
): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(sr * durationSec));
  const buf = ctx.createBuffer(2, len, sr);
  if (preset === 'silence') return buf;

  const freqs =
    preset === 'c_major'
      ? [261.63, 329.63, 392.0, 523.25]
      : preset === 'g_warm'
        ? [196.0, 246.94, 293.66, 392.0]
        : [523.25, 1046.5, 1567.98];

  const left = buf.getChannelData(0);
  const right = buf.getChannelData(1);

  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const attack = Math.min(1, t / 0.4);
    const release = Math.min(1, (durationSec - t) / 0.6);
    const bellDecay = preset === 'soft_bell' ? Math.exp(-t * 1.4) : 1;
    const env = Math.max(0, Math.min(attack, release)) * bellDecay * 0.16;

    let sampleL = 0;
    let sampleR = 0;
    for (let fIdx = 0; fIdx < freqs.length; fIdx++) {
      const f = freqs[fIdx];
      const wave = Math.sin(2 * Math.PI * f * t);
      sampleL += wave * (fIdx % 2 === 0 ? 1.0 : 0.75);
      sampleR += wave * (fIdx % 2 === 1 ? 1.0 : 0.75);
    }
    left[i] = (sampleL / freqs.length) * env;
    right[i] = (sampleR / freqs.length) * env;
  }

  return buf;
}

function buildMasterFxBus(ctx: BaseAudioContext, fx: MasterFxSettings): AudioNode {
  const bass = ctx.createBiquadFilter();
  bass.type = 'lowshelf';
  bass.frequency.value = 180;
  bass.gain.value = fx.bassGainDb;

  const treble = ctx.createBiquadFilter();
  treble.type = 'highshelf';
  treble.frequency.value = 4000;
  treble.gain.value = fx.trebleGainDb;

  bass.connect(treble);

  let tailNode: AudioNode = treble;

  if (fx.echoAmount > 0.01) {
    const wetMerge = ctx.createGain();
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.26;
    const feedback = ctx.createGain();
    feedback.gain.value = Math.min(0.45, fx.echoAmount * 0.65);
    const wetGain = ctx.createGain();
    wetGain.gain.value = fx.echoAmount;

    treble.connect(wetMerge);
    treble.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wetGain);
    wetGain.connect(wetMerge);

    tailNode = wetMerge;
  }

  if (fx.normalizeCompressor) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.2;
    tailNode.connect(comp);
    comp.connect(ctx.destination);
  } else {
    tailNode.connect(ctx.destination);
  }

  return bass;
}

const WaveformPreview: React.FC<{
  buffer: AudioBuffer;
  trimStart: number;
  trimEnd: number;
  color: string;
}> = ({ buffer, trimStart, trimEnd, color }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    const data = buffer.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / w));
    const mid = h / 2;
    const dur = Math.max(0.05, buffer.duration);
    const trimStartX = Math.floor((trimStart / dur) * w);
    const trimEndX = Math.floor((trimEnd / dur) * w);

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(trimStartX, 0, Math.max(2, trimEndX - trimStartX), h);

    for (let x = 0; x < w; x++) {
      let min = 1;
      let max = -1;
      const start = x * step;
      for (let j = 0; j < step; j++) {
        const val = data[start + j] || 0;
        if (val < min) min = val;
        if (val > max) max = val;
      }
      const inside = x >= trimStartX && x <= trimEndX;
      ctx.fillStyle = inside ? color : '#475569';
      const top = mid + min * mid * 0.9;
      const barH = Math.max(2, (max - min) * mid * 0.9);
      ctx.fillRect(x, top, 1, barH);
    }
  }, [buffer, trimStart, trimEnd, color]);

  return (
    <canvas
      ref={canvasRef}
      width={360}
      height={48}
      className="w-full h-12 rounded-xl border border-slate-700/70"
    />
  );
};

export const AudioStudioModule: React.FC = () => {
  const { lang } = useLanguage();
  const { recordings, userProfile, studioProjects, reloadData } = useShalomDB();
  const isEn = lang === 'en';

  const [viewMode, setViewMode] = useState<'home' | 'editor'>('home');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  const [projectTitle, setProjectTitle] = useState(
    isEn ? 'Untitled Audio Project' : 'Nouveau projet audio libre'
  );
  const [tracks, setTracks] = useState<AudioTrack[]>(DEFAULT_TRACKS);
  const [selectedTrackId, setSelectedTrackId] = useState<string>('track_1');
  const [clips, setClips] = useState<AudioClipItem[]>([]);
  const [masterGain, setMasterGain] = useState(1.0);
  const [fx, setFx] = useState<MasterFxSettings>({
    bassGainDb: 0,
    trebleGainDb: 0,
    echoAmount: 0,
    normalizeCompressor: true,
  });

  const [synthPreset, setSynthPreset] = useState<'silence' | 'c_major' | 'g_warm' | 'soft_bell'>(
    'c_major'
  );
  const [synthDuration, setSynthDuration] = useState(5);

  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [micSeconds, setMicSeconds] = useState(0);
  const micRecorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micChunksRef = useRef<Blob[]>([]);
  const micTimerRef = useRef<number | null>(null);

  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [playheadSec, setPlayheadSec] = useState(0);
  const previewSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const previewTimerRef = useRef<number | null>(null);
  const previewStartTimeRef = useRef<number>(0);

  const [resourceModalOpen, setResourceModalOpen] = useState(false);

  const [isRendering, setIsRendering] = useState(false);
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);
  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null);
  const [exportedFormat, setExportedFormat] = useState<'wav' | 'mp3'>('mp3');
  const [notice, setNotice] = useState<string | null>(null);
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);

  const recentAudioProjects = useMemo(
    () => studioProjects.filter((p) => p.studio === 'audio'),
    [studioProjects]
  );

  const getAudioCtx = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
    return audioCtxRef.current;
  };

  useEffect(() => {
    return () => {
      if (micTimerRef.current) clearInterval(micTimerRef.current);
      if (previewTimerRef.current) clearInterval(previewTimerRef.current);
      previewSourcesRef.current.forEach((s) => {
        try {
          s.stop();
        } catch {
          // noop
        }
      });
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      if (exportedUrl) URL.revokeObjectURL(exportedUrl);
    };
  }, [exportedUrl]);

  const totalProjectDuration = useMemo(() => {
    if (clips.length === 0) return 0;
    return clips.reduce((maxEnd, clip) => {
      const effectiveDur = Math.max(0.05, clip.trimEnd - clip.trimStart) / clip.playbackRate;
      return Math.max(maxEnd, clip.startTimeSec + effectiveDur);
    }, 0);
  }, [clips]);

  const startBlankAudioProject = () => {
    stopPreview();
    setActiveProjectId(null);
    setProjectTitle(isEn ? 'Untitled Audio Project' : 'Nouveau projet audio');
    setTracks(DEFAULT_TRACKS);
    setSelectedTrackId('track_1');
    setClips([]);
    setMasterGain(1.0);
    setFx({ bassGainDb: 0, trebleGainDb: 0, echoAmount: 0, normalizeCompressor: true });
    setExportedUrl(null);
    setExportedBlob(null);
    setNotice(null);
    setViewMode('editor');
  };

  const applyAudioTemplate = (templateId: string) => {
    stopPreview();
    setActiveProjectId(null);
    setTracks(DEFAULT_TRACKS);
    setExportedUrl(null);
    setExportedBlob(null);
    setNotice(null);
    const ctx = getAudioCtx();

    if (templateId === 'meditation_douce') {
      setProjectTitle('Méditation & Fond doux');
      setSelectedTrackId('track_1');
      setFx({ bassGainDb: 2, trebleGainDb: 0, echoAmount: 0.18, normalizeCompressor: true });
      const pad = synthesizePadBuffer(ctx, 'c_major', 12);
      setClips([
        {
          id: `clip_tpl_${Date.now()}`,
          trackId: 'track_2',
          name: 'Accord Do majeur (Fond doux)',
          buffer: pad,
          startTimeSec: 0,
          trimStart: 0,
          trimEnd: 12,
          gain: 0.8,
          pan: 0,
          fadeInSec: 1.0,
          fadeOutSec: 1.5,
          playbackRate: 1,
          removeSilence: false,
        },
      ]);
    } else if (templateId === 'lecture_musique') {
      setProjectTitle('Lecture biblique + Musique');
      setSelectedTrackId('track_1');
      setFx({ bassGainDb: 0, trebleGainDb: 2, echoAmount: 0.1, normalizeCompressor: true });
      const bell = synthesizePadBuffer(ctx, 'soft_bell', 4);
      const pad = synthesizePadBuffer(ctx, 'g_warm', 14);
      setClips([
        {
          id: `clip_bell_${Date.now()}`,
          trackId: 'track_3',
          name: 'Cloche d’ouverture',
          buffer: bell,
          startTimeSec: 0,
          trimStart: 0,
          trimEnd: 4,
          gain: 0.7,
          pan: 0,
          fadeInSec: 0.1,
          fadeOutSec: 1.0,
          playbackRate: 1,
          removeSilence: false,
        },
        {
          id: `clip_g_${Date.now() + 1}`,
          trackId: 'track_2',
          name: 'Nappe Sol chaleureuse',
          buffer: pad,
          startTimeSec: 0.5,
          trimStart: 0,
          trimEnd: 14,
          gain: 0.75,
          pan: 0,
          fadeInSec: 1.2,
          fadeOutSec: 2.0,
          playbackRate: 1,
          removeSilence: false,
        },
      ]);
    } else {
      setProjectTitle('Podcast Prière & Voix');
      setSelectedTrackId('track_1');
      setFx({ bassGainDb: 3, trebleGainDb: 3, echoAmount: 0, normalizeCompressor: true });
      const bell = synthesizePadBuffer(ctx, 'soft_bell', 3);
      setClips([
        {
          id: `clip_intro_${Date.now()}`,
          trackId: 'track_3',
          name: 'Jingle d’intro',
          buffer: bell,
          startTimeSec: 0,
          trimStart: 0,
          trimEnd: 3,
          gain: 0.65,
          pan: 0,
          fadeInSec: 0.05,
          fadeOutSec: 0.8,
          playbackRate: 1,
          removeSilence: false,
        },
      ]);
    }

    setViewMode('editor');
  };

  const openSavedAudioProject = async (project: StudioProjectRecord) => {
    try {
      stopPreview();
      const parsed = JSON.parse(project.dataJson) as SerializedAudioProject;
      const ctx = getAudioCtx();

      const hydratedClips: AudioClipItem[] = [];
      for (const c of parsed.clips || []) {
        const blob = await dbService.getMediaBlob(c.blobKey);
        if (blob) {
          const arr = await blob.arrayBuffer();
          const buf = await ctx.decodeAudioData(arr.slice(0));
          hydratedClips.push({ ...c, buffer: buf });
        }
      }

      setActiveProjectId(project.id);
      setProjectTitle(project.title);
      setMasterGain(parsed.masterGain ?? 1.0);
      setFx(
        parsed.fx || { bassGainDb: 0, trebleGainDb: 0, echoAmount: 0, normalizeCompressor: true }
      );
      setTracks(parsed.tracks?.length ? parsed.tracks : DEFAULT_TRACKS);
      setSelectedTrackId(parsed.tracks?.[0]?.id || 'track_1');
      setClips(hydratedClips);
      setNotice(null);
      setViewMode('editor');
    } catch {
      setNotice(
        isEn ? 'Unable to open this audio project.' : 'Impossible d’ouvrir ce projet audio.'
      );
    }
  };

  const handleDuplicateAudioProject = async (project: StudioProjectRecord) => {
    const now = new Date().toISOString();
    await dbService.put(STORES.STUDIO_PROJECTS, {
      ...project,
      id: `proj_aud_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      title: `${project.title} (${isEn ? 'Copy' : 'Copie'})`,
      createdAt: now,
      updatedAt: now,
    });
    await reloadData();
  };

  const handleDeleteAudioProject = async (project: StudioProjectRecord) => {
    await dbService.deleteItem(STORES.STUDIO_PROJECTS, project.id);
    await reloadData();
  };

  const handleSaveEditableAudioProject = async () => {
    const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const serClips: SerializedAudioProject['clips'] = [];
    const nextClips: AudioClipItem[] = [];

    for (let i = 0; i < clips.length; i++) {
      const c = clips[i];
      let bKey = c.blobKey;
      if (!bKey) {
        bKey = `blob_audio_clip_${uid}_${i}`;
        const wav = encodeWavFromAudioBuffer(c.buffer);
        await dbService.saveMediaBlob(bKey, wav, 'audio/wav');
      }
      nextClips.push({ ...c, blobKey: bKey });
      const { buffer: _buf, ...rest } = c;
      serClips.push({ ...rest, blobKey: bKey });
    }

    setClips(nextClips);
    const now = new Date().toISOString();
    const projectId = activeProjectId || `proj_aud_${uid}`;
    const existing = activeProjectId
      ? recentAudioProjects.find((p) => p.id === activeProjectId)
      : undefined;

    const record: StudioProjectRecord = {
      id: projectId,
      studio: 'audio',
      title: projectTitle.trim() || (isEn ? 'Untitled Audio' : 'Projet audio'),
      formatLabel: `${tracks.length} pistes · ${totalProjectDuration.toFixed(1)}s`,
      dataJson: JSON.stringify({
        version: 1,
        masterGain,
        fx,
        tracks,
        clips: serClips,
      } satisfies SerializedAudioProject),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    await dbService.put(STORES.STUDIO_PROJECTS, record);
    setActiveProjectId(projectId);
    await reloadData();
    setNotice(isEn ? 'Audio project saved locally!' : 'Projet audio enregistré avec succès !');
  };

  const getNextStartForTrack = (trackId: string) => {
    const trackClips = clips.filter((c) => c.trackId === trackId);
    if (trackClips.length === 0) return 0;
    return Number(
      trackClips
        .reduce((maxEnd, c) => {
          const d = Math.max(0.05, c.trimEnd - c.trimStart) / c.playbackRate;
          return Math.max(maxEnd, c.startTimeSec + d);
        }, 0)
        .toFixed(2)
    );
  };

  const addBufferAsClip = (
    buffer: AudioBuffer,
    name: string,
    targetTrackId?: string,
    blobKey?: string
  ) => {
    const tId = targetTrackId || selectedTrackId;
    const startAt = getNextStartForTrack(tId);
    const item: AudioClipItem = {
      id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      trackId: tId,
      name,
      buffer,
      blobKey,
      startTimeSec: startAt,
      trimStart: 0,
      trimEnd: Number(buffer.duration.toFixed(2)),
      gain: 1.0,
      pan: 0,
      fadeInSec: 0.05,
      fadeOutSec: 0.1,
      playbackRate: 1.0,
      removeSilence: false,
    };
    setClips((prev) => [...prev, item]);
  };

  const decodeBlobToClip = async (
    blob: Blob,
    name: string,
    targetTrackId?: string,
    blobKey?: string
  ) => {
    const ctx = getAudioCtx();
    const arr = await blob.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arr.slice(0));
    addBufferAsClip(buffer, name, targetTrackId, blobKey);
  };

  const handleImportAudioFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      try {
        await decodeBlobToClip(files[i], files[i].name);
      } catch {
        setNotice(
          isEn ? `Could not decode ${files[i].name}.` : `Impossible de décoder ${files[i].name}.`
        );
      }
    }
    e.target.value = '';
  };

  const handleSelectOnlineAudio = async (asset: DownloadedStudioAsset, blob: Blob) => {
    try {
      await decodeBlobToClip(blob, asset.title, selectedTrackId, asset.blobKey);
      setNotice(
        isEn
          ? `"${asset.title}" added to ${selectedTrackId}!`
          : `« ${asset.title} » ajouté à la piste !`
      );
    } catch {
      setNotice(
        isEn
          ? 'This online audio codec is not supported by your browser.'
          : 'Ce format audio n’est pas décodable par ce navigateur.'
      );
    }
  };

  const handleImportFromParole = async (recId: string) => {
    const rec = recordings.find((r) => r.id === recId);
    if (!rec?.blobKey) return;
    const blob = await dbService.getMediaBlob(rec.blobKey);
    if (!blob) return;
    try {
      await decodeBlobToClip(blob, rec.title, selectedTrackId, rec.blobKey);
      setNotice(
        isEn ? `Added "${rec.title}" to track.` : `« ${rec.title} » ajouté à la piste.`
      );
    } catch {
      setNotice(
        isEn
          ? 'This recording could not be decoded in Audio Studio.'
          : 'Cet enregistrement n’a pas pu être décodé dans le studio.'
      );
    }
  };

  const handleGenerateSynthClip = () => {
    const ctx = getAudioCtx();
    const buf = synthesizePadBuffer(ctx, synthPreset, Math.max(1, Math.min(30, synthDuration)));
    const labelMap: Record<typeof synthPreset, string> = {
      silence: `Silence (${synthDuration}s)`,
      c_major: `Accord Do majeur (${synthDuration}s)`,
      g_warm: `Accord Sol chaleureux (${synthDuration}s)`,
      soft_bell: `Cloche méditation (${synthDuration}s)`,
    };
    addBufferAsClip(buf, labelMap[synthPreset]);
  };

  const handleToggleMicRecord = async () => {
    if (isRecordingMic) {
      micRecorderRef.current?.stop();
      setIsRecordingMic(false);
      if (micTimerRef.current) clearInterval(micTimerRef.current);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      micChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      micRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) micChunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(micChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        await decodeBlobToClip(
          blob,
          `${isEn ? 'Mic Take' : 'Prise micro'} #${clips.length + 1}`
        );
      };

      recorder.start(250);
      setIsRecordingMic(true);
      setMicSeconds(0);
      micTimerRef.current = window.setInterval(() => setMicSeconds((s) => s + 1), 1000);
    } catch {
      setNotice(
        isEn
          ? 'Microphone permission denied or unavailable.'
          : 'Accès au microphone refusé ou indisponible.'
      );
    }
  };

  const handleAddTrack = () => {
    const nextIdx = tracks.length + 1;
    const newId = `track_${Date.now()}`;
    setTracks((prev) => [
      ...prev,
      {
        id: newId,
        name: `Piste ${nextIdx}`,
        color: TRACK_COLORS[(nextIdx - 1) % TRACK_COLORS.length],
        volume: 1.0,
        muted: false,
        solo: false,
      },
    ]);
    setSelectedTrackId(newId);
  };

  const updateTrack = (id: string, patch: Partial<AudioTrack>) => {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const removeTrack = (id: string) => {
    if (tracks.length <= 1) return;
    setTracks((prev) => prev.filter((t) => t.id !== id));
    setClips((prev) => prev.filter((c) => c.trackId !== id));
    if (selectedTrackId === id) {
      const remaining = tracks.find((t) => t.id !== id);
      if (remaining) setSelectedTrackId(remaining.id);
    }
  };

  const updateClip = (id: string, patch: Partial<AudioClipItem>) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  const splitClip = (clip: AudioClipItem) => {
    const clipTimelineDur = Math.max(0.1, clip.trimEnd - clip.trimStart) / clip.playbackRate;
    if (clipTimelineDur < 0.4) {
      setNotice(isEn ? 'Clip too short to split.' : 'Extrait trop court pour être scindé.');
      return;
    }
    const relTime =
      playheadSec > clip.startTimeSec + 0.15 &&
      playheadSec < clip.startTimeSec + clipTimelineDur - 0.15
        ? playheadSec - clip.startTimeSec
        : clipTimelineDur / 2;
    const splitSrcSec = Number((clip.trimStart + relTime * clip.playbackRate).toFixed(2));
    if (splitSrcSec <= clip.trimStart + 0.1 || splitSrcSec >= clip.trimEnd - 0.1) return;

    const part1: AudioClipItem = {
      ...clip,
      name: `${clip.name} (1)`,
      trimEnd: splitSrcSec,
    };
    const part2: AudioClipItem = {
      ...clip,
      id: `clip_${Date.now()}_split`,
      name: `${clip.name} (2)`,
      startTimeSec: Number((clip.startTimeSec + relTime).toFixed(2)),
      trimStart: splitSrcSec,
    };
    setClips((prev) => prev.flatMap((c) => (c.id === clip.id ? [part1, part2] : [c])));
    setNotice(isEn ? 'Clip split in two parts!' : 'Extrait scindé en deux parties !');
  };

  const duplicateClip = (clip: AudioClipItem) => {
    const dur = Math.max(0.05, clip.trimEnd - clip.trimStart) / clip.playbackRate;
    setClips((prev) => [
      ...prev,
      {
        ...clip,
        id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: `${clip.name} (copie)`,
        startTimeSec: Number((clip.startTimeSec + dur).toFixed(2)),
      },
    ]);
  };

  const removeClip = (id: string) => {
    setClips((prev) => prev.filter((c) => c.id !== id));
  };

  const chainTrackSequentially = (trackId: string) => {
    let cursor = 0;
    setClips((prev) =>
      prev.map((c) => {
        if (c.trackId !== trackId) return c;
        const updated = { ...c, startTimeSec: Number(cursor.toFixed(2)) };
        cursor += Math.max(0.05, c.trimEnd - c.trimStart) / c.playbackRate;
        return updated;
      })
    );
  };

  const hasAnySolo = tracks.some((t) => t.solo);

  const isTrackAudible = (track: AudioTrack | undefined) => {
    if (!track) return false;
    if (track.muted) return false;
    if (hasAnySolo && !track.solo) return false;
    return true;
  };

  const stopPreview = () => {
    if (previewTimerRef.current) {
      clearInterval(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    previewSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {
        // noop
      }
    });
    previewSourcesRef.current = [];
    setIsPlayingPreview(false);
    setPlayheadSec(0);
  };

  const handleTogglePreview = async () => {
    if (isPlayingPreview) {
      stopPreview();
      return;
    }
    if (clips.length === 0) return;

    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') await ctx.resume();

    const masterBus = buildMasterFxBus(ctx, fx);
    const now = ctx.currentTime + 0.05;
    const sources: AudioBufferSourceNode[] = [];

    for (const clip of clips) {
      const track = tracks.find((t) => t.id === clip.trackId);
      if (!isTrackAudible(track)) continue;

      const prepared = buildPreparedBuffer(ctx, clip);
      const src = ctx.createBufferSource();
      src.buffer = prepared;
      src.playbackRate.value = clip.playbackRate;

      const gainNode = ctx.createGain();
      const targetVol = Math.max(0, clip.gain * (track?.volume ?? 1) * masterGain);
      const realDur = prepared.duration / clip.playbackRate;
      const startAt = now + clip.startTimeSec;
      const fadeIn = Math.min(clip.fadeInSec, realDur / 2);
      const fadeOut = Math.min(clip.fadeOutSec, realDur / 2);

      if (fadeIn > 0.01) {
        gainNode.gain.setValueAtTime(0.001, startAt);
        gainNode.gain.linearRampToValueAtTime(targetVol, startAt + fadeIn);
      } else {
        gainNode.gain.setValueAtTime(targetVol, startAt);
      }

      if (fadeOut > 0.01) {
        const fadeOutStart = Math.max(startAt + fadeIn, startAt + realDur - fadeOut);
        gainNode.gain.setValueAtTime(targetVol, fadeOutStart);
        gainNode.gain.linearRampToValueAtTime(0.001, startAt + realDur);
      }

      if (typeof ctx.createStereoPanner === 'function') {
        const panner = ctx.createStereoPanner();
        panner.pan.value = clip.pan;
        src.connect(gainNode);
        gainNode.connect(panner);
        panner.connect(masterBus);
      } else {
        src.connect(gainNode);
        gainNode.connect(masterBus);
      }

      src.start(startAt);
      sources.push(src);
    }

    previewSourcesRef.current = sources;
    previewStartTimeRef.current = performance.now();
    setIsPlayingPreview(true);

    previewTimerRef.current = window.setInterval(() => {
      const elapsed = (performance.now() - previewStartTimeRef.current) / 1000;
      if (elapsed >= totalProjectDuration + 0.15) {
        stopPreview();
      } else {
        setPlayheadSec(elapsed);
      }
    }, 60);
  };

  const handleMixAndExport = async (format: 'wav' | 'mp3') => {
    if (clips.length === 0) return;
    stopPreview();
    setIsRendering(true);
    setNotice(null);

    try {
      const sampleRate = 44100;
      const baseCtx = getAudioCtx();

      const preparedClips = clips
        .map((clip) => {
          const track = tracks.find((t) => t.id === clip.trackId);
          if (!isTrackAudible(track)) return null;
          const prepared = buildPreparedBuffer(baseCtx, clip);
          return { clip, track: track!, prepared };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      if (preparedClips.length === 0) {
        throw new Error(
          isEn
            ? 'All tracks are muted. Unmute at least one track to export.'
            : 'Toutes les pistes sont en sourdine. Activez au moins une piste.'
        );
      }

      const maxDur = preparedClips.reduce((acc, item) => {
        const realDur = item.prepared.duration / item.clip.playbackRate;
        return Math.max(acc, item.clip.startTimeSec + realDur);
      }, 0.5);

      const echoTail = fx.echoAmount > 0.01 ? 1.0 : 0.1;
      const totalFrames = Math.ceil((maxDur + echoTail) * sampleRate);
      const offline = new OfflineAudioContext(2, totalFrames, sampleRate);
      const offlineMasterBus = buildMasterFxBus(offline, fx);

      for (const { clip, track, prepared } of preparedClips) {
        const src = offline.createBufferSource();
        src.buffer = prepared;
        src.playbackRate.value = clip.playbackRate;

        const gainNode = offline.createGain();
        const targetVol = Math.max(0, clip.gain * track.volume * masterGain);
        const realDur = prepared.duration / clip.playbackRate;
        const startAt = Math.max(0, clip.startTimeSec);
        const fadeIn = Math.min(clip.fadeInSec, realDur / 2);
        const fadeOut = Math.min(clip.fadeOutSec, realDur / 2);

        if (fadeIn > 0.01) {
          gainNode.gain.setValueAtTime(0.001, startAt);
          gainNode.gain.linearRampToValueAtTime(targetVol, startAt + fadeIn);
        } else {
          gainNode.gain.setValueAtTime(targetVol, startAt);
        }

        if (fadeOut > 0.01) {
          const fadeOutStart = Math.max(startAt + fadeIn, startAt + realDur - fadeOut);
          gainNode.gain.setValueAtTime(targetVol, fadeOutStart);
          gainNode.gain.linearRampToValueAtTime(0.001, startAt + realDur);
        }

        const panner = offline.createStereoPanner();
        panner.pan.value = clip.pan;
        src.connect(gainNode);
        gainNode.connect(panner);
        panner.connect(offlineMasterBus);
        src.start(startAt);
      }

      const rendered = await offline.startRendering();
      const outBlob =
        format === 'wav' ? encodeWavFromAudioBuffer(rendered) : encodeMp3FromAudioBuffer(rendered);

      if (exportedUrl) URL.revokeObjectURL(exportedUrl);
      const url = URL.createObjectURL(outBlob);
      setExportedUrl(url);
      setExportedBlob(outBlob);
      setExportedFormat(format);
      setNotice(
        isEn
          ? `Audio mixed & exported (${format.toUpperCase()})!`
          : `Mixage terminé et prêt en ${format.toUpperCase()} !`
      );
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Erreur audio');
    } finally {
      setIsRendering(false);
    }
  };

  const handleSaveToParole = async () => {
    if (!exportedBlob) return;
    const blobKey = `parole_studio_${Date.now()}`;
    await dbService.saveMediaBlob(blobKey, exportedBlob, exportedBlob.type);
    const rec: RecordedParole = {
      id: `rec_studio_${Date.now()}`,
      title: projectTitle.trim() || 'Production Studio Audio',
      type: 'exhortation',
      speaker: userProfile?.fullName || 'Moi',
      activityGenre: 'autre',
      date: new Date().toISOString().split('T')[0],
      durationSeconds: Math.max(1, Math.round(totalProjectDuration)),
      mediaType: 'audio',
      mimeType: exportedBlob.type,
      blobKey,
      fileSizeFormatted: `${(exportedBlob.size / (1024 * 1024)).toFixed(2)} Mo`,
      createdAt: new Date().toISOString(),
    };
    await dbService.put(STORES.RECORDINGS, rec);
    setNotice(isEn ? 'Saved to Parole Divine!' : 'Enregistré dans Parole Divine !');
    reloadData();
  };

  const handleSaveToVault = async () => {
    if (!exportedBlob) return;
    const safeSlug = projectTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'shalom_audio';
    const blobKey = `vault_audio_${Date.now()}`;
    await dbService.saveMediaBlob(blobKey, exportedBlob, exportedBlob.type);
    const doc: VaultDocument = {
      id: `vault_${Date.now()}`,
      title: projectTitle.trim() || 'Création Audio',
      category: 'autre',
      author: userProfile?.fullName || 'Moi',
      description: 'Création audio réalisée dans SHALOM Studio Audio',
      fileName: `${safeSlug}.${exportedFormat}`,
      mimeType: exportedBlob.type,
      sizeBytes: exportedBlob.size,
      blobKey,
      createdAt: new Date().toISOString(),
    };
    await dbService.put(STORES.VAULT_DOCUMENTS, doc);
    setNotice(isEn ? 'Saved to Spiritual Vault!' : 'Ajouté dans Mon Coffre Spirituel !');
    reloadData();
  };

  const handleDownloadExported = () => {
    if (!exportedUrl) return;
    const link = document.createElement('a');
    link.href = exportedUrl;
    link.download = `${projectTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'shalom_audio'}.${exportedFormat}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleShareExported = () => {
    if (!exportedBlob) return;
    const file = new File(
      [exportedBlob],
      `${projectTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'shalom_audio'}.${exportedFormat}`,
      { type: exportedBlob.type }
    );
    setSharePayload({
      title: projectTitle,
      text: `🎙️ ${projectTitle}\n\nPartagé depuis SHALOM Studio Audio`,
      file,
    });
  };

  const timelineMax = Math.max(10, totalProjectDuration + 1);

  return (
    <div className="space-y-6 w-full min-w-0 overflow-x-clip">
      {viewMode === 'home' ? (
        <StudioHomePanel
          studio="audio"
          studioTitle={isEn ? 'Multi-Track Audio Studio' : 'Studio Audio Multipiste'}
          studioDescription={
            isEn
              ? 'Record voice, mix multiple tracks, apply EQ/Echo/Compressor, split clips, use online free music & export MP3/WAV.'
              : 'Enregistrez votre voix, mixez en multipiste, scindez les extraits, appliquez EQ/Écho/Compresseur, ajoutez des musiques libres et exportez en MP3/WAV.'
          }
          headerIcon={<Music className="w-5 h-5 text-amber-300" />}
          blankLabel={isEn ? 'New Blank Audio Project' : 'Nouveau projet audio vierge'}
          templates={AUDIO_TEMPLATES}
          recentProjects={recentAudioProjects}
          onCreateBlank={startBlankAudioProject}
          onSelectTemplate={applyAudioTemplate}
          onOpenProject={openSavedAudioProject}
          onDuplicateProject={handleDuplicateAudioProject}
          onDeleteProject={handleDeleteAudioProject}
        />
      ) : (
        <div className="space-y-5 w-full min-w-0">
          {/* Header Bar */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => {
                  stopPreview();
                  setViewMode('home');
                }}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 font-bold flex items-center gap-1.5 shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">{isEn ? 'Studio Home' : 'Accueil Studio'}</span>
              </button>

              <input
                type="text"
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                className="min-h-[44px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-bold flex-1 min-w-[140px]"
              />
            </div>

            <button
              type="button"
              onClick={handleSaveEditableAudioProject}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-[#0b1f42] dark:bg-blue-700 text-white font-bold flex items-center gap-1.5"
            >
              <Save className="w-4 h-4" />
              <span>{isEn ? 'Save Project' : 'Sauver projet'}</span>
            </button>
          </div>

          {notice && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{notice}</span>
              </span>
              <button type="button" onClick={() => setNotice(null)} className="underline ml-2">
                OK
              </button>
            </div>
          )}

          {/* Source & FX Control Panel */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 space-y-4 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
              <div className="min-w-0">
                <label className="block font-semibold mb-1">
                  {isEn ? 'Target Track for New Clips' : 'Piste cible pour les ajouts'}
                </label>
                <select
                  value={selectedTrackId}
                  onChange={(e) => setSelectedTrackId(e.target.value)}
                  className="w-full max-w-full min-w-0 min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-semibold"
                >
                  {tracks.map((tr) => (
                    <option key={tr.id} value={tr.id}>
                      {tr.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between font-semibold mb-1">
                  <span className="flex items-center gap-1">
                    <Sliders className="w-3.5 h-3.5 text-blue-600" />
                    <span>{isEn ? 'Master Volume' : 'Volume général (Master)'}</span>
                  </span>
                  <span className="tabular-nums">{Math.round(masterGain * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={1.6}
                  step={0.05}
                  value={masterGain}
                  onChange={(e) => setMasterGain(parseFloat(e.target.value))}
                  className="w-full accent-blue-700"
                />
              </div>
            </div>

            {/* Creation Actions */}
            <div className="studio-scroll-x flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 pb-1">
              <button
                type="button"
                onClick={handleToggleMicRecord}
                className={`min-h-[44px] px-3.5 py-2.5 rounded-xl font-bold flex items-center gap-2 shrink-0 transition ${
                  isRecordingMic
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-blue-700 hover:bg-blue-800 text-white'
                }`}
              >
                {isRecordingMic ? (
                  <>
                    <Square className="w-4 h-4 fill-current" />
                    <span>
                      {isEn ? `Stop Mic (${micSeconds}s)` : `Arrêter micro (${micSeconds}s)`}
                    </span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" />
                    <span>{isEn ? 'Record Voice' : 'Enregistrer micro'}</span>
                  </>
                )}
              </button>

              <label className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 font-semibold flex items-center gap-2 cursor-pointer shrink-0">
                <Upload className="w-4 h-4" />
                <span>{isEn ? 'Import Audio' : 'Fichiers audio'}</span>
                <input
                  type="file"
                  accept="audio/*"
                  multiple
                  onChange={handleImportAudioFiles}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={() => setResourceModalOpen(true)}
                className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold flex items-center gap-1.5 shrink-0"
              >
                <Globe className="w-4 h-4" />
                <span>{isEn ? 'Online Music & SFX' : 'Musiques & Sons en ligne'}</span>
              </button>

              {recordings.length > 0 && (
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) handleImportFromParole(e.target.value);
                    e.target.value = '';
                  }}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-semibold shrink-0"
                >
                  <option value="">
                    {isEn ? '+ Parole Divine' : '+ Depuis Parole Divine'}
                  </option>
                  {recordings.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Offline Synth + Master FX Strip */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-2 p-2.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40">
                <Music className="w-4 h-4 text-amber-600 shrink-0" />
                <select
                  value={synthPreset}
                  onChange={(e) => setSynthPreset(e.target.value as typeof synthPreset)}
                  className="bg-transparent font-semibold text-amber-900 dark:text-amber-200"
                >
                  <option value="c_major">{isEn ? 'C Major Pad' : 'Accord Do majeur'}</option>
                  <option value="g_warm">{isEn ? 'G Warm Pad' : 'Accord Sol chaleureux'}</option>
                  <option value="soft_bell">{isEn ? 'Meditation Bell' : 'Cloche méditation'}</option>
                  <option value="silence">{isEn ? 'Blank Silence' : 'Silence vierge'}</option>
                </select>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={synthDuration}
                  onChange={(e) => setSynthDuration(Math.max(1, parseInt(e.target.value, 10) || 3))}
                  className="w-12 px-1.5 py-1 rounded bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 text-center tabular-nums"
                />
                <span className="text-[11px] text-amber-700 dark:text-amber-300">s</span>
                <button
                  type="button"
                  onClick={handleGenerateSynthClip}
                  className="min-h-[36px] px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold"
                >
                  + {isEn ? 'Create' : 'Créer hors-ligne'}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 items-center">
                <div>
                  <span className="block text-[10px] font-semibold text-slate-500">
                    Graves ({fx.bassGainDb > 0 ? `+${fx.bassGainDb}` : fx.bassGainDb}dB)
                  </span>
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={1}
                    value={fx.bassGainDb}
                    onChange={(e) =>
                      setFx((f) => ({ ...f, bassGainDb: parseInt(e.target.value, 10) }))
                    }
                    className="w-full"
                  />
                </div>
                <div>
                  <span className="block text-[10px] font-semibold text-slate-500">
                    Aigus ({fx.trebleGainDb > 0 ? `+${fx.trebleGainDb}` : fx.trebleGainDb}dB)
                  </span>
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={1}
                    value={fx.trebleGainDb}
                    onChange={(e) =>
                      setFx((f) => ({ ...f, trebleGainDb: parseInt(e.target.value, 10) }))
                    }
                    className="w-full"
                  />
                </div>
                <div>
                  <span className="block text-[10px] font-semibold text-slate-500">
                    Écho ({Math.round(fx.echoAmount * 100)}%)
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={0.6}
                    step={0.05}
                    value={fx.echoAmount}
                    onChange={(e) =>
                      setFx((f) => ({ ...f, echoAmount: parseFloat(e.target.value) }))
                    }
                    className="w-full"
                  />
                </div>
                <label className="flex items-center gap-1.5 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={fx.normalizeCompressor}
                    onChange={(e) =>
                      setFx((f) => ({ ...f, normalizeCompressor: e.target.checked }))
                    }
                    className="accent-blue-700"
                  />
                  <span>Normaliser</span>
                </label>
              </div>
            </div>
          </div>

          {/* Multi-Track Console */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-600" />
                <span>
                  {isEn
                    ? 'Multi-Track Console & Timeline'
                    : 'Table de mixage & Timeline multipiste'}
                </span>
              </h3>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleTogglePreview}
                  disabled={clips.length === 0}
                  className={`min-h-[44px] px-3.5 py-2 rounded-xl font-bold flex items-center gap-1.5 transition disabled:opacity-40 ${
                    isPlayingPreview
                      ? 'bg-red-600 text-white'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  }`}
                >
                  {isPlayingPreview ? (
                    <>
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>
                        {isEn ? 'Stop' : 'Arrêter'} ({playheadSec.toFixed(1)}s)
                      </span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>
                        {isEn ? 'Live Preview' : 'Écouter'} ({totalProjectDuration.toFixed(1)}s)
                      </span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleAddTrack}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isEn ? 'New Track' : 'Nouvelle piste'}</span>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {tracks.map((track) => {
                const trackClips = clips.filter((c) => c.trackId === track.id);
                return (
                  <div
                    key={track.id}
                    className={`p-3 rounded-xl border transition ${
                      selectedTrackId === track.id
                        ? 'border-blue-400 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-950/10'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2 min-w-0">
                      <div className="flex items-center gap-2 flex-1 min-w-[140px] max-w-full">
                        <input
                          type="color"
                          value={track.color}
                          onChange={(e) => updateTrack(track.id, { color: e.target.value })}
                          className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
                        />
                        <input
                          type="text"
                          value={track.name}
                          onChange={(e) => updateTrack(track.id, { name: e.target.value })}
                          onFocus={() => setSelectedTrackId(track.id)}
                          className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-bold flex-1 min-w-0"
                        />
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateTrack(track.id, { muted: !track.muted })}
                          className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 ${
                            track.muted
                              ? 'bg-red-600 text-white'
                              : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {track.muted ? (
                            <VolumeX className="w-3 h-3" />
                          ) : (
                            <Volume2 className="w-3 h-3" />
                          )}
                          <span>M</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => updateTrack(track.id, { solo: !track.solo })}
                          className={`px-2.5 py-1 rounded-lg font-bold ${
                            track.solo
                              ? 'bg-amber-500 text-white'
                              : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          S
                        </button>

                        <div className="flex items-center gap-1.5">
                          <input
                            type="range"
                            min={0}
                            max={1.5}
                            step={0.05}
                            value={track.volume}
                            onChange={(e) =>
                              updateTrack(track.id, { volume: parseFloat(e.target.value) })
                            }
                            className="w-20 accent-blue-700"
                          />
                          <span className="tabular-nums w-9 text-right">
                            {Math.round(track.volume * 100)}%
                          </span>
                        </div>

                        {trackClips.length > 1 && (
                          <button
                            type="button"
                            onClick={() => chainTrackSequentially(track.id)}
                            className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 font-semibold flex items-center gap-1"
                          >
                            <AlignLeft className="w-3 h-3" />
                            <span>{isEn ? 'Chain' : 'Enchaîner'}</span>
                          </button>
                        )}

                        {tracks.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeTrack(track.id)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="relative h-8 rounded-lg bg-slate-900/90 border border-slate-800 overflow-hidden">
                      {trackClips.map((c) => {
                        const dur = Math.max(0.05, c.trimEnd - c.trimStart) / c.playbackRate;
                        const leftPct = Math.min(98, (c.startTimeSec / timelineMax) * 100);
                        const widthPct = Math.max(
                          3,
                          Math.min(100 - leftPct, (dur / timelineMax) * 100)
                        );
                        return (
                          <div
                            key={c.id}
                            style={{
                              left: `${leftPct}%`,
                              width: `${widthPct}%`,
                              backgroundColor: track.color,
                            }}
                            className="absolute top-1 bottom-1 rounded-md px-1.5 flex items-center text-[10px] font-bold text-white truncate shadow-xs opacity-90"
                            title={`${c.name} (${c.startTimeSec}s → ${(c.startTimeSec + dur).toFixed(1)}s)`}
                          >
                            {c.name}
                          </div>
                        );
                      })}
                      {isPlayingPreview && (
                        <div
                          style={{ left: `${Math.min(100, (playheadSec / timelineMax) * 100)}%` }}
                          className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Detailed Clip Editors */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {isEn
                ? `Clip Controls (${clips.length} clip(s))`
                : `Réglages des extraits (${clips.length})`}
            </h3>

            {clips.map((clip) => {
              const track = tracks.find((t) => t.id === clip.trackId);
              return (
                <div
                  key={clip.id}
                  className="p-4 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 space-y-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: track?.color || '#2563eb' }}
                      />
                      <input
                        type="text"
                        value={clip.name}
                        onChange={(e) => updateClip(clip.id, { name: e.target.value })}
                        className="font-bold text-slate-900 dark:text-white bg-transparent border-b border-transparent focus:border-blue-500 outline-none truncate"
                      />
                      <span className="text-slate-400 tabular-nums shrink-0">
                        ({clip.buffer.duration.toFixed(1)}s)
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto max-w-full">
                      <select
                        value={clip.trackId}
                        onChange={(e) => updateClip(clip.id, { trackId: e.target.value })}
                        className="px-2 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 font-semibold max-w-full min-w-0 flex-1 sm:flex-initial"
                      >
                        {tracks.map((tr) => (
                          <option key={tr.id} value={tr.id}>
                            {tr.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => splitClip(clip)}
                        title={isEn ? 'Split clip' : 'Scinder en deux'}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 font-semibold flex items-center gap-1"
                      >
                        <Scissors className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Split' : 'Scinder'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicateClip(clip)}
                        title={isEn ? 'Duplicate clip' : 'Dupliquer'}
                        className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeClip(clip.id)}
                        className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <WaveformPreview
                    buffer={clip.buffer}
                    trimStart={clip.trimStart}
                    trimEnd={clip.trimEnd}
                    color={track?.color || '#3b82f6'}
                  />

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        {isEn ? 'Start (s)' : 'Position début (s)'}
                      </label>
                      <input
                        type="number"
                        step={0.1}
                        min={0}
                        value={clip.startTimeSec}
                        onChange={(e) =>
                          updateClip(clip.id, {
                            startTimeSec: Math.max(0, parseFloat(e.target.value) || 0),
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 tabular-nums"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        {isEn ? 'Trim In (s)' : 'Coupe début (s)'}
                      </label>
                      <input
                        type="number"
                        step={0.1}
                        min={0}
                        max={Math.max(0, clip.trimEnd - 0.1)}
                        value={clip.trimStart}
                        onChange={(e) =>
                          updateClip(clip.id, {
                            trimStart: Math.max(0, parseFloat(e.target.value) || 0),
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 tabular-nums"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        {isEn ? 'Trim Out (s)' : 'Coupe fin (s)'}
                      </label>
                      <input
                        type="number"
                        step={0.1}
                        min={clip.trimStart + 0.1}
                        max={Number(clip.buffer.duration.toFixed(2))}
                        value={clip.trimEnd}
                        onChange={(e) =>
                          updateClip(clip.id, {
                            trimEnd: Math.min(
                              clip.buffer.duration,
                              parseFloat(e.target.value) || clip.buffer.duration
                            ),
                          })
                        }
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 tabular-nums"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        {isEn ? 'Fade In / Out (s)' : 'Fondu E / S (s)'}
                      </label>
                      <div className="grid grid-cols-2 gap-1">
                        <input
                          type="number"
                          step={0.1}
                          min={0}
                          max={5}
                          value={clip.fadeInSec}
                          onChange={(e) =>
                            updateClip(clip.id, {
                              fadeInSec: Math.max(0, parseFloat(e.target.value) || 0),
                            })
                          }
                          className="w-full px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 tabular-nums"
                        />
                        <input
                          type="number"
                          step={0.1}
                          min={0}
                          max={5}
                          value={clip.fadeOutSec}
                          onChange={(e) =>
                            updateClip(clip.id, {
                              fadeOutSec: Math.max(0, parseFloat(e.target.value) || 0),
                            })
                          }
                          className="w-full px-2 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 tabular-nums"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Volume ({Math.round(clip.gain * 100)}%)
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.05}
                        value={clip.gain}
                        onChange={(e) =>
                          updateClip(clip.id, { gain: parseFloat(e.target.value) })
                        }
                        className="w-full mt-2 accent-blue-700"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Pan G/D ({clip.pan === 0 ? 'C' : clip.pan < 0 ? `G${Math.abs(Math.round(clip.pan * 100))}` : `D${Math.round(clip.pan * 100)}`})
                      </label>
                      <input
                        type="range"
                        min={-1}
                        max={1}
                        step={0.1}
                        value={clip.pan}
                        onChange={(e) =>
                          updateClip(clip.id, { pan: parseFloat(e.target.value) })
                        }
                        className="w-full mt-2 accent-amber-600"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-semibold text-slate-500">
                        {isEn ? 'Speed:' : 'Vitesse :'}
                      </span>
                      {[0.75, 0.9, 1.0, 1.15, 1.3].map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => updateClip(clip.id, { playbackRate: rate })}
                          className={`px-2 py-1 rounded-lg font-bold tabular-nums ${
                            clip.playbackRate === rate
                              ? 'bg-blue-700 text-white'
                              : 'bg-slate-100 dark:bg-slate-800'
                          }`}
                        >
                          {rate}x
                        </button>
                      ))}
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={clip.removeSilence}
                        onChange={(e) => updateClip(clip.id, { removeSilence: e.target.checked })}
                        className="accent-blue-700 w-4 h-4"
                      />
                      <span className="font-semibold flex items-center gap-1 text-slate-700 dark:text-slate-200">
                        <Wand2 className="w-3.5 h-3.5 text-amber-500" />
                        <span>{isEn ? 'Auto-trim silences' : 'Supprimer les silences'}</span>
                      </span>
                    </label>
                  </div>
                </div>
              );
            })}

            {clips.length === 0 && (
              <div className="p-8 text-center rounded-2xl bg-white dark:bg-[#0c1631] border border-dashed border-slate-300 dark:border-slate-800 text-xs text-slate-500">
                {isEn
                  ? 'Blank canvas ready — record your microphone, import audio files, download online music, or generate harmonic pads.'
                  : 'Projet vierge prêt — enregistrez au micro, importez un son local, recherchez des musiques en ligne ou créez un accord hors-ligne.'}
              </div>
            )}
          </div>

          {/* Export Controls (always visible so studio never looks truncated) */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Download className="w-4 h-4 text-blue-700 dark:text-blue-400" />
                <span>{isEn ? 'Mix & Final Export' : 'Assemblage & Exportation Finale'}</span>
              </h3>
              {clips.length === 0 && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {isEn
                    ? 'Add at least 1 clip above to mix and export'
                    : 'Ajoutez au moins 1 extrait ci-dessus pour activer l’export'}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isRendering || clips.length === 0}
                onClick={() => handleMixAndExport('mp3')}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2"
              >
                {isRendering ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Music className="w-4 h-4" />
                )}
                <span>{isEn ? 'Mix & Export MP3' : 'Assembler & Exporter MP3'}</span>
              </button>

              <button
                type="button"
                disabled={isRendering || clips.length === 0}
                onClick={() => handleMixAndExport('wav')}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2"
              >
                {isRendering ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Music className="w-4 h-4" />
                )}
                <span>{isEn ? 'Mix & Export WAV' : 'Assembler & Exporter WAV'}</span>
              </button>
            </div>

            {exportedUrl && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                <audio src={exportedUrl} controls className="w-full" />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleDownloadExported}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>
                      {isEn ? 'Save to Phone' : 'Téléphone'} (.{exportedFormat.toUpperCase()})
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveToParole}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Parole Divine</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveToVault}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Vault' : 'Mon Coffre'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleShareExported}
                    className="min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Share' : 'Partager'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <OnlineResourceModal
        isOpen={resourceModalOpen}
        onClose={() => setResourceModalOpen(false)}
        allowedCategories={['audio']}
        defaultCategory="audio"
        onSelectAsset={handleSelectOnlineAudio}
        title={isEn ? 'Music & Sound Effects' : 'Musiques & Effets Sonores'}
      />

      <SocialShareModal
        isOpen={!!sharePayload}
        onClose={() => setSharePayload(null)}
        payload={sharePayload}
      />
    </div>
  );
};
