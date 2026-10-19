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

[![Version](https://img.shields.io/badge/Version-1.2.0-blue?style=flat-square)]()
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

<sub>**PRODUCTIVITY**</sub>

- 📍 **Per-site notes** — automatically detected and saved per domain
- 📁 **Named Scratch Spaces** — add freeform notebooks not tied to any URL
- 🗂️ **Cross-site dropdown** — see and access notes from any site you've written on, from anywhere
- 📄 **Multi-page** — each site/space gets unlimited pages (Pg. 1, Pg. 2...), and any page can be deleted (it asks first)
- ↩️ **Per-page undo/redo** — one step per word or pause rather than per keystroke, Ctrl+Z / Ctrl+Y
- 🖼️ **Image paste** — paste screenshots and images inline (JPG, PNG, GIF, AVIF, SVG, WebP), resizable
- 🔍 **Text in images** — pasted screenshots are read with OCR and the text is kept alongside the image, so you can right-click and copy it out. Off until you enable it; the engine is bundled, the language data is a one-time ~2 MB download you can delete again
- 🎙️ **Voice input** — dictate notes hands-free using your browser's built-in speech recognition (Chrome, Edge and Opera)
- 📋 **Copy & Paste buttons** — copy selection or entire page in one click. Paste asks for clipboard access the first time you use it
- 📝 **Export as Markdown or text** — a folder's pages as a file you can read anywhere. Images become a placeholder followed by any text recognized in them
- 📦 **Folder files** — save one folder as a `.scratch` file and open it somewhere else

<sub>**SAFETY**</sub>

- 🚫 **No install-time permissions** — installing asks for nothing: no access to every website, no clipboard. The panel reaches a site only when you click the icon on it
- 🔐 **Site identity from the browser** — which site's notes you get is decided by the browser, not by the page, so a site can't point the panel at another site's notes
- 🛡️ **XSS protection** — sanitized HTML, secure `postMessage` origins
- 💼 **Back up everything** — every folder, image and recognized text in one file. Restore it on a new install or another computer
- ⏱️ **Saves when you leave** — edits are flushed when you switch tabs or navigate away, not only after the typing pause
- ⚠️ **Says so when it can't save** — a storage failure raises a banner with a retry, rather than failing quietly
- 🔀 **Cross-tab aware** — open the same site's notes in two tabs and edits propagate between them, instead of one tab silently overwriting the other
- 🔄 **Safe migration** — existing notes are automatically migrated with verify-before-commit safety
- 🎙️ **Mic stops when you close** — dictation ends with the panel instead of running on behind it

<sub>**CUSTOMIZATION**</sub>

- 🎨 **Dark & Light themes** — dark by default (ofc)
- 🔡 **Font & text size controls** — Calibri, Arial, Helvetica, and a bundled Roboto (no webfont fetch)
- 👁️ **Opacity control** — 40%–100%, blend it into your workflow
- ↔️ **Resizable window** — drag the bottom-left corner
- 🔒 **Fixed size lock** — prevent accidental resizing

<sub>**MISC**</sub>

- 🗜️ **Automatic image compression** — pasted images are resized (max 800px) and JPEG-compressed (0.7 quality), cutting storage use by ~70-80%
- 💾 **Hybrid storage** — text/metadata in `chrome.storage.local`, image blobs in IndexedDB (no hard cap), each image stored once no matter how often you edit the note
- 🧹 **Reclaims dead storage** — image blobs orphaned by deleted notes are swept automatically

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

> **Note:** Local files (`file://`) have no site, so there are no site notes for them. Clicking the icon on one offers **New scratch** instead, which opens a scratch space named *Untitled* (then *Untitled1*, *Untitled2*…). Chrome only lets extensions onto local files when **Allow access to file URLs** is on in the extension's details. It is on by default for unpacked installs, and off for store installs.

### Upgrading from 1.1.8 or earlier — read this first

Until 1.2.0 the extension's ID came from the folder it was loaded from. 1.2.0 pins the ID, which means it arrives with a **new** ID and an empty notebook. Your old notes are still there, in the old install. Move them across once:

1. Unzip 1.2.0 to a **new folder** and Load unpacked. Keep the old version installed.
   **Don't** unzip 1.2.0 over your old folder for this upgrade: Chrome ends up with two entries pointing at one folder.
2. In the **old** version, for each folder: open it from the dropdown, then **Settings → Move to Phone → Export**.
3. In **1.2.0**: **Settings → Backup → Restore**, and select all the exported `.scratch` files at once.
4. Check everything arrived, then remove the old version.

### Updating (1.2.0 and later)

1. Unzip the new release **over your existing folder**, replacing the files (or `git pull` if you cloned).
2. On the extensions page, click the reload icon ↻ on the ScratchDump card.

Your notes stay where they are. ScratchDump's ID is fixed by the `key` in its manifest, so it keeps the same storage whichever folder it is loaded from.

> ⚠️ **Never click Remove** to update. Removing an extension deletes everything it stored, notes included. If you want a safety net first, use **Settings → Backup → Back up all**.

---

## How to Use

| Action | How |
|---|---|
| Open / Close | Click the toolbar icon |
| Switch site notes | Click the **⌄** chevron/dropdown next to the site name |
| Add a named scratch space | Chevron/Dropdown → **+ Add Scratch** |
| Take notes on a local file | Click the icon, then **New scratch** on the banner |
| Add a page | **+** button in the bottom center |
| Delete a page | 🗑 button next to **+**, then confirm. The only page in a folder is emptied instead |
| Navigate pages | **‹** and **›** arrows next to page number |
| Paste an image | Ctrl+V / Cmd+V anywhere in the editor |
| Resize image | Drag the right edge of any pasted image |
| Resize window | Drag the bottom-left corner |
| Undo / Redo | Top-left buttons, or Ctrl+Z / Ctrl+Y |
| Copy | Highlight text → Copy button, or click Copy with nothing selected to copy the whole page |
| Settings | Gear icon (Bottom-right) |
| Note changed in another tab | A notice appears above the editor — **Load theirs** or **Keep mine** |
| Saving stopped working | A red banner appears above the editor with a **Retry** button |
| Export as Markdown or text | Gear icon → **Export as** → **Markdown** or **Text** |
| Back up everything | Gear icon → **Backup** → **Back up all** |
| Restore a backup | Gear icon → **Backup** → **Restore**, pick the file |
| Save / open one folder | Gear icon → **Folder file** → **Export** or **Import** |
| Delete a scratch space | Dropdown → **×** next to its name |
| Remove a site from the dropdown | Empty its pages; a site with nothing in it isn't listed |

---

## Privacy

ScratchDump stores notes and metadata in `chrome.storage.local` and image blobs in IndexedDB. Both are browser-local storage mechanisms.

This means:

- ✅ Data never leaves your device
- ✅ No servers, no accounts, no telemetry
- ✅ No analytics, no ads, no third-party anything
- ✅ Uninstalling the extension removes all data

The panel makes no network requests at all, with one opt-in exception: enabling **Text in Images** downloads a language file once (below). Leave it off and the extension never touches the network. Roboto is bundled with the extension rather than pulled from Google Fonts, so opening the panel no longer tells a third party which site you are on — and the font still renders when you are offline.

### Permissions

Installing ScratchDump shows no permission warnings. It asks for:

| Permission | Why | When |
|---|---|---|
| `storage`, `unlimitedStorage` | Your notes | Install, no warning |
| `activeTab`, `scripting` | Open the panel on the site you clicked the icon on, and nowhere else | Install, no warning |
| Clipboard read | The **Paste** button. Ctrl+V never needs it | The first time you click Paste |
| `cdn.jsdelivr.net` | The OCR language file | When you click Download under Text in Images; handed back when you delete it |

Until 1.2.0 the extension also declared a content script on every site plus the `tabs` and clipboard permissions, which Chrome shows as *"Read and change all your data on all websites"* and *"Read and modify data you copy and paste"*. None of them were needed.

### Folder Files and Backups

Settings → **Folder file → Export** saves the folder you are looking at as a `.scratch` file: a gzipped bundle of its pages, every image they reference, and any recognized text. **Backup → Back up all** does the same for every folder at once. **Import** and **Restore** read either kind back, and you can select several files in one go.

An import **replaces** the folders it names rather than merging into them. If a folder already exists here, you are told how many pages will be overwritten before anything is written, and nothing is applied until you confirm. Every file is read and checked before anything is written, so a damaged file in a selection leaves your notes untouched.

**Export as → Markdown / Text** is different: it writes a file for *reading*, not one to import back. Pages are separated by headings that match their page numbers, empty pages are left out, and each image becomes an `[image]` line followed by any text recognized in it.

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

A change made by code rather than typing — a paste, an image, bold/italic, dictation — fires no `input` event, because the browser did not make it. Each one records its own undo step and schedules the save itself. Before 1.2.0 a text paste did neither, so a paste followed by leaving the page was lost.

Edits are additionally flushed when the tab is hidden and on `pagehide`. The `pagehide` flush is best-effort: `chrome.storage` has no synchronous write, so a frame torn down immediately may not finish. The hidden-tab flush covers the common path, since a tab is normally switched away from before it is closed.

`chrome.storage` reports failures through `runtime.lastError` rather than by throwing, so an unchecked write looks exactly like a successful one. Every storage call checks it. When a save fails the panel shows a red **Not saving** banner with a Retry button and keeps the edit marked pending; a later successful write clears the banner. A reloaded extension and a full profile are described in plain words rather than raw error text.

Reads are guarded the same way, and a failed read is the more dangerous of the two: an empty editor looks exactly like an empty note, and typing into it would replace notes that are still on disk. So the editor is locked read-only until the read succeeds, with a banner explaining why and a Retry button. The same lock covers the brief moment while the worker confirms the schema, which stops the panel rendering `idb:` refs as broken images before the blob store is open.

### Undo

One step per word or pause, not per keystroke. Typing opens a step, and it closes on a one-second pause, a space after a word, a line break, or a switch between typing and deleting. The boundary is taken on `beforeinput`, so the closed step holds the text as it stood before the change that ended it. Each page keeps the last 100 steps.

A snapshot keeps each image as its `idb:` ref rather than its pixels. The live editor holds images as full data URLs, so a stack of those used to run to megabytes per step and reading it on every keystroke made typing beside screenshots slow. Undo resolves the refs again on the way back in.

Deleting a page drops its history and moves every later page's stack down one, so the stacks keep lining up with the pages.

### Site Identity

The panel is an iframe, and it cannot read its parent's origin. It asks the service worker instead, which reports the hostname from the tab's own URL. The worker can read that URL because clicking the icon grants `activeTab` for that tab; there is no `tabs` permission and no content script declared in the manifest. `content.js` is injected by the click, so ScratchDump has no presence on a page until you ask for it there.

That detail matters more than it looks. The panel used to ask the *page* over `postMessage`, and an origin check alone would not have fixed it: the page and the extension's content script share one window and one origin, so a hostname the page invented is indistinguishable at the receiving end from a real one. Only the browser can settle it. Once identity is resolved the panel refuses any later claim, and outgoing messages are addressed to the real origin instead of a wildcard.

The panel never asks the page, not even as a fallback. Any window in which the page is allowed to answer is a window in which it can point the panel at another site's notes — and because the page and the content script share an origin, no check at the receiving end can tell a real answer from an invented one. So if the worker cannot answer, the editor stays locked behind a banner with a Retry button rather than falling back to a source that can be forged.

### Cross-Tab Behaviour

Two panels open on the same site stay consistent. When another tab writes the folder you are viewing:

- **Nothing unsaved here** — that version is adopted silently, and the page you are on is re-rendered.
- **Edits pending here** — a notice appears offering **Load theirs** or **Keep mine**, rather than either side quietly winning. **Keep mine** writes this tab's version straight away, so the choice holds even if you stop typing.

### Storage Reclamation

Image blobs are reachable only through `idb:<uuid>` refs inside note HTML, so deleting a note or removing an image from one leaves its blob unreferenced. Deleting a scratch space releases the blobs that no remaining note references. A full sweep runs in the service worker on browser start and on install/update — throttled to once per 12 hours — removing every blob nothing points at.

The sweep fails closed. It decides what to delete by reading every note, and an unreadable result is indistinguishable from a profile with no notes at all — which would condemn the entire store. So every read on that path rejects rather than returning something empty, and a storage failure aborts the sweep instead of reclaiming everything. Deleting a scratch space or a page settles the save chain first, so a write still in flight cannot land afterwards and put the key back pointing at blobs that were just released.

### Extension ID

Everything ScratchDump stores belongs to its extension ID. For an unpacked extension Chrome derives that ID from the folder path, unless the manifest carries a `key`, so before 1.2.0 unzipping an update anywhere new produced a different ID and an empty notebook.

`manifest.json` now carries the public half of a key pair, which pins the ID to `aioponbamdmmgijjedoilafinofjnibn` wherever the folder lives. The private half is not in this repository and is only needed to sign a `.crx`.

Store listings assign their own IDs, so a store build will start with its own empty storage. **Back up all** and **Restore** are how notes cross that gap, and any other one.

### Phone App and Sync (planned)

A phone companion is designed but not released. The plan is an Android app and an installable web app that hold folders locally and move them to and from the extension, either as `.scratch` files or directly over your own Wi-Fi.

The extension's half of the protocol is in this repository (`syncProtocol.js`, `syncClient.js`, and a dormant section of `settings.js`) but is switched off. Its settings row is not in the panel, its scripts are not loaded, and the manifest no longer asks for the `http://*/*` optional permission it needs. Turning it back on means putting those three things back. The design, as it stands:

The extension is the client and never listens, because it cannot. That is the whole reason the phone runs a server, and every other decision here follows from it.

`syncProtocol.js` is pure — no storage, no DOM, no `chrome.*`, no Node builtins — so the same file runs unchanged in the panel, in the phone app, and under Node. That is what lets one implementation of pairing and encryption be shared by three programs, and be tested with no phone in the room. It and `wireFormat.js` are meant to be copied verbatim into the mobile project, with a hash check there failing the build if the copies drift.

Pairing uses a typed code: an AES-GCM key is derived from it with PBKDF2. That is fine on a home network. The code carries about 40 bits and stays the same until the phone app restarts, so someone recording traffic on a shared network could brute-force it offline. Before release this should move to a PAKE, or at least a longer code that rotates per session.

Two endpoints. `GET /hello` is unauthenticated and returns a version, a salt and a device name — harmless to serve to anyone, since the salt is public by design and useless without the code. `POST /rpc` carries everything else inside an encrypted envelope, so the URL never reveals which method was called, let alone which folders exist.

Authentication is not a separate mechanism. AES-GCM is authenticated encryption, so a peer with the wrong pairing code produces a payload whose tag does not verify and decryption fails. A `401` therefore means exactly one thing — the code is wrong or has rotated — which is why the panel can say so specifically instead of reporting a generic network failure.

Reaching a private address is its own problem. Chrome match patterns have no port component and cannot express an IP range, so `new URL(address).origin` is the wrong thing to ask for: it carries the port, which makes the pattern invalid, and an invalid pattern grants nothing while looking like it might have. The host is the unit of permission. The panel requests the optional host permission at pairing time, confirms it was actually granted rather than merely accepted, and hands it back on unpair.

A permission-blocked fetch and a phone that is not there fail identically — same `TypeError`, same message — so the permission is checked before connecting. The two need completely different things from the user, and they are worth telling apart.

Folders arriving over the wire go through `transfer.js`, the same path a `.scratch` file takes, so sync inherits the overwrite warning and the atomic apply rather than reimplementing them.

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
│   ├── content.js              # Injected on icon click — creates & manages the panel iframe
│   └── content.css             # Minimal host-page styles for the panel container
├── frontend/
│   ├── panel.html              # Panel UI entry point
│   ├── panel.css               # All panel styles + dark/light theming
│   ├── state.js                # ScratchDump namespace — all shared state
│   ├── imageStore.js           # IndexedDB wrapper for image blobs + reclamation
│   ├── noteStorage.js          # chrome.storage CRUD, scratch list, cross-tab sync
│   ├── settings.js             # Settings persistence + application
│   ├── historyManager.js       # Per-page undo/redo stack (pure data structure)
│   ├── wireFormat.js           # The .scratch file format — pure, shared with the planned mobile app
│   ├── textExport.js           # Markdown / plain-text rendering of pages — pure
│   ├── transfer.js             # Folder files, backups, readable export — the only side that touches storage
│   ├── syncProtocol.js         # Planned sync: pairing, key derivation, envelopes — not loaded
│   ├── syncClient.js           # Planned sync: the extension's side — not loaded
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
`state.js` → `imageStore.js` → `noteStorage.js` → `ocr.js` → `wireFormat.js` → `textExport.js` → `transfer.js` → `settings.js` → `historyManager.js` → `stt.js` → `panel.js`

All files share a single `ScratchDump` namespace object (defined in `state.js`) instead of ES modules, keeping the extension zero-build. The one third-party dependency is the vendored Tesseract engine under `vendor/`, committed as-is and never fetched at runtime.

---

## Roadmap

- [x] Export notes as `.md` or `.txt`
- [x] Dictated notes (Voice-to-notes) — Chrome, Edge and Opera
- [x] Text in images (OCR) — opt-in, runs locally
- [x] Delete pages
- [x] Back up and restore everything in one file
- [ ] Phone app — Android, plus an installable web app for iOS (designed, not released)
- [ ] On-request sync with the phone over the local network — encrypted, paired per device (designed, not released)
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

The manifest's `key` gives every copy the same ID, so a development checkout and your everyday install can't both be loaded in one Chrome profile, and would share notes if they could. Develop in a separate profile.

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
