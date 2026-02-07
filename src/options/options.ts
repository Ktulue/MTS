/**
 * MTS Options Page - Settings management
 */

import {
  UserSettings, DEFAULT_SETTINGS, ComparisonItem,
  PRESET_COMPARISON_ITEMS, migrateSettings,
} from '../shared/types';
import { settingsLog, loadLogs, setVersion } from '../shared/logger';

/** Storage key for user settings */
const SETTINGS_KEY = 'mtsSettings';

/**
 * Load settings from Chrome storage (with migration)
 */
async function loadSettings(): Promise<UserSettings> {
  const result = await chrome.storage.sync.get(SETTINGS_KEY);
  return migrateSettings(result[SETTINGS_KEY] || {});
}

/**
 * Save settings to Chrome storage
 */
async function saveSettings(settings: UserSettings): Promise<void> {
  await chrome.storage.sync.set({ [SETTINGS_KEY]: settings });
}

/**
 * Show/hide a subsection and enable/disable its inputs
 */
function toggleSubsection(sectionId: string, enabled: boolean): void {
  const section = document.getElementById(sectionId);
  if (!section) return;
  section.style.display = enabled ? 'block' : 'none';
  section.querySelectorAll('input, select').forEach(el => {
    (el as HTMLInputElement).disabled = !enabled;
  });
}

/**
 * Render preset comparison items with toggle switches
 */
function renderPresetItems(items: ComparisonItem[]): void {
  const container = document.getElementById('preset-items');
  if (!container) return;
  container.innerHTML = '';

  const presets = items.filter(i => i.isPreset);
  for (const item of presets) {
    const priceText = `$${item.price.toFixed(2)}`;

    const row = document.createElement('div');
    row.className = 'toggle-row';
    row.innerHTML = `
      <span class="toggle-label">
        <span class="toggle-emoji">${item.emoji}</span>
        <span class="toggle-name">${item.name}</span>
        <span class="toggle-price">${priceText}</span>
      </span>
      <label class="toggle-switch">
        <input type="checkbox" data-item-id="${item.id}" ${item.enabled ? 'checked' : ''}>
        <span class="toggle-slider"></span>
      </label>
    `;
    container.appendChild(row);
  }
}

/**
 * Render custom comparison items with toggle/edit/delete controls
 */
function renderCustomItems(items: ComparisonItem[]): void {
  const container = document.getElementById('custom-items-list');
  const noItemsMsg = document.getElementById('no-custom-items');
  if (!container) return;

  // Remove existing custom item rows
  container.querySelectorAll('.custom-item-row').forEach(el => el.remove());

  const customs = items.filter(i => !i.isPreset);
  if (noItemsMsg) {
    noItemsMsg.style.display = customs.length === 0 ? 'block' : 'none';
  }

  for (const item of customs) {
    const row = document.createElement('div');
    row.className = 'custom-item-row';
    row.dataset.itemId = item.id;
    row.innerHTML = `
      <label class="toggle-switch">
        <input type="checkbox" data-item-id="${item.id}" ${item.enabled ? 'checked' : ''}>
        <span class="toggle-slider"></span>
      </label>
      <span class="custom-item-info">
        <span>${item.emoji}</span>
        <span>${item.name} - $${item.price.toFixed(2)}</span>
      </span>
      <button class="btn-icon danger" data-delete-id="${item.id}" title="Delete">&#10005;</button>
    `;
    container.appendChild(row);
  }
}

/**
 * Show the add-item form
 */
function showAddForm(): void {
  document.getElementById('add-item-form')?.classList.add('visible');
  const addBtn = document.getElementById('btn-add-item');
  if (addBtn) addBtn.style.display = 'none';
}

/**
 * Hide the add-item form and clear inputs
 */
function hideAddForm(): void {
  document.getElementById('add-item-form')?.classList.remove('visible');
  const addBtn = document.getElementById('btn-add-item');
  if (addBtn) addBtn.style.display = '';
  ['new-item-emoji', 'new-item-name', 'new-item-price', 'new-item-plural'].forEach(id => {
    const el = document.getElementById(id) as HTMLInputElement;
    if (el) el.value = '';
  });
}

/**
 * Add a custom comparison item
 */
async function addCustomItem(): Promise<void> {
  const emoji = (document.getElementById('new-item-emoji') as HTMLInputElement).value.trim() || '\u{1F381}';
  const name = (document.getElementById('new-item-name') as HTMLInputElement).value.trim();
  const price = parseFloat((document.getElementById('new-item-price') as HTMLInputElement).value);
  const plural = (document.getElementById('new-item-plural') as HTMLInputElement).value.trim();

  if (!name || isNaN(price) || price <= 0 || !plural) {
    showStatus('Please fill in all fields for the custom item.', 'error');
    return;
  }

  const newItem: ComparisonItem = {
    id: `custom-${Date.now()}`,
    emoji,
    name,
    price,
    pluralLabel: plural,
    enabled: true,
    isPreset: false,
  };

  try {
    const settings = await loadSettings();
    settings.comparisonItems.push(newItem);
    await saveSettings(settings);
    renderCustomItems(settings.comparisonItems);
    hideAddForm();
    showStatus('Custom item added!', 'success');
    settingsLog('Custom comparison item added:', { name, price, plural });
  } catch (error) {
    showStatus(`Error adding item: ${error}`, 'error');
  }
}

/**
 * Delete a custom comparison item
 */
async function deleteCustomItem(itemId: string): Promise<void> {
  try {
    const settings = await loadSettings();
    settings.comparisonItems = settings.comparisonItems.filter(i => i.id !== itemId);
    await saveSettings(settings);
    renderCustomItems(settings.comparisonItems);
    showStatus('Item removed.', 'success');
    settingsLog('Custom comparison item deleted:', itemId);
  } catch (error) {
    showStatus(`Error removing item: ${error}`, 'error');
  }
}

/**
 * Populate form fields with current settings
 */
async function populateForm(): Promise<void> {
  const settings = await loadSettings();

  // Income & tax
  const hourlyRateInput = document.getElementById('hourly-rate') as HTMLInputElement;
  const taxRateInput = document.getElementById('tax-rate') as HTMLInputElement;
  if (hourlyRateInput) hourlyRateInput.value = settings.hourlyRate.toString();
  if (taxRateInput) taxRateInput.value = settings.taxRate.toString();

  // Comparison items
  renderPresetItems(settings.comparisonItems);
  renderCustomItems(settings.comparisonItems);

  // Friction thresholds
  const thresholdsEnabled = document.getElementById('thresholds-enabled') as HTMLInputElement;
  const threshold1 = document.getElementById('threshold1') as HTMLInputElement;
  const threshold2 = document.getElementById('threshold2') as HTMLInputElement;
  if (thresholdsEnabled) thresholdsEnabled.checked = settings.frictionThresholds.enabled;
  if (threshold1) threshold1.value = settings.frictionThresholds.threshold1.toString();
  if (threshold2) threshold2.value = settings.frictionThresholds.threshold2.toString();
  toggleSubsection('thresholds-config', settings.frictionThresholds.enabled);

  // Cooldown
  const cooldownEnabled = document.getElementById('cooldown-enabled') as HTMLInputElement;
  const cooldownMinutes = document.getElementById('cooldown-minutes') as HTMLSelectElement;
  if (cooldownEnabled) cooldownEnabled.checked = settings.cooldown.enabled;
  if (cooldownMinutes) cooldownMinutes.value = settings.cooldown.minutes.toString();
  toggleSubsection('cooldown-config', settings.cooldown.enabled);

  // Daily cap
  const dailycapEnabled = document.getElementById('dailycap-enabled') as HTMLInputElement;
  const dailycapAmount = document.getElementById('dailycap-amount') as HTMLInputElement;
  if (dailycapEnabled) dailycapEnabled.checked = settings.dailyCap.enabled;
  if (dailycapAmount) dailycapAmount.value = settings.dailyCap.amount.toString();
  toggleSubsection('dailycap-config', settings.dailyCap.enabled);
}

/**
 * Get settings from form fields (async — reads current items from storage for toggle merging)
 */
async function getFormSettings(): Promise<UserSettings> {
  const current = await loadSettings();

  // Update comparison item toggle states from DOM checkboxes
  const updatedItems = current.comparisonItems.map(item => {
    const checkbox = document.querySelector(`input[data-item-id="${item.id}"]`) as HTMLInputElement | null;
    return checkbox ? { ...item, enabled: checkbox.checked } : item;
  });

  return {
    hourlyRate: parseFloat((document.getElementById('hourly-rate') as HTMLInputElement)?.value) || DEFAULT_SETTINGS.hourlyRate,
    taxRate: parseFloat((document.getElementById('tax-rate') as HTMLInputElement)?.value) || DEFAULT_SETTINGS.taxRate,
    comparisonItems: updatedItems,
    cooldown: {
      enabled: (document.getElementById('cooldown-enabled') as HTMLInputElement)?.checked ?? false,
      minutes: parseInt((document.getElementById('cooldown-minutes') as HTMLSelectElement)?.value) || 5,
    },
    dailyCap: {
      enabled: (document.getElementById('dailycap-enabled') as HTMLInputElement)?.checked ?? false,
      amount: parseFloat((document.getElementById('dailycap-amount') as HTMLInputElement)?.value) || 50,
    },
    frictionThresholds: {
      enabled: (document.getElementById('thresholds-enabled') as HTMLInputElement)?.checked ?? false,
      threshold1: parseFloat((document.getElementById('threshold1') as HTMLInputElement)?.value) || 5,
      threshold2: parseFloat((document.getElementById('threshold2') as HTMLInputElement)?.value) || 25,
    },
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
    const settings = await getFormSettings();
    await saveSettings(settings);
    settingsLog('Settings saved', settings);
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
    await saveSettings({ ...DEFAULT_SETTINGS, comparisonItems: [...PRESET_COMPARISON_ITEMS] });
    await populateForm();
    settingsLog('Settings reset to defaults', DEFAULT_SETTINGS);
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
  await populateForm();

  // Display version
  displayVersion();

  // Set up event listeners — main actions
  document.getElementById('btn-save')?.addEventListener('click', handleSave);
  document.getElementById('btn-reset')?.addEventListener('click', handleReset);
  document.getElementById('btn-logs')?.addEventListener('click', openLogs);

  // Toggle subsection visibility
  document.getElementById('thresholds-enabled')?.addEventListener('change', (e) => {
    toggleSubsection('thresholds-config', (e.target as HTMLInputElement).checked);
  });
  document.getElementById('cooldown-enabled')?.addEventListener('change', (e) => {
    toggleSubsection('cooldown-config', (e.target as HTMLInputElement).checked);
  });
  document.getElementById('dailycap-enabled')?.addEventListener('change', (e) => {
    toggleSubsection('dailycap-config', (e.target as HTMLInputElement).checked);
  });

  // Custom item form
  document.getElementById('btn-add-item')?.addEventListener('click', showAddForm);
  document.getElementById('btn-cancel-item')?.addEventListener('click', hideAddForm);
  document.getElementById('btn-save-item')?.addEventListener('click', addCustomItem);

  // Delegated click handler for custom item delete buttons
  document.getElementById('custom-items-list')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const deleteBtn = target.closest('[data-delete-id]');
    if (deleteBtn) {
      const deleteId = deleteBtn.getAttribute('data-delete-id');
      if (deleteId) deleteCustomItem(deleteId);
    }
  });
});
