'use strict';
/* read_titles.js — crops el área de título de cada matriz y la OCRiza para leer la posición/opener.
   Uso: node ocr/read_titles.js <ocrJson> <matsJson> [outJson] */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const OCR_PS = 'C:/Users/hugo/Desktop/PreflopStudy/ocr/ocr_word.ps1';
const CROP_PS = 'C:/Users/hugo/Desktop/PreflopStudy/ocr/crop_scale.ps1';
const TMP = path.join(os.tmpdir(), 'opencode');

const [ocrPath, matsPath, outPath] = process.argv.slice(2);
const ocr = JSON.parse(fs.readFileSync(ocrPath, 'utf8').replace(/^\uFEFF/, ''));
const imgPath = ocr.file;
const m = require('C:/Users/hugo/Desktop/PreflopStudy/ocr/parse.js');
const mats = m.parseMatrices(ocr, ocr.w);

console.log('image:', imgPath, '| mats:', mats.length);
const titles = mats.map((mt, i) => {
  // región de título: por encima de la fila 0, más ancha que el grid
  const x0 = Math.max(0, Math.round(mt.cols[0] - 60));
  const x1 = Math.round(mt.cols[mt.cols.length - 1] + 60);
  const y0 = Math.max(0, Math.round(mt.rowsY[0] - 90));
  const y1 = Math.max(0, Math.round(mt.rowsY[0] - 18));
  if (x1 <= x0 || y1 <= y0) return { i, read: [], err: 'bbox inválida' };
  const crop = path.join(TMP, `title_${i}.png`);
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', CROP_PS,
      '-Image', imgPath, '-Out', crop, '-X', String(x0), '-Y', String(y0), '-W', String(x1 - x0), '-H', String(y1 - y0),
      '-Scale', '6'], { stdio: 'pipe' });
    const ocrJson = path.join(TMP, `title_${i}.json`);
    execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', OCR_PS,
      '-Image', crop, '-Out', ocrJson], { stdio: 'pipe' });
    const r = JSON.parse(fs.readFileSync(ocrJson, 'utf8').replace(/^\uFEFF/, ''));
    const read = r.words
      .slice()
      .sort((a, b) => a.x - b.x)
      .map(w => w.t);
    // también leer con binarización si no hay texto
    return { i, x0, y0, read };
  } catch (e) {
    return { i, err: String(e.message || e).slice(0, 120) };
  }
});

titles.forEach(t => {
  console.log(`mat ${t.i} x=${t.x0} y=${t.y0}: [${(t.read || []).join(' ')}]${t.err ? ' ERR ' + t.err : ''}`);
});
if (outPath) fs.writeFileSync(outPath, JSON.stringify(titles, null, 1));