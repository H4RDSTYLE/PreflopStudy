'use strict';
/* cdp_verify.js — verifica app de rangos y visor tras cambios v4 */
const http = require('http');
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
  const nav = async url => { await send('Page.navigate', { url }); await sleep(2600); };
  const evalv = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result && r.result.result ? r.result.result.value : ('ERR:' + JSON.stringify(r));
  };

  // ---- 1) app de rangos ----
  await nav('http://localhost:8090/rangos/');
  const appChecks = await evalv(`
    (() => {
      const out = {};
      out.ranges = RANGES.length;
      const r1 = getRange('vsor30_bb_utg');
      out.sizes_def = JSON.stringify((r1 && r1.sizes) || null);
      const r2 = getRange('uor_utg_30bb');
      out.sizes_open = JSON.stringify((r2 && r2.sizes) || null);
      try {
        buildSession({ sitIds: ['uor_utg_30bb'], mode: 'todo', limit: 3, prioritize: false, chains: 0 });
        renderCard();
        out.estudio = {
          seats: document.querySelectorAll('.seat').length,
          seq: (document.querySelector('.qseq') || {}).textContent || '',
          answers: [...document.querySelectorAll('#qans button')].map(b => b.innerText.replace(/\\s+/g,' ').trim()).slice(0,3),
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
    })()
  `);
  console.log('APP', JSON.stringify(appChecks, null, 1));

  // ---- 2) visor (catálogo real) ----
  await nav('http://localhost:8090/index.html');
  const visorChecks = await evalv(`
    (() => ({
      n: library.length,
      first: (library[0] && library[0].title) || null,
      cats: [...new Set(library.map(i => i.category))].slice(0,6),
      demoBanner: !!document.querySelector('#demoBanner') && !document.querySelector('#demoBanner').classList.contains('hidden'),
      gridVisible: document.querySelectorAll('#grid .card').length,
    }))()
  `);
  console.log('VISOR', JSON.stringify(visorChecks, null, 1));

  // ---- vuelta a la app ----
  await nav('http://localhost:8090/rangos/');
  ws.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });