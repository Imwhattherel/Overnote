'use strict';
const fs=require('node:fs'), path=require('node:path');
// Copy only user content from older installations. Never remove source data.
function migrateLegacy(oldDir,newDir){
  const result={migrated:[],skipped:[]};
  if(!fs.existsSync(path.join(oldDir,'notes.json')) || fs.existsSync(path.join(newDir,'notes.json')))return result;
  fs.mkdirSync(newDir,{recursive:true});
  for(const name of ['notes.json','backup-credentials.enc','alarm-sound.mp3','alarm-sound.wav','alarm-sound.ogg']){
    const src=path.join(oldDir,name),dst=path.join(newDir,name);
    if(!fs.existsSync(src)||fs.existsSync(dst))continue;
    fs.copyFileSync(src,dst,fs.constants.COPYFILE_EXCL);result.migrated.push(name);
  }
  const srcB=path.join(oldDir,'backups'),dstB=path.join(newDir,'backups');
  if(fs.existsSync(srcB)&&fs.statSync(srcB).isDirectory()){
    const recent=fs.readdirSync(srcB).filter(n=>/^(?:sticky-notes|overnote)-.+\.json$/.test(n)).map(n=>({name:n,mtime:fs.statSync(path.join(srcB,n)).mtimeMs})).sort((a,b)=>b.mtime-a.mtime).slice(0,14);
    fs.mkdirSync(dstB,{recursive:true});
    for(const b of recent){const dest=path.join(dstB,b.name);if(!fs.existsSync(dest)){fs.copyFileSync(path.join(srcB,b.name),dest,fs.constants.COPYFILE_EXCL);result.migrated.push('backups/'+b.name)}}
  }
  return result;
}
// Clean transient runtime artifacts only. Never automatically delete notes, audio, backups, or credentials.
function cleanTransients(dir){
  const removed=[];
  for(const n of ['notes.json.new','tray-error.log']){
    const p=path.join(dir,n);
    if(fs.existsSync(p)&&fs.statSync(p).isFile() && (n!=='notes.json.new'||(fs.existsSync(path.join(dir,'notes.json'))&&Date.now()-fs.statSync(p).mtimeMs>7*86400000))) { try{fs.unlinkSync(p);removed.push(n)}catch{} }
  }
  return removed;
}
module.exports={migrateLegacy,cleanTransients};
