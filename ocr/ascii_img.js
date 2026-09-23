'use strict';
/* ascii_img.js — imprime un mapa ASCII grueso de una imagen (densidad de texto + color).
   Uso: node ocr/ascii_img.js <imgUrl> [cols] [rows] */
const http = require('http');
function getJ(p) { return new Promise((res, rej) => http.get({ host: '127.0.0.1', port: Number(process.env.CDP_PORT) || 9222, path: p }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej)); }
async function waitFor(p, ms) { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await p(); if (v) return v; } catch (e) {} await new Promise(r => setTimeout(r, 150)); } throw new Error('timeout'); }
(async () => {
  const url = process.argv[2];
  const COLS = +(process.argv[3] || 110), ROWS = +(process.argv[4] || 56);
  const tgt = await waitFor(async () => (await getJ('/json/list')).find(x => x.type === 'page'), 20000);
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  let id = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise(r => { const mid = ++id; pending.set(mid, r); ws.send(JSON.stringify({ id: mid, method, params })); });
  const evJ = async e => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.result && r.result.exceptionDetails) return 'EXC: ' + (r.result.exceptionDetails.exception ? r.result.exceptionDetails.exception.description : r.result.exceptionDetails.text); return r.result && r.result.result ? r.result.result.value : undefined; };
  await evJ(`location.href=${JSON.stringify(url)}; true`);
  await new Promise(r => setTimeout(r, 1400));
  const expr = `(()=>{
    const img=new Image(); img.src=location.href;
    return new Promise(resolve=>{
      img.onload=()=>{
        const W=img.naturalWidth,H=img.naturalHeight;
        const cv=document.createElement('canvas');cv.width=W;cv.height=H;
        const ctx=cv.getContext('2d');ctx.drawImage(img,0,0);
        const d=ctx.getImageData(0,0,W,H).data;
        const bw=Math.ceil(W/${COLS}), bh=Math.ceil(H/${ROWS});
        const out=[];
        for(let br=0;br<${ROWS};br++){
          let line='';
          for(let bc=0;bc<${COLS};bc++){
            let n=0, non=0, col=0;
            for(let y=br*bh;y<Math.min((br+1)*bh,H);y++)for(let x=bc*bw;x<Math.min((bc+1)*bw,W);x++){
              const i=(y*W+x)*4; const r=d[i],g=d[i+1],b=d[i+2];
              const lum=0.299*r+0.587*g+0.114*b; n++;
              if(lum<230){non++; const mx=Math.max(r,g,b),mn=Math.min(r,g,b); if(mx-mn>20){col++;} }
            }
            const c=col/n, nb=non/n;
            line += nb>0.12?'#': c>0.05?'c': non>0?'+':'.';
          }
          out.push(String(br*bh).padStart(4)+' '+line);
        }
        resolve(out.join('\\n'));
      };
      img.onerror=()=>resolve('IMG-FAIL');
    });
  })()`;
  console.log(await evJ(expr));
  ws.close(); process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });