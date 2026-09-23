'use strict';
/* probe_rgb.js <imgUrl> <jsonArrayOfPoints> — imprime RGB de puntos dados. */
const fs = require('fs');
const http = require('http');
const imgUrl = process.argv[2];
const points = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
function getJ(p) { return new Promise((res, rej) => http.get({ host: '127.0.0.1', port: Number(process.env.CDP_PORT) || 9222, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej)); }
async function waitFor(p, ms) { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await p(); if (v) return v; } catch (e) {} await new Promise(r => setTimeout(r, 150)); } throw new Error('timeout'); }
(async () => {
  const tgt = await waitFor(async () => (await getJ('/json/list')).find(x => x.type === 'page'), 20000);
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise(r => { const mid = ++id; pending.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })); });
  const evJ = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : JSON.stringify(r.result && r.result.exceptionDetails); };
  await evJ(`location.href=${JSON.stringify(imgUrl)}; true`);
  await new Promise(r => setTimeout(r, 1500));
  const expr = `(async function(){
    const img = new Image(); img.src = location.href;
    await new Promise((res,rej)=>{ img.onload=res; img.onerror=()=>rej('img-fail'); });
    const cv = document.createElement('canvas'); cv.width=img.naturalWidth; cv.height=img.naturalHeight;
    const ctx = cv.getContext('2d'); ctx.drawImage(img,0,0);
    const d = ctx.getImageData(0,0,cv.width,cv.height).data; const W=cv.width;
    const pts=${JSON.stringify(points)};
    const sm=(x,y)=>{x=Math.round(x);y=Math.round(y);const i=(y*W+x)*4;return [d[i],d[i+1],d[i+2]];};
    return JSON.stringify(pts.map(p=>({id:p.id, rgb: sm(p.x,p.y), rgb2: sm(p.x+6,p.y+4)})));
  })()`;
  console.log(await evJ(expr));
  ws.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });