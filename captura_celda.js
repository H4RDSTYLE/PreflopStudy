'use strict';
const http = require('http');
const fs = require('fs');
function getJSON(p){ return new Promise((res,rej)=>http.get({host:'127.0.0.1',port:9222,path:p},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej)); }
async function waitFor(p,ms){ const t=Date.now(); while(Date.now()-t<ms){ try{ const v=await p(); if(v) return v; }catch(e){} await new Promise(r=>setTimeout(r,200)); } throw new Error('timeout'); }

(async()=>{
  const tgt = await waitFor(async()=> (await getJSON('/json/list')).find(t=>t.type==='page' && /rangos\.educapoker\.com/.test(t.url)), 30000);
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  let id=0; const pending=new Map();
  const events=[];
  ws.onmessage=ev=>{ const m=JSON.parse(ev.data); if(m.id&&pending.has(m.id)){ pending.get(m.id)(m); pending.delete(m.id);} else if(m.method) events.push(m); };
  await new Promise(r=>ws.onopen=r);
  const send=(method,params={})=>new Promise(r=>{ const mid=++id; pending.set(mid,r); ws.send(JSON.stringify({id:mid,method,params})); });
  const evJ=async e=>{ const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true}); if(r.result?.exceptionDetails) return 'EXC: '+(r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text); return r.result?.result?.value; };
  await send('Runtime.enable'); await send('Network.enable');

  const cell = await evJ(`(function(){
    const els=[...document.querySelectorAll('div,span,li,button,a,nz-tab')].filter(e=>e.children.length===0 || e.childNodes.length===1);
    const t = els.find(e=>e.textContent.trim()==='OR 10-12bb');
    if(!t){ // buscar columna Open Raise -> any cell
      const s=[...document.querySelectorAll('div,span,li,a')].find(e=>e.textContent.trim()==='OR 10-15bb');
      if(s){ s.click(); return 'click: OR 10-15bb'; }
      return 'no-cell: '+els.map(e=>e.textContent.trim()).filter(x=>x.startsWith('OR')).slice(0,10).join(' | ');
    }
    t.click(); return 'click: OR 10-12bb';
  })()`);
  console.log(cell);
  await new Promise(r=>setTimeout(r,5000));

  const reqs = events.filter(e=>e.method==='Network.requestWillBeSent' && /\/back\/api\/image/.test(e.params.request.url));
  console.log('Peticiones imagen:', reqs.length);
  reqs.forEach(e=>console.log('  url:', e.params.request.url));

  events.filter(e=>e.method==='Network.requestWillBeSentExtraInfo').forEach(e=>{
    const h=e.params.headers||{};
    for(const k of Object.keys(h)) if(/imageurl/i.test(k)) console.log('   ImageUrl header:', h[k]);
  });

  // Capturar el cuerpo de una imagen para confirmar que se puede obtener
  if (reqs.length){
    const rid = reqs[0].params.requestId;
    const body = await send('Network.getResponseBody', { requestId: rid });
    if (body.result){
      const b = body.result.body;
      console.log('Respuesta imagen: encoded=', body.result.base64Encoded, 'len=', b.length);
      // lo guardamos para inspeccionarlo
      fs.writeFileSync('C:\\Users\\hugo\\AppData\\Local\\Temp\\opencode\\educapoker\\probe_img.' + (body.result.base64Encoded? 'b64':'txt'), b.slice(0,100000));
    } else console.log('getResponseBody err', JSON.stringify(body));
  }
  ws.close();
})().catch(e=>{ console.error('ERROR', e); process.exit(2); });