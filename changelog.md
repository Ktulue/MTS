# Changelog

All notable changes to the Mindful Twitch Spending (MTS) extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.5] - 2026-01-24

### Changed
- **Purchase attempt logs now include settings** used for calculations
  - Logs now show: type, rawPrice, priceValue, channel, and settings (hourlyRate, taxRate)
  - Makes it easier to debug and verify calculations in Activity Logs

---

## [0.2.4] - 2026-01-24

### Fixed
- **Fixed price parsing for values with commas** (e.g., "$3,890.00")
  - Regex now matches: `$3`, `$3.00`, `$38.90`, `$3,890.00`, `$13,890.00`
  - Commas are stripped before parsing to number for calculations
  - Display keeps original formatting with commas

### Note
- After updating/reloading the extension, **refresh the Twitch page** for changes to take effect

---

## [0.2.3] - 2026-01-24

### Added
- **Cost breakdown in overlay** when price is detected
  - Shows price with tax calculated (e.g., "With 7.5% tax: $41.82")
  - Shows hours of work equivalent (e.g., "That's 1.4 hours of work")
  - Displays minutes if less than 1 hour (e.g., "That's 45 minutes of work")
  - Uses hourly rate and tax rate from saved settings

---

## [0.2.2] - 2026-01-24

### Fixed
- **Fixed logs from different contexts overwriting each other**
  - Content script (Twitch) and Options page now share logs properly
  - Logger now uses read-modify-write pattern instead of in-memory array
  - Pending entries are buffered and merged with existing logs on save

---

## [0.2.1] - 2026-01-24

### Added
- Settings changes are now logged (viewable in Activity Logs)
  - Logs when settings are saved with new values
  - Logs when settings are reset to defaults

---

## [0.2.0] - 2026-01-24

### Added
- **MVP Part 2: Options Page & Income Calculator**
  - New Options page accessible by clicking the extension icon
  - Hourly rate input (used for "X hours of work" calculations in Part 3)
  - Sales tax rate input (used for true cost calculations in Part 3)
  - Settings persist via `chrome.storage.sync` (syncs across devices)
  - Save and Reset to Defaults buttons
  - View Activity Logs link (opens logs page)
  - Version display in footer

### Changed
- Extension icon click now opens Options page instead of Logs page
- Logs page is now accessible from within the Options page
- Updated manifest to register options page

---

## [0.1.17] - 2026-01-24

### Changed
- Renamed overlay header from "Spending Guardian" to "Twitch Spending Guardian"
- Centered the header line (icon + title) in the overlay

---

## [0.1.16] - 2026-01-24

### Fixed
- **Fixed "Gift 1 sub" not being intercepted** - added flexible gift+sub pattern matching
  - Now catches "Gift 1 sub", "Gift 5 subs", "Gift 10 sub", etc.
- **Improved Combo detection** - now checks parent button when clicking inside combo buttons
  - Handles clicks on images/SVGs inside combo buttons

---

## [0.1.15] - 2026-01-24

### Added
- Added "Elevate your Subscription" to intercepted keywords (tier upgrade button)

---

## [0.1.14] - 2026-01-24

### Fixed
- **Fixed Combos not being intercepted** - improved detection for one-tap-store buttons
  - Added direct check for aria-labels containing "combo" and "bits"
  - Added detection for any button inside `#one-tap-store-id` container
  - Excludes Close and About buttons in the combo modal

---

## [0.1.13] - 2026-01-24

### Added
- **Auto-clear logs on version update** - logs automatically clear when extension updates to a new version
  - Stored version is compared against current version on init
  - Clean slate for each new version makes debugging easier

---

## [0.1.12] - 2026-01-24

### Added
- Added "Resubscribe" to intercepted keywords

---

## [0.1.11] - 2026-01-24

### Added
- **Combos support** - intercepts Twitch's new Combo buttons (bits spending)
  - Detects buttons with aria-label pattern "Send X Combo, Y Bits"
  - Extracts combo name and bits count for display
  - Shows type as "Hearts Combo (5 Bits)", "Dinos Combo (100 Bits)", etc.
- Added "About Combos" to ignore list (info button in modal)

### What Gets Intercepted (updated)
- Gift Subs, Gift Turbo, Community Gifts
- Get Bits / Buy Bits
- Manage Subscription
- **Combos** (Hearts, HorseLuls, Dinos, Fails, CutieCats, Mind blown, etc.)

---

## [0.1.10] - 2026-01-24

### Fixed
- **Fixed logging completely broken** - race condition in storage writes
  - Reverted to in-memory array with debounced saves (100ms)
  - Loads existing logs from storage on init
  - Prevents rapid writes from overwriting each other

---

## [0.1.9] - 2026-01-24

### Fixed
- **Fixed logs not saving to storage** - Refresh button now shows logs
  - Logger now properly reads existing logs before appending new entries
  - Uses async/await to ensure storage operations complete
  - Added error logging if storage operations fail

---

## [0.1.8] - 2026-01-24

### Fixed
- **Fixed logs page buttons not working** (Refresh, Clear, Copy)
  - Replaced inline `onclick` handlers with proper event listeners
  - Inline handlers are blocked by Chrome extension Content Security Policy

---

## [0.1.7] - 2026-01-24

### Fixed
- **Added explicit allow-list for buttons that should NEVER be intercepted**
  - Close, Cancel, Back, Done, OK, Dismiss, Not Now, Maybe Later, No Thanks
  - These buttons are now always allowed through without MTS overlay

---

## [0.1.6] - 2026-01-24

### Added
- Added "Manage Your Sub" / "Manage Sub" to intercepted buttons

### What Gets Intercepted
- Gift Subs (Gift Sub, Gift a Sub, Gift Subs)
- Gift Turbo
- Community Gifts
- Get Bits / Buy Bits
- Manage Subscription

---

## [0.1.5] - 2026-01-24

### Fixed
- **Fixed false positive on "Close" button** - now only checks the specific button label text, not all nested content
- Re-added bits interception (Get Bits, Buy Bits) which was accidentally removed

### Changed
- Improved button detection: now looks for `[data-a-target="tw-core-button-label-text"]` element specifically
- Detection is now much more precise - only matches if the button's LABEL contains keywords, not surrounding content

### What Gets Intercepted
- Gift Subs (Gift Sub, Gift a Sub, Gift Subs)
- Gift Turbo
- Community Gifts
- Get Bits / Buy Bits

### What Does NOT Get Intercepted
- Close buttons
- Subscribe (personal subscriptions)
- Manage Subscription
- Other general buttons

---

## [0.1.4] - 2026-01-24

### Changed
- **Narrowed scope to GIFT buttons only** - extension now only intercepts gift-related actions
  - Intercepts: Gift Subs, Gift Turbo, Community Gifts
  - No longer intercepts: Subscribe, Bits, Manage Subscription, etc.
- Simplified detection logic - only looks for "gift" keyword in button text, aria-label, or data-a-target
- Removed broad selectors that were causing false positives (e.g., "Close" button)

### Fixed
- "Close" and other non-gift buttons are no longer incorrectly blocked

---

## [0.1.3] - 2026-01-24

### Changed
- **Purchase type now shows actual button text** instead of generic categories
  - "Gift Turbo" now displays as "Gift Turbo" instead of "Gift Subscription"
  - Button text is cleaned up (removes time-sensitive info like "(5 hours left)" and discount percentages)
  - Falls back to category-based detection if button text is too long (>30 chars)
- `PurchaseType` changed from enum to string type for flexibility
- `formatPurchaseType()` simplified to pass through type directly

---

## [0.1.2] - 2026-01-24

### Fixed
- **Critical:** "Proceed Anyway" button now actually proceeds instead of cancelling
  - Bug: `removeOverlay()` was setting `pendingPurchase = null` before the callback could use it
  - Fix: Removed premature null assignment; `pendingPurchase` is now only cleared after callback completes

---

## [0.1.1] - 2026-01-24

### Added
- Centralized logging system (`src/shared/logger.ts`) that stores logs in Chrome storage
- Logs page (`logs.html`) accessible by clicking the extension icon
  - Refresh, Clear, and Copy to Clipboard functionality
  - Simple text-based view for easy reading
- Background service worker to handle extension icon clicks
- Version syncing from `package.json` to `manifest.json` during build

### Changed
- Updated Twitch button detection for current DOM structure (2025+)
  - Added support for `data-a-target="tw-core-button-label-text"` selector
  - Expanded purchase keywords: gift turbo, turbo, prime, upgrade, manage your sub
- Improved "Proceed Anyway" functionality
  - Now correctly finds parent `<button>` element instead of label
  - Uses native `.click()` method for better React compatibility
- All modules now use centralized logger instead of direct `console.log`

### Fixed
- "Proceed Anyway" button now correctly opens the purchase dialog instead of returning to original screen
- Button detection now works with Twitch's updated UI components

---

## [0.1.0] - 2026-01-24

### Added
- **MVP Part 1: Foundation & Detection** - Initial release

#### Project Structure
- Chrome Extension Manifest V3 setup
- TypeScript configuration with webpack build system
- Content script architecture for Twitch pages

#### Core Features
- **Purchase Detection** (`src/content/detector.ts`)
  - MutationObserver for dynamic Twitch modals
  - Detection of subscribe, gift sub, and bits buttons
  - Price extraction from page elements
  - Channel name extraction from URL

- **Click Interception** (`src/content/interceptor.ts`)
  - Capture-phase event listener to intercept before Twitch handlers
  - Blocking overlay with purchase details
  - Cancel and Proceed options

- **Overlay UI** (`src/content/styles.css`)
  - Dark theme matching Twitch aesthetic
  - Twitch purple (#9146FF) accent color
  - Responsive design
  - Keyboard support (Escape to cancel)

#### Developer Features
- Debug mode with verbose console logging
- `MTS.testOverlay()` - Test overlay without clicking a button
- `MTS.scanButtons()` - Scan page for purchase-related buttons
- Visual "MTS Active" badge on page load (auto-dismisses)

#### Technical Details
- TypeScript strict mode enabled
- Webpack production builds with minification
- Source maps for debugging
- CSS extracted to separate file

---

## Version History Summary

| Version | Date | Description |
|---------|------|-------------|
| 0.2.5 | 2026-01-24 | Purchase logs now include settings used |
| 0.2.4 | 2026-01-24 | Fixed price parsing for values with commas |
| 0.2.3 | 2026-01-24 | Cost breakdown in overlay (tax + hours of work) |
| 0.2.2 | 2026-01-24 | Fixed logs from different contexts overwriting each other |
| 0.2.1 | 2026-01-24 | Settings changes now logged |
| 0.2.0 | 2026-01-24 | MVP Part 2: Options page with income/tax settings |
| 0.1.17 | 2026-01-24 | Renamed to "Twitch Spending Guardian", centered header |
| 0.1.16 | 2026-01-24 | Fixed Gift N sub pattern, improved Combos |
| 0.1.15 | 2026-01-24 | Added Elevate Subscription interception |
| 0.1.14 | 2026-01-24 | Fixed Combos detection |
| 0.1.13 | 2026-01-24 | Auto-clear logs on version update |
| 0.1.12 | 2026-01-24 | Added Resubscribe interception |
| 0.1.11 | 2026-01-24 | Added Combos (bits spending) support |
| 0.1.10 | 2026-01-24 | Fixed logging race condition |
| 0.1.9 | 2026-01-24 | Fixed logs not saving to storage |
| 0.1.8 | 2026-01-24 | Fixed logs page buttons not working |
| 0.1.7 | 2026-01-24 | Added allow-list for Close/Cancel/Back buttons |
| 0.1.6 | 2026-01-24 | Added Manage Subscription interception |
| 0.1.5 | 2026-01-24 | Fixed Close button false positive, re-added bits |
| 0.1.4 | 2026-01-24 | Narrowed to gift buttons only (no more false positives) |
| 0.1.3 | 2026-01-24 | Purchase type now shows actual button text |
| 0.1.2 | 2026-01-24 | Fixed "Proceed Anyway" button not proceeding |
| 0.1.1 | 2026-01-24 | Bug fixes, updated Twitch selectors, logs page |
| 0.1.0 | 2026-01-24 | Initial MVP Part 1 release |

---

## Upcoming

### [0.2.0] - MVP Part 2: Options Page & Income Calculator
- Options page for user configuration
- Hourly rate / salary input
- Sales tax rate configuration
- Settings persistence via Chrome storage

### [0.3.0] - MVP Part 3: The Math
- Tax calculations
- Work hours conversion
- Custom comparison items (gas, burritos, etc.)

### [0.4.0] - MVP Part 4: Multi-Step Confirmation
- Friction levels (Low/Medium/High/Extreme)
- Cooling off timer
- Type confirmation
- Cancellation analytics

### [0.5.0] - MVP Part 5: Streaming Mode
- Auto-detect when user is live on their own channel
- Grace period after stream ends
- Bypass friction while streaming

### [1.0.0] - Full MVP
- Integration testing complete
- Polish and edge case handling
- Ready for public release
