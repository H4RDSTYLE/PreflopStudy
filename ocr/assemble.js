'use strict';
/* assemble.js — genera rangos (formato app) a partir de OCR + colores de una imagen.
   Uso: node ocr/assemble.js <imgUrl> <ocrJson> <outChartsJson> <kind> [defender]
   kind = 'or' | 'vsor'
   Defender (vsor) = nombre del defensor desde el nombre de archivo: BB/SB/BTN/CO/HJ/LJ_UTG */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, execSync } = require('child_process');
const { parseMatrices, cellsHand } = require('./parse.js');
const COLORS_JS = path.join(__dirname, 'sample_colors.js');
const TMP = path.join(os.tmpdir(), 'opencode');

const OPENERS_2COL = [[ 'UTG', 'UTG+1' ], [ 'LJ', 'HJ' ], [ 'CO', 'BTN' ]];
const OPENERS_3COL = [[ 'UTG', 'UTG+1', 'LJ' ], [ 'HJ', 'CO', 'BTN' ]];
const OPENER_SET = new Set(['UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN']);

function dist(a, b) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
  const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
  return Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2);
}

/* prototipos de color del sitio (calls/3bet-allin/no-allin) + blanco/gris fondo */
const PROTOS = [
  { name: 'call', hex: '#f8f888' },
  { name: '3bet', hex: '#f88848' },
  { name: 'allin', hex: '#d80808' },
  { name: 'call2', hex: '#c7d9f1' },
  { name: 'raise', hex: '#c5673a' },
  { name: 'row', hex: '#f0f0f0' },
];

/* clasifica un color de celda -> acción ('fold' | 'call' | '3bet' | 'allin') */
function classify(color, TH = 36) {
  if (!color || color === '__FOLD__') return 'fold';
  const v = parseInt(color.slice(1), 16);
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  if (spread < 24) return 'fold';                 // grises: bordes/fondo/texto AA
  if (r > 235 && g > 235 && b > 235) return 'fold';
  let best = null, bd = 1e9;
  for (const p of PROTOS) { const d = dist(color, p.hex); if (d < bd) { bd = d; best = p.name; } }
  if (bd > TH) return null;                       // color no clasificable
  return best;
}

function bandIndex(mats) {
  const bands = [];                       // arrays de índices por band (misma rowsY[0])
  for (let i = 0; i < mats.length; i++) {
    const m = mats[i];
    const b = bands.find(bi => Math.abs(mats[bi[0]].rowsY[0] - m.rowsY[0]) < 20);
    if (b) b.push(i); else bands.push([i]);
  }
  bands.forEach(b => b.sort((a, c) => mats[a].cols[0] - mats[c].cols[0]));
  bands.sort((a, b) => mats[a[0]].rowsY[0] - mats[b[0]].rowsY[0]);
  return bands;
}

function assignOpener(mats, band, bandOrd, kind) {
  const seq = band.length === 3 ? OPENERS_3COL[Math.min(bandOrd, OPENERS_3COL.length - 1)]
                                : OPENERS_2COL[Math.min(bandOrd, OPENERS_2COL.length - 1)];
  return band.map((mi, idx) => {
    const m = mats[mi];
    const fromTitle = kind === 'vsor' ? m.title.opener : m.title.pos;
    if (OPENER_SET.has(fromTitle)) return fromTitle;
    return seq[Math.min(idx, seq.length - 1)] || fromTitle;
  });
}

/* mide la cobertura: textmask vs color para reportar calidad */
function reportQuality(mats, colors, kind) {
  mats.forEach((m, i) => {
    const colored = [];
    const unknown = [];
    let byColor = 0, byText = 0, both = 0;
    m.cells.forEach((row, r) => row.forEach((c, ci) => {
      const col = colors[i][r][ci].color;
      const cl = classify(col);
      if (cl === null) unknown.push(col);
      const isC = cl !== 'fold';
      const isT = c.hasText && c.hand;
      if (isC) byColor++;
      if (isT) byText++;
      if (isC && isT) both++;
    }));
    console.log(`  mat ${i} (${m.title.pos || '?'}) color=${byColor} text=${byText} both=${both}/169 unknown=${unknown.length}${unknown.length ? ' [' + [...new Set(unknown)].join(',') + ']' : ''}`);
    const hist = {};
    m.cells.forEach((row, r) => row.forEach((c, ci) => { const cl = classify(colors[i][r][ci].color); hist[cl] = (hist[cl] || 0) + 1; }));
    const kh = Object.keys(hist).filter(k => k !== 'fold').map(k => k + '=' + hist[k]).join(' ') || 'fold-only';
    console.log(`        acciones: ${kh}`);
    if (process.env.DEBUG && String(i) === process.env.DEBUG) {
      m.cells.forEach(row => console.log('        ' + row.map(c => {
        const col = colors[i][c.row][c.col].color;
        const cl = classify(col);
        const ch = cl === 'fold' ? '.' : cl === 'call' ? 'c' : cl === '3bet' ? '3' : cl === 'allin' ? 'A' : '?';
        return ch;
      }).join('')));
      const cells = m.cells.flatMap(row => row.map(c => ({ c, col: classify(colors[i][c.row][c.col].color) })));
      const uniq = {};
      m.cells.forEach(row => row.forEach(c => { const col = colors[i][c.row][c.col].color; const cl = classify(col); if (cl === null) uniq[col] = (uniq[col] || 0) + 1; }));
      console.log('        null-colors:', JSON.stringify(uniq));
      console.log('        col set:', JSON.stringify(Object.keys(m.cells.flatMap(r => r.map(c => colors[i][c.row][c.col].color)).reduce((a, v) => (a[v] = (a[v] || 0) + 1, a), {}))));
    }
  });
}

async function main() {
  const [imgUrl, ocrPath, outPath, kind, defender] = process.argv.slice(2);
  const ocr = JSON.parse(fs.readFileSync(ocrPath, 'utf8').replace(/^\uFEFF/, ''));
  const mats = parseMatrices(ocr, ocr.w, defender);
  if (!mats.length) { console.error('NO matrices'); process.exit(2); }

  const matsPath = path.join(TMP, 'mats_tmp.json');
  fs.writeFileSync(matsPath, JSON.stringify(mats.map(m => ({ yc: m.yc, cols: m.cols, rowsY: m.rowsY, cells: m.cells.map(r => r.map(c => ({ row: c.row, col: c.col, x: c.x, y: c.y }))) }))));
  const colorsPath = path.join(TMP, 'colors_tmp.json');
  execSync(`node "${COLORS_JS}" "${imgUrl}" "${matsPath}" "${colorsPath}"`, { stdio: 'inherit' });
  const colors = JSON.parse(fs.readFileSync(colorsPath, 'utf8').replace(/^\uFEFF/, ''));

  const bands = bandIndex(mats);
  const chartPos = new Array(mats.length);
  bands.forEach((b, ord) => assignOpener(mats, b, ord, kind).forEach((p, k) => { chartPos[b[k]] = p; }));

  console.log('== calidad por matriz ==');
  reportQuality(mats, colors, kind);

  const charts = [];
  mats.forEach((m, i) => {
    const hasPosTok = /UTGI?|LJ|HJ|CO|BTN|BB|SB|MP|VS/i.test(m.title.joined);
    if (!hasPosTok && (m.rowsOrig || m.rowsY.length) < 8 && (m.colsOrig || m.cols.length) < 9) return; // leyenda/ruido
    const pos = chartPos[i];
    const matrix = {};
    const cells = m.cells;
    cells.forEach((row, r) => row.forEach((c, ci) => {
      const col = colors[i][r][ci].color;
      const cl = classify(col);
      const hand = c.hand;
      if (!hand || !isValid(hand)) return;
      if (kind === 'or') {
        if (cl === 'fold') return;
        const isJam = cl === 'call2' || m.title.isAllIn;
        const freq = c.pct && c.pct > 0 ? Math.min(1, c.pct) : 1;
        matrix[hand] = [{ action: isJam ? 'jam' : 'raise', tag: '', freq: Math.round(freq * 100) / 100 }];
      } else {
        if (cl === 'fold') return;
        let lines = [];
        if (cl === 'call') lines = [{ action: 'call', tag: '', freq: 1 }];
        else if (cl === 'allin') lines = [{ action: '3bet', tag: 'all-in', freq: 1 }];
        else { lines = [{ action: '3bet', tag: '', freq: 1 }]; }
        if (c.pct && c.pct > 0 && c.pct < 1) lines[0].freq = Math.round(c.pct * 100) / 100;
        matrix[hand] = lines;
      }
    }));
    charts.push({ pos, matrix });
  });

  // El sitio SIEMPRE ordena las tablas por opener progresivo (filas izquierda→derecha,
  // después abajo). Aplicamos etiquetas canónicas en orden espacial (corrige duplicados
  // y títulos ilegibles en tablas escasas).
  const ORDER = {
    BB: ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN'],
    SB: ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN'],
    BTN: ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO'],
    CO: ['UTG', 'UTG+1', 'LJ', 'HJ'],
    HJ: ['UTG', 'UTG+1', 'LJ'],
    LJ_UTG: ['UTG', 'UTG+1', 'LJ'],
  };
  if (kind === 'vsor' && ORDER[defender]) {
    const ord = ORDER[defender];
    if (charts.length === ord.length) {
      charts.forEach((c, i) => { c.pos = ord[i]; });
    } else if (charts.length === ord.length - 1 && new Set(charts.map(c => c.pos)).size === charts.length) {
      const covered = new Set(charts.map(c => c.pos));
      const missing = ord.findIndex(p => !covered.has(p));
      if (missing >= 0) {
        let k = 0;
        charts.forEach(c => { while (k === missing) k++; c.pos = ord[k]; k++; });
      }
    }
  }

  fs.writeFileSync(outPath, JSON.stringify({ kind, defender, imgUrl, charts }, null, 1));
  console.log('OK charts=', charts.length, '->', outPath);
  charts.forEach((c, i) => console.log(`  ${c.pos}: ${Object.keys(c.matrix).length} manos`));
}

function isValid(h) {
  if (typeof h !== 'string' || h.length < 2) return false;
  const a = h[0], b = h[1];
  if (!'AKQJT98765432'.includes(a) || !'AKQJT98765432'.includes(b)) return false;
  if (h.length === 3 && h[2] !== 's' && h[2] !== 'o') return false;
  return true;
}

main().catch(e => { console.error('FATAL', e); process.exit(2); });