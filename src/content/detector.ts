/**
 * Detector module - watches for Twitch purchase modals and buttons
 * Uses MutationObserver to detect dynamic content changes
 */

import { PurchaseAttempt, PurchaseType } from '../shared/types';
import { debug, log } from '../shared/logger';

/** Selectors for various Twitch elements */
const SELECTORS = {
  // Gift sub elements
  giftButton: '[data-a-target="gift-button"]',
  giftSubModal: '[data-a-target="gift-sub-modal"]',
  giftSubConfirmButton: '[data-a-target="gift-sub-confirm-button"]',

  // Bits elements
  bitsButton: '[data-a-target="bits-button"]',

  // New Twitch button label (2025+)
  coreButtonLabel: '[data-a-target="tw-core-button-label-text"]',

  // Price displays (Twitch uses various elements)
  priceContainers: [
    '[data-a-target="subscription-price"]',
    '.tw-pd-x-1',
    '[data-a-target="sub-price"]',
    '.subscription-summary__price',
  ],
};

/** Keywords that indicate buttons we should intercept */
const INTERCEPT_KEYWORDS = [
  // Gift-related
  'gift sub',
  'gift a sub',
  'gift subs',
  'gift turbo',
  'community gift',
  // Bits-related
  'get bits',
  'buy bits',
  // Subscription management
  'manage your sub',
  'manage sub',
  'resubscribe',
  'elevate',  // "Elevate your Subscription" - tier upgrade
  // Combos (bits spending)
  'combo,',  // aria-label pattern: "Send X Combo, Y Bits"
];

/** Button labels we should NEVER intercept (explicit allow-list) */
const IGNORE_LABELS = [
  'close',
  'cancel',
  'back',
  'done',
  'ok',
  'dismiss',
  'not now',
  'maybe later',
  'no thanks',
  'about combos',  // Info button in combos modal
];

/**
 * Determines the type of purchase based on the clicked element
 * Returns a specific type based on the actual button text
 */
function determinePurchaseType(element: HTMLElement): PurchaseType {
  // Get the specific button label text
  const labelText = getButtonLabelText(element);
  const ariaLabel = element.getAttribute('aria-label') || '';

  // Clean up the text - remove time-sensitive info like "(5 hours left)"
  let cleanText = labelText
    .replace(/\(\d+\s*(hours?|minutes?|days?)\s*left\)/gi, '')
    .replace(/\d+%\s*off\s*/gi, '')
    .trim();

  // If we have a clean, short text, capitalize it nicely and use it
  if (cleanText && cleanText.length <= 30) {
    // Capitalize first letter of each word
    return cleanText.replace(/\b\w/g, c => c.toUpperCase());
  }

  // If aria-label is more concise, use it
  if (ariaLabel && ariaLabel.length <= 30) {
    return ariaLabel;
  }

  // Fallback to category-based detection
  const lowerText = labelText.toLowerCase();

  if (lowerText.includes('gift turbo')) {
    return 'Gift Turbo';
  }
  if (lowerText.includes('community gift')) {
    return 'Community Gift';
  }
  if (lowerText.includes('gift sub') || lowerText.includes('gift a sub')) {
    return 'Gift Subs';
  }
  if (lowerText.includes('get bits') || lowerText.includes('buy bits')) {
    return 'Get Bits';
  }
  if (lowerText.includes('manage') && lowerText.includes('sub')) {
    return 'Manage Subscription';
  }
  // Combo pattern: "Send X Combo, Y Bits"
  if (lowerText.includes('combo,') && lowerText.includes('bits')) {
    // Extract combo name and bits: "send hearts combo, 5 bits" -> "Hearts Combo (5 Bits)"
    const comboMatch = lowerText.match(/send\s+(.+?)\s+combo,\s*([\d,]+)\s*bits/i);
    if (comboMatch) {
      const comboName = comboMatch[1].replace(/\b\w/g, c => c.toUpperCase());
      const bits = comboMatch[2];
      return `${comboName} Combo (${bits} Bits)`;
    }
    return 'Combo';
  }

  // Last resort: return truncated text or generic "Purchase"
  if (labelText.length > 0) {
    const truncated = labelText.substring(0, 25) + (labelText.length > 25 ? '...' : '');
    return truncated.replace(/\b\w/g, c => c.toUpperCase());
  }

  return 'Purchase';
}

/**
 * Extracts the current channel name from the URL
 */
export function getCurrentChannel(): string {
  const path = window.location.pathname;
  const parts = path.split('/').filter(Boolean);

  // Handle various URL patterns
  // /channelname
  // /channelname/videos
  // /popout/channelname/chat
  if (parts[0] === 'popout' && parts.length > 1) {
    return parts[1];
  }

  return parts[0] || 'unknown';
}

/**
 * Regex pattern for matching dollar prices with optional commas and decimals
 * Matches: $3, $3.00, $38.90, $3,890.00, $13,890.00
 */
const PRICE_REGEX = /\$([\d,]+(?:\.\d{2})?)/;

/**
 * Parse a price string (with potential commas) to a number
 * "$3,890.00" -> 3890.00
 */
function parsePrice(priceStr: string): number {
  return parseFloat(priceStr.replace(/,/g, ''));
}

/**
 * Attempts to extract price from nearby elements
 */
function extractPrice(element: HTMLElement): { raw: string | null; value: number | null } {
  // Look for price in the element itself
  const text = element.textContent || '';
  const ariaLabel = element.getAttribute('aria-label') || '';

  // Check for dollar price first
  const priceMatch = text.match(PRICE_REGEX);
  if (priceMatch) {
    return {
      raw: priceMatch[0],
      value: parsePrice(priceMatch[1]),
    };
  }

  // Check for bits in aria-label (combo pattern: "Send X Combo, 5 Bits")
  const bitsMatch = ariaLabel.match(/([\d,]+)\s*bits/i);
  if (bitsMatch) {
    const bitsCount = bitsMatch[1].replace(/,/g, '');
    return {
      raw: `${bitsMatch[1]} Bits`,
      value: parseInt(bitsCount, 10),
    };
  }

  // Look in nearby modal/container
  const modal = element.closest('[role="dialog"]') ||
                element.closest('.modal') ||
                document.querySelector('[data-a-target="gift-sub-modal"]');

  if (modal) {
    for (const selector of SELECTORS.priceContainers) {
      const priceElement = modal.querySelector(selector);
      if (priceElement) {
        const priceText = priceElement.textContent || '';
        const match = priceText.match(PRICE_REGEX);
        if (match) {
          return {
            raw: match[0],
            value: parsePrice(match[1]),
          };
        }
      }
    }

    // Fallback: search all text in modal for price pattern
    const modalText = modal.textContent || '';
    const fallbackMatch = modalText.match(PRICE_REGEX);
    if (fallbackMatch) {
      return {
        raw: fallbackMatch[0],
        value: parsePrice(fallbackMatch[1]),
      };
    }
  }

  // Common Twitch subscription prices as fallback hints
  // This helps when we can't extract the price
  return { raw: null, value: null };
}

/**
 * Gets the actual button label text from a button element
 * Looks for the specific label element inside Twitch buttons
 */
function getButtonLabelText(button: HTMLElement): string {
  // First, try to find the specific Twitch button label element
  const labelElement = button.querySelector(SELECTORS.coreButtonLabel);
  if (labelElement) {
    return (labelElement.textContent || '').toLowerCase().trim();
  }

  // If the element itself is the label
  if (button.getAttribute('data-a-target') === 'tw-core-button-label-text') {
    return (button.textContent || '').toLowerCase().trim();
  }

  // Fallback: use aria-label if available (more reliable than textContent)
  const ariaLabel = button.getAttribute('aria-label');
  if (ariaLabel) {
    return ariaLabel.toLowerCase().trim();
  }

  // Last resort: use direct textContent but only if it's short (likely a real label)
  const text = (button.textContent || '').toLowerCase().trim();
  if (text.length <= 50) {
    return text;
  }

  return '';
}

/**
 * Checks if an element is a button we should intercept
 * Only intercepts: Gift Subs, Gift Turbo, Get Bits, Buy Bits, Manage Sub
 */
export function isPurchaseButton(element: HTMLElement | null): boolean {
  if (!element) return false;

  const dataTarget = (element.getAttribute('data-a-target') || '').toLowerCase();

  // Get the SPECIFIC button label text (not all textContent from parent elements)
  const labelText = getButtonLabelText(element);

  // Get element info for debugging
  const elementInfo = {
    tagName: element.tagName,
    labelText: labelText.substring(0, 60),
    dataTarget: element.getAttribute('data-a-target'),
    className: element.className?.substring?.(0, 50) || '',
  };

  // FIRST: Check if this is a button we should NEVER intercept (Close, Cancel, etc.)
  const isIgnoredLabel = IGNORE_LABELS.some(ignored => labelText === ignored || labelText.startsWith(ignored + ' '));
  if (isIgnoredLabel) {
    debug('isPurchaseButton: IGNORED (allow-list)', elementInfo);
    return false;
  }

  // Helper function to check for intercept keywords
  const hasInterceptKeyword = (str: string): boolean => {
    // Check explicit keywords
    if (INTERCEPT_KEYWORDS.some(keyword => str.includes(keyword))) {
      return true;
    }
    // Check for "gift" + "sub" pattern (catches "Gift 1 sub", "Gift 5 subs", etc.)
    if (str.includes('gift') && str.includes('sub')) {
      return true;
    }
    return false;
  };

  // Check if element has gift or bits-related data-a-target
  if (dataTarget.includes('gift') || dataTarget === 'bits-button') {
    debug('isPurchaseButton: MATCH via data-a-target', elementInfo);
    return true;
  }

  // Check if the button label contains intercept keywords
  if (labelText && hasInterceptKeyword(labelText)) {
    const matchedKeyword = INTERCEPT_KEYWORDS.find(k => labelText.includes(k));
    debug('isPurchaseButton: MATCH via label keyword', { ...elementInfo, matchedKeyword });
    return true;
  }

  // Check for Combo buttons (inside one-tap-store)
  // These have aria-labels like "Send Hearts Combo, 5 Bits"
  const ariaLabel = (element.getAttribute('aria-label') || '').toLowerCase();
  if (ariaLabel.includes('combo') && ariaLabel.includes('bits')) {
    debug('isPurchaseButton: MATCH via combo aria-label', { ...elementInfo, ariaLabel });
    return true;
  }

  // Also check if button is inside the one-tap-store container
  const oneTapStore = element.closest('#one-tap-store-id');
  if (oneTapStore) {
    // It's inside the combo store
    if (element.tagName === 'BUTTON') {
      // It's a button - check if it's a combo button (not close/about)
      if (!ariaLabel.includes('close') && !ariaLabel.includes('about')) {
        debug('isPurchaseButton: MATCH via one-tap-store button', { ...elementInfo, ariaLabel });
        return true;
      }
    } else {
      // Clicked element might be inside a button - find the parent button
      const parentBtn = element.closest('button');
      if (parentBtn) {
        const parentAriaLabel = (parentBtn.getAttribute('aria-label') || '').toLowerCase();
        if (!parentAriaLabel.includes('close') && !parentAriaLabel.includes('about')) {
          debug('isPurchaseButton: MATCH via one-tap-store parent button', { ...elementInfo, parentAriaLabel });
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Creates a PurchaseAttempt object from a clicked element
 */
export function createPurchaseAttempt(element: HTMLElement): PurchaseAttempt {
  const { raw, value } = extractPrice(element);

  return {
    type: determinePurchaseType(element),
    rawPrice: raw,
    priceValue: value,
    channel: getCurrentChannel(),
    timestamp: new Date(),
    element,
  };
}

/**
 * Sets up a MutationObserver to watch for dynamically added purchase modals
 * This is useful for detecting when Twitch loads new UI components
 */
export function setupModalObserver(callback: (modal: HTMLElement) => void): MutationObserver {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) {
          // Check if the added node is a modal
          if (node.matches('[role="dialog"]') || node.querySelector('[role="dialog"]')) {
            callback(node);
          }

          // Check for gift sub modal specifically
          const giftModal = node.querySelector(SELECTORS.giftSubModal);
          if (giftModal instanceof HTMLElement) {
            callback(giftModal);
          }
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return observer;
}

log('Detector module loaded');
