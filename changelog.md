# Changelog

All notable changes to the Mindful Twitch Spending (MTS) extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.2.21] - 2026-02-07

### Added
- **Diagnostic logging for friction flow** — added detailed log entries to trace threshold tier decisions and friction flow execution:
  - `Thresholds disabled — defaulting to full modal` when thresholds are off
  - `Friction flow starting: level=nudge, maxComparisons=1` at flow entry
  - `Friction flow: N enabled items, showing M comparison step(s), priceWithTax=$X.XX` before comparison steps

---

## [0.2.20] - 2026-02-07

### Changed
- **Friction threshold tiers now log every decision** — when thresholds are enabled, every intercepted purchase logs which tier it fell into:
  - `Threshold check: $5.99 is BELOW $10.00 threshold — no friction applied`
  - `Threshold check: $19.95 is BETWEEN $10.00 and $25.00 — soft nudge triggered`
  - `Threshold check: $126.00 is ABOVE $25.00 — full modal triggered`
  - `Threshold check: $126.00 exceeds daily cap — full modal triggered`
  - Previously, purchases below the threshold were silently passed through with no log entry

### Fixed
- **Soft nudge tier now shows the main friction modal with 1 comparison step** instead of a lightweight card
  - Shows price, tax breakdown, channel, type, and "Is this intentional or impulsive?" prompt
  - Followed by ONE comparison step (first enabled comparison item)
  - Previously used a separate simplified nudge card UI that didn't match the main modal experience
- **Full modal tier shows ALL enabled comparison items** as separate friction steps (unchanged behavior, now explicitly documented)
- Removed the old `showNudge()` function — both tiers now use `runFrictionFlow()` with a `maxComparisons` parameter (1 for nudge, unlimited for full)

### Tier behavior summary
| Tier | Condition | Behavior |
|------|-----------|----------|
| No friction | Amount < threshold 1 | Allow purchase, log only |
| Soft nudge | threshold 1 <= Amount < threshold 2 | Main modal + 1 comparison item |
| Full modal | Amount >= threshold 2 | Main modal + ALL comparison items |

When thresholds are disabled, always shows the full modal with all comparisons.

---

## [0.2.19] - 2026-02-07

### Fixed
- **Custom comparison items losing `enabled` flag on settings save** — toggling custom items on/off had no effect; they always saved without an `enabled` field
  - Root cause: `renderCustomItems()` set `data-item-id` on both the container `<div>` and the `<input>` checkbox. `getFormSettings()` used `document.querySelector('[data-item-id="..."]')` which matched the `<div>` first. `div.checked` is `undefined`, so `enabled` was set to `undefined` (omitted by JSON.stringify). The interceptor's `.filter(i => i.enabled)` then treated them as disabled.
  - Fix: Changed querySelector to `input[data-item-id="..."]` so it always targets the checkbox element
  - Preset items were unaffected because `renderPresetItems()` only sets `data-item-id` on the `<input>`, not the row container

---

## [0.2.18] - 2026-02-07

### Fixed
- **Custom comparison items not showing on friction modals** — only preset items (Costco Hot Dog, Costco Rotisserie Chicken, Swenson's Galley Boy) were appearing as comparison steps
  - Root cause: `count > 0` filter in `runFrictionFlow()` silently excluded items whose price exceeded the purchase amount (e.g., a $12.58 "Plant" vs a $4.99 purchase → `Math.round(5.36/12.58) = 0` → skipped)
  - Fix: All enabled comparison items now always appear, using `Math.max(1, count)` to guarantee a minimum display of 1
  - Same fix applied to the nudge overlay's single comparison line
  - Affects both preset and custom items equally — every enabled item shows regardless of price ratio

---

## [0.2.17] - 2026-02-07

### Added
- **Distinct dismissal logging for friction modals** — Extension Log now distinguishes how a modal was dismissed:
  - `User clicked Cancel button (Bits (10,000) - $126.00)`
  - `User dismissed modal via outside click (Bits (10,000) - $126.00)`
  - `User dismissed modal via Escape key (Bits (10,000) - $126.00)`
  - `User clicked Proceed Anyway (Bits (10,000) - $126.00)`
  - Applies to main overlay, comparison steps, and nudge modals
  - Type and Price included in all dismissal log entries for context

---

## [0.2.16] - 2026-02-07

### Fixed
- **"Type" field on friction modal was showing the price instead of the purchase type** (e.g., "Type: $212.50" instead of "Type: Bits (5,000)")
  - Root cause: `determinePurchaseType()` checked button text first and returned price strings as the type before any selector-based checks could run
  - Fix: Restructured detection to check `data-a-target` selectors first (highest priority), then keyword matching, then text-based fallback
  - Text-based fallback now strips dollar amounts and bits counts so prices never leak into the Type field
  - Selector mappings: `top-nav-get-bits-button` → "Bits", `bits-purchase-button-5000` → "Bits (5,000)", `gift-button` → "Gift A Sub", etc.

---

## [0.2.15] - 2026-02-07

### Added
- **Swenson's Galley Boy preset comparison item** ($4.99, no tax) — "That's 3 Galley Boys"

---

## [0.2.14] - 2026-02-07

### Added
- **Intercept Bits purchase buttons inside the popover** — the Bits purchase popover (opened by clicking "Get Bits") contains tier buttons (100, 500, 1500, 5000, 10000, 25000 Bits) that now trigger friction modals
  - Matches `button[data-a-target^="bits-purchase-button"]` for all tier variants
  - Dollar price is extracted from button text (e.g., "$1.40", "$64.40", "$308.00")
  - Purchase type shows as "Buy 5,000 Bits", "Buy 100 Bits", etc.
  - Bits popover detection logged: "Bits purchase popover detected" with button count
- Cheer button (`bits-button` / `aria-label="Cheer"`) remains unaffected

---

## [0.2.13] - 2026-02-07

### Changed
- **Comparison friction steps only show when price is detected** — if the extension can't extract a dollar amount from the button, the main overlay still shows but comparison steps are skipped (no meaningful comparison possible without a price)
- **Comparison steps now display the tax-adjusted price** — message shows "That $5.37 is worth 3 Costco glizzies" using the with-tax amount instead of the raw pre-tax price

---

## [0.2.12] - 2026-02-07

### Removed
- **"Minutes of Work" comparison item preset** — redundant with the hourly rate calculation already shown on the main friction modal ("That's X minutes of work"). Comparison items now only contain tangible item comparisons (Costco Hot Dog, Costco Chicken, custom items). Existing saved settings are automatically migrated to remove the stale preset.

### Changed
- **Split activity logs into two separate views**
  - **Extension Log** — tracks extension behavior and friction flow events: button interceptions, overlay displays, user decisions (Cancel/Proceed), cooldown triggers, daily cap warnings
  - **Settings Log** — tracks all settings changes: saves, resets, custom item additions/deletions
  - Each log has its own storage key (`mtsExtensionLog`, `mtsSettingsLog`) and 200-entry limit
  - Old `mtsLogs` key is retired (auto-cleared on version change)
- **Tab switcher on logs page** — toggle between Extension Log and Settings Log views
  - Styled with MTS purple theme (active tab highlighted)
  - Refresh, Clear, and Copy to Clipboard buttons operate on the currently selected log

---

## [0.2.11] - 2026-02-07

### Fixed
- **Fixed comparison friction steps not appearing after "Proceed Anyway"**
  - Root cause: `runFrictionFlow()` had an early return when price wasn't detected (`priceWithTax === null`), skipping ALL comparison step modals
  - Many Twitch buttons (e.g., "Get Bits") don't have a visible dollar price on the button, so price extraction returns null
  - Comparison steps now always show for every enabled item, regardless of price detection
  - When price is unknown, shows `?` as amount with message "Think about what else you could buy"
  - When price is known but very small relative to comparison item, count floors to 1 instead of rounding to 0

---

## [0.2.10] - 2026-02-07

### Changed
- **Multi-step comparison friction flow** — each enabled comparison item now appears as its own separate modal window after the main overlay
  - Step 1: Main overlay (cost breakdown, channel, type)
  - Step 2+: One modal per enabled comparison item (e.g., "3 Costco glizzies", "1 Costco chicken", "9 minutes of work")
  - Cancel at any step aborts the entire purchase
  - Each step is individually logged for analytics
- Refactored overlay system from callback-based to Promise-based (`showModalPromise()` helper)
- Added `showComparisonStep()` for individual comparison modals with large number display
- Added `runFrictionFlow()` to orchestrate the sequential multi-step flow

---

## [0.2.9] - 2026-02-07

### Added
- **Configurable comparison items system**
  - 3 preset items: Costco Hot Dog ($1.50), Costco Rotisserie Chicken ($4.99), Minutes of Work (uses hourly rate)
  - Custom item CRUD: add your own items with emoji, name, price, and plural label
  - Toggle items on/off individually
  - Comparisons show in cost breakdown (e.g., "That's 16 Costco glizzies")
- **Friction threshold tiers** — configurable price thresholds for friction levels
  - Below threshold 1: no friction (pass-through)
  - Between threshold 1 and 2: nudge (lightweight overlay)
  - Above threshold 2: full friction (main overlay + comparison steps)
- **Spending cooldown** — configurable cooldown period (5/10/30 min) after proceeding with a purchase
  - Shows red "Cooldown Active" modal with remaining time
- **Daily spending cap** — set a daily budget with visual progress tracking
  - Purple/orange/red badge showing daily progress percentage
  - Escalates to full friction when cap would be exceeded
- **Session spending tracker** — tracks per-channel session spending total
- **Nudge overlay** — lightweight friction variant with price, channel, and one comparison line
- **Settings migration** — `migrateSettings()` ensures backward compatibility when new settings are added
- New types: `ComparisonItem`, `FrictionLevel`, `FrictionThresholds`, `CooldownConfig`, `DailyCapConfig`, `SpendingTracker`
- Options page: 4 new sections (Comparison Items, Friction Thresholds, Spending Cooldown, Daily Spending Cap)

---

## [0.2.8] - 2026-02-07

### Fixed
- **Synced all version numbers** — manifest.json, package.json, and index.ts VERSION were out of sync (0.2.8, 0.2.7, 0.1.17 respectively)
  - All three now update together on each release
- Updated `scanForButtons()` in index.ts to reference `top-nav-get-bits-button` instead of `bits-button`

---

## [0.2.7] - 2026-02-07

### Fixed
- **Fixed Cheer button still being intercepted** - `data-a-target="bits-button"` is always the Cheer button (already-owned Bits) and is now unconditionally allowed through
  - The actual Buy Bits button is `data-a-target="top-nav-get-bits-button"` in the top nav — this is now correctly intercepted
  - Updated SELECTORS to reference the correct target

---

## [0.2.6] - 2026-02-07

### Fixed
- **Fixed Cheer button being incorrectly intercepted** - the Bits Cheer button (`aria-label="Cheer"`, `data-a-target="bits-button"`) is no longer blocked
  - Cheering uses already-purchased Bits, not real money — no friction needed
  - Only the actual Buy/Get Bits flow (spending USD) is now intercepted
  - Added `'cheer'` to the ignore labels allow-list as a second safety layer

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
| 0.2.21 | 2026-02-07 | Diagnostic logging for friction flow debugging |
| 0.2.20 | 2026-02-07 | Threshold tier logging + soft nudge uses main modal with 1 comparison |
| 0.2.19 | 2026-02-07 | Fixed custom items losing `enabled` flag on save (querySelector bug) |
| 0.2.18 | 2026-02-07 | Fixed custom comparison items not showing on friction modals |
| 0.2.17 | 2026-02-07 | Distinct dismissal logging: Cancel button vs outside click vs Escape |
| 0.2.16 | 2026-02-07 | Fixed Type field showing price instead of purchase type |
| 0.2.15 | 2026-02-07 | Added Swenson's Galley Boy preset comparison item |
| 0.2.14 | 2026-02-07 | Intercept Bits purchase buttons inside the popover |
| 0.2.13 | 2026-02-07 | Comparison steps require detected price, show tax-adjusted amount |
| 0.2.12 | 2026-02-07 | Removed Minutes of Work preset, split logs into Extension/Settings |
| 0.2.11 | 2026-02-07 | Fixed comparison friction steps not appearing after Proceed Anyway |
| 0.2.10 | 2026-02-07 | Multi-step comparison friction flow (each item = separate modal) |
| 0.2.9 | 2026-02-07 | Comparison items, friction thresholds, cooldown, daily cap, nudge |
| 0.2.8 | 2026-02-07 | Synced all version numbers, fixed scanForButtons selector |
| 0.2.7 | 2026-02-07 | Fixed Cheer button: block top-nav-get-bits-button, allow bits-button |
| 0.2.6 | 2026-02-07 | Fixed Cheer button being incorrectly intercepted |
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
