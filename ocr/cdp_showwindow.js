'use strict';
/* cdp_showwindow.js — trae al frente la ventana del target y la maximiza. */
const http = require('http');
function getJ(p) { return new Promise((res, rej) => http.get({ host: '127.0.0.1', port: Number(process.env.CDP_PORT) || 9222, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej)); }
async function waitFor(p, ms) { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await p(); if (v) return v; } catch (e) {} await new Promise(r => setTimeout(r, 150)); } throw new Error('timeout'); }
(async () => {
  const tgt = await waitFor(async () => (await getJ('/json/list')).find(x => x.type === 'page'), 20000);
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise(r => { const mid = ++id; pending.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })); });
  const win = await send('Browser.getWindowForTarget', { targetId: tgt.id });
  const w = win.result && win.result.windowId;
  console.log('windowId =', w, 'bounds =', JSON.stringify(win.result && win.result.bounds));
  if (w) {
    const r = await send('Browser.setWindowBounds', { windowId: w, bounds: { windowState: 'normal', width: 1280, height: 900, left: 0, top: 0 } });
    console.log('set normal:', JSON.stringify(r));
  }
  ws.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });