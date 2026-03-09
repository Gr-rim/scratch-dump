<div align="center">

```
███████╗ ██████╗██████╗  █████╗ ████████╗ ██████╗██╗  ██╗
██╔════╝██╔════╝██╔══██╗██╔══██╗╚══██╔══╝██╔════╝██║  ██║
███████╗██║     ██████╔╝███████║   ██║   ██║     ███████║
╚════██║██║     ██╔══██╗██╔══██║   ██║   ██║     ██╔══██║
███████║╚██████╗██║  ██║██║  ██║   ██║   ╚██████╗██║  ██║
╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝    ╚═════╝╚═╝  ╚═╝
                                               D U M P
```

**A scratchpad that knows where you are.**

*Per-site notes. Local storage. No accounts. No cloud. No nonsense.*

[![Chrome](https://img.shields.io/badge/Chrome-Works-4285F4?style=flat-square&logo=google-chrome&logoColor=white)](https://github.com)
[![Brave](https://img.shields.io/badge/Brave-Works-FB542B?style=flat-square&logo=brave&logoColor=white)](https://github.com)
[![Edge](https://img.shields.io/badge/Edge-Works-0078D7?style=flat-square&logo=microsoft-edge&logoColor=white)](https://github.com)
[![Opera](https://img.shields.io/badge/Opera-Works-FF1B2D?style=flat-square&logo=opera&logoColor=white)](https://github.com)
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
- 🗜️ **Automatic image compression** — pasted images are resized (max 800px) and JPEG-compressed (0.7 quality), cutting storage use by ~70-80%
- 💾 **Hybrid storage** — text/metadata in `chrome.storage.local`, image blobs in IndexedDB (no hard cap)
- 🔄 **Safe migration** — existing notes are automatically migrated with verify-before-commit safety
- ↩️ **Per-page undo/redo** — full history stack, Ctrl+Z / Ctrl+Y
- 🎨 **Dark & Light themes** — dark by default (ofc)
- 🔡 **Font & text size controls** — Calibri, Arial, Helvetica, Roboto
- 🔒 **Fixed size lock** — prevent accidental resizing
- 👁️ **Opacity control** — 40%–100%, blend it into your workflow
- 📋 **Copy & Paste buttons** — copy selection or entire page in one click
- ↔️ **Resizable window** — drag the bottom-left corner
- 🛡️ **XSS protection** — sanitized HTML, secure `postMessage` origins
- 🎙️ **Voice input** — dictate notes hands-free using your browser's built-in speech recognition (Chrome, Edge, Opera only — see note below)

---

## Installation

> ScratchDump isn't on the Chrome Web Store (that costs $25 and I have a whole lotta nothing in my bank account right now). But installing it manually takes under a minute.

### Chrome

1. [Download the latest release](https://github.com/Gr-rim/scratch-dump/releases) and unzip it, **or** clone this repo
2. Open Chrome and navigate to `chrome://extensions` 
3. Toggle **Developer mode** on (top-right corner)
4. Click **"Load unpacked"**
5. Select the `scratch-dump` folder (the one containing `manifest.json`)
6. Pin the ScratchDump icon to your toolbar and you're done ✓

### Brave (and Others)

Works the same on **Brave**, **Edge**, and **Opera** — just swap the URL:

| Browser | URL |
|---|---|
| Brave | `brave://extensions` |
| Edge | `edge://extensions` |
| Opera | `opera://extensions` |

1. [Download the latest release](https://github.com/Gr-rim/scratch-dump/releases) and unzip it, **or** clone this repo
2. Open your browser and navigate to the URL above, according to the browser you're using
3. Toggle **Developer mode** on (top-right corner)
4. Click **"Load unpacked"**
5. Select the `scratch-dump` folder (the one containing `manifest.json`)
6. Pin the ScratchDump icon to your toolbar and you're done ✓

> **Note:** Chrome and Edge will show a "Developer mode" warning banner — this is normal for any unpacked extension and doesn't affect functionality. Brave and Opera don't show this warning.

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

ScratchDump stores notes and metadata in `chrome.storage.local` and image blobs in IndexedDB. Both are browser-local storage mechanisms.

This means:

- ✅ Data never leaves your device
- ✅ No servers, no accounts, no telemetry
- ✅ No analytics, no ads, no third-party anything
- ✅ Uninstalling the extension removes all data

### Voice Input

Voice recognition uses the browser's built-in Web Speech API. On desktop Chrome and Edge, audio may be processed by Google's or Microsoft's servers respectively for recognition. No audio is handled by ScratchDump itself — it never touches your microphone data directly.

> **Brave users:** Voice input is disabled on Brave due to its built-in blocking of external speech recognition backends. This is intentional — Brave's privacy model conflicts with how the Web Speech API works under the hood.

---

## Architecture

### Storage

| Store | Contents |
|---|---|
| `chrome.storage.local` | Note text (with `idb:<uuid>` image refs), folder metadata, settings, schema version |
| IndexedDB (`ScratchDumpImages`) | Image blobs keyed by UUID v4 |

Images are automatically compressed on paste (max 800px width, JPEG 0.7 quality) before storage. If IndexedDB is unavailable (e.g. incognito mode), images fall back to compressed base64 inline in `chrome.storage.local`.

### Schema Versioning

The extension tracks `_schemaVersion` and `_migrationStatus` in `chrome.storage.local`. On update, migrations run automatically with crash-safe state tracking (`pending` → `in_progress` → `complete`/`failed`).

### File Structure

```
scratch-dump/
├── manifest.json               # Extension config (Manifest V3)
├── backend/
│   ├── background.js           # Service worker — toolbar icon click handler
│   ├── content.js              # Injected into pages — creates & manages the panel iframe
│   └── content.css             # Minimal host-page styles for the panel container
├── frontend/
│   ├── panel.html              # Panel UI entry point
│   ├── panel.css               # All panel styles + dark/light theming
│   ├── state.js                # ScratchDump namespace — all shared state
│   ├── imageStore.js           # IndexedDB wrapper for image blob storage
│   ├── noteStorage.js          # chrome.storage CRUD, scratch list, migration
│   ├── settings.js             # Settings persistence + application
│   ├── historyManager.js       # Per-page undo/redo stack (pure data structure)
│   ├── stt.js                  # Web Speech API wrapper, Brave-aware
│   └── panel.js                # UI coordinator — DOM events, editor, wiring
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

**Load order** (in `panel.html`):
`state.js` → `imageStore.js` → `noteStorage.js` → `settings.js` → `historyManager.js` → `stt.js` → `panel.js`

All files share a single `ScratchDump` namespace object (defined in `state.js`) instead of ES modules, keeping the extension zero-build and dependency-free.

---

## Roadmap

- [ ] Export notes as `.md` or `.txt`
- [x] Dictated notes (Voice-to-notes) — Chrome, Edge, Opera
- [ ] Customized note save location
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
