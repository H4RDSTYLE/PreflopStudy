'use strict';
/* cdp_import.js — recarga la app (sin caché), ejecuta importJSON(catálogo) y devuelve resultado */
const http = require('http');
const URL_APP = process.argv[2] || 'http://localhost:8090/rangos/';
const JSON_URL = process.argv[3] || '/rangos/out/edu_import.json';
function getJ(p) { return new Promise((res, rej) => http.get({ host: '127.0.0.1', port: Number(process.env.CDP_PORT) || 9222, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej)); }
async function waitFor(p, ms) { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await p(); if (v) return v; } catch (e) {} await new Promise(r => setTimeout(r, 200)); } throw new Error('timeout'); }
(async () => {
  const tgt = await waitFor(async () => (await getJ('/json/list')).find(x => x.type === 'page' && /http/.test(x.url)), 20000);
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise(r => { const mid = ++id; pending.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })); });
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Page.navigate', { url: URL_APP });
  await waitFor(async () => { try { const r = await send('Runtime.evaluate', { expression: 'typeof RANGES !== "undefined"', returnByValue: true }); return r.result && r.result.result && r.result.result.value; } catch (e) { return false; } }, 20000);
  const expr = `(async()=>{ try {
    const txt = await fetch(${JSON.stringify(JSON_URL)}).then(r=>r.text());
    const res = importJSON(txt);
    return JSON.stringify({ import: res, total: Object.keys(RANGES).length, edited: Object.values(RANGES).filter(r=>r.edited).length, cats: [...new Set(Object.values(RANGES).map(r=>r.cat))] });
  } catch(e){ return 'ERROR: '+e.message; } })()`;
  const ev = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  console.log(ev.result && ev.result.result ? ev.result.result.value : JSON.stringify(ev.result));
  await send('Network.setCacheDisabled', { cacheDisabled: false });
  ws.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(2); });