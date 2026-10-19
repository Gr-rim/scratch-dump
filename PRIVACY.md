# ScratchDump Privacy Policy

_Last updated: 19 October 2026_

ScratchDump is a note-taking extension. It keeps your notes on your own device,
has no account and no server, and sends nothing to its developer. This page
covers everything it stores, everything it could send anywhere, and how to
delete all of it.

## What ScratchDump stores, and where

Everything below is stored only in your browser's local storage, on your device:

- **Your notes**: the text and images you put in the panel, organised by the
  site you wrote them on, or by the scratch spaces you create.
- **The names of sites you have taken notes on.** The panel files notes under a
  site's hostname (for example `github.com`). It only learns a hostname when you
  click the ScratchDump icon on that site, and it keeps nothing else about the
  visit: not the page's full address, not its content, not your browsing
  history.
- **Text recognized in your images**, if you turn on *Text in Images*.
- **Your settings**: theme, font, text size, opacity, and similar.

None of it is sent to the developer or to anyone else. There are no analytics,
no tracking, no advertising, and no account.

## When ScratchDump uses the network

By default, never. Two optional features can involve another party, and only
when you use them:

- **Text in Images (OCR).** Clicking *Download* in Settings fetches a language
  data file from `cdn.jsdelivr.net`, once. As with any download, that service
  sees your IP address. Recognition then runs entirely on your device; your
  images are never uploaded. *Delete* removes the file and gives the network
  permission back.
- **Voice input.** Dictation uses your browser's built-in speech recognition.
  In Google Chrome, the browser sends the audio to Google to be transcribed,
  under Google's own privacy terms. ScratchDump never receives or stores the
  audio, only the transcribed text that the browser hands back, which goes
  into your note.

## Permissions

| Permission | What it is used for |
|---|---|
| `storage`, `unlimitedStorage` | Saving your notes and settings on your device |
| `activeTab`, `scripting` | Opening the panel on the tab where you clicked the icon, and only that tab |
| Clipboard read (optional) | The *Paste* button, asked for the first time you click it. Ctrl+V never needs it |
| `cdn.jsdelivr.net` (optional) | Downloading the OCR language data, as above |

## Files you export

*Export*, *Back up all* and *Export as Markdown / Text* save files to your
computer. What happens to them afterwards is up to you; ScratchDump doesn't
upload them anywhere.

## Deleting your data

- Delete a page with the 🗑 button, or a scratch space with the × in the folder
  dropdown.
- Removing the extension from your browser deletes everything it stored.

## Sharing and sale

ScratchDump does not sell, rent or share your data, does not use it for
advertising, and does not use it to decide creditworthiness or for any purpose
other than the note-taking you use it for.

## Changes

If this policy changes, the new version will be published here with a new date.

## Contact

Questions or concerns:
[open an issue on GitHub](https://github.com/Gr-rim/scratch-dump/issues).
