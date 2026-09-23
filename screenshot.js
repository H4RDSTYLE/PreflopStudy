'use strict';
const http = require('http');
const fs = require('fs');
function getJSON(p){ return new Promise((res,rej)=>http.get({host:'127.0.0.1',port:9222,path:p},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej)); }
async function waitFor(p,ms){ const t=Date.now(); while(Date.now()-t<ms){ try{ const v=await p(); if(v) return v; }catch(e){} await new Promise(r=>setTimeout(r,200)); } throw new Error('timeout'); }

(async()=>{
  const tgt = await waitFor(async()=> (await getJSON('/json/list')).find(t=>t.type==='page' && /rangos\.educapoker\.com/.test(t.url)), 30000);
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  let id=0; const pending=new Map();
  ws.onmessage=ev=>{ const m=JSON.parse(ev.data); if(m.id&&pending.has(m.id)){ pending.get(m.id)(m); pending.delete(m.id);} };
  await new Promise(r=>ws.onopen=r);
  const send=(method,params={})=>new Promise(r=>{ const mid=++id; pending.set(mid,r); ws.send(JSON.stringify({id:mid,method,params})); });
  const evJ=async e=>{ const r=await send('Runtime.evaluate',{expression:e,awaitPromise:true,returnByValue:true}); if(r.result?.exceptionDetails) return 'EXC: '+(r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text); return r.result?.result?.value; };
  await send('Runtime.enable'); await send('Page.enable');

  await evJ(`(function(){
    const sel = document.querySelector('select[name="project_selector"], select');
    if (sel && [...sel.options].map(o=>o.value).includes('MTT')){
      sel.value='MTT'; sel.dispatchEvent(new Event('change'));
    }
    return true;
  })()`);
  await new Promise(r=>setTimeout(r,4000));
  await evJ(`(function(){
    const t=[...document.querySelectorAll('nz-tab, .ant-tabs-tab, .ant-tabs-tab-btn')].find(e=>/Universidad/i.test(e.textContent));
    if(t){ t.click(); return 'clicked'; }
    return 'no-tab';
  })()`);
  await new Promise(r=>setTimeout(r,5000));

  // dump DOM relevante: TODO el texto de la pagina principal
  const dump = await evJ(`(function(){
    const txt = document.body.innerText.slice(0, 3000);
    const imgs = [...document.querySelectorAll('img')].map(i=>i.src.slice(0,60)).filter(s=>!/^data:/.test(s)).slice(0,20);
    const sits = [...document.querySelectorAll('div,li,span,a')].map(e=>e.textContent.trim())
      .filter(t=>/^(3H|HU|Cash|MTT|vsMTT|VSMTT|VS MTT)$/.test(t)||t.startsWith('vsMTT')||t.startsWith('vs MTT'))
      .slice(0,20);
    return JSON.stringify({ txt, imgs, sits });
  })()`);
  console.log(dump);

  const shot = await send('Page.captureScreenshot', { format:'png' });
  fs.writeFileSync('C:\\Users\\hugo\\Desktop\\PreflopStudy\\_pantalla.png', Buffer.from(shot.result.data, 'base64'));
  console.log('Screenshot guardado');
  ws.close();
})().catch(e=>{ console.error('ERROR', e); process.exit(2); });