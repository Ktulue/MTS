/**
 * MTS Options Page - Settings management
 */

import {
  UserSettings, DEFAULT_SETTINGS, ComparisonItem,
  PRESET_COMPARISON_ITEMS, migrateSettings,
  WhitelistEntry, WhitelistBehavior,
} from '../shared/types';
import { settingsLog, loadLogs, setVersion } from '../shared/logger';

/** Storage key for user settings */
const SETTINGS_KEY = 'mtsSettings';

/** Tracks whether the add form is in edit mode (holds the item ID being edited) */
let editingItemId: string | null = null;

/** Cached settings to allow synchronous lookup in event handlers */
let cachedSettings: UserSettings | null = null;

/** Name entered when a similarity warning was triggered (for logging on confirm/cancel) */
let pendingNewName: string | null = null;
/** Existing item name that triggered the similarity warning */
let pendingExistingName: string | null = null;

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
 * Sync the threshold-floor field to the daily cap amount when the cap is enabled.
 * The field becomes read-only (greyed, linked note shown) and mirrors the cap value.
 * When the cap is disabled, the field reverts to the user's stored custom value.
 */
function updateThresholdFloorLinkState(): void {
  const capEnabledEl = document.getElementById('dailycap-enabled') as HTMLInputElement | null;
  const capAmountEl = document.getElementById('dailycap-amount') as HTMLInputElement | null;
  const floorEl = document.getElementById('threshold-floor') as HTMLInputElement | null;
  const linkedNote = document.getElementById('threshold-floor-linked-note');
  if (!floorEl) return;

  const capEnabled = capEnabledEl?.checked ?? false;
  if (capEnabled) {
    const capAmount = parseFloat(capAmountEl?.value ?? '') || 0;
    floorEl.value = capAmount.toString();
    floorEl.disabled = true;
    floorEl.classList.add('input-linked');
    if (linkedNote) linkedNote.style.display = 'block';
    clearFieldError('threshold-floor'); // floor is linked — user can't edit it
  } else {
    const stored = cachedSettings?.frictionThresholds.thresholdFloor ?? DEFAULT_SETTINGS.frictionThresholds.thresholdFloor;
    floorEl.value = stored.toString();
    floorEl.disabled = false;
    floorEl.classList.remove('input-linked');
    if (linkedNote) linkedNote.style.display = 'none';
  }
}

/**
 * Update the "of N enabled (M total)" count displayed next to the soft nudge steps input.
 * Reads live checkbox state so it reflects unsaved toggles immediately.
 */
function updateSoftNudgeStepsCount(): void {
  const countEl = document.getElementById('soft-nudge-steps-count');
  if (!countEl) return;
  const all = document.querySelectorAll('input[data-item-id]') as NodeListOf<HTMLInputElement>;
  const total = all.length;
  const enabled = Array.from(all).filter(cb => cb.checked).length;
  countEl.textContent = `of ${enabled} enabled (${total} total)`;
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
      <button class="btn-icon" data-edit-id="${item.id}" title="Edit">&#9998;</button>
      <button class="btn-icon danger" data-delete-id="${item.id}" title="Delete">&#10005;</button>
    `;
    container.appendChild(row);
  }
}

/**
 * Pre-populate the add form with an existing item's values for editing
 */
function showEditForm(item: ComparisonItem): void {
  (document.getElementById('new-item-emoji') as HTMLInputElement).value = item.emoji;
  (document.getElementById('new-item-name') as HTMLInputElement).value = item.name;
  (document.getElementById('new-item-price') as HTMLInputElement).value = String(item.price);
  (document.getElementById('new-item-plural') as HTMLInputElement).value = item.pluralLabel;
  editingItemId = item.id;
  const saveBtn = document.getElementById('btn-save-item');
  if (saveBtn) saveBtn.textContent = 'Save Changes';
  showAddForm();
}

/**
 * Show the add-item form
 */
function showAddForm(): void {
  document.getElementById('add-item-form')?.classList.add('visible');
  const addBtn = document.getElementById('btn-add-item');
  if (addBtn) addBtn.style.display = 'none';
  clearAllItemErrors();
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
  editingItemId = null;
  const saveBtn = document.getElementById('btn-save-item');
  if (saveBtn) saveBtn.textContent = 'Add';
  hideSimilarityWarning();
  clearAllItemErrors();
}

/**
 * Normalize a name for similarity comparison:
 * lowercase, trim, strip emoji and non-alphanumeric chars, collapse spaces.
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compute Levenshtein edit distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Find an exact name duplicate (case-insensitive, trimmed) among all items.
 * The item being edited (excludeId) is excluded from the check.
 */
function findDuplicate(name: string, items: ComparisonItem[], excludeId: string | null): ComparisonItem | null {
  const key = name.toLowerCase().trim();
  return items.find(item => item.id !== excludeId && item.name.toLowerCase().trim() === key) ?? null;
}

/**
 * Find a similar (but not exact-duplicate) item via normalized substring or Levenshtein ≤ 2.
 * The item being edited (excludeId) is excluded from the check.
 */
function findSimilar(name: string, items: ComparisonItem[], excludeId: string | null): ComparisonItem | null {
  const norm = normalizeName(name);
  if (!norm) return null;
  for (const item of items) {
    if (item.id === excludeId) continue;
    const itemNorm = normalizeName(item.name);
    if (!itemNorm) continue;
    if (norm.includes(itemNorm) || itemNorm.includes(norm)) return item;
    if (levenshteinDistance(norm, itemNorm) <= 2) return item;
  }
  return null;
}

/**
 * Show the inline similarity warning and record the names for logging.
 */
function showSimilarityWarning(newName: string, existingName: string): void {
  pendingNewName = newName;
  pendingExistingName = existingName;
  const textEl = document.getElementById('similarity-warning-text');
  if (textEl) textEl.textContent = `This looks similar to "${existingName}". Are you sure you want to add it?`;
  const warningEl = document.getElementById('similarity-warning');
  if (warningEl) warningEl.style.display = 'block';
}

/**
 * Hide the inline similarity warning and clear pending state.
 */
function hideSimilarityWarning(): void {
  const warningEl = document.getElementById('similarity-warning');
  if (warningEl) warningEl.style.display = 'none';
  pendingNewName = null;
  pendingExistingName = null;
}

// ── Validation infrastructure ────────────────────────────────────────────

/** Field IDs with active errors in the main settings form — blocks btn-save */
const invalidFields = new Set<string>();
/** Field IDs with active errors in the custom item sub-form — blocks btn-save-item */
const invalidItemFields = new Set<string>();

/** Show an error below `#${fieldId}-error` and disable btn-save. */
function showFieldError(fieldId: string, message: string): void {
  const errEl = document.getElementById(`${fieldId}-error`);
  if (errEl) { errEl.textContent = message; errEl.classList.add('visible'); }
  invalidFields.add(fieldId);
  const btn = document.getElementById('btn-save') as HTMLButtonElement | null;
  if (btn) btn.disabled = invalidFields.size > 0;
}

/** Clear the error for `#${fieldId}-error` and re-enable btn-save when no errors remain. */
function clearFieldError(fieldId: string): void {
  const errEl = document.getElementById(`${fieldId}-error`);
  if (errEl) { errEl.textContent = ''; errEl.classList.remove('visible'); }
  invalidFields.delete(fieldId);
  const btn = document.getElementById('btn-save') as HTMLButtonElement | null;
  if (btn) btn.disabled = invalidFields.size > 0;
}

/** Show an error in the custom item sub-form and disable btn-save-item. */
function showItemFieldError(fieldId: string, message: string): void {
  const errEl = document.getElementById(`${fieldId}-error`);
  if (errEl) { errEl.textContent = message; errEl.classList.add('visible'); }
  invalidItemFields.add(fieldId);
  const btn = document.getElementById('btn-save-item') as HTMLButtonElement | null;
  if (btn) btn.disabled = invalidItemFields.size > 0;
}

/** Clear a custom item sub-form error and re-enable btn-save-item when no errors remain. */
function clearItemFieldError(fieldId: string): void {
  const errEl = document.getElementById(`${fieldId}-error`);
  if (errEl) { errEl.textContent = ''; errEl.classList.remove('visible'); }
  invalidItemFields.delete(fieldId);
  const btn = document.getElementById('btn-save-item') as HTMLButtonElement | null;
  if (btn) btn.disabled = invalidItemFields.size > 0;
}

/** Clear all custom item sub-form errors and re-enable btn-save-item. */
function clearAllItemErrors(): void {
  ['item-name', 'new-item-emoji', 'new-item-price'].forEach(clearItemFieldError);
}

// ── Field validators ─────────────────────────────────────────────────────

function validateHourlyRate(value: string): string | null {
  const n = parseFloat(value);
  return (!value.trim() || isNaN(n) || n <= 0 || n > 1000)
    ? 'Please enter a valid hourly rate.' : null;
}

function validateTaxRate(value: string): string | null {
  const n = parseFloat(value);
  return (isNaN(n) || n < 0 || n > 25)
    ? 'Tax rate must be between 0% and 25%.' : null;
}

function validateThresholdFloor(floorVal: string, ceilVal: string): string | null {
  const floor = parseFloat(floorVal);
  const ceil = parseFloat(ceilVal);
  if (isNaN(floor) || floor < 0) return 'Lower threshold must be less than upper threshold.';
  if (!isNaN(ceil) && floor >= ceil) return 'Lower threshold must be less than upper threshold.';
  return null;
}

function validateThresholdCeiling(floorVal: string, ceilVal: string): string | null {
  const floor = parseFloat(floorVal);
  const ceil = parseFloat(ceilVal);
  if (isNaN(ceil) || ceil <= 0) return 'Upper threshold must be greater than lower threshold.';
  if (!isNaN(floor) && ceil <= floor) return 'Upper threshold must be greater than lower threshold.';
  return null;
}

function validateDailyCap(value: string): string | null {
  const n = parseFloat(value);
  return (isNaN(n) || n <= 0) ? 'Please enter a valid daily spending cap.' : null;
}

function validateItemName(value: string): string | null {
  const t = value.trim();
  return (!t || t.length > 50) ? 'Comparison name is required (max 50 characters).' : null;
}

function validateItemPrice(value: string): string | null {
  const n = parseFloat(value);
  return (isNaN(n) || n <= 0 || n > 100000) ? 'Please enter a valid price greater than $0.' : null;
}

function validateItemEmoji(value: string): string | null {
  if (!value.trim()) return null; // optional
  return ([...value.trim()].length > 2) ? 'Please enter a single emoji or leave blank.' : null;
}

function validateWhitelistUsername(normalized: string): string | null {
  return (!normalized || !/^[a-z0-9_]{1,25}$/.test(normalized))
    ? 'Enter a valid Twitch username (letters, numbers, underscores).' : null;
}

// ── Cross-field helpers ───────────────────────────────────────────────────

/** Re-validate both threshold fields together (used on blur of either). */
function revalidateThresholds(): void {
  const enabled = (document.getElementById('thresholds-enabled') as HTMLInputElement)?.checked ?? false;
  if (!enabled) return;
  const floorEl = document.getElementById('threshold-floor') as HTMLInputElement;
  const ceilEl = document.getElementById('threshold-ceiling') as HTMLInputElement;
  const floorErr = validateThresholdFloor(floorEl?.value ?? '', ceilEl?.value ?? '');
  const ceilErr = validateThresholdCeiling(floorEl?.value ?? '', ceilEl?.value ?? '');
  if (floorErr) showFieldError('threshold-floor', floorErr); else clearFieldError('threshold-floor');
  if (ceilErr) showFieldError('threshold-ceiling', ceilErr); else clearFieldError('threshold-ceiling');
}

/** Show/clear the whitelist username error (does not affect btn-save). */
function showWhitelistError(message: string): void {
  const errEl = document.getElementById('whitelist-username-error');
  if (errEl) { errEl.textContent = message; errEl.classList.add('visible'); }
}
function clearWhitelistError(): void {
  const errEl = document.getElementById('whitelist-username-error');
  if (errEl) { errEl.textContent = ''; errEl.classList.remove('visible'); }
}

/**
 * Validate all main-form fields. Returns the error count.
 * Pass logErrors=true (save attempt) to write each failure to the settings log.
 */
function validateAllFields(logErrors = false): number {
  let errorCount = 0;

  const check = (fieldId: string, error: string | null, logLabel: string, entered: string): void => {
    if (error) {
      showFieldError(fieldId, error);
      if (logErrors) settingsLog(`Validation error: ${logLabel} invalid (entered: ${entered})`);
      errorCount++;
    } else {
      clearFieldError(fieldId);
    }
  };

  const hourlyEl = document.getElementById('hourly-rate') as HTMLInputElement;
  check('hourly-rate', validateHourlyRate(hourlyEl?.value ?? ''), 'Hourly rate', hourlyEl?.value ?? '');

  const taxEl = document.getElementById('tax-rate') as HTMLInputElement;
  check('tax-rate', validateTaxRate(taxEl?.value ?? ''), 'Tax rate', taxEl?.value ?? '');

  const thresholdsOn = (document.getElementById('thresholds-enabled') as HTMLInputElement)?.checked ?? false;
  const capOn = (document.getElementById('dailycap-enabled') as HTMLInputElement)?.checked ?? false;
  if (thresholdsOn) {
    const floorEl = document.getElementById('threshold-floor') as HTMLInputElement;
    const ceilEl = document.getElementById('threshold-ceiling') as HTMLInputElement;
    // Floor is linked/disabled when daily cap is on — skip its validation in that case
    if (!capOn) {
      check('threshold-floor', validateThresholdFloor(floorEl?.value ?? '', ceilEl?.value ?? ''), 'Lower threshold', floorEl?.value ?? '');
    } else {
      clearFieldError('threshold-floor');
    }
    check('threshold-ceiling', validateThresholdCeiling(floorEl?.value ?? '', ceilEl?.value ?? ''), 'Upper threshold', ceilEl?.value ?? '');
  } else {
    clearFieldError('threshold-floor');
    clearFieldError('threshold-ceiling');
  }

  if (capOn) {
    const capEl = document.getElementById('dailycap-amount') as HTMLInputElement;
    check('dailycap-amount', validateDailyCap(capEl?.value ?? ''), 'Daily cap', capEl?.value ?? '');
  } else {
    clearFieldError('dailycap-amount');
  }

  return errorCount;
}

/**
 * Handle the Cancel button on the similarity warning: log and hide.
 */
function handleSimilarityCancel(): void {
  if (pendingNewName && pendingExistingName) {
    settingsLog(`Custom item validation: '${pendingNewName}' flagged as similar to '${pendingExistingName}' — user cancelled`);
  }
  hideSimilarityWarning();
}

/**
 * Add a custom comparison item
 */
async function addCustomItem(force = false): Promise<void> {
  const rawEmoji = (document.getElementById('new-item-emoji') as HTMLInputElement).value;
  const rawPrice = (document.getElementById('new-item-price') as HTMLInputElement).value;
  const name = (document.getElementById('new-item-name') as HTMLInputElement).value.trim();
  const price = parseFloat(rawPrice);
  const plural = (document.getElementById('new-item-plural') as HTMLInputElement).value.trim();
  const emoji = rawEmoji.trim() || '\u{1F381}';

  // Per-field validation before any async work
  let hasErrors = false;

  const emojiErr = validateItemEmoji(rawEmoji);
  if (emojiErr) { showItemFieldError('new-item-emoji', emojiErr); hasErrors = true; }
  else clearItemFieldError('new-item-emoji');

  const nameErr = validateItemName(name);
  if (nameErr) { showItemFieldError('item-name', nameErr); hasErrors = true; }

  const priceErr = validateItemPrice(rawPrice);
  if (priceErr) { showItemFieldError('new-item-price', priceErr); hasErrors = true; }
  else clearItemFieldError('new-item-price');

  if (!plural) {
    showStatus('Please fill in the plural label.', 'error');
    hasErrors = true;
  }

  if (hasErrors) {
    hideSimilarityWarning();
    return;
  }

  try {
    const settings = await loadSettings();

    // Exact duplicate check — always blocks regardless of force
    const duplicate = findDuplicate(name, settings.comparisonItems, editingItemId);
    if (duplicate) {
      showItemFieldError('item-name', `A comparison item named "${duplicate.name}" already exists.`);
      hideSimilarityWarning();
      settingsLog(`Custom item validation: '${name}' blocked — duplicate of '${duplicate.name}'`);
      return;
    }

    // Similarity check — skip when the user has already confirmed
    if (!force) {
      const similar = findSimilar(name, settings.comparisonItems, editingItemId);
      if (similar) {
        showSimilarityWarning(name, similar.name);
        return;
      }
    } else if (pendingExistingName) {
      settingsLog(`Custom item validation: '${name}' flagged as similar to '${pendingExistingName}' — user confirmed`);
    }

    hideSimilarityWarning();

    const newItem: ComparisonItem = {
      id: `custom-${Date.now()}`,
      emoji,
      name,
      price,
      pluralLabel: plural,
      enabled: true,
      isPreset: false,
    };

    if (editingItemId) {
      const idx = settings.comparisonItems.findIndex(i => i.id === editingItemId);
      if (idx !== -1) {
        settings.comparisonItems[idx] = { ...settings.comparisonItems[idx], emoji, name, price, pluralLabel: plural };
      }
    } else {
      settings.comparisonItems.push(newItem);
    }
    await saveSettings(settings);
    cachedSettings = settings;
    renderCustomItems(settings.comparisonItems);
    updateSoftNudgeStepsCount();
    hideAddForm();
    showStatus(editingItemId ? 'Item updated!' : 'Custom item added!', 'success');
    settingsLog('Custom comparison item saved:', { name, price, plural });
  } catch (error) {
    showStatus(`Error saving item: ${error}`, 'error');
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
    cachedSettings = settings;
    renderCustomItems(settings.comparisonItems);
    updateSoftNudgeStepsCount();
    showStatus('Item removed.', 'success');
    settingsLog('Custom comparison item deleted:', itemId);
  } catch (error) {
    showStatus(`Error removing item: ${error}`, 'error');
  }
}

// ── Channel Whitelist ────────────────────────────────────────────────────

/**
 * Normalize a user-supplied channel string to a bare lowercase username.
 * Accepts: "ktulue", "twitch.tv/ktulue", full URLs, with/without protocol.
 */
function normalizeUsername(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/^twitch\.tv\//, '')
    .replace(/\/.*$/, '');
}

/**
 * Render the list of whitelisted channels inside #whitelist-items
 */
function renderWhitelistItems(items: WhitelistEntry[]): void {
  const container = document.getElementById('whitelist-items');
  const noItemsMsg = document.getElementById('no-whitelist-items');
  if (!container) return;

  container.querySelectorAll('.whitelist-item-row').forEach(el => el.remove());
  if (noItemsMsg) noItemsMsg.style.display = items.length === 0 ? 'block' : 'none';

  for (const entry of items) {
    const row = document.createElement('div');
    row.className = 'whitelist-item-row';
    row.dataset.username = entry.username;
    row.innerHTML = `
      <span class="whitelist-channel-name">twitch.tv/${entry.username}</span>
      <select class="whitelist-behavior-select" data-username="${entry.username}">
        <option value="skip" ${entry.behavior === 'skip' ? 'selected' : ''}>Skip</option>
        <option value="reduced" ${entry.behavior === 'reduced' ? 'selected' : ''}>Reduced</option>
        <option value="track-only" ${entry.behavior === 'track-only' ? 'selected' : ''}>Track Only</option>
      </select>
      <button class="btn-icon danger" data-remove-username="${entry.username}" title="Remove">&#10005;</button>
    `;
    container.appendChild(row);
  }
}

/**
 * Add a channel to the whitelist from the text input
 */
async function addWhitelistChannel(): Promise<void> {
  const input = document.getElementById('whitelist-username-input') as HTMLInputElement | null;
  if (!input) return;
  const username = normalizeUsername(input.value);
  const fmtError = validateWhitelistUsername(username);
  if (fmtError) {
    showWhitelistError(fmtError);
    return;
  }
  clearWhitelistError();
  const settings = await loadSettings();
  if (settings.whitelistedChannels.find(e => e.username === username)) {
    showWhitelistError(`${username} is already whitelisted.`);
    return;
  }
  const entry: WhitelistEntry = { username, behavior: 'reduced' };
  settings.whitelistedChannels.push(entry);
  await saveSettings(settings);
  cachedSettings = settings;
  renderWhitelistItems(settings.whitelistedChannels);
  input.value = '';
  showStatus(`Added ${username} to whitelist.`, 'success');
  settingsLog(`Channel added to whitelist: ${username} (reduced)`);
}

/**
 * Remove a channel from the whitelist
 */
async function removeWhitelistChannel(username: string): Promise<void> {
  const settings = await loadSettings();
  settings.whitelistedChannels = settings.whitelistedChannels.filter(e => e.username !== username);
  await saveSettings(settings);
  cachedSettings = settings;
  renderWhitelistItems(settings.whitelistedChannels);
  showStatus(`Removed ${username} from whitelist.`, 'success');
  settingsLog(`Channel removed from whitelist: ${username}`);
}

/**
 * Update the behavior for a whitelisted channel (saved immediately)
 */
async function changeWhitelistBehavior(username: string, behavior: WhitelistBehavior): Promise<void> {
  const settings = await loadSettings();
  const entry = settings.whitelistedChannels.find(e => e.username === username);
  if (!entry) return;
  const oldBehavior = entry.behavior;
  entry.behavior = behavior;
  await saveSettings(settings);
  cachedSettings = settings;
  settingsLog(`Whitelist behavior changed for ${username}: ${oldBehavior} \u2192 ${behavior}`);
}

/**
 * Populate form fields with current settings
 */
async function populateForm(): Promise<void> {
  const settings = await loadSettings();
  cachedSettings = settings;

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
  const thresholdFloor = document.getElementById('threshold-floor') as HTMLInputElement;
  const thresholdCeiling = document.getElementById('threshold-ceiling') as HTMLInputElement;
  const softNudgeSteps = document.getElementById('soft-nudge-steps') as HTMLInputElement;
  if (thresholdsEnabled) thresholdsEnabled.checked = settings.frictionThresholds.enabled;
  if (thresholdFloor) thresholdFloor.value = settings.frictionThresholds.thresholdFloor.toString();
  if (thresholdCeiling) thresholdCeiling.value = settings.frictionThresholds.thresholdCeiling.toString();
  if (softNudgeSteps) softNudgeSteps.value = settings.frictionThresholds.softNudgeSteps.toString();
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

  // Streaming mode
  const streamingEnabled = document.getElementById('streaming-enabled') as HTMLInputElement;
  const streamingUsername = document.getElementById('streaming-username') as HTMLInputElement;
  const streamingGrace = document.getElementById('streaming-grace') as HTMLInputElement;
  const streamingLogBypassed = document.getElementById('streaming-log-bypassed') as HTMLInputElement;
  if (streamingEnabled) streamingEnabled.checked = settings.streamingMode.enabled;
  if (streamingUsername) streamingUsername.value = settings.streamingMode.twitchUsername;
  if (streamingGrace) streamingGrace.value = settings.streamingMode.gracePeriodMinutes.toString();
  if (streamingLogBypassed) streamingLogBypassed.checked = settings.streamingMode.logBypassed;
  toggleSubsection('streaming-config', settings.streamingMode.enabled);

  // Display preferences
  const toastDuration = document.getElementById('toast-duration') as HTMLInputElement;
  if (toastDuration) toastDuration.value = settings.toastDurationSeconds.toString();

  // Whitelist
  renderWhitelistItems(settings.whitelistedChannels);

  // Apply threshold floor link state and comparison item counts after all fields are set
  updateThresholdFloorLinkState();
  updateSoftNudgeStepsCount();
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
      // When the daily cap is enabled, threshold-floor is linked/disabled — preserve the stored custom value.
      thresholdFloor: (document.getElementById('dailycap-enabled') as HTMLInputElement)?.checked
        ? (cachedSettings?.frictionThresholds.thresholdFloor ?? DEFAULT_SETTINGS.frictionThresholds.thresholdFloor)
        : parseFloat((document.getElementById('threshold-floor') as HTMLInputElement)?.value) || 5,
      thresholdCeiling: parseFloat((document.getElementById('threshold-ceiling') as HTMLInputElement)?.value) || 25,
      softNudgeSteps: Math.max(1, parseInt((document.getElementById('soft-nudge-steps') as HTMLInputElement)?.value) || 1),
    },
    streamingMode: {
      enabled: (document.getElementById('streaming-enabled') as HTMLInputElement)?.checked ?? true,
      twitchUsername: (document.getElementById('streaming-username') as HTMLInputElement)?.value.trim() ?? '',
      gracePeriodMinutes: parseInt((document.getElementById('streaming-grace') as HTMLInputElement)?.value) || 15,
      logBypassed: (document.getElementById('streaming-log-bypassed') as HTMLInputElement)?.checked ?? true,
    },
    toastDurationSeconds: Math.min(30, Math.max(1, parseInt((document.getElementById('toast-duration') as HTMLInputElement)?.value) || DEFAULT_SETTINGS.toastDurationSeconds)),
    // Whitelist is managed independently (add/remove/behavior-change saves immediately)
    whitelistedChannels: cachedSettings?.whitelistedChannels ?? [],
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
  const errorCount = validateAllFields(true);
  if (errorCount > 0) {
    settingsLog(`Settings save blocked — ${errorCount} validation error${errorCount === 1 ? '' : 's'}`);
    showStatus(`Fix ${errorCount} validation error${errorCount === 1 ? '' : 's'} before saving.`, 'error');
    return;
  }
  try {
    const settings = await getFormSettings();
    await saveSettings(settings);
    settingsLog('Validation passed — settings saved successfully');
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
    // Reset values are all valid defaults — clear any stale validation state
    invalidFields.clear();
    const saveBtn = document.getElementById('btn-save') as HTMLButtonElement | null;
    if (saveBtn) saveBtn.disabled = false;
    settingsLog('Settings reset to defaults', DEFAULT_SETTINGS);
    showStatus('Settings reset to defaults', 'success');
  } catch (error) {
    showStatus(`Error resetting settings: ${error}`, 'error');
  }
}

/**
 * Show tracker-specific status message that auto-fades
 */
function showTrackerStatus(message: string, type: 'success' | 'error'): void {
  const statusEl = document.getElementById('tracker-status');
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  setTimeout(() => {
    statusEl.className = 'status';
  }, 2500);
}

/**
 * Reset the spending tracker stored in local storage
 */
async function handleResetTracker(): Promise<void> {
  await chrome.storage.local.remove('mtsSpending');
  showTrackerStatus('✅ Spending tracker reset', 'success');
  const dataEl = document.getElementById('tracker-data') as HTMLPreElement;
  if (dataEl) dataEl.style.display = 'none';
}

/**
 * Display the raw mtsSpending JSON for debugging
 */
async function handleViewTracker(): Promise<void> {
  const result = await chrome.storage.local.get('mtsSpending');
  const dataEl = document.getElementById('tracker-data') as HTMLPreElement;
  if (!dataEl) return;
  if (dataEl.style.display === 'block') {
    dataEl.style.display = 'none';
    return;
  }
  dataEl.textContent = JSON.stringify(result['mtsSpending'] ?? null, null, 2);
  dataEl.style.display = 'block';
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
  document.getElementById('btn-reset-tracker')?.addEventListener('click', handleResetTracker);
  document.getElementById('btn-view-tracker')?.addEventListener('click', handleViewTracker);

  // Toggle subsection visibility
  document.getElementById('thresholds-enabled')?.addEventListener('change', (e) => {
    const on = (e.target as HTMLInputElement).checked;
    toggleSubsection('thresholds-config', on);
    // Re-apply link state since toggleSubsection re-enables all inputs in the section
    updateThresholdFloorLinkState();
    if (!on) { clearFieldError('threshold-floor'); clearFieldError('threshold-ceiling'); }
  });
  document.getElementById('cooldown-enabled')?.addEventListener('change', (e) => {
    toggleSubsection('cooldown-config', (e.target as HTMLInputElement).checked);
  });
  document.getElementById('dailycap-enabled')?.addEventListener('change', (e) => {
    const on = (e.target as HTMLInputElement).checked;
    toggleSubsection('dailycap-config', on);
    updateThresholdFloorLinkState();
    if (!on) clearFieldError('dailycap-amount');
  });
  document.getElementById('dailycap-amount')?.addEventListener('input', () => {
    if ((document.getElementById('dailycap-enabled') as HTMLInputElement)?.checked) {
      updateThresholdFloorLinkState();
    }
  });
  document.getElementById('streaming-enabled')?.addEventListener('change', (e) => {
    toggleSubsection('streaming-config', (e.target as HTMLInputElement).checked);
  });

  // ── Main form: blur validation + numeric stripping ───────────────────
  const numericFields = ['hourly-rate', 'tax-rate', 'threshold-floor', 'threshold-ceiling', 'dailycap-amount'];
  numericFields.forEach(id => {
    document.getElementById(id)?.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      const stripped = el.value.replace(/[^\d.]/g, '');
      if (stripped !== el.value) el.value = stripped;
    });
  });

  document.getElementById('hourly-rate')?.addEventListener('blur', () => {
    const el = document.getElementById('hourly-rate') as HTMLInputElement;
    const err = validateHourlyRate(el.value);
    if (err) showFieldError('hourly-rate', err); else clearFieldError('hourly-rate');
  });
  document.getElementById('tax-rate')?.addEventListener('blur', () => {
    const el = document.getElementById('tax-rate') as HTMLInputElement;
    const err = validateTaxRate(el.value);
    if (err) showFieldError('tax-rate', err); else clearFieldError('tax-rate');
  });
  document.getElementById('threshold-floor')?.addEventListener('blur', revalidateThresholds);
  document.getElementById('threshold-ceiling')?.addEventListener('blur', revalidateThresholds);
  document.getElementById('dailycap-amount')?.addEventListener('blur', () => {
    if (!(document.getElementById('dailycap-enabled') as HTMLInputElement)?.checked) return;
    const el = document.getElementById('dailycap-amount') as HTMLInputElement;
    const err = validateDailyCap(el.value);
    if (err) showFieldError('dailycap-amount', err); else clearFieldError('dailycap-amount');
  });

  // Clear field errors on input (after blur has shown them)
  document.getElementById('hourly-rate')?.addEventListener('input', () => clearFieldError('hourly-rate'));
  document.getElementById('tax-rate')?.addEventListener('input', () => clearFieldError('tax-rate'));
  document.getElementById('dailycap-amount')?.addEventListener('input', () => clearFieldError('dailycap-amount'));

  // Update soft nudge step count whenever any comparison item toggle changes
  document.querySelector('.container')?.addEventListener('change', (e) => {
    if ((e.target as HTMLElement).matches('input[data-item-id]')) {
      updateSoftNudgeStepsCount();
    }
  });

  // Custom item form
  document.getElementById('btn-add-item')?.addEventListener('click', showAddForm);
  document.getElementById('btn-cancel-item')?.addEventListener('click', hideAddForm);
  document.getElementById('btn-save-item')?.addEventListener('click', () => addCustomItem(false));
  document.getElementById('btn-similarity-confirm')?.addEventListener('click', () => addCustomItem(true));
  document.getElementById('btn-similarity-cancel')?.addEventListener('click', handleSimilarityCancel);
  document.getElementById('new-item-name')?.addEventListener('input', () => clearItemFieldError('item-name'));
  document.getElementById('new-item-price')?.addEventListener('input', () => clearItemFieldError('new-item-price'));
  document.getElementById('new-item-emoji')?.addEventListener('input', () => clearItemFieldError('new-item-emoji'));

  // Delegated click handler for custom item edit/delete buttons
  document.getElementById('custom-items-list')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const editBtn = target.closest('[data-edit-id]');
    if (editBtn) {
      const editId = editBtn.getAttribute('data-edit-id');
      const item = cachedSettings?.comparisonItems.find(i => i.id === editId);
      if (item) showEditForm(item);
      return;
    }
    const deleteBtn = target.closest('[data-delete-id]');
    if (deleteBtn) {
      const deleteId = deleteBtn.getAttribute('data-delete-id');
      if (deleteId) deleteCustomItem(deleteId);
    }
  });

  // Channel whitelist
  document.getElementById('btn-add-whitelist')?.addEventListener('click', addWhitelistChannel);
  document.getElementById('whitelist-username-input')?.addEventListener('input', clearWhitelistError);
  document.getElementById('whitelist-username-input')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') addWhitelistChannel();
  });
  document.getElementById('whitelist-items')?.addEventListener('click', (e) => {
    const removeBtn = (e.target as HTMLElement).closest('[data-remove-username]');
    if (removeBtn) {
      const username = removeBtn.getAttribute('data-remove-username');
      if (username) removeWhitelistChannel(username);
    }
  });
  document.getElementById('whitelist-items')?.addEventListener('change', (e) => {
    const target = e.target as HTMLElement;
    if (target.matches('.whitelist-behavior-select')) {
      const username = target.getAttribute('data-username');
      const behavior = (target as HTMLSelectElement).value as WhitelistBehavior;
      if (username) changeWhitelistBehavior(username, behavior);
    }
  });
});
