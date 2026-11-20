import { NotificationSettings } from '../types';

const NOTIFICATION_STORAGE_KEY = 'shalom_notification_settings_v1';
const NOTIFICATION_FIRED_KEY = 'shalom_notification_fired_v1';
const USAGE_TIPS_STORAGE_KEY = 'shalom_usage_tips_v1';

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  dailyPrayer: { enabled: false, time: '06:30' },
  meditation: { enabled: false, time: '12:30' },
  bibleReading: { enabled: false, time: '20:00' },
};

export function getNotificationSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(NOTIFICATION_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_NOTIFICATION_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<NotificationSettings>;
    return {
      dailyPrayer: {
        enabled: Boolean(parsed.dailyPrayer?.enabled),
        time: parsed.dailyPrayer?.time || '06:30',
      },
      meditation: {
        enabled: Boolean(parsed.meditation?.enabled),
        time: parsed.meditation?.time || '12:30',
      },
      bibleReading: {
        enabled: Boolean(parsed.bibleReading?.enabled),
        time: parsed.bibleReading?.time || '20:00',
      },
    };
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }
}

export function saveNotificationSettings(settings: NotificationSettings): void {
  try {
    localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('shalom-settings-updated'));
  } catch {
    // ignore storage errors
  }
}

export function getUsageTipsEnabled(): boolean {
  try {
    const raw = localStorage.getItem(USAGE_TIPS_STORAGE_KEY);
    if (raw === null) return true;
    return raw !== 'false';
  } catch {
    return true;
  }
}

export function setUsageTipsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(USAGE_TIPS_STORAGE_KEY, enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent('shalom-settings-updated'));
  } catch {
    // ignore storage errors
  }
}

export async function requestReminderNotificationPermission(): Promise<
  'granted' | 'denied' | 'default' | 'unsupported'
> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') return 'granted';
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return Notification.permission;
  }
}

export function showLocalReminderNotification(title: string, body: string): boolean {
  if (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission === 'granted'
  ) {
    try {
      new Notification(title, {
        body,
        icon: './shalom_logo.jpg',
        tag: `shalom-${title}`,
      });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export interface DueReminderPayload {
  id: 'dailyPrayer' | 'meditation' | 'bibleReading';
  title: string;
  body: string;
}

export function checkDueReminders(isEn = false): DueReminderPayload | null {
  const settings = getNotificationSettings();
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes()
  ).padStart(2, '0')}`;

  let firedMap: Record<string, string> = {};
  try {
    const raw = localStorage.getItem(NOTIFICATION_FIRED_KEY);
    if (raw) firedMap = JSON.parse(raw) as Record<string, string>;
  } catch {
    firedMap = {};
  }

  const entries: Array<{
    key: 'dailyPrayer' | 'meditation' | 'bibleReading';
    enabled: boolean;
    time: string;
    title: string;
    body: string;
  }> = [
    {
      key: 'dailyPrayer',
      enabled: settings.dailyPrayer.enabled,
      time: settings.dailyPrayer.time,
      title: isEn ? 'SHALOM · Daily Prayer' : 'SHALOM · Rappel quotidien de prière',
      body: isEn
        ? 'Take a peaceful moment to bring your prayers before God.'
        : 'Prenez un moment paisible pour déposer vos prières devant Dieu.',
    },
    {
      key: 'meditation',
      enabled: settings.meditation.enabled,
      time: settings.meditation.time,
      title: isEn ? 'SHALOM · Meditation Time' : 'SHALOM · Rappel de méditation',
      body: isEn
        ? 'Pause and meditate on God’s Word in peace.'
        : 'Faites une pause pour méditer la Parole et renouveler votre paix.',
    },
    {
      key: 'bibleReading',
      enabled: settings.bibleReading.enabled,
      time: settings.bibleReading.time,
      title: isEn ? 'SHALOM · Bible Reading' : 'SHALOM · Rappel de lecture biblique',
      body: isEn
        ? 'It is time for your daily Bible reading.'
        : 'C’est l’heure de votre lecture biblique quotidienne.',
    },
  ];

  for (const item of entries) {
    if (!item.enabled || !item.time) continue;
    if (firedMap[item.key] === today) continue;
    if (currentHHMM === item.time) {
      firedMap[item.key] = today;
      try {
        localStorage.setItem(NOTIFICATION_FIRED_KEY, JSON.stringify(firedMap));
      } catch {
        // ignore
      }
      showLocalReminderNotification(item.title, item.body);
      return { id: item.key, title: item.title, body: item.body };
    }
  }

  return null;
}
