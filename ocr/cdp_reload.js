'use strict';
/* cdp_reload.js — recarga la página ignorando caché (para data.js/ranges.js nuevos). */
const http = require('http');
function getJ(p) { return new Promise((res, rej) => http.get({ host: '127.0.0.1', port: Number(process.env.CDP_PORT) || 9222, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej)); }
async function waitFor(p, ms) { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await p(); if (v) return v; } catch (e) {} await new Promise(r => setTimeout(r, 150)); } throw new Error('timeout'); }
(async () => {
  const url = process.argv[2];
  const tgt = await waitFor(async () => (await getJ('/json/list')).find(x => x.type === 'page'), 20000);
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise(r => { const mid = ++id; pending.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })); });
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.reload', { ignoreCache: true });
  await new Promise(r => setTimeout(r, 2500));
  const r = await send('Runtime.evaluate', { expression: 'Object.keys(buildDefaultRanges()).length', returnByValue: true });
  console.log('defaults =', r.result && r.result.result ? r.result.result.value : JSON.stringify(r.result));
  ws.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });