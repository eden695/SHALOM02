import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { useNavigationOptional } from '../../contexts/NavigationContext';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'lg',
}) => {
  const reactId = useId();
  const overlayId = `modal-${reactId}`;
  const nav = useNavigationOptional();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const registerOverlay = nav?.registerOverlay;
  const unregisterOverlay = nav?.unregisterOverlay;

  useEffect(() => {
    if (!isOpen) return;
    registerOverlay?.(overlayId, () => onCloseRef.current(), title);
    return () => {
      unregisterOverlay?.(overlayId);
    };
  }, [isOpen, overlayId, registerOverlay, unregisterOverlay, title]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const maxWidthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
  }[maxWidth];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-xs">
      <div
        className={`w-full ${maxWidthClass} max-h-[92vh] sm:max-h-[88vh] flex flex-col bg-white dark:bg-[#0c1631] rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800/80 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200`}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="w-9 h-9 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
};
