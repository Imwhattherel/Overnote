# Overnote 2.0.1

A Windows desktop notes app with pop-out notes, a system tray icon, all-note search, and native reminders. In v2.0.1, closing an important alarm removes the associated reminder.

## Overnote 2.0.0 — branding update
The app is now called **Overnote** in its Windows executable, tray tooltip and menu, window title, notifications and documentation. Existing note data remains in `%APPDATA%\sticky-notes` **on purpose** to preserve previous notes, reminders, alarm sounds, trash, folders and cloud-backup credentials. Existing share and backup JSON formats are still accepted. New backups are named `overnote-…json`, while older `sticky-notes-…json` files remain valid and are still included in retention cleanup.

### New shortcuts and backup cleanup
- **Import directly from New Tab:** Click the small **▾** arrow next to **New tab**, then **Import notes…**. Click **New tab** itself (or press `Ctrl+T`) for a blank note, as before.
- **Import from right-click:** Right-click a note tab, folder heading, or blank sidebar area and choose **Import notes…**. The context menu works in popped-out note windows too. Imported notes have new IDs and will never overwrite your existing notes.
- **One local backup destination:** Settings now offers **Local folder**, **Discord webhook**, and **GitHub repository**. For local, select any folder — a normal directory or one synced by OneDrive, Google Drive, Dropbox, etc. Overnote also keeps a separate safety backup under `%APPDATA%\sticky-notes\backups`. A previously selected Google Drive synced directory is automatically retained as the new local destination.
- **Saved Discord and GitHub connections remain recognizable:** Password fields show placeholder dots when a credential is saved, plus a clear status for each provider. Credentials remain encrypted on Windows and aren't exposed to the renderer. Use **Forget** to clear a provider's saved credential.

If you previously enabled **Start with Windows**, open the new app and toggle this setting **off, then on** to register the new `Overnote.exe` path. Remove an obsolete old shortcut if Windows still opens the previous Sticky Notes executable at sign-in.

## Run the ready-made Windows version
1. Extract **Overnote-2.0.1-Windows.zip** into a permanent folder (for example `Documents\\Overnote`). Do **not** run the EXE while it is still inside the ZIP; it needs the other files in that folder.
2. Double-click **Overnote.exe**. Your notes are retained in `%APPDATA%\\sticky-notes\\notes.json` from previous versions.
3. Open the gear menu and check **Start with Windows**, or right-click the tray icon and check it. Keep the extracted folder at the same path afterward so Windows can find the EXE when you log in.

**When the app starts, including at Windows sign-in, it reopens every popped-out note at its last saved size and position on its own monitor.** Positions and the pop-out list are saved automatically. If a monitor is disconnected, notes appear on a connected monitor without overwriting their original monitor/position. They return when the monitor reconnects.

## Build an installer from source (optional)
1. Install Node.js LTS from https://nodejs.org.
2. In the **source** folder, double-click **Build App.bat**. This runs `npm install`, `npm run build`, and opens the installer.
3. The `dist` folder contains **Overnote-Setup.exe** and **Overnote-Portable.exe** once built.

The app is not code-signed, so Windows may display a SmartScreen warning. The source and included tests are available for inspection.

## Previous changes in 1.9.9 — trash, color, sharing, and backups
- **Recently Deleted:** Deleting a note sends its entire contents and reminders to **Settings → Recently deleted notes** for up to 30 days. Restore individual notes (they reopen docked in the main window), delete permanently, or empty trash. If you delete the last docked tab a blank replacement is created automatically. Folder deletion still moves notes to Unfiled and doesn't use the trash.
- **Note/folder colors:** Right-click a note's tab or the popped-out note's color dot for its paper color, and right-click any named folder heading for its heading/underline color. Each color persists across restarts and backups.
- **Share specific notes:** Use **Settings → Share notes → Choose notes to export** to select multiple tabs (including detached notes), or right-click any note and choose **Export this note**. A portable `.json` file preserves titles, text, paper colors, and folder names. Reminders are **excluded by default**; check **Include reminders** if desired. To import, choose **Import shared notes…**; imports create separate new note IDs, so the original notes are never overwritten. The recipient doesn't get your monitor positions or app settings. Never import files from untrusted senders.
- **Automatic local backups:** One backup is saved on startup when a day has elapsed since the previous backup; the running app checks periodically (every 30 minutes). You can also press **Save backup now** in Settings. Local backups are in `%APPDATA%\sticky-notes\backups`, retained for 30 days or up to 50 copies. These full-workspace backups contain folders, note text, trash, reminders, and window positions. Restore a downloaded/local backup with **Restore from backup…**; the app first writes a safety backup of the current workspace. Restoring a full backup REPLACES the current workspace (import shared notes to MERGE instead). Custom audio binaries are stored separately and are not included in JSON backups.
- **Optional backup destination:** In **Settings → Automatic backups**, choose **Local folder**, **Discord webhook**, or **GitHub repository**. For Discord/GitHub enable **Upload daily backups**, supply the connection info and save. A remote failure still leaves a local safety backup, and Settings displays the failure.
  - **Local folder:** The local setting can point to any existing folder, including one synced with Google Drive, OneDrive, or another provider. Clicking **Choose local folder…** selects it; it gets an extra backup copy while Overnote retains the safety copy in AppData. **Use default folder** resets to the built-in backup directory.
  - **Discord:** Create a webhook in a **private channel** and paste its complete URL. The app posts each daily backup JSON as a file attachment. Anyone with access to the channel can read the note contents. Discord may impose file-size and webhook-rate limits.
  - **GitHub:** Create a **private** repository, enter `owner/repository`, branch, optional destination directory, and a fine-grained personal access token limited to that repository with **Contents: Read and write**. Backups are committed as files. Keep the repository private and remember it has persistent history. GitHub may enforce API rate/size limits.
- **Saved connection indicators:** Both Discord and GitHub display their own saved/not-set status. After saving, the secret inputs stay visibly filled with masked dots instead of appearing empty; the underlying webhook/token remains encrypted in Windows credential storage. To replace a credential, select the dots and type a new value. Save again without changing the dots to keep the original; the **Forget** button removes only that provider’s secret. GitHub repository, branch, and directory are restored to their saved values.
- **Credentials:** Discord webhook URLs and GitHub tokens are saved in a separate Windows-encrypted file (not in note backups or exports), with **Forget** buttons in settings. Never use public Discord channels or public GitHub repositories for private notes. Remote restore is performed by first downloading a backup JSON file and then selecting **Restore from backup**; the app does not browse cloud backup history automatically.


## Overnote 2.0.1 — Reminder auto-delete on close
- **Close X:** Closing an important ringing reminder with the window X deletes only that reminder permanently (including its repeat schedule). It will not ring again.
- **Done:** Clicking Done on the ringing alarm now deletes its reminder rather than leaving a completed entry.
- **Snooze:** Snooze 10 minutes/1 hour still keeps the reminder for later. The Silence sound button only mutes audio.
- **Safety:** Quitting Overnote, automatically replacing an alarm, editing a reminder, and restoring a backup do not delete reminders. Other reminders on the same note are unaffected.
- **Regular Windows notifications:** Windows can expire notifications automatically, so merely dismissing a system notification does not delete its reminder. Delete these in the reminder panel or calendar.

## Previous changes in 1.9.8 — folders for your notes
- **Create folders:** In the main notes sidebar, click **＋ Folder**, type a name, and press Enter. Folder headings display the name with a line beneath it, a note count, and a ▾/▸ arrow showing whether they are expanded or collapsed.
- **Open/collapse:** Click any folder heading to expand/collapse its notes. The choice is saved, including for the **Unfiled** group.
- **Organize notes:** Drag a tab onto a folder heading, or right-click a tab and select **Move to: Folder name**. Tabs can still be dragged out of the main window to pop out; docking a pop-out back returns it to the same folder.
- **Edit folders:** Right-click a folder heading to rename it, create a note inside it, or delete it. Deleting a folder never deletes its notes: both docked and popped-out notes move into Unfiled.
- **Compatibility:** All notes from older versions automatically appear in **Unfiled**. Reminders, alarm sounds, existing pop-outs, monitor positions, the tray, and Windows startup behavior are preserved. Folder membership and expanded/collapsed status survive app restart.

## Previous changes in 1.9.7 — custom alarm sound
- **Choose a sound:** In the main window open **Settings (gear) → Important reminder alarm sound → Choose audio file…** and pick an MP3, WAV, or OGG file up to 15 MB. The chosen audio is copied to `%APPDATA%\sticky-notes`, so the original can be moved and the app can be upgraded without losing the choice.
- **Volume and testing:** The same settings section contains an **Alarm volume** slider (0–100%), a **Test sound** button that stops automatically after five seconds, and **Use default** to return to the built-in two-tone chime.
- **Automatic repeating:** Important alarms loop the chosen sound until Snoozed, Done, or Silenced. Ordinary reminders still show standard Windows notifications; they do not use your custom alarm. If the chosen file is unavailable or cannot play, the important reminder falls back to the original chime.
- **Backward compatible:** Existing notes, reminder priorities, pop-out window locations, and auto-start behavior carry over. No custom sound file is included in the download; choose one using Settings after extracting the app.

## Previous changes in 1.9.6 — responsive panels and attached alarms
- **Responsive calendar:** The calendar and reminders list now split into side-by-side panes when the note is wide but short. In smaller windows, the month view compresses and the agenda scrolls inside its own section without a double scrollbar. Controls and reminder forms also adapt to narrow notes.
- **Alarm over its note:** An important alarm now opens centered over the note that triggered it, including detached notes on another monitor. It is owned by that note's window and stays on top of it; if the note was hidden or minimized, it is made visible first.
- **Responsive alarm window:** The alarm itself adjusts spacing and buttons at narrow sizes.

## Previous changes in 1.9.5 — important alarms
- **Make a reminder Important:** Highlight text in a note and click **⏰ Remind me**, or click a reminder in the clock panel to edit it. Check **🔔 Important — ring alarm** and save. This setting is per reminder, not per tab; multiple reminders on a note can have different priority.
- **Alarm window with repeating sound:** When an important reminder is due, a separate topmost window opens and plays a repeating local chime, even when Overnote is hidden to the tray. Its title is the owning tab name and its description is the highlighted text. Normal reminders continue to use Windows notifications.
- **Snooze/Done:** Snooze for 10 minutes or 1 hour, or choose Done. The alarm stops and the existing reminder is snoozed/completed. Snoozed alarms retain their schedule, but Done permanently deletes the reminder in 2.0.1.
- **Silence without completing:** Press **Silence sound** to mute the current alarm while retaining its overdue status, or close the window to remove that reminder (changed in 2.0.1). You can also open the original note from the alarm.
- **Many important reminders:** Only one audible alarm opens at a time; others wait their turn.
- **Priority visible in the calendar and reminder panel:** Important reminders have an accented row and bell marker. Changing priority on an existing reminder works without creating a duplicate.
- **Preserves all notes and reminders:** Your existing v1.9.4 reminders default to normal priority and remain unchanged. Window layouts, pop-outs, automatic startup, calendar, highlighting, and individual reminder deletion still work.

**Important:** The alarm is built into Overnote, not connected to the Windows Clock / Timers app. It needs Overnote running and the PC's audio enabled. For best results, turn on **Start with Windows**. Native Windows behavior (especially audio when the device is locked, asleep, or using special audio settings) should be verified on your PC. When the PC wakes or the app next starts, overdue important reminders should be shown.

## Controls
- **Folders:** Click **＋ Folder** in the main sidebar. Use the ▾/▸ arrow to collapse or expand. Drag notes onto a folder header, or right-click a tab to move it. Right-click folder headers to rename/delete folders or add a note. Deleting a folder keeps all notes.
- **Tray:** Left-click to hide/show all notes; right-click for show, start-with-Windows, or quit. `Ctrl+Alt+N` toggles all windows.
- **Search:** `Ctrl+F` from any note searches note titles and text across every tab, folder, and pop-out.
- **Reminders:** Highlight text in a note and click ⏰ Remind me, or press `Ctrl+Shift+R`. The reminder automatically includes the tab name. Use the clock button to edit/delete individual reminders. Quick or custom times, daily/weekly repeat, snooze and done work for each reminder. The calendar shows reminders across all notes, with per-reminder delete buttons. Enable **Important — ring alarm** to get a repeated chime and a dedicated Snooze/Done alarm window. Windows notifications require the app to be running; start-with-Windows keeps it running after login.
- **Pop out / dock:** Drag a tab out of its folder away from the main note to detach it. Drag the top bar of the popped-out note onto the main note and release to dock it.
- **Monitors:** Drag individual pop-outs between displays. The gear menu's monitor selector moves only the main window, not the pop-outs. Each window retains its own monitor and placement.
- **Editing:** New tab: `Ctrl+T`; rename the tab: double-click the tab or press `F2`; toggle edit / formatted preview: double-click in the note or press `Ctrl+E`.

## Developers
Run `node tests/features.js` and `python tests/features_ui.py` to check the new share, trash, folder-color, restore, upload request shapes, and interface controls. Network requests to personal cloud accounts and actual Windows filesystem-sync must be tested on a Windows PC.

Run `npm test` to exercise startup, tray, search, reminders, drag-to-dock, independent monitor placement, monitor disconnect/reconnect, and persisted restart restoration using mocked Electron APIs. Highlight-based reminder creation, tab linking, editing, calendar item deletion, and sidebar-free pop-outs were also checked in Chromium. The alarm scheduler, alarm queue, important priority editing, and alarm-window controls are tested. Folder migration, creation, rename, deletion, sorting, and collapse persistence plus Chromium folder UI were tested. Native Windows sound and lock-screen behavior still needs to be verified on a real desktop.
