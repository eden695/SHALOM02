import React, { useState, useEffect, useId, useRef } from 'react';
import { Lock, ShieldAlert, Delete, KeyRound, Eye, EyeOff } from 'lucide-react';
import { LockMode } from '../../types';
import { verifySecret } from '../../services/security';
import { PatternGrid } from './PatternGrid';
import { useNavigationOptional } from '../../contexts/NavigationContext';

interface LockModalProps {
  isOpen: boolean;
  lockMode: LockMode;
  storedHash: string;
  onUnlocked: () => void;
  onCancel?: () => void;
  title?: string;
  subtitle?: string;
}

export const LockModal: React.FC<LockModalProps> = ({
  isOpen,
  lockMode,
  storedHash,
  onUnlocked,
  onCancel,
  title = 'Accès Protégé SHALOM',
  subtitle = 'Confirmez votre identité pour accéder à cet espace',
}) => {
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const reactId = useId();
  const overlayId = `lock-modal-${reactId}`;
  const nav = useNavigationOptional();
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const registerOverlay = nav?.registerOverlay;
  const unregisterOverlay = nav?.unregisterOverlay;

  useEffect(() => {
    if (!isOpen || !onCancel) return;
    registerOverlay?.(overlayId, () => onCancelRef.current?.(), title);
    return () => {
      unregisterOverlay?.(overlayId);
    };
  }, [isOpen, onCancel, overlayId, registerOverlay, unregisterOverlay, title]);

  if (!isOpen) return null;

  const handlePinKeyPress = async (digit: string) => {
    if (pin.length >= 4) return;
    const newPin = pin + digit;
    setPin(newPin);
    setError(false);

    if (newPin.length === 4) {
      const isValid = await verifySecret(newPin, storedHash);
      if (isValid) {
        setPin('');
        setError(false);
        onUnlocked();
      } else {
        setError(true);
        setAttempts((prev) => prev + 1);
        setTimeout(() => setPin(''), 550);
      }
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    const isValid = await verifySecret(password, storedHash);
    if (isValid) {
      setPassword('');
      setError(false);
      onUnlocked();
    } else {
      setError(true);
      setAttempts((prev) => prev + 1);
    }
  };

  const handlePatternComplete = async (patternStr: string) => {
    const isValid = await verifySecret(patternStr, storedHash);
    if (isValid) {
      setError(false);
      onUnlocked();
    } else {
      setError(true);
      setAttempts((prev) => prev + 1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-sm bg-white dark:bg-[#0c1631] rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-center space-y-5">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 mx-auto flex items-center justify-center">
          <Lock className="w-6 h-6" />
        </div>

        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">{title}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>
        </div>

        {error && (
          <p className="text-xs text-red-500 font-semibold flex items-center justify-center gap-1.5">
            <ShieldAlert className="w-4 h-4" />
            <span>Identification incorrecte ({attempts} essai{attempts > 1 ? 's' : ''})</span>
          </p>
        )}

        {/* Mode 1: PIN Keypad */}
        {lockMode === 'pin' && (
          <div className="space-y-5">
            <div className="flex items-center justify-center gap-3">
              {[0, 1, 2, 3].map((index) => {
                const isFilled = pin.length > index;
                return (
                  <div
                    key={index}
                    className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                      error
                        ? 'bg-red-500 scale-110'
                        : isFilled
                        ? 'bg-blue-600 dark:bg-blue-400 scale-110'
                        : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                  />
                );
              })}
            </div>

            <div className="grid grid-cols-3 gap-2.5 max-w-[220px] mx-auto">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => handlePinKeyPress(digit)}
                  className="h-12 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-lg font-semibold transition active:scale-95"
                >
                  {digit}
                </button>
              ))}
              <div />
              <button
                type="button"
                onClick={() => handlePinKeyPress('0')}
                className="h-12 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-lg font-semibold transition active:scale-95"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => {
                  setPin((prev) => prev.slice(0, -1));
                  setError(false);
                }}
                aria-label="Effacer"
                className="h-12 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center transition active:scale-95"
              >
                <Delete className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Mode 2: Password */}
        {lockMode === 'password' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-3 text-left">
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoFocus
                placeholder="Mot de passe..."
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(false);
                }}
                className="w-full pl-9 pr-10 py-2.5 text-sm rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold transition"
            >
              Déverrouiller
            </button>
          </form>
        )}

        {/* Mode 3: 3x3 Pattern Grid */}
        {lockMode === 'pattern' && (
          <PatternGrid
            onPatternComplete={handlePatternComplete}
            error={error}
            label="Tracez votre schéma de déverrouillage"
          />
        )}

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 pt-1"
          >
            Annuler et revenir
          </button>
        )}
      </div>
    </div>
  );
};
