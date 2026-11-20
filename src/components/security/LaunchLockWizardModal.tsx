import React, { useState, useEffect } from 'react';
import { Hash, KeyRound, Grid3X3, ShieldCheck, CheckCircle2, AlertCircle, Lock } from 'lucide-react';
import { Modal } from '../common/Modal';
import { LockMode } from '../../types';
import { hashSecret } from '../../services/security';
import { PatternGrid } from './PatternGrid';

interface LaunchLockWizardModalProps {
  isOpen: boolean;
  initialMode: LockMode;
  onCancel: () => void;
  onComplete: (result: { lockMode: LockMode; secretHash: string }) => void;
}

export const LaunchLockWizardModal: React.FC<LaunchLockWizardModalProps> = ({
  isOpen,
  initialMode,
  onCancel,
  onComplete,
}) => {
  const [step, setStep] = useState<'mode' | 'setup'>('mode');
  const [mode, setMode] = useState<LockMode>(initialMode);
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [pass1, setPass1] = useState('');
  const [pass2, setPass2] = useState('');
  const [pat1, setPat1] = useState('');
  const [pat2, setPat2] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep('mode');
      setMode(initialMode);
      setPin1('');
      setPin2('');
      setPass1('');
      setPass2('');
      setPat1('');
      setPat2('');
      setErrorMsg(null);
      setSaving(false);
    }
  }, [isOpen, initialMode]);

  const canFinish =
    (mode === 'pin' && /^\d{4}$/.test(pin1) && pin1 === pin2) ||
    (mode === 'password' && pass1.length >= 4 && pass1 === pass2) ||
    (mode === 'pattern' && pat1.split('-').length >= 4 && pat1 === pat2);

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    let rawSecret = '';
    if (mode === 'pin') {
      if (!/^\d{4}$/.test(pin1)) {
        setErrorMsg('Saisissez un code PIN à 4 chiffres.');
        return;
      }
      if (pin1 !== pin2) {
        setErrorMsg('Les deux codes PIN ne correspondent pas.');
        return;
      }
      rawSecret = pin1;
    } else if (mode === 'password') {
      if (pass1.length < 4) {
        setErrorMsg('Le mot de passe doit contenir au moins 4 caractères.');
        return;
      }
      if (pass1 !== pass2) {
        setErrorMsg('Les deux mots de passe ne correspondent pas.');
        return;
      }
      rawSecret = pass1;
    } else {
      if (!pat1 || pat1.split('-').length < 4) {
        setErrorMsg('Tracez un schéma reliant au moins 4 points.');
        return;
      }
      if (pat1 !== pat2) {
        setErrorMsg('Confirmez en traçant exactement le même schéma.');
        return;
      }
      rawSecret = pat1;
    }

    setSaving(true);
    try {
      const secretHash = await hashSecret(rawSecret);
      onComplete({ lockMode: mode, secretHash });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="Configurer le verrouillage au lancement"
      subtitle="Protection interne SHALOM · 100 % hors ligne sur cet appareil"
      maxWidth="md"
    >
      <form onSubmit={handleFinish} className="space-y-5 text-xs">
        <div className="p-3 rounded-xl bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/60 text-blue-900 dark:text-blue-200 flex items-start gap-2.5">
          <Lock className="w-4 h-4 shrink-0 mt-0.5 text-blue-700 dark:text-blue-400" />
          <p className="leading-relaxed">
            Ce verrouillage protège l’accès interne à <strong>SHALOM</strong> dès son ouverture et après un délai d’inactivité (indépendant du verrouillage système Android).
          </p>
        </div>

        {step === 'mode' && (
          <div className="space-y-4">
            <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
              1. Choisissez votre méthode de déverrouillage
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {[
                {
                  id: 'pin' as const,
                  label: 'Code PIN',
                  desc: '4 chiffres rapides',
                  icon: Hash,
                },
                {
                  id: 'password' as const,
                  label: 'Mot de passe',
                  desc: 'Lettres et chiffres',
                  icon: KeyRound,
                },
                {
                  id: 'pattern' as const,
                  label: 'Schéma 3×3',
                  desc: 'Tracé sur grille',
                  icon: Grid3X3,
                },
              ].map((opt) => {
                const Icon = opt.icon;
                const active = mode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setMode(opt.id);
                      setErrorMsg(null);
                    }}
                    className={`p-3.5 rounded-2xl border text-left sm:text-center flex sm:flex-col items-center gap-3 sm:gap-1.5 transition ${
                      active
                        ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200 ring-2 ring-blue-600/20'
                        : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <div>
                      <div className="font-bold">{opt.label}</div>
                      <div className="text-[11px] opacity-75">{opt.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2.5 rounded-xl text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setStep('setup');
                }}
                className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold"
              >
                Continuer →
              </button>
            </div>
          </div>
        )}

        {step === 'setup' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm">
                2. Définir et confirmer ({mode === 'pin' ? 'Code PIN' : mode === 'password' ? 'Mot de passe' : 'Schéma'})
              </h4>
              <button
                type="button"
                onClick={() => setStep('mode')}
                className="text-blue-700 dark:text-blue-400 font-semibold hover:underline"
              >
                Changer de méthode
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {mode === 'pin' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Code PIN (4 chiffres)</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    autoFocus
                    placeholder="••••"
                    value={pin1}
                    onChange={(e) => {
                      setPin1(e.target.value.replace(/[^0-9]/g, ''));
                      setErrorMsg(null);
                    }}
                    className="w-full px-3 py-2.5 text-center font-mono text-base tracking-widest rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Confirmer le PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="••••"
                    value={pin2}
                    onChange={(e) => {
                      setPin2(e.target.value.replace(/[^0-9]/g, ''));
                      setErrorMsg(null);
                    }}
                    className="w-full px-3 py-2.5 text-center font-mono text-base tracking-widest rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                  />
                </div>
              </div>
            )}

            {mode === 'password' && (
              <div className="space-y-3">
                <div>
                  <label className="block font-semibold mb-1">Mot de passe (min. 4 caractères)</label>
                  <input
                    type="password"
                    autoFocus
                    placeholder="Entrez votre mot de passe"
                    value={pass1}
                    onChange={(e) => {
                      setPass1(e.target.value);
                      setErrorMsg(null);
                    }}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Confirmer le mot de passe</label>
                  <input
                    type="password"
                    placeholder="Répétez le mot de passe"
                    value={pass2}
                    onChange={(e) => {
                      setPass2(e.target.value);
                      setErrorMsg(null);
                    }}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                  />
                </div>
              </div>
            )}

            {mode === 'pattern' && (
              <div className="text-center space-y-2">
                {!pat1 ? (
                  <PatternGrid
                    key="wizard-pat-1"
                    label="Étape 1/2 : Tracez votre schéma (min. 4 points)"
                    onPatternComplete={(pat) => {
                      if (pat.split('-').length >= 4) {
                        setErrorMsg(null);
                        setPat1(pat);
                      } else {
                        setErrorMsg('Reliez au moins 4 points sur la grille.');
                      }
                    }}
                  />
                ) : !pat2 ? (
                  <div className="space-y-2">
                    <PatternGrid
                      key="wizard-pat-2"
                      label="Étape 2/2 : Tracez à nouveau pour confirmer"
                      onPatternComplete={(pat) => {
                        if (pat !== pat1) {
                          setErrorMsg('Les schémas ne correspondent pas. Tracez à nouveau.');
                          return;
                        }
                        setErrorMsg(null);
                        setPat2(pat);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setPat1('');
                        setPat2('');
                      }}
                      className="text-xs text-slate-500 underline"
                    >
                      Recommencer le tracé
                    </button>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 font-semibold flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Schéma confirmé. Appuyez sur « Terminer » pour activer.</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2.5 rounded-xl text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving || !canFinish}
                className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-bold flex items-center gap-1.5"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{saving ? 'Activation...' : 'Terminer'}</span>
              </button>
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
};
