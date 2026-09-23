'use strict';
/* =========================================================
   ranges.js — modelo de rangos y persistencia (localStorage)
   ========================================================= */

const STORE_KEY = 'ps_ranges_v2';
let RANGES = null;
let LISTENER = null;

function loadRanges() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
}

function saveRanges() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(RANGES)); } catch (e) {}
}

function ensureDefaults() {
  if (RANGES) return;
  const stored = loadRanges();
  if (stored && Object.keys(stored).length) {
    RANGES = migrateStoredRanges(stored);
    return;
  }
  RANGES = buildDefaultRanges();
  saveRanges();
}

/* Migración: spots 'SB vs BB Rol' (u_sbbr_*) que quedaron guardados con el
   sizing/opción del OR (call 0,5bb = limp). El call real al rol es 2bb.
   Conserva la matriz editada del usuario; solo re-aplica sizing y tamaño. */
function migrateStoredRanges(stored) {
  let changed = false;
  Object.entries(stored).forEach(([id, r]) => {
    if (!id.startsWith('u_sbbr_') || !r) return;
    if (r.sizing === 'OR' && r.sizes && r.sizes.call === 0.5) {
      r.sizing = 'rol';
      r.sizes = { call: 2 };
      changed = true;
    }
  });
  if (changed) {
    RANGES = stored;
    saveRanges();
  }
  return stored;
}

function getRange(id) { return RANGES[id] || null; }
function allRanges() { return Object.values(RANGES); }
function rangesByCat(cat) { return allRanges().filter(r => r.cat === cat); }
function editedRanges() { return allRanges().filter(r => r.edited); }

function setLines(id, handClass, lines) {
  const r = getRange(id);
  if (!r) return;
  const clean = lines.filter(l => l.action && l.freq > 0);
  if (clean.length) r.matrix[handClass] = clean.map(l => ({
    action: l.action, tag: (l.tag || '').trim(), freq: Math.round(l.freq * 100) / 100
  }));
  else delete r.matrix[handClass];
  r.edited = true;
  saveRanges();
  if (LISTENER) LISTENER();
}

function getLines(id, handClass) {
  const r = getRange(id);
  if (!r || !r.matrix) return [];
  return (r.matrix[handClass] || []).map(l => ({ action: l.action, tag: l.tag || '', freq: l.freq }));
}

/* Cobertura del rango: % de combos con acción no-fold (ponderado por freq) */
function coverage(r) {
  if (!r || !r.edited || !r.matrix) return 0;
  let total = 0;
  Object.entries(r.matrix).forEach(([, ls]) => {
    ls.forEach(l => {
      if (l.action !== 'fold') total += l.freq;
    });
  });
  return Math.min(1, total / 169);
}

/* Aplicar notación a un rango */
function applyNotation(id, text) {
  const parsed = parseNotation(text);
  if (parsed.error) return parsed;
  const r = getRange(id);
  if (!r) return { error: 'Rango no encontrado' };
  r.matrix = parsed.matrix;
  r.edited = true;
  saveRanges();
  if (LISTENER) LISTENER();
  return { ok: true, count: Object.keys(parsed.matrix).length };
}

/* Rango -> notación */
function notationOf(id) {
  const r = getRange(id);
  return r ? matrixToNotation(r.matrix) : '';
}

function resetRange(id) {
  const r = getRange(id);
  if (!r) return;
  r.matrix = {};
  r.edited = false;
  saveRanges();
  if (LISTENER) LISTENER();
}

function exportJSON() {
  return JSON.stringify({ v: 1, ranges: RANGES }, null, 1);
}

function importJSON(text) {
  try {
    const d = JSON.parse(text);
    if (!d.ranges) return { error: 'JSON no válido (falta "ranges")' };
    const next = { ...buildDefaultRanges(), ...d.ranges };
    RANGES = next;
    saveRanges();
    if (LISTENER) LISTENER();
    return { ok: true, count: Object.keys(next).length };
  } catch (e) { return { error: 'JSON no válido' }; }
}