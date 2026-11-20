import React, { useState, useEffect } from 'react';
import {
  Share2,
  Copy,
  Download,
  CheckCircle2,
  ExternalLink,
  Smartphone,
  MessageCircle,
  Mail,
} from 'lucide-react';
import { Modal } from './Modal';
import {
  SharePayload,
  tryNativeShare,
  copyTextQuietly,
  triggerFileDownload,
  buildPlatformShareUrl,
  buildGmailMailtoUrl,
} from '../../services/socialShare';

interface SocialShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  payload: SharePayload | null;
}

const GmailBadgeIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path fill="#4285F4" d="M22 6.25V18a2 2 0 0 1-2 2h-2.5V11.2L12 15.3 6.5 11.2V20H4a2 2 0 0 1-2-2V6.25A2.25 2.25 0 0 1 5.6 4.45L12 9.25l6.4-4.8A2.25 2.25 0 0 1 22 6.25Z" />
    <path fill="#34A853" d="M17.5 20H20a2 2 0 0 0 2-2V6.25a2.25 2.25 0 0 0-3.6-1.8L17.5 5.13V20Z" />
    <path fill="#FBBC05" d="M6.5 20H4a2 2 0 0 1-2-2V6.25a2.25 2.25 0 0 1 3.6-1.8l.9.68V20Z" />
    <path fill="#EA4335" d="M12 15.3 2 7.8V6.25a2.25 2.25 0 0 1 3.6-1.8L12 9.25l6.4-4.8A2.25 2.25 0 0 1 22 6.25V7.8L12 15.3Z" />
  </svg>
);

export const SocialShareModal: React.FC<SocialShareModalProps> = ({
  isOpen,
  onClose,
  payload,
}) => {
  const [notice, setNotice] = useState<string | null>(null);
  const [fallbackLink, setFallbackLink] = useState<{
    label: string;
    url: string;
    secondaryLabel?: string;
    secondaryUrl?: string;
  } | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !payload?.file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(payload.file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [isOpen, payload]);

  useEffect(() => {
    if (!isOpen) {
      setNotice(null);
      setFallbackLink(null);
      setIsBusy(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const resetBusyState = () => setIsBusy(false);
    window.addEventListener('focus', resetBusyState);
    window.addEventListener('pageshow', resetBusyState);
    document.addEventListener('visibilitychange', resetBusyState);
    return () => {
      window.removeEventListener('focus', resetBusyState);
      window.removeEventListener('pageshow', resetBusyState);
      document.removeEventListener('visibilitychange', resetBusyState);
    };
  }, []);

  if (!payload) return null;

  const isVideo = payload.file?.type.startsWith('video/');
  const isAudio = payload.file?.type.startsWith('audio/');
  const isImage = payload.file?.type.startsWith('image/');

  const handleNativeShare = async () => {
    if (isBusy) return;
    setIsBusy(true);
    setFallbackLink(null);
    try {
      await copyTextQuietly(payload.text);
      const result = await tryNativeShare(payload);
      if (result === 'shared') {
        setNotice('Partage envoyé avec succès.');
        return;
      }
      if (result === 'cancelled') {
        setNotice('Partage annulé.');
        return;
      }
      setNotice(
        'Le menu de partage du téléphone n’est pas disponible sur ce navigateur. Utilisez un bouton ci-dessous (le texte a été copié).'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handlePlatformClick = async (
    platform: 'whatsapp' | 'gmail' | 'facebook' | 'instagram' | 'x' | 'tiktok',
    label: string
  ) => {
    if (isBusy) return;
    setIsBusy(true);
    setFallbackLink(null);
    try {
      await copyTextQuietly(payload.text);

      // For Gmail directly clicked by user, prefer native share sheet when file attached,
      // or offer both direct Gmail app/mailto AND Gmail Web compose link
      if (platform !== 'gmail') {
        const nativeRes = await tryNativeShare(payload);
        if (nativeRes === 'shared') {
          setNotice(`Partage envoyé vers ${label}.`);
          return;
        }
        if (nativeRes === 'cancelled') {
          setNotice(`Partage vers ${label} annulé.`);
          return;
        }
      } else {
        const nativeRes = payload.file ? await tryNativeShare(payload) : 'unsupported';
        if (nativeRes === 'shared') {
          setNotice('Message préparé et partagé par e-mail.');
          return;
        }
        if (nativeRes === 'cancelled') {
          setNotice('Partage Gmail annulé.');
          return;
        }
        if (payload.file) {
          triggerFileDownload(payload.file, payload.file.name);
        }
        setNotice(
          payload.file
            ? `Texte copié et fichier téléchargé (${payload.file.name}). Ouvrez Gmail sur votre appareil ou sur le Web ci-dessous pour joindre la pièce.`
            : 'Objet et texte préparés pour Gmail. Choisissez l’application Gmail de votre téléphone ou Gmail Web ci-dessous.'
        );
        setFallbackLink({
          label: 'Gmail Web',
          url: buildPlatformShareUrl('gmail', payload),
          secondaryLabel: 'Application Gmail / E-mail',
          secondaryUrl: buildGmailMailtoUrl(payload),
        });
        return;
      }

      if (payload.file) {
        triggerFileDownload(payload.file, payload.file.name);
        setNotice(
          `Texte copié et média téléchargé (${payload.file.name}). Touchez le lien ci-dessous pour ouvrir ${label} et joindre votre média.`
        );
      } else {
        setNotice(`Texte copié ! Touchez le lien ci-dessous pour ouvrir ${label}.`);
      }
      setFallbackLink({
        label,
        url: buildPlatformShareUrl(platform, payload),
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleCopyText = async () => {
    const ok = await copyTextQuietly(payload.text);
    setNotice(ok ? 'Texte copié dans le presse-papiers.' : 'Impossible de copier automatiquement.');
  };

  const handleDownloadMedia = () => {
    if (!payload.file) return;
    triggerFileDownload(payload.file, payload.file.name);
    setNotice(`Média téléchargé : ${payload.file.name}`);
  };

  const platforms = [
    {
      id: 'whatsapp' as const,
      label: 'WhatsApp',
      className: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    },
    {
      id: 'gmail' as const,
      label: 'Gmail',
      className:
        'bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-800 dark:text-white border border-slate-200 dark:border-slate-700',
    },
    {
      id: 'facebook' as const,
      label: 'Facebook',
      className: 'bg-[#1877F2] hover:bg-[#1565d8] text-white',
    },
    {
      id: 'instagram' as const,
      label: 'Instagram',
      className: 'bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 hover:opacity-95 text-white',
    },
    {
      id: 'x' as const,
      label: 'X (Twitter)',
      className: 'bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white',
    },
    {
      id: 'tiktok' as const,
      label: 'TikTok',
      className: 'bg-slate-950 hover:bg-black text-white border border-slate-700',
    },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Partager sur les réseaux et par e-mail"
      subtitle={payload.title}
      maxWidth="md"
    >
      <div className="space-y-4 text-xs">
        {previewUrl && (
          <div className="rounded-xl overflow-hidden bg-slate-950 border border-slate-200 dark:border-slate-800 p-2">
            {isImage && (
              <img
                src={previewUrl}
                alt={payload.title}
                className="w-full max-h-48 object-contain mx-auto rounded-lg"
                referrerPolicy="no-referrer"
              />
            )}
            {isVideo && (
              <video src={previewUrl} controls playsInline className="w-full max-h-48 rounded-lg" />
            )}
            {isAudio && <audio src={previewUrl} controls className="w-full" />}
          </div>
        )}

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 whitespace-pre-wrap max-h-36 overflow-y-auto leading-relaxed">
          {payload.text}
        </div>

        <button
          type="button"
          onClick={handleNativeShare}
          disabled={isBusy}
          className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-bold flex items-center justify-center gap-2 shadow-xs transition"
        >
          <Smartphone className="w-4 h-4" />
          <span>
            {payload.file
              ? 'Partager via le menu du téléphone (avec média)'
              : 'Partager via les applications du téléphone'}
          </span>
        </button>

        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Choisir une plateforme ou messagerie
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {platforms.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={isBusy}
                onClick={() => handlePlatformClick(p.id, p.label)}
                className={`min-h-[44px] py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-xs disabled:opacity-60 ${p.className}`}
              >
                {p.id === 'whatsapp' ? (
                  <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                ) : p.id === 'gmail' ? (
                  <GmailBadgeIcon className="w-4 h-4 shrink-0" />
                ) : (
                  <Share2 className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>{p.label}</span>
              </button>
            ))}
          </div>
        </div>

        {notice && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-200 space-y-2.5">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{notice}</span>
            </div>
            {fallbackLink && (
              <div className="flex flex-wrap gap-2">
                {fallbackLink.secondaryUrl && fallbackLink.secondaryLabel && (
                  <a
                    href={fallbackLink.secondaryUrl}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>{fallbackLink.secondaryLabel}</span>
                  </a>
                )}
                <a
                  href={fallbackLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Ouvrir {fallbackLink.label}</span>
                </a>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopyText}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold flex items-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copier le texte</span>
            </button>

            {payload.file && (
              <button
                type="button"
                onClick={handleDownloadMedia}
                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Télécharger média</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Fermer
          </button>
        </div>
      </div>
    </Modal>
  );
};
