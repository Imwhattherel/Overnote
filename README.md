# Overnote

**Version 2.1.1:** Fixed password-protected notes covering the navigation sidebar. A locked note now covers only its editor, so you can switch to other tabs, expand folders, and use Settings without unlocking it.

A lightweight-feeling Windows sticky-note app built with **Electron**, created by **whattherel**.

**GitHub:** https://github.com/Imwhattherel/Overnote

## What it does

- Create colored notes and organize them into collapsible, color-coded folders.
- Detach notes into independent windows, restore their size and monitor placement after restart, and pin selected pop-outs on top.
- Search text across all notes with `Ctrl+F`.
- Edit Markdown with an instant rendered preview beside or below the editor, a right-click formatting menu (bold, italic, underline, strike, headings, code, highlight), and an Insert menu for links, lists, tasks, quotes, code blocks, dividers, and tables. The live preview can be toggled and remembers your choice.
- Interactive checklists (`Ctrl+Shift+L` converts selected lines); checkboxes work in both live preview and view mode.
- Create several reminders per note from highlighted text; browse them in a calendar. Important reminders open an audible alarm with snooze controls.
- Select an MP3, WAV or OGG file as the important-reminder alarm sound.
- Recover deleted notes from the 30-day trash, import/export selected notes as JSON, Markdown (`.md`), plain text (`.txt`), or PDFs, and schedule backups to a local folder, Discord webhook, or GitHub repository.
- Paste or insert PNG, JPEG, GIF and WebP images right into Markdown notes (up to 1.5 MB/image); included in shared JSON/Markdown, PDFs and backups.
- Switch between app-wide **Light and Dark** themes, independently of each note's accent color.
- Lock individual notes with password-based AES-256-GCM encryption; lock state survives restart and full backups.
- Check the newest published GitHub Release manually or at startup (informational only; no silent installers).
- Import `.md` and `.txt` notes, plus the **classic Microsoft Sticky Notes** `plum.sqlite` file (read-only; close Microsoft Sticky Notes first).

## Downloads and running on Windows

Download the ready-to-run Windows ZIP from the project's releases (when a release is uploaded), **extract the entire ZIP**, and open `Overnote.exe` from the extracted folder. Do not run the executable from inside the ZIP. Keep the extracted folder in a permanent location if Start with Windows is enabled.

**Unsigned build warning:** Changing the app's `author`/company information to `whattherel` does **not** remove the Windows **Unknown publisher** warning. A publicly trusted code-signing certificate and an Authenticode-signed executable/installer are required for that. The unsigned ZIP should be distributed transparently as unsigned.

## Build from source

Requirements: [Node.js LTS](https://nodejs.org/) and Windows for packaging the Windows installer/portable executable.

```bash
npm ci
npm test
npm start
```

To create Windows installers on Windows:

```bash
npm run build
```

Or run `Build App.bat` on Windows. Electron Builder outputs installer and portable builds in `dist/`. Building locally does **not** sign the binaries. To publish signed releases, configure your own trusted certificate and code-signing workflow privately; never commit certificates or passwords.

### Repo layout

| File / folder | Purpose |
| --- | --- |
| `main.js`, `preload.js` | Electron windows, storage, tray and IPC |
| `index.html` | Notes interface and responsive layouts |
| `alarm.html`, `alarm-preload.js` | Important-reminder alarm window |
| `backup-tools.js` | Backup and share import/export helpers |
| `note-security.js` | Password-based authenticated note encryption |
| `note-formats.js` | Markdown/PDF export helpers |
| `sticky-import.js` | Read-only classic Windows Sticky Notes database importer |
| `storage-tools.js` | Safe storage migration and temporary-file cleanup |
| `LICENSE` | MIT open-source license |
| `assets/` | Application icons |
| `tests/` | Node regression tests and Chromium UI tests |
| `package.json`, `package-lock.json` | Build dependencies and metadata |

## Editing and inserting Markdown

In **Edit** mode, the live preview updates while you type. On wide windows it appears beside the text; on narrower windows it appears underneath. Click **◧ Live** or press `Ctrl+Shift+P` to hide/show it. Use **View** (`Ctrl+E`) for the full formatted note. Both previews allow clicking checklist items.

Right-click in the editor to open **Format selection** and **Insert into note** menus. Select text first to wrap it in bold, italic, underline (`++text++`), strikethrough (`~~text~~`), code, or highlighting (`==text==`). Headings, lists and quotes apply to the selected lines. The **＋ Insert** button gives quick access to templates for links, tasks, bullet and numbered lists, blockquotes, fenced code, dividers and Markdown tables. Hold **Shift** when right-clicking to access the browser’s native text menu.

## Data location, migration, and privacy

Overnote 2.1.1 stores user data at **`%APPDATA%\Overnote`**. On first launch it **copies** `notes.json`, encrypted backup credentials, the selected alarm audio, and up to 14 recent backups from the old `%APPDATA%\sticky-notes` folder. The original folder remains untouched as a manual rollback/safety copy; please **verify the new app has all your notes before manually deleting it**. Later launches do not overwrite newer Overnote data from the old folder. Chromium cache is located separately at **`%LOCALAPPDATA%\Overnote\Chromium`**. Use **Settings → Clear temporary app cache** to clear disposable cache/logs without affecting notes, passwords, alarm audio or backups.

A note locked with a password uses **scrypt** to derive an encryption key and **AES-256-GCM** to encrypt its text. Saved JSON and automatic backups contain ciphertext, not the unlocked body. **There is no password recovery**: losing a note's password makes its content unrecoverable. Titles, folder associations, colors and reminder excerpts are **not encrypted** because Overnote uses them for the sidebar, calendar, and alarm notifications. Unlock a note before sharing or exporting it. Passwords and keys are never written into application settings.

Image insertion works from **▣ Image**, pasting from the clipboard, or dragging an image onto the editor. Images become self-contained `data:image/...;base64` Markdown references instead of separate attachment files, so sharing preserves them; image-heavy notes do grow in size and create larger backups. Avoid inserting private images into public notes or shared JSON/PDF files.

Remote backup credentials are encrypted with Windows' secure storage where available and never committed to the repository. Discord/GitHub backup destinations may expose your notes to others with access to the destination; use a private channel or repository. Encrypted notes remain encrypted in backups but other note content and metadata do not.

## Importing from Windows Sticky Notes

For classic Microsoft Sticky Notes (Windows 10 and older Windows 11 versions), close Sticky Notes, then choose **New Tab ▾ → Import notes…** and select:

`%LOCALAPPDATA%\Packages\Microsoft.MicrosoftStickyNotes_8wekyb3d8bbwe\LocalState\plum.sqlite`

Overnote reads the SQLite file without modifying it. Only **note text** is imported, not Microsoft colors, screenshots, or reminders. The import handles ordinary SQLite B-tree pages; it may not include data still pending in the SQLite **WAL** (`plum.sqlite-wal`). Close Sticky Notes first and, if necessary, copy the database with its WAL to a separate folder and checkpoint it using an SQLite tool. The newer OneNote-integrated Windows Sticky Notes experience may not use this file and is not supported by this importer. The existing Overnote JSON, `.md` and `.txt` importers remain available.

## Export formats

Right-click any note: **Export shared JSON**, **Export Markdown (.md)**, or **Export PDF**. Markdown files preserve image data and Markdown syntax; PDFs are rendered offline from your note content. Locked notes must be unlocked to export them. Import accepts JSON shared-note files, `.md`, `.txt`, and classic `plum.sqlite` files. Full-workspace backups still use JSON for compatibility with previous releases.

## Updating from older Overnote builds

Exit the old app through its tray menu, extract the ZIP to a permanent directory, and launch the new `Overnote.exe`. Your original `%APPDATA%\sticky-notes` folder remains in place; Overnote copies the needed data on first launch to `%APPDATA%\Overnote`. Verify your notes, passwords and backup settings before removing any old installation. If the executable moves, toggle **Start with Windows** off and on to refresh its startup path.

## Key shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+T` | New note |
| `Ctrl+F` | Search all notes |
| `Ctrl+E` | Toggle editing and preview |
| `Ctrl+Shift+P` | Show or hide live Markdown preview |
| `Ctrl+B`, `Ctrl+I` | Bold or italicize selected text |
| `Ctrl+Shift+L` | Convert selected lines to checklist items |
| `Ctrl+Shift+R` | Create a reminder |
| `Ctrl+Shift+M` | Reminders calendar |
| `F2` | Rename a note |

## Tests

`npm test` runs the Electron main-process regression suite using stubs, so it does not require Windows. UI regression scripts in `tests/*_ui.py` additionally require Python, Playwright, and a Chromium executable (their default path is `/usr/bin/chromium`). Native Windows tray/notification behavior, startup, multi-monitor positions and alarm sound should also be checked manually on a Windows computer.

## License

This project is distributed under the [MIT License](LICENSE), copyright © 2026 whattherel. If you intended a different license, replace the LICENSE file before publishing.
