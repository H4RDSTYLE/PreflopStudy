'use strict';
const http = require('http');
function getJ(p) { return new Promise((res, rej) => http.get({ host: '127.0.0.1', port: Number(process.env.CDP_PORT) || 9222, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej)); }
async function waitFor(p, ms) { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await p(); if (v) return v; } catch (e) {} await new Promise(r => setTimeout(r, 150)); } throw new Error('timeout'); }
(async () => {
  const url = process.argv[2];
  const cx = +process.argv[3], cy = +process.argv[4], hx = +process.argv[5], hy = +process.argv[6];
  const tgt = await waitFor(async () => (await getJ('/json/list')).find(x => x.type === 'page'), 20000);
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise(r => { const mid = ++id; pending.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })); });
  const evJ = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception ? r.result.exceptionDetails.exception.description : r.result.exceptionDetails.text); return r.result && r.result.result ? r.result.result.value : undefined; };
  await evJ(`location.href=${JSON.stringify(url)}; true`);
  await new Promise(r => setTimeout(r, 1500));
  const expr = `(async function(){
    const img = new Image(); img.src = location.href;
    await new Promise((res,rej)=>{ img.onload=res; img.onerror=()=>rej('img-fail'); });
    const cv = document.createElement('canvas'); cv.width=img.naturalWidth; cv.height=img.naturalHeight;
    const ctx = cv.getContext('2d'); ctx.drawImage(img,0,0);
    const d = ctx.getImageData(0,0,cv.width,cv.height).data; const W=cv.width;
    const x0=Math.max(0,${cx}-${hx}),x1=Math.min(W,${cx}+${hx}),y0=Math.max(0,${cy}-${hy}),y1=Math.min(cv.height,${cy}+${hy});
    const cnt={}; let n=0,nDark=0;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const i=(y*W+x)*4; const r=d[i],g=d[i+1],b=d[i+2];
      const lum=0.299*r+0.587*g+0.114*b; n++;
      if(lum<72){nDark++;continue;}
      const key=(r>>4)+','+(g>>4)+','+(b>>4); cnt[key]=(cnt[key]||0)+1;
    }
    const top=Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,8);
    const imgW=img.naturalWidth, imgH=img.naturalHeight;
    return JSON.stringify({ imgW, imgH, box:[x0,x1,y0,y1], n, nDark, darkRatio:nDark/n, top });
  })()`;
  console.log(await evJ(expr));
  ws.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });