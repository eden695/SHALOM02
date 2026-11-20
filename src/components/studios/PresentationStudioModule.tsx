import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Presentation,
  Type,
  Shapes,
  Image as ImageIcon,
  Globe,
  Plus,
  Copy,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Play,
  Square,
  Save,
  Download,
  Share2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  X,
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowUp,
  ArrowDown,
  Pause,
} from 'lucide-react';
import { useShalomDB } from '../../hooks/useShalomDB';
import { dbService, STORES } from '../../services/db';
import { useLanguage } from '../../contexts/LanguageContext';
import { useNavigationOptional } from '../../contexts/NavigationContext';
import { DownloadedStudioAsset, StudioProjectRecord } from '../../types';
import { StudioHomePanel, StudioTemplateCard } from './StudioHomePanel';
import { OnlineResourceModal } from './OnlineResourceModal';
import { SocialShareModal } from '../common/SocialShareModal';
import { SharePayload } from '../../services/socialShare';

type SlideAspect = '16:9' | '4:3' | '9:16';
type SlideTransition = 'none' | 'fade' | 'slide' | 'zoom';
type SlideShapeKind = 'rect' | 'roundRect' | 'circle' | 'star' | 'cross' | 'line';

interface SlideBaseElement {
  id: string;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
}

interface SlideTextElement extends SlideBaseElement {
  kind: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  bold: boolean;
  align: 'left' | 'center' | 'right';
}

interface SlideShapeElement extends SlideBaseElement {
  kind: 'shape';
  shape: SlideShapeKind;
  width: number;
  height: number;
  fillColor: string;
}

interface SlideImageElement extends SlideBaseElement {
  kind: 'image';
  label: string;
  width: number;
  height: number;
  imageEl: HTMLImageElement;
  blobKey?: string;
  sourceBlob?: Blob;
}

type SlideElement = SlideTextElement | SlideShapeElement | SlideImageElement;

interface PresentationSlide {
  id: string;
  title: string;
  bgType: 'solid' | 'gradient' | 'image';
  bgColor1: string;
  bgColor2: string;
  bgImageEl?: HTMLImageElement;
  bgImageBlobKey?: string;
  bgImageSourceBlob?: Blob;
  transition: SlideTransition;
  durationSec: number;
  elements: SlideElement[];
}

interface SerializedPresentation {
  version: 1;
  aspect: SlideAspect;
  slides: Array<{
    id: string;
    title: string;
    bgType: 'solid' | 'gradient' | 'image';
    bgColor1: string;
    bgColor2: string;
    bgImageBlobKey?: string;
    transition: SlideTransition;
    durationSec: number;
    elements: Array<
      | SlideTextElement
      | SlideShapeElement
      | {
          id: string;
          kind: 'image';
          x: number;
          y: number;
          rotation: number;
          opacity: number;
          label: string;
          width: number;
          height: number;
          blobKey?: string;
        }
    >;
  }>;
}

const ASPECT_DIMS: Record<SlideAspect, { w: number; h: number; label: string }> = {
  '16:9': { w: 1280, h: 720, label: '16:9 Grand écran (1280×720)' },
  '4:3': { w: 1200, h: 900, label: '4:3 Classique (1200×900)' },
  '9:16': { w: 720, h: 1280, label: '9:16 Mobile (720×1280)' },
};

const PRESENTATION_TEMPLATES: StudioTemplateCard[] = [
  {
    id: 'predication',
    title: 'Prédication du Dimanche',
    subtitle: '4 diapositives · Titre, Verset, Points, Appel',
    formatLabel: '16:9',
    previewBg: 'linear-gradient(135deg, #0b1f42 0%, #1d4ed8 100%)',
    previewAccent: '#fbbf24',
    sampleHeading: 'La Paix qui Surpasse Tout',
    sampleSub: '4 diapos prêtes à personnaliser',
  },
  {
    id: 'etude_biblique',
    title: 'Étude Biblique Structurée',
    subtitle: '3 diapositives · Contexte & Application',
    formatLabel: '16:9',
    previewBg: 'linear-gradient(135deg, #064e3b 0%, #059669 100%)',
    previewAccent: '#fde68a',
    sampleHeading: 'Comprendre & Vivre la Parole',
    sampleSub: '3 diapos structurées',
  },
  {
    id: 'temoignage_deck',
    title: 'Témoignage & Action de grâces',
    subtitle: '3 diapositives · Récit & Reconnaissance',
    formatLabel: '4:3',
    previewBg: 'linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%)',
    previewAccent: '#fbbf24',
    sampleHeading: 'Ce que le Seigneur a fait',
    sampleSub: 'Présentation illustrée',
  },
  {
    id: 'annonce_assemblee',
    title: 'Annonces & Programme',
    subtitle: '3 diapositives · Cultes, Prières, Événements',
    formatLabel: '16:9',
    previewBg: 'linear-gradient(135deg, #7c2d12 0%, #d97706 100%)',
    previewAccent: '#ffffff',
    sampleHeading: 'Programme de la Semaine',
    sampleSub: 'Annonces visuelles claires',
  },
];

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

function renderSlideToCanvas(
  canvas: HTMLCanvasElement,
  slide: PresentationSlide,
  dims: { w: number; h: number },
  selectedElId: string | null,
  showSelection: boolean
) {
  canvas.width = dims.w;
  canvas.height = dims.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (slide.bgType === 'gradient') {
    const g = ctx.createLinearGradient(0, 0, dims.w, dims.h);
    g.addColorStop(0, slide.bgColor1);
    g.addColorStop(1, slide.bgColor2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, dims.w, dims.h);
  } else if (slide.bgType === 'image' && slide.bgImageEl) {
    ctx.fillStyle = slide.bgColor1;
    ctx.fillRect(0, 0, dims.w, dims.h);
    const iRatio = slide.bgImageEl.width / Math.max(1, slide.bgImageEl.height);
    const cRatio = dims.w / dims.h;
    let dw = dims.w;
    let dh = dims.h;
    let dx = 0;
    let dy = 0;
    if (iRatio > cRatio) {
      dh = dims.h;
      dw = dims.h * iRatio;
      dx = (dims.w - dw) / 2;
    } else {
      dw = dims.w;
      dh = dims.w / iRatio;
      dy = (dims.h - dh) / 2;
    }
    ctx.drawImage(slide.bgImageEl, dx, dy, dw, dh);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(0, 0, dims.w, dims.h);
  } else {
    ctx.fillStyle = slide.bgColor1;
    ctx.fillRect(0, 0, dims.w, dims.h);
  }

  for (const el of slide.elements) {
    ctx.save();
    ctx.globalAlpha = el.opacity;
    ctx.translate(el.x, el.y);
    ctx.rotate((el.rotation * Math.PI) / 180);

    if (el.kind === 'shape') {
      ctx.fillStyle = el.fillColor;
      const hw = el.width / 2;
      const hh = el.height / 2;
      ctx.beginPath();
      if (el.shape === 'rect') {
        ctx.rect(-hw, -hh, el.width, el.height);
        ctx.fill();
      } else if (el.shape === 'roundRect') {
        ctx.roundRect(-hw, -hh, el.width, el.height, 24);
        ctx.fill();
      } else if (el.shape === 'circle') {
        ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (el.shape === 'line') {
        ctx.fillRect(-hw, -Math.max(4, hh), el.width, Math.max(6, el.height));
      } else if (el.shape === 'cross') {
        const aw = el.width * 0.28;
        ctx.fillRect(-aw / 2, -hh, aw, el.height);
        ctx.fillRect(-hw * 0.72, -hh * 0.35, el.width * 0.72, aw);
      } else if (el.shape === 'star') {
        const outer = Math.min(hw, hh);
        const inner = outer * 0.45;
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? outer : inner;
          const a = (i * Math.PI) / 5 - Math.PI / 2;
          if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
      }
    } else if (el.kind === 'image') {
      ctx.drawImage(el.imageEl, -el.width / 2, -el.height / 2, el.width, el.height);
    } else if (el.kind === 'text') {
      ctx.font = `${el.bold ? '700 ' : '400 '}${el.fontSize}px ${el.fontFamily}`;
      ctx.textAlign = el.align;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = el.color;
      const lines = el.text.split('\n');
      const lh = el.fontSize * 1.28;
      const startY = -((lines.length - 1) * lh) / 2;
      lines.forEach((ln, idx) => {
        ctx.fillText(ln, 0, startY + idx * lh);
      });
    }

    if (showSelection && el.id === selectedElId) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 6]);
      if (el.kind === 'text') {
        ctx.strokeRect(-260, -60, 520, 120);
      } else {
        ctx.strokeRect(-el.width / 2 - 8, -el.height / 2 - 8, el.width + 16, el.height + 16);
      }
    }

    ctx.restore();
  }
}

export const PresentationStudioModule: React.FC = () => {
  const { lang } = useLanguage();
  const isEn = lang === 'en';
  const nav = useNavigationOptional();
  const { studioProjects, reloadData } = useShalomDB();

  const [viewMode, setViewMode] = useState<'home' | 'editor'>('home');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectTitle, setProjectTitle] = useState(
    isEn ? 'Untitled Presentation' : 'Nouvelle présentation'
  );
  const [aspect, setAspect] = useState<SlideAspect>('16:9');
  const [slides, setSlides] = useState<PresentationSlide[]>([]);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [resourceModalOpen, setResourceModalOpen] = useState(false);
  const [resourceTargetBg, setResourceTargetBg] = useState(false);
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);

  // Slideshow Presentation mode
  const [isPresenting, setIsPresenting] = useState(false);
  const [presentIndex, setPresentIndex] = useState(0);
  const [presentAutoPlay, setPresentAutoPlay] = useState(false);
  const [presentAnimKey, setPresentAnimKey] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const presentCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<{ elId: string; ox: number; oy: number } | null>(null);

  const dims = ASPECT_DIMS[aspect];
  const activeSlide = slides[activeSlideIndex] || null;
  const selectedEl = activeSlide?.elements.find((e) => e.id === selectedElementId) || null;

  const recentPresentationProjects = useMemo(
    () => studioProjects.filter((p) => p.studio === 'presentation'),
    [studioProjects]
  );

  // Sync slideshow overlay with Android back button
  useEffect(() => {
    if (!isPresenting || !nav) return;
    nav.registerOverlay('presentation-slideshow', () => setIsPresenting(false), 'Diaporama');
    return () => nav.unregisterOverlay('presentation-slideshow');
  }, [isPresenting, nav]);

  // Draw active slide on editor canvas
  useEffect(() => {
    if (viewMode !== 'editor' || !activeSlide || !canvasRef.current) return;
    renderSlideToCanvas(canvasRef.current, activeSlide, dims, selectedElementId, true);
  }, [viewMode, activeSlide, dims, selectedElementId]);

  // Draw active slide on fullscreen slideshow canvas
  useEffect(() => {
    if (!isPresenting || !slides[presentIndex] || !presentCanvasRef.current) return;
    renderSlideToCanvas(presentCanvasRef.current, slides[presentIndex], dims, null, false);
  }, [isPresenting, slides, presentIndex, dims]);

  // Slideshow keyboard & autoplay timer
  useEffect(() => {
    if (!isPresenting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsPresenting(false);
      if (e.key === 'ArrowRight' || e.key === ' ') {
        setPresentIndex((i) => Math.min(slides.length - 1, i + 1));
        setPresentAnimKey((k) => k + 1);
      }
      if (e.key === 'ArrowLeft') {
        setPresentIndex((i) => Math.max(0, i - 1));
        setPresentAnimKey((k) => k + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPresenting, slides.length]);

  useEffect(() => {
    if (!isPresenting || !presentAutoPlay || slides.length <= 1) return;
    const dur = Math.max(2, slides[presentIndex]?.durationSec || 5) * 1000;
    const timer = window.setTimeout(() => {
      if (presentIndex < slides.length - 1) {
        setPresentIndex((i) => i + 1);
        setPresentAnimKey((k) => k + 1);
      } else {
        setPresentAutoPlay(false);
      }
    }, dur);
    return () => clearTimeout(timer);
  }, [isPresenting, presentAutoPlay, presentIndex, slides]);

  const startBlankDeck = (formatId?: string) => {
    const nextAspect: SlideAspect =
      formatId === '4:3' || formatId === '9:16' ? formatId : '16:9';
    const d = ASPECT_DIMS[nextAspect];
    setActiveProjectId(null);
    setProjectTitle(isEn ? 'New Presentation' : 'Nouvelle présentation');
    setAspect(nextAspect);
    setSlides([
      {
        id: `sl_${Date.now()}`,
        title: isEn ? 'Slide 1' : 'Diapositive 1',
        bgType: 'gradient',
        bgColor1: '#0b1f42',
        bgColor2: '#1e3a8a',
        transition: 'fade',
        durationSec: 5,
        elements: [
          {
            id: `el_${Date.now()}`,
            kind: 'text',
            x: d.w / 2,
            y: d.h / 2 - 40,
            rotation: 0,
            opacity: 1,
            text: isEn ? 'Presentation Title' : 'Titre de la présentation',
            fontSize: 68,
            fontFamily: '"Outfit", sans-serif',
            color: '#ffffff',
            bold: true,
            align: 'center',
          },
          {
            id: `el_sub_${Date.now()}`,
            kind: 'text',
            x: d.w / 2,
            y: d.h / 2 + 65,
            rotation: 0,
            opacity: 0.9,
            text: isEn ? 'Subtitle or Bible verse' : 'Sous-titre ou verset clé',
            fontSize: 34,
            fontFamily: '"Plus Jakarta Sans", sans-serif',
            color: '#fbbf24',
            bold: false,
            align: 'center',
          },
        ],
      },
    ]);
    setActiveSlideIndex(0);
    setSelectedElementId(null);
    setNotice(null);
    setViewMode('editor');
  };

  const applyTemplate = (templateId: string) => {
    setActiveProjectId(null);
    setNotice(null);

    if (templateId === 'predication') {
      setProjectTitle('Prédication · La Paix qui Surpasse Tout');
      setAspect('16:9');
      setSlides([
        {
          id: 's1',
          title: 'Titre',
          bgType: 'gradient',
          bgColor1: '#0b1f42',
          bgColor2: '#1d4ed8',
          transition: 'fade',
          durationSec: 6,
          elements: [
            {
              id: 'e1',
              kind: 'shape',
              shape: 'cross',
              x: 640,
              y: 170,
              width: 72,
              height: 96,
              fillColor: '#fbbf24',
              rotation: 0,
              opacity: 1,
            },
            {
              id: 'e2',
              kind: 'text',
              text: 'LA PAIX QUI SURPASSE\nTOUTE INTELLIGENCE',
              x: 640,
              y: 360,
              fontSize: 66,
              fontFamily: '"Outfit", sans-serif',
              color: '#ffffff',
              bold: true,
              align: 'center',
              rotation: 0,
              opacity: 1,
            },
            {
              id: 'e3',
              kind: 'text',
              text: 'Philippiens 4 : 6-7 · Message du Dimanche',
              x: 640,
              y: 520,
              fontSize: 32,
              fontFamily: '"Plus Jakarta Sans", sans-serif',
              color: '#fde68a',
              bold: false,
              align: 'center',
              rotation: 0,
              opacity: 1,
            },
          ],
        },
        {
          id: 's2',
          title: 'Verset clé',
          bgType: 'solid',
          bgColor1: '#ffffff',
          bgColor2: '#ffffff',
          transition: 'slide',
          durationSec: 6,
          elements: [
            {
              id: 'e4',
              kind: 'shape',
              shape: 'roundRect',
              x: 640,
              y: 360,
              width: 1120,
              height: 540,
              fillColor: '#f8fafc',
              rotation: 0,
              opacity: 1,
            },
            {
              id: 'e5',
              kind: 'text',
              text: '« Ne vous inquiétez de rien ; mais en toute chose\nfaites connaître vos besoins à Dieu par des prières\net des supplications, avec des actions de grâces. »',
              x: 640,
              y: 340,
              fontSize: 44,
              fontFamily: 'Georgia, "Times New Roman", serif',
              color: '#0f172a',
              bold: true,
              align: 'center',
              rotation: 0,
              opacity: 1,
            },
            {
              id: 'e6',
              kind: 'text',
              text: 'Philippiens 4 : 6',
              x: 640,
              y: 520,
              fontSize: 32,
              fontFamily: '"Outfit", sans-serif',
              color: '#1d4ed8',
              bold: true,
              align: 'center',
              rotation: 0,
              opacity: 1,
            },
          ],
        },
        {
          id: 's3',
          title: '3 Points Clés',
          bgType: 'gradient',
          bgColor1: '#0f172a',
          bgColor2: '#1e293b',
          transition: 'zoom',
          durationSec: 6,
          elements: [
            {
              id: 'e7',
              kind: 'text',
              text: 'TROIS PILIERS DE LA PAIX',
              x: 640,
              y: 140,
              fontSize: 50,
              fontFamily: '"Outfit", sans-serif',
              color: '#fbbf24',
              bold: true,
              align: 'center',
              rotation: 0,
              opacity: 1,
            },
            {
              id: 'e8',
              kind: 'text',
              text: '1. Remplacer l’inquiétude par la prière\n2. Présenter ses besoins avec confiance\n3. Cultiver la reconnaissance chaque jour',
              x: 640,
              y: 390,
              fontSize: 42,
              fontFamily: '"Plus Jakarta Sans", sans-serif',
              color: '#ffffff',
              bold: false,
              align: 'center',
              rotation: 0,
              opacity: 1,
            },
          ],
        },
        {
          id: 's4',
          title: 'Conclusion & Prière',
          bgType: 'gradient',
          bgColor1: '#1d4ed8',
          bgColor2: '#0b1f42',
          transition: 'fade',
          durationSec: 6,
          elements: [
            {
              id: 'e9',
              kind: 'text',
              text: 'Temps de Prière & Consécration',
              x: 640,
              y: 320,
              fontSize: 60,
              fontFamily: '"Outfit", sans-serif',
              color: '#ffffff',
              bold: true,
              align: 'center',
              rotation: 0,
              opacity: 1,
            },
            {
              id: 'e10',
              kind: 'text',
              text: 'Que la paix de Dieu garde nos cœurs cette semaine.',
              x: 640,
              y: 440,
              fontSize: 34,
              fontFamily: '"Plus Jakarta Sans", sans-serif',
              color: '#fde68a',
              bold: false,
              align: 'center',
              rotation: 0,
              opacity: 1,
            },
          ],
        },
      ]);
    } else if (templateId === 'etude_biblique') {
      setProjectTitle('Étude Biblique · Vivre la Parole');
      setAspect('16:9');
      setSlides([
        {
          id: 'eb1',
          title: 'Introduction',
          bgType: 'gradient',
          bgColor1: '#064e3b',
          bgColor2: '#059669',
          transition: 'fade',
          durationSec: 5,
          elements: [
            {
              id: 'eb_t1',
              kind: 'text',
              text: 'ÉTUDE BIBLIQUE\nComprendre & Vivre la Parole',
              x: 640,
              y: 340,
              fontSize: 64,
              fontFamily: '"Outfit", sans-serif',
              color: '#ffffff',
              bold: true,
              align: 'center',
              rotation: 0,
              opacity: 1,
            },
          ],
        },
        {
          id: 'eb2',
          title: 'Contexte',
          bgType: 'solid',
          bgColor1: '#f8fafc',
          bgColor2: '#f8fafc',
          transition: 'slide',
          durationSec: 5,
          elements: [
            {
              id: 'eb_t2',
              kind: 'text',
              text: 'Contexte & Enseignement',
              x: 640,
              y: 160,
              fontSize: 52,
              fontFamily: '"Outfit", sans-serif',
              color: '#064e3b',
              bold: true,
              align: 'center',
              rotation: 0,
              opacity: 1,
            },
            {
              id: 'eb_t3',
              kind: 'text',
              text: '• Auteur et destinataires du texte\n• Promesse principale révélée\n• Vérité spirituelle à retenir',
              x: 640,
              y: 390,
              fontSize: 38,
              fontFamily: '"Plus Jakarta Sans", sans-serif',
              color: '#1e293b',
              bold: false,
              align: 'center',
              rotation: 0,
              opacity: 1,
            },
          ],
        },
        {
          id: 'eb3',
          title: 'Application',
          bgType: 'gradient',
          bgColor1: '#064e3b',
          bgColor2: '#0f172a',
          transition: 'fade',
          durationSec: 5,
          elements: [
            {
              id: 'eb_t4',
              kind: 'text',
              text: 'Application Pratique',
              x: 640,
              y: 260,
              fontSize: 56,
              fontFamily: '"Outfit", sans-serif',
              color: '#fde68a',
              bold: true,
              align: 'center',
              rotation: 0,
              opacity: 1,
            },
            {
              id: 'eb_t5',
              kind: 'text',
              text: 'Quelle action concrète accomplir cette semaine ?',
              x: 640,
              y: 410,
              fontSize: 38,
              fontFamily: '"Plus Jakarta Sans", sans-serif',
              color: '#ffffff',
              bold: false,
              align: 'center',
              rotation: 0,
              opacity: 1,
            },
          ],
        },
      ]);
    } else if (templateId === 'temoignage_deck') {
      setProjectTitle('Témoignage · Fidélité de Dieu');
      setAspect('4:3');
      setSlides([
        {
          id: 'td1',
          title: 'Couverture',
          bgType: 'gradient',
          bgColor1: '#4c1d95',
          bgColor2: '#7c3aed',
          transition: 'fade',
          durationSec: 5,
          elements: [
            {
              id: 'td_t1',
              kind: 'text',
              text: 'CE QUE LE SEIGNEUR A FAIT',
              x: 600,
              y: 420,
              fontSize: 60,
              fontFamily: '"Outfit", sans-serif',
              color: '#ffffff',
              bold: true,
              align: 'center',
              rotation: 0,
              opacity: 1,
            },
            {
              id: 'td_t2',
              kind: 'text',
              text: 'Témoignage & Action de grâces',
              x: 600,
              y: 520,
              fontSize: 34,
              fontFamily: '"Plus Jakarta Sans", sans-serif',
              color: '#fde68a',
              bold: false,
              align: 'center',
              rotation: 0,
              opacity: 1,
            },
          ],
        },
        {
          id: 'td2',
          title: 'Avant / Prière',
          bgType: 'solid',
          bgColor1: '#ffffff',
          bgColor2: '#ffffff',
          transition: 'slide',
          durationSec: 5,
          elements: [
            {
              id: 'td_t3',
              kind: 'text',
              text: 'Le défi & La prière persévérante',
              x: 600,
              y: 260,
              fontSize: 48,
              fontFamily: '"Outfit", sans-serif',
              color: '#4c1d95',
              bold: true,
              align: 'center',
              rotation: 0,
              opacity: 1,
            },
            {
              id: 'td_t4',
              kind: 'text',
              text: 'Racontez ici comment la foi et la prière\nont soutenu votre attente.',
              x: 600,
              y: 480,
              fontSize: 36,
              fontFamily: '"Plus Jakarta Sans", sans-serif',
              color: '#334155',
              bold: false,
              align: 'center',
              rotation: 0,
              opacity: 1,
            },
          ],
        },
        {
          id: 'td3',
          title: 'Exaucement',
          bgType: 'gradient',
          bgColor1: '#5b21b6',
          bgColor2: '#312e81',
          transition: 'zoom',
          durationSec: 5,
          elements: [
            {
              id: 'td_t5',
              kind: 'text',
              text: 'À Dieu seul soit toute la gloire !',
              x: 600,
              y: 430,
              fontSize: 58,
              fontFamily: 'Georgia, "Times New Roman", serif',
              color: '#ffffff',
              bold: true,
              align: 'center',
              rotation: 0,
              opacity: 1,
            },
          ],
        },
      ]);
    } else {
      setProjectTitle('Annonces de l’Assemblée');
      setAspect('16:9');
      setSlides([
        {
          id: 'an1',
          title: 'Bienvenue',
          bgType: 'gradient',
          bgColor1: '#7c2d12',
          bgColor2: '#d97706',
          transition: 'fade',
          durationSec: 5,
          elements: [
            {
              id: 'an_t1',
              kind: 'text',
              text: 'PROGRAMME DE LA SEMAINE',
              x: 640,
              y: 330,
              fontSize: 64,
              fontFamily: '"Outfit", sans-serif',
              color: '#ffffff',
              bold: true,
              align: 'center',
              rotation: 0,
              opacity: 1,
            },
            {
              id: 'an_t2',
              kind: 'text',
              text: 'Soyez les bienvenus dans la joie du Seigneur',
              x: 640,
              y: 440,
              fontSize: 34,
              fontFamily: '"Plus Jakarta Sans", sans-serif',
              color: '#fef3c7',
              bold: false,
              align: 'center',
              rotation: 0,
              opacity: 1,
            },
          ],
        },
        {
          id: 'an2',
          title: 'Réunions',
          bgType: 'solid',
          bgColor1: '#fffbeb',
          bgColor2: '#fffbeb',
          transition: 'slide',
          durationSec: 5,
          elements: [
            {
              id: 'an_t3',
              kind: 'text',
              text: 'Mercredi 18h30 · Étude biblique\nVendredi 19h00 · Intercession\nDimanche 09h30 · Culte d’adoration',
              x: 640,
              y: 360,
              fontSize: 44,
              fontFamily: '"Outfit", sans-serif',
              color: '#7c2d12',
              bold: true,
              align: 'center',
              rotation: 0,
              opacity: 1,
            },
          ],
        },
      ]);
    }

    setActiveSlideIndex(0);
    setSelectedElementId(null);
    setViewMode('editor');
  };

  const openSavedProject = async (project: StudioProjectRecord) => {
    try {
      const parsed = JSON.parse(project.dataJson) as SerializedPresentation;
      setActiveProjectId(project.id);
      setProjectTitle(project.title);
      setAspect(parsed.aspect || '16:9');

      const hydratedSlides: PresentationSlide[] = [];
      for (const s of parsed.slides || []) {
        let bgImageEl: HTMLImageElement | undefined;
        if (s.bgImageBlobKey) {
          const bgBlob = await dbService.getMediaBlob(s.bgImageBlobKey);
          if (bgBlob) bgImageEl = await loadImageFromBlob(bgBlob);
        }
        const els: SlideElement[] = [];
        for (const el of s.elements || []) {
          if (el.kind === 'image') {
            if (el.blobKey) {
              const b = await dbService.getMediaBlob(el.blobKey);
              if (b) {
                const img = await loadImageFromBlob(b);
                els.push({ ...el, imageEl: img });
              }
            }
          } else {
            els.push(el);
          }
        }
        hydratedSlides.push({
          id: s.id,
          title: s.title,
          bgType: s.bgType,
          bgColor1: s.bgColor1,
          bgColor2: s.bgColor2,
          bgImageEl,
          bgImageBlobKey: s.bgImageBlobKey,
          transition: s.transition || 'fade',
          durationSec: s.durationSec || 5,
          elements: els,
        });
      }

      if (hydratedSlides.length === 0) {
        startBlankDeck(parsed.aspect);
        return;
      }

      setSlides(hydratedSlides);
      setActiveSlideIndex(0);
      setSelectedElementId(null);
      setNotice(null);
      setViewMode('editor');
    } catch {
      setNotice(
        isEn ? 'Unable to open this presentation.' : 'Impossible d’ouvrir cette présentation.'
      );
    }
  };

  const handleDuplicateProject = async (project: StudioProjectRecord) => {
    const now = new Date().toISOString();
    const copy: StudioProjectRecord = {
      ...project,
      id: `proj_pres_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      title: `${project.title} (${isEn ? 'Copy' : 'Copie'})`,
      createdAt: now,
      updatedAt: now,
    };
    await dbService.put(STORES.STUDIO_PROJECTS, copy);
    await reloadData();
  };

  const handleDeleteProject = async (project: StudioProjectRecord) => {
    await dbService.deleteItem(STORES.STUDIO_PROJECTS, project.id);
    await reloadData();
  };

  const handleSaveProject = async () => {
    const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const serializedSlides: SerializedPresentation['slides'] = [];
    const nextSlides: PresentationSlide[] = [];

    for (let si = 0; si < slides.length; si++) {
      const s = slides[si];
      let bgKey = s.bgImageBlobKey;
      if (s.bgType === 'image' && !bgKey && s.bgImageSourceBlob) {
        bgKey = `blob_pres_bg_${uid}_${si}`;
        await dbService.saveMediaBlob(bgKey, s.bgImageSourceBlob, s.bgImageSourceBlob.type || 'image/png');
      }

      const serEls: SerializedPresentation['slides'][number]['elements'] = [];
      const runEls: SlideElement[] = [];

      for (let ei = 0; ei < s.elements.length; ei++) {
        const el = s.elements[ei];
        if (el.kind === 'image') {
          let elKey = el.blobKey;
          if (!elKey && el.sourceBlob) {
            elKey = `blob_pres_img_${uid}_${si}_${ei}`;
            await dbService.saveMediaBlob(elKey, el.sourceBlob, el.sourceBlob.type || 'image/png');
          }
          runEls.push({ ...el, blobKey: elKey });
          serEls.push({
            id: el.id,
            kind: 'image',
            x: el.x,
            y: el.y,
            rotation: el.rotation,
            opacity: el.opacity,
            label: el.label,
            width: el.width,
            height: el.height,
            blobKey: elKey,
          });
        } else {
          runEls.push(el);
          serEls.push(el);
        }
      }

      nextSlides.push({ ...s, bgImageBlobKey: bgKey, elements: runEls });
      serializedSlides.push({
        id: s.id,
        title: s.title,
        bgType: s.bgType,
        bgColor1: s.bgColor1,
        bgColor2: s.bgColor2,
        bgImageBlobKey: bgKey,
        transition: s.transition,
        durationSec: s.durationSec,
        elements: serEls,
      });
    }

    setSlides(nextSlides);
    const now = new Date().toISOString();
    const projectId = activeProjectId || `proj_pres_${uid}`;
    const existing = activeProjectId
      ? recentPresentationProjects.find((p) => p.id === activeProjectId)
      : undefined;

    let thumbnailBlobKey = existing?.thumbnailBlobKey;
    if (nextSlides.length > 0) {
      const fullCanvas = document.createElement('canvas');
      renderSlideToCanvas(fullCanvas, nextSlides[0], dims, null, false);
      const maxThumbW = 360;
      const scale = Math.min(1, maxThumbW / Math.max(1, fullCanvas.width));
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = Math.max(1, Math.round(fullCanvas.width * scale));
      thumbCanvas.height = Math.max(1, Math.round(fullCanvas.height * scale));
      const tctx = thumbCanvas.getContext('2d');
      if (tctx) {
        tctx.drawImage(fullCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
        const thumbBlob = await new Promise<Blob | null>((resolve) =>
          thumbCanvas.toBlob((b) => resolve(b), 'image/jpeg', 0.78)
        );
        if (thumbBlob) {
          thumbnailBlobKey = `blob_thumb_${projectId}`;
          await dbService.saveMediaBlob(thumbnailBlobKey, thumbBlob, 'image/jpeg');
        }
      }
    }

    const record: StudioProjectRecord = {
      id: projectId,
      studio: 'presentation',
      title: projectTitle.trim() || (isEn ? 'Untitled Presentation' : 'Présentation sans titre'),
      formatLabel: `${aspect} · ${slides.length} diapo(s)`,
      thumbnailBlobKey,
      dataJson: JSON.stringify({
        version: 1,
        aspect,
        slides: serializedSlides,
      } satisfies SerializedPresentation),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    await dbService.put(STORES.STUDIO_PROJECTS, record);
    setActiveProjectId(projectId);
    await reloadData();
    setNotice(isEn ? 'Presentation saved locally!' : 'Présentation enregistrée avec succès !');
  };

  const updateActiveSlide = useCallback(
    (patch: Partial<PresentationSlide>) => {
      setSlides((prev) =>
        prev.map((s, idx) => (idx === activeSlideIndex ? { ...s, ...patch } : s))
      );
    },
    [activeSlideIndex]
  );

  const updateSelectedElement = (patch: Partial<SlideElement>) => {
    if (!activeSlide || !selectedElementId) return;
    updateActiveSlide({
      elements: activeSlide.elements.map((el) =>
        el.id === selectedElementId ? ({ ...el, ...patch } as SlideElement) : el
      ),
    });
  };

  const addSlide = () => {
    const newSlide: PresentationSlide = {
      id: `sl_${Date.now()}`,
      title: `${isEn ? 'Slide' : 'Diapo'} ${slides.length + 1}`,
      bgType: activeSlide?.bgType === 'gradient' ? 'gradient' : 'solid',
      bgColor1: activeSlide?.bgColor1 || '#0b1f42',
      bgColor2: activeSlide?.bgColor2 || '#1e3a8a',
      transition: 'fade',
      durationSec: 5,
      elements: [
        {
          id: `el_${Date.now()}`,
          kind: 'text',
          x: dims.w / 2,
          y: dims.h / 2,
          rotation: 0,
          opacity: 1,
          text: isEn ? 'New Slide' : 'Nouvelle diapositive',
          fontSize: 56,
          fontFamily: '"Outfit", sans-serif',
          color: '#ffffff',
          bold: true,
          align: 'center',
        },
      ],
    };
    const nextIdx = activeSlideIndex + 1;
    setSlides((prev) => [...prev.slice(0, nextIdx), newSlide, ...prev.slice(nextIdx)]);
    setActiveSlideIndex(nextIdx);
    setSelectedElementId(null);
  };

  const duplicateSlide = () => {
    if (!activeSlide) return;
    const copy: PresentationSlide = {
      ...activeSlide,
      id: `sl_${Date.now()}`,
      title: `${activeSlide.title} (copie)`,
      elements: activeSlide.elements.map((el, i) => ({
        ...el,
        id: `${el.id}_cp_${i}_${Date.now()}`,
      })),
    };
    const nextIdx = activeSlideIndex + 1;
    setSlides((prev) => [...prev.slice(0, nextIdx), copy, ...prev.slice(nextIdx)]);
    setActiveSlideIndex(nextIdx);
  };

  const deleteActiveSlide = () => {
    if (slides.length <= 1) return;
    setSlides((prev) => prev.filter((_, idx) => idx !== activeSlideIndex));
    setActiveSlideIndex((idx) => Math.max(0, idx - 1));
    setSelectedElementId(null);
  };

  const moveSlide = (dir: -1 | 1) => {
    const target = activeSlideIndex + dir;
    if (target < 0 || target >= slides.length) return;
    setSlides((prev) => {
      const next = [...prev];
      const tmp = next[activeSlideIndex];
      next[activeSlideIndex] = next[target];
      next[target] = tmp;
      return next;
    });
    setActiveSlideIndex(target);
  };

  const addTextElement = () => {
    if (!activeSlide) return;
    const id = `el_txt_${Date.now()}`;
    const next: SlideTextElement = {
      id,
      kind: 'text',
      x: dims.w / 2,
      y: dims.h / 2,
      rotation: 0,
      opacity: 1,
      text: isEn ? 'New Text' : 'Nouveau texte',
      fontSize: 48,
      fontFamily: '"Outfit", sans-serif',
      color: activeSlide.bgColor1 === '#ffffff' ? '#0f172a' : '#ffffff',
      bold: true,
      align: 'center',
    };
    updateActiveSlide({ elements: [...activeSlide.elements, next] });
    setSelectedElementId(id);
  };

  const addShapeElement = (shape: SlideShapeKind) => {
    if (!activeSlide) return;
    const id = `el_shp_${Date.now()}`;
    const next: SlideShapeElement = {
      id,
      kind: 'shape',
      shape,
      x: dims.w / 2,
      y: dims.h / 2,
      width: shape === 'line' ? 420 : 180,
      height: shape === 'line' ? 8 : 180,
      fillColor: '#fbbf24',
      rotation: 0,
      opacity: 1,
    };
    updateActiveSlide({ elements: [...activeSlide.elements, next] });
    setSelectedElementId(id);
  };

  const insertImageOnSlide = async (
    blob: Blob,
    label: string,
    asBg = false,
    blobKey?: string
  ) => {
    if (!activeSlide) return;
    const img = await loadImageFromBlob(blob);
    if (asBg) {
      updateActiveSlide({
        bgType: 'image',
        bgImageEl: img,
        bgImageBlobKey: blobKey,
        bgImageSourceBlob: blobKey ? undefined : blob,
      });
      return;
    }
    const ratio = img.width / Math.max(1, img.height);
    const w = 320;
    const h = Math.max(40, Math.round(w / ratio));
    const id = `el_img_${Date.now()}`;
    const next: SlideImageElement = {
      id,
      kind: 'image',
      label,
      x: dims.w / 2,
      y: dims.h / 2,
      width: w,
      height: h,
      rotation: 0,
      opacity: 1,
      imageEl: img,
      blobKey,
      sourceBlob: blobKey ? undefined : blob,
    };
    updateActiveSlide({ elements: [...activeSlide.elements, next] });
    setSelectedElementId(id);
  };

  const handleLocalSlideImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await insertImageOnSlide(file, file.name, false);
    e.target.value = '';
  };

  const handleSelectOnlineAsset = async (asset: DownloadedStudioAsset, blob: Blob) => {
    await insertImageOnSlide(
      blob,
      asset.title,
      resourceTargetBg || asset.category === 'background',
      asset.blobKey
    );
  };

  const getPt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * dims.w,
      y: ((e.clientY - r.top) / r.height) * dims.h,
    };
  };

  const handleCanvasDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeSlide) return;
    const pt = getPt(e);
    for (let i = activeSlide.elements.length - 1; i >= 0; i--) {
      const el = activeSlide.elements[i];
      const hw = el.kind === 'text' ? 260 : el.width / 2 + 16;
      const hh = el.kind === 'text' ? 80 : el.height / 2 + 16;
      if (Math.abs(pt.x - el.x) <= hw && Math.abs(pt.y - el.y) <= hh) {
        setSelectedElementId(el.id);
        dragRef.current = { elId: el.id, ox: pt.x - el.x, oy: pt.y - el.y };
        return;
      }
    }
    setSelectedElementId(null);
  };

  const handleCanvasMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current || !activeSlide) return;
    const pt = getPt(e);
    const { elId, ox, oy } = dragRef.current;
    updateActiveSlide({
      elements: activeSlide.elements.map((el) =>
        el.id === elId ? { ...el, x: pt.x - ox, y: pt.y - oy } : el
      ),
    });
  };

  const handleCanvasUp = () => {
    dragRef.current = null;
  };

  const deleteSelectedEl = () => {
    if (!activeSlide || !selectedElementId) return;
    updateActiveSlide({
      elements: activeSlide.elements.filter((el) => el.id !== selectedElementId),
    });
    setSelectedElementId(null);
  };

  const moveSelectedLayerOrder = (dir: -1 | 1) => {
    if (!activeSlide || !selectedElementId) return;
    const idx = activeSlide.elements.findIndex((e) => e.id === selectedElementId);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= activeSlide.elements.length) return;
    const next = [...activeSlide.elements];
    const tmp = next[idx];
    next[idx] = next[target];
    next[target] = tmp;
    updateActiveSlide({ elements: next });
  };

  const exportActiveSlidePng = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!activeSlide || !canvasRef.current) {
        resolve(null);
        return;
      }
      renderSlideToCanvas(canvasRef.current, activeSlide, dims, null, false);
      canvasRef.current.toBlob((blob) => {
        if (canvasRef.current && activeSlide) {
          renderSlideToCanvas(canvasRef.current, activeSlide, dims, selectedElementId, true);
        }
        resolve(blob);
      }, 'image/png');
    });
  };

  const handleDownloadSlide = async () => {
    const blob = await exportActiveSlidePng();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'slide'}_${activeSlideIndex + 1}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleShareSlide = async () => {
    const blob = await exportActiveSlidePng();
    if (!blob) return;
    const file = new File([blob], `shalom_slide_${activeSlideIndex + 1}.png`, {
      type: 'image/png',
    });
    setSharePayload({
      title: projectTitle,
      text: `${projectTitle} (${activeSlide?.title || ''})\n\nCréé dans SHALOM Studio de Présentation`,
      file,
    });
  };

  const slideAnimClass = useMemo(() => {
    const tr = slides[presentIndex]?.transition || 'fade';
    if (tr === 'none') return '';
    if (tr === 'slide') return 'animate-in fade-in slide-in-from-right-8 duration-300';
    if (tr === 'zoom') return 'animate-in fade-in zoom-in-95 duration-300';
    return 'animate-in fade-in duration-300';
  }, [slides, presentIndex]);

  return (
    <div className="space-y-6">
      {viewMode === 'home' ? (
        <StudioHomePanel
          studio="presentation"
          studioTitle={isEn ? 'Presentation Studio' : 'Studio de Présentation'}
          studioDescription={
            isEn
              ? 'Create multi-slide presentations for sermons, Bible studies & events with interactive slideshow playback.'
              : 'Créez des présentations multi-diapositives pour vos prédications, études bibliques et annonces avec mode diaporama interactif.'
          }
          headerIcon={<Presentation className="w-5 h-5 text-amber-300" />}
          blankLabel={isEn ? 'New Presentation' : 'Nouvelle présentation'}
          blankFormats={[
            { id: '16:9', label: 'Grand Écran 16:9', dimensions: '1280×720' },
            { id: '4:3', label: 'Classique 4:3', dimensions: '1200×900' },
            { id: '9:16', label: 'Mobile 9:16', dimensions: '720×1280' },
          ]}
          templates={PRESENTATION_TEMPLATES}
          recentProjects={recentPresentationProjects}
          onCreateBlank={startBlankDeck}
          onSelectTemplate={applyTemplate}
          onOpenProject={openSavedProject}
          onDuplicateProject={handleDuplicateProject}
          onDeleteProject={handleDeleteProject}
        />
      ) : (
        <div className="space-y-4">
          {/* Header Bar */}
          <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setViewMode('home')}
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

            <div className="studio-scroll-x flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setPresentIndex(activeSlideIndex);
                  setPresentAnimKey((k) => k + 1);
                  setIsPresenting(true);
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1.5 shrink-0"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{isEn ? 'Present' : 'Diaporama'}</span>
              </button>

              <button
                type="button"
                onClick={handleSaveProject}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#0b1f42] dark:bg-blue-700 text-white font-bold flex items-center gap-1.5 shrink-0"
              >
                <Save className="w-4 h-4" />
                <span>{isEn ? 'Save' : 'Sauver'}</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadSlide}
                title={isEn ? 'Export Slide PNG' : 'Télécharger cette diapo PNG'}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold flex items-center gap-1.5 shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>PNG</span>
              </button>

              <button
                type="button"
                onClick={handleShareSlide}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold flex items-center gap-1.5 shrink-0"
              >
                <Share2 className="w-4 h-4" />
                <span className="hidden sm:inline">{isEn ? 'Share' : 'Partager'}</span>
              </button>
            </div>
          </div>

          {notice && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{notice}</span>
              </span>
              <button type="button" onClick={() => setNotice(null)} className="underline">
                OK
              </button>
            </div>
          )}

          {/* Element Insertion Toolbar */}
          <div className="p-3 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 text-xs">
            <div className="studio-scroll-x flex items-center gap-2">
              <button
                type="button"
                onClick={addTextElement}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-blue-700 text-white font-bold flex items-center gap-1.5 shrink-0"
              >
                <Type className="w-4 h-4" />
                <span>+ {isEn ? 'Text' : 'Texte'}</span>
              </button>
              <button
                type="button"
                onClick={() => addShapeElement('cross')}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold shrink-0"
              >
                ✝ {isEn ? 'Cross' : 'Croix'}
              </button>
              <button
                type="button"
                onClick={() => addShapeElement('roundRect')}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold shrink-0"
              >
                ▢ {isEn ? 'Card' : 'Cadre'}
              </button>
              <button
                type="button"
                onClick={() => addShapeElement('star')}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold shrink-0"
              >
                ★ {isEn ? 'Star' : 'Étoile'}
              </button>
              <button
                type="button"
                onClick={() => addShapeElement('line')}
                className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold shrink-0"
              >
                ― {isEn ? 'Line' : 'Ligne'}
              </button>
              <label className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold flex items-center gap-1.5 cursor-pointer shrink-0">
                <ImageIcon className="w-4 h-4" />
                <span>+ {isEn ? 'Photo' : 'Photo'}</span>
                <input type="file" accept="image/*" onChange={handleLocalSlideImage} className="hidden" />
              </label>
              <button
                type="button"
                onClick={() => {
                  setResourceTargetBg(false);
                  setResourceModalOpen(true);
                }}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-amber-500 text-slate-950 font-extrabold flex items-center gap-1.5 shrink-0"
              >
                <Globe className="w-4 h-4" />
                <span>{isEn ? 'Online Assets' : 'Ressources & Icônes'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Active Slide Canvas */}
            <div className="lg:col-span-8 space-y-3">
              <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 flex items-center justify-center">
                <canvas
                  ref={canvasRef}
                  onPointerDown={handleCanvasDown}
                  onPointerMove={handleCanvasMove}
                  onPointerUp={handleCanvasUp}
                  onPointerLeave={handleCanvasUp}
                  className="max-w-full max-h-[440px] w-auto h-auto rounded-xl shadow-xl touch-none cursor-move bg-slate-950"
                />
              </div>

              {/* Multi-Slide Strip */}
              <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 dark:text-white">
                    {isEn
                      ? `Slides (${activeSlideIndex + 1} / ${slides.length})`
                      : `Diapositives (${activeSlideIndex + 1} / ${slides.length})`}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => moveSlide(-1)}
                      disabled={activeSlideIndex === 0}
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 disabled:opacity-40"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSlide(1)}
                      disabled={activeSlideIndex === slides.length - 1}
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 disabled:opacity-40"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={duplicateSlide}
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800"
                      title={isEn ? 'Duplicate Slide' : 'Dupliquer diapo'}
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={deleteActiveSlide}
                      disabled={slides.length <= 1}
                      className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-red-600 hover:bg-red-50 disabled:opacity-40"
                      title={isEn ? 'Delete Slide' : 'Supprimer diapo'}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={addSlide}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-blue-700 text-white font-bold flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{isEn ? 'Slide' : 'Diapo'}</span>
                    </button>
                  </div>
                </div>

                <div className="studio-scroll-x flex gap-2.5 pb-1">
                  {slides.map((sl, idx) => (
                    <button
                      key={sl.id}
                      type="button"
                      onClick={() => {
                        setActiveSlideIndex(idx);
                        setSelectedElementId(null);
                      }}
                      style={{
                        background:
                          sl.bgType === 'gradient'
                            ? `linear-gradient(135deg, ${sl.bgColor1}, ${sl.bgColor2})`
                            : sl.bgColor1,
                      }}
                      className={`w-32 h-20 rounded-xl p-2 text-left shrink-0 border-2 flex flex-col justify-between transition ${
                        idx === activeSlideIndex
                          ? 'border-blue-500 ring-2 ring-blue-500/30'
                          : 'border-slate-300 dark:border-slate-700 opacity-85'
                      }`}
                    >
                      <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-black/45 text-white self-start tabular-nums">
                        {idx + 1}
                      </span>
                      <span className="text-[11px] font-bold truncate px-1 py-0.5 rounded bg-black/45 text-white">
                        {sl.title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Properties Panel */}
            <div className="lg:col-span-4 space-y-4 text-xs">
              {activeSlide && (
                <div className="p-4 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 space-y-3">
                  <h4 className="font-bold uppercase tracking-wider text-slate-500">
                    {isEn ? 'Slide Settings' : 'Réglages diapositive'}
                  </h4>
                  <input
                    type="text"
                    value={activeSlide.title}
                    onChange={(e) => updateActiveSlide({ title: e.target.value })}
                    placeholder="Titre interne diapo"
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-semibold"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Transition
                      </label>
                      <select
                        value={activeSlide.transition}
                        onChange={(e) =>
                          updateActiveSlide({ transition: e.target.value as SlideTransition })
                        }
                        className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                      >
                        <option value="fade">Fondu</option>
                        <option value="slide">Glissement</option>
                        <option value="zoom">Zoom doux</option>
                        <option value="none">Aucune</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        Durée (s)
                      </label>
                      <input
                        type="number"
                        min={2}
                        max={60}
                        value={activeSlide.durationSec}
                        onChange={(e) =>
                          updateActiveSlide({
                            durationSec: Math.max(2, parseInt(e.target.value, 10) || 5),
                          })
                        }
                        className="w-full min-h-[40px] px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 items-center">
                    <button
                      type="button"
                      onClick={() => updateActiveSlide({ bgType: 'solid' })}
                      className={`px-2.5 py-1.5 rounded-lg font-semibold ${
                        activeSlide.bgType === 'solid'
                          ? 'bg-blue-700 text-white'
                          : 'bg-slate-100 dark:bg-slate-800'
                      }`}
                    >
                      Uni
                    </button>
                    <button
                      type="button"
                      onClick={() => updateActiveSlide({ bgType: 'gradient' })}
                      className={`px-2.5 py-1.5 rounded-lg font-semibold ${
                        activeSlide.bgType === 'gradient'
                          ? 'bg-blue-700 text-white'
                          : 'bg-slate-100 dark:bg-slate-800'
                      }`}
                    >
                      Dégradé
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setResourceTargetBg(true);
                        setResourceModalOpen(true);
                      }}
                      className="px-2.5 py-1.5 rounded-lg font-semibold bg-amber-500 text-slate-950 flex items-center gap-1"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>Fond en ligne</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 font-semibold">
                      <span>C1</span>
                      <input
                        type="color"
                        value={activeSlide.bgColor1}
                        onChange={(e) => updateActiveSlide({ bgColor1: e.target.value })}
                        className="w-8 h-7 rounded cursor-pointer"
                      />
                    </label>
                    {activeSlide.bgType === 'gradient' && (
                      <label className="flex items-center gap-1.5 font-semibold">
                        <span>C2</span>
                        <input
                          type="color"
                          value={activeSlide.bgColor2}
                          onChange={(e) => updateActiveSlide({ bgColor2: e.target.value })}
                          className="w-8 h-7 rounded cursor-pointer"
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}

              {selectedEl ? (
                <div className="p-4 rounded-2xl bg-white dark:bg-[#0c1631] border border-blue-400 dark:border-blue-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                      {isEn ? 'Selected Element' : 'Élément sélectionné'}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveSelectedLayerOrder(-1)}
                        className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSelectedLayerOrder(1)}
                        className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={deleteSelectedEl}
                        className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {selectedEl.kind === 'text' && (
                    <div className="space-y-2.5">
                      <textarea
                        rows={3}
                        value={selectedEl.text}
                        onChange={(e) => updateSelectedElement({ text: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="color"
                          value={selectedEl.color}
                          onChange={(e) => updateSelectedElement({ color: e.target.value })}
                          className="w-8 h-8 rounded cursor-pointer"
                        />
                        <input
                          type="number"
                          min={16}
                          max={140}
                          value={selectedEl.fontSize}
                          onChange={(e) =>
                            updateSelectedElement({
                              fontSize: Math.max(16, parseInt(e.target.value, 10) || 40),
                            })
                          }
                          className="w-20 min-h-[38px] px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() => updateSelectedElement({ bold: !selectedEl.bold })}
                          className={`min-w-[38px] min-h-[38px] rounded-lg font-bold ${
                            selectedEl.bold ? 'bg-blue-700 text-white' : 'bg-slate-100 dark:bg-slate-800'
                          }`}
                        >
                          G
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSelectedElement({ align: 'left' })}
                          className={`min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg ${
                            selectedEl.align === 'left'
                              ? 'bg-blue-700 text-white'
                              : 'bg-slate-100 dark:bg-slate-800'
                          }`}
                        >
                          <AlignLeft className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSelectedElement({ align: 'center' })}
                          className={`min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg ${
                            selectedEl.align === 'center'
                              ? 'bg-blue-700 text-white'
                              : 'bg-slate-100 dark:bg-slate-800'
                          }`}
                        >
                          <AlignCenter className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => updateSelectedElement({ align: 'right' })}
                          className={`min-w-[38px] min-h-[38px] flex items-center justify-center rounded-lg ${
                            selectedEl.align === 'right'
                              ? 'bg-blue-700 text-white'
                              : 'bg-slate-100 dark:bg-slate-800'
                          }`}
                        >
                          <AlignRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedEl.kind === 'shape' && (
                    <div className="space-y-2">
                      <label className="flex items-center justify-between font-semibold">
                        <span>Couleur</span>
                        <input
                          type="color"
                          value={selectedEl.fillColor}
                          onChange={(e) => updateSelectedElement({ fillColor: e.target.value })}
                          className="w-8 h-7 rounded"
                        />
                      </label>
                      <div>
                        <span className="block mb-1">Largeur ({selectedEl.width}px)</span>
                        <input
                          type="range"
                          min={40}
                          max={1200}
                          value={selectedEl.width}
                          onChange={(e) =>
                            updateSelectedElement({ width: parseInt(e.target.value, 10) })
                          }
                          className="w-full"
                        />
                      </div>
                      <div>
                        <span className="block mb-1">Hauteur ({selectedEl.height}px)</span>
                        <input
                          type="range"
                          min={6}
                          max={900}
                          value={selectedEl.height}
                          onChange={(e) =>
                            updateSelectedElement({ height: parseInt(e.target.value, 10) })
                          }
                          className="w-full"
                        />
                      </div>
                    </div>
                  )}

                  {selectedEl.kind === 'image' && (
                    <div className="space-y-2">
                      <div>
                        <span className="block mb-1">Largeur ({selectedEl.width}px)</span>
                        <input
                          type="range"
                          min={60}
                          max={1100}
                          value={selectedEl.width}
                          onChange={(e) => {
                            const nextW = parseInt(e.target.value, 10);
                            const ratio = selectedEl.width / Math.max(1, selectedEl.height);
                            updateSelectedElement({
                              width: nextW,
                              height: Math.round(nextW / ratio),
                            });
                          }}
                          className="w-full"
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <span className="block mb-1">Rotation ({selectedEl.rotation}°)</span>
                      <input
                        type="range"
                        min={-180}
                        max={180}
                        value={selectedEl.rotation}
                        onChange={(e) =>
                          updateSelectedElement({ rotation: parseInt(e.target.value, 10) })
                        }
                        className="w-full"
                      />
                    </div>
                    <div>
                      <span className="block mb-1">
                        Opacité ({Math.round(selectedEl.opacity * 100)}%)
                      </span>
                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={selectedEl.opacity}
                        onChange={(e) =>
                          updateSelectedElement({ opacity: parseFloat(e.target.value) })
                        }
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-dashed border-slate-300 dark:border-slate-800 text-slate-500 text-center">
                  {isEn
                    ? 'Tap any element on the slide to move, edit or style it.'
                    : 'Touchez un texte, une forme ou une image sur la diapositive pour la modifier ou la déplacer.'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Interactive Slideshow Modal */}
      {isPresenting && (
        <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col justify-between p-4 text-white">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-bold text-slate-300 truncate">
              {projectTitle} · Diapo {presentIndex + 1} / {slides.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPresentAutoPlay((p) => !p)}
                className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold flex items-center gap-1.5"
              >
                {presentAutoPlay ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{presentAutoPlay ? 'Pause auto' : 'Lecture auto'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPresentAutoPlay(false);
                  setIsPresenting(false);
                }}
                aria-label="Quitter le diaporama"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex-1 flex items-center justify-center overflow-hidden py-4">
            <canvas
              key={presentAnimKey}
              ref={presentCanvasRef}
              className={`max-w-full max-h-full w-auto h-auto rounded-2xl shadow-2xl ${slideAnimClass}`}
            />
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={presentIndex === 0}
              onClick={() => {
                setPresentIndex((i) => Math.max(0, i - 1));
                setPresentAnimKey((k) => k + 1);
              }}
              className="min-h-[48px] px-5 py-2.5 rounded-2xl bg-white/15 hover:bg-white/25 disabled:opacity-30 font-bold text-xs flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>{isEn ? 'Previous' : 'Précédente'}</span>
            </button>

            <button
              type="button"
              disabled={presentIndex === slides.length - 1}
              onClick={() => {
                setPresentIndex((i) => Math.min(slides.length - 1, i + 1));
                setPresentAnimKey((k) => k + 1);
              }}
              className="min-h-[48px] px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-30 font-bold text-xs flex items-center gap-1.5"
            >
              <span>{isEn ? 'Next' : 'Suivante'}</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <OnlineResourceModal
        isOpen={resourceModalOpen}
        onClose={() => setResourceModalOpen(false)}
        allowedCategories={['photo', 'illustration', 'icon', 'background']}
        defaultCategory={resourceTargetBg ? 'background' : 'photo'}
        onSelectAsset={handleSelectOnlineAsset}
        title={isEn ? 'Presentation Assets' : 'Ressources pour Présentation'}
      />

      <SocialShareModal
        isOpen={!!sharePayload}
        onClose={() => setSharePayload(null)}
        payload={sharePayload}
      />
    </div>
  );
};
