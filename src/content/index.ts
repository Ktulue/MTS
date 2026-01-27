/**
 * Mindful Twitch Spending - Content Script Entry Point
 *
 * This script runs on all Twitch pages and sets up:
 * 1. Purchase detection via MutationObserver
 * 2. Click interception for purchase buttons
 * 3. Overlay display for confirmation
 */

import { setupInterceptor } from './interceptor';
import { setupModalObserver, getCurrentChannel } from './detector';
import { log, debug, error, setVersion, loadLogs } from '../shared/logger';
import './styles.css';

/** Current extension version */
const VERSION = '0.1.16';

// Set version immediately so logger can check for updates
setVersion(VERSION);
// Initialize logs (will clear if version changed)
loadLogs();

/**
 * Shows a small badge to confirm the extension is loaded
 */
function showLoadedIndicator(): void {
  const badge = document.createElement('div');
  badge.id = 'mts-loaded-badge';
  badge.innerHTML = '🛡️ MTS Active';
  badge.style.cssText = `
    position: fixed;
    bottom: 10px;
    right: 10px;
    background: #9146ff;
    color: white;
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: bold;
    z-index: 999998;
    font-family: sans-serif;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    transition: opacity 0.3s;
  `;
  document.body.appendChild(badge);

  // Fade out after 3 seconds
  setTimeout(() => {
    badge.style.opacity = '0';
    setTimeout(() => badge.remove(), 300);
  }, 3000);
}

/**
 * Scans page for interceptable buttons and logs findings
 */
function scanForButtons(): void {
  // Selectors for interceptable elements
  const selectors = [
    '[data-a-target="gift-button"]',
    '[data-a-target="gift-sub-confirm-button"]',
    '[data-a-target="bits-button"]',
  ];

  // Keywords we intercept (gifts, bits, and subscription management)
  const interceptKeywords = ['gift sub', 'gift a sub', 'gift subs', 'gift turbo', 'community gift', 'get bits', 'buy bits', 'manage your sub', 'manage sub'];

  log('=== Scanning for interceptable buttons (gifts & bits) ===');

  // Check specific selectors
  selectors.forEach(selector => {
    try {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        log(`Found ${elements.length} element(s) matching: ${selector}`);
        elements.forEach((el, i) => {
          const text = (el.textContent || '').trim().substring(0, 60);
          log(`  [${i}] INTERCEPTABLE: "${text}"`, el);
        });
      }
    } catch (e) {
      debug(`Selector error for ${selector}:`, e);
    }
  });

  // Also scan all buttons for intercept keywords
  const allButtons = document.querySelectorAll('button');
  log(`Total buttons on page: ${allButtons.length}`);

  let interceptCount = 0;
  allButtons.forEach(btn => {
    // Get the specific label text (not all nested content)
    const labelEl = btn.querySelector('[data-a-target="tw-core-button-label-text"]');
    const labelText = labelEl ? (labelEl.textContent || '').toLowerCase() : '';
    const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
    const dataTarget = (btn.getAttribute('data-a-target') || '').toLowerCase();

    const hasKeyword = interceptKeywords.some(kw => labelText.includes(kw) || ariaLabel.includes(kw));
    const hasDataTarget = dataTarget.includes('gift') || dataTarget === 'bits-button';

    if (hasKeyword || hasDataTarget) {
      interceptCount++;
      log('Found interceptable button:', {
        labelText: labelText.substring(0, 60) || '(no label)',
        ariaLabel: btn.getAttribute('aria-label'),
        dataTarget: btn.getAttribute('data-a-target'),
        element: btn
      });
    }
  });

  log(`=== Scan complete: ${interceptCount} interceptable button(s) found ===`);
}

// Extension initialization
function init(): void {
  try {
    log('Mindful Twitch Spending initializing...');
    log('URL:', window.location.href);
    log('Current channel:', getCurrentChannel());

    // Show visual confirmation
    showLoadedIndicator();

    // Set up the click interceptor
    setupInterceptor();
    log('Click interceptor active');

    // Set up modal observer for dynamically loaded content
    setupModalObserver((modal) => {
      log('New modal detected:', modal);
    });

    // Initial scan for buttons
    setTimeout(() => {
      scanForButtons();
    }, 2000);

    log('Extension active and watching for purchases');
    log('Open DevTools Console to see debug messages (filter by [MTS])');
  } catch (err) {
    error('Failed to initialize:', err);
  }
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Re-initialize on SPA navigation (Twitch is a single-page app)
let lastUrl = location.href;
const urlObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    log('URL changed to:', location.href);
    log('Current channel:', getCurrentChannel());

    // Re-scan for buttons after navigation
    setTimeout(() => {
      scanForButtons();
    }, 2000);
  }
});

urlObserver.observe(document.body, {
  childList: true,
  subtree: true,
});

// Expose debug functions to window for console testing
declare global {
  interface Window {
    MTS: {
      testOverlay: () => void;
      scanButtons: () => void;
      version: string;
    };
  }
}

/**
 * Test function to show overlay without clicking a button
 * Call from console: MTS.testOverlay()
 */
function testOverlay(): void {
  log('Testing overlay display...');

  const testAttempt = {
    type: 'subscribe' as const,
    rawPrice: '$4.99',
    priceValue: 4.99,
    channel: getCurrentChannel(),
    timestamp: new Date(),
    element: document.body,
  };

  // Create overlay directly
  const overlay = document.createElement('div');
  overlay.id = 'mts-overlay';
  overlay.className = 'mts-overlay';
  overlay.innerHTML = `
    <div class="mts-modal">
      <div class="mts-header">
        <span class="mts-icon">🛡️</span>
        <h2 class="mts-title">SPENDING GUARDIAN</h2>
      </div>
      <div class="mts-content">
        <div class="mts-price-section">
          <p class="mts-label">TEST MODE - You're about to spend:</p>
          <p class="mts-price">${testAttempt.rawPrice}</p>
        </div>
        <div class="mts-info">
          <p class="mts-channel">Channel: <strong>${testAttempt.channel}</strong></p>
          <p class="mts-type">Type: <strong>Subscription</strong></p>
        </div>
        <p class="mts-message">
          This is a TEST overlay. Click Cancel or Proceed to dismiss.
        </p>
      </div>
      <div class="mts-actions">
        <button class="mts-btn mts-btn-cancel" data-action="cancel">Cancel</button>
        <button class="mts-btn mts-btn-proceed" data-action="proceed">Proceed Anyway</button>
      </div>
    </div>
  `;

  overlay.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.dataset.action || e.target === overlay) {
      overlay.remove();
      log('Test overlay dismissed');
    }
  });

  document.body.appendChild(overlay);
  log('Test overlay displayed. Click Cancel or Proceed to dismiss.');
}

// Expose to window
window.MTS = {
  testOverlay,
  scanButtons: scanForButtons,
  version: VERSION,
};

log('Debug functions available: MTS.testOverlay(), MTS.scanButtons()');
