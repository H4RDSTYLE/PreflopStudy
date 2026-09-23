'use strict';
/* =========================================================
   modes.js — modos de estudio alternativos a las flashcards
   'construir' → construye el rango de cada spot rellenando la matriz 13×13
   'rafaga'    → SÍ/NO rápido: ¿está esta mano dentro del rango del spot?
   ========================================================= */

/* ---------- Construye el rango ---------- */
function buildConstructSession(cfg) {
  const limit = parseInt(cfg.limit, 10) || 0;
  const list = (cfg.sitIds || []).filter(sitId => {
    const r = getRange(sitId);
    return r && r.edited && r.matrix && handsInMatrix(r.matrix).length;
  }).map(sitId => ({ sitId }));
  if (limit > 0 && list.length > limit) list.length = limit;
  session = {
    kind: 'construir',
    list, idx: 0, done: false,
    cnt: { ok: 0, warn: 0, bad: 0 },
    construct: {},
  };
  return session;
}

/* Manos realmente "jugadas" (línea no-fold con frecuencia > 1%) */
function spotPlayedSet(sitId) {
  const r = getRange(sitId);
  const set = new Set();
  (handsInMatrix(r.matrix) || []).forEach(h => {
    if (linesWithImplicitFold(r.matrix[h]).some(l => l.action !== 'fold' && l.freq > 0.01)) set.add(h);
  });
  return set;
}

function renderConstruct() {
  const stage = document.getElementById('studyStage');
  if (session.done) return renderConstructSummary();
  const sitId = session.list[session.idx].sitId;
  const r = getRange(sitId);
  const rec = session.construct[sitId] = session.construct[sitId] || { sel: new Set(), done: false };
  if (rec.done) return renderConstructGrade(sitId);

  const scene = buildScene(sitId);
  const seats = sceneSeatsHTML(scene);
  const seq = sceneSeqHTML(scene);

  stage.innerHTML = `
    <div class="qbar"><div class="fill" style="width:${Math.round(session.idx / session.list.length * 100)}%"></div></div>
    <div class="qpath"><b>${session.idx + 1}</b> / ${session.list.length} · Construye el rango</div>
    <div class="qcard">
      <div class="qspot">${esc(r.label)}</div>
      <div class="qmeta">${esc(r.sub)} · Stack ref ${esc(r.stack)}bb${scene.intro ? ' · ' + esc(scene.intro) : ''}</div>
      <div class="qtable-wrap"><div class="table-oval"></div>${seats}</div>
      <div class="qseq" style="margin-bottom:4px">${seq}</div>
      <div class="qsizing">Tamaño en juego: <b>${esc(formatSizingFor(r))}</b>${scene.decisión ? ' · <span class="qdec">' + esc(scene.decisión) + '</span>' : ''}</div>
    </div>
    <div class="construct-hint">Toca las manos que <b>sí jugarías</b> en este spot. Al terminar, <b>Comprobar</b>.</div>
    <div class="bc-table" id="bcTable"></div>
    <div class="row" style="gap:8px; margin-top:12px">
      <button class="hbtn" id="bcClear">Limpiar</button>
      <button class="hbtn primary" id="bcCheck" style="flex:1">Comprobar</button>
    </div>`;

  renderConstructMatrix(stage, r, rec, false);

  stage.querySelector('#bcClear').onclick = () => {
    rec.sel = new Set();
    renderConstructMatrix(stage, r, rec, false);
  };
  stage.querySelector('#bcCheck').onclick = () => {
    if (rec.sel.size === 0) return toast('Rellena al menos una mano');
    gradeConstruct(sitId);
    renderConstruct();
  };
}

function renderConstructMatrix(stage, r, rec, graded) {
  const box = stage.querySelector('#bcTable');
  const inSet = spotPlayedSet(r.id);
  let rows = '';
  for (let i = 0; i < 13; i++) {
    let cells = `<td class="head">${RANKS[i]}</td>`;
    for (let j = 0; j < 13; j++) {
      const h = HANDS13[i][j];
      let cls = 'cell';
      if (graded) {
        if (rec.sel.has(h) && inSet.has(h)) cls += ' good';
        else if (rec.sel.has(h)) cls += ' bad';
        else if (inSet.has(h)) cls += ' miss';
        else cls += ' tn';
      } else if (rec.sel.has(h)) {
        cls += ' on';
      }
      cells += `<td class="${cls}" data-hand="${h}">${h}</td>`;
    }
    rows += `<tr><td class="head">${RANKS[i]}</td>${cells}</tr>`;
  }
  const heads = RANKS.split('').map(rk => `<td class="head">${rk === 'T' ? '10' : rk}</td>`).join('');
  box.innerHTML = `<table><tr><td class="head"></td>${heads}</tr>${rows}</table>`;

  if (graded) return;
  box.querySelectorAll('td.cell').forEach(td => {
    td.onclick = () => {
      const h = td.dataset.hand;
      if (rec.sel.has(h)) { rec.sel.delete(h); td.classList.remove('on'); }
      else { rec.sel.add(h); td.classList.add('on'); }
    };
  });
}

function gradeConstruct(sitId) {
  const r = getRange(sitId);
  const rec = session.construct[sitId];
  const inSet = spotPlayedSet(sitId);
  let tp = 0, fp = 0, fn = 0;
  rec.sel.forEach(h => { if (inSet.has(h)) tp++; else fp++; });
  inSet.forEach(h => { if (!rec.sel.has(h)) fn++; });
  const prec = (tp + fp) ? tp / (tp + fp) : 0;
  const recall = (tp + fn) ? tp / (tp + fn) : 0;
  // registrar en el progreso (por mano) para retroalimentar la priorización
  inSet.forEach(h => recordGrade(sitId, h, rec.sel.has(h) ? 'ok' : 'bad'));
  rec.sel.forEach(h => { if (!inSet.has(h)) recordGrade(sitId, h, 'bad'); });
  rec.grade = { tp, fp, fn, prec, recall };
  rec.done = true;
  return rec.grade;
}

function renderConstructGrade(sitId) {
  const stage = document.getElementById('studyStage');
  const r = getRange(sitId);
  const rec = session.construct[sitId];
  const scene = buildScene(sitId);
  const g = rec.grade || { tp: 0, fp: 0, fn: 0, prec: 0, recall: 0 };
  const pct = Math.round((g.prec + g.recall) / 2 * 100);
  renderConstructMatrix(stage, r, rec, true);
  stage.querySelector('#bcTable').insertAdjacentHTML('beforebegin', `
    <div class="qcard" style="padding:14px">
      <div class="qspot">${esc(r.label)} — resultado</div>
      <div class="construct-score">
        <div class="cs-big">${pct}%</div>
        <div class="cs-row"><span>Precisión (lo puesto es correcto)</span><b>${Math.round(g.prec * 100)}%</b></div>
        <div class="cs-row"><span>Recuerdo (acertaste el rango)</span><b>${Math.round(g.recall * 100)}%</b></div>
        <div class="cs-row"><span>✓ bien</span><b class="ok">${g.tp}</b></div>
        <div class="cs-row"><span>✗ de más</span><b class="bad">${g.fp}</b></div>
        <div class="cs-row"><span>✗ olvidadas</span><b class="bad">${g.fn}</b></div>
      </div>
      <div class="legend" style="justify-content:center; margin-top:10px">
        <span><i style="background:#2e7d6b"></i>Correcta</span>
        <span><i style="background:#d34a3f"></i>De más</span>
        <span><i style="background:#5b84c4"></i>Olvidada</span>
      </div>
    </div>`);
  stage.querySelector('#bcClear').remove();
  stage.querySelector('#bcCheck').textContent = (session.idx + 1 >= session.list.length) ? 'Ver resumen' : 'Siguiente spot';
  stage.querySelector('#bcCheck').onclick = nextConstruct;
}

function nextConstruct() {
  session.idx++;
  if (session.idx >= session.list.length) session.done = true;
  renderConstruct();
}

function renderConstructSummary() {
  const stage = document.getElementById('studyStage');
  let sumP = 0, sumR = 0, n = 0;
  session.list.forEach(e => {
    const g = session.construct[e.sitId] && session.construct[e.sitId].grade;
    if (!g) return;
    sumP += g.prec; sumR += g.recall; n++;
  });
  const avgP = n ? Math.round(sumP / n * 100) : 0;
  const avgR = n ? Math.round(sumR / n * 100) : 0;
  const avg = Math.round((avgP + avgR) / 2);
  stage.innerHTML = `
    <div class="qsummary">
      <div class="big">${avg}%</div>
      <div class="muted">${n} spots · precisión media ${avgP}% · recuerdo medio ${avgR}%</div>
      <button class="hbtn primary" id="again" style="margin:0 6px 6px">Repetir sesión</button>
      <button class="hbtn" id="back2">Otra configuración</button>
    </div>`;
  document.getElementById('again').onclick = () => {
    const sitIds = session.list.map(e => e.sitId);
    const n0 = session.list.length;
    session = null;
    buildConstructSession({ sitIds });
    session.list = session.list.slice(0, n0);
    renderConstruct();
  };
  document.getElementById('back2').onclick = () => { goToSetup = true; renderStudy(true); };
}

/* ---------- Ráfaga SÍ/NO ---------- */
function buildRafagaSession(cfg) {
  const limit = parseInt(cfg.limit, 10) || 0;
  const items = [];
  (cfg.sitIds || []).forEach(sitId => {
    const r = getRange(sitId);
    if (!r || !r.edited || !r.matrix) return;
    const inSet = spotPlayedSet(sitId);
    if (!inSet.size) return;
    const inHands = [...inSet];
    // candidatos fuera: vecinos de manos jugadas que NO estén en el rango
    const outs = new Set();
    inHands.forEach(h => handNeighbors(h).forEach(n => { if (!inSet.has(n)) outs.add(n); }));
    const outHands = [...outs];
    inHands.sort(() => Math.random() - 0.5);
    outHands.sort(() => Math.random() - 0.5);
    const nIn = Math.min(8, inHands.length);
    const nOut = Math.min(nIn, outHands.length);
    for (let i = 0; i < nIn; i++) items.push(rafagaItem(sitId, inHands[i], true));
    for (let i = 0; i < nOut; i++) items.push(rafagaItem(sitId, outHands[i], false));
  });
  if (!items.length) return (session = null);
  // priorizar las que peor recuerdo (dentro del rango)
  if (cfg.prioritize !== false) {
    items.sort((a, b) =>
      (b.expect ? weightFor(getStat(b.sitId, b.hand), b.sitId, b.hand) : 1) -
      (a.expect ? weightFor(getStat(a.sitId, a.hand), a.sitId, a.hand) : 1));
  }
  shuffle(items);
  if (limit > 0 && items.length > limit) items.length = limit;
  session = {
    kind: 'rafaga', list: items, idx: 0, done: false,
    cnt: { ok: 0, warn: 0, bad: 0 },
  };
  return session;
}

function rafagaItem(sitId, hand, expect) {
  return { sitId, hand, expect, cards: randomDeal(hand) };
}

/* Vecinos plausibles (manos parecidas) de una clase de mano */
function handNeighbors(h) {
  const out = [];
  if (h.length === 2) {
    const i = rankIndex(h[0]);
    if (i > 0) out.push(RANKS[i - 1] + RANKS[i - 1]);
    if (i < 12) out.push(RANKS[i + 1] + RANKS[i + 1]);
    return out.filter(x => isValidClass(x));
  }
  const a = rankIndex(h[0]), b = rankIndex(h[1]);
  const hi = Math.min(a, b), lo = Math.max(a, b);
  const t = h[2];
  const set = new Set();
  const add = (x, y, s) => {
    if (x < 0 || x > 12 || y < 0 || y > 12 || x === y) return;
    set.add(canonical(x, y, s));
  };
  add(hi, lo + 1, t === 's');
  add(hi, lo - 1, t === 's');
  add(hi + 1, lo, t === 's');
  add(hi - 1, lo, t === 's');
  add(hi, lo, t !== 's');
  return [...set].filter(x => isValidClass(x));
}

function renderRafaga() {
  const stage = document.getElementById('studyStage');
  if (session.done) return renderRafagaSummary();
  const item = session.list[session.idx];
  const r = getRange(item.sitId);
  const scene = buildScene(item.sitId);
  const cards = item.cards.map(c =>
    `<div class="pc ${cardRed(c) ? 'red' : ''}">${c[0]}<span class="suit">${cardSuitSym(c)}</span></div>`).join('');
  const seats = sceneSeatsHTML(scene);
  const seq = sceneSeqHTML(scene);

  stage.innerHTML = `
    <div class="qbar"><div class="fill" style="width:${Math.round(session.idx / session.list.length * 100)}%"></div></div>
    <div class="qpath"><b>${session.idx + 1}</b> / ${session.list.length} · Ráfaga SÍ/NO · <span id="qCounts">${session.cnt.ok} ✓ ${session.cnt.bad} ✗</span></div>
    <div class="qcard">
      <div class="qspot">${esc(r.label)}</div>
      <div class="qmeta">${esc(r.sub)} · Stack ref ${esc(r.stack)}bb${scene.intro ? ' · ' + esc(scene.intro) : ''}</div>
      <div class="qtable-wrap">
        <div class="table-oval"></div>
        <div class="qhand">${cards}</div>
        ${seats}
      </div>
      <div class="qseq" style="margin-bottom:4px">${seq}</div>
    </div>
    <div class="construct-hint">¿Esta mano está en el rango del spot?</div>
    <div class="qanswers" id="qans">
      <button data-v="1"><span>SÍ · está</span><span class="freq">en el rango</span></button>
      <button data-v="0"><span>NO · no está</span><span class="freq">fuera</span></button>
    </div>
    <div class="qanswer-info hidden" id="qaf"></div>
    <div class="qgrades hidden" id="qnext">
      <button class="g3" style="flex:1" id="rafNext">Siguiente ›</button>
    </div>`;

  document.querySelectorAll('#qans button').forEach(btn => {
    btn.onclick = () => decideRafaga(item, btn.dataset.v === '1');
  });
}

function decideRafaga(item, yes) {
  const correct = yes === item.expect;
  const r = getRange(item.sitId);
  const solTxt = item.expect
    ? rafagaSolutionText(r, item.hand)
    : 'No está en el rango (fold)';
  recordGrade(item.sitId, item.hand, correct ? 'ok' : 'bad');
  session.cnt[correct ? 'ok' : 'bad']++;

  const allBtns = [...document.querySelectorAll('#qans button')];
  allBtns.forEach(b => {
    const isSí = b.dataset.v === '1';
    b.classList.toggle('correct', isSí === item.expect);
    if ((isSí === yes) && !correct) b.classList.add('wrong');
    b.style.pointerEvents = 'none';
  });

  const info = document.getElementById('qaf');
  info.innerHTML = (correct
    ? '<span class="ok">✓ ¡Clavada!</span> '
    : '<span class="bad">✗ No era eso.</span> ') + 'Solución: ' + esc(solTxt);
  info.classList.remove('hidden');
  document.getElementById('qCounts').textContent = `${session.cnt.ok} ✓ ${session.cnt.bad} ✗`;
  document.getElementById('qnext').classList.remove('hidden');
  document.getElementById('rafNext').onclick = () => {
    session.idx++;
    if (session.idx >= session.list.length) session.done = true;
    renderRafaga();
  };
}

function rafagaSolutionText(r, hand) {
  const lines = linesWithImplicitFold((r.matrix && r.matrix[hand]) || []);
  const acts = lines.filter(l => l.freq > 0)
    .map(l => {
      const sz = (r.sizes && r.sizes[l.action]) || (l.action === 'jam' ? r.stack : null);
      const lab = (ACTION_LABEL[l.action] || l.action);
      const name = sz != null ? `${lab} ${fmtBB(sz)}bb` : lab;
      return `${name}${l.tag ? ' ' + l.tag : ''} ${Math.round(l.freq * 100)}%`;
    })
    .join(' · ');
  return acts || 'Fold';
}

function renderRafagaSummary() {
  const stage = document.getElementById('studyStage');
  const n = session.list.length;
  const pct = Math.round((session.cnt.ok / Math.max(n, 1)) * 100);
  stage.innerHTML = `
    <div class="qsummary">
      <div class="big">${pct}%</div>
      <div class="muted">${n} manos · ${session.cnt.ok} ✓ aciertos · ${session.cnt.bad} ✗ fallos</div>
      <div class="nums">
        <div class="num n1"><b>${session.cnt.ok}</b>✓</div>
        <div class="num n3"><b>${session.cnt.bad}</b>✗</div>
      </div>
      <button class="hbtn primary" id="again" style="margin:0 6px 6px">Repetir sesión</button>
      <button class="hbtn" id="back2">Otra configuración</button>
    </div>`;
  document.getElementById('again').onclick = () => {
    const n0 = session.list.length;
    const sitIds = session.list.map(e => e.sitId);
    session = null;
    buildRafagaSession({ sitIds, limit: n0 });
    renderRafaga();
  };
  document.getElementById('back2').onclick = () => { goToSetup = true; renderStudy(true); };
}

/* ---------- Helpers de escena (reutilizan el markup de las flashcards) ---------- */
function sceneSeatsHTML(scene) {
  return (scene.seats || []).map(s => {
    const c = SEAT_COORDS[s.pos] || { left: '45%', top: '45%' };
    const cls = ['seat'];
    if (s.cls) cls.push(s.cls);
    return `<div class="${cls.join(' ')}" style="left:${c.left};top:${c.top}">
      <div class="spos">${posLabel(s.pos)}</div>
      <div class="sact">${s.text}</div>
    </div>`;
  }).join('');
}

function sceneSeqHTML(scene) {
  return scene.seq.map(s => {
    const hero = s.hero ? ' hero' : '';
    const who = s.player === 'tú' ? 'Tú' : posLabel(s.player);
    return `<span class="seg${hero}"><b>${esc(who)}</b> ${esc(s.text)}</span>`;
  }).join('<span class="arrow">›</span>');
}