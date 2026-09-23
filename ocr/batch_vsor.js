const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TMP = 'C:\\Users\\hugo\\AppData\\Local\\Temp\\opencode';
const OCR = 'C:\\Users\\hugo\\Desktop\\PreflopStudy\\ocr\\ocr_word.ps1';
const ASSEMBLE = 'C:\\Users\\hugo\\Desktop\\PreflopStudy\\ocr\\assemble.js';
const BASE = 'C:\\Users\\hugo\\Desktop\\PreflopStudy\\tablas\\MTT\\2_Universidad';
const URLBASE = 'http://localhost:8090/tablas/MTT/2_Universidad';

const SITES = [
  { dir: '3_vs OR 10-20bb', id: 'vsor1020' },
  { dir: '4_vs OR 30bb', id: 'vsor30' },
  { dir: '5_vs OR 40bb', id: 'vsor40' },
  { dir: '6_vs OR 75bb', id: 'vsor75' },
];
const DEFS = { 1: 'BB', 2: 'SB', 3: 'BTN', 4: 'CO', 5: 'HJ', 6: 'LJ_UTG' };

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

let fail = 0, ok = 0;
const report = [];
for (const site of SITES) {
  const dirPath = path.join(BASE, site.dir);
  const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jpg')).sort();
  for (const file of files) {
    const num = parseInt(file[0], 10);
    const def = DEFS[num];
    const ocrPath = path.join(TMP, `ocr_${site.id}_${def}.json`);
    const chartsPath = path.join(TMP, `charts_${site.id}_${def}.json`);
    if (!fs.existsSync(ocrPath)) {
      try {
        run('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', OCR, '-Image', path.join(dirPath, file), '-Out', ocrPath]);
      } catch (e) { console.error(`OCR FAIL ${file}: ${e.message}`); fail++; continue; }
    }
    const url = `${URLBASE}/${encodeURIComponent(site.dir)}/${encodeURIComponent(file)}`;
    try {
      run('node.exe', [ASSEMBLE, url, ocrPath, chartsPath, 'vsor', def]);
      const c = JSON.parse(fs.readFileSync(chartsPath, 'utf8').replace(/^\uFEFF/, ''));
      report.push(`${site.id}\t${def}\t` + c.charts.map(ch => `${ch.pos}:${Object.keys(ch.matrix).length}`).join(' '));
      ok++;
    } catch (e) { console.error(`ASSEMBLE FAIL ${file}: ${e.message}`); fail++; continue; }
  }
}
console.log(`\n=== RESUMEN (ok=${ok} fail=${fail}) ===`);
for (const r of report) console.log(r);