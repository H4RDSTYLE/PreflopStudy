'use strict';
/* cdp_verify2.js — backup store, actualiza SW v4, limpia store y re-verifica estudio */
const http = require('http');
const fs = require('fs');
function getJ(p) { return new Promise((res, rej) => http.get({ host: '127.0.0.1', port: Number(process.env.CDP_PORT) || 9222, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej)); }
async function waitFor(p, ms) { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await p(); if (v) return v; } catch (e) {} await new Promise(r => setTimeout(r, 150)); } throw new Error('timeout'); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const tgt = await waitFor(async () => (await getJ('/json/list')).find(x => x.type === 'page'), 20000);
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise(r => { const mid = ++id; pending.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })); });
  const nav = async url => { await send('Page.navigate', { url }); await sleep(2500); };
  const reload = async () => { await send('Network.setCacheDisabled', { cacheDisabled: true }); await send('Page.reload', { ignoreCache: true }); await sleep(2600); };
  const evalv = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result && r.result.result ? r.result.result.value : ('ERR:' + JSON.stringify(r));
  };

  await nav('http://localhost:8090/rangos/');

  // backup
  const backup = await evalv('exportJSON()');
  if (typeof backup === 'string') {
    fs.writeFileSync('C:/Users/hugo/AppData/Local/Temp/opencode/backup_ranges_2026-09-23.json', backup);
    console.log('BACKUP ok, bytes=', backup.length);
  } else console.log('BACKUP fallo:', backup);

  // update SW + limpiar store + caches
  const cleaned = await evalv(`(async () => {
    const removed = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('ps_ranges_')) { removed.push(k); localStorage.removeItem(k); }
    }
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) await r.unregister();
    const keys = await caches.keys();
    for (const k of keys) await caches.delete(k);
    return { removed, unregs: regs.length, caches: keys };
  })()`);
  console.log('LIMPIADO', JSON.stringify(cleaned));

  await reload(); // registra SW v4
  await reload(); // sirve v4

  const appChecks = await evalv(`(() => {
    const out = {};
    try { out.ranges = RANGES.length; } catch (e) { out.ranges = 'ERR ' + e.message; }
    const r1 = getRange('vsor30_bb_utg');
    out.sizes_def = JSON.stringify((r1 && r1.sizes) || null);
    const r2 = getRange('uor_utg_30bb');
    out.sizes_open = JSON.stringify((r2 && r2.sizes) || null);
    const swOn = navigator.serviceWorker.controller ? (navigator.serviceWorker.controller.scriptURL || '') : '(espera)';
    out.sw = swOn;
    try {
      buildSession({ sitIds: ['uor_utg_30bb'], mode: 'todo', limit: 3, prioritize: false, chains: 0 });
      renderCard();
      out.estudio = {
        seats: document.querySelectorAll('.seat').length,
        seq: (document.querySelector('.qseq') || {}).textContent || '',
        answers: [...document.querySelectorAll('#qans button')].map(b => b.innerText.replace(/\\s+/g,' ').trim()).slice(0,4),
      };
    } catch (e) { out.estudio = 'ERR ' + e.message; }
    try {
      buildSession({ sitIds: ['uor_utg_30bb','vsor30_bb_utg'], mode: 'todo', limit: 20, prioritize: false, chains: 2 });
      renderCard();
      out.cadena = {
        total: session.list.length,
        chainMarkers: session.list.filter(e => e.chainKey).length,
        badge: (document.querySelector('.chainbadge') || {}).textContent || null,
      };
    } catch (e) { out.cadena = 'ERR ' + e.message; }
    return out;
  })()`);
  console.log('APP2', JSON.stringify(appChecks, null, 1));

  ws.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });