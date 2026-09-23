'use strict';
/* cdp_verify3.js — verificación limpia (sin BFCache/caché HTTP) del estudio v5 */
const http = require('http');
function getJ(p) { return new Promise((res, rej) => http.get({ host: '127.0.0.1', port: 9222, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej)); }
async function waitFor(p, ms) { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await p(); if (v) return v; } catch (e) {} await new Promise(r => setTimeout(r, 150)); } throw new Error('timeout'); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EMPTY = `(()=>({}))()`;

(async () => {
  const tgt = await waitFor(async () => (await getJ('/json/list')).find(x => x.type === 'page'), 20000);
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise(r => { const mid = ++id; pending.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })); });
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result && r.result.result ? r.result.result.value : ('ERR:' + JSON.stringify(r).slice(0, 200));
  };
  const nav = async url => {
    await send('Page.navigate', { url: 'about:blank' });
    await sleep(400);
    await send('Page.navigate', { url: url + '?bust=' + Date.now() });
    await sleep(3000);
    await ev(EMPTY);
  };
  await send('Network.setCacheDisabled', { cacheDisabled: true });

  await nav('http://localhost:8090/rangos/');
  const studies = [];
  const sitIds = ['uor_utg_30bb', 'uor_btn_15bb', 'vsor30_bb_utg', 'u_vs3ip_3050bb', 'u_sqz_co_3040bb', 'u_bb_lsb_30bb', 'u_sbb_20bb', 'u_sbbr_20bb', 'cvp_bb_os_sb_15'];
  for (const st of sitIds) {
    const res = await ev(`(async () => {
      try {
        buildSession({ sitIds: ['${st}'], mode: 'todo', limit: 1, prioritize: false, chains: 0 });
        renderCard();
        return {
          sit: '${st}',
          seats: document.querySelectorAll('.seat').length,
          seatTxt: [...document.querySelectorAll('.seat')].map(s => s.querySelector('.spos').textContent + ':' + s.querySelector('.sact').textContent).join(','),
          seq: (document.querySelector('.qseq') || {}).textContent || '',
          answers: [...document.querySelectorAll('#qans button')].map(b => b.innerText.replace(/\\s+/g, ' ').trim()).slice(0, 4),
          intro: (document.querySelector('.qmeta') || {}).textContent || '',
        };
      } catch (e) { return { sit: '${st}', err: e.message }; }
    })()`);
    studies.push(res);
  }
  console.log('ESTUDIO-cads=', JSON.stringify(studies, null, 1));

  const cadena = await ev(`(async () => {
    buildSession({ sitIds: ['uor_utg_30bb','vsor30_bb_utg'], mode: 'todo', limit: 20, prioritize: false, chains: 2 });
    renderCard();
    return {
      total: session.list.length,
      chainMarkers: session.list.filter(e => e.chainKey).length,
      last: session.list.filter(e => e.chainKey).map(e => e.chainStep).join(',')
    };
  })()`);
  console.log('CADENA=', JSON.stringify(cadena));

  const visor = await nav('http://localhost:8090/index.html');
  const visorChk = await ev(`(() => ({
    n: library.length,
    first: (library[0] && library[0].title) || null,
    cats: [...new Set(library.map(i => i.category))].slice(0, 7),
    demo: !!document.querySelector('#demoBanner') && !document.querySelector('#demoBanner').classList.contains('hidden'),
    gridVisible: document.querySelectorAll('#grid .card').length,
  }))()`);
  console.log('VISOR=', JSON.stringify(visorChk, null, 1));

  await nav('http://localhost:8090/rangos/');
  ws.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });