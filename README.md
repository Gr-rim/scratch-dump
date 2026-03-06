<div align="center">

```
███████╗ ██████╗██████╗  █████╗ ████████╗ ██████╗██╗  ██╗
██╔════╝██╔════╝██╔══██╗██╔══██╗╚══██╔══╝██╔════╝██║  ██║
███████╗██║     ██████╔╝███████║   ██║   ██║     ███████║
╚════██║██║     ██╔══██╗██╔══██║   ██║   ██║     ██╔══██║
███████║╚██████╗██║  ██║██║  ██║   ██║   ╚██████╗██║  ██║
╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝  ╚═╝    ╚═════╝╚═╝  ╚═╝
                                               D U M P
```

**A scratchpad that knows where you are.**

*Per-site notes. Local storage. No accounts. No cloud. No nonsense.*

[![Chrome](https://img.shields.io/badge/Chrome-Manual_Install-4285F4?style=flat-square&logo=google-chrome&logoColor=white)](https://github.com)
[![Brave](https://img.shields.io/badge/Brave-Manual_Install-FB542B?style=flat-square&logo=brave&logoColor=white)](https://github.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![100% Local](https://img.shields.io/badge/Storage-100%25_Local-green?style=flat-square)]()
[![No Tracking](https://img.shields.io/badge/Tracking-None-red?style=flat-square)]()

</div>
---

## What is ScratchDump?

You're on a research tab, you want to jot something down. You switch to Stack Overflow, blank note. Come back...your thoughts are right where you left them.

ScratchDump is a browser extension scratchpad that **automatically organises your notes by website**. Open it on `claude.ai` and you get Claude's notes. Open it on `github.com` and you get GitHub's notes. Every site gets its own space. No syncing to a server. No account. Everything lives in your browser's local storage, forever.

---

## Features

- 📍 **Per-site notes** — automatically detected and saved per domain
- 📁 **Named Scratch Spaces** — add freeform notebooks not tied to any URL
- 🗂️ **Cross-site dropdown** — see and access notes from any site you've written on, from anywhere
- 📄 **Multi-page** — each site/space gets unlimited pages (Pg. 1, Pg. 2...)
- 🖼️ **Image paste** — paste screenshots and images inline (JPG, PNG, GIF, AVIF, SVG, WebP), resizable
- ↩️ **Per-page undo/redo** — full history stack, Ctrl+Z / Ctrl+Y
- 🎨 **Dark & Light themes** — dark by default (ofc)
- 🔡 **Font & text size controls** — Calibri, Arial, Helvetica, Roboto
- 🔒 **Fixed size lock** — prevent accidental resizing
- 👁️ **Opacity control** — 40%–100%, blend it into your workflow
- 📋 **Copy & Paste buttons** — copy selection or entire page in one click
- ↔️ **Resizable window** — drag the bottom-left corner
- 💾 **100% local** — `chrome.storage.local`, never leaves your machine

---

## Installation

> ScratchDump isn't on the Chrome Web Store (that costs $25 and I have a whole lotta nothing in my bank account right now). But installing it manually takes under a minute.

### Chrome

1. [Download the latest release](https://github.com/Gr-rim/scratch-dump/releases) and unzip it, **or** clone this repo
2. Open Chrome and navigate to `chrome://extensions` 
3. Toggle **Developer mode** on (top-right corner)
4. Click **"Load unpacked"**
5. Select the `scratchpad-extension` folder
6. Pin the ScratchDump icon to your toolbar and you're done ✓

### Brave

1. [Download the latest release](https://github.com/Gr-rim/scratch-dump/releases) and unzip it, **or** clone this repo
2. Open Brave and navigate to `brave://extensions`
3. Toggle **Developer mode** on (top-right corner)
4. Click **"Load unpacked"**
5. Select the `scratchpad-extension` folder
6. Pin the ScratchDump icon to your toolbar and you're done ✓

> **Note:** The extension will show a "Developer mode" warning banner in Chrome — this is normal for any unpacked extension and doesn't affect functionality. Brave doesn't show this warning.

> **Note:** ScratchDump will **not** work on `chrome://`, `brave://`, or other browser-internal pages. This is a browser security restriction that applies to all extensions.

---

## How to Use

| Action | How |
|---|---|
| Open / Close | Click the toolbar icon |
| Switch site notes | Click the **⌄** chevron/dropdown next to the site name |
| Add a named scratch space | Chevron/Dropdown → **+ Add Scratch** |
| Add a page | **+** button in the bottom center |
| Navigate pages | **‹** and **›** arrows next to page number |
| Paste an image | Ctrl+V / Cmd+V anywhere in the editor |
| Resize image | Drag the right edge of any pasted image |
| Resize window | Drag the bottom-left corner |
| Undo / Redo | Top-left buttons, or Ctrl+Z / Ctrl+Y |
| Copy | Highlight text → Copy button, or click Copy with nothing selected to copy the whole page |
| Settings | Gear icon (Bottom-right) |
| Delete Folder | Just remove everything from the folder |

---

## Privacy

ScratchDump stores everything exclusively in `chrome.storage.local` (for now, next update will give you custom storage location). 
This means:

- ✅ Data never leaves your device
- ✅ No servers, no accounts, no telemetry
- ✅ No analytics, no ads, no third-party anything
- ✅ Uninstalling the extension removes all data

---

## File Structure

```
scratchpad-extension/
├── manifest.json      # Extension config (Manifest V3)
├── background.js      # Service worker — handles toolbar icon click
├── content.js         # Injected into pages — creates & manages the panel
├── content.css        # Minimal host-page styles
├── panel.html         # The scratchpad UI
├── panel.css          # All panel styles + theming
├── panel.js           # All panel logic (notes, folders, pages, settings)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Roadmap

- [ ] Export notes as `.md` or `.txt`
- [ ] Keyboard shortcut to open/close
- [ ] Search across all notes
- [ ] Optional sync via browser account (opt-in)
- [ ] Firefox support

PRs welcome. Issues welcome. Complaints also welcome, I have nowhere to be.

---

## Contributing

This is a zero-dependency vanilla JS extension. No build step, no node_modules, no bundler. Just open the folder, edit the files, hit refresh on `chrome://extensions`.

```bash
git clone https://github.com/gr-rim/scratch-dump.git
# Edit files
# Go to chrome://extensions → Load unpacked → select the folder
# Click the refresh icon on the extension card after changes
```

---

<div align="center">

---

### ☕ Buy Me a Coffee

*ScratchDump is completely free and always will be.*
*If it saved you five minutes or one headache, consider buying me a coffee.*
*I genuinely have 0 in my account right now and a coffee would make my entire week.*

<br>

**[☕ &nbsp; buymeacoffee.com/dan_ &nbsp; ☕](https://buymeacoffee.com/dan_)**

<br>

*Every cent helps.
Even a fraction of one.
I'm not even joking.*

<br>

*Or just star the repo. Stars are free and they also make my week.*
⭐

---

Made with frustration, caffeine debt, and `contenteditable` by **[Dan](https://github.com/Gr-rim)**

*"It's just a to-do list" — me, after weeks of fixing iframe pointer events lol*

</div>
