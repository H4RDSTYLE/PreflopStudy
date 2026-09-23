'use strict';
/* build_app.js — convierte los charts ensamblados al formato de la app (RANGES).
   Genera:
     - rangos/out/import_universidad.json   (JSON de importación {v:1, ranges})
     - fragmento de SITUATIONS para data.js (imprime por consola)
   Solo se incluyen conjuntos COMPLETOS (6 posiciones únicas). El resto se lista
   como 'needs_manual' para entrar a mano. */
const fs = require('fs');
const path = require('path');

const TMP = 'C:\\Users\\hugo\\AppData\\Local\\Temp\\opencode';
const OUT = 'C:\\Users\\hugo\\Desktop\\PreflopStudy\\rangos\\out';

const OPENERS = ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN'];
const ORDER_BY_DEF = {
  BB: OPENERS, SB: OPENERS,
  BTN: ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO'],
  CO: ['UTG', 'UTG+1', 'LJ', 'HJ'],
  HJ: ['UTG', 'UTG+1', 'LJ'],
  LJ_UTG: ['UTG', 'UTG+1', 'LJ'],
};
const DEFS = ['BB', 'SB', 'BTN', 'CO', 'HJ', 'LJ_UTG'];
const OR_SETS = [
  { file: 'charts_or2025.json',  base: 'or2025', stack: 22, label: 'OR 20-25bb' },
  { file: 'charts_or30.json',    base: 'or30',   stack: 30, label: 'OR 30bb' },
  { file: 'charts_or40.json',    base: 'or40',   stack: 40, label: 'OR 40bb' },
  { file: 'charts_or50.json',    base: 'or50',   stack: 55, label: 'OR 50bb+' },
];
const VOR_SETS = [
  { file: 'charts_vsor1020', base: 'vsor1020', stack: 15, cat: 'vs OR 10-20bb', label: '10-20bb' },
  { file: 'charts_vsor30',   base: 'vsor30',   stack: 30, cat: 'vs OR 30bb',    label: '30bb' },
  { file: 'charts_vsor40',   base: 'vsor40',   stack: 40, cat: 'vs OR 40bb',    label: '40bb' },
  { file: 'charts_vsor75',   base: 'vsor75',   stack: 75, cat: 'vs OR 75bb',    label: '75bb' },
];

const slugs = p => p.replace(/\+/g, '_').replace(/ /g, '')
  .replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();

function completeSet(charts, def) {
  const ord = ORDER_BY_DEF[def] || OPENERS;
  if (!charts || charts.length !== ord.length) return null;
  for (let i = 0; i < ord.length; i++) if (charts[i].pos !== ord[i]) return null;
  return ord.join(',');
}

function main() {
  const ranges = {};
  const needsManual = [];
  let orOk = 0, vorOk = 0;

  for (const s of OR_SETS) {
    const p = path.join(TMP, s.file);
    if (!fs.existsSync(p)) { needsManual.push(`${s.label}: sin charts`); continue; }
    const d = JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
    const guard = completeSet(d.charts, 'BB');
    if (!guard) {
      needsManual.push(`${s.label}: incompleto (${d.charts.map(c => c.pos + ':' + Object.keys(c.matrix).length).join(', ')})`);
      continue;
    }
    const map = {};
    d.charts.forEach(ch => { map[ch.pos] = ch; });
    d.charts.forEach(ch => {
      const id = `${s.base}_${slugs(ch.pos)}`;
      ranges[id] = {
        id, label: `${ch.pos} · ${s.label}`, cat: 'Open Raise', sub: 'Open Raise',
        actions: ['raise', 'jam'], sizing: 'OR', stack: s.stack, vs: 'Hero abre', edited: true,
        matrix: ch.matrix,
      };
    });
    orOk++;
  }

  for (const s of VOR_SETS) {
    for (const def of DEFS) {
      const p = path.join(TMP, `${s.file}_${def}.json`);
      if (!fs.existsSync(p)) { needsManual.push(`${s.cat} ${def}: sin charts`); continue; }
      const d = JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
      if (!completeSet(d.charts, def)) {
        needsManual.push(`${s.cat} ${def}: incompleto (${d.charts.map(c => c.pos + ':' + Object.keys(c.matrix).length).join(', ')})`);
        continue;
      }
      d.charts.forEach(ch => {
        const id = `${s.base}_${slugs(def)}_${slugs(ch.pos)}`;
        ranges[id] = {
          id, label: `${def} ${ch.pos} · ${s.label}`, cat: s.cat, sub: 'Defensa',
          actions: ['call', '3bet', 'fold'], sizing: 'OR', stack: s.stack,
          vs: `Hero en ${def} vs OR ${s.label}`, edited: true,
          matrix: ch.matrix,
        };
      });
      vorOk++;
    }
  }

  fs.mkdirSync(OUT, { recursive: true });
  const outPath = path.join(OUT, 'import_universidad.json');
  fs.writeFileSync(outPath, JSON.stringify({ v: 1, ranges }, null, 1));
  console.log(`OR ok=${orOk}  vsOR ok=${vorOk}  total rangos=${Object.keys(ranges).length}`);
  console.log('NEEDS MANUAL:');
  needsManual.forEach(n => console.log('  - ' + n));
  console.log('JSON ->', outPath);

  // fragmento para data.js (SITUATIONS)
  const lines = [];
  Object.values(ranges).forEach(r => {
    const slug = JSON.stringify(r.id);
    const label = JSON.stringify(r.label);
    const cat = JSON.stringify(r.cat), sub = JSON.stringify(r.sub);
    const acts = JSON.stringify(r.actions);
    const sizing = JSON.stringify(r.sizing), stack = r.stack;
    const vs = JSON.stringify(r.vs);
    lines.push(`  S(${slug}, ${label}, ${cat}, ${sub}, ${acts}, ${sizing}, ${stack}, ${vs}),`);
  });
  console.log(`SITUATIONS_ADD (${lines.length}):`);
  console.log(lines.join('\n'));
}

main();