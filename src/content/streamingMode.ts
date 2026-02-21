/**
 * Streaming Mode — bypass friction when the user is live on their own channel.
 * Handles live detection, grace period, state persistence, and badge display.
 */

import { UserSettings } from '../shared/types';
import { getCurrentChannel } from './detector';
import { log } from '../shared/logger';

const STREAMING_STATE_KEY = 'mtsStreamingState';

interface StreamingState {
  streamEndedAt: number | null;
  manualOverrideUntil: number | null;
}

async function loadStreamingState(): Promise<StreamingState> {
  try {
    const result = await chrome.storage.local.get(STREAMING_STATE_KEY);
    return result[STREAMING_STATE_KEY] || { streamEndedAt: null, manualOverrideUntil: null };
  } catch {
    return { streamEndedAt: null, manualOverrideUntil: null };
  }
}

async function saveStreamingState(state: StreamingState): Promise<void> {
  try {
    await chrome.storage.local.set({ [STREAMING_STATE_KEY]: state });
  } catch { /* ignore */ }
}

/**
 * Detect if the current page shows a live stream.
 * Checks the Twitch live status text indicator first, then falls back to
 * legacy data-a-target attributes and JSON-LD schema metadata.
 */
export function detectIfLive(): boolean {
  // Primary: Twitch channel status text — look for a <span> containing "LIVE"
  // inside p.tw-channel-status-text-indicator (inside the Stream Information section).
  // Use innerText to match only visible text, avoiding hidden/aria text.
  const statusEl = document.querySelector('p.tw-channel-status-text-indicator');
  if (statusEl) {
    const span = statusEl.querySelector('span');
    if (span && (span as HTMLElement).innerText?.includes('LIVE')) return true;
    // Fallback: check the p element itself in case the span layer is absent
    if ((statusEl as HTMLElement).innerText?.includes('LIVE')) return true;
  }

  // Secondary: stream information section aria-label (present while live)
  const streamInfo = document.querySelector('#live-channel-stream-information[aria-label="Stream Information"]');
  if (streamInfo) {
    // Confirm "LIVE" text is visible inside the section to avoid VOD false positives
    if ((streamInfo as HTMLElement).innerText?.includes('LIVE')) return true;
  }

  // Legacy fallbacks (may appear in embedded or older page layouts)
  if (document.querySelector('[data-a-target="live-indicator"]')) return true;
  if (document.querySelector('[data-a-target="player-state-live"]')) return true;

  // JSON-LD schema.org fallback
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const s of scripts) {
    try {
      const data = JSON.parse(s.textContent || '');
      if (data.isLiveBroadcast === true) return true;
    } catch { /* ignore */ }
  }
  return false;
}

/**
 * Returns true if the current purchase attempt should skip the friction overlay.
 * Requires: streaming mode enabled, username configured, on that channel's page,
 * and either currently live or within the grace period.
 */
export async function shouldBypassFriction(settings: UserSettings): Promise<boolean> {
  const enabled = settings.streamingMode.enabled;
  const username = settings.streamingMode.twitchUsername.trim().toLowerCase();
  const currentChannel = getCurrentChannel()?.toLowerCase() || '';
  const onOwnChannel = !!username && currentChannel === username;
  const channelIsLive = onOwnChannel ? detectIfLive() : false;

  const logResult = (result: boolean | string) =>
    log(`Streaming mode check: enabled=${enabled}, onOwnChannel=${onOwnChannel}, channelIsLive=${channelIsLive}, result=${result}`);

  if (!enabled || !username || !onOwnChannel) {
    logResult(false);
    return false;
  }

  const state = await loadStreamingState();

  // Manual override (future popup feature)
  if (state.manualOverrideUntil && Date.now() < state.manualOverrideUntil) {
    logResult('true (manual override)');
    return true;
  }

  if (channelIsLive) {
    logResult('true (live)');
    return true;
  }

  // Grace period after stream ended
  if (state.streamEndedAt) {
    const elapsed = Date.now() - state.streamEndedAt;
    const inGrace = elapsed < settings.streamingMode.gracePeriodMinutes * 60000;
    logResult(`${inGrace} (grace period, elapsed=${Math.round(elapsed / 1000)}s)`);
    return inGrace;
  }

  logResult(false);
  return false;
}

// Track the previous live state to detect transitions
let _wasLive = false;

/**
 * Called on a 30s polling interval.
 * Detects live→offline transitions and saves state accordingly.
 */
export async function checkAndUpdateLiveStatus(settings: UserSettings): Promise<void> {
  if (!settings.streamingMode.enabled) return;
  const username = settings.streamingMode.twitchUsername.trim().toLowerCase();
  if (!username) return;
  const currentChannel = getCurrentChannel()?.toLowerCase();
  if (!currentChannel || currentChannel !== username) return;

  const isLive = detectIfLive();

  if (_wasLive && !isLive) {
    // Stream just ended — start grace period
    const state = await loadStreamingState();
    await saveStreamingState({ ...state, streamEndedAt: Date.now() });
    log('Stream ended — grace period started');
    _wasLive = false;
  } else if (isLive && !_wasLive) {
    // Stream started / resumed — clear any previous end timestamp
    const state = await loadStreamingState();
    await saveStreamingState({ ...state, streamEndedAt: null });
    log('Stream detected live');
    _wasLive = true;
  }

  updateGracePeriodBadge(settings);
}

/**
 * Show or update the grace period badge in the page corner.
 * Badge is removed when outside the grace period.
 */
export async function updateGracePeriodBadge(settings: UserSettings): Promise<void> {
  const existingBadge = document.getElementById('mts-grace-badge');

  const state = await loadStreamingState();
  if (!state.streamEndedAt) {
    existingBadge?.remove();
    return;
  }

  const elapsed = Date.now() - state.streamEndedAt;
  const gracePeriodMs = settings.streamingMode.gracePeriodMinutes * 60000;
  const remaining = gracePeriodMs - elapsed;

  if (remaining <= 0) {
    existingBadge?.remove();
    return;
  }

  const minutesLeft = Math.ceil(remaining / 60000);
  const badge = existingBadge || document.createElement('div');
  badge.id = 'mts-grace-badge';
  badge.textContent = `Grace Period: ${minutesLeft}m remaining`;

  if (!existingBadge) {
    document.body.appendChild(badge);
  }
}
