'use strict';
/* cdp_nav.js — navega la primera página a una URL y opcionalmente evalúa una expresión.
   Uso: node cdp_nav.js <url> [expresiónJs] */
const http = require('http');
const urlArg = process.argv[2];
const expr = process.argv[3];
function getJ(p) { return new Promise((res, rej) => http.get({ host: '127.0.0.1', port: Number(process.env.CDP_PORT) || 9222, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej)); }
async function waitFor(p, ms) { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await p(); if (v) return v; } catch (e) {} await new Promise(r => setTimeout(r, 200)); } throw new Error('timeout'); }
(async () => {
  const tgt = await waitFor(async () => (await getJ('/json/list')).find(x => x.type === 'page' && /http/.test(x.url)), 20000);
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise(r => { const mid = ++id; pending.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })); });
  await send('Page.navigate', { url: urlArg });
  await new Promise(r => setTimeout(r, 4000));
  if (expr) {
    const ev = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    console.log(ev.result && ev.result.result ? ev.result.result.value : JSON.stringify(ev.result));
  } else {
    console.log('navegado a', urlArg);
  }
  ws.close();
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(2); });