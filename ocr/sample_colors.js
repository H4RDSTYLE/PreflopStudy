'use strict';
/* sample_colors.js — con la geometría (mats.json) muestrea el color dominante de cada celda. */
const http = require('http');
const fs = require('fs');
const path = require('path');

function getJ(p) { return new Promise((res, rej) => http.get({ host: '127.0.0.1', port: Number(process.env.CDP_PORT) || 9222, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej)); }
async function waitFor(p, ms) { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await p(); if (v) return v; } catch (e) {} await new Promise(r => setTimeout(r, 150)); } throw new Error('timeout'); }

const [imgUrl, matsPath, outPath] = process.argv.slice(2);
const mats = JSON.parse(fs.readFileSync(matsPath, 'utf8').replace(/^\uFEFF/, ''));

(async () => {
  const tgt = await waitFor(async () => (await getJ('/json/list')).find(x => x.type === 'page'), 20000);
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise(r => { const mid = ++id; pending.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })); });
  const evJ = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception ? r.result.exceptionDetails.exception.description : r.result.exceptionDetails.text); return r.result && r.result.result ? r.result.result.value : undefined; };

  await evJ(`location.href=${JSON.stringify(imgUrl)}; true`);
  await new Promise(r => setTimeout(r, 1800));

  const matsJSON = JSON.stringify(mats.map(m => ({ yc: m.yc, cols: m.cols, rowsY: m.rowsY, cells: m.cells.map(r => r.map(c => ({ row: c.row, col: c.col, x: c.x, y: c.y }))) })));
  const expr = `(async function(){
    const mats = ${matsJSON};
    const img = new Image();
    img.src = location.href;
    await new Promise((res,rej)=>{ img.onload=res; img.onerror=()=>rej('img-fail'); });
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    const W = cv.width;
    const samp = (cx, cy, hx, hy) => {
      // caja interior sin bordes ni texto: excluye píxeles oscuros (texto) 
      const x0 = Math.max(0, Math.round(cx - hx)), x1 = Math.min(W, Math.round(cx + hx));
      const y0 = Math.max(0, Math.round(cy - hy)), y1 = Math.min(cv.height, Math.round(cy + hy));
      const cnt = {};
      let n = 0, nDark = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * W + x) * 4;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        n++;
        if (lum < 72) { nDark++; continue; }          // texto negro
        const key = (r >> 4) + ',' + (g >> 4) + ',' + (b >> 4);
        cnt[key] = (cnt[key] || 0) + 1;
      }
      if (nDark / n > 0.55) {                          // celda llena de texto
        const keys = Object.keys(cnt);
        if (!keys.length) return '__FOLD__';
        const k = keys.sort((a, b) => cnt[b] - cnt[a])[0].split(',');
        return '#' + [parseInt(k[0], 10) * 16 + 8, parseInt(k[1], 10) * 16 + 8, parseInt(k[2], 10) * 16 + 8].map(v => v.toString(16).padStart(2, '0')).join('');
      }
      if (!Object.keys(cnt).length) return '__FOLD__';
      const k = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0].split(',');
      const rr = parseInt(k[0], 10) * 16 + 8, gg = parseInt(k[1], 10) * 16 + 8, bb = parseInt(k[2], 10) * 16 + 8;
      if (Math.max(rr, gg, bb) - Math.min(rr, gg, bb) < 16) return '__FOLD__';   // blanco/gris -> vacío
      const r0 = cnt[k.join(',')] || 0;
      if (r0 < 4) return '__FOLD__';
      return '#' + [rr, gg, bb].map(v => v.toString(16).padStart(2, '0')).join('');
    };
    const out = mats.map(m => {
      const gx = m.cols[1] - m.cols[0] || 50, gy = m.rowsY[1] - m.rowsY[0] || 40;
      const hx = Math.max(6, Math.round(gx * 0.36)), hy = Math.max(5, Math.round(gy * 0.35));
      // las coordenadas de la rejilla son la esquina superior-izquierda del texto de cada celda;
      // el centro real de la celda está ~20% gx a la derecha y ~30% gy abajo.
      const ox = Math.round(gx * 0.20), oy = Math.round(gy * 0.30);
      return m.cells.map(row => row.map(c => ({ color: samp(c.x + ox, c.y + oy, hx, hy) })));
    });
    return JSON.stringify(out);
  })()`;
  const r = await evJ(expr);
  if (typeof r === 'string' && r.startsWith('EXC')) { console.error(r); process.exit(2); }
  fs.writeFileSync(outPath, r);
  console.log('COLORS ok bytes=', r.length);
  ws.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });