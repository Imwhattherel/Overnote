'use strict';
const crypto=require('node:crypto');
function derive(password,salt){
  if(typeof password!=='string'||password.length<6||password.length>1024)throw Error('Use a password of at least 6 characters.');
  return crypto.scryptSync(password,salt,32,{N:16384,r:8,p:1});
}
function seal(text,key,salt){
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const ciphertext=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);
  return {v:1,salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ct:ciphertext.toString('base64')};
}
function lockText(text,password){const salt=crypto.randomBytes(16),key=derive(password,salt);return {vault:seal(text,key,salt),key};}
function unlockText(vault,password){
  try{
    if(!vault||vault.v!==1)throw Error();
    const salt=Buffer.from(vault.salt,'base64'),key=derive(password,salt),iv=Buffer.from(vault.iv,'base64');
    if(salt.length!==16||iv.length!==12)throw Error();
    const decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(Buffer.from(vault.tag,'base64'));
    return {text:Buffer.concat([decipher.update(Buffer.from(vault.ct,'base64')),decipher.final()]).toString('utf8'),key};
  }catch{throw Error('Incorrect password or corrupted encrypted note.');}
}
module.exports={derive,seal,lockText,unlockText};
