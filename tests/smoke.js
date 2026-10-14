// Run with `npm test` — exercises the Electron main process with Windows API stubs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { EventEmitter } = require('node:events');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sticky-notes-test-'));
const handlers = new Map();
const ipc = new EventEmitter();
ipc.handle = (name, fn) => handlers.set(name, fn);
const call = (name, ...args) => handlers.get(name)({}, ...args);
const callFrom = (win, name, ...args) => handlers.get(name)({ sender: win.webContents }, ...args);
let cursor = { x: 100, y: 100 }, login = false, nextSoundDialog = null, nextSaveDialog = null;
const primary = { id: 1, label: 'Primary screen', workArea: { x: 0, y: 0, width: 1920, height: 1040 }, bounds: { x: 0, y: 0, width: 1920, height: 1080 } };
const secondary = { id: 2, label: 'Left screen', workArea: { x: -1280, y: 0, width: 1280, height: 984 }, bounds: { x: -1280, y: 0, width: 1280, height: 1024 } };
const screens = [primary, secondary];
const nearest = p => screens.find(d => p.x >= d.bounds.x && p.x < d.bounds.x + d.bounds.width && p.y >= d.bounds.y && p.y < d.bounds.y + d.bounds.height) || primary;
const paths = { appData: root, userData: root };
const app = Object.assign(new EventEmitter(), {
  setPath: (name, value) => { assert(fs.existsSync(value), 'app data directory must exist'); paths[name] = value; },
  getPath: name => paths[name] || root, setAppUserModelId: () => {},
  commandLine: { appendSwitch: () => {} },
  getVersion: () => '1.9.6', requestSingleInstanceLock: () => true,
  whenReady: () => Promise.resolve(), quit: () => {},
  getLoginItemSettings: () => ({ openAtLogin: login }),
  setLoginItemSettings: opts => (login = opts.openAtLogin)
});
class W extends EventEmitter {
  static all = [];
  constructor(opts = {}) {
    super(); this.options = opts; this.bounds = { x: opts.x ?? 0, y: opts.y ?? 0, width: opts.width ?? 440, height: opts.height ?? 420 };
    this.visible = true; this.destroyed = false; this.messages = [];
    this.webContents = Object.assign(new EventEmitter(), { win: this, send: (name, ...args) => this.messages.push([name, ...args]) });
    W.all.push(this);
  }
  static fromWebContents(wc) { return wc?.win; }
  loadFile(filename, options) { this.noteId = filename === 'alarm.html' ? 'alarm' : (options?.query?.note || 'main');
    if (this.noteId === 'alarm') process.nextTick(() => this.webContents.emit('did-finish-load')); }
  setOpacity() {} setAlwaysOnTop(value) { this.onTop=!!value; } setVisibleOnAllWorkspaces() {}
  setBounds(b) { this.bounds = { ...b }; }
  getBounds() { return this.bounds; }
  isDestroyed() { return this.destroyed; }
  isVisible() { return this.visible; }
  isMinimized() { return false; }
  hide() { this.visible = false; }
  show() { this.visible = true; }
  restore() {} focus() {} moveTop() { this.movedAbove = true; }
  destroy() { if (this.destroyed) return; this.destroyed = true; this.emit('closed'); }
  close() { this.emit('close'); this.destroy(); }
}
class Tray extends EventEmitter {
  static last;
  constructor(icon) { super(); Tray.last = this; assert.equal(icon.isEmpty(), false); }
  setToolTip() {} setContextMenu(m) { this.menu = m; } isDestroyed() { return false; }
}
class Notification extends EventEmitter {
  static delivered = [];
  static isSupported() { return true; }
  constructor(opts) { super(); this.options = opts; }
  show() { Notification.delivered.push(this); }
}
const screen = Object.assign(new EventEmitter(), {
  getAllDisplays: () => screens, getPrimaryDisplay: () => screens[0],
  getDisplayMatching: b => nearest({ x: b.x + b.width / 2, y: b.y + b.height / 2 }),
  getDisplayNearestPoint: nearest, getCursorScreenPoint: () => cursor
});
const electron = {
  app, BrowserWindow: W, Tray,
  Menu: { buildFromTemplate: items => items }, ipcMain: ipc, screen,
  globalShortcut: { register: () => true, unregisterAll: () => {} },
  nativeImage: { createFromPath: loc => ({ isEmpty: () => !fs.existsSync(loc), resize() { return this; } }) },
  shell: { openExternal: () => {}, openPath: async () => '' }, Notification, powerMonitor: new EventEmitter(),
  safeStorage: { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString() },
  dialog: { showOpenDialog: async () => nextSoundDialog || { canceled: true, filePaths: [] }, showSaveDialog: async () => nextSaveDialog || {canceled: true} }
};
const orig = Module._load;
Module._load = function(name, parent, main) { return name === 'electron' ? electron : orig.apply(this, arguments); };
// Seed a v1.9.3 file to test that a preexisting reminder is preserved.
const oldAt = new Date(Date.now() + 86_400_000).toISOString();
fs.mkdirSync(path.join(root, 'sticky-notes'), {recursive:true});
const legacySyncedFolder=path.join(root, 'legacy-synced-folder');
fs.mkdirSync(legacySyncedFolder,{recursive:true});
fs.writeFileSync(path.join(root, 'sticky-notes', 'notes.json'), JSON.stringify({
  active:'t1', settings:{sideTabs:true, backupTarget:'drive',backupDriveFolder:legacySyncedFolder,backupCloudEnabled:true, main:{x:30,y:30,w:440,h:420}},
  tabs:[{id:'t1',title:'Old Notes',text:'Legacy reminder text',color:'#f6e27a',
    reminderAt:oldAt, reminderRepeat:'none', reminderSnoozedUntil:null,
    reminderDismissedAt:null,notifiedAt:null}]
}));
(async () => {
  try {
    require('../main.js'); await new Promise(resolve => setImmediate(resolve));
    assert(Tray.last, 'tray must exist with valid asset');
    // An imported alarm is copied to userData, survives upgrades, and keeps
    // its volume. A missing/corrupt source falls back to the default chime.
    const audioSource = path.join(root, 'custom-test.wav');
    const sampleSound = Buffer.from('RIFF1234WAVEfmt ' + 'sample data');
    fs.writeFileSync(audioSource, sampleSound);
    const soundWindow = W.all.find(w => w.noteId === 'main');
    assert.equal(call('get-alarm-sound-info').custom, false, 'default alarm is built in');
    nextSoundDialog = { canceled: false, filePaths: [audioSource] };
    const chosen = await callFrom(soundWindow, 'choose-alarm-sound');
    assert(chosen.ok && chosen.custom && chosen.name === 'custom-test.wav', 'audio picker saves chosen filename');
    assert.equal(fs.existsSync(path.join(root, 'Overnote', 'alarm-sound.wav')), true, 'selected file copied to app data');
    fs.rmSync(audioSource);
    let chosenAudio = call('get-alarm-audio');
    assert(chosenAudio.src.startsWith('data:audio/wav;base64,'), 'audio delivered to ringing window');
    assert.deepEqual(Buffer.from(chosenAudio.src.split(',')[1], 'base64'), sampleSound, 'selected audio survives source deletion');
    ipc.emit('set-setting', { sender: soundWindow.webContents }, 'alarmVolume', 0.35);
    assert.equal(call('get-alarm-audio').volume, .35, 'stored alarm volume');
    const denied = await callFrom({ webContents: {} }, 'choose-alarm-sound');
    assert.equal(denied.ok, false, 'other windows cannot change the sound');

    const main = W.all.find(w => w.noteId === 'main');
    Tray.last.emit('click'); assert.equal(main.visible, false, 'tray hides windows');
    Tray.last.emit('click'); assert.equal(main.visible, true, 'tray reopens windows');
    assert.equal(call('set-startup', true), true, 'start on login');
    assert.equal(call('get-startup'), true);
    const migrated = call('load').tabs[0];
    assert.equal(migrated.reminders.length, 1, 'older saved note reminder is migrated');
    assert.equal(migrated.reminders[0].at, oldAt, 'migration preserves due date');
    assert.equal(migrated.reminders[0].text, 'Legacy reminder text', 'migration keeps reminder text');
    const original = migrated.id;
    assert.deepEqual(call('load').folders, [], 'existing installations start with no custom folders');
    assert.equal(call('load').tabs[0].folderId, null, 'older notes migrate to Unfiled');
    const mainWindow = W.all.find(w => w.noteId === 'main');
    assert.equal(call('create-folder', 'Not authorized'), null, 'folder management blocked from other windows');
    const work = callFrom(mainWindow, 'create-folder', 'Work');
    const personal = callFrom(mainWindow, 'create-folder', 'Personal');
    assert(work?.id && personal?.id && work.id !== personal.id, 'distinct folders created');
    assert.equal(callFrom(mainWindow, 'rename-folder', work.id, 'Work projects'), true, 'rename folder');
    assert.equal(callFrom(mainWindow, 'toggle-folder', work.id), true, 'collapse folder');
    assert(call('load').folders.find(f => f.id === work.id).collapsed, 'folder collapsed state saved');
    assert.equal(callFrom(mainWindow, 'move-note', original, work.id), true);
    assert.equal(callFrom(mainWindow, 'move-note', original, 'missing-id'), false, 'invalid folders rejected');
    assert.equal(call('load').tabs.find(t => t.id === original).folderId, work.id, 'folder ownership persisted');
    const second = call('add-note', personal.id).active;
    assert.equal(call('load').tabs.find(t => t.id === second).folderId, personal.id, 'new note can start in a selected folder');
    assert.equal(callFrom(mainWindow, 'arrange-notes', [{id: second, folderId: work.id}, {id: original, folderId: personal.id}]), true,
      'reorder and move by dragging between groups');
    assert.equal(call('load').tabs.find(t => t.id === second).folderId, work.id);
    assert.equal(callFrom(mainWindow, 'move-note', original, work.id), true);
    assert.equal(callFrom(mainWindow, 'delete-folder', personal.id), true, 'remove empty folder');
    assert.equal(call('load').tabs.find(t => t.id === original).folderId, work.id, 'removing a folder does not delete notes');

    ipc.emit('update', {}, original, { text: 'milk from another tab', title: 'Groceries' });
    ipc.emit('update', {}, second, { text: 'appointment on Friday' });
    const results = call('search-notes', 'MILK');
    assert.equal(results.length, 1, 'search all tabs');
    assert.equal(results[0].id, original);
    call('pop-out', original);
    assert.equal(call('load').tabs.find(t => t.id === original).folderId, work.id, 'pop-out retains its folder');
    assert.equal(call('search-notes', 'milk')[0].popped, true, 'search popped tab');
    const popup = W.all.find(w => w.noteId === original);
    assert(popup && !popup.isDestroyed());
    cursor = { x: main.bounds.x + 150, y: main.bounds.y + 100 };
    ipc.emit('drag-start', { sender: popup.webContents });
    ipc.emit('drag-end', { sender: popup.webContents });
    assert.equal(call('load').tabs.find(t => t.id === original).popped, false, 'dragging onto main docks note');
    assert.equal(popup.isDestroyed(), true);
    assert.equal(call('load').tabs.find(t=>t.id===original).folderId, work.id, 'docking returns note to its original folder');
    const past = new Date(Date.now() - 1000).toISOString();
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    assert.equal(call('set-reminder', second, 'broken', 'daily', 'appointment').ok, false);
    assert.equal(call('set-reminder', second, past, 'daily', 'appointment').ok, false);
    assert.equal(call('set-reminder', second, tomorrow, 'none', '').ok, false, 'passage is required');
    const first = call('set-reminder', second, tomorrow, 'none', 'appointment on Friday');
    const secondReminder = call('set-reminder', second, tomorrow, 'weekly', 'Call the dentist');
    assert(first.ok && secondReminder.ok && first.id !== secondReminder.id, 'multiple reminders per note');
    let reminders = call('load').tabs.find(t => t.id === second).reminders;
    assert.equal(reminders.length, 2, 'independent reminders saved');
    assert.equal(reminders[1].repeat, 'weekly');
    // Set one occurrence overdue via the live test fixture and trigger a check.
    reminders[0].at = past;
    assert(call('set-reminder', second, tomorrow, 'none', 'Trigger check').ok);
    assert.equal(Notification.delivered.length, 1, 'one due occurrence sends a native notification');
    assert.equal(Notification.delivered[0].options.title, 'Reminder · Note 2', 'notification automatically uses tab name');
    assert.equal(Notification.delivered[0].options.body, 'appointment on Friday', 'notification shows selected text');
    assert.equal(reminders[0].notifiedAt, past, 'notified state persists');
    assert.equal(call('reminder-action', second, first.id, 'snooze', 10), true, 'snooze this reminder');
    assert(Date.parse(reminders[0].snoozedUntil) > Date.now());
    assert.equal(call('reminder-action', second, first.id, 'snooze', 10), false, 'cannot snooze upcoming reminder');
    assert.equal(call('reminder-action', second, first.id, 'delete'), true, 'delete this reminder');
    assert.equal(call('load').tabs.find(t => t.id === second).reminders.length, 2, 'other reminders remain untouched');
    assert.equal(call('reminder-action', second, first.id, 'delete'), false, 'cannot delete same reminder twice');
    const weekly = reminders.find(r => r.id === secondReminder.id);
    weekly.at = past;
    assert.equal(call('reminder-action', second, secondReminder.id, 'dismiss'), true, 'dismiss overdue weekly reminder');
    assert(Date.parse(weekly.at) > Date.now(), 'recurring reminder advances to next week');
    assert.equal(weekly.repeat, 'weekly');
    assert.equal(call('reminder-action', second, secondReminder.id, 'delete'), true);
    assert.equal(call('load').tabs.find(t => t.id === second).reminders.length, 1, 'only triggered test reminder remains');
    const editTarget = call('load').tabs.find(t => t.id === second).reminders[0];
    assert.equal(call('set-reminder', second, tomorrow, 'daily', 'Updated selected passage', editTarget.id).ok, true);
    assert.equal(editTarget.text, 'Updated selected passage', 'reminder can be edited without duplication');
    assert.equal(call('load').tabs.find(t => t.id === second).reminders.length, 1);
    editTarget.at = past;
    assert.equal(call('reminder-action', second, editTarget.id, 'dismiss'), true);
    assert(Date.parse(editTarget.at) > Date.now(), 'daily repeat advances');
    assert.equal(call('reminder-action', second, editTarget.id, 'delete'), true);
    const done = call('set-reminder', second, tomorrow, 'none', 'One time task');
    const doneRem = call('load').tabs.find(t => t.id === second).reminders.find(r => r.id === done.id);
    doneRem.at = past;
    assert.equal(call('reminder-action', second, done.id, 'dismiss'), true);
    assert.equal(doneRem.dismissedAt, past, 'one-time completed state persists');
    assert.equal(call('reminder-action', second, done.id, 'dismiss'), false);
    // Important reminders ring in a standalone window and queue when several are due.
    const urgent1 = call('set-reminder', second, tomorrow, 'none', 'URGENT pay taxes', null, true);
    const urgent2 = call('set-reminder', second, tomorrow, 'none', 'URGENT send invoice', null, true);
    assert(urgent1.ok && urgent2.ok);
    const u1 = call('load').tabs.find(t => t.id === second).reminders.find(r=>r.id===urgent1.id);
    const u2 = call('load').tabs.find(t => t.id === second).reminders.find(r=>r.id===urgent2.id);
    assert.equal(u1.important, true); assert.equal(u2.important, true);
    u1.at = past; u2.at = past;
    call('set-reminder', second, tomorrow, 'none', 'Force alarm scan');
    const firstAlarm = W.all.filter(w=>w.noteId==='alarm').at(-1);
    assert(firstAlarm && !firstAlarm.isDestroyed(), 'an important due reminder opens a dedicated alarm window');
    assert.equal(firstAlarm.options.parent, main, 'alarm is an owned popup centered above the main note');
    assert.equal(firstAlarm.movedAbove, true, 'alarm raised over its owning note');
    assert(firstAlarm.bounds.x >= 0 && firstAlarm.bounds.y >= 0, 'alarm is on main note display');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(firstAlarm.messages.find(e=>e[0]==='alarm-detail')?.[1]?.text, 'URGENT pay taxes');
    assert.equal(callFrom(firstAlarm, 'alarm-action', 'snooze', 10), true, 'alarm snooze');
    assert(firstAlarm.isDestroyed(), 'snoozed alarm closes');
    assert(Date.parse(u1.snoozedUntil)>Date.now());
    const nextAlarm = W.all.filter(w=>w.noteId==='alarm').at(-1);
    assert(nextAlarm && nextAlarm!==firstAlarm && !nextAlarm.isDestroyed(), 'next important alarm queued');
    assert.equal(callFrom(nextAlarm, 'alarm-action','dismiss'), true);
    assert(nextAlarm.isDestroyed(), 'completed alarm closes');
    assert.equal(call('load').tabs.find(t=>t.id===second).reminders.some(r=>r.id===urgent2.id), false,
      'Done deletes just the active alarm reminder');
    assert.equal(call('reminder-action', second, urgent1.id, 'delete'), true);
    assert.equal(call('reminder-action', second, urgent2.id, 'delete'), false, 'Done deletion persists');
    const silenced = call('set-reminder', second, tomorrow, 'none', 'Important close test', null, true);
    const sr = call('load').tabs.find(t=>t.id===second).reminders.find(r=>r.id===silenced.id);
    sr.at = past; call('set-reminder', second, tomorrow, 'none', 'Scan again');
    const silentAlarm = W.all.filter(w=>w.noteId==='alarm').at(-1);
    silentAlarm.close();
    assert.equal(call('load').tabs.find(t=>t.id===second).reminders.some(r=>r.id===silenced.id), false,
      'X closes alarm and deletes its reminder');
    assert.equal(JSON.parse(fs.readFileSync(path.join(root,'Overnote','notes.json'))).tabs.find(t=>t.id===second).reminders.some(r=>r.id===silenced.id), false,
      'X deletion is immediately persisted to disk');
    call('set-reminder', second, tomorrow, 'none', 'Another scan');
    assert.equal(W.all.filter(w=>w.noteId==='alarm' && !w.isDestroyed()).length,0, 'deleted alarm never reopens');
    assert.equal(call('reminder-action', second, silenced.id, 'delete'), false);
    // Closing one of two due alarms must delete only that one, then show the next.
    const closeA = call('set-reminder', second, tomorrow, 'none', 'X close one', null, true);
    const closeB = call('set-reminder', second, tomorrow, 'weekly', 'Next after X', null, true);
    const closeReminders = call('load').tabs.find(t => t.id === second).reminders;
    closeReminders.find(r => r.id === closeA.id).at = past;
    closeReminders.find(r => r.id === closeB.id).at = past;
    call('set-reminder', second, tomorrow, 'none', 'Trigger queued X alarms');
    const closedAlarm = W.all.filter(w => w.noteId === 'alarm').at(-1);
    closedAlarm.close();
    assert(!closeReminders.some(r=>r.id===closeA.id), 'X deletes only the selected alarm');
    assert(closeReminders.some(r=>r.id===closeB.id), 'X does not remove queued alarms');
    const queuedAlarm = W.all.filter(w=>w.noteId==='alarm').at(-1);
    assert(queuedAlarm && queuedAlarm !== closedAlarm && !queuedAlarm.isDestroyed(), 'closing X shows next waiting alarm');
    assert.equal(callFrom(queuedAlarm, 'alarm-action', 'dismiss'), true);
    assert(!closeReminders.some(r=>r.id===closeB.id), 'Done removes recurring reminder and its repeat schedule');
    // Rescheduling a ringing reminder is a programmatic window destruction,
    // not a user X close, so it must keep the reminder.
    const rescheduled = call('set-reminder', second, tomorrow, 'none', 'Reschedule me', null, true);
    closeReminders.find(r=>r.id===rescheduled.id).at = past;
    call('set-reminder', second, tomorrow, 'none', 'Trigger reschedule');
    const replacedAlarm = W.all.filter(w=>w.noteId==='alarm').at(-1);
    assert(replacedAlarm && !replacedAlarm.isDestroyed());
    assert.equal(call('set-reminder', second, tomorrow, 'none', 'Future alarm', rescheduled.id, true).ok, true);
    assert(replacedAlarm.isDestroyed(), 'editing the due reminder closes old alarm automatically');
    assert(closeReminders.some(r=>r.id===rescheduled.id), 'automatic close never deletes reminder');
    assert.equal(call('reminder-action', second, rescheduled.id, 'delete'), true);
    const editImportant = call('set-reminder', second, tomorrow, 'none', 'Important new', null, true);
    assert.equal(call('set-reminder', second, tomorrow, 'none', 'Downgraded', editImportant.id, false).ok, true);
    assert.equal(call('load').tabs.find(t=>t.id===second).reminders.find(r=>r.id===editImportant.id).important, false);
    assert.equal(call('reminder-action', second, editImportant.id, 'delete'), true);
    // Re-pop the note and move it to the OTHER monitor. Moving it must not move the main window.
    call('pop-out', original);
    const detached = W.all.filter(w => w.noteId === original).at(-1);
    const mainBefore = { ...main.getBounds() };
    assert.equal(callFrom(detached, 'move-to-display', 2), true);
    assert(detached.bounds.x < 0, 'pop-out moves to left monitor');
    assert.deepEqual(main.getBounds(), mainBefore, 'moving pop-out does not pull the main window along');
    // Alarms from popped notes must be owned by THAT popup and appear on its display.
    const detachedAlarmData = call('set-reminder', original, tomorrow, 'none', 'Urgent popped note', null, true);
    const detachedReminder = call('load').tabs.find(t=>t.id===original).reminders.find(r=>r.id===detachedAlarmData.id);
    detachedReminder.at = past;
    detached.hide();
    call('set-reminder', original, tomorrow, 'none', 'Trigger popped note alarm');
    const detachedAlarm = W.all.filter(w=>w.noteId==='alarm' && !w.isDestroyed()).at(-1);
    assert(detachedAlarm, 'detached note alarm launched');
    assert.equal(detachedAlarm.options.parent, detached, 'pop-out owns its important alarm');
    assert.equal(detached.isVisible(), true, 'hidden note becomes visible behind alarm');
    assert(detachedAlarm.bounds.x < 0, 'alarm follows pop-out onto second monitor');
    assert(detachedAlarm.bounds.x >= -1280, 'alarm is clamped to the secondary display');
    assert.equal(callFrom(detachedAlarm, 'alarm-action', 'dismiss'), true);
    assert.equal(call('reminder-action', original, detachedAlarmData.id, 'delete'), false, 'Done already removed popped note alarm');
    await new Promise(resolve => setTimeout(resolve, 550)); // position-change suppression for programmatic move
    detached.setBounds({ x: -1040, y: 205, width: 360, height: 340 });
    detached.emit('moved'); detached.emit('resized');
    main.setBounds({ x: 135, y: 145, width: 465, height: 425 });
    main.emit('moved');
    await new Promise(resolve => setTimeout(resolve, 850));
    const savedPath = path.join(root, 'Overnote', 'notes.json');
    let saved = JSON.parse(fs.readFileSync(savedPath, 'utf8'));
    assert.equal(saved.tabs.find(t => t.id === original).popped, true);
    assert.equal(saved.tabs.find(t => t.id === original).bounds.displayId, 2);
    assert.equal(saved.settings.main.displayId, 1);
    assert.deepEqual([saved.tabs.find(t => t.id === original).bounds.x, saved.tabs.find(t => t.id === original).bounds.y], [240, 205]);
    assert.deepEqual([saved.settings.main.x, saved.settings.main.y], [135, 145]);
    // Display unplug/replug: temporarily bring a detached window into view, retaining
    // its last placement on the absent display for when it returns.
    screens.pop(); screen.emit('display-removed');
    await new Promise(resolve => setTimeout(resolve, 550));
    assert(detached.bounds.x >= 0, 'off-screen popup is brought onto the primary monitor');
    saved = JSON.parse(fs.readFileSync(savedPath, 'utf8'));
    assert.equal(saved.tabs.find(t => t.id === original).bounds.displayId, 2, 'saved monitor not overwritten');
    screens.push(secondary); screen.emit('display-added');
    await new Promise(resolve => setTimeout(resolve, 550));
    assert.equal(detached.bounds.x, -1040, 'popup returns to original monitor and position');
    // Restart the actual main module using the SAME persisted notes file.    assert.equal(call('get-alarm-sound-info').name, 'custom-test.wav');

    app.emit('before-quit');
    delete require.cache[require.resolve('../main.js')];
    require('../main.js'); await new Promise(resolve => setImmediate(resolve));
    const restoredMain = W.all.filter(w => w.noteId === 'main').at(-1);
    const restoredPopup = W.all.filter(w => w.noteId === original).at(-1);
    assert(restoredMain && restoredPopup, 'restart recreates main window and pop-outs');
    assert.deepEqual(restoredMain.getBounds(), { x: 135, y: 145, width: 465, height: 425 });
    assert.deepEqual(restoredPopup.getBounds(), { x: -1040, y: 205, width: 360, height: 340 });
    assert.equal(call('get-startup'), true, 'start with Windows setting survives relaunch');
    assert.equal(call('load').folders.find(f => f.id === work.id).name, 'Work projects', 'folder names survive restart');
    assert.equal(call('load').folders.find(f => f.id === work.id).collapsed, true, 'collapsed state survives restart');
    assert.equal(call('load').tabs.find(t => t.id === original).folderId, work.id, 'detached notes keep folder after restart');
    assert.equal(callFrom(restoredMain, 'delete-folder', work.id), true, 'folder deletion');
    assert.equal(call('load').tabs.find(t => t.id === original).folderId, null, 'deleting folder moves popped notes to Unfiled');
    assert.equal(call('load').tabs.find(t => t.id === second).folderId, null, 'deleting folder moves docked notes to Unfiled');
    chosenAudio = call('get-alarm-audio');
    assert(chosenAudio.src && chosenAudio.volume === .35, 'custom audio and volume survive relaunch');
    const cleared = callFrom(restoredMain, 'reset-alarm-sound');
    assert(cleared.ok && !cleared.custom, 'reset restores built-in chime');
    assert.equal(call('get-alarm-audio').src, null, 'reset removes custom audio playback');
    assert.equal(fs.existsSync(path.join(root, 'Overnote', 'alarm-sound.wav')), false, 'reset removes copied audio');

    assert.equal(call('load').tabs.find(t=>t.id===original).reminders[0].at, oldAt, 'legacy reminder survives restart');
    assert.equal(call('load').tabs.find(t=>t.id===second).reminders.find(r=>r.id===done.id).dismissedAt, past, 'completed reminder survives restart');
    // Version 1.9.9 storage and UI contracts.
    const backupSettings = callFrom(restoredMain, 'backup-settings');
    assert.equal(backupSettings.target, 'local');
    assert.equal(backupSettings.localFolder,legacySyncedFolder,'legacy Google Drive setting migrates to generic local folder');
    assert.equal(call('load').settings.backupCloudEnabled,false,'migration avoids remote destination');
    const manualBackup = await callFrom(restoredMain, 'backup-now');
    assert(manualBackup.ok && fs.existsSync(path.join(root,'Overnote','backups',manualBackup.filename)));
    assert(fs.existsSync(path.join(legacySyncedFolder,manualBackup.filename)),'local folder receives extra backup copy');
    const anotherFolder=path.join(root,'onedrive-folder');fs.mkdirSync(anotherFolder);
    nextSoundDialog={canceled:false,filePaths:[anotherFolder]};
    const chosenLocal=await callFrom(restoredMain,'backup-pick-local');
    assert(chosenLocal.ok && chosenLocal.localFolder===anotherFolder,'arbitrary synced or local folder is selectable');
    const nextBackup=await callFrom(restoredMain,'backup-now');
    assert(nextBackup.ok && fs.existsSync(path.join(anotherFolder,nextBackup.filename)),'selected local folder receives backup');
    assert.equal(callFrom(restoredMain,'backup-configure',{target:'drive',enabled:false}).ok,false,'Google Drive is no longer a separate target');
    const resetLocal=callFrom(restoredMain,'backup-reset-local');
    assert(resetLocal.ok && resetLocal.localFolder===path.join(root,'Overnote','backups'),'default backup folder can be restored');
    assert.equal(callFrom(restoredMain,'backup-configure',{target:'discord',enabled:true,githubRepo:'',githubBranch:'main',githubDirectory:'notes'}).ok,false,'remote setup requires credential');
    const discord = callFrom(restoredMain,'backup-configure',{target:'discord',enabled:true,githubRepo:'',githubBranch:'main',githubDirectory:'notes',webhook:'https://discord.com/api/webhooks/123456/secretkey'});
    assert(discord.ok && discord.hasDiscord,'Discord credentials saved encrypted');
    assert(!fs.readFileSync(savedPath,'utf8').includes('secretkey'),'webhook token never enters notes.json');
    // Turn uploads off so tests remain offline.
    assert(callFrom(restoredMain,'backup-configure',{target:'local',enabled:false,githubRepo:'',githubBranch:'main',githubDirectory:'notes'}).ok);
    const shareFile = path.join(root,'shared-notes.json');
    nextSaveDialog = {canceled:false,filePath:shareFile};
    const originalTitle = call('load').tabs.find(t=>t.id===second).title;
    const exported = await callFrom(restoredMain,'notes-export',[second],true);
    assert(exported.ok,'export saves a portable JSON file');
    const payload = JSON.parse(fs.readFileSync(shareFile,'utf8'));
    assert.equal(payload.format,'sticky-notes-share');
    assert.equal(payload.notes[0].title,originalTitle);
    assert.equal(payload.notes[0].reminders.length>0,true,'optionally shares reminders');
    nextSoundDialog={canceled:false,filePaths:[shareFile]};
    const imported = await callFrom(restoredMain,'notes-import');
    assert(imported.ok && imported.count===1,'import creates a duplicate note');
    const fresh=call('load').tabs.find(t=>t.title===originalTitle && t.id!==second);
    assert(fresh && fresh.id!==second,'import gives new note ID');
    await call('pop-out',fresh.id);
    const freshPopup=W.all.filter(w=>w.noteId===fresh.id).at(-1);
    assert(freshPopup,'imported note can pop out');
    nextSoundDialog={canceled:false,filePaths:[shareFile]};
    const importedFromPopup=await callFrom(freshPopup,'notes-import');
    assert(importedFromPopup.ok && importedFromPopup.count===1,'import from detached note context is allowed');
    assert.equal(call('load').active,call('load').tabs.at(-1).id,'new import focused in main window');
    await call('dock',fresh.id);
    // Individual pop-out pins remain independent from the main global setting.
    assert.equal(restoredMain.onTop,true, 'main remains on top per its own preference');
    assert.equal(restoredPopup.onTop,false, 'ordinary pop-outs are not pinned by the main preference');
    assert.equal(callFrom(restoredMain,'pin-note',original,true),true);
    assert.equal(restoredPopup.onTop,true, 'pinning makes only the target pop-out topmost');
    assert.equal(call('load').tabs.find(t=>t.id===original).pinned,true);
    assert.equal(JSON.parse(fs.readFileSync(savedPath,'utf8')).tabs.find(t=>t.id===original).pinned,true, 'pin persisted on disk');
    assert.equal(callFrom(restoredMain,'pin-note',original,false),false);
    assert.equal(restoredPopup.onTop,false, 'unpinning restores normal stacking');
    assert.equal(restoredMain.onTop,true, 'unpinning did not affect the main window');
    const fav=callFrom(restoredMain,'favorite-color','#123456',true);
    assert.deepEqual(fav.colors,['#123456']);
    assert.equal(callFrom(restoredMain,'favorite-color','#ffffff',true).ok,true);
    assert.deepEqual(callFrom(restoredMain,'favorite-color','#123456',false).colors,['#ffffff']);
    assert.equal(callFrom(restoredMain,'favorite-color','red',true).ok,false, 'invalid colors rejected');
    const grouped = callFrom(restoredMain,'create-folder','Colors test');
    assert(grouped && callFrom(restoredMain,'folder-color',grouped.id,'#f7b8c6'));
    assert.equal(call('load').folders.find(f=>f.id===grouped.id).color,'#f7b8c6','folder color stored');
    assert.equal(callFrom(restoredMain,'folder-color',grouped.id,'#123456'),true,'custom folder colors accepted');
    assert.equal(call('load').folders.find(f=>f.id===grouped.id).color,'#123456');
    assert.equal(await callFrom(restoredMain,'delete-note',fresh.id),true,'note deletion succeeds');
    assert(callFrom(restoredMain,'list-trash').some(n=>n.id===fresh.id),'deleted note is recoverable');
    assert(callFrom(restoredMain,'restore-trash',fresh.id),'restore note from trash');
    assert(call('load').tabs.some(n=>n.id===fresh.id),'restored note survives');
    assert.equal(await callFrom(restoredMain,'delete-note',fresh.id),true);
    assert(callFrom(restoredMain,'purge-trash',fresh.id),'permanent deletion succeeds');
    assert(!callFrom(restoredMain,'list-trash').some(n=>n.id===fresh.id),'permanent deletion removes note from trash');
    // Full backup/restore must preserve detached geometry, folders, colors, reminders.
    callFrom(restoredMain,'pin-note',original,true); // pin should be included in a full backup
    const preservedBackup = await callFrom(restoredMain,'backup-now');
    const chosenBackup = path.join(root,'Overnote','backups',preservedBackup.filename);
    const originalTabs = call('load').tabs.length;
    callFrom(restoredMain,'delete-folder',grouped.id);
    nextSoundDialog={canceled:false,filePaths:[chosenBackup]};
    const fromBackup = await callFrom(restoredMain,'backup-restore');
    assert(fromBackup.ok && fromBackup.count===originalTabs,'restores complete workspace');
    assert.equal(call('load').folders.find(f=>f.id===grouped.id).color,'#123456','restore keeps custom folder colors');
    assert.equal(call('load').tabs.find(t=>t.id===original).pinned,true,'restore keeps pop-out pin');
    assert.deepEqual(call('load').settings.favoriteColors,['#ffffff'],'restore keeps favorite colors');
    assert.equal(call('load').tabs.find(t=>t.id===original).bounds.displayId,2,'restore keeps popup monitor');
    assert(fs.existsSync(path.join(root,'Overnote','backups',fromBackup.safetyFile)),'restore saves current state for undo');
    // App shutdown must never delete the current alarm just because Windows
    // closes its popup as part of exit.
    const onExit = call('set-reminder', second, tomorrow, 'none', 'Preserve on app quit', null, true);
    const exitReminders = call('load').tabs.find(t=>t.id===second).reminders;
    exitReminders.find(r=>r.id===onExit.id).at = past;
    call('set-reminder', second, tomorrow, 'none', 'Trigger alarm before quit');
    const quitAlarm = W.all.filter(w=>w.noteId==='alarm').at(-1);
    assert(quitAlarm && !quitAlarm.isDestroyed());
    app.emit('before-quit'); quitAlarm.close();
    assert(exitReminders.some(r=>r.id===onExit.id), 'quitting the app never deletes the reminder');
    console.log('Smoke tests passed: folder migration, CRUD, reorder, pop-out association, restart persistence; custom alarm import, volume, persistence, reset, important audible alarm window, alarm queue, X/Done deletion, safe automatic close and quit, snooze/dismiss/silence, legacy reminders, tray, startup, search, drag-to-dock, per-passage reminders, delete/edit, independent monitors, geometry, disconnect/reconnect, and cold-start restoration.');
  } finally { Module._load = orig; fs.rmSync(root, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
