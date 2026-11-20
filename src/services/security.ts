// Local Security & Multi-Mode Lock Service for SHALOM (Personal)
// Supports PIN, Password, and 3x3 Pattern Grid — SHA-256 hashed locally

import { SecurityConfig, LockableFeatureId } from '../types';

const SECURITY_SALT = 'SHALOM_SECURITY_SALT_JEAN_14_27_V2';
const SECURITY_STORAGE_KEY = 'shalom_security_config_v2';

export async function hashSecret(secret: string): Promise<string> {
  const salted = secret + SECURITY_SALT;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(salted);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback deterministic hash for non-HTTPS contexts where crypto.subtle is unavailable
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < salted.length; i++) {
    const c = salted.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

export async function verifySecret(entered: string, storedHash: string): Promise<boolean> {
  const enteredHash = await hashSecret(entered);
  return enteredHash === storedHash;
}

export function getEffectiveAutoLockSeconds(cfg: Pick<SecurityConfig, 'autoLockSeconds' | 'autoLockMinutes'>): number {
  if (typeof cfg.autoLockSeconds === 'number' && cfg.autoLockSeconds >= 0) {
    return cfg.autoLockSeconds;
  }
  if (typeof cfg.autoLockMinutes === 'number' && cfg.autoLockMinutes > 0) {
    return cfg.autoLockMinutes * 60;
  }
  return 0;
}

export function getSecurityConfig(): SecurityConfig {
  try {
    const raw = localStorage.getItem(SECURITY_STORAGE_KEY);
    if (!raw) {
      return {
        isEnabled: false,
        lockMode: 'pin',
        secretHash: '',
        lockOnLaunch: false,
        lockedFeatures: [],
        autoLockMinutes: 0,
        autoLockSeconds: 0,
      };
    }
    const parsed = JSON.parse(raw) as SecurityConfig;
    const autoLockSeconds = getEffectiveAutoLockSeconds(parsed);
    return {
      ...parsed,
      autoLockMinutes: typeof parsed.autoLockMinutes === 'number' ? parsed.autoLockMinutes : 0,
      autoLockSeconds,
    };
  } catch {
    return {
      isEnabled: false,
      lockMode: 'pin',
      secretHash: '',
      lockOnLaunch: false,
      lockedFeatures: [],
      autoLockMinutes: 0,
      autoLockSeconds: 0,
    };
  }
}

export function saveSecurityConfig(config: SecurityConfig): void {
  try {
    localStorage.setItem(SECURITY_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore restricted storage
  }
}

// --- In-memory Session Unlock Tracking ---

let appSessionUnlocked = false;
const unlockedFeatures = new Set<string>();

export function isAppSessionUnlocked(): boolean {
  return appSessionUnlocked;
}

export function setAppSessionUnlocked(val: boolean): void {
  appSessionUnlocked = val;
  if (!val) {
    unlockedFeatures.clear();
  }
}

export function isFeatureSessionUnlocked(featureId: LockableFeatureId): boolean {
  if (appSessionUnlocked) return true;
  return unlockedFeatures.has(featureId);
}

export function unlockFeatureSession(featureId: LockableFeatureId): void {
  unlockedFeatures.add(featureId);
}

export function lockAllSessions(): void {
  appSessionUnlocked = false;
  unlockedFeatures.clear();
}

export const LOCKABLE_FEATURES: Array<{ id: LockableFeatureId; label: string }> = [
  { id: 'altar', label: 'Mon Autel (Vie secrète)' },
  { id: 'prayers', label: 'Mes Prières & Témoignages' },
  { id: 'journey', label: 'Mon Parcours Spirituel' },
  { id: 'parole', label: 'Parole Divine (Audio / Vidéo)' },
  { id: 'studios', label: 'Studios Créatifs (Graphique · Présentation · Vidéo · Audio)' },
  { id: 'vault', label: 'Mon Coffre Spirituel' },
  { id: 'calendar', label: 'Mon Calendrier Personnel' },
  { id: 'contacts', label: 'Mes Contacts' },
  { id: 'messaging', label: 'Partage WhatsApp / SMS' },
  { id: 'settings', label: 'Paramètres & Sauvegarde' },
];
