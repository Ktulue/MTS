# Hype Control

A Chrome extension that creates intentional friction before spending money on Twitch. Designed to promote mindful spending habits.

## Overview

Hype Control intercepts Twitch checkout flows (gifting subs, subscribing, Bits purchases) and presents a series of prompts that:

- Shows the **real cost** including sales tax
- Converts the cost to **hours of work** based on your take-home pay
- Requires **multi-step confirmation** before proceeding
- Compares the purchase to relatable real-world items (e.g., "That's 16 Costco hot dogs")
- Optionally bypasses friction during **streaming mode** (so you can gift to your community while live)

## Features

- 🛑 Intercepts gift subs, subs, and Bits purchases before they go through
- 💰 Calculates true cost with configurable sales tax rate
- ⏱️ Converts cost to work hours based on your take-home hourly rate
- 🔢 Multi-step friction flow — each comparison item is its own confirmation step
- 📊 Daily spending cap with silent bypass below budget and full friction when over
- ⏳ Spending cooldown — enforces a waiting period after each purchase
- 🎥 Streaming mode — detects when you're live on your own channel and bypasses friction automatically, with a configurable grace period after your stream ends
- ⭐ Channel whitelist — skip, reduce, or apply full friction for channels you intentionally support
- 📋 Activity log — full history of intercepts, decisions, and settings changes
- 🔔 Toast notifications for silent bypass events (budget bypass, streaming mode, whitelisted channels)

## Installation

Available on the [Chrome Web Store](https://chromewebstore.google.com/detail/hype-control/).

For development:
1. Clone this repository
2. Run `npm install` then `npm run build`
3. Open Chrome → `chrome://extensions/`
4. Enable "Developer mode"
5. Click "Load unpacked" and select the project root folder (where `manifest.json` lives)

## Configuration

Click the extension icon (or right-click → Options) to open the settings page:

- **Hourly rate** — Your take-home pay, used to calculate "X hours of work"
- **Sales tax rate** — Added to the displayed price to show true cost
- **Comparison items** — Toggle preset items on/off; add your own with a custom name, emoji, and price
- **Daily spending cap** — Set a daily limit; purchases under the cap pass through silently with a toast
- **Spending cooldown** — Block further purchases for 5/10/30 minutes after each one
- **Friction thresholds** — Set floor/ceiling dollar amounts to control nudge vs. full friction
- **Streaming mode** — Enter your Twitch username; friction bypasses while you're live and during a configurable grace period after your stream ends
- **Channel whitelist** — Add channels with Skip (no friction), Reduced (toast only), or Full (full friction with a note) behavior
- **Toast duration** — How long silent-bypass notifications stay on screen

## Tech Stack

- TypeScript
- Chrome Extension Manifest V3
- Webpack
- Live detection via DOM selectors (no Twitch API required)

## Project Structure

```
HypeControl/
├── manifest.json
├── package.json
├── assets/
│   └── icons/
└── src/
    ├── background/
    │   └── serviceWorker.ts
    ├── content/
    │   ├── index.ts           # Entry point, sets up observer + interceptor
    │   ├── interceptor.ts     # Overlay flow, friction logic, click handling
    │   ├── detector.ts        # Purchase button detection, price extraction
    │   ├── streamingMode.ts   # Live detection, grace period, bypass logic
    │   └── styles.css
    ├── options/
    │   ├── options.html
    │   └── options.ts
    ├── logs/
    │   ├── logs.html
    │   └── logs.ts
    └── shared/
        ├── types.ts           # Shared interfaces and defaults
        └── logger.ts          # Event logging to chrome.storage.local
```

## Known Issues

- **Bits promotional module** — The animated Bits gem/icon that Twitch displays on channel pages cannot currently be intercepted. Hype Control can intercept the "Get Bits" button in the top navigation bar, but the promotional overlay module uses a non-standard rendering path that doesn't expose a clickable element Hype Control can hook.

## Contributing

Contributions welcome! Please read the license terms below before contributing.

## License

This project is licensed under the **GNU General Public License v3.0** - see the [LICENSE](LICENSE) file for details.

This means you are free to:
- ✅ Use this software
- ✅ Modify this software
- ✅ Distribute this software

Under the following conditions:
- 📖 Source code must remain open
- 📖 Derivative works must also be GPL v3
- 📖 Changes must be documented

You **cannot**:
- ❌ Close-source this project or derivatives
- ❌ Sell closed-source versions

## Acknowledgments

- **HolmsB** — For helping name the extension "Hype Control"

## Support

☕ [Buy me a coffee on Ko-fi](https://ko-fi.com/ktulue)

---

*Created by [Ktulue](https://github.com/Ktulue) | The Water Father 🌊*
