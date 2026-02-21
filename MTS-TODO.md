# MTS - What's Left To Do

**Updated:** 2026-02-21
**Current Version:** 0.3.16
**Based On:** MTS-Project-Document.md vs. actual codebase audit

---

## Quick Summary

| Phase                                     | Status            |
| ----------------------------------------- | ----------------- |
| MVP Part 1 — Foundation & Detection       | ✅ Complete       |
| MVP Part 2 — Options Page & Settings      | ✅ Complete       |
| MVP Part 3 — Tax + Hours + Comparisons    | ✅ Complete       |
| MVP Part 4 — Multi-Step Friction Levels   | ⚠️ Partially Done |
| MVP Part 4b — Analytics & Popup Stats     | ⚠️ Partially Done |
| MVP Part 5 — Streaming Mode               | ✅ Mostly Complete |
| MVP Part 6 — Integration Testing & Polish | ⚠️ Partially Done |
| Add-on 5 — Streamer Whitelist             | ✅ Mostly Complete |
| Phase 4 — Other Add-ons                   | ❌ Not Started    |

---

## MVP GAP ANALYSIS

### ✅ MVP Part 1 — Foundation & Detection (COMPLETE)

All core features are working:

- Manifest V3 setup, TypeScript, webpack build
- MutationObserver-based purchase detection
- Click interception (capture phase)
- Overlay with Cancel / Proceed buttons
- Price extraction from DOM

---

### ✅ MVP Part 2 — Options Page (COMPLETE)

Working:

- Hourly rate and salary-to-hourly conversion
- Sales tax rate input
- Chrome storage sync (save/load)
- Comparison items (preset + custom CRUD with similarity detection)
- Friction thresholds by price
- Spending cooldown setting
- Daily spending cap setting
- Streaming Mode settings (username, grace period, log bypassed)
- Channel Whitelist management (add/remove/behavior-change)
- Toast notification duration setting

---

### ✅ MVP Part 3 — Calculations (COMPLETE)

Working:

- Price + tax calculation
- Work-hours equivalent
- Comparison items in overlay steps
- Daily spending progress display

---

### ⚠️ MVP Part 4 — Multi-Step Friction Levels (PARTIALLY DONE)

**What's implemented:** Friction tiers by price threshold (no-friction / nudge / full), with comparison items displayed as sequential steps.

**What the design document specifies that is MISSING:**

- [ ] **Named friction level setting** — User-selectable Low / Medium / High / Extreme from the options page (currently friction is determined by price thresholds, not a named setting)
- [ ] **Reason-selection step (Medium+)** — Modal presenting:
  - "To support the streamer"
  - "I genuinely want this reward/emotes"
  - "Caught up in the moment" → auto-cancels with a helpful message
- [ ] **Cooldown timer step (High+)** — Progress bar countdown (10s for High, 30s for Extreme), proceed button disabled until timer completes
- [ ] **Type-to-confirm step (High+)** — User must type `I WANT THIS` (case-insensitive) to proceed
- [ ] **Math problem step (Extreme only)** — Simple arithmetic the user must solve before proceeding
- [ ] **Step-level cancellation tracking** — Record _which step_ user cancelled at (1, 2, 3, 4) for later insight

---

### ⚠️ MVP Part 4b — Analytics & Popup Stats (PARTIALLY DONE)

**What's implemented:** A logging system that stores intercept events, and a settings log. Logs page (`logs.html`) exists for viewing raw entries.

**What is MISSING:**

- [ ] **Popup with stats** — Currently clicking the extension icon opens the options page. The doc calls for a dedicated `popup.html` showing:
  - "Saved this week: $XX.XX"
  - "Blocked X impulse purchases"
  - "Most effective friction step"
  - Link to full history
- [ ] **"Money saved" calculation** — Sum of prices for purchases that were _cancelled_ (not proceeded)
- [ ] **Cancel-rate insight** — % of intercepts that resulted in cancellation
- [ ] **Most effective step insight** — Which step number has the highest cancel rate
- [ ] **Peak spending hours** — When most intercepts happen (hour-of-day bucketing)
- [ ] **Top channels** — Where spending/intercepts happen most
- [ ] **Auto-prune to 90 days** — Current logger keeps 200 entries; the doc specifies 90-day window by date

---

### ✅ MVP Part 5 — Streaming Mode (MOSTLY COMPLETE)

Core feature is fully implemented. One item remains tied to the not-yet-built popup.

**What's implemented:**

- ✅ `streamingMode.ts` module with `detectIfLive()`, `shouldBypassFriction()`, `checkAndUpdateLiveStatus()`, `updateGracePeriodBadge()`
- ✅ `getCurrentChannel()` imported from `./detector`
- ✅ Multiple live-detection DOM selectors: `p.tw-channel-status-text-indicator`, `#live-channel-stream-information`, legacy `data-a-target` fallbacks, JSON-LD `isLiveBroadcast`
- ✅ Grace period logic — elapsed/remaining math, state persisted to `chrome.storage.local`
- ✅ Toast notification on bypass (`showStreamingModeToast()`)
- ✅ Grace period badge (`updateGracePeriodBadge()`)
- ✅ Bypassed purchases logged with `wasStreamingMode: true`
- ✅ Twitch username field in options
- ✅ Enable toggle in options (default: on)
- ✅ Grace period setting in options (default: 15 min)
- ✅ Log bypassed purchases toggle in options (default: on)

**What is still MISSING:**

- [ ] **Manual override button** in popup — The `manualOverrideUntil` state field exists and is checked in `shouldBypassFriction()`, but there is no popup UI to set it. Blocked on popup not existing yet.

---

### ⚠️ MVP Part 6 — Polish & Edge Cases (PARTIALLY DONE)

**What's implemented:** Error handling, multiple DOM fallback selectors, debounced saves, escape-key dismissal, backdrop click to cancel, version tracking, debug functions (`MTS.testOverlay()`, `MTS.scanButtons()`), inline field validation with error messages.

**What may still be missing:**

- [ ] **Fresh-install onboarding** — On first install, auto-open options page prompting for setup (no settings = no rate set = overlay shows generic warning instead of work-hours)
- [ ] **Focus trap in overlay** — Tab key should cycle only within the overlay modal, not the underlying page
- [ ] **Overlay entrance animation** — Subtle fade/scale-in so it feels intentional, not jarring
- [ ] **Keyboard: Enter to confirm** — Where applicable (e.g., type-to-confirm step, final step)
- [ ] **ARIA attributes audit** — Verify all overlay modals have `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, and `aria-describedby`
- [ ] **"No price detected" fallback** — Verified the overlay still renders gracefully when price extraction fails, with a clear warning message

---

## PHASE 4 — OPTIONAL ADD-ONS

### ✅ Add-on 5 — Streamer Whitelist (MOSTLY COMPLETE)

**What's implemented:** Full per-channel whitelist with three behaviors — `skip` (no friction, silent log), `reduced` (toast only), `track-only` (full friction with a note). Add/remove/behavior-change UI in options. URL normalization on input. Whitelist note shown in the main overlay for track-only channels.

**What is still MISSING:**

- [ ] **Quick-add from the overlay** — "Remember this choice for this channel" button within the friction modal itself

---

### Remaining Add-ons (Not Started)

Listed in order of complexity per the planning doc.

#### ⭐ Easy

- [ ] **Add-on 1 — Delay Timer (Standalone)**
      A configurable mandatory wait (5/10/30/60 seconds) before _any_ purchase can proceed, independent of friction level. Single progress bar, cancel allowed at any time.

- [ ] **Add-on 4 — Custom Comparison Items (Enhanced)**
      Basic CRUD is done. What's missing: drag-to-reorder comparisons, and the ability to set which ones appear in "nudge" mode vs. "full" mode.

#### ⭐⭐ Medium

- [ ] **Add-on 2 — Spending Tracker (History View)**
      Full-page view of all logged intercept events. Filter by date range, channel, outcome (cancelled/proceeded). Sort controls. Totals row (total spent, total blocked, total "saved").

- [ ] **Add-on 3 — Weekly/Monthly Spending Limits**
      The daily cap exists but the doc also calls for weekly and monthly limits. Progress bar in overlay showing "You've spent $X of $Y this week." Warning at 80%, hard block at 100% with override option (with extra friction).

- [ ] **Add-on 6 — Export Data (CSV/JSON)**
      Button in history view or options page to export all stored log data. Choose date range. Toggle whether to include cancelled-only or all events.

#### ⭐⭐⭐ Medium-Hard

- [ ] **Add-on 7 — Accountability Partner**
      Shareable read-only dashboard link. Partner sees total spent, recent purchases, blocked count. Optional: partner can nudge friction level. Requires a small backend or a service like Firebase.

- [ ] **Add-on 8 — Discord Webhook Integration**
      Configure a webhook URL in options. Post a formatted message to Discord when a purchase proceeds (or optionally on every intercept). Configurable trigger: all / over $X / only when friction was bypassed. Rate-limiting to prevent spam.

  Example message:

  ```
  🎮 Twitch Spending Alert
  Josh just spent $26.86 on twitch.tv/ktulue
  That's 46 minutes of work!
  Made it through 3 friction steps before proceeding.
  Monthly total: $127.50 / $150.00 budget (85%)
  ```

- [ ] **Add-on 9 — Weekly Email Summary**
      Via Google Apps Script (no dedicated server). Weekly digest: spent, blocked, saved, top channels, trend vs. prior week. Configurable delivery day/time.

#### ⭐⭐⭐⭐ Hard

- [ ] **Add-on 10 — Regret Scoring (24-Hour Check-in)**
      24 hours after a proceeded purchase, show a browser notification: "How do you feel about this?" with a 😊 / 😐 / 😞 scale. Track regret rates over time. Surface insight: "You regret 60% of purchases over $20."

- [ ] **Add-on 11 — Monthly Budget & Rollover System**
      Set a monthly Twitch budget. Track blocked/cancelled amounts as "saved" money. Roll unused budget forward to next month (with a cap). Overlay shows budget status during purchase flow. Strict mode blocks purchases that would exceed remaining budget.

#### ⭐⭐⭐⭐⭐ Very Hard

- [ ] **Add-on 12 — Reporting Dashboard + Google Sheets**
      Full-page chart-based analytics dashboard. Auto-sync to Google Sheets via Apps Script. Track multi-year spending. Month-over-month and year-over-year comparisons. Pre-built pivot tables and charts in the sheet.

---

## RECOMMENDED FOCUS FOR "WRAP UP" SESSION

### Must-Haves to Call MVP Complete

1. **Popup stats panel** (Part 4b) — Adds real value, visible every time user clicks the icon; also unblocks the streaming mode manual override button
2. **Fresh-install onboarding** (Part 6) — Important UX for first-time users

### Nice-to-Haves If Time Allows

3. **Friction level setting** (Part 4) — Named Low/Medium/High/Extreme with the full step flow
4. **Money saved calculation** (Part 4b) — Makes the popup stats meaningful
5. **Focus trap + ARIA audit** (Part 6) — Polish pass
6. **Whitelist quick-add from overlay** (Add-on 5) — Small addition since the whitelist is already built

### Phase 4 Add-ons to Consider (Pick 1-2 for the stream)

- **Discord Webhook (Add-on 8)** — High streamer appeal, demonstrates webhook integration
- **Spending History View (Add-on 2)** — Visually satisfying, completes the analytics story
- **Export Data (Add-on 6)** — Easy win, useful for users who track finances externally

---

## COMMUNITY ITEMS (From Planning Doc)

- [ ] **Icon Design Contest** — Currently using placeholder icons. Planning doc suggested a community contest (submit via Discord, vote on stream, winner gets credit in README). Icon sizes needed: 16×16, 32×32, 48×48, 128×128 PNG.

---

_Last updated 2026-02-21 against the v0.3.16 codebase._
