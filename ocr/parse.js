'use strict';
/* parse.js — a partir del OCR JSON de una imagen de rangos 13x13 extrae las matrices.
   v3: pitch adaptativo de filas/columnas por imagen, agrupación por bandas y columnas,
   y extracción del título de cada matriz (para leer posición/opener y acción). */

const RE_HAND = /^[AKQJT98765432][AKQJT98765432][so]?$/i;
const RE_PCT = /^-?[0-9][0-9.,]*\s*%?$/;

function clusterXn(vals, gap) {
  const v = [...vals].sort((a, b) => a - b);
  const cs = [];
  for (const x of v) {
    const l = cs[cs.length - 1];
    if (l && x - l.s / l.n < gap) { l.s += x; l.n++; }
    else cs.push({ s: x, n: 1 });
  }
  return cs.map(c => Math.round(c.s / c.n));
}

function pitchOf(centers) {
  const d = [];
  for (let i = 1; i < centers.length; i++) d.push(centers[i] - centers[i - 1]);
  if (!d.length) return 0;
  const hist = new Map();
  for (const v of d) hist.set(v, (hist.get(v) || 0) + 1);
  const sorted = [...hist.entries()].sort((a, b) => b[1] - a[1]);
  return sorted[0][0] || sorted[0][0] || d[Math.floor(d.length / 2)];
}

function pctValue(t) {
  if (!RE_PCT.test(t)) return null;
  const m = t.match(/[0-9][0-9.,]*/);
  if (!m) return null;
  const p = parseFloat(m[0].replace(/,/, '.'));
  if (isNaN(p)) return null;
  return Math.min(1, Math.abs(p) / 100);
}

/* Posiciones conocidas (normalización de ruido OCR) */
const POS_EXT = ['UTG', 'BTN', 'CO', 'HJ', 'LJ', 'SB', 'BB', 'MP'];
function cleanTok(t) {
  const s = String(t || '').toUpperCase().replace(/[^A-Z0-9+]/g, '');
  if (/^\d/.test(s)) return '';                 // "30BB" -> pila, no posición
  return s;
}
function normalizePos(t) {
  const s = cleanTok(t);
  if (!s) return null;
  if (/UTG\+?1|UTG1|1UTG/.test(s)) return 'UTG+1';   // también dentro de tokens compuestos (p.ej. "UTG+130bb")
  if (/^U$/.test(s)) return 'LJ';
  if (/^I+J|^IJ/.test(s)) return 'HJ';
  if (/UTG/.test(s)) return 'UTG';
  for (const p of ['BTN', 'CO', 'HJ', 'LJ', 'BB', 'SB', 'MP', 'BW']) if (s === p) return p;
  return null;
}

/* rejilla completa de n filas/columnas a pitch fijo desde el primer centro real.
   los huecos (filas sin texto) se mantienen como posiciones fantasmas para muestrear color */
function fitLattice(centers, pitch, n) {
  if (!pitch) return centers;
  const c = centers.slice().sort((a, b) => a - b);
  const base = c[0];
  if (centers.length >= n && c[n - 1] - base < pitch * 1.9) return c.slice(0, n);
  return Array.from({ length: n }, (_, k) => base + k * pitch);
}

function parseTitle(titleWords, defender) {
  const joined = titleWords.join(' ');
  const vs = titleWords.findIndex(t => /^VS$/i.test(t));
  let pos = null, opener = null;
  if (vs >= 0) {
    // opener = última posición antes de 'vs' que no sea el defensor (p.ej. "75bb UTG BTN vs" -> UTG)
    for (let i = vs - 1; i >= 0; i--) {
      const p = normalizePos(titleWords[i]);
      if (p && p !== defender) { opener = p; break; }
    }
    for (let i = vs + 1; i < titleWords.length; i++) { const p = normalizePos(titleWords[i]); if (p) { pos = p; break; } }
  }
  if (!opener && vs >= 0) {
    for (let i = vs - 1; i >= 0; i--) { const p = normalizePos(titleWords[i]); if (p) { opener = p; break; } }
  }
  if (!pos) pos = titleWords.map(normalizePos).find(Boolean);
  const sizingTok = titleWords.find(t => /bb/i.test(t) && /[0-9]/.test(t)) || '';
  const sizing = parseFloat(sizingTok.replace(/[^0-9.,]/g, '').replace(/,/, '.'));
  const isAllIn = /ALLIN|ALL-IN|SHOVE|ALUN/i.test(joined);
  const isOR = /OR|RAISE/i.test(joined);
  const pcts = titleWords.map(pctValue).filter(v => v !== null);
  return { joined, pos, opener, sizing: isNaN(sizing) ? null : sizing, isAllIn, isOR, pcts };
}

const OPENER_SET_DBG = !!(process.env.PDBG);
function parseMatrices(ocr, imgW, defender) {
  const words = ocr.words;
  const handWordsAll = words.filter(w => RE_HAND.test(w.t));
  const rowCenters = clusterXn(handWordsAll.map(w => w.y), 26);
  const pitchY = pitchOf(rowCenters);
  if (!pitchY) return [];

  // bandas verticales de matrices (separadas por > pitchY*2)
  const bands = [];
  let cur = [rowCenters[0]];
  for (let i = 1; i < rowCenters.length; i++) {
    if (rowCenters[i] - rowCenters[i - 1] > pitchY * 2) { bands.push(cur); cur = []; }
    cur.push(rowCenters[i]);
  }
  bands.push(cur);
  if (OPENER_SET_DBG) console.log('[pdbg] pitchY=' + pitchY + ' bands=' + JSON.stringify(bands.map(b => b.length)));
  // cada banda puede contener varias matrices en fila
  const matrices = [];
  for (const bandRows of bands) {
    if (bandRows.length < 3) continue;   // bandas basura (leyenda suelta) / tablas casi vacías
    const y0 = bandRows[0] - 60, y1 = bandRows[bandRows.length - 1] + 70;
    const bandWords = words.filter(w => w.y >= y0 && w.y < y1);
    const hw = bandWords.filter(w => RE_HAND.test(w.t));
    const colRaw = clusterXn(hw.map(w => w.x), 45);
    const pitchX = pitchOf(colRaw);
    const colCenters = clusterXn(hw.map(w => w.x), Math.max(14, Math.round(pitchX * 0.7)));
    const gaps = [];
    for (let i = 1; i < colCenters.length; i++) gaps.push(colCenters[i] - colCenters[i - 1]);
    const medGap = gaps.length ? gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 200;
    const groups = [];
    let g0 = 0;
    for (let i = 1; i < colCenters.length; i++) {
      if (colCenters[i] - colCenters[i - 1] > medGap * 2.2) { groups.push(colCenters.slice(g0, i)); g0 = i; }
    }
    groups.push(colCenters.slice(g0));
    // anclas de título (x de las posiciones) para cortar grupos que contienen varias tablas
    const titleAnchors = [];
    {
      const tw = bandWords.filter(w => w.y < bandRows[0] - 8);
      const anchCands = tw.filter(w => normalizePos(w.t) || /ALLIN|SHOVE|ALUN|ALL-IN|ALL IN/i.test(w.t));
      // dedupe: varios tokens de posición por título (defensor+opener) se agrupan por tabla
      for (const a of clusterXn(anchCands.map(w => w.x), 200)) {
        if (anchCands.some(w => Math.abs(w.x - a) < 200)) titleAnchors.push(a);
      }
    }
    for (const colsRaw of groups) {
      if (colsRaw.length < 6) continue;
      if (OPENER_SET_DBG) console.log('  [pdbg] group cols=' + colsRaw.length + ' xs=' + colsRaw.join(',') + ' anchors=' + titleAnchors.join(','));
      let colsGroups;
      // dividir siempre por anclas de título cuando hay ≥2 (tablas con muy pocas manos
      // → bandas con texto escaso cuyas columnas no superan el umbral de 14)
      if (colsRaw.length > 6 && titleAnchors.length >= 2) {
        colsGroups = titleAnchors.map(a => colsRaw.filter(c => Math.abs(c - a) === Math.min(...titleAnchors.map(t => Math.abs(c - t)))));
      } else colsGroups = [colsRaw];
      for (const cols of colsGroups) {
      if (cols.length < 6) continue;
      // filas: extrapolar a rejilla fija de 13 (filas sin texto = fold; se mantienen para muestrear)
      const rowsY = fitLattice(bandRows, pitchY, 13);
      const rowsOrig = bandRows.length;
      // columnas: rejilla completa también
      const colsF = fitLattice(cols, pitchX, 13);
      const colsOrig = cols.length;
      const yBase = rowsY[0];
      const xBase = colsF[0];
      const grid = {};
      for (const w of bandWords) {
        const cy = rowsY.reduce((best, r) => Math.abs(r - w.y) < Math.abs(best - w.y) ? r : best, rowsY[0]);
        const cx = colsF.reduce((best, c) => Math.abs(c - w.x) < Math.abs(best - w.x) ? c : best, colsF[0]);
        const key = cy + '|' + cx;
        if (!grid[key]) grid[key] = { y: cy, x: cx, words: [] };
        grid[key].words.push(w);
      }
      const cells = [];
      let handOK = 0, hasHand = 0, withPct = 0;
      const COLSF = colsF;
      for (let rowIdx = 0; rowIdx < 13; rowIdx++) {
        const cy = rowsY[rowIdx] || rowsY[rowsY.length - 1];
        const rowCells = [];
        for (let colIdx = 0; colIdx < COLSF.length; colIdx++) {
          const cx = COLSF[colIdx];
          const g = grid[cy + '|' + cx] || { y: cy, x: cx, words: [] };
          let hand = null, pct = null, handWordObj = null, pctWordObj = null;
          for (const w of g.words) {
            if (RE_HAND.test(w.t) && !hand) { hand = w.t.toUpperCase(); handWordObj = w; }
            else if (pctValue(w.t) !== null && pct === null) { pct = w.t; pctWordObj = w; }
          }
          const cellHand = cellsHand(rowIdx, colIdx);
          if (hand) { hasHand++; if (hand === cellHand) handOK++; }
          if (pct) withPct++;
          rowCells.push({
            row: rowIdx, col: colIdx, hand: cellHand,
            hasText: !!(hand || pct), pctText: pct, pct: pctValue(pct),
            x: cx, y: cy,
            handWord: handWordObj || null, pctWord: pctWordObj || null,
          });
        }
        cells.push(rowCells);
      }
      // realineo por nombres de mano: corrige rejillas con base errónea
      const mat = { rowsY, cols: colsF, cells, rowsOrig, colsOrig };
      if (realignMatrix(mat)) {
        // la rejilla nueva (realineada) es la buena
        for (let r = 0; r < 13; r++) mat.cells[r].forEach(c => { c.x = mat.cols[c.col]; c.y = mat.rowsY[r]; });
      }
      // título: palabras encima de la fila 0 dentro del rango x de la matriz
      let titleWords = bandWords
        .filter(w => w.y < mat.rowsY[0] - 8 && w.y >= mat.rowsY[0] - 160 && w.x >= mat.cols[0] - 30 && w.x <= mat.cols[mat.cols.length - 1] + 60);
      titleWords = titleWords.slice().sort((a, b) => a.y - b.y || a.x - b.x).map(w => w.t);
      matrices.push({ ...mat,
        stats: { handOK, hasHand, withPct }, rowsOrig, colsOrig,
        title: parseTitle(titleWords, defender) });
    }
    }
  }
  return matrices;
}

function cellsHand(row, col) {
  const RANKS = 'AKQJT98765432';
  if (row === col) return RANKS[row] + RANKS[col];
  if (row < col) return RANKS[row] + RANKS[col] + 's';
  return RANKS[col] + RANKS[row] + 'o';
}

const RANKS = 'AKQJT98765432';
const rankIdx = ch => RANKS.indexOf(ch);
/* posición (r,c) en la rejilla que corresponde a un nombre de mano (tolera ruido OCR) */
function handRC(t) {
  const s = String(t || '').toUpperCase().replace(/[^AKQJT98765432SO]/g, '');
  if (s.length < 2) return null;
  const r0 = rankIdx(s[0]), r1 = rankIdx(s[1]);
  if (r0 < 0 || r1 < 0) return null;
  const suff = s.length >= 3 ? s[2] : null;          // 's', 'O', o null (par)
  const a = Math.min(r0, r1), b = Math.max(r0, r1);
  if (a === b) return { r: a, c: a };
  return suff === 'S' ? { r: a, c: b } : { r: b, c: a };
}

/* Reajusta la rejilla de una matriz a partir de las posiciones de texto: cada token de mano
   lleva su (r,c) implícito -> resuelve (x0,y0) del grid (regresión robusta con mediana). */
function realignMatrix(m) {
  const PX = m.cols.length > 1 ? (m.cols[m.cols.length - 1] - m.cols[0]) / (m.cols.length - 1) : 50;
  const PY = m.rowsY.length > 1 ? (m.rowsY[m.rowsY.length - 1] - m.rowsY[0]) / (m.rowsY.length - 1) : 40;
  const cands = [];
  for (const row of m.cells) for (const c of row) {
    if (!c.handWord || !c.handWord.t) continue;
    const rc = handRC(c.handWord.t);
    if (!rc) continue;
    cands.push({ x0: c.handWord.x - (10 + rc.c * PX), y0: c.handWord.y - (12 + rc.r * PY) });
  }
  if (cands.length < 4) return false;
  const med = arr => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  const xs = cands.map(v => v.x0), ys = cands.map(v => v.y0);
  let x0 = med(xs), y0 = med(ys);
  // poda de outliers
  const il = (xs, m0) => { const d = xs.map(v => Math.abs(v - m0)); const mad = med([...d].sort((a, b) => a - b)); return mad === 0 ? 1e9 : 1.5 * mad; };
  const keep = [];
  for (const v of cands) if (Math.abs(v.x0 - x0) < 25 && Math.abs(v.y0 - y0) < 20) keep.push(v);
  if (keep.length >= 2) { x0 = med(keep.map(v => v.x0)); y0 = med(keep.map(v => v.y0)); }
  const oldHas = m.cells.flat().filter(c => c.hasText).length;
  const grid = {};
  for (const row of m.cells) for (const c of row) {
    if (c.handWord || c.pctWord) {
      const key = Math.round(c.y / 25) + '|' + Math.round(c.x / 30);
      (grid[key] = grid[key] || []).push({ y: c.y, x: c.x, t: (c.handWord && c.handWord.t) || null, pt: (c.pctWord && c.pctWord.t) || null });
    }
  }
  for (let r = 0; r < 13; r++) for (let c = 0; c < 13; c++) {
    const cx = Math.round(x0 + c * PX + 10), cy = Math.round(y0 + r * PY + 12);
    m.cells[r][c].x = cx; m.cells[r][c].y = cy;
    let hand = null, pct = null;
    for (const w of Object.values(grid).flat()) if (Math.abs(w.y - cy) < 20 && Math.abs(w.x - cx) < 26) {
      if (w.t && !hand) hand = w.t; if (w.pt && !pct) pct = w.pt;
    }
    m.cells[r][c].hasText = !!(hand || pct);
    m.cells[r][c].pct = pct;
    m.cells[r][c].pctText = pct;
    m.cells[r][c].handWord = hand ? { t: hand } : null;
  }
  m.rowsY = Array.from({ length: 13 }, (_, r) => y0 + r * PY);
  m.cols = Array.from({ length: 13 }, (_, c) => x0 + c * PX);
  const newHas = m.cells.flat().filter(c => c.hasText).length;
  return newHas >= oldHas - 2;
}

module.exports = { parseMatrices, cellsHand, parseTitle, normalizePos };

if (require.main === module) {
  const fs = require('fs');
  const txt = fs.readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, '');
  const ocr = JSON.parse(txt);
  const mats = parseMatrices(ocr, ocr.w, process.argv[3]);
  console.log('matrices:', mats.length, 'de', ocr.words.length, 'palabras');
  mats.forEach((m, i) => {
    console.log(`[${i}] rows=${m.rowsY.length} cols=${m.cols.length} handsOK=${m.stats.handOK}/${m.stats.hasHand} pct=${m.stats.withPct}`);
    console.log('   title:', m.title.joined.slice(0, 90), '| pos=' + (m.title.pos || '-'), 'allin=' + m.title.isAllIn, 'sizing=' + m.title.sizing);
  });
}