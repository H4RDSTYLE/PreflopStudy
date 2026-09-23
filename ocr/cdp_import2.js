'use strict';
/* cdp_import2.js — reload forzado ignorando caché hasta cargar nuevo data.js (170 situaciones), resetea store e importa */
const http = require('http');
const URL_APP = process.argv[2] || 'http://localhost:8090/rangos/';
const JSON_URL = process.argv[3] || '/rangos/out/edu_import.json';
function getJ(p) { return new Promise((res, rej) => http.get({ host: '127.0.0.1', port: Number(process.env.CDP_PORT) || 9222, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej)); }
async function waitFor(p, ms) { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await p(); if (v) return v; } catch (e) {} await new Promise(r => setTimeout(r, 300)); } throw new Error('timeout'); }
(async () => {
  const tgt = await waitFor(async () => (await getJ('/json/list')).find(x => x.type === 'page' && /http/.test(x.url)), 20000);
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise(r => { const mid = ++id; pending.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })); });
  const evl = async expr => { const ev = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return ev.result && ev.result.result ? ev.result.result.value : undefined; };
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.enable');
  // reload forzado hasta tener el NUEVO data.js
  for (let i = 0; i < 6; i++) {
    await send('Page.reload', { ignoreCache: true });
    try {
      await waitFor(async () => {
        try { return await evl('typeof SITUATIONS !== "undefined" && SITUATIONS.length'); } catch (e) { return false; }
      }, 15000);
    } catch (e) {}
    const n = await evl('typeof SITUATIONS !== "undefined" ? SITUATIONS.length : "?"');
    console.log('intento', i + 1, '-> SITUATIONS:', n);
    if (n === 170) break;
    await new Promise(r => setTimeout(r, 800));
  }
  const res = await evl(`(async()=>{
    localStorage.removeItem('ps_ranges_v1');
    const txt = await fetch(${JSON.stringify(JSON_URL)}).then(r=>r.text());
    const r = importJSON(txt);
    return JSON.stringify({ import: r, total: Object.keys(RANGES).length, edited: Object.values(RANGES).filter(x=>x.edited).length, cats: [...new Set(Object.values(RANGES).map(x=>x.cat))] });
  })()`);
  console.log('IMPORT:', res);
  await send('Network.setCacheDisabled', { cacheDisabled: false });
  ws.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(2); });