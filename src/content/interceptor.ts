/**
 * Interceptor module - blocks purchase clicks and shows confirmation overlay
 * After the main overlay, each enabled comparison item becomes a separate
 * friction step that must be clicked through sequentially.
 */

import {
  PurchaseAttempt, OverlayDecision, OverlayCallback, UserSettings, DEFAULT_SETTINGS,
  FrictionLevel, SpendingTracker, DEFAULT_SPENDING_TRACKER, ComparisonItem, migrateSettings,
  WhitelistEntry,
} from '../shared/types';
import { isPurchaseButton, createPurchaseAttempt } from './detector';
import { shouldBypassFriction } from './streamingMode';
import { log, debug } from '../shared/logger';

/** Storage keys */
const SETTINGS_KEY = 'mtsSettings';
const SPENDING_KEY = 'mtsSpending';

// ── Settings & Tracker ──────────────────────────────────────────────────

async function loadSettings(): Promise<UserSettings> {
  try {
    const result = await chrome.storage.sync.get(SETTINGS_KEY);
    return migrateSettings(result[SETTINGS_KEY] || {});
  } catch (e) {
    debug('Failed to load settings, using defaults:', e);
    return { ...DEFAULT_SETTINGS };
  }
}

async function loadSpendingTracker(): Promise<SpendingTracker> {
  try {
    const result = await chrome.storage.local.get(SPENDING_KEY);
    const tracker: SpendingTracker = result[SPENDING_KEY] || { ...DEFAULT_SPENDING_TRACKER };
    const today = new Date().toISOString().split('T')[0];
    if (tracker.dailyDate !== today) {
      tracker.dailyTotal = 0;
      tracker.dailyDate = today;
    }
    return tracker;
  } catch (e) {
    debug('Failed to load spending tracker:', e);
    return { ...DEFAULT_SPENDING_TRACKER };
  }
}

async function saveSpendingTracker(tracker: SpendingTracker): Promise<void> {
  try {
    await chrome.storage.local.set({ [SPENDING_KEY]: tracker });
  } catch (e) {
    debug('Failed to save spending tracker:', e);
  }
}

async function recordPurchase(priceValue: number | null, settings: UserSettings, tracker: SpendingTracker): Promise<void> {
  if (priceValue && priceValue > 0) {
    const priceWithTax = Math.round(priceValue * (1 + settings.taxRate / 100) * 100) / 100;
    const before = tracker.dailyTotal;
    tracker.dailyTotal = Math.round((tracker.dailyTotal + priceWithTax) * 100) / 100;
    tracker.sessionTotal = Math.round((tracker.sessionTotal + priceWithTax) * 100) / 100;
    tracker.dailyDate = new Date().toISOString().split('T')[0];
    log(`recordPurchase: +$${priceWithTax.toFixed(2)} (raw=$${priceValue.toFixed(2)}, tax=${settings.taxRate}%) — daily $${before.toFixed(2)} → $${tracker.dailyTotal.toFixed(2)}`);
  }
  tracker.lastProceedTimestamp = Date.now();
  await saveSpendingTracker(tracker);
}

// ── Cooldown & Friction Level ───────────────────────────────────────────

function checkCooldown(settings: UserSettings, tracker: SpendingTracker): { active: boolean; remainingMs: number } {
  if (!settings.cooldown.enabled || !tracker.lastProceedTimestamp) {
    return { active: false, remainingMs: 0 };
  }
  const cooldownMs = settings.cooldown.minutes * 60 * 1000;
  const remaining = cooldownMs - (Date.now() - tracker.lastProceedTimestamp);
  return { active: remaining > 0, remainingMs: Math.max(0, remaining) };
}

// ── Whitelist ────────────────────────────────────────────────────────────

function checkWhitelist(channel: string, settings: UserSettings): WhitelistEntry | null {
  if (!settings.whitelistedChannels || settings.whitelistedChannels.length === 0) return null;
  const normalized = channel.trim().toLowerCase();
  return settings.whitelistedChannels.find(e => e.username === normalized) ?? null;
}

function showWhitelistReducedToast(channel: string, priceDisplay: string, durationMs: number): void {
  document.getElementById('mts-whitelist-toast')?.remove();
  const toast = document.createElement('div');
  toast.id = 'mts-whitelist-toast';
  toast.className = 'mts-whitelist-toast';
  toast.textContent = `\u2705 Logged! ${priceDisplay} on ${channel} (whitelisted)`;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('mts-whitelist-toast--fade');
    setTimeout(() => toast.remove(), 300);
  }, durationMs);
}

function determineFrictionLevel(
  priceValue: number | null,
  settings: UserSettings,
  tracker: SpendingTracker,
): FrictionLevel {
  // Daily cap check FIRST — acts as a bypass floor (pre-approved spending allowance).
  // Only applies when price is known; unknown price falls through to full friction.
  if (settings.dailyCap.enabled && priceValue !== null && priceValue > 0) {
    const priceWithTax = Math.round(priceValue * (1 + settings.taxRate / 100) * 100) / 100;
    const newTotal = Math.round((tracker.dailyTotal + priceWithTax) * 100) / 100;
    if (newTotal >= settings.dailyCap.amount) {
      log(`Daily cap check: $${priceWithTax.toFixed(2)} would bring daily total to $${newTotal.toFixed(2)}, meeting/exceeding $${settings.dailyCap.amount.toFixed(2)} cap — full modal triggered`);
      return 'full';
    }
    log(`Daily cap bypass: $${priceWithTax.toFixed(2)} keeps daily total at $${newTotal.toFixed(2)}, under $${settings.dailyCap.amount.toFixed(2)} cap — bypassing friction`);
    return 'cap-bypass';
  }

  if (!settings.frictionThresholds.enabled) {
    log('Thresholds disabled — defaulting to full modal');
    return 'full';
  }
  if (priceValue === null || priceValue <= 0) return 'full';

  const priceWithTax = Math.round(priceValue * (1 + settings.taxRate / 100) * 100) / 100;
  const t1 = settings.frictionThresholds.thresholdFloor;
  const t2 = settings.frictionThresholds.thresholdCeiling;
  const price = `$${priceWithTax.toFixed(2)}`;

  if (priceWithTax < t1) {
    log(`Threshold check: ${price} is BELOW $${t1.toFixed(2)} floor — no friction applied`);
    return 'none';
  }
  if (priceWithTax < t2) {
    log(`Threshold check: ${price} is BETWEEN $${t1.toFixed(2)} floor and $${t2.toFixed(2)} ceiling — soft nudge triggered`);
    return 'nudge';
  }
  log(`Threshold check: ${price} is ABOVE $${t2.toFixed(2)} ceiling — full friction triggered`);
  return 'full';
}

// ── Formatting Helpers ──────────────────────────────────────────────────

function formatWorkTime(hours: number): string {
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  return `${hours.toFixed(1)} hour${hours !== 1 ? 's' : ''}`;
}

function formatPurchaseType(type: string): string {
  return type || 'Purchase';
}

/** Display data for a single comparison step */
interface ComparisonDisplay {
  amountText: string;  // big top display  e.g. "~35", "~½", "~12%"
  labelText: string;   // label below amount  e.g. "Costco glizzies", "Bob Ross Paint Set"
  sentence: string;    // full contextual sentence (no trailing period)
}

/**
 * Format a comparison display based on the ratio of purchaseAmount to item.price.
 *
 * Tiers:
 *   ratio >= 2          → "~N [plural]"           (rounded to nearest whole number)
 *   1.1 <= ratio < 2    → "~N.N [plural]"          (1 decimal place)
 *   1.0 <= ratio < 1.1  → "~1 [singular name]"
 *   0.5 <= ratio < 1.0  → "about half a [name]"
 *   0.25 <= ratio < 0.5 → "about a quarter of a [name]"
 *   ratio < 0.25        → "~N% of a [name]"
 */
function formatComparisonDisplay(item: ComparisonItem, purchaseAmount: number, taxPrice: string): ComparisonDisplay {
  if (item.price <= 0) {
    return { amountText: '~0', labelText: item.pluralLabel, sentence: `That ${taxPrice} can't buy any ${item.pluralLabel}` };
  }

  const ratio = purchaseAmount / item.price;

  if (ratio >= 2) {
    const count = Math.round(ratio);
    return {
      amountText: `~${count}`,
      labelText: item.pluralLabel,
      sentence: `That ${taxPrice} is worth ~${count} ${item.pluralLabel}`,
    };
  }

  if (ratio >= 1.1) {
    const count = (Math.round(ratio * 10) / 10).toFixed(1);
    return {
      amountText: `~${count}`,
      labelText: item.pluralLabel,
      sentence: `That ${taxPrice} is worth ~${count} ${item.pluralLabel}`,
    };
  }

  if (ratio >= 1.0) {
    return {
      amountText: '~1',
      labelText: item.name,
      sentence: `That ${taxPrice} is worth ~1 ${item.name}`,
    };
  }

  if (ratio >= 0.5) {
    return {
      amountText: '~\u00BD', // ½ (one-half)
      labelText: item.name,
      sentence: `That ${taxPrice} is only about half a ${item.name}`,
    };
  }

  if (ratio >= 0.25) {
    return {
      amountText: '~\u00BC', // ¼ (one-quarter)
      labelText: item.name,
      sentence: `That ${taxPrice} is only about a quarter of a ${item.name}`,
    };
  }

  const percent = Math.round(ratio * 100);
  return {
    amountText: `~${percent}%`,
    labelText: `of a ${item.name}`,
    sentence: `That ${taxPrice} is only ~${percent}% of a ${item.name}`,
  };
}

/**
 * Build the cost breakdown HTML (without comparison lines — those are separate steps now)
 */
function buildCostBreakdown(priceValue: number, settings: UserSettings, tracker: SpendingTracker): string {
  const priceWithTax = Math.round(priceValue * (1 + settings.taxRate / 100) * 100) / 100;
  const hoursOfWork = priceWithTax / settings.hourlyRate;

  let dailyInfo = '';
  if (settings.dailyCap.enabled) {
    const newTotal = Math.round((tracker.dailyTotal + priceWithTax) * 100) / 100;
    const percentage = Math.round((newTotal / settings.dailyCap.amount) * 100);
    const overBudget = newTotal > settings.dailyCap.amount;
    const dailyClass = overBudget ? 'mts-daily-over' : (percentage >= 80 ? 'mts-daily-warning' : '');
    dailyInfo = `
      <p class="mts-daily-tracker ${dailyClass}">
        Daily: $${tracker.dailyTotal.toFixed(2)} / $${settings.dailyCap.amount.toFixed(2)}
        ${overBudget ? ' \u2014 OVER BUDGET' : ` (${percentage}%)`}
      </p>
    `;
  }

  let sessionInfo = '';
  if (tracker.sessionTotal > 0) {
    sessionInfo = `<p class="mts-session-tracker">Session total: $${tracker.sessionTotal.toFixed(2)}</p>`;
  }

  return `
    <div class="mts-cost-breakdown">
      <p class="mts-cost-line">
        <span class="mts-cost-label">With ${settings.taxRate}% tax:</span>
        <span class="mts-cost-value">$${priceWithTax.toFixed(2)}</span>
      </p>
      <p class="mts-cost-line mts-cost-hours">
        That's <strong>${formatWorkTime(hoursOfWork)}</strong> of work
      </p>
      ${dailyInfo}
      ${sessionInfo}
    </div>
  `;
}

// ── Overlay State ───────────────────────────────────────────────────────

let overlayVisible = false;

let pendingPurchase: {
  attempt: PurchaseAttempt;
  originalEvent: MouseEvent;
} | null = null;

function removeOverlay(overlay: HTMLElement): void {
  overlay.remove();
  overlayVisible = false;
}

// ── Overlay: Helpers ────────────────────────────────────────────────────

/** Context passed to showModalPromise for dismissal logging */
interface ModalContext {
  type: string;
  rawPrice: string | null;
}

/**
 * Generic helper — show a modal and return a promise that resolves with the decision.
 * Handles backdrop click, Escape key, and button clicks.
 * Logs each dismissal method distinctly when context is provided.
 */
function showModalPromise(overlay: HTMLElement, context?: ModalContext): Promise<OverlayDecision> {
  return new Promise((resolve) => {
    let resolved = false;
    const tag = context
      ? `(${context.type} - ${context.rawPrice || 'Price not detected'})`
      : '';

    const finish = (decision: OverlayDecision, method: string) => {
      if (resolved) return;
      resolved = true;
      if (context) {
        if (decision === 'proceed') {
          log(`User clicked Proceed Anyway ${tag}`);
        } else if (method === 'button') {
          log(`User clicked Cancel button ${tag}`);
        } else if (method === 'outside') {
          log(`User dismissed modal via outside click ${tag}`);
        } else if (method === 'escape') {
          log(`User dismissed modal via Escape key ${tag}`);
        }
      }
      removeOverlay(overlay);
      resolve(decision);
    };

    overlay.querySelector('[data-action="cancel"]')?.addEventListener('click', () => finish('cancel', 'button'));
    overlay.querySelector('[data-action="proceed"]')?.addEventListener('click', () => finish('proceed', 'button'));

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) finish('cancel', 'outside');
    });

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        finish('cancel', 'escape');
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    document.body.appendChild(overlay);
    (overlay.querySelector('[data-action="cancel"]') as HTMLButtonElement)?.focus();
  });
}

// ── Overlay: Main (Step 1) ──────────────────────────────────────────────

async function showMainOverlay(
  attempt: PurchaseAttempt,
  settings: UserSettings,
  tracker: SpendingTracker,
  whitelistNote?: string,
): Promise<OverlayDecision> {
  if (overlayVisible) return 'cancel';
  overlayVisible = true;

  const priceDisplay = attempt.rawPrice || 'Price not detected';

  let priceExtra = '';
  if (attempt.priceValue !== null && attempt.priceValue > 0) {
    priceExtra = buildCostBreakdown(attempt.priceValue, settings, tracker);
  } else {
    priceExtra = '<p class="mts-price-note">Unable to detect price. Proceed with caution.</p>';
  }

  const overlay = document.createElement('div');
  overlay.id = 'mts-overlay';
  overlay.className = 'mts-overlay';
  overlay.innerHTML = `
    <div class="mts-modal">
      <div class="mts-header">
        <span class="mts-icon">\u{1F6E1}\uFE0F</span>
        <h2 class="mts-title">Mindful Twitch Spending</h2>
      </div>
      <div class="mts-content">
        ${whitelistNote ? `<div class="mts-whitelist-note">${whitelistNote}</div>` : ''}
        <div class="mts-price-section">
          <p class="mts-label">You're about to spend:</p>
          <p class="mts-price">${priceDisplay}</p>
          ${priceExtra}
        </div>
        <div class="mts-info">
          <p class="mts-channel">Channel: <strong>${attempt.channel}</strong></p>
          <p class="mts-type">Type: <strong>${formatPurchaseType(attempt.type)}</strong></p>
        </div>
        <p class="mts-message">
          Take a moment to consider: Is this purchase intentional or impulsive?
        </p>
      </div>
      <div class="mts-actions">
        <button class="mts-btn mts-btn-cancel" data-action="cancel">Cancel</button>
        <button class="mts-btn mts-btn-proceed" data-action="proceed">Proceed Anyway</button>
      </div>
    </div>
  `;

  log('Step 1 — Main overlay shown:', {
    type: attempt.type,
    rawPrice: attempt.rawPrice,
    priceValue: attempt.priceValue,
    channel: attempt.channel,
  });

  return showModalPromise(overlay, { type: attempt.type, rawPrice: attempt.rawPrice });
}

// ── Overlay: Comparison Step ────────────────────────────────────────────

async function showComparisonStep(
  item: ComparisonItem,
  display: ComparisonDisplay,
  stepNumber: number,
  totalSteps: number,
  attempt: PurchaseAttempt,
): Promise<OverlayDecision> {
  if (overlayVisible) return 'cancel';
  overlayVisible = true;

  const overlay = document.createElement('div');
  overlay.id = 'mts-overlay';
  overlay.className = 'mts-overlay';
  overlay.innerHTML = `
    <div class="mts-modal">
      <div class="mts-header">
        <span class="mts-icon">${item.emoji}</span>
        <h2 class="mts-title">STEP ${stepNumber} OF ${totalSteps}</h2>
      </div>
      <div class="mts-content">
        <div class="mts-comparison-step">
          <p class="mts-comparison-amount">${display.amountText}</p>
          <p class="mts-comparison-label">${display.labelText}</p>
        </div>
        <p class="mts-message">
          <strong>${display.sentence}</strong>. Still want to proceed?
        </p>
      </div>
      <div class="mts-actions">
        <button class="mts-btn mts-btn-cancel" data-action="cancel">Cancel</button>
        <button class="mts-btn mts-btn-proceed" data-action="proceed">Proceed Anyway</button>
      </div>
    </div>
  `;

  log(`Step ${stepNumber} — Comparison: ${item.name}`, {
    emoji: item.emoji,
    amountText: display.amountText,
    labelText: display.labelText,
    channel: attempt.channel,
    rawPrice: attempt.rawPrice,
  });

  return showModalPromise(overlay, { type: attempt.type, rawPrice: attempt.rawPrice });
}

// ── Overlay: Cooldown Block ─────────────────────────────────────────────

function showCooldownBlock(remainingMs: number): void {
  if (overlayVisible) return;
  overlayVisible = true;

  const minutes = Math.ceil(remainingMs / 60000);

  const overlay = document.createElement('div');
  overlay.id = 'mts-overlay';
  overlay.className = 'mts-overlay';
  overlay.innerHTML = `
    <div class="mts-modal mts-cooldown-modal">
      <div class="mts-header" style="background: linear-gradient(135deg, #eb0400, #c00);">
        <span class="mts-icon">\u231B</span>
        <h2 class="mts-title">COOLDOWN ACTIVE</h2>
      </div>
      <div class="mts-content" style="text-align: center;">
        <p class="mts-label">You recently made a purchase.</p>
        <p class="mts-price" style="font-size: 24px;">${minutes} minute${minutes !== 1 ? 's' : ''} remaining</p>
        <p class="mts-message">Take a breather. This cooldown helps you avoid impulse spending.</p>
      </div>
      <div class="mts-actions">
        <button class="mts-btn mts-btn-cancel" data-action="cancel" style="flex: 1;">OK, I'll Wait</button>
      </div>
    </div>
  `;

  overlay.querySelector('[data-action="cancel"]')?.addEventListener('click', () => removeOverlay(overlay));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) removeOverlay(overlay); });

  document.body.appendChild(overlay);
  (overlay.querySelector('[data-action="cancel"]') as HTMLButtonElement)?.focus();
}

// ── Multi-Step Friction Flow ────────────────────────────────────────────

/**
 * Runs the friction flow:
 *   Step 1: Main overlay (cost breakdown, channel, type)
 *   Step 2+: One modal per comparison item (limited by maxComparisons)
 *
 * @param maxComparisons — max comparison steps to show (undefined = all enabled items)
 *   Soft nudge passes 1, full friction passes undefined.
 *
 * Returns 'proceed' only if user clicks through ALL steps.
 * Returns 'cancel' if they bail at any step.
 */
async function runFrictionFlow(
  attempt: PurchaseAttempt,
  settings: UserSettings,
  tracker: SpendingTracker,
  maxComparisons?: number,
  whitelistNote?: string,
): Promise<OverlayDecision> {
  // Step 1: Main overlay
  const mainDecision = await showMainOverlay(attempt, settings, tracker, whitelistNote);
  if (mainDecision === 'cancel') {
    log('Friction flow: cancelled at Step 1 (main overlay)');
    return 'cancel';
  }

  // Build comparison steps — only when price is detected
  const priceWithTax = (attempt.priceValue && attempt.priceValue > 0)
    ? Math.round(attempt.priceValue * (1 + settings.taxRate / 100) * 100) / 100
    : null;

  if (priceWithTax === null) {
    log('Friction flow: no price detected, skipping comparison steps');
    return 'proceed';
  }

  // nudge: enabled items only, limited to softNudgeSteps
  // full: ALL items regardless of enabled state (maximum penalty — cannot be reduced by disabling items)
  const itemPool = maxComparisons !== undefined
    ? settings.comparisonItems.filter(i => i.enabled).slice(0, maxComparisons)
    : settings.comparisonItems;

  const taxPrice = `$${priceWithTax.toFixed(2)}`;
  const comparisonSteps: { item: ComparisonItem; display: ComparisonDisplay }[] = [];

  for (const item of itemPool) {
    const display = formatComparisonDisplay(item, priceWithTax, taxPrice);
    comparisonSteps.push({ item, display });
  }

  // Total steps = 1 (main) + N (comparisons)
  const totalSteps = 1 + comparisonSteps.length;

  log(`Friction flow: ${comparisonSteps.length} comparison step(s) (${maxComparisons !== undefined ? 'nudge/enabled only' : 'full/all items'}), priceWithTax=${taxPrice}`);

  // Steps 2+: Each comparison item
  for (let i = 0; i < comparisonSteps.length; i++) {
    const { item, display } = comparisonSteps[i];
    const stepNumber = i + 2; // Step 1 was the main overlay

    const decision = await showComparisonStep(item, display, stepNumber, totalSteps, attempt);
    if (decision === 'cancel') {
      log(`Friction flow: cancelled at Step ${stepNumber} (${item.name})`, {
        stepsCompleted: stepNumber - 1,
        totalSteps,
      });
      return 'cancel';
    }
  }

  log('Friction flow: completed all steps', {
    totalSteps,
    channel: attempt.channel,
    rawPrice: attempt.rawPrice,
  });

  return 'proceed';
}

// ── Streaming Mode Toast ────────────────────────────────────────────────

function showStreamingModeToast(channel: string, durationMs: number): void {
  document.getElementById('mts-streaming-toast')?.remove();

  const toast = document.createElement('div');
  toast.id = 'mts-streaming-toast';
  toast.className = 'mts-streaming-toast';
  toast.textContent = `🔴 LIVE — Streaming mode active on ${channel}`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('mts-streaming-toast--fade');
    setTimeout(() => toast.remove(), 300);
  }, durationMs);
}

function showDailyBudgetToast(remaining: number, capAmount: number, durationMs: number): void {
  document.getElementById('mts-budget-toast')?.remove();

  const toast = document.createElement('div');
  toast.id = 'mts-budget-toast';
  toast.className = 'mts-budget-toast';
  toast.textContent = `✅ $${remaining.toFixed(2)} remaining of $${capAmount.toFixed(2)} daily budget`;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('mts-budget-toast--fade');
    setTimeout(() => toast.remove(), 300);
  }, durationMs);
}

// ── Click Handling ──────────────────────────────────────────────────────

async function handleClick(event: MouseEvent): Promise<void> {
  const target = event.target as HTMLElement;
  const button = target.closest('button') || target;

  if (button.tagName === 'BUTTON' || target.tagName === 'BUTTON') {
    debug('Button clicked:', {
      tagName: button.tagName,
      text: button.textContent?.trim().substring(0, 50),
      ariaLabel: button.getAttribute('aria-label'),
      dataTarget: button.getAttribute('data-a-target'),
      className: button.className,
    });
  }

  if (!isPurchaseButton(button as HTMLElement)) {
    return;
  }

  // Always block synchronously — we'll replay if friction is 'none'
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const actualButton = (button.closest('button') || button) as HTMLElement;

  log('Purchase attempt intercepted:', {
    clickedElement: target.tagName,
    actualButton: actualButton.tagName,
    buttonText: actualButton.textContent?.trim().substring(0, 50),
  });

  const attempt = createPurchaseAttempt(actualButton);
  attempt.element = actualButton;

  const settings = await loadSettings();

  // Streaming mode bypass check
  const streamingBypass = await shouldBypassFriction(settings);
  if (streamingBypass) {
    if (settings.streamingMode.logBypassed) {
      log('Streaming mode bypass:', { type: attempt.type, rawPrice: attempt.rawPrice, wasStreamingMode: true });
    }
    showStreamingModeToast(attempt.channel, settings.toastDurationSeconds * 1000);
    allowNextClick(actualButton);
    return;
  }

  const tracker = await loadSpendingTracker();

  // Update session channel
  if (tracker.sessionChannel !== attempt.channel) {
    tracker.sessionTotal = 0;
    tracker.sessionChannel = attempt.channel;
  }

  // Whitelist check
  const whitelistEntry = checkWhitelist(attempt.channel, settings);
  if (whitelistEntry) {
    log(`Whitelisted channel detected: ${attempt.channel} (behavior: ${whitelistEntry.behavior})`);

    if (whitelistEntry.behavior === 'skip') {
      log(`Purchase on whitelisted channel — silently logged (${attempt.rawPrice ?? 'price unknown'})`);
      await recordPurchase(attempt.priceValue, settings, tracker);
      allowNextClick(actualButton);
      return;
    }

    if (whitelistEntry.behavior === 'reduced') {
      const priceDisplay = attempt.rawPrice || 'purchase';
      log(`Purchase on whitelisted channel — toast displayed (${priceDisplay})`);
      await recordPurchase(attempt.priceValue, settings, tracker);
      showWhitelistReducedToast(attempt.channel, priceDisplay, settings.toastDurationSeconds * 1000);
      allowNextClick(actualButton);
      return;
    }

    // track-only falls through to normal friction with a note in the overlay
    log(`Whitelist check — track-only on ${attempt.channel}, applying full friction with whitelist note`);
  } else {
    log(`Whitelist check — channel not whitelisted, applying normal friction`);
  }

  // Cooldown check
  const cooldownStatus = checkCooldown(settings, tracker);
  if (cooldownStatus.active) {
    showCooldownBlock(cooldownStatus.remainingMs);
    return;
  }

  // Friction level
  const frictionLevel = determineFrictionLevel(attempt.priceValue, settings, tracker);

  // Daily cap bypass: under the pre-approved budget — record silently and show remaining toast
  if (frictionLevel === 'cap-bypass') {
    const priceWithTax = Math.round((attempt.priceValue ?? 0) * (1 + settings.taxRate / 100) * 100) / 100;
    const remaining = Math.round((settings.dailyCap.amount - (tracker.dailyTotal + priceWithTax)) * 100) / 100;
    log(`Daily cap bypass — proceeding silently, $${remaining.toFixed(2)} remaining of $${settings.dailyCap.amount.toFixed(2)} budget`);
    await recordPurchase(attempt.priceValue, settings, tracker);
    showDailyBudgetToast(remaining, settings.dailyCap.amount, settings.toastDurationSeconds * 1000);
    allowNextClick(actualButton);
    return;
  }

  // No friction: track silently and let through
  if (frictionLevel === 'none') {
    await recordPurchase(attempt.priceValue, settings, tracker);
    allowNextClick(actualButton);
    return;
  }

  // Store for proceeding
  pendingPurchase = { attempt, originalEvent: event };

  // Soft nudge: main overlay + 1 comparison item
  // Full friction: main overlay + ALL comparison items
  const maxComparisons = frictionLevel === 'nudge' ? settings.frictionThresholds.softNudgeSteps : undefined;
  const whitelistNote = whitelistEntry?.behavior === 'track-only'
    ? '\u2B50 Whitelisted Channel \u2014 This is a planned support channel'
    : undefined;
  log(`Friction flow starting: level=${frictionLevel}, maxComparisons=${maxComparisons ?? 'all'}${whitelistNote ? ', track-only whitelist' : ''}`);
  const finalDecision = await runFrictionFlow(attempt, settings, tracker, maxComparisons, whitelistNote);

  if (finalDecision === 'proceed' && pendingPurchase) {
    log('User completed all friction steps — proceeding with purchase');
    await recordPurchase(attempt.priceValue, settings, tracker);
    allowNextClick(pendingPurchase.attempt.element);
  } else {
    log('User cancelled the purchase');
  }
  pendingPurchase = null;
}

// ── Click Allow-Through ─────────────────────────────────────────────────

let allowClick = false;

function allowNextClick(element: HTMLElement): void {
  const button = element.closest('button') || element;

  log('Attempting to proceed with click on:', {
    originalElement: element.tagName,
    buttonFound: button.tagName,
    buttonText: button.textContent?.trim().substring(0, 50),
  });

  allowClick = true;

  if (button instanceof HTMLButtonElement) {
    debug('Using native .click() on button');
    button.click();
  } else {
    debug('Dispatching MouseEvent');
    const rect = button.getBoundingClientRect();
    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      button: 0,
      buttons: 1,
    });
    button.dispatchEvent(clickEvent);
  }

  setTimeout(() => { allowClick = false; }, 200);
}

function clickHandler(event: MouseEvent): void {
  if (allowClick) return;
  handleClick(event);
}

// ── Setup / Teardown ────────────────────────────────────────────────────

export function setupInterceptor(): void {
  document.addEventListener('click', clickHandler, { capture: true });
  log('Interceptor set up - watching for purchase clicks');
}

export function teardownInterceptor(): void {
  document.removeEventListener('click', clickHandler, { capture: true });
  log('Interceptor removed');
}
