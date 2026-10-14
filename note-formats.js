'use strict';
const path=require('node:path');
const htmlEscape=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const cleanTitle=(s)=>String(s||'Imported note').slice(0,64);
function textNotes(fileName,text){return [{title:cleanTitle(path.basename(fileName,path.extname(fileName))),text:String(text),reminders:[]}]}
function imageTag(alt,src){
  // Only inline image data is rendered. No untrusted network URLs or file paths.
  if(!/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(src)||src.length>6e6)return htmlEscape('!['+alt+']('+src.slice(0,100)+')');
  return `<img alt="${htmlEscape(alt)}" src="${src}" style="max-width:100%;height:auto;border-radius:6px;">`;
}
function renderHtml(text){
  const out=[];let code=false,codeLines=[];
  const inline=s=>{
    const stash=[],keep=html=>`\u0001${stash.push(html)-1}\u0001`;
    let v=htmlEscape(s).replace(/!\[([^\]]*)\]\((data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+)\)/g,(_,a,u)=>keep(imageTag(a,u)));
    v=v.replace(/`([^`]+)`/g,(_,a)=>keep('<code>'+a+'</code>'))
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/~~(.+?)~~/g,'<s>$1</s>')
      .replace(/\+\+(.+?)\+\+/g,'<u>$1</u>').replace(/==(.+?)==/g,'<mark>$1</mark>')
      .replace(/\*([^*]+)\*/g,'<em>$1</em>');
    return v.replace(/\u0001(\d+)\u0001/g,(_,i)=>stash[+i]);
  };
  for(const line of String(text).replace(/\r/g,'').split('\n')){
    if(/^```/.test(line)){if(code){out.push('<pre><code>'+htmlEscape(codeLines.join('\n'))+'</code></pre>');codeLines=[]}code=!code;continue;}
    if(code){codeLines.push(line);continue;}
    const h=line.match(/^(#{1,6})\s+(.+)/);
    if(h)out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
    else if(/^\s*[-*+]\s+\[([ xX])\]\s+/.test(line))out.push('<p>'+(/\[\s\]/.test(line)?'☐':'☑')+' '+inline(line.replace(/^\s*[-*+]\s+\[[ xX]\]\s+/,''))+'</p>');
    else if(/^\s*[-*+]\s+/.test(line))out.push('<p>• '+inline(line.replace(/^\s*[-*+]\s+/,''))+'</p>');
    else if(/^>\s?/.test(line))out.push('<blockquote>'+inline(line.replace(/^>\s?/,''))+'</blockquote>');
    else if(/^---+$/.test(line.trim()))out.push('<hr>');
    else if(line.trim())out.push('<p>'+inline(line)+'</p>');
    else out.push('<div style="height:10px"></div>');
  }
  return out.join('');
}
function pdfHtml(title,text){return `<!doctype html><meta charset="utf-8"><style>body{font:15px/1.55 Segoe UI,Arial,sans-serif;color:#252525;margin:20mm;} h1,h2,h3{line-height:1.2;}h1{font-size:26px;}h2{font-size:21px;}h3{font-size:17px;}pre{white-space:pre-wrap;background:#f3f3f3;padding:8px;}code{font-family:Consolas,monospace}blockquote{border-left:3px solid #aaa;padding-left:10px;}img{page-break-inside:avoid}p{overflow-wrap:anywhere}</style><h1>${htmlEscape(title)}</h1>${renderHtml(text)}`;}
function cmpVersion(a,b){let x=String(a).replace(/^v/i,'').split('.').map(Number),y=String(b).replace(/^v/i,'').split('.').map(Number);if(![...x,...y].every(Number.isFinite))return null;for(let i=0;i<3;i++){if((x[i]||0)>(y[i]||0))return 1;if((x[i]||0)<(y[i]||0))return -1}return 0}
module.exports={htmlEscape,renderHtml,pdfHtml,textNotes,cmpVersion};
