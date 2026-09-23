/* extraer_tablas.js — Descarga las tablas de EducaPoker usando la
   sesion ya abierta en el navegador con depuracion remota (9222).

   Formato real de las imagenes (observado en la app):
     ImageUrl = {categoria}/{situacion}/{columna}/{archivo}
     ej: 2_Universidad/MTT/1_Open Raise/1_OR 10-12bb.jpg

   La sesion la da el navegador (in-page fetch incluye cookies);
   el header 'UserData' es el que la propia app envia y se captura
   de la red o se reusa el valor almacenado.

   Salida: tablas/{situacion}/2_Universidad/{columna}/{archivo}
           (solo categorias cuyo nombre contiene "Universidad")

   Uso: node extraer_tablas.js
*/
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 9222;
const OUT_ROOT = path.join(__dirname, 'tablas');
const PROJECTS = ['Spin', 'Cash', 'MTT'];

// UserData capturado de una peticion real de la app (claims de la sesion).
// Si falla, el script intenta capturarlo de nuevo desde la red.
const UD = {
  sub: '569744',
  email: 'hugomelalvarez@gmail.com',
  email_verified: false,
  level: 'useless',
  status: 'Colegio',
  project: 'MTT',
  staff: 'FALSE',
  cash_status: 'Colegio',
  spin_status: 'Colegio',
  mtt_status: 'Universidad'
};

function getJSON(p) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: PORT, path: p }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }).on('error', rej);
  });
}
async function waitFor(pred, ms) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try { const v = await pred(); if (v) return v; } catch (e) {}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('timeout');
}
function sanitize(name) {
  return (name || '').replace(/[/\\?%*:|"<>]/g, '_').replace(/^\.+/, '').trim();
}

(async () => {
  console.log('Conectando con la pestana de EducaPoker…');
  const tgt = await waitFor(async () => {
    const list = await getJSON('/json/list');
    return list.find(t => t.type === 'page' && /rangos\.educapoker\.com/.test(t.url));
  }, 30000);
  if (!tgt) throw new Error('No encuentro la pestana de rangos.educapoker.com');

  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method) events.push(m);
  };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise(r => {
    const mid = ++id; pending.set(mid, r);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  const evJ = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error('EXC: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
    return r.result?.result?.value;
  };
  await send('Runtime.enable');

  // --- Captura del UserData real desde la red (dispara una peticion nueva) ---
  console.log('Capturando el header UserData real de la app…');
  await send('Network.enable');
  const before = events.length;
  const fired = await evJ(`(function(){
    const sel = document.querySelector('select[name="project_selector"], select[name="projectSelector"], select');
    if (!sel) return 'no-select';
    const opts = [...sel.options].map(o=>o.value);
    const cur = sel.value;
    const next = opts.find(o=>o!==cur) || opts[0];
    sel.value = next; sel.dispatchEvent(new Event('change'));
    return 'cambio a ' + next;
  })()`);
  console.log('Disparado:', fired);
  await new Promise(r => setTimeout(r, 4000));

  let UD_LIVE = null;
  for (const e of events.slice(before)) {
    if (e.method === 'Network.requestWillBeSentExtraInfo') {
      const h = e.params.headers || {};
      for (const k of Object.keys(h)) {
        if (/userdata/i.test(k)) { try { UD_LIVE = JSON.parse(h[k]); } catch (err) { UD_LIVE = h[k]; } }
      }
    }
  }
  const baseUD = UD_LIVE || UD;
  console.log('UserData:', JSON.stringify(baseUD).slice(0, 200));

  // --- estructura por proyecto ---
  const getStructure = async (project) => {
    const ud = JSON.stringify(Object.assign({}, baseUD, { selectedProject: project }));
    const r = await evJ(`fetch('/back/api/structure', { headers: { 'UserData': ${JSON.stringify(ud)} } })
      .then(r => r.ok ? r.text() : Promise.reject('HTTP ' + r.status)).catch(e => 'ERROR:' + e)`);
    if (typeof r === 'string' && r.startsWith('ERROR')) throw new Error('estructura ' + project + ': ' + r);
    return JSON.parse(r);
  };

  // --- recorre y descarga ---
  let okCount = 0, errCount = 0;
  const queue = [];
  for (const project of PROJECTS) {
    let st;
    try { st = await getStructure(project); }
    catch (e) { console.log('AVISO:', e.message); continue; }

    for (const cat of Object.keys(st)) {
      if (!/universidad/i.test(cat)) continue;
      const catObj = st[cat];
      for (const sit of Object.keys(catObj || {})) {
        const sitObj = catObj[sit];
        if (!sitObj || typeof sitObj !== 'object' || Array.isArray(sitObj)) continue;
        for (const col of Object.keys(sitObj)) {
          const files = sitObj[col];
          if (!Array.isArray(files)) continue;
          for (const fname of files) {
            queue.push({ project, cat, sit, col, fname });
          }
        }
      }
    }
  }
  console.log('\nTotal tablas Universidad a descargar:', queue.length);

  for (let i = 0; i < queue.length; i++) {
    const q = queue[i];
    const imageUrl = q.cat + '/' + q.sit + '/' + q.col + '/' + q.fname;
    const ud = JSON.stringify(Object.assign({}, baseUD, { selectedProject: q.project }));
    const r = await evJ(`fetch('/back/api/image', { headers: { 'UserData': ${JSON.stringify(ud)}, 'ImageUrl': ${JSON.stringify(imageUrl)} } })
      .then(r => r.ok ? r.blob() : Promise.reject('HTTP ' + r.status))
      .then(b => new Promise((res2, rej2) => {
        const fr = new FileReader();
        fr.onload = () => res2(fr.result);
        fr.onerror = rej2;
        fr.readAsDataURL(b);
      })).catch(e => 'ERROR:' + e)`);
    if (typeof r === 'string' && r.startsWith('ERROR')) {
      errCount++;
      console.log('  ERR', imageUrl, '-', r);
      continue;
    }
    const m = r.match(/^data:([^;]+);base64,(.+)$/);
    if (!m) { errCount++; console.log('  ERR formato', imageUrl); continue; }
    const buf = Buffer.from(m[2], 'base64');
    const ext = path.extname(q.fname).toLowerCase() || '.jpg';
    const rel = path.join(sanitize(q.sit), '2_Universidad', sanitize(q.col), sanitize(path.basename(q.fname, path.extname(q.fname))) + ext);
    const full = path.join(OUT_ROOT, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, buf);
    okCount++;
    if ((i + 1) % 10 === 0 || i === queue.length - 1) {
      console.log(`  ... ${i + 1}/${queue.length} (${okCount} ok, ${errCount} err)`);
    }
  }
  console.log('\n=== RESUMEN: ' + okCount + ' descargadas, ' + errCount + ' errores ===');
  ws.close();
})().catch(e => { console.error('ERROR', e); process.exit(2); });