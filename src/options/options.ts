/**
 * MTS Options Page - Settings management
 */

import { UserSettings, DEFAULT_SETTINGS } from '../shared/types';
import { log, loadLogs, setVersion } from '../shared/logger';

/** Storage key for user settings */
const SETTINGS_KEY = 'mtsSettings';

/**
 * Load settings from Chrome storage
 */
async function loadSettings(): Promise<UserSettings> {
  const result = await chrome.storage.sync.get(SETTINGS_KEY);
  return result[SETTINGS_KEY] || { ...DEFAULT_SETTINGS };
}

/**
 * Save settings to Chrome storage
 */
async function saveSettings(settings: UserSettings): Promise<void> {
  await chrome.storage.sync.set({ [SETTINGS_KEY]: settings });
}

/**
 * Populate form fields with current settings
 */
async function populateForm(): Promise<void> {
  const settings = await loadSettings();

  const hourlyRateInput = document.getElementById('hourly-rate') as HTMLInputElement;
  const taxRateInput = document.getElementById('tax-rate') as HTMLInputElement;

  if (hourlyRateInput) {
    hourlyRateInput.value = settings.hourlyRate.toString();
  }
  if (taxRateInput) {
    taxRateInput.value = settings.taxRate.toString();
  }
}

/**
 * Get settings from form fields
 */
function getFormSettings(): UserSettings {
  const hourlyRateInput = document.getElementById('hourly-rate') as HTMLInputElement;
  const taxRateInput = document.getElementById('tax-rate') as HTMLInputElement;

  return {
    hourlyRate: parseFloat(hourlyRateInput?.value) || DEFAULT_SETTINGS.hourlyRate,
    taxRate: parseFloat(taxRateInput?.value) || DEFAULT_SETTINGS.taxRate,
  };
}

/**
 * Show status message
 */
function showStatus(message: string, type: 'success' | 'error'): void {
  const statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;

    // Auto-hide success messages after 3 seconds
    if (type === 'success') {
      setTimeout(() => {
        statusEl.className = 'status';
      }, 3000);
    }
  }
}

/**
 * Handle save button click
 */
async function handleSave(): Promise<void> {
  try {
    const settings = getFormSettings();
    await saveSettings(settings);
    log('Settings saved', {
      hourlyRate: settings.hourlyRate,
      taxRate: settings.taxRate,
    });
    showStatus('Settings saved successfully!', 'success');
  } catch (error) {
    showStatus(`Error saving settings: ${error}`, 'error');
  }
}

/**
 * Handle reset button click
 */
async function handleReset(): Promise<void> {
  try {
    await saveSettings({ ...DEFAULT_SETTINGS });
    await populateForm();
    log('Settings reset to defaults', DEFAULT_SETTINGS);
    showStatus('Settings reset to defaults', 'success');
  } catch (error) {
    showStatus(`Error resetting settings: ${error}`, 'error');
  }
}

/**
 * Open logs page in new tab
 */
function openLogs(): void {
  chrome.tabs.create({
    url: chrome.runtime.getURL('logs.html')
  });
}

/**
 * Display extension version
 */
function displayVersion(): void {
  const versionEl = document.getElementById('version');
  if (versionEl) {
    const manifest = chrome.runtime.getManifest();
    versionEl.textContent = `MTS v${manifest.version}`;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize logger
  const manifest = chrome.runtime.getManifest();
  setVersion(manifest.version);
  await loadLogs();

  // Populate form with saved settings
  populateForm();

  // Display version
  displayVersion();

  // Set up event listeners
  const saveBtn = document.getElementById('btn-save');
  const resetBtn = document.getElementById('btn-reset');
  const logsBtn = document.getElementById('btn-logs');

  if (saveBtn) {
    saveBtn.addEventListener('click', handleSave);
  }
  if (resetBtn) {
    resetBtn.addEventListener('click', handleReset);
  }
  if (logsBtn) {
    logsBtn.addEventListener('click', openLogs);
  }
});
