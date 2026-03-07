/**
 * Hype Control - Content Script Entry Point
 *
 * This script runs on all Twitch pages and sets up:
 * 1. Purchase detection via MutationObserver
 * 2. Click interception for purchase buttons
 * 3. Overlay display for confirmation
 */

import { setupInterceptor } from './interceptor';
import { setupModalObserver, getCurrentChannel } from './detector';
import { checkAndUpdateLiveStatus } from './streamingMode';
import { initThemeManager, applyThemeToOverlay } from './themeManager';
import { log, debug, error, setVersion, loadLogs } from '../shared/logger';
import { migrateSettings, DEFAULT_SETTINGS } from '../shared/types';
import './styles.css';

const SETTINGS_KEY = 'hcSettings';

async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(SETTINGS_KEY);
    return migrateSettings(result[SETTINGS_KEY] || {});
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Current extension version */
const VERSION = '0.4.0';

// Set version immediately so logger can check for updates
setVersion(VERSION);
// Initialize logs (will clear if version changed)
loadLogs();

/**
 * Shows a small badge to confirm the extension is loaded
 */
function showLoadedIndicator(): void {
  const badge = document.createElement('div');
  badge.id = 'hc-loaded-badge';
  badge.innerHTML = '🛡️ HC Active';
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
    '[data-a-target="top-nav-get-bits-button"]',
    '[data-a-target^="bits-purchase-button"]',
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
    const hasDataTarget = dataTarget.includes('gift') || dataTarget === 'top-nav-get-bits-button';

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
    log('Hype Control initializing...');
    log('URL:', window.location.href);
    log('Current channel:', getCurrentChannel());

    // Show visual confirmation
    showLoadedIndicator();

    // Initialize theme detection
    initThemeManager();

    // Set up the click interceptor
    setupInterceptor();
    log('Click interceptor active');

    // Start streaming mode polling (every 30s)
    const startStreamingPoller = async () => {
      const settings = await loadSettings();
      await checkAndUpdateLiveStatus(settings);
    };
    startStreamingPoller();
    setInterval(startStreamingPoller, 30000);

    // Set up modal observer for dynamically loaded content
    setupModalObserver((modal) => {
      log('New modal detected:', modal);
    });

    // Initial scan for buttons
    setTimeout(() => {
      scanForButtons();
    }, 2000);

    log('Extension active and watching for purchases');
    log('Open DevTools Console to see debug messages (filter by [HC])');
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
    HC: {
      testOverlay: () => void;
      scanButtons: () => void;
      version: string;
    };
  }
}

/**
 * Test function to show overlay without clicking a button
 * Call from console: HC.testOverlay()
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
  overlay.id = 'hc-overlay';
  overlay.className = 'hc-overlay';
  overlay.innerHTML = `
    <div class="hc-modal">
      <div class="hc-header">
        <span class="hc-icon">🛡️</span>
        <h2 class="hc-title">SPENDING GUARDIAN</h2>
      </div>
      <div class="hc-content">
        <div class="hc-price-section">
          <p class="hc-label">TEST MODE - You're about to spend:</p>
          <p class="hc-price">${testAttempt.rawPrice}</p>
        </div>
        <div class="hc-info">
          <p class="hc-channel">Channel: <strong>${testAttempt.channel}</strong></p>
          <p class="hc-type">Type: <strong>Subscription</strong></p>
        </div>
        <p class="hc-message">
          This is a TEST overlay. Click Cancel or Proceed to dismiss.
        </p>
      </div>
      <div class="hc-actions">
        <button class="hc-btn hc-btn-cancel" data-action="cancel">Cancel</button>
        <button class="hc-btn hc-btn-proceed" data-action="proceed">Proceed Anyway</button>
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

  applyThemeToOverlay(overlay);
  document.body.appendChild(overlay);
  log('Test overlay displayed. Click Cancel or Proceed to dismiss.');
}

// Expose to window
window.HC = {
  testOverlay,
  scanButtons: scanForButtons,
  version: VERSION,
};

log('Debug functions available: HC.testOverlay(), HC.scanButtons()');
