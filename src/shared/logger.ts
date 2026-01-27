/**
 * Centralized logging system for MTS
 * Uses a read-modify-write pattern to prevent logs from different contexts
 * (content script, options page) from overwriting each other.
 */

export interface LogEntry {
  timestamp: string;
  level: 'log' | 'debug' | 'error' | 'warn';
  message: string;
  data?: unknown;
}

const MAX_LOGS = 200;
const STORAGE_KEY = 'mtsLogs';
const VERSION_KEY = 'mtsVersion';

/** Buffer of entries waiting to be saved */
let pendingEntries: LogEntry[] = [];
let debugMode = true;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
let currentVersion: string = '0.0.0';
let initialized = false;

/**
 * Set the current version (called from index.ts)
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
 * Save pending entries to chrome.storage (debounced, read-modify-write)
 */
function scheduleSave(): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(async () => {
    if (pendingEntries.length === 0) return;

    try {
      // Read current logs from storage
      const result = await chrome.storage.local.get(STORAGE_KEY);
      let storedLogs: LogEntry[] = result[STORAGE_KEY] || [];

      // Append pending entries
      storedLogs = [...storedLogs, ...pendingEntries];

      // Keep only the most recent logs
      if (storedLogs.length > MAX_LOGS) {
        storedLogs = storedLogs.slice(-MAX_LOGS);
      }

      // Save back to storage
      await chrome.storage.local.set({ [STORAGE_KEY]: storedLogs });

      // Clear pending entries
      pendingEntries = [];
    } catch (e) {
      console.error('[MTS] Failed to save logs:', e);
    }
  }, 100); // Debounce: save 100ms after last log
}

/**
 * Add a log entry to the pending buffer
 */
function addLog(level: LogEntry['level'], message: string, data?: unknown): void {
  const entry: LogEntry = {
    timestamp: getTimestamp(),
    level,
    message,
    data,
  };

  pendingEntries.push(entry);

  // Schedule save to storage
  scheduleSave();
}

/**
 * Initialize logger and check version
 * Clears logs if version has changed
 */
export async function loadLogs(): Promise<LogEntry[]> {
  try {
    const result = await chrome.storage.local.get([STORAGE_KEY, VERSION_KEY]);
    const storedVersion = result[VERSION_KEY] || '0.0.0';
    let storedLogs: LogEntry[] = result[STORAGE_KEY] || [];

    // Check if version changed - clear logs if so
    if (storedVersion !== currentVersion && currentVersion !== '0.0.0') {
      console.log(`[MTS] Version changed from ${storedVersion} to ${currentVersion} - clearing logs`);
      storedLogs = [];
      await chrome.storage.local.set({
        [STORAGE_KEY]: [],
        [VERSION_KEY]: currentVersion
      });
    } else if (storedVersion !== currentVersion) {
      // Update stored version if needed
      await chrome.storage.local.set({ [VERSION_KEY]: currentVersion });
    }

    initialized = true;
    return storedLogs;
  } catch (e) {
    console.error('[MTS] Failed to load logs:', e);
    initialized = true;
    return [];
  }
}

/**
 * Clear all logs
 */
export function clearLogs(): void {
  pendingEntries = [];
  try {
    chrome.storage.local.set({ [STORAGE_KEY]: [] });
  } catch (e) {
    console.error('[MTS] Failed to clear logs:', e);
  }
}

/**
 * Get current logs from storage
 */
export async function getLogs(): Promise<LogEntry[]> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || [];
  } catch (e) {
    console.error('[MTS] Failed to get logs:', e);
    return [];
  }
}

/**
 * Set debug mode
 */
export function setDebugMode(enabled: boolean): void {
  debugMode = enabled;
}

/**
 * Log functions
 */
export function log(message: string, data?: unknown): void {
  console.log('[MTS]', message, data !== undefined ? data : '');
  addLog('log', message, data);
}

export function debug(message: string, data?: unknown): void {
  if (!debugMode) return;
  console.log('[MTS DEBUG]', message, data !== undefined ? data : '');
  addLog('debug', message, data);
}

export function error(message: string, data?: unknown): void {
  console.error('[MTS ERROR]', message, data !== undefined ? data : '');
  addLog('error', message, data);
}

export function warn(message: string, data?: unknown): void {
  console.warn('[MTS WARN]', message, data !== undefined ? data : '');
  addLog('warn', message, data);
}
