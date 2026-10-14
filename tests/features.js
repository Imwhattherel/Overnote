const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const B = require('../backup-tools');
const folder = {id:'f1',name:'Projects',collapsed:true,color:'#f7b8c6'};
const note = {id:'t1',title:'Sprint plan',text:'\n- task: ship\n',color:'#a8e6b8',folderId:'f1',popped:true,
  bounds:{x:45,y:32,w:400,h:320,displayId:2},reminders:[{id:'r1',text:'Send invoice',at:'2030-11-01T12:00:00.000Z',repeat:'weekly',important:true}]};
const state = {tabs:[{id:'t0',title:'Main',text:'Docked',popped:false,reminders:[]},note],folders:[folder],trash:[],active:'t1',settings:{backupTarget:'discord',backupCloudEnabled:true,backupDriveFolder:'/sensitive/path',backupStatus:'ok',
  backupGithubRepo:'topsecret/private',backupGithubBranch:'main',alarmSoundName:'alarm.mp3',font:'mono'}};
const raw = B.exportNotes(state,['t1']);
assert.equal(raw.format,'sticky-notes-share');
assert.match(B.newBackupName(),/^overnote-/);
assert.equal(raw.notes[0].reminders.length,0,'reminders excluded by default');
assert.equal(raw.notes[0].folder,'Projects');
assert.equal(raw.notes[0].bounds,undefined,'window placements are excluded');
const imported = B.parseShared(raw);
assert(imported[0].id!==note.id,'new IDs prevent collisions');
assert(imported[0].text===note.text && imported[0].folder==='Projects');
const sharedRem = B.parseShared(B.exportNotes(state,['t1'],true));
assert.equal(sharedRem[0].reminders.length,1); assert.equal(sharedRem[0].reminders[0].important,true);
assert(sharedRem[0].reminders[0].id!==note.reminders[0].id);
assert.throws(()=>B.parseShared({format:'malicious',notes:[]}));
assert.throws(()=>B.exportNotes(state,['bad']));
const snapshot = B.snapshot(state);
assert(!JSON.stringify(snapshot).includes('topsecret/private'),'remote config excluded');
assert(!JSON.stringify(snapshot).includes('/sensitive/path'),'local path excluded');
const restored = B.restoreSnapshot(snapshot,{...state.settings, backupTarget:'local',backupDriveFolder:'new/target'});
assert.equal(restored.folders[0].color,folder.color);
assert.equal(restored.tabs[1].popped,true); assert.deepEqual(restored.tabs[1].bounds,note.bounds);
assert.equal(restored.settings.backupTarget,'local','restore keeps current backup target');
assert.equal(restored.settings.backupDriveFolder,'new/target');
assert.equal(restored.settings.backupLocalFolder,state.settings.backupLocalFolder);
assert.throws(()=>B.restoreSnapshot({format:'bad',data:state},state.settings));
assert.throws(()=>B.restoreSnapshot({format:'sticky-notes-backup',version:1,data:{...state,tabs:[note,note]}},state.settings));
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'sticky-features-'));
const bytes = Buffer.from(JSON.stringify(snapshot));
(async()=>{
  try {
    const out = await B.uploadBackup({backupTarget:'drive',backupDriveFolder:temp}, {}, 'export.json',bytes);
    assert.match(out,/synced folder/); assert(fs.existsSync(path.join(temp,'export.json')));
    const responses=[];
    const fakeFetch=async(url, opts)=>{responses.push({url,opts});return {ok:true,status:201};};
    assert.match(await B.uploadBackup({backupTarget:'github',backupGithubRepo:'test-user/private-repo',backupGithubBranch:'main',backupGithubDirectory:'notes'}, {githubToken:'fine-grained'}, 'backup.json',bytes,fakeFetch),/GitHub/);
    assert.equal(responses[0].url,'https://api.github.com/repos/test-user/private-repo/contents/notes/backup.json');
    assert.equal(JSON.parse(responses[0].opts.body).content,bytes.toString('base64'));
    assert.match(await B.uploadBackup({backupTarget:'discord'},{webhook:'https://discord.com/api/webhooks/123456/secret-key'},'notes.json',bytes,fakeFetch),/Discord/);
    assert.match(responses[1].url,/discord.com\/api\/webhooks\/123456/);
    assert.throws(()=>B.validateTarget({backupTarget:'discord'},{webhook:'http://evil.invalid/discord'}));
    assert.throws(()=>B.validateTarget({backupTarget:'github',backupGithubRepo:'public',backupGithubBranch:'main'},{githubToken:'x'}));
    fs.writeFileSync(path.join(temp,'sticky-notes-2026-01-01T00-00-00-000Z.json'),'x');
    fs.utimesSync(path.join(temp,'sticky-notes-2026-01-01T00-00-00-000Z.json'),new Date('2026-01-01'),new Date('2026-01-01'));
    B.pruneBackups(temp,Date.now()); assert(!fs.existsSync(path.join(temp,'sticky-notes-2026-01-01T00-00-00-000Z.json')));
    fs.writeFileSync(path.join(temp,'overnote-2026-01-01T00-00-00-000Z.json'),'x');
    fs.utimesSync(path.join(temp,'overnote-2026-01-01T00-00-00-000Z.json'),new Date('2026-01-01'),new Date('2026-01-01'));
    B.pruneBackups(temp,Date.now()); assert(!fs.existsSync(path.join(temp,'overnote-2026-01-01T00-00-00-000Z.json')));
    console.log('Feature tests passed: share/import, fresh IDs, reminders opt-in, folder colors, restore, backups, provider uploads, path/security validation, retention.');
  } finally {fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
