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

/** User settings (will be expanded in MVP Part 2) */
export interface UserSettings {
  hourlyRate: number;
  taxRate: number;
  // More settings will be added later
}

/** Default settings for new users */
export const DEFAULT_SETTINGS: UserSettings = {
  hourlyRate: 35,
  taxRate: 7.5,
};
