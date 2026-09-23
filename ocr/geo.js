'use strict';
/* Geo: a partir del OCR de una imagen, detecta matrices (bandas por títulos),
   grid 13x13 por matriz, y asigna cada palabra a su celda. */

const RANKS = 'AKQJT98765432';

// clusteriza valores 1D con umbral: agrupa valores a <gap
function cluster1D(vals, gap) {
  const v = [...vals].sort((a, b) => a - b);
  const clusters = [];
  for (const x of v) {
    const last = clusters[clusters.length - 1];
    if (last && x - last.sum / last.n < gap) { last.sum += x; last.n++; }
    else clusters.push({ sum: x, n: 1 });
  }
  return clusters.map(c => Math.round(c.sum / c.n));
}

// aparta un conjunto de palabras nuevas discriminando por patrón
const RE_HAND = /^[AKQJT98765432]{2}[so]?$/i;
const RE_HAND_NOISY = /^[AKQJT98765431<>¢0]{2}[so]?$/i; // tolera 1< como K, 0 como O, etc
function looksHand(t) {
  const c = t.replace(/[^A-Za-z0-9]/g, '');
  const m = c.match(/^([AKQJT98765432])([AKQJT98765432])([so]?)$/i);
  return m || /^[AKQJT987654321<>0]{2}[so]?$/i.test(c);
}
const RE_PCT = /^[-0-9.,%']+$/;

module.exports = { RANKS };

function buildMatrices(ocr) {
  const words = ocr.words;
  // --- títulos: palabras fuera de celdas. Criterio: son palabras que NO son mano ni % puro
  // y que aparecen "fuera" de filas de celdas. No confiamos en texto; usamos GEOMETRÍA:
  // los títulos son líneas con pocas palabras separadas de las bandas de celdas.
  // Estrategia: detectamos las filas de celda como filas con muchas palabras (~13).
  // Una banda = bloque de filas densas separado por filas vacías (títulos/leyenda).
  const rowCount = new Map(); // y (20-20) -> n palabras
  for (const w of words) {
    const key = Math.round(w.y / 20) * 20;
    rowCount.set(key, (rowCount.get(key) || 0) + 1);
  }
  const ys = [...rowCount.keys()].sort((a, b) => a - b);
  // bandas: agrupar filas densas consecutivas (densa = >=8 palabras)
  const bands = [];
  let cur = null;
  for (const y of ys) {
    if (rowCount.get(y) >= 5) {
      if (!cur) cur = { y0: y, ys: [] };
      cur.ys.push(y);
    } else if (cur && y - cur.ys[cur.ys.length - 1] < 30) {
      cur.ys.push(y);
    } else if (cur) {
      bands.push(cur); cur = null;
    }
  }
  if (cur) bands.push(cur);
  console.log('filas densas por banda:', bands.map(b => `${b.y0}..${b.ys[b.ys.length-1]}(${b.ys.length})`).join(' | '));
  return { bands };
}

if (require.main === module) {
  const fs = require('fs');
  const txt = fs.readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, '');
  const ocr = JSON.parse(txt);
  buildMatrices(ocr);
  console.log('total words', ocr.words.length, 'size', ocr.w + 'x' + ocr.h);
}