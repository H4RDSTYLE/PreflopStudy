'use strict';
const http = require('http');
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

  // 1) Seleccionar el proyecto MTT en el selector superior
  const proj = await evJ(`(function(){
    const sel = document.querySelector('select[name="project_selector"], select[name="projectSelector"], select');
    if (!sel) return 'no-select';
    const opts = [...sel.options].map(o=>o.value);
    if (!opts.includes('MTT')) return 'sin-MTT: '+JSON.stringify(opts);
    sel.value = 'MTT';
    sel.dispatchEvent(new Event('change'));
    return 'proyecto-> MTT';
  })()`);
  console.log(proj);
  await new Promise(r=>setTimeout(r,4000));

  // Mostrar los textos de las pestanas disponibles
  const tabs = await evJ(`[...document.querySelectorAll('nz-tab, .ant-tabs-tab, .ant-tabs-tab-btn')].map(e=>e.textContent.trim()).filter(t=>t)`);
  console.log('Textos de pestanas visibles:', JSON.stringify(tabs));

  // Clic en la pestana que contenga Universidad
  const clicked = await evJ(`(function(){
    const els = [...document.querySelectorAll('nz-tab, .ant-tabs-tab, .ant-tabs-tab-btn')];
    const t = els.find(e=>/Universidad/i.test(e.textContent));
    if (!t) return 'no-tab';
    t.click(); return 'click: '+t.textContent.trim();
  })()`);
  console.log(clicked);
  await new Promise(r=>setTimeout(r,3000));

  // Ahora pestanas de situacion y clic en una (ej. vsMTT / Cash / MTT / 3H / HU)
  const sitClicked = await evJ(`(function(){
    const els = [...document.querySelectorAll('nz-tab, .ant-tabs-tab, .ant-tabs-tab-btn')];
    const t = els.find(e=>/^(vsMTT|MTT|Cash|3H|HU)$/.test(e.textContent.trim()));
    if (!t) return 'no-sit: ' + els.map(e=>e.textContent.trim()).join(',');
    t.click(); return 'click: '+t.textContent.trim();
  })()`);
  console.log(sitClicked);
  await new Promise(r=>setTimeout(r,10000));

  console.log('\nTodas las peticiones /back/api:');
  events.filter(e=>e.method==='Network.requestWillBeSent').forEach(e=>{
    if (/\/back\/api\//.test(e.params.request.url)) console.log('  ', e.params.request.method, e.params.request.url);
  });
  console.log('\nHeaders ImageUrl/UserData (insensible a mayusculas):');
  events.filter(e=>e.method==='Network.requestWillBeSentExtraInfo').forEach(e=>{
    const h = e.params.headers||{};
    for (const k of Object.keys(h)){
      if (/imageurl|userdata/i.test(k)) console.log('   ', k, '=', h[k]);
    }
  });
  console.log('Total eventos:', events.length);
  ws.close();
})().catch(e=>{ console.error('ERROR', e); process.exit(2); });