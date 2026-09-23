'use strict';
/* probe_cell.js — imprime mapa 2D de color cuantizado alrededor de una celda dada. */
const http = require('http');
const fs = require('fs');
const imgUrl = process.argv[2];
const x0 = parseInt(process.argv[3], 10), y0 = parseInt(process.argv[4], 10), x1 = parseInt(process.argv[5], 10), y1 = parseInt(process.argv[6], 10);
function getJ(p) { return new Promise((res, rej) => http.get({ host: '127.0.0.1', port: Number(process.env.CDP_PORT) || 9222, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej)); }
async function waitFor(p, ms) { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await p(); if (v) return v; } catch (e) {} await new Promise(r => setTimeout(r, 150)); } throw new Error('timeout'); }
(async () => {
  const tgt = await waitFor(async () => (await getJ('/json/list')).find(x => x.type === 'page'), 20000);
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise(r => { const mid = ++id; pending.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })); });
  const evJ = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception ? r.result.exceptionDetails.exception.description : r.result.exceptionDetails.text); return r.result && r.result.result ? r.result.result.value : undefined; };
  await evJ(`location.href=${JSON.stringify(imgUrl)}; true`);
  await new Promise(r => setTimeout(r, 1500));
  const expr = `(async function(){
    const img = new Image(); img.src = location.href;
    await new Promise((res,rej)=>{ img.onload=res; img.onerror=()=>rej('img-fail'); });
    const cv = document.createElement('canvas'); cv.width=img.naturalWidth; cv.height=img.naturalHeight;
    const ctx = cv.getContext('2d'); ctx.drawImage(img,0,0);
    const d = ctx.getImageData(0,0,cv.width,cv.height).data; const W=cv.width;
    const out=[];
    for(let y=${y0};y<${y1};y++){
      let row='';
      for(let x=${x0};x<${x1};x++){
        const i=(y*W+x)*4; const r=d[i],g=d[i+1],b=d[i+2];
        const lum=0.299*r+0.587*g+0.114*b;
        let ch;
        if(lum<72) ch='#';
        else if(r>235&&g>235&&b>235) ch='.';
        else if(r>200&&g>180&&b<120) ch='o';
        else if(r>120&&g<80&&b<80) ch='R';
        else if(b>200&&r<200) ch='b';
        else if(lum<170) ch='+';
        else ch='-';
        row+=ch;
      }
      out.push(String(y).padStart(4)+' '+row);
    }
    return out.join('\\n');
  })()`;
  console.log(await evJ(expr));
  ws.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });