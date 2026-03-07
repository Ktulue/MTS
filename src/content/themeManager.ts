/**
 * HC Theme Manager
 *
 * Detects Twitch's light/dark mode via the --color-background-base CSS variable
 * and applies .hc-light or .hc-dark to HC overlay elements.
 *
 * Supports three modes:
 *   - auto: follows Twitch's theme (observed via MutationObserver)
 *   - light / dark: user override, ignores Twitch
 */

import { ThemePreference, migrateSettings, DEFAULT_SETTINGS } from '../shared/types';
import { debug } from '../shared/logger';

const SETTINGS_KEY = 'hcSettings';
const TWITCH_BG_VAR = '--color-background-base';
const LIGHT_BG = '#ffffff';

let currentPreference: ThemePreference = 'auto';
let resolvedTheme: 'light' | 'dark' = 'dark';
let styleObserver: MutationObserver | null = null;

/** Read Twitch's current theme from the CSS variable */
function detectTwitchTheme(): 'light' | 'dark' {
  const bg = getComputedStyle(document.documentElement)
    .getPropertyValue(TWITCH_BG_VAR)
    .trim()
    .toLowerCase();
  return bg === LIGHT_BG ? 'light' : 'dark';
}

/** Resolve the effective theme from preference + Twitch detection */
function resolveTheme(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'light') return 'light';
  if (pref === 'dark') return 'dark';
  return detectTwitchTheme();
}

/** Apply theme class to all current and future HC overlays */
function applyTheme(theme: 'light' | 'dark'): void {
  if (theme === resolvedTheme && document.querySelectorAll('.hc-overlay').length > 0) {
    // Already applied and overlays exist — check if classes match
    const overlay = document.querySelector('.hc-overlay');
    if (overlay?.classList.contains(`hc-${theme}`)) return;
  }
  resolvedTheme = theme;

  document.querySelectorAll('.hc-overlay').forEach(el => {
    el.classList.remove('hc-light', 'hc-dark');
    el.classList.add(`hc-${theme}`);
  });

  document.querySelectorAll('.hc-nudge').forEach(el => {
    el.classList.remove('hc-light', 'hc-dark');
    el.classList.add(`hc-${theme}`);
  });
}

/** Called when Twitch's style attribute changes (theme toggle mid-session) */
function onStyleMutation(): void {
  if (currentPreference !== 'auto') return;
  const detected = detectTwitchTheme();
  if (detected !== resolvedTheme) {
    debug(`Twitch theme changed to ${detected}, updating HC overlays`);
    applyTheme(detected);
  }
}

/** Start observing <html> for style/class changes that indicate a theme switch */
function startTwitchObserver(): void {
  if (styleObserver) return;

  styleObserver = new MutationObserver(onStyleMutation);
  styleObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['style', 'class'],
  });
}

function stopTwitchObserver(): void {
  styleObserver?.disconnect();
  styleObserver = null;
}

/**
 * Hook into overlay creation — call this right after appending an overlay to the DOM.
 * Applies the current resolved theme class immediately.
 */
export function applyThemeToOverlay(overlayEl: HTMLElement): void {
  overlayEl.classList.remove('hc-light', 'hc-dark');
  overlayEl.classList.add(`hc-${resolvedTheme}`);
}

/** Update preference (called when settings change) */
export function setThemePreference(pref: ThemePreference): void {
  currentPreference = pref;
  const theme = resolveTheme(pref);
  applyTheme(theme);

  if (pref === 'auto') {
    startTwitchObserver();
  } else {
    stopTwitchObserver();
  }
}

/** Initialize theme manager — call once at content script startup */
export async function initThemeManager(): Promise<void> {
  try {
    const result = await chrome.storage.sync.get(SETTINGS_KEY);
    const settings = migrateSettings(result[SETTINGS_KEY] || {});
    currentPreference = settings.theme;
  } catch {
    currentPreference = DEFAULT_SETTINGS.theme;
  }

  resolvedTheme = resolveTheme(currentPreference);
  debug(`Theme manager initialized: preference=${currentPreference}, resolved=${resolvedTheme}`);

  if (currentPreference === 'auto') {
    startTwitchObserver();
  }

  // Listen for settings changes (user changes theme in options page)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes[SETTINGS_KEY]) return;
    const newSettings = migrateSettings(changes[SETTINGS_KEY].newValue || {});
    if (newSettings.theme !== currentPreference) {
      debug(`Theme preference changed: ${currentPreference} -> ${newSettings.theme}`);
      setThemePreference(newSettings.theme);
    }
  });
}
