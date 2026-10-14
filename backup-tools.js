'use strict';
// File-format and cloud helpers. No Electron dependency: can be unit-tested.
const fs = require('node:fs'), path = require('node:path');
const { randomUUID } = require('node:crypto');
const PALETTE = ['#f6e27a', '#a8e6b8', '#f7b8c6', '#a9d4f5', '#cdb8f5', '#fbc48c'];
const validColor = c => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);
const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
const safeTitle = (v, fallback) => String(v || fallback).trim().slice(0, 64) || fallback;
function exportNotes(all, ids, includeReminders = false) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 500 || new Set(ids).size !== ids.length) throw Error('Choose 1 to 500 notes.');
  const folders = new Map((all.folders || []).map(f => [f.id, f.name]));
  const byId = new Map(all.tabs.map(n => [n.id, n]));
  if (ids.some(id => !byId.has(id))) throw Error('Selected note does not exist.');
  return { format: 'sticky-notes-share', version: 1, exportedAt: new Date().toISOString(),
    notes: ids.map(id => { const n = byId.get(id); return {
      title: n.title, text: n.text || '', color: validColor(n.color) ? n.color : PALETTE[0],
      folder: folders.get(n.folderId) || '',
      reminders: includeReminders ? (n.reminders || []).map(r => ({ text: r.text, at: r.at, repeat: r.repeat || 'none', important: !!r.important })) : []
    }; }) };
}
function parseShared(raw) {
  if (!raw || raw.format !== 'sticky-notes-share' || raw.version !== 1 || !Array.isArray(raw.notes) || raw.notes.length < 1 || raw.notes.length > 500) throw Error('Not a valid Overnote shared-notes file.');
  return raw.notes.map(n => {
    if (!n || typeof n.text !== 'string' || n.text.length > 12_000_000) throw Error('Shared note text is invalid or too large.');
    const reminders = (Array.isArray(n.reminders) ? n.reminders : []).slice(0, 250).filter(r => r && typeof r.text === 'string' && Number.isFinite(Date.parse(r.at))).map(r => ({
      id: randomUUID(), text: r.text.slice(0, 500), at: new Date(r.at).toISOString(),
      repeat: ['none','daily','weekly'].includes(r.repeat) ? r.repeat : 'none', important: !!r.important,
      snoozedUntil: null, dismissedAt: null, notifiedAt: null
    }));
    return { id: 't' + randomUUID(), pinned: false, title: safeTitle(n.title, 'Imported note'), text: n.text,
      color: validColor(n.color) ? n.color : PALETTE[0], folder: safeTitle(n.folder, ''),
      reminders, preview: false, popped: false };
  });
}
function restoreSnapshot(raw, currentSettings) {
  if (!raw || raw.format !== 'sticky-notes-backup' || raw.version !== 1 || !raw.data ||
      !Array.isArray(raw.data.tabs) || !raw.data.tabs.length || raw.data.tabs.length > 5000 ||
      !Array.isArray(raw.data.folders || [])) throw Error('Not a valid Overnote backup file.');
  const src = raw.data;
  const ids = new Set(), fids = new Set();
  const folders = (src.folders || []).slice(0, 1000).map(f => {
    if (typeof f.id !== 'string' || !f.id || fids.has(f.id)) throw Error('Invalid folder in backup.');
    fids.add(f.id);
    return { id: f.id, name: safeTitle(f.name, 'Folder'), collapsed: !!f.collapsed, color: validColor(f.color) ? f.color : null };
  });
  const tabs = src.tabs.map(n => {
    if (!n || typeof n.id !== 'string' || !n.id || ids.has(n.id) || typeof n.text !== 'string' || n.text.length > 12_000_000 || (n.vault && (n.vault.v !== 1 || typeof n.vault.ct !== 'string'))) throw Error('Invalid or duplicate note in backup.');
    ids.add(n.id);
    return { id: n.id, title: safeTitle(n.title, 'Notes'), text: n.vault ? '' : n.text, vault: n.vault || undefined,
      color: validColor(n.color) ? n.color : PALETTE[0],
      folderId: fids.has(n.folderId) ? n.folderId : null,
      popped: !!n.popped, bounds: n.bounds && typeof n.bounds === 'object' ? n.bounds : undefined,
      preview: !!n.preview, pinned: !!n.pinned,
      reminders: (Array.isArray(n.reminders) ? n.reminders : []).slice(0, 500).filter(r => r && typeof r.text === 'string' && Number.isFinite(Date.parse(r.at))).map(r => ({
        id: typeof r.id === 'string' ? r.id : randomUUID(), text: r.text.slice(0,500), at: new Date(r.at).toISOString(),
        repeat: ['none','daily','weekly'].includes(r.repeat) ? r.repeat : 'none', important: !!r.important,
        dismissedAt: r.dismissedAt || null, notifiedAt: r.notifiedAt || null, snoozedUntil: r.snoozedUntil || null
      }))
    };
  });
  if (!tabs.some(t => !t.popped)) tabs[0].popped = false;
  const orig = src.settings || {};
  // Backup destinations and sound selection stay as configured on THIS computer.
  const preserved = ['backupTarget','backupCloudEnabled','backupDriveFolder','backupLocalFolder','backupGithubRepo','backupGithubBranch','backupGithubDirectory','lastBackupAt','backupStatus','alarmSoundName','alarmSoundExt','alarmVolume'];
  const settings = { ...currentSettings, ...orig };
  settings.favoriteColors = Array.isArray(settings.favoriteColors) ? [...new Set(settings.favoriteColors.filter(validColor).map(c => c.toLowerCase()))].slice(0,12) : [];
  for (const k of preserved) settings[k] = currentSettings[k];
  return { tabs, folders, trash: (Array.isArray(src.trash) ? src.trash : []).slice(-500),
    active: tabs.some(t => t.id === src.active && !t.popped) ? src.active : tabs.find(t => !t.popped).id,
    unfiledCollapsed: !!src.unfiledCollapsed, settings };
}
function snapshot(data) {
  const copy = structuredClone(data);
  // Never include unlocked encrypted text in backups.
  for (const n of copy.tabs || []) {delete n.unlocked; if (n.vault) n.text='';}
  for (const n of copy.trash || []) if (n.note?.vault) n.note.text='';
  // Backup destination metadata is local only. Secrets live separately.
  for (const k of ['backupTarget', 'backupCloudEnabled', 'backupDriveFolder', 'backupGithubRepo', 'backupGithubBranch', 'backupGithubDirectory', 'backupStatus']) delete copy.settings[k];
  return { format: 'sticky-notes-backup', version: 1, createdAt: new Date().toISOString(), data: copy };
}
function newBackupName() { return 'overnote-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json'; }
function pruneBackups(directory, now = Date.now()) {
  if (!fs.existsSync(directory)) return;
  const files = fs.readdirSync(directory).filter(n => /^(?:sticky-notes|overnote)-\d{4}-\d\d-\d\dT.*\.json$/.test(n))
    .map(n => ({ n, mtime: fs.statSync(path.join(directory, n)).mtimeMs })).sort((a,b) => b.mtime - a.mtime);
  for (const [i, f] of files.entries()) if (i >= 50 || now - f.mtime > 30 * 86_400_000) fs.rmSync(path.join(directory,f.n), {force:true});
}
function validateTarget(settings, secret) {
  if (settings.backupTarget === 'discord') {
    if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+\/?$/.test(secret?.webhook || '')) throw Error('Enter a valid Discord webhook URL.');
  } else if (settings.backupTarget === 'github') {
    if (!/^[\w.-]+\/[\w.-]+$/.test(settings.backupGithubRepo || '') || !secret?.githubToken) throw Error('Enter a GitHub owner/repository and token.');
    if (!/^[\w./-]+$/.test(settings.backupGithubBranch || 'main') || (settings.backupGithubBranch || '').includes('..')) throw Error('Invalid GitHub branch.');
  } else if (settings.backupTarget === 'drive') {
    if (!settings.backupDriveFolder || !fs.existsSync(settings.backupDriveFolder) || !fs.statSync(settings.backupDriveFolder).isDirectory()) throw Error('Select a synced Google Drive desktop folder.');
  } else if (settings.backupTarget !== 'local') throw Error('Invalid destination.');
}
async function uploadBackup(settings, secret, filename, bytes, fetchFn = fetch) {
  validateTarget(settings, secret);
  const target = settings.backupTarget;
  if (target === 'local') return 'Saved locally';
  if (target === 'drive') {
    const dest = path.join(settings.backupDriveFolder, filename);
    fs.writeFileSync(dest + '.tmp', bytes); fs.renameSync(dest + '.tmp', dest);
    return 'Copied to synced folder (Google Drive app uploads it)';
  }
  if (bytes.byteLength > 7_000_000) throw Error('Cloud backup exceeds 7 MB; local backup was saved.');
  const controller = new AbortController(), abort = setTimeout(() => controller.abort(), 25_000);
  try {
    if (target === 'discord') {
      const form = new FormData();
      form.append('payload_json', JSON.stringify({ content: 'Overnote backup · ' + new Date().toLocaleString() }));
      form.append('files[0]', new Blob([bytes], { type: 'application/json' }), filename);
      const response = await fetchFn(secret.webhook + (secret.webhook.includes('?') ? '&' : '?') + 'wait=true', {method:'POST', body:form, redirect:'error', signal:controller.signal});
      if (!response.ok) throw Error('Discord upload failed (HTTP ' + response.status + ')');
      return 'Uploaded to Discord';
    }
    const [owner, repo] = settings.backupGithubRepo.split('/');
    const dir = String(settings.backupGithubDirectory || 'overnote-backups').replace(/^\/+|\/+$/g, '');
    if (dir.includes('..') || !/^[\w./-]*$/.test(dir)) throw Error('Invalid GitHub backup directory.');
    const location = [dir, filename].filter(Boolean).map(s => s.split('/').map(encodeURIComponent).join('/')).join('/');
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${location}`;
    const response = await fetchFn(url, { method:'PUT', redirect:'error', signal:controller.signal,
      headers: { Authorization:'Bearer '+secret.githubToken, 'Accept':'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28', 'User-Agent':'Overnote-Backup', 'Content-Type':'application/json' },
      body: JSON.stringify({ message:'Overnote backup '+ filename, content: Buffer.from(bytes).toString('base64'), branch:settings.backupGithubBranch || 'main' }) });
    if (!response.ok) throw Error('GitHub upload failed (HTTP ' + response.status + '). Check repository access, branch, and token permissions.');
    return 'Committed backup to GitHub';
  } finally { clearTimeout(abort); }
}
module.exports = { PALETTE, MAX_IMPORT_BYTES, exportNotes, parseShared, restoreSnapshot, snapshot, newBackupName, pruneBackups, validateTarget, uploadBackup };
