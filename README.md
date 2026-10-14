# Overnote

A lightweight-feeling Windows sticky-note app built with **Electron**, created by **whattherel**.

**GitHub:** https://github.com/Imwhattherel/Overnote

## What it does

- Create colored notes and organize them into collapsible, color-coded folders.
- Detach notes into independent windows, restore their size and monitor placement after restart, and pin selected pop-outs on top.
- Search text across all notes with `Ctrl+F`.
- Format notes with Markdown and interactive checklists (`Ctrl+Shift+L` converts selected lines).
- Create several reminders per note from highlighted text; browse them in a calendar. Important reminders open an audible alarm with snooze controls.
- Select an MP3, WAV or OGG file as the important-reminder alarm sound.
- Recover deleted notes from the 30-day trash, import/export selected notes as JSON, and schedule backups to a local folder, Discord webhook, or GitHub repository.
- Start with Windows and minimize to the tray.

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
| `assets/` | Application icons |
| `tests/` | Node regression tests and Chromium UI tests |
| `package.json`, `package-lock.json` | Build dependencies and metadata |

## Data location and privacy

To preserve compatibility with the earlier app, user data stays at **`%APPDATA%\sticky-notes`** (even though the app is named Overnote). Personal notes, folders, reminder times, preferences and backed-up workspaces are saved there, **not in this GitHub repository**. Credentials for Discord and GitHub backup integrations are saved separately in an encrypted local file when Windows encryption is available. Exported/shared notes and cloud backup JSON files are **not end-to-end encrypted**.

- **Never upload** `notes.json`, any `backup-credentials.enc`, private backups, alarm audio files, Discord webhook URLs, or GitHub personal access tokens to your public repository.
- A `backups/` folder inside a Git checkout is ignored, but check the files you choose to upload manually; `.gitignore` only protects Git operations, not drag-and-drop uploading in a web browser.
- The optional GitHub backup destination should use a **separate private repository**. This public repository is for the app's source code.
- Export only the notes you intend to share. Reminder details can be excluded when exporting.

## Updating from Sticky Notes or older Overnote builds

Completely exit the old app using its tray menu, replace the application files, and launch the new `Overnote.exe`. Existing notes remain in `%APPDATA%\sticky-notes`. If the executable moved, turn **Start with Windows** off and back on to update the startup path.

## Key shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+T` | New note |
| `Ctrl+F` | Search all notes |
| `Ctrl+E` | Toggle editing and preview |
| `Ctrl+Shift+L` | Convert selected lines to checklist items |
| `Ctrl+Shift+R` | Create a reminder |
| `Ctrl+Shift+M` | Reminders calendar |
| `F2` | Rename a note |

## Tests

`npm test` runs the Electron main-process regression suite using stubs, so it does not require Windows. UI regression scripts in `tests/*_ui.py` additionally require Python, Playwright, and a Chromium executable (their default path is `/usr/bin/chromium`). Native Windows tray/notification behavior, startup, multi-monitor positions and alarm sound should also be checked manually on a Windows computer.

## License

No open-source license has been selected yet. The source is shared for inspection, but redistribution and modification permissions are **not granted by default**. Add a license if you want others to reuse the code.
