/**
 * Interceptor module - blocks purchase clicks and shows confirmation overlay
 * After the main overlay, each enabled comparison item becomes a separate
 * friction step that must be clicked through sequentially.
 */

import {
  PurchaseAttempt, OverlayDecision, OverlayCallback, UserSettings, DEFAULT_SETTINGS,
  FrictionLevel, SpendingTracker, DEFAULT_SPENDING_TRACKER, ComparisonItem, migrateSettings,
} from '../shared/types';
import { isPurchaseButton, createPurchaseAttempt } from './detector';
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
    const priceWithTax = priceValue * (1 + settings.taxRate / 100);
    tracker.dailyTotal += priceWithTax;
    tracker.sessionTotal += priceWithTax;
    tracker.dailyDate = new Date().toISOString().split('T')[0];
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

function determineFrictionLevel(
  priceValue: number | null,
  settings: UserSettings,
  tracker: SpendingTracker,
): FrictionLevel {
  if (!settings.frictionThresholds.enabled) {
    log('Thresholds disabled — defaulting to full modal');
    return 'full';
  }
  if (priceValue === null || priceValue <= 0) return 'full';

  const priceWithTax = priceValue * (1 + settings.taxRate / 100);
  const t1 = settings.frictionThresholds.threshold1;
  const t2 = settings.frictionThresholds.threshold2;
  const price = `$${priceWithTax.toFixed(2)}`;

  if (settings.dailyCap.enabled && tracker.dailyTotal + priceWithTax > settings.dailyCap.amount) {
    log(`Threshold check: ${price} exceeds daily cap — full modal triggered`);
    return 'full';
  }
  if (priceWithTax < t1) {
    log(`Threshold check: ${price} is BELOW $${t1.toFixed(2)} threshold — no friction applied`);
    return 'none';
  }
  if (priceWithTax < t2) {
    log(`Threshold check: ${price} is BETWEEN $${t1.toFixed(2)} and $${t2.toFixed(2)} — soft nudge triggered`);
    return 'nudge';
  }
  log(`Threshold check: ${price} is ABOVE $${t2.toFixed(2)} — full modal triggered`);
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

/**
 * Calculate the comparison count for a single item
 */
function getComparisonCount(item: ComparisonItem, priceWithTax: number): number {
  if (item.price <= 0) return 0;
  return Math.round(priceWithTax / item.price);
}

/**
 * Build the cost breakdown HTML (without comparison lines — those are separate steps now)
 */
function buildCostBreakdown(priceValue: number, settings: UserSettings, tracker: SpendingTracker): string {
  const priceWithTax = priceValue * (1 + settings.taxRate / 100);
  const hoursOfWork = priceWithTax / settings.hourlyRate;

  let dailyInfo = '';
  if (settings.dailyCap.enabled) {
    const newTotal = tracker.dailyTotal + priceWithTax;
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
        <h2 class="mts-title">TWITCH SPENDING GUARDIAN</h2>
      </div>
      <div class="mts-content">
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
  count: number,
  stepNumber: number,
  totalSteps: number,
  attempt: PurchaseAttempt,
  priceWithTax: number,
): Promise<OverlayDecision> {
  if (overlayVisible) return 'cancel';
  overlayVisible = true;

  const taxPrice = `$${priceWithTax.toFixed(2)}`;
  const messageText = `That ${taxPrice} is worth <strong>${count} ${item.pluralLabel}</strong>. Still want to proceed?`;

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
          <p class="mts-comparison-amount">${count}</p>
          <p class="mts-comparison-label">${item.pluralLabel}</p>
        </div>
        <p class="mts-message">
          ${messageText}
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
    count,
    pluralLabel: item.pluralLabel,
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
): Promise<OverlayDecision> {
  // Step 1: Main overlay
  const mainDecision = await showMainOverlay(attempt, settings, tracker);
  if (mainDecision === 'cancel') {
    log('Friction flow: cancelled at Step 1 (main overlay)');
    return 'cancel';
  }

  // Build comparison steps — only when price is detected
  const priceWithTax = (attempt.priceValue && attempt.priceValue > 0)
    ? attempt.priceValue * (1 + settings.taxRate / 100)
    : null;

  if (priceWithTax === null) {
    log('Friction flow: no price detected, skipping comparison steps');
    return 'proceed';
  }

  const enabledItems = settings.comparisonItems.filter(i => i.enabled);
  const allSteps: { item: ComparisonItem; count: number }[] = [];

  for (const item of enabledItems) {
    const count = Math.max(1, getComparisonCount(item, priceWithTax));
    allSteps.push({ item, count });
  }

  // Limit comparison steps for soft nudge (maxComparisons = 1) vs full (all)
  const comparisonSteps = maxComparisons !== undefined
    ? allSteps.slice(0, maxComparisons)
    : allSteps;

  // Total steps = 1 (main) + N (comparisons)
  const totalSteps = 1 + comparisonSteps.length;

  log(`Friction flow: ${enabledItems.length} enabled items, showing ${comparisonSteps.length} comparison step(s), priceWithTax=$${priceWithTax.toFixed(2)}`);

  // Steps 2+: Each comparison item
  for (let i = 0; i < comparisonSteps.length; i++) {
    const { item, count } = comparisonSteps[i];
    const stepNumber = i + 2; // Step 1 was the main overlay

    const decision = await showComparisonStep(item, count, stepNumber, totalSteps, attempt, priceWithTax);
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
  const tracker = await loadSpendingTracker();

  // Update session channel
  if (tracker.sessionChannel !== attempt.channel) {
    tracker.sessionTotal = 0;
    tracker.sessionChannel = attempt.channel;
  }

  // Cooldown check
  const cooldownStatus = checkCooldown(settings, tracker);
  if (cooldownStatus.active) {
    showCooldownBlock(cooldownStatus.remainingMs);
    return;
  }

  // Friction level
  const frictionLevel = determineFrictionLevel(attempt.priceValue, settings, tracker);

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
  const maxComparisons = frictionLevel === 'nudge' ? 1 : undefined;
  log(`Friction flow starting: level=${frictionLevel}, maxComparisons=${maxComparisons ?? 'all'}`);
  const finalDecision = await runFrictionFlow(attempt, settings, tracker, maxComparisons);

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
