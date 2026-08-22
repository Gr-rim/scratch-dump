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

[![Version](https://img.shields.io/badge/Version-1.1.5-blue?style=flat-square)]()
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
- 🔀 **Cross-tab aware** — open the same site's notes in two tabs and edits propagate between them, instead of one tab silently overwriting the other
- 🖼️ **Image paste** — paste screenshots and images inline (JPG, PNG, GIF, AVIF, SVG, WebP), resizable
- 📤 **Move folders to your phone** — export a folder (pages, images and recognized text) to a single file, and open it in the [scratch-bump](https://github.com/Gr-rim/scratch-dump) mobile app. No account, no server, no network
- 🔍 **Text in images** — pasted screenshots are read with OCR and the text is kept alongside the image, so you can right-click and copy it out. Off until you enable it; the engine is bundled, the language data is a one-time ~2 MB download you can delete again
- 🗜️ **Automatic image compression** — pasted images are resized (max 800px) and JPEG-compressed (0.7 quality), cutting storage use by ~70-80%
- 💾 **Hybrid storage** — text/metadata in `chrome.storage.local`, image blobs in IndexedDB (no hard cap), each image stored once no matter how often you edit the note
- 🔄 **Safe migration** — existing notes are automatically migrated with verify-before-commit safety
- ⏱️ **Saves when you leave** — edits are flushed when you switch tabs or navigate away, not only after the typing pause
- 🧹 **Reclaims dead storage** — image blobs orphaned by deleted notes are swept automatically
- ⚠️ **Says so when it can't save** — a storage failure raises a banner with a retry, rather than failing quietly
- 🔐 **Site identity from the browser** — which site's notes you get is decided by the browser, not by the page, so a site can't point the panel at another site's notes
- 🎙️ **Mic stops when you close** — dictation ends with the panel instead of running on behind it
- ↩️ **Per-page undo/redo** — full history stack, Ctrl+Z / Ctrl+Y
- 🎨 **Dark & Light themes** — dark by default (ofc)
- 🔡 **Font & text size controls** — Calibri, Arial, Helvetica, and a bundled Roboto (no webfont fetch)
- 🔒 **Fixed size lock** — prevent accidental resizing
- 👁️ **Opacity control** — 40%–100%, blend it into your workflow
- 📋 **Copy & Paste buttons** — copy selection or entire page in one click
- ↔️ **Resizable window** — drag the bottom-left corner
- 🛡️ **XSS protection** — sanitized HTML, secure `postMessage` origins
- 🎙️ **Voice input** — dictate notes hands-free using your browser's built-in speech recognition (Chrome, Edge and Opera)

---

## Installation

> ScratchDump isn't on the Chrome Web Store (that costs $5 and I have a whole lotta nothing in my bank account right now). But installing it manually takes under a minute.

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
| Note changed in another tab | A notice appears above the editor — **Load theirs** or **Keep mine** |
| Saving stopped working | A red banner appears above the editor with a **Retry** button |
| Delete Folder | Just remove everything from the folder |

---

## Privacy

ScratchDump stores notes and metadata in `chrome.storage.local` and image blobs in IndexedDB. Both are browser-local storage mechanisms.

This means:

- ✅ Data never leaves your device
- ✅ No servers, no accounts, no telemetry
- ✅ No analytics, no ads, no third-party anything
- ✅ Uninstalling the extension removes all data

The panel makes no network requests at all, with exactly one opt-in exception: enabling **Text in Images** downloads a language file once (see below). Leave that off and the extension never touches the network. Roboto is bundled with the extension rather than pulled from Google Fonts, so opening the panel no longer tells a third party which site you are on — and the font still renders when you are offline.

### Moving Folders

Settings → **Move to Phone** exports the folder you are looking at to a `.scratch` file — a gzipped bundle of its pages, every image they reference, and any recognized text. **Import** reads one back.

An import **replaces** the folder it names rather than merging into it. If that folder already exists here, you are told how many pages will be overwritten before anything is written, and nothing is applied until you confirm. A file that turns out to be damaged leaves your notes untouched — imports apply in one step at the end or not at all.

The mobile side is a separate installable web app, [scratch-bump](https://github.com/Gr-rim/scratch-dump). On Android it registers as a share target, so a `.scratch` file opens straight into it.

### Text in Images

Recognition runs entirely on your machine — images are never uploaded anywhere. The only network request is for the language data itself.

The recognition engine ships inside the extension, because Manifest V3 forbids loading code from a remote server. What is *not* bundled is Tesseract's ~4 MB English language file, which would quadruple the download for people who never use the feature. So:

- **Download** (Settings → Text in Images) fetches it once from jsDelivr and stores it in IndexedDB. Chrome asks for permission to reach that host at the moment you click, not at install time.
- **Delete** removes the data and hands the host permission back. The extension returns to making no network requests at all.

Until you download it, pasting behaves exactly as it always did and nothing is recognized.

Recognized text is stored beside the image rather than inside the note, so notes look the same and the text is deleted automatically whenever its image is.

A caveat worth knowing: images are compressed for display before being stored, so recognition runs on the full-resolution clipboard image at paste time. Right-clicking an older image offers **Read text**, but that can only read the compressed copy and will do noticeably worse.

### Voice Input

Voice recognition uses the browser's built-in Web Speech API. On desktop Chrome, audio may be processed by Google's servers for recognition. No audio is handled by ScratchDump itself — it never touches your microphone data directly.

Available on **Chrome, Edge and Opera**. Whether dictation reaches a recognition backend is a property of the browser and the profile, not of the user-agent string, so ScratchDump offers the button wherever the API exists and reports the attempts that fail:

| Browser | Behaviour |
| --- | --- |
| Chrome | Works. |
| Edge | Works, provided **online speech recognition** is enabled in Windows privacy settings. |
| Opera | Usually works; some builds ship without the recognition API keys and fail with a network error. |
| Brave | Button hidden. Brave ships without the recognition backend, so every attempt would fail. |

When an attempt does fail — permission denied, no backend, no network — the panel says so above the bottom bar rather than leaving a button that appears to do nothing.

---

## Architecture

### Storage

| Store | Contents |
|---|---|
| `chrome.storage.local` | Note text (with `idb:<uuid>` image refs), folder metadata, settings, schema version |
| IndexedDB (`ScratchDumpImages`) | Image blobs keyed by UUID v4 |

Images are automatically compressed on paste (max 800px width, JPEG 0.7 quality) before storage. If IndexedDB is unavailable (e.g. incognito mode), images fall back to compressed base64 inline in `chrome.storage.local`.

An image is written to IndexedDB once. While a note is open its images carry a `data-idb` attribute holding the blob id, so a save reuses that blob instead of storing another copy of the same picture. The attribute is a runtime hint only — it is stripped on the way into storage, which holds nothing but `idb:` refs.

Every folder write carries the id of the panel that made it, so a `chrome.storage.onChanged` listener can tell another tab's write apart from its own echo.

### Schema Versioning

The extension tracks `_schemaVersion` and `_migrationStatus` in `chrome.storage.local`, with crash-safe state tracking (`pending` → `in_progress` → `complete`/`failed`).

Migration runs in the service worker, not the panel. A service worker is one instance per profile, so however many tabs have a panel open, the migration happens once. Panels ask the worker whether the schema is current before they write, and a fresh profile is marked current without a scan rather than migrating across empty storage.

Every rewritten image ref is verified against the blob store before the migration is committed. If any ref does not resolve, the status is left at `failed`, the schema version is not advanced, and the error names the folder and id that failed so the next attempt has something to go on.

### Saving

Typing is debounced 300 ms. Every write — debounced or forced — goes through a single serialized chain, so a flush can never interleave with a save already in flight, and each write snapshots the folder key, page index, and content synchronously.

Edits are additionally flushed when the tab is hidden and on `pagehide`. The `pagehide` flush is best-effort: `chrome.storage` has no synchronous write, so a frame torn down immediately may not finish. The hidden-tab flush covers the common path, since a tab is normally switched away from before it is closed.

`chrome.storage` reports failures through `runtime.lastError` rather than by throwing, so an unchecked write looks exactly like a successful one. Every storage call checks it. When a save fails the panel shows a red **Not saving** banner with a Retry button and keeps the edit marked pending; a later successful write clears the banner. A reloaded extension and a full profile are described in plain words rather than raw error text.

Reads are guarded the same way, and a failed read is the more dangerous of the two: an empty editor looks exactly like an empty note, and typing into it would replace notes that are still on disk. So the editor is locked read-only until the read succeeds, with a banner explaining why and a Retry button. The same lock covers the brief moment while the worker confirms the schema, which stops the panel rendering `idb:` refs as broken images before the blob store is open.

### Site Identity

The panel is an iframe, and it cannot read its parent's origin. It asks the service worker instead, which reports the hostname from the tab's own URL.

That detail matters more than it looks. The panel used to ask the *page* over `postMessage`, and an origin check alone would not have fixed it: the page and the extension's content script share one window and one origin, so a hostname the page invented is indistinguishable at the receiving end from a real one. Only the browser can settle it. Once identity is resolved the panel refuses any later claim, and outgoing messages are addressed to the real origin instead of a wildcard.

The panel never asks the page, not even as a fallback. Any window in which the page is allowed to answer is a window in which it can point the panel at another site's notes — and because the page and the content script share an origin, no check at the receiving end can tell a real answer from an invented one. So if the worker cannot answer, the editor stays locked behind a banner with a Retry button rather than falling back to a source that can be forged.

### Cross-Tab Behaviour

Two panels open on the same site stay consistent. When another tab writes the folder you are viewing:

- **Nothing unsaved here** — that version is adopted silently, and the page you are on is re-rendered.
- **Edits pending here** — a notice appears offering **Load theirs** or **Keep mine**, rather than either side quietly winning. **Keep mine** writes this tab's version straight away, so the choice holds even if you stop typing.

### Storage Reclamation

Image blobs are reachable only through `idb:<uuid>` refs inside note HTML, so deleting a note or removing an image from one leaves its blob unreferenced. Deleting a scratch space releases the blobs that no remaining note references. A full sweep runs in the service worker on browser start and on install/update — throttled to once per 12 hours — removing every blob nothing points at.

The sweep fails closed. It decides what to delete by reading every note, and an unreadable result is indistinguishable from a profile with no notes at all — which would condemn the entire store. So every read on that path rejects rather than returning something empty, and a storage failure aborts the sweep instead of reclaiming everything. Deleting a scratch space settles the save chain first, so a write still in flight cannot land afterwards and put the key back pointing at blobs that were just released.

### Fonts

Roboto lives in `fonts/` and is declared with local `@font-face` rules, so nothing is fetched at runtime.

Four static faces are shipped — regular, bold, italic and bold-italic. Those are the only four combinations the editor can produce: no rule sets a weight on the editor, and its content takes bold from `<b>`/`<strong>`/`<h1>`–`<h6>` and italic from `<i>`/`<em>`. Every one is drawn from real outlines, so the browser synthesises nothing. Weights in between resolve to the nearer of 400 and 700.

A variable file was tried first and dropped: it spent 476 KB on a 100–900 weight axis nothing asks for, and had no italic axis at all. The four statics come to 635 KB and buy back true italics.

The other three choices in the picker are system faces.

### File Structure

```
scratch-dump/
├── manifest.json               # Extension config (Manifest V3)
├── backend/
│   ├── background.js           # Service worker — toolbar icon, schema migration, blob sweep
│   ├── content.js              # Injected into pages — creates & manages the panel iframe
│   └── content.css             # Minimal host-page styles for the panel container
├── frontend/
│   ├── panel.html              # Panel UI entry point
│   ├── panel.css               # All panel styles + dark/light theming
│   ├── state.js                # ScratchDump namespace — all shared state
│   ├── imageStore.js           # IndexedDB wrapper for image blobs + reclamation
│   ├── noteStorage.js          # chrome.storage CRUD, scratch list, cross-tab sync
│   ├── settings.js             # Settings persistence + application
│   ├── historyManager.js       # Per-page undo/redo stack (pure data structure)
│   ├── wireFormat.js           # The .scratch file format — pure, and copied verbatim into the mobile app
│   ├── transfer.js             # Folder export/import — the only side that touches storage
│   ├── ocr.js                  # Recognition — language data install/delete, job queue, worker lifecycle
│   ├── ocrWorker.js            # Preprocessing worker — upscale + binarize (started as a Worker, not a script tag)
│   ├── stt.js                  # Web Speech API wrapper, Brave-aware
│   └── panel.js                # UI coordinator — DOM events, editor, wiring
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── fonts/                      # bundled — no webfont fetch
│   ├── Roboto-Regular.ttf
│   ├── Roboto-Bold.ttf
│   ├── Roboto-Italic.ttf
│   └── Roboto-BoldItalic.ttf
└── vendor/
    └── tesseract/              # bundled — MV3 forbids remotely hosted code
        ├── tesseract.min.js
        ├── worker.min.js
        ├── tesseract-core-simd-lstm.js
        └── tesseract-core-simd-lstm.wasm
```

**Load order** (in `panel.html`):
`state.js` → `imageStore.js` → `noteStorage.js` → `ocr.js` → `wireFormat.js` → `transfer.js` → `settings.js` → `historyManager.js` → `stt.js` → `panel.js`

All files share a single `ScratchDump` namespace object (defined in `state.js`) instead of ES modules, keeping the extension zero-build. The one third-party dependency is the vendored Tesseract engine under `vendor/`, committed as-is and never fetched at runtime.

---

## Roadmap

- [ ] Export notes as `.md` or `.txt`
- [x] Dictated notes (Voice-to-notes) — Chrome, Edge and Opera
- [x] Text in images (OCR) — opt-in, runs locally
- [x] Move folders between desktop and phone — file based, no server
- [ ] Live pairing over the local network (QR + WebRTC)
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
