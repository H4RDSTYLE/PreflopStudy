'use strict';
/* =========================================================
   app.js — navegación, sizings, estudio, progreso, init
   ========================================================= */

const ACTIVE_VIEW = 'view-';

const ACTION_NAME = { raise: 'Bet', '3bet': '3bet', '4bet': '4bet', sqz: 'Squeeze', call: 'Call', fold: 'Fold', jam: 'All-in' };

/* Etiqueta con tamaño real (r.sizes viene del scrape) */
function sizeLabel(r, a) {
  if (a === 'fold') return 'Fold';
  const s = (r && r.sizes) || {};
  if (a === 'jam') return 'All-in ' + ((r && r.stack) || '?') + 'bb';
  const bb = s[a];
  if (bb) return (ACTION_NAME[a] || a) + ' ' + fmtBB(bb) + 'bb';
  return ACTION_NAME[a] || a;
}

function showView(name) {
  const v = document.getElementById(ACTIVE_VIEW + name);
  if (!name) return;
  document.querySelectorAll('.view').forEach(el => el.classList.remove('on'));
  if (v) v.classList.add('on');
  document.querySelectorAll('nav.bottom button').forEach(b => b.classList.toggle('on', b.dataset.view === name));
  if (name === 'rangos') renderRangeList(document.getElementById('rangeSearch').value);
  if (name === 'sizings') renderSizings();
  if (name === 'estudiar') renderStudy(goToSetup !== true);
  if (name === 'progreso') renderProgress();
  window.scrollTo(0, 0);
}

let goToSetup = false;

function bindNav() {
  document.querySelectorAll('nav.bottom button').forEach(b => {
    b.onclick = () => {
      if (b.dataset.view === 'estudiar') goToSetup = true;
      showView(b.dataset.view);
    };
  });
}

/* =========================================================
   SIZINGS
   ========================================================= */
function renderSizings() {
  const box = document.getElementById('sizingsTable');
  const head = `<tr><th></th>${STACKS.map(s => `<th>${s}bb</th>`).join('')}</tr>`;
  const rows = SIZING_ROWS.map((row, ri) => {
    const cells = STACKS.map(st => {
      const sz = getSizing(row.key, st);
      const ai = row.allin;
      return `<td>
        <div class="siz-mode" data-rk="${escAttr(row.key)}" data-st="${st}">
          <button class="bb ${sz.mode === 'bb' ? 'on' : ''}" data-m="bb" ${ai ? 'disabled' : ''}>bb</button>
          <button class="x ${sz.mode === 'x' ? 'on' : ''}" data-m="x" ${ai ? 'disabled' : ''}>x</button>
        </div>
        <input type="number" step="0.1" min="0" max="200" value="${ai ? sz.val : sz.val}"
               data-rk="${escAttr(row.key)}" data-st="${st}" data-ai="${ai ? 1 : 0}">
        ${ai ? '<div class="muted" style="font-size:10px">All-in</div>' : ''}
      </td>`;
    }).join('');
    return `<tr><td style="text-align:left; white-space:nowrap">${esc(row.label)}</td>${cells}</tr>`;
  }).join('');
  box.innerHTML = head + rows;

  // modo toggle
  box.querySelectorAll('.siz-mode button:not([disabled])').forEach(btn => {
    btn.onclick = () => {
      const rk = btn.dataset.rk, st = Number(btn.dataset.st), m = btn.dataset.m;
      const cur = getSizing(rk, st);
      const val = cur.val;
      setSizing(rk, st, m, val);
      renderSizings();
    };
  });
  // inputs
  box.querySelectorAll('input[type=number]').forEach(inp => {
    inp.addEventListener('change', () => {
      setSizing(inp.dataset.rk, Number(inp.dataset.st), null, inp.value);
    });
    inp.addEventListener('input', () => {
      // vista previa en vivo
      const tip = document.getElementById('sizingsTip');
      tip.textContent = `Open Raise @${stackFromLabel(inp.dataset.st + '')} = ${fmtBB(getSizing('OR', Number(inp.dataset.st)).val)}bb`;
    });
  });
  document.getElementById('btnResetSiz').onclick = () => {
    if (!confirm('Restablecer los sizings a los valores por defecto?')) return;
    localStorage.removeItem(SIZING_KEY);
    SIZINGS = null;
    renderSizings();
  };
}

/* =========================================================
   ESTUDIO
   ========================================================= */
function renderStudy(isSetup) {
  const stage = document.getElementById('studyStage');

  if (isSetup || !session) {
    // ------- SETUP -------
    const edited = editedRanges();
    if (!edited.length) {
      stage.innerHTML = `<div class="empty">Aún no has definido ningún rango.<br>
        Ve a <b>Rangos</b>, abre una situación y edita su matriz.</div>`;
      return;
    }
    const cats = [...new Set(edited.map(r => r.cat))].sort();
    goToSetup = false;
    stage.innerHTML = `
      <div class="card setup">
        <h3>Configura el entrenamiento</h3>
        <div class="fgroup">
          <label>Modo de estudio</label>
          <select id="stGame">
            <option value="flash" selected>Flashcards (mano a mano)</option>
            <option value="construir">Construye el rango (matriz 13×13)</option>
            <option value="rafaga">Ráfaga SÍ/NO (¿está en el rango?)</option>
          </select>
        </div>
        <div id="stFlashOpts">
          <div class="fgroup">
            <label>Qué manos estudiar</label>
            <select id="stMode">
              <option value="limite_y_dentro" selected>Límites + dentro (recomendado)</option>
              <option value="limite">Solo límites (mezclas)</option>
              <option value="dentro">Solo dentro del rango</option>
              <option value="todo">Todo el rango</option>
            </select>
          </div>
          <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:var(--muted);">
            <input type="checkbox" id="stChains" checked> Cadena: abrir de mano y luego enfrentarse a un 3bet
          </label>
        </div>
        <div class="fgroup">
          <label>Categorías (${edited.length} rangos editados)</label>
          <div class="chips" id="stCats">
            <button class="chip on" data-c="all">Todas</button>
            ${cats.map(c => `<button class="chip" data-c="${escAttr(c)}">${esc(c)}</button>`).join('')}
          </div>
        </div>
        <div class="fgroup">
          <label>Nº de preguntas / spots</label>
          <select id="stLimit">
            <option value="0">Todas</option>
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="30">30</option>
            <option value="50">50</option>
          </select>
        </div>
        <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:var(--muted);">
          <input type="checkbox" id="stPriority" checked> Priorizar lo que peor recuerdo
        </label>
        <button class="hbtn primary" id="stStart">Comenzar</button>
      </div>`;

    const allChips = [...stage.querySelectorAll('#stCats .chip')];
    let selCat = 'all';
    stage.querySelector('#stCats').addEventListener('click', e => {
      const c = e.target.closest('.chip');
      if (!c) return;
      allChips.forEach(x => x.classList.toggle('on', x === c));
      selCat = c.dataset.c;
    });

    stage.querySelector('#stGame').addEventListener('change', e => {
      const flash = e.target.value === 'flash';
      stage.querySelector('#stFlashOpts').style.display = flash ? '' : 'none';
      stage.querySelector('#stPriority').closest('label').style.display = flash ? '' : 'none';
      if (!flash) stage.querySelector('#stCats .chip[data-c="all"]').classList.add('on');
    });

    stage.querySelector('#stStart').onclick = () => {
      const sitIds = selCat === 'all'
        ? edited.map(r => r.id)
        : edited.filter(r => r.cat === selCat).map(r => r.id);
      if (!sitIds.length) return toast('Elige una categoría con rangos');
      const game = stage.querySelector('#stGame').value;
      const cfgCommon = {
        sitIds,
        limit: stage.querySelector('#stLimit').value,
        prioritize: stage.querySelector('#stPriority').checked,
      };
      if (game === 'construir') {
        buildConstructSession(cfgCommon);
        if (!session || !session.list.length) return toast('No hay rangos editados para construir');
        renderConstruct();
        return;
      }
      if (game === 'rafaga') {
        buildRafagaSession(cfgCommon);
        if (!session || !session.list.length) return toast('No hay manos para estudiar en ese filtro');
        renderRafaga();
        return;
      }
      const cfg = Object.assign({}, cfgCommon, {
        mode: stage.querySelector('#stMode').value,
        chains: stage.querySelector('#stChains').checked ? 3 : 0,
      });
      buildSession(cfg);
      if (session.list.length === 0) return toast('No hay manos para estudiar en ese filtro');
      renderCard();
    };
    return;
  }

  if (session && session.kind === 'construir') return renderConstruct();
  if (session && session.kind === 'rafaga') return renderRafaga();
  renderCard();
}

function renderCard() {
  const stage = document.getElementById('studyStage');
  if (session.done) { renderSummary(); return; }

  const entry = currentCard();
  const r = getRange(entry.sitId);

  // ---- opción múltiple: respuesta correcta + alternativas con sentido ----
  const lines = answerLines(entry);
  const correctActs = new Set(lines.filter(l => l.freq > 0).map(l => l.action));
  const PLAUS = {
    'Open Raise': ['raise', 'fold', 'jam'],
    'Defensa': ['call', '3bet', 'fold'],
    'vs 3Bet': ['call', '4bet', 'fold'],
    'vs 4Bet': ['call', '4bet', 'fold'],
    'vs SQZ': ['call', '4bet', 'fold'],
    'Squeeze': ['call', 'sqz', 'fold'],
    'SB vs BB': ['raise', 'call', 'fold', 'jam'],
    'SB vs 3Bet': ['call', '4bet', 'fold'],
    'BB vs Limp': ['call', 'raise', 'fold'],
    'BB': ['call', 'fold'],
  };
  const base = PLAUS[r.sub] || ['call', 'raise', 'fold'];
  correctActs.forEach(a => { if (!base.includes(a)) base.push(a); });
  const ordered = [...new Set(base.filter(a => a !== 'fold')), ...(base.includes('fold') ? ['fold'] : [])];

  // tamaño alterno como distractor del tamaño real de la acción principal
  const domino = lines.filter(l => l.freq > 0).sort((a, b) => b.freq - a.freq)[0];
  const realSize = domino && r.sizes && r.sizes[domino.action];
  let altSize = null;
  if (realSize != null && Number.isFinite(Number(realSize)) && Number(realSize) > 0 && domino.action !== 'jam') {
    const step = Number(realSize) >= 5 ? 1 : 0.2;
    const alt = Math.round((Number(realSize) + step) * 10) / 10;
    if (Math.abs(alt - Number(realSize)) > 1e-9) altSize = alt;
  }

  const cards = entry.cards.map(c =>
    `<div class="pc ${cardRed(c) ? 'red' : ''}">${c[0]}<span class="suit">${cardSuitSym(c)}</span></div>`).join('');

  const scene = buildScene(entry.sitId);
  const chainBadge = entry.chainKey
    ? `<div class="chainbadge">${
        entry.chainStep === 0 ? 'Cadena 1/3 · abres tú y luego te 3betean'
        : entry.chainStep === 1 ? 'Cadena 2/3 · misma mano tras el 3bet'
        : 'Cadena 3/3 · tras tu 4bet te 5betean all-in'}</div>`
    : '';
  const seats = (scene.seats || []).map(s => {
    const c = SEAT_COORDS[s.pos] || { left: '45%', top: '45%' };
    const cls = ['seat'];
    if (s.cls) cls.push(s.cls);
    return `<div class="${cls.join(' ')}" style="left:${c.left};top:${c.top}">
      <div class="spos">${posLabel(s.pos)}</div>
      <div class="sact">${s.text}</div>
    </div>`;
  }).join('');
  const seq = scene.seq.map(s => {
    const hero = s.hero ? ' hero' : '';
    const who = s.player === 'tú' ? 'Tú' : posLabel(s.player);
    return `<span class="seg${hero}"><b>${esc(who)}</b> ${esc(s.text)}</span>`;
  }).join('<span class="arrow">›</span>');

  stage.innerHTML = `
    <div class="qbar"><div class="fill" style="width:${Math.round(session.idx / session.list.length * 100)}%"></div></div>
    <div class="qpath"><b>${session.idx + 1}</b> / ${session.list.length} · <span id="qCounts">${session.cnt.ok} ✓ ${session.cnt.warn} ~ ${session.cnt.bad} ✗</span></div>
    <div class="qcard">
      ${chainBadge}
      <div class="qspot">${esc(r.label)}</div>
      <div class="qmeta">${esc(r.sub)} · Stack ref ${esc(r.stack)}bb${scene.intro ? ' · ' + esc(scene.intro) : ''}</div>
      <div class="qtable-wrap">
        <div class="table-oval"></div>
        <div class="qhand">${cards}</div>
        ${seats}
      </div>
      <div class="qseq">${seq}</div>
      <div class="qsizing">Tamaño en juego: <b>${esc(formatSizingFor(r))}</b>${scene.decisión ? ' · <span class="qdec">' + esc(scene.decisión) + '</span>' : ''}</div>
    </div>
    <div class="qanswers" id="qans"></div>
    <div class="qanswer-info hidden" id="qaf"></div>
    <div class="qgrades hidden" id="qgrades">
      <button class="g1" data-g="bad">1 · No lo sabía</button>
      <button class="g2" data-g="warn">2 · Casi</button>
      <button class="g3" data-g="ok">3 · ¡Clavada!</button>
    </div>`;

  const box = document.getElementById('qans');
  const optHTML = [];
  ordered.forEach(action => {
    optHTML.push(`<button data-a="${escAttr(action)}" data-t="">
      <span>${sizeLabel(r, action)}</span>
    </button>`);
    if (altSize != null && action === domino.action) {
      optHTML.push(`<button data-a="${escAttr(action)}" data-t="${fmtBB(altSize)}">
        <span>${ACTION_NAME[action]} ${fmtBB(altSize)}bb</span>
      </button>`);
    }
  });
  box.innerHTML = optHTML.join('');

  box.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => pickAnswer(entry, btn);
  });
}

function pickAnswer(entry, btn) {
  const chosenAction = btn.dataset.a;
  const correct = gradeCard(entry, chosenAction, btn.dataset.t);

  // resaltar
  const allBtns = [...document.querySelectorAll('#qans button')];
  allBtns.forEach(b => {
    const isCorrect = isCorrectOption(entry, b.dataset.a, b.dataset.t);
    b.classList.toggle('correct', isCorrect);
    if (b === btn && !correct) b.classList.add('wrong');
    b.style.pointerEvents = 'none';
  });

  // info
  const info = document.getElementById('qaf');
  const r = getRange(entry.sitId);
  const sol = entry.lines
    .filter(l => l.freq > 0)
    .map(l => `${sizeLabel(r, l.action)}${l.tag ? ' ' + l.tag : ''} ${Math.round(l.freq * 100)}%`)
    .join(' · ');
  info.innerHTML = correct
    ? `<span class="ok">✓ Acción correcta.</span> Solución: ${sol}`
    : `<span class="bad">✗ No es eso.</span> Solución: ${sol}`;
  info.classList.remove('hidden');

  const stats = getStat(entry.sitId, entry.hand);
  if (stats && stats.n > 0) {
    const gp = document.getElementById('qgrades');
    gp.insertAdjacentHTML('beforebegin',
      `<div class="qanswer-stats">En esta mano: ${stats.ok} ✓ ${stats.warn} ~ ${stats.bad} ✗ (${stats.n} veces)</div>`);
  }

  document.getElementById('qgrades').classList.remove('hidden');
  const grades = document.querySelectorAll('#qgrades button');
  grades.forEach(g => {
    g.onclick = () => {
      recordGrade(entry.sitId, entry.hand, g.dataset.g);
      session.cnt[g.dataset.g]++;
      nextCard();
      renderCard();
    };
  });
}

function renderSummary() {
  const stage = document.getElementById('studyStage');
  const n = session.list.length;
  const pct = Math.round(((session.cnt.ok + session.cnt.warn * 0.5) / n) * 100);
  stage.innerHTML = `
    <div class="qsummary">
      <div class="big">${pct}%</div>
      <div class="muted">${n} preguntas · ${session.cnt.ok} clavadas · ${session.cnt.warn} casi · ${session.cnt.bad} no sabías</div>
      <div class="nums">
        <div class="num n1"><b>${session.cnt.ok}</b>✓</div>
        <div class="num n2"><b>${session.cnt.warn}</b>~</div>
        <div class="num n3"><b>${session.cnt.bad}</b>✗</div>
      </div>
      <button class="hbtn primary" id="again" style="margin:0 6px 6px">Repetir sesión</button>
      <button class="hbtn" id="back2">Otra configuración</button>
    </div>`;
  document.getElementById('again').onclick = () => {
    buildSession({
      sitIds: session.list.map(e => e.sitId),
      mode: session.mode,
      limit: session.list.length,
      prioritize: true
    });
    renderCard();
  };
  document.getElementById('back2').onclick = () => { goToSetup = true; renderStudy(true); };
}

/* =========================================================
   PROGRESO
   ========================================================= */
function renderProgress() {
  const box = document.getElementById('progList');
  const g = globalStats();
  const all = allRanges();
  const rows = all.filter(r => r.edited)
    .map(r => {
      const s = getStatForSit(r.id);
      const pct = sitSuccess(r.id);
      return `<div class="stat-row">
        <div class="nm">${esc(r.label)}<div class="muted" style="font-size:11px">${s.n} respuestas</div></div>
        <div class="progress-line"><i style="width:${pct ?? 0}%"></i></div>
        <div class="pct">${pct === null ? '—' : pct + '%'}</div>
      </div>`;
    }).join('');

  document.getElementById('progGlobal').innerHTML = g.n
    ? `<span class="badge"><b>${g.n}</b> respuestas</span>
       <span class="badge"><b>${Math.round(((g.ok + g.warn * 0.5) / g.n) * 100)}%</b> rendimiento</span>`
    : '<span class="badge">Sin datos todavía</span>';

  box.innerHTML = rows || '<div class="empty">Estudia para ver tu progreso.</div>';

  document.getElementById('btnResetStats').onclick = () => {
    if (confirm('Borrar todo el progreso de estudio?')) { resetAllStats(); renderProgress(); }
  };
}

/* =========================================================
   Init
   ========================================================= */
/* Matriz 13x13 con la mano de la carta dentro de su celda */
function miniMatrix(target, cards) {
  let rows = '<tr><td class="headcell d"></td>' +
    RANKS.split('').map(r => `<td class="headcell d">${r}</td>`).join('') + '</tr>';
  for (let i = 0; i < 13; i++) {
    let r = `<tr><td class="headcell s">${RANKS[i]}</td>`;
    for (let j = 0; j < 13; j++) {
      const h = HANDS13[i][j];
      if (h === target) {
        r += `<td class="cell hit">${cards.map(c =>
          `<span class="mcard ${cardRed(c) ? 'red' : ''}">${c[0]}<i>${cardSuitSym(c)}</i></span>`).join('')}</td>`;
      } else {
        r += '<td class="cell blank"></td>';
      }
    }
    rows += r + '</tr>';
  }
  return `<table class="matrix mini">${rows}</table>`;
}

function init() {
  ensureDefaults();
  ensureSizings();
  ensureStats();
  LISTENER = () => {
    if (document.getElementById('view-rangos').classList.contains('on')) {
      renderRangeList(document.getElementById('rangeSearch').value);
    }
  };
  bindRangeList();
  renderRangeList('');
  bindMatrix();
  bindSheet();
  bindNotacion();
  bindNav();
  renderSizings();
  renderStudy(true);
  renderProgress();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

document.addEventListener('DOMContentLoaded', init);