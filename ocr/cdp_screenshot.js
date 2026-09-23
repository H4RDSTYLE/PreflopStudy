'use strict';
/* cdp_screenshot.js — carga una imagen en Edge, la dibuja en un canvas full-size y captura PNG.
   Uso: node ocr/cdp_screenshot.js <imgUrl> <outPng> [maxWidth] */
const http = require('http');
const fs = require('fs');
function getJ(p) { return new Promise((res, rej) => http.get({ host: '127.0.0.1', port: Number(process.env.CDP_PORT) || 9222, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej)); }
async function waitFor(p, ms) { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await p(); if (v) return v; } catch (e) {} await new Promise(r => setTimeout(r, 150)); } throw new Error('timeout'); }
(async () => {
  const [url, outPng] = process.argv.slice(2);
  const tgt = await waitFor(async () => (await getJ('/json/list')).find(x => x.type === 'page'), 20000);
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise(r => { const mid = ++id; pending.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })); });
  const evJ = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception ? r.result.exceptionDetails.exception.description : r.result.exceptionDetails.text); return r.result && r.result.result ? r.result.result.value : undefined; };
  const res = await send('Page.enable').then(() => evJ(`location.href=${JSON.stringify(url)}; true`));
  await new Promise(r => setTimeout(r, 1500));
  const dims = await evJ(`(async()=>{const img=new Image();img.src=location.href;await new Promise((re,ej)=>{img.onload=re;img.onerror=()=>ej('img');});const cv=document.createElement('canvas');cv.width=img.naturalWidth;cv.height=img.naturalHeight;cv.getContext('2d').drawImage(img,0,0);document.body.style.margin='0';document.body.style.padding='0';document.body.innerHTML='';document.body.appendChild(cv);return img.naturalWidth+'x'+img.naturalHeight;})()`);
  await new Promise(r => setTimeout(r, 200));
  const [w, h] = dims.split('x').map(Number);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
  if (!shot.result) { console.error('shot fail', JSON.stringify(shot).slice(0, 200)); process.exit(2); }
  fs.writeFileSync(outPng, Buffer.from(shot.result.data, 'base64'));
  console.log('PNG', dims, '->', outPng);
  ws.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });