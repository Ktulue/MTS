/**
 * Types for Hype Control extension
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
export type FrictionLevel = 'none' | 'nudge' | 'full' | 'cap-bypass';

/** Friction threshold tier configuration */
export interface FrictionThresholds {
  enabled: boolean;
  thresholdFloor: number;
  thresholdCeiling: number;
  softNudgeSteps: number;
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

/** Whitelist behavior applied to a specific channel */
export type WhitelistBehavior = 'skip' | 'reduced' | 'full';

/** A single channel whitelist entry */
export interface WhitelistEntry {
  username: string;         // normalized lowercase, no URL prefix
  behavior: WhitelistBehavior;
}

/** Streaming mode configuration */
export interface StreamingModeConfig {
  enabled: boolean;           // default: false
  twitchUsername: string;     // default: ''
  gracePeriodMinutes: number; // default: 15
  logBypassed: boolean;       // default: true
}

/** Theme preference for overlay styling */
export type ThemePreference = 'auto' | 'light' | 'dark';

/** User settings stored in chrome.storage.sync */
export interface UserSettings {
  hourlyRate: number;
  taxRate: number;
  comparisonItems: ComparisonItem[];
  cooldown: CooldownConfig;
  dailyCap: DailyCapConfig;
  frictionThresholds: FrictionThresholds;
  streamingMode: StreamingModeConfig;
  toastDurationSeconds: number;
  whitelistedChannels: WhitelistEntry[];
  theme: ThemePreference;
}

/** Preset comparison items */
export const PRESET_COMPARISON_ITEMS: ComparisonItem[] = [
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
    id: 'preset-hotdog',
    emoji: '\u{1F32D}',
    name: 'Costco Hot Dog',
    price: 1.50,
    pluralLabel: 'Costco glizzies',
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
    thresholdFloor: 5,
    thresholdCeiling: 25,
    softNudgeSteps: 1,
  },
  streamingMode: {
    enabled: false,
    twitchUsername: '',
    gracePeriodMinutes: 15,
    logBypassed: true,
  },
  toastDurationSeconds: 15,
  whitelistedChannels: [],
  theme: 'auto',
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

  // Deduplicate by ID (first occurrence wins)
  const seen = new Set<string>();
  items = items.filter(i => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });

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
    frictionThresholds: (() => {
      const s = (saved.frictionThresholds || {}) as any;
      return {
        enabled: s.enabled ?? DEFAULT_SETTINGS.frictionThresholds.enabled,
        // Migrate old threshold1/threshold2 keys to new names
        thresholdFloor: s.thresholdFloor ?? s.threshold1 ?? DEFAULT_SETTINGS.frictionThresholds.thresholdFloor,
        thresholdCeiling: s.thresholdCeiling ?? s.threshold2 ?? DEFAULT_SETTINGS.frictionThresholds.thresholdCeiling,
        softNudgeSteps: s.softNudgeSteps ?? DEFAULT_SETTINGS.frictionThresholds.softNudgeSteps,
      };
    })(),
    streamingMode: {
      ...DEFAULT_SETTINGS.streamingMode,
      ...(saved.streamingMode || {}),
    },
    toastDurationSeconds: saved.toastDurationSeconds ?? DEFAULT_SETTINGS.toastDurationSeconds,
    whitelistedChannels: (saved.whitelistedChannels ?? DEFAULT_SETTINGS.whitelistedChannels).map(e => ({
      ...e,
      behavior: (e.behavior as string) === 'track-only' ? 'full' as WhitelistBehavior : e.behavior,
    })),
    theme: saved.theme ?? DEFAULT_SETTINGS.theme,
  };
}
