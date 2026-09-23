'use strict';
/* =========================================================
   editor.js — lista de rangos, matriz 13x13, notación, sheet
   ========================================================= */

let currentRangeId = null;
let editorSheetHand = null;

/* ---------- Lista de rangos ---------- */
function renderRangeList(query) {
  const q = (query || '').toLowerCase().trim();
  const list = allRanges().filter(r =>
    !q || (r.label + ' ' + r.cat + ' ' + r.sub).toLowerCase().includes(q));

  const box = document.getElementById('rangeList');
  if (!list.length) {
    box.innerHTML = '<div class="empty">No hay rangos...<br>Crea el primero desde la categoría que estudies.</div>';
    return;
  }
  const grouped = {};
  list.forEach(r => { (grouped[r.cat] = grouped[r.cat] || []).push(r); });

  box.innerHTML = Object.keys(grouped).sort().map(cat => {
    const items = grouped[cat].map(r => {
      const cov = coverage(r);
      const edited = r.edited;
      return `
      <div class="range-item" data-id="${escAttr(r.id)}">
        <div class="ri-main">
          <div class="ri-title">${esc(r.label)}</div>
          <div class="ri-sub">${esc(r.sub)} · ${esc(r.actions.join(' / '))}</div>
        </div>
        <span class="badge ${edited ? '' : 'hidden'}">editado</span>
        <div class="pctbar" title="${Math.round(cov*100)}% cubierto"><i style="width:${Math.round(cov*100)}%"></i></div>
      </div>`;
    }).join('');
    return `<div class="cat-group">
      <div class="cat-title">${esc(cat)}<span class="count">${grouped[cat].length}</span></div>
      ${items}
    </div>`;
  }).join('');
}

function bindRangeList() {
  const box = document.getElementById('rangeList');
  box.addEventListener('click', e => {
    const item = e.target.closest('.range-item');
    if (!item) return;
    openEditor(item.dataset.id);
  });
  document.getElementById('rangeSearch').addEventListener('input', e => renderRangeList(e.target.value));
  document.getElementById('btnExport').addEventListener('click', exportData);
  document.getElementById('btnImport').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', onImportFile);
}

function exportData() {
  const blob = new Blob([exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'preflop-rangos.json';
  a.click();
  URL.revokeObjectURL(url);
}

function onImportFile(e) {
  const f = e.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    const res = importJSON(String(rd.result));
    toast(res.error || `Importados ${res.count} rangos`);
    renderRangeList(document.getElementById('rangeSearch').value);
  };
  rd.readAsText(f);
  e.target.value = '';
}

/* ---------- Editor ---------- */
function openEditor(id) {
  currentRangeId = id;
  const r = getRange(id);
  if (!r) return;
  document.getElementById('edTitle').textContent = r.label;
  document.getElementById('edSub').textContent = `${r.cat} · ${r.sub}`;
  document.getElementById('edSizing').textContent = formatSizingFor(r);
  renderEditActions(r.actions);
  renderMatrix();
  syncNotationText();
  showView('editor');
}

function renderEditActions(actions) {
  const box = document.getElementById('edActions');
  box.innerHTML = actions.map(a =>
    `<button class="act on" data-a="${escAttr(a)}" style="background:${ACTION_COLOR[a]||'#666'};color:${a==='fold'?'#dfe7f5':'#0c121d'}">${esc(ACTION_LABEL[a])}</button>`
  ).join('') + `<button class="act" id="edAddAct">+ acción</button>`;
  box.querySelector('#edAddAct').onclick = addCustomAction;
}

function addCustomAction() {
  const r = getRange(currentRangeId);
  const extra = ACTIONS.filter(a => !r.actions.includes(a));
  if (!extra.length) return toast('Ya están todas las acciones');
  const pick = prompt('Acción extra para este rango: ' + extra.join(', '), extra[0]);
  if (!pick) return;
  const a = extra.find(x => x.toLowerCase() === pick.toLowerCase());
  if (!a) return toast('Acción no válida');
  r.actions.push(a);
  saveRanges();
  renderEditActions(r.actions);
}

function renderMatrix() {
  const r = getRange(currentRangeId);
  const tb = document.getElementById('matrix');
  let rows = '';
  for (let i = 0; i < 13; i++) {
    let cells = '';
    for (let j = 0; j < 13; j++) {
      const hand = HANDS13[i][j];
      const lines = getLines(currentRangeId, hand);
      cells += cellHTML(hand, lines);
    }
    rows += `<tr>${cells}</tr>`;
  }
  tb.innerHTML = rows;
}

function cellHTML(hand, lines) {
  const has = lines.length > 0;
  const label = has ? cellLabel(lines) : '';
  const labColor = has ? cellLabelColor(lines) : '#4a5a75';
  const segs = has ? lines.map(l =>
    `<i style="flex:0 0 ${l.freq*100}%; ${segmentStyle(l)}"></i>`) : '';
  return `<td class="cell ${has ? '' : 'empty'}" data-hand="${hand}">
    ${has ? `<div class="splits">${segs}</div>` : ''}
    <span class="hlabel">${hand}</span>
    <span class="lab" style="color:${labColor}">${has ? label : '·'}</span>
  </td>`;
}

function bindMatrix() {
  document.getElementById('matrix').addEventListener('click', e => {
    const td = e.target.closest('td.cell');
    if (!td) return;
    openSheet(td.dataset.hand);
  });
}

/* ---------- Sheet (editor de celda) ---------- */
function openSheet(hand) {
  editorSheetHand = hand;
  const sit = getRange(currentRangeId);
  document.getElementById('sheetHand').textContent = hand;
  const actions = sit.actions;
  const lines = getLines(currentRangeId, hand);

  const box = document.getElementById('sheetLines');
  box.innerHTML = '';
  const ls = lines.length ? lines.map(l => ({ ...l })) : [];

  // Botones rápidos
  const quick = document.getElementById('sheetQuick');
  const qBtns = [];
  qBtns.push(`<button class="chip" data-q="fold">Fold 100%</button>`);
  actions.forEach(a => {
    if (a !== 'fold') qBtns.push(`<button class="chip" data-q="${escAttr(a)}">${esc(ACTION_SHORT[a])} 100%</button>`);
  });
  if (actions.filter(a => a !== 'fold').length >= 2) {
    qBtns.push(`<button class="chip" data-q="5050">50/50</button>`);
  }
  quick.innerHTML = qBtns.join('');

  if (ls.length) ls.forEach(l => addLineRow(box, l));
  renderSheetSum();

  showSheet();
}

function addLineRow(box, line) {
  const sit = getRange(currentRangeId);
  const row = document.createElement('div');
  row.className = 'line-row';
  row.innerHTML = `
    <select class="l-action">
      ${sit.actions.map(a =>
        `<option value="${escAttr(a)}" ${a === line.action ? 'selected' : ''}>${esc(ACTION_LABEL[a])}</option>`).join('')}
    </select>
    <input class="l-tag" type="text" list="tagList" placeholder="tag (all-in…)" value="${escAttr(line.tag || '')}">
    <input class="l-freq" type="number" min="0" max="100" step="5" value="${Math.round((line.freq||0)*100)}">
    <button class="del" title="Eliminar línea">✕</button>`;
  row.querySelector('.del').onclick = () => { row.remove(); renderSheetSum(); };
  ['select', 'input'].forEach(sel => row.querySelector(sel).addEventListener('input', renderSheetSum));
  box.appendChild(row);
}

function renderSheetSum() {
  const rows = [...document.querySelectorAll('#sheetLines .line-row')];
  let total = 0;
  rows.forEach(ro => {
    total += (parseFloat(ro.querySelector('.l-freq').value) || 0);
  });
  total = Math.round(total);
  const sum = document.getElementById('sheetSum');
  sum.textContent = total + '%';
  sum.classList.toggle('ok', total <= 100 && total > 0);
  sum.classList.toggle('bad', total > 100);
  document.getElementById('sheetSave').disabled = total > 100;
  const rest = 100 - total;
  document.getElementById('sheetRest').textContent =
    total === 0 ? 'Mano fuera de rango (fold implícito)' :
    rest > 5 ? `${rest}% restante -> fold implícito` :
    rest >= 0 ? 'Completo' : '';
}

function showSheet() {
  document.getElementById('sheetBack').classList.add('on');
  document.getElementById('sheet').classList.add('on');
}

function hideSheet() {
  document.getElementById('sheetBack').classList.remove('on');
  document.getElementById('sheet').classList.remove('on');
}

function bindSheet() {
  document.getElementById('sheetBack').onclick = hideSheet;
  document.getElementById('sheetClose').onclick = hideSheet;
  document.getElementById('sheetAddLine').onclick = () => {
    addLineRow(document.getElementById('sheetLines'), { action: 'call', tag: '', freq: 1 });
    renderSheetSum();
  };
  document.getElementById('sheetClear').onclick = () => {
    setLines(currentRangeId, editorSheetHand, []);
    renderMatrix();
    hideSheet();
  };
  document.getElementById('sheetQuick').addEventListener('click', e => {
    const b = e.target.closest('.chip');
    if (!b) return;
    const q = b.dataset.q;
    if (q === 'fold') {
      setLines(currentRangeId, editorSheetHand, [{ action:'fold', tag:'', freq:1 }]);
      renderMatrix(); hideSheet(); return;
    }
    if (q === '5050') {
      const act = getRange(currentRangeId).actions.filter(a => a !== 'fold');
      setLines(currentRangeId, editorSheetHand, [
        { action: act[0], tag:'', freq:0.5 },
        { action: act[1], tag:'', freq:0.5 },
      ]);
      renderMatrix(); hideSheet(); return;
    }
    setLines(currentRangeId, editorSheetHand, [{ action: q, tag:'', freq:1 }]);
    renderMatrix(); hideSheet();
  });
  document.getElementById('sheetSave').onclick = saveSheet;
}

function saveSheet() {
  const rows = [...document.querySelectorAll('#sheetLines .line-row')];
  const lines = rows.map(ro => ({
    action: ro.querySelector('.l-action').value,
    tag: ro.querySelector('.l-tag').value.trim(),
    freq: (parseFloat(ro.querySelector('.l-freq').value) || 0) / 100
  })).filter(l => l.freq > 0);
  const total = lines.reduce((s, l) => s + l.freq, 0);
  if (total > 1.005) return toast('Las frecuencias suman más de 100%');
  setLines(currentRangeId, editorSheetHand, lines);
  renderMatrix();
  syncNotationText();
  hideSheet();
  renderRangeList(document.getElementById('rangeSearch').value);
}

/* ---------- Notación (textarea) ---------- */
function syncNotationText() {
  const ta = document.getElementById('notacion');
  ta.value = notationOf(currentRangeId);
}

function bindNotacion() {
  const ta = document.getElementById('notacion');
  ta.addEventListener('change', () => applyNotacionText());
  document.getElementById('btnApplyNot').addEventListener('click', applyNotacionText);
}

function applyNotacionText() {
  if (!currentRangeId) return;
  const res = applyNotation(currentRangeId, document.getElementById('notacion').value);
  if (res.error) {
    toast('Error: ' + res.error);
    return;
  }
  toast(`Notación aplicada (${res.count} manos)`);
  renderMatrix();
  syncNotationText();
  renderRangeList(document.getElementById('rangeSearch').value);
}

document.getElementById('btnResetEd').onclick = () => {
  if (!currentRangeId) return;
  if (!confirm('Restablecer este rango (vaciar todo) + progreso? El progreso se borra solo si confirmas.')) return;
  resetRange(currentRangeId);
  renderMatrix();
  syncNotationText();
  renderRangeList(document.getElementById('rangeSearch').value);
  toast('Rango restablecido');
};

document.getElementById('btnBackEd').onclick = () => {
  showView('rangos');
  renderRangeList(document.getElementById('rangeSearch').value);
};

/* ---------- Toast ---------- */
let toastTimer = null;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 2200);
}

function escAttr(s) {
  return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}