/**
 * Interceptor module - blocks purchase clicks and shows confirmation overlay
 */

import { PurchaseAttempt, OverlayDecision, OverlayCallback, UserSettings, DEFAULT_SETTINGS } from '../shared/types';
import { isPurchaseButton, createPurchaseAttempt } from './detector';
import { log, debug } from '../shared/logger';

/** Storage key for user settings */
const SETTINGS_KEY = 'mtsSettings';

/**
 * Load user settings from Chrome storage
 */
async function loadSettings(): Promise<UserSettings> {
  try {
    const result = await chrome.storage.sync.get(SETTINGS_KEY);
    return result[SETTINGS_KEY] || { ...DEFAULT_SETTINGS };
  } catch (e) {
    debug('Failed to load settings, using defaults:', e);
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Format work time for display
 * Shows minutes if less than 1 hour, otherwise hours to 1 decimal place
 */
function formatWorkTime(hours: number): string {
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  return `${hours.toFixed(1)} hour${hours !== 1 ? 's' : ''}`;
}

/**
 * Build the cost breakdown HTML when price is detected
 */
function buildCostBreakdown(priceValue: number, settings: UserSettings): string {
  const priceWithTax = priceValue * (1 + settings.taxRate / 100);
  const hoursOfWork = priceWithTax / settings.hourlyRate;

  return `
    <div class="mts-cost-breakdown">
      <p class="mts-cost-line">
        <span class="mts-cost-label">With ${settings.taxRate}% tax:</span>
        <span class="mts-cost-value">$${priceWithTax.toFixed(2)}</span>
      </p>
      <p class="mts-cost-line mts-cost-hours">
        That's <strong>${formatWorkTime(hoursOfWork)}</strong> of work
      </p>
    </div>
  `;
}

/** Track if overlay is currently shown to prevent duplicates */
let overlayVisible = false;

/** Store the original click target for proceeding */
let pendingPurchase: {
  attempt: PurchaseAttempt;
  originalEvent: MouseEvent;
} | null = null;

/**
 * Creates and shows the blocking overlay
 */
async function showOverlay(attempt: PurchaseAttempt, onDecision: OverlayCallback): Promise<void> {
  if (overlayVisible) return;
  overlayVisible = true;

  // Load user settings for cost calculations
  const settings = await loadSettings();

  // Create overlay container
  const overlay = document.createElement('div');
  overlay.id = 'mts-overlay';
  overlay.className = 'mts-overlay';

  // Format price display
  const priceDisplay = attempt.rawPrice || 'Price not detected';

  // Build cost breakdown or price note based on whether price was detected
  let priceExtra = '';
  if (attempt.priceValue !== null && attempt.priceValue > 0) {
    priceExtra = buildCostBreakdown(attempt.priceValue, settings);
  } else {
    priceExtra = '<p class="mts-price-note">Unable to detect price. Proceed with caution.</p>';
  }

  // Build overlay HTML
  overlay.innerHTML = `
    <div class="mts-modal">
      <div class="mts-header">
        <span class="mts-icon">🛡️</span>
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
        <button class="mts-btn mts-btn-cancel" data-action="cancel">
          Cancel
        </button>
        <button class="mts-btn mts-btn-proceed" data-action="proceed">
          Proceed Anyway
        </button>
      </div>
    </div>
  `;

  // Add click handlers
  const cancelBtn = overlay.querySelector('[data-action="cancel"]');
  const proceedBtn = overlay.querySelector('[data-action="proceed"]');

  cancelBtn?.addEventListener('click', () => {
    removeOverlay(overlay);
    onDecision('cancel');
  });

  proceedBtn?.addEventListener('click', () => {
    removeOverlay(overlay);
    onDecision('proceed');
  });

  // Close on backdrop click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      removeOverlay(overlay);
      onDecision('cancel');
    }
  });

  // Close on Escape key
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      removeOverlay(overlay);
      onDecision('cancel');
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  // Add to page
  document.body.appendChild(overlay);

  // Focus the cancel button for accessibility
  (cancelBtn as HTMLButtonElement)?.focus();

  // Log the purchase attempt with settings used
  log('Overlay shown for purchase:', {
    type: attempt.type,
    rawPrice: attempt.rawPrice,
    priceValue: attempt.priceValue,
    channel: attempt.channel,
    settings: {
      hourlyRate: settings.hourlyRate,
      taxRate: settings.taxRate,
    },
  });
}

/**
 * Removes the overlay from the page
 * Note: Does NOT clear pendingPurchase - that's done in the callback after processing
 */
function removeOverlay(overlay: HTMLElement): void {
  overlay.remove();
  overlayVisible = false;
  // Don't set pendingPurchase = null here - the callback needs it!
}

/**
 * Formats the purchase type for display
 * Type is now descriptive from the button text, so just return it
 */
function formatPurchaseType(type: string): string {
  return type || 'Purchase';
}

/**
 * Handles the click interception
 */
function handleClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;

  // Find the actual button (might be a child element that was clicked)
  const button = target.closest('button') || target;

  // Debug: Log all button clicks
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

  // Prevent the purchase
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  // Find the actual button element for later re-clicking
  const actualButton = (button.closest('button') || button) as HTMLElement;

  log('Purchase attempt intercepted:', {
    clickedElement: target.tagName,
    actualButton: actualButton.tagName,
    buttonText: actualButton.textContent?.trim().substring(0, 50),
  });

  // Create purchase attempt info - but store the actual button for re-clicking
  const attempt = createPurchaseAttempt(actualButton);
  attempt.element = actualButton; // Ensure we have the button, not a child element

  // Store for potential proceeding
  pendingPurchase = {
    attempt,
    originalEvent: event,
  };

  // Show the overlay
  showOverlay(attempt, (decision) => {
    if (decision === 'proceed' && pendingPurchase) {
      log('User chose to proceed with purchase');
      // Re-trigger the click without our interception
      allowNextClick(pendingPurchase.attempt.element);
    } else {
      log('User cancelled the purchase');
    }
    pendingPurchase = null;
  });
}

/** Flag to allow the next click through */
let allowClick = false;

/**
 * Temporarily allows a click through without interception
 */
function allowNextClick(element: HTMLElement): void {
  // Find the actual button element - the element we have might be a child (like the label)
  const button = element.closest('button') || element;

  log('Attempting to proceed with click on:', {
    originalElement: element.tagName,
    buttonFound: button.tagName,
    buttonText: button.textContent?.trim().substring(0, 50),
  });

  allowClick = true;

  // Use multiple methods to ensure the click works with React
  // Method 1: Use the native .click() method
  if (button instanceof HTMLButtonElement) {
    debug('Using native .click() on button');
    button.click();
  } else {
    // Method 2: Dispatch a more complete MouseEvent
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

  // Reset after a short delay
  setTimeout(() => {
    allowClick = false;
  }, 200);
}

/**
 * Main click handler that checks if we should intercept
 */
function clickHandler(event: MouseEvent): void {
  // Skip if we're allowing this click through
  if (allowClick) {
    return;
  }

  handleClick(event);
}

/**
 * Sets up the click interceptor on the document
 * Uses capture phase to catch events before Twitch's handlers
 */
export function setupInterceptor(): void {
  // Use capture phase to intercept before Twitch's handlers
  document.addEventListener('click', clickHandler, { capture: true });

  log('Interceptor set up - watching for purchase clicks');
}

/**
 * Removes the click interceptor
 */
export function teardownInterceptor(): void {
  document.removeEventListener('click', clickHandler, { capture: true });
  log('Interceptor removed');
}
