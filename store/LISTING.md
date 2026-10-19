# Chrome Web Store submission

Everything the Developer Dashboard asks for, ready to paste. Upload
`dist/scratch-dump-<version>-store.zip`, built with `node scripts/build.js store`,
not the GitHub zip.

---

## Package tab

Upload `dist/scratch-dump-1.2.0-store.zip`. Every later upload needs a higher
`version` in `manifest.json`.

## Store listing tab

**Description**, plain text (the store doesn't render Markdown):

```
A scratchpad that knows where you are.

Open ScratchDump on any website and you get that site's notes. Switch to another site and you get its notes instead. Come back, and your thoughts are where you left them. No account, no cloud, no sync service: everything stays in your browser.

WRITE
• Notes filed automatically by site, plus named scratch spaces for anything else
• Unlimited pages per site, each with its own undo and redo
• Paste screenshots and images straight into a note
• Dictate with your browser's speech recognition (Chrome, Edge, Opera)
• Text in images: pasted screenshots are read on your device, so you can copy the text back out (optional, off by default)

KEEP
• Export a folder as Markdown or plain text
• Back up every folder in one file, and restore it on another computer
• Notes saved as you type, when you switch tabs, and when you leave
• Two tabs on the same site stay in step instead of overwriting each other

TRUST
• Nothing to approve at install: no access to every site, no clipboard
• The panel only opens on the tab where you click the icon
• No analytics, no tracking, no account, no server
• The only network request is the optional text-recognition download

Works where the panel can't open, too: on browser pages and the Web Store, ScratchDump opens in a small window of its own.

Open source: https://github.com/Gr-rim/scratch-dump
```

**Category:** Productivity → *Workflow & Planning* (or *Tools*)
**Language:** English

**Graphics**, all in `store/`:

| Slot | File | Size |
|---|---|---|
| Store icon | `icons/icon128.png` | 128×128 |
| Screenshot 1 | `store/screenshot-1-site-notes.png` | 1280×800 |
| Screenshot 2 | `store/screenshot-2-folders.png` | 1280×800 |
| Screenshot 3 | `store/screenshot-3-backup-export.png` | 1280×800 |
| Screenshot 4 | `store/screenshot-4-light.png` | 1280×800 |
| Small promo tile | `store/promo-small-440x280.png` | 440×280 |

**Official URL:** none (it needs a verified domain)
**Homepage URL:** `https://github.com/Gr-rim/scratch-dump`
**Support URL:** `https://github.com/Gr-rim/scratch-dump/issues`

## Privacy tab

**Single purpose**

```
ScratchDump is a note-taking panel: it lets you write notes alongside any web page, filed automatically under that page's site and stored only on your device.
```

**Permission justifications**

`storage`
```
Saves the user's notes, folder list and settings locally on their device. Nothing is sent anywhere.
```

`unlimitedStorage`
```
Notes can hold pasted screenshots. Without this, a user with many image-heavy notes would hit the default storage quota and new notes would stop saving.
```

`activeTab`
```
When the user clicks the toolbar icon, the panel opens on that tab and reads the tab's hostname to choose which site's notes to show. It has no access to any other tab, and no access before the click.
```

`scripting`
```
Injects the panel into the current tab when the user clicks the toolbar icon, using the activeTab grant from that click. There is no content script declared on any site.
```

`clipboardRead` (optional permission)
```
Requested only when the user clicks the panel's Paste button, so it can paste clipboard text into the note. Keyboard paste (Ctrl+V) does not use it.
```

Host permission `https://cdn.jsdelivr.net/*` (optional)
```
Requested only when the user chooses to download the language data for text recognition in images. It fetches one data file (Tesseract's English traineddata), once, and is removed again when the user deletes it. No code is downloaded; the recognition engine is bundled in the package.
```

**Remote code:** *No, I am not using remote code.*
If it asks for detail:
```
All JavaScript and WebAssembly ship in the package, including the Tesseract OCR engine. The only download is a language data file used as input by that engine, fetched on request from cdn.jsdelivr.net.
```

**Data usage.** This is the one answer to check against the form's own
definitions before submitting. Notes, image text and settings never leave the
device. The extension does keep the *hostnames* of sites where you opened the
panel, as folder names, on the device. Chrome's policy text covers data that is
"collected, used or transmitted", and I couldn't find an official ruling on
data that is only stored locally. Two defensible answers:

- **Tick nothing.** Nothing is collected by the developer or transmitted. This
  is what most local-only extensions do.
- **Tick *Web history*** if the form's definition counts on-device use. In the
  justification: *"Only the hostname of sites where the user opens the panel,
  used as a folder name, stored on the user's device and never transmitted."*

Either way, tick all three certifications. The extension doesn't sell or
transfer data, doesn't use it for unrelated purposes, and doesn't use it for
creditworthiness or lending.

**Privacy policy URL**
```
https://github.com/Gr-rim/scratch-dump/blob/main/PRIVACY.md
```

## Distribution tab

- **Visibility:** *Public*. Use *Unlisted* if you want to install from the
  store yourself before anyone can find it.
- **Regions:** all.

## After submitting

- Review usually takes a few days; you'll get an email.
- The store ID will differ from the unpacked ID (`aioponbamdmmgijjedoilafinofjnibn`).
  Moving from the GitHub version to the store version means **Back up all** in
  one and **Restore** in the other.
- Once it's live, put the store link at the top of the README's Installation
  section.
