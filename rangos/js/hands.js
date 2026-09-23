'use strict';
/* =========================================================
   hands.js — 169 celdas, notación de rangos, utilidades
   ========================================================= */

const RANKS = 'AKQJT98765432';

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

/* ---- Acciones soportadas ---- */
const ACTIONS = ['fold', 'call', 'raise', '3bet', '4bet', 'sqz', 'jam'];
const ACTION_LABEL = {
  fold: 'Fold', call: 'Call', raise: 'Raise', '3bet': '3bet',
  '4bet': '4bet', sqz: 'Squeeze', jam: 'Jam / All-in'
};
const ACTION_COLOR = {
  fold: '#33415c', call: '#45ccb9', raise: '#ffb35c', '3bet': '#4fc3f7',
  '4bet': '#ef5350', sqz: '#9575cd', jam: '#e86a9a'
};
const ACTION_SHORT = {
  fold: 'F', call: 'C', raise: 'R', '3bet': '3b', '4bet': '4b', sqz: 'SQ', jam: 'AI'
};
const TAG_SUGGESTIONS = ['all-in', 'no allin', 'small', 'over', 'polar', 'linear'];

/* ---- Matriz 13x13: HANDS13[fila][col] = clase canónica ---- */
const HANDS13 = [];
for (let i = 0; i < 13; i++) {
  HANDS13[i] = [];
  for (let j = 0; j < 13; j++) HANDS13[i][j] = cellHand(i, j);
}

function cellHand(i, j) {
  if (i === j) return RANKS[i] + RANKS[i];
  if (i < j) return RANKS[i] + RANKS[j] + 's';
  return RANKS[j] + RANKS[i] + 'o';
}

function rankIndex(r) { return RANKS.indexOf(r); }

/* Clase canónica a partir de dos índices de rango + suited */
function canonical(i1, i2, suited) {
  const hi = Math.min(i1, i2), lo = Math.max(i1, i2);
  if (hi === lo) return RANKS[hi] + RANKS[lo];
  return RANKS[hi] + RANKS[lo] + (suited ? 's' : 'o');
}

/* "AhKd" -> "AKo" ; "AsKs" -> "AKs" ; "7h7d" -> "77" */
function cardsToClass(c1, c2) {
  const r1 = c1[0], r2 = c2[0];
  const i1 = rankIndex(r1), i2 = rankIndex(r2);
  if (i1 === i2) return r1 + r2;
  const suited = c1[1] === c2[1];
  return canonical(i1, i2, suited);
}

/* Clase -> dos cartas concretas aleatorias (para las flashcards) */
const SUITS = 'shdc';
function randomDeal(handClass) {
  const r1 = handClass[0], r2 = handClass[1];
  if (handClass.length === 2) {
    const s1 = SUITS[Math.floor(Math.random() * 4)];
    let s2 = SUITS[Math.floor(Math.random() * 4)];
    while (s2 === s1) s2 = SUITS[Math.floor(Math.random() * 4)];
    return [r1 + s1, r2 + s2];
  }
  const suited = handClass.endsWith('s');
  const s1 = SUITS[Math.floor(Math.random() * 4)];
  const s2 = suited ? s1 : SUITS[(SUITS.indexOf(s1) + 1 + Math.floor(Math.random() * 3)) % 4];
  return [r1 + s1, r2 + s2];
}

function cardRed(card) { return card[1] === 'h' || card[1] === 'd'; }
function cardSuitSym(card) {
  return { s: '♠', h: '♥', d: '♦', c: '♣' }[card[1]] || '';
}

/* =========================================================
   Notación de rangos
   ========================================================= */

/* Expande un token tipo "22+", "A2s+", "A5s-A2s", "KQo", "77-22" -> [clases] */
function expandToken(tok) {
  tok = tok.trim();
  if (!tok) return [];

  // Rango explícito "A5s-A2s" / "77-22" / "KTs-K7s"
  const rng = tok.match(/^([2-9TJQKA])([2-9TJQKA])([so]?)-([2-9TJQKA])([2-9TJQKA])([so]?)$/);
  if (rng) {
    const [, a1, b1, t1, a2, b2, t2] = rng;
    const t = t1 || t2 || '';
    if (a1 === a2 && a1 !== b1) {
      // misma familia (A5s-A2s) o parecida: expandir segundo rango
      const i1 = rankIndex(a1);
      let s1 = rankIndex(b1), s2 = rankIndex(b2);
      const out = [];
      const lo = Math.min(s1, s2), hi = Math.max(s1, s2);
      for (let s = lo; s <= hi; s++) {
        if (s === i1) continue;
        out.push(canonical(i1, s, t === 's'));
      }
      return [...new Set(out)];
    }
    if (b1 === b1 && a1 !== b1 && b1 === b2 && a2 !== b2 && a1 !== a2 && t) {
      // mismo segundo rango? no estándar -> tratar como familias cruzadas: fallthrough
    }
    // Parejas "77-22"
    if (a1 === b1 && a2 === b2 && (!t1 || !t2)) {
      const i1 = rankIndex(a1), i2 = rankIndex(a2);
      const lo = Math.min(i1, i2), hi = Math.max(i1, i2);
      const out = [];
      for (let i = lo; i <= hi; i++) out.push(RANKS[i] + RANKS[i]);
      return out;
    }
    // KTs-K7s (misma primera, segunda en rango, con s/u)
    if (a1 === a2 && t) {
      const i1 = rankIndex(a1);
      let s1 = rankIndex(b1), s2 = rankIndex(b2);
      const lo = Math.min(s1, s2), hi = Math.max(s1, s2);
      const out = [];
      for (let s = lo; s <= hi; s++) {
        if (s === i1) continue;
        out.push(canonical(i1, s, t === 's'));
      }
      return [...new Set(out)];
    }
  }

  // Par "22" o "22+"
  const pair = tok.match(/^([2-9TJQKA])\1(\+?)$/);
  if (pair) {
    const i = rankIndex(pair[1]);
    if (pair[2]) {
      const out = [];
      for (let k = i; k >= 0; k--) out.push(RANKS[k] + RANKS[k]);
      return out;
    }
    return [RANKS[i] + RANKS[i]];
  }

  // Mano exacta "A9s" / "KQo"
  const exact = tok.match(/^([2-9TJQKA])([2-9TJQKA])([so])$/);
  if (exact) {
    const i1 = rankIndex(exact[1]), i2 = rankIndex(exact[2]);
    if (i1 === i2) return [exact[1] + exact[2]];
    return [canonical(i1, i2, exact[3] === 's')];
  }

  // Plus "A2s+" / "AJo+" / "54s+"
  const plus = tok.match(/^([2-9TJQKA])([2-9TJQKA])([so])\+$/);
  if (plus) {
    const i1 = rankIndex(plus[1]), i2 = rankIndex(plus[2]);
    const suited = plus[3] === 's';
    if (i1 === i2) {
      const out = [];
      for (let k = i2; k >= 0; k--) out.push(RANKS[k] + RANKS[k]);
      return out;
    }
    // segunda rango desde i2 hacia i1 (más fuerte), sin llegar a par
    const out = [];
    if (i1 < i2) {
      for (let s = i2; s > i1; s--) out.push(canonical(i1, s, suited));
    } else {
      // ej "54s+": primera más débil que segunda invertida -> canonical ya ordena
      const hi = Math.max(i1, i2), lo = Math.min(i1, i2);
      // 54s+ = 54s,53s,52s? Convención: 54s+ => 54s, 64s?, no: plus sube la carta alta
      // Aquí: 54s+ -> 54s, 55?, conservamos: mismo rango alto creciente hacia A
      for (let low = lo; low >= 0; low--) {
        if (low === hi) continue;
        out.push(canonical(hi, low, suited));
        if (out.length > 12) break;
      }
    }
    return [...new Set(out)];
  }

  // "any" / "22+ ... " fallback
  return [];
}

/* Expande una especificación de manos: "22+, A2s+, KQo" -> Set(clases) */
function expandHands(spec) {
  const parts = String(spec).split(/[\s,]+/).filter(Boolean);
  const out = new Set();
  parts.forEach(p => expandToken(p).forEach(h => out.add(h)));
  return out;
}

/* =========================================================
   Líneas de acción (action + tag + freq)
   ========================================================= */

/* Normaliza una línea: {action, tag, freq} freq en 0..1 */
function normLine(l) {
  const freq = Math.max(0, Math.min(1, Number(l.freq) || 0));
  const tag = (l.tag || '').trim();
  return { action: l.action, tag, freq: Math.round(freq * 100) / 100 };
}

function lineKey(l) { return l.action + '|' + (l.tag || '').toLowerCase(); }
function lineLabel(l) {
  const base = ACTION_LABEL[l.action] || l.action;
  return l.tag ? base + ' ' + l.tag : base;
}
function isAllInLine(l) {
  return l.action === 'jam' || /all-?in/i.test(l.tag || '');
}

/* Suma de frecuencias de una lista de líneas */
function sumFreq(lines) {
  return lines.reduce((s, l) => s + l.freq, 0);
}

/* Líneas + fold implícito si sobra frecuencia */
function linesWithImplicitFold(lines) {
  const out = lines.map(l => ({ ...l }));
  const rest = 1 - sumFreq(out);
  if (rest > 0.005) out.push({ action: 'fold', tag: '', freq: Math.round(rest * 100) / 100 });
  return out;
}

/* ¿Es borderline (al límite del rango)? */
function isBorderline(lines) {
  return lines.some(l => l.freq > 0.05 && l.freq < 0.95);
}

/* ¿Es mano "dentro" (acción pura no-fold >=95%)? */
function isPureInside(lines) {
  const withFold = linesWithImplicitFold(lines);
  return withFold.some(l => l.action !== 'fold' && l.freq >= 0.95);
}

/* Acción dominante (para colorear celdas) */
function dominantLine(lines) {
  if (!lines || !lines.length) return null;
  return lines.reduce((a, b) => (b.freq > a.freq ? b : a));
}

/* =========================================================
   Notación <-> matriz
   ========================================================= */

/* Texto -> { matrix: {clase: [lineas]}, error?: string } */
function parseNotation(text) {
  const matrix = {};
  const lines = String(text || '').split('\n');
  let error = null;

  lines.forEach((raw, idx) => {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) return;
    const m = line.match(/^(.+?):\s*(.+)$/);
    if (!m) {
      if (!error) error = `Línea ${idx + 1}: falta ':' entre manos y acciones`;
      return;
    }
    const hands = expandHands(m[1]);
    if (!hands.size) {
      if (!error) error = `Línea ${idx + 1}: manos no reconocidas ("${m[1].trim()}")`;
      return;
    }
    const segs = m[2].split(',').map(s => s.trim()).filter(Boolean);
    const linesArr = [];
    for (const seg of segs) {
      const parsed = parseActionSeg(seg);
      if (!parsed) {
        if (!error) error = `Línea ${idx + 1}: acción no reconocida ("${seg}")`;
        return;
      }
      linesArr.push(parsed);
    }
    const total = sumFreq(linesArr);
    if (total > 1.005) {
      if (!error) error = `Línea ${idx + 1}: las frecuencias suman ${Math.round(total * 100)}%`;
      return;
    }
    hands.forEach(h => { matrix[h] = linesArr.map(l => normLine(l)); });
  });

  return { matrix, error };
}

/* "3bet all-in 50%" / "call" / "fold 30%" -> línea */
function parseActionSeg(seg) {
  let s = seg.toLowerCase().replace(/\s+/g, ' ').trim();
  let freq = 1;
  const pm = s.match(/(\d+(?:[.,]\d+)?)\s*%?\s*$/);
  if (pm && /%|^\S+\s+\S*\s*\d/.test(s)) {
    const n = parseFloat(pm[1].replace(',', '.'));
    if (!isNaN(n) && n > 0) {
      freq = n > 1 ? n / 100 : n;
      s = s.slice(0, pm.index).trim();
    }
  }
  // acción principal (primera palabra que case)
  let action = null;
  for (const a of ACTIONS) {
    if (s === a || s.startsWith(a + ' ')) { action = a; s = s.slice(a.length).trim(); break; }
  }
  if (!action) {
    if (s.startsWith('open') || s.startsWith('raise')) { action = 'raise'; s = s.replace(/^(open\s*(raise)?|raise)\s*/, ''); }
    else if (s.startsWith('3-bet') || s.startsWith('3b ')) { action = '3bet'; s = s.replace(/^(3-bet|3b)\s*/, ''); }
    else if (s.startsWith('4-bet') || s.startsWith('4b ')) { action = '4bet'; s = s.replace(/^(4-bet|4b)\s*/, ''); }
    else if (s.startsWith('all in') || s.startsWith('all-in')) { action = 'jam'; s = s.replace(/^all[- ]in\s*/, ''); }
    else if (s.startsWith('shove') || s.startsWith('push') || s.startsWith('jam')) { action = 'jam'; s = s.replace(/^(shove|push|jam)\s*/, ''); }
    else return null;
  }
  let tag = s.replace(/\d+(?:[.,]\d+)?\s*%?\s*$/, '').trim();
  tag = tag.replace(/\s+/g, ' ');
  if (tag === 'allin') tag = 'all-in';
  return { action, tag, freq };
}

/* Matriz -> texto notación (agrupa familias consecutivas iguales) */
function matrixToNotation(matrix) {
  const sigOf = h => {
    const ls = matrix[h];
    if (!ls || !ls.length) return '';
    return ls.map(l => `${l.action}${l.tag ? ' ' + l.tag : ''} ${Math.round(l.freq * 100)}%`).join(', ');
  };

  const out = [];

  // Parejas
  let run = [], runSig = null;
  for (let i = 0; i < 13; i++) {
    const h = RANKS[i] + RANKS[i], sig = sigOf(h);
    if (sig && sig === runSig) run.push(h);
    else {
      flushRun(out, run, runSig, true);
      run = sig ? [h] : []; runSig = sig || null;
    }
  }
  flushRun(out, run, runSig, true);

  // Suited (triángulo superior)
  for (let i = 0; i < 13; i++) {
    let run = [], runSig = null;
    for (let j = i + 1; j < 13; j++) {
      const h = HANDS13[i][j], sig = sigOf(h);
      if (sig && sig === runSig) run.push(h);
      else {
        flushRun(out, run, runSig, false);
        run = sig ? [h] : []; runSig = sig || null;
      }
    }
    flushRun(out, run, runSig, false);
  }

  // Offsuit (triángulo inferior)
  for (let j = 0; j < 13; j++) {
    let run = [], runSig = null;
    for (let i = j + 1; i < 13; i++) {
      const h = HANDS13[i][j], sig = sigOf(h);
      if (sig && sig === runSig) run.push(h);
      else {
        flushRun(out, run, runSig, false);
        run = sig ? [h] : []; runSig = sig || null;
      }
    }
    flushRun(out, run, runSig, false);
  }

  return out.join('\n');
}

function flushRun(out, run, sig, isPair) {
  if (!run.length || !sig) return;
  let spec;
  if (run.length === 1) spec = run[0];
  else if (isPair) spec = `${run[run.length - 1]}-${run[0]}`;
  else {
    const first = run[0], last = run[run.length - 1];
    spec = run.length >= 3 ? `${first}-${last}` : run.join(' ');
  }
  out.push(`${spec}: ${sig}`);
}

/* =========================================================
   Utilidades de color/etiqueta para celdas
   ========================================================= */

function shortLineLabel(l) {
  let s = ACTION_SHORT[l.action] || l.action.slice(0, 2);
  if (isAllInLine(l) && l.action !== 'jam') s += '*';
  return s;
}

function cellLabel(lines) {
  if (!lines || !lines.length) return '';
  if (lines.length === 1) return shortLineLabel(lines[0]);
  const ps = lines.map(l => Math.round(l.freq * 100));
  if (lines.length === 2) return `${ps[0]}/${ps[1]}`;
  return `${ps[0]}/${ps[1]}`;
}

function cellLabelColor(lines) {
  const d = dominantLine(lines);
  if (!d) return '#4a5a75';
  return d.action === 'fold' ? '#dfe7f5' : '#0c121d';
}

function segmentStyle(l) {
  const c = ACTION_COLOR[l.action] || '#666';
  if (isAllInLine(l) && l.action !== 'jam') {
    const dark = shadeColor(c, -28);
    return `background:repeating-linear-gradient(45deg, ${c} 0 4px, ${dark} 4px 8px);`;
  }
  return `background:${c};`;
}

function shadeColor(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + pct, g = ((n >> 8) & 255) + pct, b = (n & 255) + pct;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/* Todas las clases con alguna acción */
function handsInMatrix(matrix) {
  return Object.keys(matrix || {}).filter(h => matrix[h] && matrix[h].length);
}

/* Conjunto de las 169 clases válidas */
const ALL_CLASSES = new Set(Object.values(HANDS13).flat());
function isValidClass(h) { return ALL_CLASSES.has(h); }
