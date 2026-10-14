'use strict';
// Read-only importer for the classic Microsoft Sticky Notes plum.sqlite file.
// Implements SQLite's table B-tree/records without native modules. Does not
// mutate the original database. WAL-only changes may not yet be in the file.
const fs=require('node:fs');
function readLegacy(file){
  if(fs.statSync(file).size>60*1024*1024)throw Error('Sticky Notes database is too large (60 MB max).');
  const b=fs.readFileSync(file);
  if(b.subarray(0,16).toString('ascii')!=='SQLite format 3\0')throw Error('Not a SQLite database.');
  const rawPage=b.readUInt16BE(16),pageSize=rawPage===1?65536:rawPage;
  if(pageSize<512||pageSize>65536||pageSize&(pageSize-1))throw Error('Unsupported SQLite page size.');
  const usable=pageSize-b[20];
  function slicePage(n){if(!Number.isInteger(n)||n<1||n*pageSize>b.length+pageSize-1)throw Error('Corrupt SQLite page.');return (n-1)*pageSize;}
  function varint(offset){let v=0;for(let i=0;i<9;i++){if(offset+i>=b.length)throw Error('Bad SQLite varint.');const c=b[offset+i];if(i===8)return {v:v*256+c,len:9};v=v*128+(c&127);if(!(c&128))return {v,len:i+1};}throw Error('Invalid SQLite varint.');}
  function payload(cell){
    const amount=varint(cell),rid=varint(cell+amount.len),start=cell+amount.len+rid.len,need=amount.v;
    if(need>12*1024*1024)throw Error('An imported note is too large.');
    const min=Math.floor((usable-12)*32/255)-23,max=usable-35;
    let local=need<=max?need:min+(need-min)%(usable-4);if(local>max)local=min;
    const parts=[b.subarray(start,start+local)];let remain=need-local;
    let next=remain?b.readUInt32BE(start+local):0,iterations=0;
    while(remain>0){if(++iterations>10000)throw Error('SQLite overflow loop.');const off=slicePage(next),take=Math.min(remain,usable-4);parts.push(b.subarray(off+4,off+4+take));remain-=take;next=remain?b.readUInt32BE(off):0;}
    return Buffer.concat(parts);
  }
  function record(blob){
    let cursor=0;const sz=innerVarint();function innerVarint(){let val=0;for(let j=0;j<9;j++){const c=blob[cursor++];if(c==null)throw Error('Invalid SQLite record.');if(j===8)return val*256+c;val=val*128+(c&127);if(!(c&128))return val;}}
    const serial=[];while(cursor<sz)serial.push(innerVarint());let pos=sz;
    return serial.map(type=>{let len=0;
      if(type>=12)len=Math.floor((type-12)/2);else if(type===1)len=1;else if(type===2)len=2;else if(type===3)len=3;else if(type===4)len=4;else if(type===5)len=6;else if(type===6||type===7)len=8;
      const chunk=blob.subarray(pos,pos+len);pos+=len;
      if(type===0||type===10||type===11)return null;
      if(type===8)return 0;if(type===9)return 1;
      if(type>=12)return type%2?chunk.toString('utf8'):chunk;
      if(type===7)return chunk.readDoubleBE(0);
      let n=0;for(const c of chunk)n=n*256+c;
      if(len&&chunk[0]&128)n-=2**(8*len);
      return n;
    });
  }
  const rows=[];function walk(page,depth=0){
    if(depth>30||rows.length>15000)throw Error('Database too large or corrupt.');
    const start=slicePage(page),off=start+(page===1?100:0),type=b[off];
    if(type!==5&&type!==13)throw Error('Unsupported SQLite table page.');
    const count=b.readUInt16BE(off+3),hdr=type===13?8:12;
    for(let i=0;i<count;i++){
      const pointer=b.readUInt16BE(off+hdr+i*2),cell=start+pointer;
      if(type===5)walk(b.readUInt32BE(cell),depth+1);
      else rows.push(record(payload(cell)));
    }
    if(type===5)walk(b.readUInt32BE(off+8),depth+1);
  }
  walk(1);const schema=rows.find(r=>String(r[0]).toLowerCase()==='table'&&String(r[1]).toLowerCase()==='note');
  if(!schema)throw Error('No classic Sticky Notes Note table found.');
  const root=Number(schema[3]),ddl=String(schema[4]||'');
  const names=(ddl.match(/\(([^]*)\)/)?.[1]||'').split(',').map(s=>s.trim().match(/^\[([^\]]+)\]|^"([^"]+)"|^`([^`]+)`|^([\w]+)/)?.slice(1).find(Boolean)||'');
  const textIx=names.findIndex(n=>n.toLowerCase()==='text'),deletedIx=names.findIndex(n=>n.toLowerCase()==='isdeleted');
  if(textIx<0)throw Error('Sticky Notes table has no Text column.');
  rows.length=0;walk(root);
  const imported=[];
  for(const r of rows){if(deletedIx>=0&&r[deletedIx]===1)continue;const content=r[textIx];if(typeof content!=='string'||!content.trim())continue;
    const clean=content.replace(/\\id=[\w-]+\s*/g,'').replace(/\\[a-z]+(?:=[^\\\s]*)?/g,'').trim();
    if(!clean)continue;imported.push({title:'Windows Sticky Note '+(imported.length+1),text:clean,reminders:[]});
    if(imported.length>=500)break;
  }
  if(!imported.length)throw Error('No usable notes were found in this database.');
  return imported;
}
module.exports={readLegacy};
