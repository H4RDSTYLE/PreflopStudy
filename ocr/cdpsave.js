'use strict';
/* cdpsave.js — extrae cookies (Network.getCookies) y descarga una URL con ellas a un archivo.
   Uso: node cdpsave.js <url> <outFile> [extraCookie] */
const http = require('http');
const https = require('https');
const fs = require('fs');
const urlArg = process.argv[2];
const outFile = process.argv[3];
const extra = process.argv[4] || '';
function getJ(p) { return new Promise((res, rej) => http.get({ host: '127.0.0.1', port: Number(process.env.CDP_PORT) || 9222, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej)); }
async function waitFor(p, ms) { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await p(); if (v) return v; } catch (e) {} await new Promise(r => setTimeout(r, 150)); } throw new Error('timeout'); }
(async () => {
  const tgt = await waitFor(async () => (await getJ('/json/list')).find(x => x.type === 'page'), 20000);
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise(r => { const mid = ++id; pending.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })); });
  const ck = await send('Network.getCookies', { urls: [urlArg] });
  const cookies = (ck.result && ck.result.cookies) || [];
  const cj = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  const u = new URL(urlArg);
  const mod = u.protocol === 'https:' ? https : http;
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153 Safari/537.36', 'Referer': u.origin + '/', 'Cookie': cj + (extra ? '; ' + extra : '') };
  const req = mod.get({ hostname: u.hostname, port: u.port || undefined, path: u.pathname + u.search, headers }, r => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { console.error('redirect ->', r.headers.location, 'cookies:', cj.slice(0, 60)); process.exit(3); }
    const chunks = []; r.on('data', c => chunks.push(c)); r.on('end', () => { fs.writeFileSync(outFile, Buffer.concat(chunks)); console.log('saved', outFile, Buffer.concat(chunks).length, 'bytes, status', r.statusCode, 'cookies', cookies.length); ws.close(); process.exit(0); });
  });
  req.on('error', e => { console.error('ERR', e.message); process.exit(2); });
})().catch(e => { console.error('FATAL', e); process.exit(2); });