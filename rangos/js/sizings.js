'use strict';
/* =========================================================
   sizings.js — configuración de sizings por situación × stack
   ========================================================= */

const STACKS = [15, 20, 30, 40, 50, 75];

/* Situaciones de sizing (filas) */
const SIZING_ROWS = [
  { key: 'OR',        label: 'Open Raise',        allin: false },
  { key: '3bet_ip',   label: '3bet IP',           allin: false },
  { key: '3bet_oop',  label: '3bet OOP',          allin: false },
  { key: 'sqz_ip',    label: 'Squeeze IP',        allin: false },
  { key: 'sqz_oop',   label: 'Squeeze OOP',       allin: false },
  { key: '4bet_ip',   label: '4bet IP (no AI)',   allin: false },
  { key: '4bet_oop',  label: '4bet OOP (no AI)',  allin: false },
  { key: '4betAI_ip', label: '4bet All-in IP',    allin: true },
  { key: '4betAI_oop',label: '4bet All-in OOP',   allin: true },
  { key: 'jam',       label: 'Jam / Shove',       allin: true },
];

const SIZING_KEY = 'ps_sizings_v1';

/* Defaults: modo 'bb' (BB fijos) o 'x' (multiplicador del open) */
const SIZING_DEFAULTS = {
  OR:        { mode: 'bb', val: 2.2 },
  '3bet_ip': { mode: 'x',  val: 3 },
  '3bet_oop':{ mode: 'x',  val: 3.5 },
  'sqz_ip':  { mode: 'x',  val: 4 },
  'sqz_oop': { mode: 'x',  val: 4.5 },
  '4bet_ip': { mode: 'x',  val: 2.3 },
  '4bet_oop':{ mode: 'x',  val: 2.5 },
  '4betAI_ip':{ mode: 'bb', val: 0 }, // 0 = AI efectivo (entera stack)
  '4betAI_oop':{mode: 'bb', val: 0 },
  jam:       { mode: 'bb', val: 0 },
};

let SIZINGS = null;

function loadSizings() {
  try { return JSON.parse(localStorage.getItem(SIZING_KEY)) || {}; } catch (e) { return {}; }
}

function ensureSizings() {
  if (SIZINGS) return;
  SIZINGS = loadSizings();
  SIZING_ROWS.forEach(row => {
    if (!SIZINGS[row.key]) {
      SIZINGS[row.key] = {};
      STACKS.forEach(st => {
        SIZINGS[row.key][st] = { ...SIZING_DEFAULTS[row.key] };
        if (row.allin && SIZINGS[row.key][st].val === 0) SIZINGS[row.key][st].val = st;
      });
    }
  });
}

function saveSizings() {
  try { localStorage.setItem(SIZING_KEY, JSON.stringify(SIZINGS)); } catch (e) {}
}

function getSizing(rowKey, stack) {
  ensureSizings();
  const row = SIZINGS[rowKey];
  if (!row) return { mode: 'bb', val: 0 };
  let s = row[stack];
  if (!s) {
    // fallback al stack más cercano en la misma fila
    const keys = Object.keys(row).map(Number).sort((a, b) => a - b);
    let best = keys[0];
    keys.forEach(k => { if (Math.abs(k - stack) < Math.abs(best - stack)) best = k; });
    s = row[best] || { mode: 'bb', val: 0 };
  }
  return { ...s };
}

function setSizing(rowKey, stack, mode, val) {
  ensureSizings();
  if (!SIZINGS[rowKey]) SIZINGS[rowKey] = {};
  SIZINGS[rowKey][stack] = {
    mode: mode === 'x' ? 'x' : 'bb',
    val: Math.max(0, parseFloat(val) || 0)
  };
  saveSizings();
}

/* Convierte "vs OR 30bb" -> primer número del stack para lookup */
function stackFromLabel(label) {
  const m = String(label).match(/(\d+)/);
  const v = m ? parseInt(m[1], 10) : 30;
  return v >= 75 ? 75 : v >= 50 ? 50 : v >= 40 ? 40 : v >= 30 ? 30 : v >= 20 ? 20 : v >= 15 ? 15 : 10;
}

/* Texto legible del sizing de una situación */
function formatSizingFor(sit) {
  ensureSizings();
  const rowKey = situSizingKey(sit);
  const stack = stackFromLabel(sit.stack || sit.label);
  const sz = getSizing(rowKey, stack);
  const row = SIZING_ROWS.find(r => r.key === rowKey);
  if (row && row.allin) return `All-in (${sz.val}bb)`;
  if (sz.mode === 'bb') return `${fmtBB(sz.val)}bb`;
  const open = getSizing('OR', stack);
  const base = open.mode === 'bb' ? open.val : 2.2;
  const total = sz.val * base;
  return `${sz.val}x  (${fmtBB(total)}bb)`;
}

function situSizingKey(sit) {
  return sit.sizing || 'OR';
}

function fmtBB(v) {
  return (Math.round(v * 100) / 100).toFixed(Math.round(v * 100) / 100 === Math.round(v) ? 0 : 1).replace(/\.0$/, '');
}