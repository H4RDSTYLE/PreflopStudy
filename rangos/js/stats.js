'use strict';
/* =========================================================
   stats.js — progreso por situación/mano (localStorage)
   ========================================================= */

const STATS_KEY = 'ps_stats_v1';
let STATS = null;

function loadStats() {
  try { return JSON.parse(localStorage.getItem(STATS_KEY)) || {}; } catch (e) { return {}; }
}

function ensureStats() {
  if (STATS) return;
  STATS = loadStats();
}

function saveStats() {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(STATS)); } catch (e) {}
}

function statKey(sitId, handClass) { return sitId + '::' + handClass; }

function recordGrade(sitId, handClass, grade) {
  ensureStats();
  const k = statKey(sitId, handClass);
  const s = STATS[k] = STATS[k] || { n: 0, ok: 0, warn: 0, bad: 0 };
  s.n++;
  s[grade]++;
  saveStats();
  return s;
}

function getStat(sitId, handClass) {
  ensureStats();
  return STATS[statKey(sitId, handClass)] || { n: 0, ok: 0, warn: 0, bad: 0 };
}

function getStatForSit(sitId) {
  ensureStats();
  let n = 0, ok = 0, warn = 0, bad = 0;
  const prefix = sitId + '::';
  Object.entries(STATS).forEach(([k, v]) => {
    if (k.startsWith(prefix)) { n += v.n; ok += v.ok; warn += v.warn; bad += v.bad; }
  });
  return { n, ok, warn, bad };
}

function sitSuccess(sitId) {
  const s = getStatForSit(sitId);
  return s.n ? Math.round(((s.ok + s.warn * 0.5) / s.n) * 100) : null;
}

function globalStats() {
  ensureStats();
  let n = 0, ok = 0, warn = 0, bad = 0;
  Object.values(STATS).forEach(v => { n += v.n; ok += v.ok; warn += v.warn; bad += v.bad; });
  return { n, ok, warn, bad };
}

function resetAllStats() {
  STATS = {};
  saveStats();
}

/* Peso de priorización (falladas repetidas -> más peso, igual que en el quiz actual) */
function weightFor(st, sitId, handClass) {
  const s = getStat(sitId, handClass);
  const score = (s.ok || 0) + (s.warn || 0) * 1.5 + (s.bad || 0) * 2.5;
  return 1 / Math.max(0.25, 1 + score * 0.6) + (s.bad || 0);
}