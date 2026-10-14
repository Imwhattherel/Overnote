const { app, BrowserWindow, ipcMain, screen, globalShortcut, Tray, Menu, nativeImage, shell, Notification, powerMonitor, dialog, safeStorage, session } = require('electron');
const path = require('path'), fs = require('fs');
const { randomUUID } = require('crypto');
const storage = require('./storage-tools'), security = require('./note-security'), formats = require('./note-formats'), winSticky=require('./sticky-import');
const idleLock = require('./idle-lock');
// Alarm sounds must start when an important reminder is due without a click.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Move user data to Overnote. Migrate only essential files once, never delete old data.
// Keep Chromium caches away from notes and backup folders to reduce clutter.
const legacyDir = path.join(app.getPath('appData'), 'sticky-notes');
const userDataDir = path.join(app.getPath('appData'), 'Overnote');
fs.mkdirSync(userDataDir, { recursive: true });
try { storage.migrateLegacy(legacyDir, userDataDir); } catch (err) { console.error('Legacy data migration failed:', err); }
app.setPath('userData', userDataDir);
try { const cacheDir=path.join(process.env.LOCALAPPDATA || app.getPath('appData'),'Overnote','Chromium'); fs.mkdirSync(cacheDir,{recursive:true}); app.setPath('sessionData',cacheDir); }catch{}
app.setAppUserModelId('com.stickynotes.app'); // preserve legacy notifications and shortcut identity
app.setAboutPanelOptions?.({ applicationName: 'Overnote', applicationVersion: app.getVersion?.(), copyright: 'whattherel' });
// images must load from outside the app.asar archive in the installed app
const asset = f => {
  const p = path.join(__dirname, 'assets', f), u = p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
  return fs.existsSync(u) ? u : p;
};
const ICON = asset('icon.png');
const TRAY_ICON = asset('icon.ico');

const file = path.join(app.getPath('userData'), 'notes.json');
const COLORS = ['#f6e27a', '#a8e6b8', '#f7b8c6', '#a9d4f5', '#cdb8f5', '#fbc48c'];
const validColor = c => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
const normColor = c => c.toLowerCase();
const defaults = {
  tabs: [{ id: 't1', title: 'Notes', text: '', color: COLORS[0], reminders: [] }],
  active: 't1',
  folders: [],
  trash: [],
  settings: { autoLockMinutes: 0, favoriteColors: [], livePreview: true, theme: 'light', checkUpdates: true, displayId: null, opacity: 0.96, fontSize: 15, font: 'clean', onTop: true, tabWidth: 120, sideTabs: true, alarmVolume: 0.75, alarmSoundName: '', alarmSoundExt: '', backupTarget: 'local', backupCloudEnabled: false, backupLocalFolder: '', backupDriveFolder: '', backupGithubRepo: '', backupGithubBranch: 'main', backupGithubDirectory: 'overnote-backups', lastBackupAt: null, backupStatus: '', main: { x: 40, y: 40, w: 440, h: 420 } }
};
let data = structuredClone(defaults);
try {
  const o = JSON.parse(fs.readFileSync(file, 'utf8'));
  data = { ...defaults, ...o, settings: { ...defaults.settings, ...o.settings } };
  // Folder migration: legacy tabs start in Unfiled, retaining all note data.
  const rawFolders = Array.isArray(data.folders) ? data.folders : [];
  const seenFolders = new Set();
  data.folders = rawFolders.filter(f => f && typeof f === 'object').map(f => ({
    id: String(f.id || ''), name: String(f.name || 'Untitled folder').trim().slice(0, 64) || 'Untitled folder',
    collapsed: !!f.collapsed, color: validColor(f.color) ? normColor(f.color) : null
  })).filter(f => f.id && !seenFolders.has(f.id) && seenFolders.add(f.id));
  data.trash = Array.isArray(data.trash) ? data.trash.filter(x => x && x.note && x.deletedAt && (Date.now() - Date.parse(x.deletedAt)) < 30 * 86400000).slice(-500) : [];
  const validFolderIds = new Set(data.folders.map(f => f.id));
  const s = data.settings;
  s.theme = s.theme === 'dark' ? 'dark' : 'light';
  s.autoLockMinutes = idleLock.normalizeMinutes(s.autoLockMinutes);
  s.favoriteColors = Array.isArray(s.favoriteColors) ? [...new Set(s.favoriteColors.filter(validColor).map(normColor))].slice(0, 12) : [];
  // Former Google Drive destination is now just a local folder. Preserve the
  // previously chosen synced path so existing scheduled backups keep working.
  if (s.backupTarget === 'drive') {
    s.backupLocalFolder ||= s.backupDriveFolder || '';
    s.backupTarget = 'local';
    s.backupCloudEnabled = false;
  }
  if (s.offset) { s.main = { x: s.offset.x, y: s.offset.y, w: s.size?.w || 340, h: s.size?.h || 400 }; delete s.offset; delete s.size; }
  data.tabs.forEach((t, i) => {
    t.color = validColor(t.color) ? normColor(t.color) : (validColor(s.color) ? normColor(s.color) : COLORS[i % COLORS.length]);
    t.pinned = t.pinned === true;
    if (t.vault) t.text = ''; // never load saved encrypted notes as plaintext
    t.folderId = validFolderIds.has(t.folderId) ? t.folderId : null;
    // Older versions stored a single reminder directly on the tab.
    // Copy it once into a collection, retaining its due/done/snooze state.
    if (!Array.isArray(t.reminders)) t.reminders = [];
    if (t.reminderAt && !t.reminders.some(r => r.legacy)) {
      t.reminders.push({ id: randomUUID(), text: (t.text || '').replace(/\s+/g, ' ').trim().slice(0, 500) || t.title || 'Reminder',
        at: t.reminderAt, repeat: t.reminderRepeat || 'none',
        snoozedUntil: t.reminderSnoozedUntil || null, dismissedAt: t.reminderDismissedAt || null,
        notifiedAt: t.notifiedAt || null, legacy: true });
    }
    for (const k of ['reminderAt', 'reminderRepeat', 'reminderSnoozedUntil', 'reminderDismissedAt', 'notifiedAt']) delete t[k];
    t.reminders = t.reminders.filter(r => r && r.at).map(r => ({ ...r, id: r.id || randomUUID(), text: String(r.text || t.title || 'Reminder').slice(0, 500) }));
  });
  delete s.color;
  if (!o.settings?.sideTabs) s.main.w += 100; // one-time: make room for the new side tab list
  s.sideTabs = true;
  if (!data.tabs.length) data.tabs = defaults.tabs;
} catch {}
// Alarm audio lives with notes in APPDATA so updating/replacing the app never
// loses a chosen file. Only validated extensions are accepted and no raw path
// is returned to a renderer.
const AUDIO_MIME = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg' };
const MAX_ALARM_BYTES = 15 * 1024 * 1024;
function audioPath(ext = data.settings.alarmSoundExt) {
  return AUDIO_MIME[ext] ? path.join(app.getPath('userData'), 'alarm-sound' + ext) : null;
}
function soundInfo() {
  const selected = audioPath(), available = !!(selected && fs.existsSync(selected));
  return { name: available ? String(data.settings.alarmSoundName || 'Custom sound') : '',
    custom: available, missing: !!data.settings.alarmSoundExt && !available,
    volume: Number.isFinite(+data.settings.alarmVolume) ? Math.max(0, Math.min(1, +data.settings.alarmVolume)) : 0.75 };
}
function alarmAudio() {
  const info = soundInfo(), selected = audioPath();
  if (info.custom) {
    try {
      const stat = fs.statSync(selected);
      if (stat.size > 0 && stat.size <= MAX_ALARM_BYTES)
        return { ...info, src: 'data:' + AUDIO_MIME[data.settings.alarmSoundExt] + ';base64,' + fs.readFileSync(selected).toString('base64') };
    } catch (error) { console.error('Could not load alarm sound:', error); }
  }
  return { ...info, src: null }; // built-in chime fallback
}
const noteKeys = new Map(); // in-memory only; keys are never written to disk
let lastUserActivity = Date.now();
function markUserActivity() { lastUserActivity = Date.now(); }
function relockAllNotes() {
  if (!noteKeys.size) return false;
  // Commit edits while the encryption keys are still in memory. Never persist plaintext.
  save();
  for (const id of noteKeys.keys()) { const n = note(id); if (n?.vault) n.text = ''; }
  noteKeys.clear();
  refreshAll();
  return true;
}
function checkIdleLock(now = Date.now()) {
  if (idleLock.shouldLock(data.settings.autoLockMinutes, now - lastUserActivity, noteKeys.size)) return relockAllNotes();
  return false;
}

const save = () => {
  // Atomic replacement means a crash cannot leave notes.json half-written.
  const tmp = file + '.new';
  const persisted = structuredClone(data);
  for (const t of persisted.tabs) { delete t.unlocked; if (t.vault) { t.text = ''; const k=noteKeys.get(t.id); if (k) { t.vault=security.seal(data.tabs.find(n=>n.id===t.id).text || '',k,Buffer.from(t.vault.salt,'base64')); data.tabs.find(n=>n.id===t.id).vault=t.vault; } } }
  for (const t of persisted.trash || []) if (t.note?.vault) t.note.text = '';
  fs.writeFileSync(tmp, JSON.stringify(persisted, null, 2));
  fs.renameSync(tmp, file);
};
const validFolder = id => id == null || data.folders.some(f => f.id === id);
const note = id => data.tabs.find(t => t.id === id);
for (const n of data.tabs) n.reminders ||= [];

const wins = new Map(); // 'main' or note id -> BrowserWindow
let quitting = false;
const pendingGeometry = new Set();
const geometryGuards = new Map();
function guardPosition(k) {
  clearTimeout(geometryGuards.get(k));
  geometryGuards.set(k, setTimeout(() => geometryGuards.delete(k), 500));
}
let reminderTimer = null;
let alarmWin = null, activeAlarm = null;
const silencedAlarms = new Set();
const boundsOf = k => (k === 'main' ? data.settings.main : note(k)?.bounds);
const refreshAll = () => wins.forEach(w => !w.isDestroyed() && w.webContents.send('refresh'));
// The main-window Stay on Top preference is independent from each popped-out note's pin.
const applyTop = w => {
  const key = windowKey(w);
  const pinned = key === 'main' ? !!data.settings.onTop : !!note(key)?.pinned;
  w.setAlwaysOnTop(pinned, 'floating');
  w.setVisibleOnAllWorkspaces(pinned, { visibleOnFullScreen: true });
};
const displayBounds = d => ({ x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height });
const matchingGeometry = (a, b) => a && b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

// Each window has its OWN saved monitor and position. An unplugged monitor falls back
// temporarily; do not overwrite the original placement just because it is unplugged.
function storedDisplay(b) {
  const all = screen.getAllDisplays();
  if (!all.length) return screen.getPrimaryDisplay();
  const byId = all.find(d => b?.displayId != null && String(d.id) === String(b.displayId));
  const byLabel = all.find(d => b?.displayLabel && d.label === b.displayLabel);
  const byGeometry = all.find(d => matchingGeometry(b?.displayBounds, d.bounds));
  if (byId && (!b?.displayBounds || matchingGeometry(b.displayBounds, byId.bounds) || !byGeometry)) return byId;
  return byLabel || byGeometry || byId || all.find(d => d.id === data.settings.displayId) || screen.getPrimaryDisplay();
}
function mainDisplay() { return storedDisplay(data.settings.main); }
function windowKey(win) { return [...wins].find(([, w]) => w === win)?.[0]; }
function saveBounds(k, b) {
  if (k === 'main') {
    data.settings.main = b;
    data.settings.displayId = b.displayId; // backward-compatible main-monitor preference
  } else {
    const n = note(k); if (n) n.bounds = b;
  }
}
function recordBounds(k) {
  const win = wins.get(k);
  if (!win || geometryGuards.has(k) || win.isDestroyed()) return;
  const r = win.getBounds(), cur = screen.getDisplayMatching(r), wa = cur.workArea;
  saveBounds(k, { x: r.x - wa.x, y: r.y - wa.y, w: r.width, h: r.height,
    displayId: cur.id, displayLabel: cur.label || '', displayBounds: displayBounds(cur) });
  pendingGeometry.delete(k);
  save();
}
function place(k) {
  const win = wins.get(k), b = boundsOf(k);
  if (!win || !b) return;
  const d = storedDisplay(b).workArea;
  guardPosition(k);
  const w = Math.max(200, Math.min(Number(b.w) || 340, d.width));
  const h = Math.max(150, Math.min(Number(b.h) || 400, d.height));
  const x = Number.isFinite(b.x) ? b.x : 30;
  const y = Number.isFinite(b.y) ? b.y : 30;
  win.setBounds({
    x: Math.round(Math.max(d.x, Math.min(d.x + x, d.x + d.width - w))),
    y: Math.round(Math.max(d.y, Math.min(d.y + y, d.y + d.height - h))),
    width: Math.round(w), height: Math.round(h)
  });
}
function placeAll() { wins.forEach((_, k) => { pendingGeometry.delete(k); place(k); }); }
function rememberPending() { for (const k of [...pendingGeometry]) recordBounds(k); }
function moveToDisplay(k, id) {
  const win = wins.get(k);
  const d = screen.getAllDisplays().find(d => String(d.id) === String(id));
  if (!win || !d) return false;
  const r = win.getBounds(), old = screen.getDisplayMatching(r).workArea;
  saveBounds(k, {
    x: r.x - old.x, y: r.y - old.y, w: r.width, h: r.height,
    displayId: d.id, displayLabel: d.label || '', displayBounds: displayBounds(d)
  });
  pendingGeometry.delete(k);
  save();
  place(k);
  refreshAll();
  return true;
}

function createWin(k) {
  const win = new BrowserWindow({
    width: 340, height: 400, minWidth: 200, minHeight: 150,
    frame: false, transparent: true, hasShadow: false, skipTaskbar: k !== 'main', icon: ICON, title: 'Overnote',
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  wins.set(k, win);
  win.loadFile('index.html', { query: { note: k === 'main' ? '' : k } });
  win.setOpacity(data.settings.opacity);
  place(k); applyTop(win);
  let t; const deb = () => {
    if (geometryGuards.has(k) || quitting) return;
    pendingGeometry.add(k); clearTimeout(t); t = setTimeout(() => recordBounds(k), 300);
  };
  win.on('moved', deb); win.on('resized', deb);
  win.on('session-end', rememberPending); // Windows logout / shutdown
  win.on('close', e => { if (k === 'main' && !quitting && tray) { e.preventDefault(); hideAll(); } });
  win.on('closed', () => {
    wins.delete(k); pendingGeometry.delete(k);
    if (k === 'main') return app.quit();
    const n = note(k);
    if (!quitting && n && n.popped) { n.popped = false; save(); refreshAll(); } // closing a pop-out docks it back
  });
}

function showAll() {
  wins.forEach(w => { if (w.isDestroyed()) return; if (w.isMinimized()) w.restore(); w.show(); });
  wins.get('main')?.focus();
}
function hideAll() { wins.forEach(w => { if (!w.isDestroyed()) w.hide(); }); }
function toggleAll() {
  const m = wins.get('main'); if (!m || m.isDestroyed()) return;
  if (m.isVisible() && !m.isMinimized()) hideAll(); else showAll();
}

// Electron creates a Windows startup entry for the installed or portable executable.
const loginPath = () => process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
function startupEnabled() {
  return app.getLoginItemSettings({ path: loginPath() }).openAtLogin;
}
function setStartup(enabled) {
  app.setLoginItemSettings({ openAtLogin: !!enabled, path: loginPath() });
  refreshTrayMenu();
  refreshAll();
  return startupEnabled();
}
let tray;
function refreshTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show / hide notes', click: toggleAll },
    { label: 'Show notes', click: showAll },
    { type: 'separator' },
    { label: 'Start with Windows', type: 'checkbox', checked: startupEnabled(),
      click: item => setStartup(item.checked) },
    { type: 'separator' },
    { label: 'Quit Overnote', click: () => app.quit() }
  ]));
}
function makeTray() {
  // This icon MUST be bundled at assets/icon.ico, not next to package.json.
  let icon = nativeImage.createFromPath(TRAY_ICON);
  if (icon.isEmpty()) icon = nativeImage.createFromPath(asset('tray.png')).resize({ width: 16, height: 16 });
  if (icon.isEmpty()) throw new Error('Tray icon missing: ' + TRAY_ICON);
  tray = new Tray(icon);
  tray.setToolTip('Overnote v' + app.getVersion() + ' — click to show or hide');
  tray.on('click', toggleAll);
  tray.on('double-click', showAll);
  refreshTrayMenu();
}

function focusNote(id, query = '') {
  const n = note(id); if (!n) return;
  const target = n.popped && wins.has(id) ? wins.get(id) : wins.get('main');
  if (!target) return;
  if (!n.popped) { data.active = id; save(); refreshAll(); }
  if (target.isMinimized()) target.restore();
  target.show(); target.focus();
  if (query) target.webContents.send('focus-match', { id, query });
}

// Each highlighted passage gets its own independently manageable reminder.
// Native notifications fire once per due occurrence; pending alerts survive a restart.
const REPEATS = new Set(['none', 'daily', 'weekly']);
const effectiveReminder = r => r.snoozedUntil || r.at;
const reminderDone = r => r.dismissedAt === r.at;
// Important reminders use a dedicated audible, always-on-top alarm window.
// Closing an alarm with X removes only that reminder, including repeat rules.
// Programmatic alarm replacement, note restore, and application exit must NOT
// discard reminders. Snooze preserves the reminder for its next due time.
const alarmKey = (noteId, r) => `${noteId}/${r.id}/${effectiveReminder(r)}`;
function closeAlarm() {
  const w = alarmWin;
  alarmWin = null; activeAlarm = null;
  if (w && !w.isDestroyed()) w.destroy();
}
function ensureImportantAlarm() {
  if (quitting) return;
  const now = Date.now();
  let current = null;
  if (activeAlarm) {
    const n = note(activeAlarm.noteId);
    const r = n?.reminders?.find(x => x.id === activeAlarm.reminderId);
    if (r?.important && !reminderDone(r) &&
        Number.isFinite(Date.parse(effectiveReminder(r))) &&
        Date.parse(effectiveReminder(r)) <= now &&
        alarmKey(n.id, r) === activeAlarm.key) current = activeAlarm;
  }
  if (current && alarmWin && !alarmWin.isDestroyed()) return;
  if (alarmWin) closeAlarm();
  const due = [];
  for (const n of data.tabs) for (const r of n.reminders || []) {
    if (!r.important || reminderDone(r)) continue;
    const time = Date.parse(effectiveReminder(r));
    if (!Number.isFinite(time) || time > now || silencedAlarms.has(alarmKey(n.id, r))) continue;
    due.push({ noteId: n.id, reminderId: r.id, key: alarmKey(n.id, r), at: time });
  }
  due.sort((a, b) => a.at - b.at);
  if (!due.length) return;
  activeAlarm = due[0];
  // Own the alarm by the note that triggered it. A parented window stays above
  // its note even when the note is also configured to be always-on-top.
  // For a docked tab the main note is its owner; for a pop-out use that window.
  const n = note(activeAlarm.noteId);
  const owner = n?.popped && wins.has(n.id) ? wins.get(n.id) : wins.get('main');
  if (owner && !owner.isDestroyed()) {
    if (owner.isMinimized()) owner.restore();
    owner.show();
    owner.focus();
  }
  const ownerBounds = owner && !owner.isDestroyed() ? owner.getBounds() : { x: 0, y: 0, width: 430, height: 350 };
  const area = screen.getDisplayMatching(ownerBounds).workArea;
  const width = Math.min(430, area.width - 16), height = Math.min(350, area.height - 16);
  const alarmX = Math.max(area.x + 8, Math.min(area.x + area.width - width - 8,
    Math.round(ownerBounds.x + ownerBounds.width / 2 - width / 2)));
  const alarmY = Math.max(area.y + 8, Math.min(area.y + area.height - height - 8,
    Math.round(ownerBounds.y + ownerBounds.height / 2 - height / 2)));
  const w = new BrowserWindow({
    ...(owner && !owner.isDestroyed() ? { parent: owner } : {}), modal: false,
    width, height, x: alarmX, y: alarmY, minWidth: 290, minHeight: 250,
    title: 'Important reminder · Overnote', icon: ICON,
    autoHideMenuBar: true, resizable: true, backgroundColor: '#fff8e8',
    webPreferences: { preload: path.join(__dirname, 'alarm-preload.js'), backgroundThrottling: false }
  });
  alarmWin = w;
  // Higher stacking priority than the notes' screen-saver level.
  w.setAlwaysOnTop(true, 'screen-saver', 1);
  w.loadFile('alarm.html');
  w.webContents.once('did-finish-load', () => {
    if (alarmWin !== w || w.isDestroyed()) return;
    const n = note(activeAlarm.noteId), r = n?.reminders?.find(x => x.id === activeAlarm.reminderId);
    if (n && r) w.webContents.send('alarm-detail', {
      noteTitle: n.title || 'Untitled note', text: r.text || 'Your reminder is due.',
      at: effectiveReminder(r)
    });
  });
  // An actual user X-close deletes this reminder. `destroy()` (used when
  // editing, restoring, snoozing, etc.) skips the close event, and quitting
  // must never silently remove reminders.
  let deleteOnClose = null;
  w.on('close', () => {
    if (!quitting && alarmWin === w && activeAlarm)
      deleteOnClose = { noteId: activeAlarm.noteId, reminderId: activeAlarm.reminderId };
  });
  w.on('closed', () => {
    if (alarmWin !== w) return;
    alarmWin = null; activeAlarm = null;
    if (deleteOnClose) {
      // The alarm is gone before the scheduler chooses the next one.
      reminderAction(deleteOnClose.noteId, deleteOnClose.reminderId, 'delete');
    } else {
      setImmediate(ensureImportantAlarm);
    }
  });
  w.show(); w.focus();
  w.moveTop();
}
function checkReminders() {
  clearTimeout(reminderTimer);
  const now = Date.now(); let next = Infinity, changed = false;
  for (const n of data.tabs) for (const r of n.reminders || []) {
    if (!r.at || reminderDone(r)) continue;
    const effective = effectiveReminder(r), at = Date.parse(effective);
    if (!Number.isFinite(at)) continue;
    if (at <= now && r.notifiedAt !== effective) {
      r.notifiedAt = effective; changed = true;
      try {
        if (Notification.isSupported()) {
          const alert = new Notification({
            title: 'Reminder · ' + (n.title || 'Untitled note'),
            body: r.text || 'Your reminder is due.', icon: ICON, silent: !!r.important
          });
          alert.on('click', () => focusNote(n.id, r.text || ''));
          alert.show();
        }
      } catch (err) { console.error('Notification error:', err); }
    } else if (at > now) next = Math.min(next, at);
  }
  if (changed) { save(); refreshAll(); }
  ensureImportantAlarm();
  reminderTimer = setTimeout(checkReminders, Number.isFinite(next) ? Math.min(30_000, Math.max(500, next - now)) : 30_000);
  reminderTimer.unref?.();
}
function setReminder(noteId, value, repeat = 'none', content = '', reminderId = null, important = false) {
  const n = note(noteId);
  if (!n) return { ok: false, error: 'Note not found.' };
  const at = new Date(value), snippet = String(content || '').trim().slice(0, 500);
  if (!Number.isFinite(at.getTime()) || at.getTime() <= Date.now()) return { ok: false, error: 'Choose a future date and time.' };
  if (!REPEATS.has(repeat)) return { ok: false, error: 'Invalid repeat option.' };
  if (!snippet) return { ok: false, error: 'Highlight note text or enter a reminder description.' };
  let r = reminderId ? (n.reminders || []).find(r => r.id === reminderId) : null;
  if (reminderId && !r) return { ok: false, error: 'This reminder no longer exists.' };
  if (!r) { r = { id: randomUUID() }; n.reminders.push(r); }
  Object.assign(r, { text: snippet, at: at.toISOString(), repeat, important: important === true,
    notifiedAt: null, dismissedAt: null, snoozedUntil: null });
  save(); checkReminders(); refreshAll();
  return { ok: true, id: r.id };
}
function reminderAction(noteId, reminderId, action, minutes) {
  const n = note(noteId);
  if (!n || !Array.isArray(n.reminders)) return false;
  const idx = n.reminders.findIndex(r => r.id === reminderId);
  if (idx < 0) return false;
  const r = n.reminders[idx];
  if (action === 'delete') {
    n.reminders.splice(idx, 1);
  } else if (action === 'snooze') {
    const duration = Number(minutes);
    if (![10, 60].includes(duration) || reminderDone(r) ||
      Date.parse(effectiveReminder(r)) > Date.now()) return false;
    r.snoozedUntil = new Date(Date.now() + duration * 60_000).toISOString();
    r.notifiedAt = null;
  } else if (action === 'dismiss') {
    if (reminderDone(r) || Date.parse(effectiveReminder(r)) > Date.now()) return false;
    if (r.repeat === 'daily' || r.repeat === 'weekly') {
      // Local calendar increments preserve requested wall-clock time across DST.
      const next = new Date(r.at), step = r.repeat === 'daily' ? 1 : 7;
      for (let i = 0; i < 100_000 && next.getTime() <= Date.now(); i++) next.setDate(next.getDate() + step);
      r.at = next.toISOString(); r.dismissedAt = null;
    } else r.dismissedAt = r.at;
    r.notifiedAt = null; r.snoozedUntil = null;
  } else return false;
  save(); checkReminders(); refreshAll();
  return true;
}

const lock = () => app.requestSingleInstanceLock({ version: app.getVersion() });
const gotLock = lock();
app.on('second-instance', (_e, _argv, _dir, extra) => {
  // a different version was launched: step aside so it can take over
  if (extra && extra.version && extra.version !== app.getVersion()) return app.quit();
  wins.forEach(w => { if (w.isMinimized()) w.restore(); w.show(); });
});

function start() {
  ensureDailyBackup().catch(e => console.error('Backup:', e.message));
  backupTimer = setInterval(() => ensureDailyBackup().catch(e => console.error('Backup:', e.message)), 30 * 60_000);
  backupTimer.unref?.();
  createWin('main');
  // Preserve all detached notes after logout/reboot, including legacy notes without bounds.
  data.tabs.filter(t => t.popped).forEach((t, i) => {
    if (!t.bounds) {
      const m = data.settings.main, d = mainDisplay();
      t.bounds = { x: m.x + 28 * (i + 1), y: m.y + 28 * (i + 1),
        w: 280, h: 300, displayId: d.id, displayLabel: d.label || '', displayBounds: displayBounds(d) };
      save();
    }
    createWin(t.id);
  });
  try { makeTray(); } catch (e) { fs.writeFileSync(path.join(app.getPath('userData'), 'tray-error.log'), String((e && e.stack) || e)); console.error('Tray initialization failed:', e); }
  globalShortcut.register('CommandOrControl+Alt+N', toggleAll);
  checkReminders();
  powerMonitor.on('resume', checkReminders);
  powerMonitor.on('unlock-screen', checkReminders);
  // Lock promptly on system lock/sleep if automatic locking is enabled.
  powerMonitor.on('lock-screen', () => { if (data.settings.autoLockMinutes) relockAllNotes(); });
  powerMonitor.on('suspend', () => { if (data.settings.autoLockMinutes) relockAllNotes(); });
  const idleLockTimer = setInterval(checkIdleLock, 1000);
  idleLockTimer.unref?.();
  app.once('will-quit', () => clearInterval(idleLockTimer));
  const onDisplays = () => { placeAll(); refreshAll(); };
  screen.on('display-added', onDisplays); screen.on('display-removed', onDisplays);
}
app.whenReady().then(() => {
  if (gotLock) return start();
  let tries = 0; // another copy is running; if it is an older version it quits and we take over
  const t = setInterval(() => {
    if (lock()) { clearInterval(t); start(); } else if (++tries > 20) { clearInterval(t); app.quit(); }
  }, 500);
});

let dragTimer, dockHover = false;
const mainDropTarget = point => {
  const m = wins.get('main');
  if (!m || m.isDestroyed() || !m.isVisible() || m.isMinimized()) return false;
  const r = m.getBounds();
  return point.x >= r.x + 10 && point.x < r.x + r.width - 10 &&
    point.y >= r.y + 10 && point.y < r.y + r.height - 10;
};
function setDockHover(hover) {
  if (dockHover === hover) return;
  dockHover = hover;
  wins.get('main')?.webContents.send('dock-hover', hover);
}
ipcMain.on('drag-start', e => {
  const win = BrowserWindow.fromWebContents(e.sender); if (!win) return;
  clearInterval(dragTimer);
  const key = windowKey(win);
  const c0 = screen.getCursorScreenPoint(), b0 = win.getBounds(); let n = 0;
  dragTimer = setInterval(() => {
    if (win.isDestroyed()) { clearInterval(dragTimer); setDockHover(false); return; }
    const c = screen.getCursorScreenPoint();
    win.setBounds({ x: b0.x + c.x - c0.x, y: b0.y + c.y - c0.y, width: b0.width, height: b0.height });
    if (key && key !== 'main') setDockHover(mainDropTarget(c));
    if (++n > 7500) { clearInterval(dragTimer); setDockHover(false); }
  }, 16);
});
function dockNote(id) {
  const n = note(id); if (!n || !n.popped) return;
  n.popped = false; data.active = id; save();
  const w = wins.get(id);
  if (w && !w.isDestroyed()) w.destroy();
  wins.delete(id);
  setDockHover(false);
  showAll(); refreshAll();
}
ipcMain.on('drag-end', e => {
  clearInterval(dragTimer);
  const win = BrowserWindow.fromWebContents(e.sender);
  const k = windowKey(win);
  const shouldDock = k && k !== 'main' && mainDropTarget(screen.getCursorScreenPoint());
  setDockHover(false);
  if (shouldDock) { dockNote(k); return; }
  if (k) setTimeout(() => recordBounds(k), 50);
});


// ---------- Trash, shareable notes, and optional automatic backups ----------
const backup = require('./backup-tools');
const backupsDir = path.join(app.getPath('userData'), 'backups');
const secretsFile = path.join(app.getPath('userData'), 'backup-credentials.enc');
let backupTimer = null, backupBusy = false;
function readSecrets() {
  try {
    if (!safeStorage?.isEncryptionAvailable?.() || !fs.existsSync(secretsFile)) return {};
    return JSON.parse(safeStorage.decryptString(fs.readFileSync(secretsFile)));
  } catch { return {}; }
}
function writeSecrets(value) {
  if (!safeStorage?.isEncryptionAvailable?.()) throw Error('Windows encrypted credential storage is unavailable. Cloud credentials cannot be saved.');
  const enc = safeStorage.encryptString(JSON.stringify(value));
  fs.writeFileSync(secretsFile, enc, {mode:0o600});
}
function backupSettings() {
  const s = data.settings, secrets = readSecrets();
  return { target: s.backupTarget || 'local', enabled: !!s.backupCloudEnabled,
    localFolder: s.backupLocalFolder || backupsDir, defaultLocalFolder: backupsDir,
    customLocalFolder: !!s.backupLocalFolder, githubRepo: s.backupGithubRepo || '',
    githubBranch: s.backupGithubBranch || 'main', githubDirectory: s.backupGithubDirectory || 'overnote-backups',
    hasDiscord: !!secrets.webhook, hasGithub: !!secrets.githubToken,
    lastAt: s.lastBackupAt || null, status: s.backupStatus || '',
    safetyBackupFolder: backupsDir, credentialStorageAvailable: !!safeStorage?.isEncryptionAvailable?.() };
}
async function makeBackup(remote = false) {
  if (backupBusy) return { ok: false, error: 'A backup is already in progress.' };
  backupBusy = true;
  try {
    fs.mkdirSync(backupsDir, { recursive: true });
    const filename = backup.newBackupName();
    save(); // refresh vault encryption before making an external backup
    const bytes = Buffer.from(JSON.stringify(backup.snapshot(data), null, 2), 'utf8');
    const destination = path.join(backupsDir, filename);
    fs.writeFileSync(destination + '.tmp', bytes);
    fs.renameSync(destination + '.tmp', destination);
    backup.pruneBackups(backupsDir);
    data.settings.lastBackupAt = new Date().toISOString();
    let message = 'Saved locally: ' + filename;
    // A user-selected folder may be inside OneDrive, Google Drive, Dropbox,
    // or any other sync service. Never rely on it as the only copy: always
    // write the internal app-data safety backup first.
    if (data.settings.backupTarget === 'local' && data.settings.backupLocalFolder &&
        path.resolve(data.settings.backupLocalFolder).toLowerCase() !== path.resolve(backupsDir).toLowerCase()) {
      try {
        const folder = data.settings.backupLocalFolder;
        if (!fs.statSync(folder).isDirectory()) throw Error('Not a folder.');
        const dest = path.join(folder, filename);
        fs.writeFileSync(dest + '.tmp', bytes);
        fs.renameSync(dest + '.tmp', dest);
        backup.pruneBackups(folder);
        message += ' · Copied to ' + folder;
      } catch (err) {
        message += ' · Extra local folder copy failed: ' + err.message;
        data.settings.backupStatus = message;
        save(); refreshAll();
        return { ok:false, localSaved:true, error:err.message, status:message };
      }
    }
    if (remote && data.settings.backupTarget !== 'local') {
      try {
        const uploaded = await backup.uploadBackup(data.settings, readSecrets(), filename, bytes);
        message += ' · ' + uploaded;
      } catch (err) {
        message += ' · Cloud upload failed: ' + err.message;
        data.settings.backupStatus = message;
        save(); refreshAll();
        return { ok: false, localSaved: true, error: err.message, status: message };
      }
    }
    data.settings.backupStatus = message; save(); refreshAll();
    return { ok: true, status: message, filename };
  } catch (e) { data.settings.backupStatus = 'Backup failed: ' + e.message; return {ok:false, error:e.message}; }
  finally { backupBusy = false; }
}
async function ensureDailyBackup() {
  const last = Date.parse(data.settings.lastBackupAt || '') || 0;
  if (Date.now() - last < 24 * 60 * 60_000) return;
  return makeBackup(!!data.settings.backupCloudEnabled);
}
ipcMain.handle('backup-settings', e => fromMain(e) ? backupSettings() : null);
ipcMain.handle('backup-configure', (e, input) => {
  if (!fromMain(e) || !input || typeof input !== 'object') return {ok:false, error:'Open settings in the main window.'};
  const s = data.settings;
  if (!['local','discord','github'].includes(input.target)) return {ok:false,error:'Invalid destination'};
  const repo = String(input.githubRepo || '').trim(), branch = String(input.githubBranch || 'main').trim();
  const dir = String(input.githubDirectory || 'overnote-backups').trim();
  if (repo && !/^[\w.-]+\/[\w.-]+$/.test(repo)) return {ok:false,error:'Use owner/repository for GitHub.'};
  if (!/^[\w./-]+$/.test(branch) || branch.includes('..') || !/^[\w./-]*$/.test(dir) || dir.includes('..')) return {ok:false,error:'Invalid GitHub branch or directory.'};
  try {
    const secrets = readSecrets();
    if (input.webhook) secrets.webhook = String(input.webhook).trim();
    if (input.githubToken) secrets.githubToken = String(input.githubToken).trim();
    if (input.clearSecret === 'discord') delete secrets.webhook;
    if (input.clearSecret === 'github') delete secrets.githubToken;
    const clearingActiveSecret = input.clearSecret === input.target;
    const candidate = { ...s, backupTarget:input.target,
      backupCloudEnabled:clearingActiveSecret ? false : !!input.enabled,
      backupGithubRepo:repo, backupGithubBranch:branch, backupGithubDirectory:dir };
    if (candidate.backupCloudEnabled && candidate.backupTarget !== 'local') backup.validateTarget(candidate, secrets);
    // Validate before changing encrypted credentials: a failed Save must not
    // overwrite a previously working Discord/GitHub connection.
    if (input.webhook || input.githubToken || input.clearSecret) writeSecrets(secrets);
    Object.assign(s, candidate); save(); return {ok:true, ...backupSettings()};
  } catch(err) { return {ok:false,error:err.message}; }
});
ipcMain.handle('backup-pick-local', async e => {
  if (!fromMain(e)) return {ok:false,error:'Open settings in the main window.'};
  const picked = await dialog.showOpenDialog(wins.get('main'), {title:'Choose local backup folder (can be synced by any cloud provider)', properties:['openDirectory']});
  if (picked.canceled || !picked.filePaths?.[0]) return {ok:false,canceled:true};
  try {
    const chosen=path.resolve(picked.filePaths[0]);
    if (!fs.statSync(chosen).isDirectory()) throw Error('Choose a directory.');
    data.settings.backupLocalFolder = chosen;
    data.settings.backupTarget = 'local';
    save(); return {ok:true, ...backupSettings()};
  } catch(err) {return {ok:false,error:err.message};}
});
ipcMain.handle('backup-reset-local', e => {
  if (!fromMain(e)) return {ok:false,error:'Open settings in the main window.'};
  data.settings.backupLocalFolder='';data.settings.backupTarget='local';save();
  return {ok:true,...backupSettings()};
});
ipcMain.handle('backup-now', e => fromMain(e) ? makeBackup(!!data.settings.backupCloudEnabled) : {ok:false,error:'Open settings in the main window.'});
ipcMain.handle('backup-open-folder', async e => {
  if (!fromMain(e)) return false;
  fs.mkdirSync(backupsDir, {recursive:true});
  const folder=data.settings.backupTarget === 'local' && data.settings.backupLocalFolder && fs.existsSync(data.settings.backupLocalFolder) ? data.settings.backupLocalFolder : backupsDir;
  await shell.openPath(folder); return true;
});
ipcMain.handle('notes-export', async (e, ids, withReminders) => {
  const owner = BrowserWindow.fromWebContents(e.sender);
  const ownNote = owner ? windowKey(owner) : null;
  if (!fromMain(e) && !(ownNote && ownNote !== 'main' && Array.isArray(ids) && ids.length === 1 && ids[0] === ownNote))
    return {ok:false,error:'Open the note you want to export.'};
  let output;
  try { if(ids.some(id=>note(id)?.vault&&!noteKeys.has(id)))throw Error('Unlock locked notes before sharing them.'); output = backup.exportNotes(data, ids, withReminders === true); }
  catch(err) { return {ok:false,error:err.message}; }
  const pick = await dialog.showSaveDialog(owner || wins.get('main'), {title:'Share selected notes',
    defaultPath:'Overnote-Shared.json', filters:[{name:'Overnote shared file', extensions:['json']}]});
  if (pick.canceled || !pick.filePath) return {ok:false,canceled:true};
  try { fs.writeFileSync(pick.filePath, JSON.stringify(output,null,2),{flag:'w'}); return {ok:true,count:output.notes.length}; }
  catch(err) { return {ok:false,error:err.message}; }
});
ipcMain.handle('notes-import', async e => {
  const owner = BrowserWindow.fromWebContents(e.sender);
  const key = owner ? windowKey(owner) : null;
  if (!key || (key !== 'main' && !note(key))) return {ok:false,error:'Open an Overnote window to import notes.'};
  const pick = await dialog.showOpenDialog(owner, {title:'Import shared notes',properties:['openFile'],filters:[{name:'Notes (JSON, MD, TXT or classic Sticky Notes)',extensions:['json','md','txt','sqlite']}]});
  if (pick.canceled || !pick.filePaths?.[0]) return {ok:false,canceled:true};
  try {
    const f = pick.filePaths[0];
    if (fs.statSync(f).size > (path.extname(f).toLowerCase()==='.sqlite'?60*1024*1024:backup.MAX_IMPORT_BYTES)) throw Error('Imported file is too large.');
    const ext=path.extname(f).toLowerCase();
    const notes = ext === '.json' ? backup.parseShared(JSON.parse(fs.readFileSync(f,'utf8'))) : (ext === '.sqlite' ? winSticky.readLegacy(f) : formats.textNotes(path.basename(f),fs.readFileSync(f,'utf8'))).map(n=>({...n,id:n.id||'t'+randomUUID(),pinned:false,color:COLORS[0],folder:'',preview:false,popped:false}));
    const beforeImport = await makeBackup(false);
    if (!beforeImport.ok) throw Error('Could not create safety backup: '+beforeImport.error);
    const needed = new Map();
    for (const n of notes) if (n.folder && !data.folders.some(folder => folder.name === n.folder)) needed.set(n.folder, true);
    for (const name of needed.keys()) data.folders.push({id:'f-'+randomUUID(),name,collapsed:false,color:null});
    for (const n of notes) {
      const folder=data.folders.find(f=>f.name===n.folder);
      n.folderId = folder?.id || null;
      if(folder)folder.collapsed=false;
      delete n.folder; data.tabs.push(n);
    }
    data.active = notes[0].id; data.unfiledCollapsed = false;
    save(); checkReminders(); refreshAll();
    // Imports made from a detached note still open the new note in the main window.
    if (key !== 'main') focusNote(notes[0].id);
    return {ok:true,count:notes.length};
  } catch(err) { return {ok:false,error:err.message}; }
});
ipcMain.handle('backup-restore', async e => {
  if (!fromMain(e)) return {ok:false,error:'Open the main window to restore a backup.'};
  const pick = await dialog.showOpenDialog(wins.get('main'), {title:'Restore full notes backup', properties:['openFile'],filters:[{name:'Overnote backup',extensions:['json']}]});
  if (pick.canceled || !pick.filePaths?.[0]) return {ok:false,canceled:true};
  try {
    const f = pick.filePaths[0];
    if (fs.statSync(f).size > backup.MAX_IMPORT_BYTES) throw Error('Backup is too large (15 MB limit).');
    const restored = backup.restoreSnapshot(JSON.parse(fs.readFileSync(f,'utf8')),data.settings);
    noteKeys.clear();
    // First save the current state; restore cannot destroy the only copy.
    const safety = await makeBackup(false);
    if (!safety.ok) throw Error('Could not save a safety backup before restore: ' + safety.error);
    closeAlarm();
    for (const [k, win] of wins) if (k !== 'main') { win.destroy(); wins.delete(k); }
    data = restored; for(const n of data.tabs)if(n.vault)n.text=''; save();
    data.tabs.filter(t=>t.popped).forEach(t=>createWin(t.id));
    place('main'); checkReminders(); refreshAll();
    return {ok:true,count:data.tabs.length,safetyFile:safety.filename};
  } catch(err) { return {ok:false,error:err.message}; }
});

ipcMain.on('user-activity', e => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w && wins.get(windowKey(w)) === w) markUserActivity();
});
ipcMain.handle('load', () => { for(const n of data.tabs) if(n.vault)n.unlocked=noteKeys.has(n.id);return data; });
// Lock/unlock are atomic: encrypted text is kept in the vault on disk.
ipcMain.handle('note-lock', (e, id, password) => {
  const n=note(id),caller=BrowserWindow.fromWebContents(e.sender),k=caller&&windowKey(caller);
  if(!n||!(k==='main'||k===id)||n.vault)return {ok:false,error:'Note cannot be locked.'};
  try { const secured=security.lockText(n.text||'',password); n.vault=secured.vault; n.text='';noteKeys.delete(id);save();refreshAll();return {ok:true}; }
  catch(err){return {ok:false,error:err.message};}
});
ipcMain.handle('note-unlock', (e,id,password) => {
  const n=note(id),caller=BrowserWindow.fromWebContents(e.sender),k=caller&&windowKey(caller);
  if(!n?.vault||!(k==='main'||k===id))return {ok:false,error:'Note not found.'};
  try{const decoded=security.unlockText(n.vault,password);noteKeys.set(id,decoded.key);n.text=decoded.text;markUserActivity();refreshAll();return {ok:true};}
  catch(err){return {ok:false,error:err.message};}
});
ipcMain.handle('note-relock', (e,id) => {const n=note(id);if(!n?.vault)return false;save();noteKeys.delete(id);n.text='';refreshAll();return true;});
ipcMain.handle('note-remove-lock', (e,id,password) => {
  const n=note(id);if(!n?.vault)return {ok:false,error:'Note is not locked.'};
  try{const decoded=security.unlockText(n.vault,password);n.text=decoded.text;delete n.vault;noteKeys.delete(id);save();refreshAll();return {ok:true};}
  catch(err){return {ok:false,error:err.message};}
});
// GitHub releases are checked on demand and optionally at startup, without a token.
ipcMain.handle('storage-clean', async e => {
  if(!fromMain(e))return {ok:false,error:'Open Settings in the main window.'};
  try { const removed=storage.cleanTransients(userDataDir);
    if(session?.defaultSession?.clearCache)await session.defaultSession.clearCache();
    return {ok:true,message:'Cleared temporary runtime files and Chromium cache. Notes, passwords, backups and alarms were kept. ('+removed.length+' stale log/temp files)'};
  }catch(err){return {ok:false,error:err.message};}
});
ipcMain.handle('version-check', async () => {
  const current=app.getVersion();
  try {const ctrl=new AbortController(),to=setTimeout(()=>ctrl.abort(),8000);
    let response;try {response=await fetch('https://api.github.com/repos/Imwhattherel/Overnote/releases/latest',{headers:{'Accept':'application/vnd.github+json','User-Agent':'Overnote-Updater'},signal:ctrl.signal});} finally{clearTimeout(to)}
    if(response.status===404)return {ok:false,current,error:'No published GitHub release found yet. Publish a release to enable update checks.'};
    if(!response.ok)throw Error('GitHub returned HTTP '+response.status);
    const r=await response.json();const cmp=formats.cmpVersion(r.tag_name,current);
    return {ok:true,current,latest:r.tag_name,available:cmp===1,url:r.html_url || 'https://github.com/Imwhattherel/Overnote/releases'};
  }catch(err){return {ok:false,current,error:'Could not check GitHub: '+err.message};}
});
// Export a single note as Markdown or PDF, rendering entirely offline.
ipcMain.handle('note-export-file', async (e,id,format) => {
  const n=note(id),win=BrowserWindow.fromWebContents(e.sender),owner=win&&windowKey(win);
  if(!n||!(owner==='main'||owner===id)||!['md','pdf'].includes(format))return {ok:false,error:'Invalid note or format.'};
  if(n.vault&&!noteKeys.has(id))return {ok:false,error:'Unlock this note before exporting it.'};
  const filename=n.title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,64)||'Note';
  const result=await dialog.showSaveDialog(win,{title:'Export note as '+format.toUpperCase(),defaultPath:filename+'.'+format,filters:[{name:format==='pdf'?'PDF document':'Markdown document',extensions:[format]}]});
  if(result.canceled||!result.filePath)return {ok:false,canceled:true};
  try {
    if(format==='md')fs.writeFileSync(result.filePath,n.text||'','utf8');
    else {
      const off=new BrowserWindow({show:false,webPreferences:{sandbox:true,nodeIntegration:false}});
      try { await off.loadURL('data:text/html;charset=utf-8;base64,'+Buffer.from(formats.pdfHtml(n.title,n.text||'')).toString('base64'));
        const pdf=await off.webContents.printToPDF({printBackground:true,pageSize:'A4'});fs.writeFileSync(result.filePath,pdf);
      } finally {off.destroy();}
    }
    return {ok:true};
  }catch(err){return {ok:false,error:err.message};}
});
ipcMain.handle('get-startup', startupEnabled);
ipcMain.handle('set-reminder', (_, id, at, repeat, content, reminderId, important) => setReminder(id, at, repeat, content, reminderId, important));
// Restrict alarm commands to the dedicated alarm window.
ipcMain.handle('alarm-action', (e, action, minutes) => {
  if (!alarmWin || e.sender !== alarmWin.webContents || !activeAlarm) return false;
  const { noteId, reminderId, key } = activeAlarm;
  if (action === 'open-note') { focusNote(noteId); return true; }
  if (action === 'silence') {
    silencedAlarms.add(key); closeAlarm(); ensureImportantAlarm(); return true;
  }
  if (!['dismiss', 'snooze'].includes(action)) return false;
  const actionWindow = alarmWin;
  // Done in the ringing alarm means remove the reminder, not keep a
  // completed item in the calendar. Snooze keeps it as before.
  const ok = reminderAction(noteId, reminderId, action === 'dismiss' ? 'delete' : action, minutes);
  // The scheduler may already have opened the next queued alarm. Never close it.
  if (ok) { if (alarmWin === actionWindow) closeAlarm(); checkReminders(); }
  return ok;
});
ipcMain.handle('reminder-action', (_, id, reminderId, action, minutes) => reminderAction(id, reminderId, action, minutes));
ipcMain.handle('current-display', e => {
  const w = BrowserWindow.fromWebContents(e.sender);
  return w ? screen.getDisplayMatching(w.getBounds()).id : mainDisplay().id;
});
ipcMain.handle('move-to-display', (e, id) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  return w ? moveToDisplay(windowKey(w), id) : false;
});
// Settings are editable only from the main notes window, never the alarm window.
function fromMain(e) { return !!(wins.get('main') && e.sender === wins.get('main').webContents); }
ipcMain.handle('get-alarm-sound-info', () => soundInfo());
ipcMain.handle('get-alarm-audio', () => alarmAudio());
ipcMain.handle('choose-alarm-sound', async e => {
  if (!fromMain(e)) return { ok: false, error: 'Open settings from the main window.' };
  const result = await dialog.showOpenDialog(wins.get('main'), {
    title: 'Choose important reminder alarm sound', properties: ['openFile'],
    filters: [{ name: 'Audio files (MP3, WAV, OGG)', extensions: ['mp3', 'wav', 'ogg'] }]
  });
  if (result.canceled || !result.filePaths?.length) return { ok: false, canceled: true, ...soundInfo() };
  const source = result.filePaths[0], ext = path.extname(source).toLowerCase();
  if (!AUDIO_MIME[ext]) return { ok: false, error: 'Choose an MP3, WAV, or OGG file.' };
  try {
    const stat = fs.statSync(source);
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_ALARM_BYTES)
      return { ok: false, error: 'Choose an audio file smaller than 15 MB.' };
    // Copy before changing settings; never rely on removable/original file paths.
    const previous = audioPath(), destination = audioPath(ext), temporary = destination + '.tmp';
    fs.copyFileSync(source, temporary);
    try { fs.renameSync(temporary, destination); } catch (err) { fs.rmSync(temporary, { force: true }); throw err; }
    data.settings.alarmSoundExt = ext;
    data.settings.alarmSoundName = path.basename(source).slice(0, 140);
    save();
    if (previous && previous !== destination) try { fs.rmSync(previous, { force: true }); } catch {}
    return { ok: true, ...soundInfo() };
  } catch (err) { console.error('Could not set alarm sound:', err); return { ok: false, error: 'Unable to import audio file: ' + err.message }; }
});
ipcMain.handle('reset-alarm-sound', e => {
  if (!fromMain(e)) return { ok: false, error: 'Open settings from the main window.' };
  const previous = audioPath();
  data.settings.alarmSoundExt = ''; data.settings.alarmSoundName = ''; save();
  if (previous) try { fs.rmSync(previous, { force: true }); } catch {}
  return { ok: true, ...soundInfo() };
});
ipcMain.handle('set-startup', (_, enabled) => setStartup(enabled));
ipcMain.handle('search-notes', (_, raw) => {
  const q = String(raw || '').trim().toLocaleLowerCase().slice(0, 180);
  if (!q) return [];
  return data.tabs.flatMap(n => {
    const title = String(n.title || ''), body = String(n.text || '');
    const pos = body.toLocaleLowerCase().indexOf(q);
    if (pos < 0 && !title.toLocaleLowerCase().includes(q)) return [];
    const begin = Math.max(0, pos - 48);
    const snippet = pos < 0 ? 'Matching note title' :
      (begin ? '…' : '') + body.slice(begin, pos + q.length + 85).replace(/\s+/g, ' ') +
      (pos + q.length + 85 < body.length ? '…' : '');
    return [{ id: n.id, title, snippet, popped: !!n.popped,
      count: (body.toLocaleLowerCase().split(q).length - 1) + (title.toLocaleLowerCase().includes(q) ? 1 : 0) }];
  });
});
ipcMain.handle('open-note', (_, id, query) => { focusNote(id, String(query || '').slice(0, 180)); });
ipcMain.handle('displays', () => screen.getAllDisplays().map((d, i) => ({
  id: d.id, label: `Monitor ${i + 1} (${d.bounds.width}×${d.bounds.height})${d.id === screen.getPrimaryDisplay().id ? ' – primary' : ''}`
})));
ipcMain.on('update', (_, id, p) => {
  const n = note(id); if (!n || !p || typeof p !== 'object') return;
  if (n.vault && !noteKeys.has(id)) return;
  if ('title' in p && typeof p.title === 'string') n.title = p.title.slice(0, 64);
  if ('text' in p && typeof p.text === 'string' && p.text.length <= 12_000_000) n.text = p.text;
  if ('color' in p && validColor(p.color)) n.color = normColor(p.color);
  if ('preview' in p) n.preview = !!p.preview;
  save();
});
// Favorite colors belong to the workspace and are available in all note windows.
ipcMain.handle('favorite-color', (_, color, add) => {
  if (!validColor(color)) return { ok: false, colors: data.settings.favoriteColors || [] };
  const c = normColor(color), list = Array.isArray(data.settings.favoriteColors) ? data.settings.favoriteColors : [];
  data.settings.favoriteColors = add ? [...new Set([...list, c])].slice(-12) : list.filter(x => x !== c);
  save(); refreshAll();
  return { ok: true, colors: data.settings.favoriteColors };
});
ipcMain.handle('pin-note', (e, id, pinned) => {
  const n = note(id), key = windowKey(BrowserWindow.fromWebContents(e.sender));
  if (!n || (key !== 'main' && key !== id)) return false;
  n.pinned = pinned === true;
  save();
  if (wins.has(id)) applyTop(wins.get(id));
  refreshAll();
  return n.pinned;
});
ipcMain.on('reorder', (_, ids) => {
  if (!Array.isArray(ids)) return;
  const by = new Map(data.tabs.map(t => [t.id, t]));
  data.tabs = [...ids.map(id => by.get(id)).filter(Boolean), ...data.tabs.filter(t => !ids.includes(t.id))];
  save();
});
// Folder headings are saved in notes.json; deleting one unfiles its notes,
// including detached notes (which retain their folder when docked again).
ipcMain.handle('create-folder', (e, name) => {
  if (!fromMain(e)) return null;
  name = String(name || '').trim().slice(0, 64);
  if (!name) return null;
  const folder = { id: 'f-' + randomUUID(), name, collapsed: false, color: null };
  data.folders.push(folder); save(); refreshAll();
  return folder;
});
ipcMain.handle('folder-color', (e, id, color) => {
  if (!fromMain(e) || !validColor(color)) return false;
  const f = data.folders.find(f => f.id === id); if (!f) return false;
  f.color = normColor(color); save(); refreshAll(); return true;
});
ipcMain.handle('rename-folder', (e, id, name) => {
  if (!fromMain(e)) return false;
  const folder = data.folders.find(f => f.id === id);
  name = String(name || '').trim().slice(0, 64);
  if (!folder || !name) return false;
  folder.name = name; save(); refreshAll(); return true;
});
ipcMain.handle('toggle-folder', (e, id) => {
  if (!fromMain(e)) return false;
  // null is the virtual Unfiled group, which can also collapse.
  if (id == null) data.unfiledCollapsed = !data.unfiledCollapsed;
  else {
    const folder = data.folders.find(f => f.id === id);
    if (!folder) return false;
    folder.collapsed = !folder.collapsed;
  }
  save(); refreshAll(); return true;
});
ipcMain.handle('delete-folder', (e, id) => {
  if (!fromMain(e)) return false;
  if (!data.folders.some(f => f.id === id)) return false;
  data.folders = data.folders.filter(f => f.id !== id);
  for (const n of data.tabs) if (n.folderId === id) n.folderId = null;
  save(); refreshAll(); return true;
});
ipcMain.handle('move-note', (e, id, folderId) => {
  if (!fromMain(e) || !validFolder(folderId)) return false;
  const n = note(id);
  if (!n) return false;
  n.folderId = folderId ?? null;
  save(); refreshAll(); return true;
});
ipcMain.handle('arrange-notes', (e, entries) => {
  if (!fromMain(e) || !Array.isArray(entries)) return false;
  const docked = data.tabs.filter(t => !t.popped);
  if (entries.length !== docked.length) return false;
  const by = new Map(docked.map(t => [t.id, t]));
  if (new Set(entries.map(x => x.id)).size !== docked.length ||
      entries.some(x => !by.has(x.id) || !validFolder(x.folderId))) return false;
  const ordered = entries.map(x => { const n = by.get(x.id); n.folderId = x.folderId ?? null; return n; });
  data.tabs = [...ordered, ...data.tabs.filter(t => t.popped)];
  save(); refreshAll(); return true;
});
ipcMain.on('open-link', (_, url) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); });
ipcMain.on('set-active', (_, id) => { if (note(id) && !note(id).popped) { data.active = id; save(); } });
ipcMain.handle('add-note', (e, folderId = null) => {
  if (!validFolder(folderId)) folderId = null;
  // Reveal new notes even when the destination group was collapsed.
  if (folderId == null) data.unfiledCollapsed = false;
  else data.folders.find(f => f.id === folderId).collapsed = false;
  const id = 't' + Date.now();
  data.tabs.push({ id, title: 'Note ' + (data.tabs.length + 1), text: '', color: COLORS[data.tabs.length % COLORS.length], folderId, reminders: [] });
  data.active = id; save(); return data;
});
ipcMain.handle('pop-out', (_, id, x, y) => {
  const n = note(id), m = data.settings.main;
  if (!n || n.popped || data.tabs.filter(t => !t.popped).length < 2) return;
  const k = wins.size;
  n.popped = true;
  if (Number.isFinite(x) && Number.isFinite(y)) { // remember the monitor on which the tab was released
    const d = screen.getDisplayNearestPoint({ x, y });
    const wa = d.workArea;
    n.bounds = { x: Math.round(x - wa.x - 140), y: Math.round(y - wa.y - 16), w: 280, h: 300,
      displayId: d.id, displayLabel: d.label || '', displayBounds: displayBounds(d) };
  } else if (!n.bounds) {
    const d = mainDisplay();
    n.bounds = { x: m.x + 36 + k * 26, y: m.y + 36 + k * 26, w: 280, h: 300,
      displayId: d.id, displayLabel: d.label || '', displayBounds: displayBounds(d) };
  }
  if (data.active === id) data.active = data.tabs.find(t => !t.popped).id;
  save(); createWin(id); refreshAll();
});
ipcMain.handle('dock', (_, id) => {
  const n = note(id); if (!n) return;
  dockNote(id);
});
ipcMain.handle('delete-note', (_, id) => {
  const n = note(id); if (!n) return false;
  data.trash ||= [];
  data.trash.push({ note: structuredClone(n), deletedAt: new Date().toISOString(), folderName: data.folders.find(f => f.id === n.folderId)?.name || '' });
  data.tabs = data.tabs.filter(t => t.id !== id);
  if (wins.has(id)) { wins.get(id).destroy(); wins.delete(id); }
  if (!data.tabs.some(t => !t.popped)) {
    const newId = 't' + randomUUID();
    data.tabs.push({ id: newId, title: 'Notes', text: '', color: COLORS[0], folderId: null, reminders: [] });
    data.active = newId;
  } else if (!note(data.active) || note(data.active).popped) data.active = data.tabs.find(t => !t.popped).id;
  data.trash = data.trash.filter(x => Date.now() - Date.parse(x.deletedAt) < 30 * 86400000).slice(-500);
  save(); checkReminders(); refreshAll(); return true;
});
ipcMain.handle('list-trash', e => fromMain(e) ? (data.trash = data.trash.filter(x => Date.now() - Date.parse(x.deletedAt) < 30*86400000)).map(x => ({ id: x.note.id, title: x.note.title, folderName: x.folderName, deletedAt: x.deletedAt })) : []);
ipcMain.handle('restore-trash', (e, id) => {
  if (!fromMain(e)) return false;
  const index = data.trash.findIndex(x => x.note.id === id); if (index < 0) return false;
  const entry = data.trash.splice(index, 1)[0], n = entry.note;
  if (note(n.id)) n.id = 't' + randomUUID();
  n.popped = false; // re-open safely in main tab; retain saved geometry for future pop-outs
  if (!validFolder(n.folderId)) n.folderId = null;
  data.tabs.push(n); data.active = n.id; data.unfiledCollapsed = false;
  if (n.folderId) data.folders.find(f => f.id === n.folderId).collapsed = false;
  save(); checkReminders(); refreshAll(); return true;
});
ipcMain.handle('purge-trash', (e, id) => {
  if (!fromMain(e)) return false;
  const len = data.trash.length;
  data.trash = id === 'ALL' ? [] : data.trash.filter(x => x.note.id !== id);
  if (len === data.trash.length) return false;
  save(); refreshAll(); return true;
});
ipcMain.on('set-setting', (e, k, v) => {
  if (!['displayId', 'opacity', 'onTop', 'font', 'fontSize', 'tabWidth', 'alarmVolume', 'livePreview','theme','checkUpdates','autoLockMinutes'].includes(k)) return;
  if (k === 'displayId') {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (w) moveToDisplay(windowKey(w), v);
    return;
  }
  if (k === 'theme') v = v === 'dark' ? 'dark' : 'light';
  if (k === 'checkUpdates') v = !!v;
  if (k === 'autoLockMinutes') { v = idleLock.normalizeMinutes(v); markUserActivity(); }
  if (k === 'alarmVolume') v = Math.max(0, Math.min(1, Number(v) || 0));
  data.settings[k] = v; save();
  if (k === 'opacity') wins.forEach(w => w.setOpacity(v));
  if (k === 'onTop') wins.forEach(applyTop);
  if (k === 'font' || k === 'fontSize' || k === 'tabWidth' || k === 'livePreview' || k === 'theme' || k === 'autoLockMinutes') refreshAll();
});
ipcMain.on('hide', hideAll);
ipcMain.on('quit', () => app.quit());
app.on('before-quit', () => { rememberPending(); quitting = true; });
// Windows can end a session without normal window-close events. Persist any pending moves.

app.on('will-quit', () => { clearTimeout(reminderTimer); clearInterval(backupTimer); clearInterval(dragTimer); globalShortcut.unregisterAll(); });
