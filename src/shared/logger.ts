/**
 * Centralized logging system for MTS
 *
 * Two separate log stores:
 *   - Extension Log: friction flow events, button detection, overlay interactions
 *   - Settings Log:  settings saves, resets, custom item CRUD
 *
 * Uses a read-modify-write pattern with debounced saves to prevent
 * concurrent writes from overwriting each other.
 */

export interface LogEntry {
  timestamp: string;
  level: 'log' | 'debug' | 'error' | 'warn';
  message: string;
  data?: unknown;
}

const MAX_LOGS = 200;
const EXTENSION_LOG_KEY = 'mtsExtensionLog';
const SETTINGS_LOG_KEY = 'mtsSettingsLog';
const VERSION_KEY = 'mtsVersion';

/** Pending buffers — one per log store */
let pendingExtension: LogEntry[] = [];
let pendingSettings: LogEntry[] = [];

let debugMode = true;
let saveExtTimeout: ReturnType<typeof setTimeout> | null = null;
let saveSetTimeout: ReturnType<typeof setTimeout> | null = null;
let currentVersion: string = '0.0.0';

/**
 * Set the current version (called from index.ts / options.ts)
 */
export function setVersion(version: string): void {
  currentVersion = version;
}

/**
 * Get formatted timestamp
 */
function getTimestamp(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Debounced save for a specific log store
 */
function scheduleSave(
  storageKey: string,
  getPending: () => LogEntry[],
  clearPending: () => void,
  getTimer: () => ReturnType<typeof setTimeout> | null,
  setTimer: (t: ReturnType<typeof setTimeout> | null) => void,
): void {
  const existing = getTimer();
  if (existing) clearTimeout(existing);

  setTimer(setTimeout(async () => {
    const entries = getPending();
    if (entries.length === 0) return;

    try {
      const result = await chrome.storage.local.get(storageKey);
      let stored: LogEntry[] = result[storageKey] || [];
      stored = [...stored, ...entries];
      if (stored.length > MAX_LOGS) {
        stored = stored.slice(-MAX_LOGS);
      }
      await chrome.storage.local.set({ [storageKey]: stored });
      clearPending();
    } catch (e) {
      console.error('[MTS] Failed to save logs:', e);
    }
  }, 100));
}

function scheduleExtensionSave(): void {
  scheduleSave(
    EXTENSION_LOG_KEY,
    () => pendingExtension,
    () => { pendingExtension = []; },
    () => saveExtTimeout,
    (t) => { saveExtTimeout = t; },
  );
}

function scheduleSettingsSave(): void {
  scheduleSave(
    SETTINGS_LOG_KEY,
    () => pendingSettings,
    () => { pendingSettings = []; },
    () => saveSetTimeout,
    (t) => { saveSetTimeout = t; },
  );
}

/**
 * Add entry to extension log buffer
 */
function addExtensionLog(level: LogEntry['level'], message: string, data?: unknown): void {
  pendingExtension.push({ timestamp: getTimestamp(), level, message, data });
  scheduleExtensionSave();
}

/**
 * Add entry to settings log buffer
 */
function addSettingsLog(message: string, data?: unknown): void {
  pendingSettings.push({ timestamp: getTimestamp(), level: 'log', message, data });
  scheduleSettingsSave();
}

// ── Initialization ──────────────────────────────────────────────────────

/**
 * Initialize logger and check version.
 * Clears both logs if version has changed.
 */
export async function loadLogs(): Promise<void> {
  try {
    const result = await chrome.storage.local.get([EXTENSION_LOG_KEY, SETTINGS_LOG_KEY, VERSION_KEY]);
    const storedVersion = result[VERSION_KEY] || '0.0.0';

    if (storedVersion !== currentVersion && currentVersion !== '0.0.0') {
      console.log(`[MTS] Version changed from ${storedVersion} to ${currentVersion} — clearing logs`);
      await chrome.storage.local.set({
        [EXTENSION_LOG_KEY]: [],
        [SETTINGS_LOG_KEY]: [],
        [VERSION_KEY]: currentVersion,
      });
    } else if (storedVersion !== currentVersion) {
      await chrome.storage.local.set({ [VERSION_KEY]: currentVersion });
    }
  } catch (e) {
    console.error('[MTS] Failed to load logs:', e);
  }
}

// ── Getters ─────────────────────────────────────────────────────────────

export async function getExtensionLogs(): Promise<LogEntry[]> {
  try {
    const result = await chrome.storage.local.get(EXTENSION_LOG_KEY);
    return result[EXTENSION_LOG_KEY] || [];
  } catch (e) {
    console.error('[MTS] Failed to get extension logs:', e);
    return [];
  }
}

export async function getSettingsLogs(): Promise<LogEntry[]> {
  try {
    const result = await chrome.storage.local.get(SETTINGS_LOG_KEY);
    return result[SETTINGS_LOG_KEY] || [];
  } catch (e) {
    console.error('[MTS] Failed to get settings logs:', e);
    return [];
  }
}

// ── Clearers ────────────────────────────────────────────────────────────

export function clearExtensionLogs(): void {
  pendingExtension = [];
  try { chrome.storage.local.set({ [EXTENSION_LOG_KEY]: [] }); } catch (e) {
    console.error('[MTS] Failed to clear extension logs:', e);
  }
}

export function clearSettingsLogs(): void {
  pendingSettings = [];
  try { chrome.storage.local.set({ [SETTINGS_LOG_KEY]: [] }); } catch (e) {
    console.error('[MTS] Failed to clear settings logs:', e);
  }
}

// ── Debug mode ──────────────────────────────────────────────────────────

export function setDebugMode(enabled: boolean): void {
  debugMode = enabled;
}

// ── Extension log functions ─────────────────────────────────────────────

export function log(message: string, data?: unknown): void {
  console.log('[MTS]', message, data !== undefined ? data : '');
  addExtensionLog('log', message, data);
}

export function debug(message: string, data?: unknown): void {
  if (!debugMode) return;
  console.log('[MTS DEBUG]', message, data !== undefined ? data : '');
  addExtensionLog('debug', message, data);
}

export function error(message: string, data?: unknown): void {
  console.error('[MTS ERROR]', message, data !== undefined ? data : '');
  addExtensionLog('error', message, data);
}

export function warn(message: string, data?: unknown): void {
  console.warn('[MTS WARN]', message, data !== undefined ? data : '');
  addExtensionLog('warn', message, data);
}

// ── Settings log function ───────────────────────────────────────────────

export function settingsLog(message: string, data?: unknown): void {
  console.log('[MTS SETTINGS]', message, data !== undefined ? data : '');
  addSettingsLog(message, data);
}
