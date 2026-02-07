/**
 * Types for Mindful Twitch Spending extension
 */

/** Types of purchases we can detect on Twitch */
export type PurchaseType = string; // Now uses actual button text for specificity

/** Information about a detected purchase attempt */
export interface PurchaseAttempt {
  type: PurchaseType;
  rawPrice: string | null;
  priceValue: number | null;
  channel: string;
  timestamp: Date;
  element: HTMLElement;
}

/** Result of the user's decision on the overlay */
export type OverlayDecision = 'cancel' | 'proceed';

/** Callback when user makes a decision on the overlay */
export type OverlayCallback = (decision: OverlayDecision) => void;

/** A single comparison item (preset or custom) */
export interface ComparisonItem {
  id: string;
  emoji: string;
  name: string;
  price: number;
  pluralLabel: string;
  enabled: boolean;
  isPreset: boolean;
}

/** Friction level applied at different spend amounts */
export type FrictionLevel = 'none' | 'nudge' | 'full';

/** Friction threshold tier configuration */
export interface FrictionThresholds {
  enabled: boolean;
  threshold1: number;
  threshold2: number;
}

/** Cooldown configuration */
export interface CooldownConfig {
  enabled: boolean;
  minutes: number;
}

/** Daily spending cap configuration */
export interface DailyCapConfig {
  enabled: boolean;
  amount: number;
}

/** User settings stored in chrome.storage.sync */
export interface UserSettings {
  hourlyRate: number;
  taxRate: number;
  comparisonItems: ComparisonItem[];
  cooldown: CooldownConfig;
  dailyCap: DailyCapConfig;
  frictionThresholds: FrictionThresholds;
}

/** Preset comparison items */
export const PRESET_COMPARISON_ITEMS: ComparisonItem[] = [
  {
    id: 'preset-hotdog',
    emoji: '\u{1F32D}',
    name: 'Costco Hot Dog',
    price: 1.50,
    pluralLabel: 'Costco glizzies',
    enabled: true,
    isPreset: true,
  },
  {
    id: 'preset-chicken',
    emoji: '\u{1F357}',
    name: 'Costco Rotisserie Chicken',
    price: 4.99,
    pluralLabel: 'Costco chickens',
    enabled: true,
    isPreset: true,
  },
  {
    id: 'preset-galleyboy',
    emoji: '\u{1F354}',
    name: "Swenson's Galley Boy",
    price: 4.99,
    pluralLabel: 'Galley Boys',
    enabled: true,
    isPreset: true,
  },
];

/** Default settings for new users */
export const DEFAULT_SETTINGS: UserSettings = {
  hourlyRate: 35,
  taxRate: 7.5,
  comparisonItems: PRESET_COMPARISON_ITEMS,
  cooldown: {
    enabled: false,
    minutes: 5,
  },
  dailyCap: {
    enabled: false,
    amount: 50,
  },
  frictionThresholds: {
    enabled: false,
    threshold1: 5,
    threshold2: 25,
  },
};

/** Transient spending data — stored in chrome.storage.local */
export interface SpendingTracker {
  lastProceedTimestamp: number | null;
  dailyTotal: number;
  dailyDate: string;
  sessionTotal: number;
  sessionChannel: string;
}

export const DEFAULT_SPENDING_TRACKER: SpendingTracker = {
  lastProceedTimestamp: null,
  dailyTotal: 0,
  dailyDate: '',
  sessionTotal: 0,
  sessionChannel: '',
};

/** Merge saved settings with defaults to handle upgrades */
export function migrateSettings(saved: Partial<UserSettings>): UserSettings {
  // Merge comparison items: if user has saved items, use those; otherwise use presets
  // Also ensure any new presets are added if missing
  let items = saved.comparisonItems;
  if (!items || items.length === 0) {
    items = PRESET_COMPARISON_ITEMS;
  } else {
    // Ensure all current presets exist (in case we add new ones)
    for (const preset of PRESET_COMPARISON_ITEMS) {
      if (!items.find(i => i.id === preset.id)) {
        items.push(preset);
      }
    }
  }

  // Remove retired presets from saved data
  items = items.filter(i => i.id !== 'preset-work-minutes');

  return {
    hourlyRate: saved.hourlyRate ?? DEFAULT_SETTINGS.hourlyRate,
    taxRate: saved.taxRate ?? DEFAULT_SETTINGS.taxRate,
    comparisonItems: items,
    cooldown: {
      ...DEFAULT_SETTINGS.cooldown,
      ...(saved.cooldown || {}),
    },
    dailyCap: {
      ...DEFAULT_SETTINGS.dailyCap,
      ...(saved.dailyCap || {}),
    },
    frictionThresholds: {
      ...DEFAULT_SETTINGS.frictionThresholds,
      ...(saved.frictionThresholds || {}),
    },
  };
}
