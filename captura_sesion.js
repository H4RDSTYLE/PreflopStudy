'use strict';
const http = require('http');
function getJSON(p){ return new Promise((res,rej)=>http.get({host:'127.0.0.1',port:9222,path:p},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej)); }
async function waitFor(p,ms){ const t=Date.now(); while(Date.now()-t<ms){ try{ const v=await p(); if(v) return v; }catch(e){} await new Promise(r=>setTimeout(r,200)); } throw new Error('timeout'); }

(async()=>{
  const tgt = await waitFor(async()=> (await getJSON('/json/list')).find(t=>t.type==='page' && /rangos\.educapoker\.com/.test(t.url)), 30000);
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  let id=0; const pending=new Map();
  const events=[];
  ws.onmessage=ev=>{ const m=JSON.parse(ev.data);
    if(m.id&&pending.has(m.id)){ pending.get(m.id)(m); pending.delete(m.id); }
    else if(m.method) events.push(m);
  };
  await new Promise(r=>ws.onopen=r);
  const send=(method,params={})=>new Promise(r=>{ const mid=++id; pending.set(mid,r); ws.send(JSON.stringify({id:mid,method,params})); });
  const evJ=async e=>{ const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true}); if(r.result?.exceptionDetails) throw new Error('EXC: '+r.result.exceptionDetails.text); return r.result?.result?.value; };
  await send('Runtime.enable');
  await send('Network.enable');

  console.log('Cookies actuales (rangos.educapoker.com):');
  const cookies = await send('Network.getAllCookies');
  const relevant = cookies.result.cookies.filter(c=>c.domain.includes('educapoker')||c.domain.includes('rangos'));
  relevant.forEach(c=>console.log('  ', c.name, '=', (c.value||'').slice(0,40), 'secure='+c.secure, 'httpOnly='+c.httpOnly));

  // Disparamos una nueva peticion de estructura cambiando el proyecto en la UI
  await evJ(`(function(){
    const sel = document.querySelector('select[name="project_selector"], select');
    if (!sel) return 'no-select';
    const opts = [...sel.options].map(o=>o.value);
    const cur = sel.value;
    const next = opts.find(o=>o!==cur) || opts[0];
    sel.value = next;
    sel.dispatchEvent(new Event('change'));
    return JSON.stringify({ cur, next, opts });
  })()`);
  console.log('Se ha disparado un cambio de proyecto, esperando peticiones…');
  await new Promise(r=>setTimeout(r,5000));

  const hits = events.filter(e=>e.method==='Network.requestWillBeSentExtraInfo' && /\/back\/api\//.test(e.params.requestId? e.params.requestId:''));
  console.log('\nEventos request extra info totales:', events.length);
  console.log('Requests a /back/api capturados:');
  events.filter(e=>e.method==='Network.requestWillBeSent').forEach(e=>{
    console.log('  ', e.params.request.method, e.params.request.url);
  });
  const structExtra = events.filter(e=>e.method==='Network.requestWillBeSentExtraInfo');
  structExtra.forEach(e=>{
    const h = e.params.headers || {};
    const url = e.params.headers ? (e.params.associatedCookies? null : null) : null;
    console.log('  requestWillBeSentExtraInfo ids:', e.params.requestId);
  });
  // Buscar el header UserData en los extraInfo
  let userDataHeader = null;
  console.log('\n--- extraInfo con cabeceras ---');
  for (const e of events){
    if (e.method==='Network.requestWillBeSentExtraInfo'){
      const h = e.params.headers||{};
      console.log('requestId:', e.params.requestId);
      console.log('  headers:', JSON.stringify(h).slice(0, 4000));
      if (h['UserData']){ userDataHeader = h['UserData']; console.log('\n*** Header UserData capturado ***\n', userDataHeader); }
    }
  }
  if (!userDataHeader) console.log('\n(No se capturo aun el header UserData)');
  ws.close();
})().catch(e=>{ console.error('ERROR', e); process.exit(2); });