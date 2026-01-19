# MTS - Mindful Twitch Spending

A Chrome extension that creates intentional friction before spending money on Twitch. Designed to promote mindful spending habits.

## Overview

MTS intercepts Twitch checkout flows (gifting subs, subscribing, Bits purchases) and presents a series of prompts that:

- Shows the **real cost** including sales tax
- Converts the cost to **hours of work** based on your take-home pay
- Requires **multi-step confirmation** before proceeding
- Optionally bypasses friction during **streaming mode** (so you can gift to your community while live)

## Features

- 🛑 Intercept Twitch checkout flows
- 💰 Calculate cost with configurable sales tax rate
- ⏱️ Convert cost to work hours (based on your hourly take-home)
- ✅ Multi-step confirmation prompts
- 🎥 Streaming mode bypass (detects when you're live on your own channel)

## Installation

*Coming soon - not yet published to Chrome Web Store*

For development:
1. Clone this repository
2. Open Chrome → `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the `src` folder

## Configuration

After installation, click the extension icon to configure:

- **Take-home hourly rate** - Used to calculate "hours of work"
- **Sales tax rate** - Default: 7.5% (Ohio)
- **Twitch username** - For streaming mode detection
- **Enable streaming mode** - Bypass prompts when you're live

## Tech Stack

- TypeScript
- Chrome Extension Manifest V3
- Twitch API (for live detection)

## Project Structure

```
MTS/
├── README.md
├── LICENSE (GPL v3)
├── DESIGN.md
├── manifest.json
└── src/
    ├── background.ts
    ├── content.ts
    ├── popup/
    │   ├── popup.html
    │   └── popup.ts
    ├── streaming-mode.ts
    └── utils/
```

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

## Support

☕ [Buy me a coffee on Ko-fi](https://ko-fi.com/ktulue)

---

*Created by [Ktulue](https://github.com/Ktulue) | The Water Father 🌊*
