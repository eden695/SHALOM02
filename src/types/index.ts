// Data models and TypeScript types for SHALOM (Personal Edition)

export type AppLanguage = string;

export type LockMode = 'pin' | 'password' | 'pattern';

export type LockableFeatureId =
  | 'altar'
  | 'prayers'
  | 'journey'
  | 'parole'
  | 'studios'
  | 'vault'
  | 'calendar'
  | 'contacts'
  | 'messaging'
  | 'settings';

export interface SecurityConfig {
  isEnabled: boolean;
  lockMode: LockMode;
  secretHash: string;
  lockOnLaunch: boolean;
  lockedFeatures: LockableFeatureId[];
  autoLockMinutes?: number;
  autoLockSeconds?: number;
}

export interface ReminderItemConfig {
  enabled: boolean;
  time: string;
}

export interface NotificationSettings {
  dailyPrayer: ReminderItemConfig;
  meditation: ReminderItemConfig;
  bibleReading: ReminderItemConfig;
}

export type PrayerCategory =
  | 'personnelle'
  | 'famille'
  | 'sante'
  | 'travail'
  | 'foi'
  | 'etudes'
  | 'finances'
  | 'relations'
  | 'reconnaissance'
  | 'intercession'
  | 'autre';

export type PrayerStatus =
  | 'nouvelle'
  | 'en_priere'
  | 'en_attente'
  | 'en_evolution'
  | 'exaucee'
  | 'archivee';

export interface PrayerItem {
  id: string;
  title: string;
  description: string;
  category: PrayerCategory;
  bibleVerse?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  status: PrayerStatus;
  isPrivate: boolean;
  authorizedPersons?: string[];
  authorizedContactIds?: string[];
  nextFollowUpDate?: string;
  history?: Array<{
    date: string;
    text: string;
  }>;
  answeredAt?: string;
  mediaBlobKey?: string;
  mediaType?: 'image' | 'video';
  mediaMimeType?: string;
}

export interface TestimonyItem {
  id: string;
  title: string;
  content: string;
  date: string;
  bibleVerse?: string;
  category: PrayerCategory;
  prayerId?: string;
  authorName?: string;
  mediaBlobKey?: string;
  mediaType?: 'image' | 'video';
  mediaMimeType?: string;
  createdAt: string;
}

export interface PrayerGroup {
  id: string;
  name: string;
  description?: string;
  memberContactIds: string[];
  prayerIds: string[];
  createdAt: string;
}

export type ParoleType = 'predication' | 'exhortation' | 'enseignement';

export type ActivityGenre =
  | 'culte_dominical'
  | 'culte_enseignement'
  | 'reunion_priere'
  | 'seminaire'
  | 'veillee'
  | 'convention'
  | 'conference'
  | 'formation'
  | 'reunion_speciale'
  | 'autre';

export interface RecordedParole {
  id: string;
  title: string;
  type: ParoleType;
  speaker: string;
  moderator?: string;
  activityGenre: ActivityGenre;
  bibleVerse?: string;
  notes?: string;
  date: string;
  durationSeconds: number;
  mediaType: 'audio' | 'video';
  mimeType: string;
  blobKey?: string;
  photoBlobKeys?: string[];
  fileSizeFormatted?: string;
  createdAt: string;
}

export type ContactCategory =
  | 'famille'
  | 'ami'
  | 'frere_soeur'
  | 'intercesseur'
  | 'pasteur'
  | 'personnel'
  | 'autre';

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  avatarDataUrl?: string;
  category: ContactCategory;
  notes?: string;
  address?: string;
  neighborhood?: string;
  createdAt: string;
  isArchived?: boolean;
}

export type CalendarActivityType =
  | 'priere'
  | 'meditation'
  | 'jeune'
  | 'culte'
  | 'reunion'
  | 'autre';

export interface CalendarActivity {
  id: string;
  title: string;
  activityType: CalendarActivityType;
  date: string;
  endDate?: string;
  time: string;
  location?: string;
  description?: string;
  status: 'a_venir' | 'accompli';
  mediaBlobKey?: string;
  mediaType?: 'image' | 'video';
  mediaMimeType?: string;
  createdAt: string;
}

export interface MessageTemplate {
  id: string;
  title: string;
  category:
    | 'encouragement'
    | 'condoleances'
    | 'anniversaire'
    | 'remerciement'
    | 'demande_priere'
    | 'temoignage';
  content: string;
}

export interface ShareHistoryItem {
  id: string;
  contactName: string;
  contactPhone: string;
  messageText: string;
  channel: 'whatsapp' | 'sms';
  status: 'en_attente' | 'ouvert' | 'confirme_envoye' | 'ignore' | 'echec';
  timestamp: string;
  mediaBlobKey?: string;
  mediaType?: 'image' | 'video';
  mediaMimeType?: string;
}

export interface UserProfile {
  id: string;
  fullName: string;
  phone?: string;
  email?: string;
  avatarDataUrl?: string;
  dashboardVerseText?: string;
  dashboardVerseRef?: string;
  theme: 'light' | 'dark';
  language?: AppLanguage;
  showUsageTips?: boolean;
  createdAt: string;
}

// --- Mon Autel ---

export interface WeeklyAltarDay {
  id: string; // e.g., 'day_0' .. 'day_6' (0=Dimanche .. 6=Samedi)
  dayOfWeek: number;
  prayerTitle: string;
  prayerFocus: string;
  bibleVerse?: string;
  mediaBlobKey?: string;
  mediaType?: 'image' | 'video';
  mediaMimeType?: string;
  updatedAt: string;
}

export interface LifeChangeGoal {
  id: string;
  area: string;
  currentHabit: string;
  desiredChange: string;
  prayerSupport?: string;
  status: 'en_cours' | 'accompli';
  progressNotes?: string;
  mediaBlobKey?: string;
  mediaType?: 'image' | 'video';
  mediaMimeType?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IntercessionPerson {
  id: string;
  name: string;
  contactId?: string;
  relation?: string;
  prayerTopic: string;
  lastPrayedAt?: string;
  mediaBlobKey?: string;
  mediaType?: 'image' | 'video';
  mediaMimeType?: string;
  createdAt: string;
}

export interface SpiritualCommitment {
  id: string;
  title: string;
  category: string;
  frequency: string;
  startDate: string;
  isActive: boolean;
  notes?: string;
  mediaBlobKey?: string;
  mediaType?: 'image' | 'video';
  mediaMimeType?: string;
  createdAt: string;
}

// --- Mon Parcours Spirituel ---

export type SpiritualHabitType =
  | 'priere'
  | 'meditation'
  | 'jeune'
  | 'memorisation'
  | 'gratitude';

export interface SpiritualHabitLog {
  id: string;
  type: SpiritualHabitType;
  date: string; // YYYY-MM-DD
  durationMinutes?: number;
  note?: string;
  verseRef?: string;
  verseText?: string;
  mediaBlobKey?: string;
  mediaType?: 'image' | 'video';
  mediaMimeType?: string;
  createdAt: string;
}

export interface PersonalProgram {
  id: string;
  title: string;
  theme: string;
  startDate: string;
  targetDays: number;
  completedDays: number;
  status: 'en_cours' | 'termine';
  year: number;
  mediaBlobKey?: string;
  mediaType?: 'image' | 'video';
  mediaMimeType?: string;
  createdAt: string;
}

// --- Mon Coffre Spirituel ---

export interface VaultDocument {
  id: string;
  title: string;
  category: 'livre' | 'etude' | 'note' | 'certificat' | 'autre';
  author?: string;
  description?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  blobKey?: string;
  textContent?: string;
  isBuiltInBook?: boolean;
  bookId?: string;
  sourceUrl?: string;
  epubUrl?: string;
  createdAt: string;
}

// --- Assistant Biblique Intelligent ---

export type BibleAssistantMode =
  | 'passage'
  | 'question'
  | 'theme'
  | 'comparaison'
  | 'etude';

export interface BibleStudyMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface BibleStudySession {
  id: string;
  title: string;
  mode: BibleAssistantMode;
  messages: BibleStudyMessage[];
  createdAt: string;
  updatedAt: string;
}

// --- Studio de Création Chrétienne ---

export interface CreativeDesignItem {
  id: string;
  title: string;
  templateType: 'verset' | 'voeux' | 'invitation' | 'encouragement';
  mediaBlobKey: string;
  mimeType: string;
  createdAt: string;
}

export type StudioKind = 'design' | 'presentation' | 'video' | 'audio';

export interface StudioProjectRecord {
  id: string;
  studio: StudioKind;
  title: string;
  formatLabel?: string;
  thumbnailBlobKey?: string;
  dataJson: string;
  createdAt: string;
  updatedAt: string;
}

export type StudioAssetCategory =
  | 'photo'
  | 'illustration'
  | 'icon'
  | 'background'
  | 'video'
  | 'audio';

export interface DownloadedStudioAsset {
  id: string;
  title: string;
  category: StudioAssetCategory;
  mimeType: string;
  blobKey: string;
  author?: string;
  license?: string;
  licenseUrl?: string;
  sourceName: string;
  sourceUrl?: string;
  width?: number;
  height?: number;
  durationSec?: number;
  createdAt: string;
}
