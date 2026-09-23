'use strict';
const http = require('http');
function getJSON(p){ return new Promise((res,rej)=>http.get({host:'127.0.0.1',port:9222,path:p},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej)); }
async function waitFor(p,ms){ const t=Date.now(); while(Date.now()-t<ms){ try{ const v=await p(); if(v) return v; }catch(e){} await new Promise(r=>setTimeout(r,200)); } throw new Error('timeout'); }
const UD = {"sub":"569744","email":"hugomelalvarez@gmail.com","email_verified":false,"level":"useless","status":"Colegio","project":"MTT","staff":"FALSE","cash_status":"Colegio","spin_status":"Colegio","mtt_status":"Universidad","selectedProject":"MTT"};

(async()=>{
  const tgt = await waitFor(async()=> (await getJSON('/json/list')).find(t=>t.type==='page' && /rangos\.educapoker\.com/.test(t.url)), 30000);
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  let id=0; const pending=new Map();
  ws.onmessage=ev=>{ const m=JSON.parse(ev.data); if(m.id&&pending.has(m.id)){ pending.get(m.id)(m); pending.delete(m.id);} };
  await new Promise(r=>ws.onopen=r);
  const send=(method,params={})=>new Promise(r=>{ const mid=++id; pending.set(mid,r); ws.send(JSON.stringify({id:mid,method,params})); });
  const evJ=async e=>{ const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true}); if(r.result?.exceptionDetails) return 'EXC: '+(r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text); return r.result?.result?.value; };
  await send('Runtime.enable');

  const candidates = [
    'vsMTT/1_Open Raise/1_OR 0-15bb.jpg',
    'MTT/vsMTT/1_Open Raise/1_OR 0-15bb.jpg',
    'vsMTT/vsMTT/1_Open Raise/1_OR 0-15bb.jpg',
    '2_Universidad/vsMTT/1_Open Raise/1_OR 0-15bb.jpg',
    'MTT/2_Universidad/vsMTT/1_Open Raise/1_OR 0-15bb.jpg',
    '1_Open Raise/1_OR 0-15bb.jpg',
    'vsMTT/1_Open Raise',
    '2_Universidad/1_OR 0-15bb.jpg'
  ];
  for (const c of candidates){
    const r = await evJ(`fetch('/back/api/image',{headers:{'UserData': ${JSON.stringify(JSON.stringify(UD))},'ImageUrl': ${JSON.stringify(c)}}}).then(async r=>({status:r.status, type:r.headers.get('content-type'), len:(r.ok? (await r.blob()).size:0)})).catch(e=>'EXC:'+e)`);
    console.log(JSON.stringify(r), '<-', c);
  }
  ws.close();
})().catch(e=>{ console.error('ERROR', e); process.exit(2); });