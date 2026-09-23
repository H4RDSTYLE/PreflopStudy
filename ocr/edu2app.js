'use strict';
/* edu2app.js — catálogo Universidad de EducaPoker -> situaciones + rangos app */
const fs = require('fs');
const path = require('path');
const ROOT = 'C:/Users/hugo/Desktop/PreflopStudy';
const CAT = JSON.parse(fs.readFileSync(process.argv[2] || 'C:/Users/hugo/AppData/Local/Temp/opencode/educa_all.json', 'utf8')).ranges;
const OUT_JSON = path.join(ROOT, 'rangos', 'out', 'edu_import.json');
const OUT_DATA = path.join(ROOT, 'rangos', 'out', 'edu_data_situations.txt');
const LOG = [];

const tagFrom = (s) => String(s || '').trim().toLowerCase()
  .replace(/^vs\s+/, '').replace(/^call\s+/, '').replace(/^over\s+/, '')
  .replace(/^allin\s*/i, '').replace(/^all-in\s*/i, '')
  .trim();

function schemeOf(name) {
  if (/^OR\s/.test(name)) return 'OPEN';
  if (/^BB vs OS SB/.test(name)) return 'CVP';
  if (/^VS 3Bet/.test(name)) return 'VS3B';
  if (/^vs 4Bet/.test(name)) return 'VS4B';
  if (/^vs SQZ/.test(name)) return 'VSQ';
  if (/^SQUEEZE/.test(name)) return 'SQZ';
  if (/^SB vs BB Rol/.test(name)) return 'SBBR';
  if (/^SB vs 3Bet BB/.test(name)) return 'SB3BB';
  if (/^BB vs SB Limp/.test(name)) return 'BBLIMP';
  if (/^SB vs BB/.test(name)) return 'SBB';
  if (/vs OR/.test(name)) return 'DEFENSE';
  return 'UNKNOWN';
}

function resolveAction(scheme, name, longName) {
  const L = String(longName || name || '').trim();
  const N = String(name || '').trim(); const n = N.toLowerCase(); const l = L.toLowerCase();
  switch (scheme) {
    case 'OPEN':
      if (N === 'OR') return { action: 'raise', tag: '' };
      if (N === 'OS' || n === 'open shove') return { action: 'jam', tag: '' };
      if (N === 'F') return { action: 'fold', tag: '' };
      if (N === 'C') return { action: 'call', tag: '' };
      if (N === 'R') return { action: 'raise', tag: '' };
      throw new Error('OPEN unmapped: ' + N);
    case 'CVP':
      if (N === 'Call' || /^call/.test(l)) return { action: 'call', tag: tagFrom(L.replace(/^call/i, '')) };
      throw new Error('CVP unmapped: ' + N);
    case 'VS3B':
      if (/^or\/call/.test(l)) return { action: 'call', tag: /vs agro\/lp/i.test(l) ? 'vs agro/lp' : '' };
      if (/^4bet/.test(l)) { const rest = l.split(/4bet\s*/i)[1] || ''; return { action: '4bet', tag: /allin|all-in|→\s*fold/.test(rest) || /allin/.test(l) ? (/\→\s*fold/.test(l) ? 'fold' : /allin/i.test(l) ? 'all-in' : '') : tagFrom(rest) }; }
      if (/allin|all-in/.test(l) || n === 'ai') return { action: '4bet', tag: /rango amplio/.test(l) ? 'all-in amplio' : 'all-in' };
      if (/call/.test(l)) return { action: 'call', tag: tagFrom(L) };
      if (n === 'r') return { action: '4bet', tag: '' };
      throw new Error('VS3B unmapped: ' + N + '/' + L);
    case 'VS4B':
      if (/^fold/.test(l)) return { action: 'fold', tag: '' };
      if (/^call/.test(l)) return { action: 'call', tag: tagFrom(L.replace(/^call/i, '')) };
      if (/allin|all-in/.test(l) || n === 'ai') {
        const rest = tagFrom(L.replace(/^allin/i, ''));
        return { action: '4bet', tag: rest || 'all-in' };
      }
      throw new Error('VS4B unmapped: ' + N + '/' + L);
    case 'VSQ':
      if (/^call/.test(l)) return { action: 'call', tag: tagFrom(L.replace(/^call/i, '')) };
      if (/^allin|^all-in/.test(l) || n === 'ai') {
        const rest = tagFrom(L.replace(/^allin/i, ''));
        return { action: '4bet', tag: rest || 'all-in' };
      }
      throw new Error('VSQ unmapped: ' + N + '/' + L);
    case 'SQZ':
      if (N === 'Call' || L === 'Call') return { action: 'call', tag: '' };
      if (N === 'SQZ') return { action: 'sqz', tag: '' };
      if (N === 'SQZ Allin' || /^sqz allin/.test(l)) return { action: 'sqz', tag: 'all-in' };
      if (n === 'fold') return { action: 'fold', tag: '' };
      throw new Error('SQZ unmapped: ' + N + '/' + L);
    case 'SBB':
      if (N === 'Fold') return { action: 'fold', tag: '' };
      if (N === 'Limp') return { action: 'call', tag: 'limp' };
      if (N === 'OR') return { action: 'raise', tag: '' };
      if (N === 'OS') return { action: 'jam', tag: '' };
      throw new Error('SBB unmapped: ' + N);
    case 'SBBR': {
      if (/^limp\//.test(l)) {
        const tail = l.split('limp/')[1] || '';
        if (/^fold/.test(tail)) return { action: 'fold', tag: 'limp' };
        if (/^call/.test(tail)) return { action: 'call', tag: 'limp' };
        if (/^raise/.test(tail)) return { action: 'raise', tag: 'limp' };
        if (/^allin|^all-in|^ai/.test(tail)) return { action: 'jam', tag: 'limp' };
      }
      if (/^fold/.test(l)) return { action: 'fold', tag: '' };
      throw new Error('SBBR unmapped: ' + N + '/' + L);
    }
    case 'SB3BB':
      if (/^fold/.test(l)) return { action: 'fold', tag: '' };
      if (/4bet allin/.test(l)) return { action: '4bet', tag: 'all-in' };
      if (/^or\//.test(l)) return { action: '4bet', tag: tagFrom(l.split('/')[1]) };
      throw new Error('SB3BB unmapped: ' + N + '/' + L);
    case 'BBLIMP':
      if (N === 'Check') return { action: 'call', tag: 'check' };
      if (N === 'Rol') return { action: 'raise', tag: 'iso' };
      if (N === 'Rol Allin') return { action: 'raise', tag: 'all-in' };
      if (N === 'Fold') return { action: 'fold', tag: '' };
      throw new Error('BBLIMP unmapped: ' + N);
    case 'DEFENSE':
      if (/^fold/.test(l)) return { action: 'fold', tag: '' };
      if (/^call/.test(l)) return { action: 'call', tag: tagFrom(L.replace(/^call/i, '')) };
      if (/^3bet\s*\/\s*fold/.test(l)) return { action: '3bet', tag: 'fold' };
      if (/^3bet\s*\/\s*call/.test(l)) return { action: '3bet', tag: 'call' };
      if (/^3bet/.test(l)) return { action: '3bet', tag: /allin|all-in/i.test(l) ? 'all-in' : tagFrom(L.replace(/^3bet/i, '')) };
      if (/allin|all-in/.test(l) || n === 'ai') return { action: '3bet', tag: 'all-in' };
      if (N === 'R') return { action: '3bet', tag: '' };
      if (N === 'C') return { action: 'call', tag: '' };
      if (N === 'F' && /3bet/i.test(L)) return { action: '3bet', tag: 'fold' };
      if (N === 'F') return { action: 'fold', tag: '' };
      throw new Error('DEFENSE unmapped: ' + N + '/' + L);
    default:
      throw new Error('UNKNOWN scheme ' + scheme + ' for ' + name);
  }
}

function matrixOf(range) {
  const scheme = schemeOf(range.name);
  const ley = new Map((((range.summaryData || {}).leyenda) || []).map(x => [String(x.accionId), x.longName || x.accion]));
  const out = {};
  for (const [hand, ids] of Object.entries(range.hands || {})) {
    const merged = new Map();
    for (const [id, f] of Object.entries(ids)) {
      if (!(f > 0)) continue;
      const a = range.actions.find(x => String(x.id) === String(id));
      const { action, tag } = resolveAction(scheme, a ? a.name : id, ley.get(String(id)));
      const key = action + '\u0000' + tag;
      merged.set(key, (merged.get(key) || 0) + f);
    }
    if (!merged.size) continue;
    out[hand] = [...merged.entries()]
      .map(([k, freq]) => { const i = k.indexOf('\u0000'); return { action: k.slice(0, i), tag: k.slice(i + 1), freq: Math.round(freq * 100) / 100 }; });
  }
  return out;
}

function appActionFor(n) {
  const N = String(n || '').trim().toUpperCase();
  if (['F', 'FOLD'].includes(N)) return 'fold';
  if (['C', 'CALL'].includes(N)) return 'call';
  if (N === 'R' || /^RAISE/.test(N)) return 'raise';
  if (N === 'OR' || /^OPEN/.test(N)) return 'raise';
  if (N === 'OS' || /^(OPEN ?SHOVE|SHOVE)/.test(N)) return 'jam';
  if (N === '3B' || /^3BET/.test(N)) return '3bet';
  if (N === '4B' || /^4BET/.test(N)) return '4bet';
  if (/^SQZ/.test(N)) return 'sqz';
  if (N === 'AI' || /^(ALL ?IN|ALL-IN)/.test(N)) return 'jam';
  if (/^LIMP/.test(N)) return 'call';
  if (N === 'CHECK') return 'call';
  if (/^ROL/.test(N)) return 'raise';
  return null;
}

/* Tamaños (bb) por acción de app, desde summaryData.acciones[].tamano */
function sizesOf(range) {
  const best = {};
  for (const a of ((range.summaryData || {}).acciones) || []) {
    const t = String(a.tamano == null ? '' : a.tamano).trim();
    if (t === '' || isNaN(Number(t))) continue;
    const aa = appActionFor(a.nombre || a.accion || '');
    if (!aa) continue;
    const bb = Number(t);
    const c = a.combos || 0;
    if (!(aa in best) || c > best[aa]._c) best[aa] = { bb, _c: c };
  }
  const out = {};
  for (const k of Object.keys(best)) out[k] = best[k].bb;
  return out;
}

const STACK_NUM = { '10-12bb': 11, '15bb': 15, '20-25bb': 22, '30bb': 30, '40bb': 40, '50bb+': 55,
  '10-20bb': 15, '20bb': 20, '30-40bb': 35, '50bb': 50, '15-10bb': 12, '10bb': 10, '12bb': 12 };
const POS_ID = { UTG: 'utg', 'UTG+1': 'utg_1', LJ: 'lj', HJ: 'hj', CO: 'co', BU: 'btn', BTN: 'btn', SB: 'sb' };
const POS_SHOW = { UTG: 'UTG', 'UTG+1': 'UTG+1', LJ: 'LJ', HJ: 'HJ', CO: 'CO', BU: 'BTN', BTN: 'BTN', SB: 'SB' };
const STACK_KEY = { '10-20bb': '1020', '20bb': '20', '30bb': '30', '40bb': '40', '50bb': '50', '50bb+': '50' };
const FORM = { BB: 'bb', SB: 'sb', BU: 'btn', CO: 'co', HJ: 'hj', 'EP-LJ': 'lj_utg' };
const loStack = s => String(s).toLowerCase();

function stackArgs(name, scheme) {
  let m;
  switch (scheme) {
    case 'OPEN':
      m = name.match(/^OR (UTG1|UTG\+1|UTG|LJ|HJ|CO|BTN) (.+)$/); return { pos: m[1] === 'UTG1' ? 'UTG+1' : m[1], stack: m[2], opener: null };
    case 'DEFENSE':
      m = name.match(/^(BB|SB) vs OR (UTG\+1|UTG|LJ|HJ|CO|BU|SB) (.+)$/);
      if (m) return { pos: m[1], opener: m[2], stack: m[3] };
      m = name.match(/^(BU|CO|HJ|EP-LJ) vs OR (.+)$/);
      if (m) return { pos: m[1], opener: null, stack: m[2] };
      throw new Error('DEFENSE name: ' + name);
    case 'CVP':
      m = name.match(/^BB vs OS SB ([0-9]+)bb$/); return { pos: 'BB', opener: 'SB', stack: m[1] + 'bb' };
    case 'VS3B':
      m = name.match(/^VS 3Bet (IP|OOP) (.+)$/); return { pos: null, opener: null, stack: m[2], ip: m[1] === 'IP' };
    case 'VS4B':
      m = name.match(/^vs 4Bet (.+)$/); return { pos: null, opener: null, stack: m[1] };
    case 'VSQ':
      m = name.match(/^vs SQZ (.+)$/); return { pos: null, opener: null, stack: m[1] };
    case 'SQZ':
      m = name.match(/^SQUEEZE (BB|SB) vs OR (LJ|HJ|CO|BU) (.+)$/);
      if (m) return { pos: m[1], opener: m[2], stack: m[3] };
      m = name.match(/^SQUEEZE (BU|CO) (?:vs OR (LJ|HJ) )?(.+)$/);
      if (m) return { pos: m[1], opener: m[2] || null, stack: m[3] };
      throw new Error('SQZ name: ' + name);
    case 'SBB':
      m = name.match(/^SB vs BB (.+)$/); return { pos: 'SB', opener: 'BB', stack: m[1] };
    case 'SBBR':
      m = name.match(/^SB vs BB Rol (.+)$/); return { pos: 'SB', opener: 'BB', stack: m[1] };
    case 'SB3BB':
      return { pos: 'SB', opener: 'BB', stack: '20bb' };
    case 'BBLIMP':
      m = name.match(/^BB vs SB Limp\s*(.+)$/); return { pos: 'BB', opener: 'SB', stack: m[1] };
    default: throw new Error('scheme no-stack: ' + name);
  }
}

const ranges = Object.values(CAT).filter(r => (r.minStatus || '').toUpperCase() === 'UNIVERSIDAD' && r.name);
const byName = new Map();
for (const r of ranges) {
  const prev = byName.get(r.name);
  if (!prev || Object.keys(r.hands || {}).length > Object.keys(prev.hands || {}).length) byName.set(r.name, r);
}
const uni = [...byName.values()];
const sitList = [];
const importRanges = {};
const noScheme = [];

uni.forEach(r => {
  const name = r.name;
  let scheme, a;
  try { scheme = schemeOf(name); a = stackArgs(name, scheme); }
  catch (e) { noScheme.push(name); return; }
  const stack = loStack(a.stack);
  const idSuffix = stack.replace(/[^0-9a-z+]/g, '');
  const id = (() => {
    switch (scheme) {
      case 'OPEN': return `uor_${POS_ID[a.pos]}_${idSuffix}`;
      case 'DEFENSE': {
        const def = { BB: 'bb', SB: 'sb', BU: 'btn', CO: 'co', HJ: 'hj', 'EP-LJ': 'lj_utg' }[a.pos];
        return a.opener ? `vsor${STACK_KEY[a.stack] || idSuffix}_${def}_${POS_ID[a.opener]}` : `vsor${STACK_KEY[a.stack] || idSuffix}_${def}`;
      }
      case 'CVP': return `cvp_bb_os_sb_${a.stack.replace(/bb$/, '')}`;
      case 'VS3B': return `u_vs3${a.ip ? 'ip' : 'oop'}_${idSuffix}`;
      case 'VS4B': return `u_v4bet_${idSuffix}`;
      case 'VSQ': return `u_vsqz_${idSuffix}`;
      case 'SQZ': return `u_sqz${a.opener ? `_${FORM[a.pos]}` : `_${FORM[a.pos]}`}_${idSuffix}${a.opener ? `_${POS_ID[a.opener]}` : ''}`;
      case 'SBB': return `u_sbb_${idSuffix}`;
      case 'SBBR': return `u_sbbr_${idSuffix}`;
      case 'SB3BB': return 'u_sb3bb_20';
      case 'BBLIMP': return `u_bb_lsb_${idSuffix}`;
      default: throw new Error('NO ID ' + name);
    }
  })();
  const label = name;
  const cat = (() => {
    switch (scheme) {
      case 'OPEN': return 'Open Raise';
      case 'CVP': return 'Call Vs Open Push';
      case 'DEFENSE': return ({ '10-20bb': 'vs OR 10-20bb', '20bb': 'vs OR 20bb', '30bb': 'vs OR 30bb', '40bb': 'vs OR 40bb', '50bb': 'vs OR 50bb+', '50bb+': 'vs OR 50bb+' })[stack] || 'vs OR 30bb';
      case 'VS3B': case 'VS4B': case 'VSQ': case 'SQZ': return 'vs 3Bet 4Bet SQZ';
      default: return 'Otros';
    }
  })();
  const sub = (() => {
    switch (scheme) {
      case 'OPEN': return 'Open Raise';
      case 'CVP': return 'BB';
      case 'DEFENSE': return 'Defensa';
      case 'VS3B': return 'vs 3Bet';
      case 'VS4B': return 'vs 4Bet';
      case 'VSQ': return 'vs SQZ';
      case 'SQZ': return 'Squeeze';
      case 'SBB': case 'SBBR': return 'SB vs BB';
      case 'SB3BB': return 'SB vs 3Bet';
      case 'BBLIMP': return 'BB vs Limp';
      default: return 'Otros';
    }
  })();
  const sizing = (() => {
    switch (scheme) {
      case 'OPEN': return 'OR';
      case 'CVP': return 'CALLPUSH';
      case 'DEFENSE': return 'OR';
      case 'VS3B': return a.ip ? '3bet_ip' : '3bet_oop';
      case 'VS4B': return '4betAI_ip';
      case 'VSQ': return 'sqz_ip';
      case 'SQZ': return (a.pos === 'BB' || a.pos === 'SB') ? 'sqz_oop' : 'sqz_ip';
      case 'SBB': case 'SBBR': case 'BBLIMP': return 'OR';
      case 'SB3BB': return '3bet_oop';
      default: return 'OR';
    }
  })();
  const vs = (() => {
    switch (scheme) {
      case 'OPEN': return 'Hero abre';
      case 'CVP': return `BB vs Open Shove SB ${stack}`;
      case 'DEFENSE': return a.opener ? `Hero en ${a.pos === 'BU' ? 'BTN' : a.pos} vs OR ${POS_SHOW[a.opener]} ${stack}` : `Hero en ${a.pos === 'BU' ? 'BTN' : a.pos === 'EP-LJ' ? 'LJ_UTG' : a.pos} vs OR ${stack}`;
      case 'VS3B': return `vs 3Bet ${a.ip ? 'IP' : 'OOP'} ${stack}`;
      case 'VS4B': return `vs 4Bet ${stack}`;
      case 'VSQ': return `vs SQZ ${stack}`;
      case 'SQZ': return a.opener ? `SQZ ${a.pos} vs OR ${POS_SHOW[a.opener]} ${stack}` : `SQZ ${a.pos} ${stack}`;
      case 'SBB': return `SB vs BB ${stack}`;
      case 'SBBR': return `SB vs BB Rol ${stack}`;
      case 'SB3BB': return `SB vs 3Bet BB 20bb`;
      case 'BBLIMP': return `BB vs SB Limp ${stack}`;
      default: return name;
    }
  })();
  const matrix = matrixOf(r);
  const sizes = sizesOf(r);
  const actions = {
    OPEN: ['raise', 'jam'],
    CVP: ['call', 'fold'],
    VS3B: ['call', '4bet', 'fold'], VS4B: ['call', '4bet', 'fold'], VSQ: ['call', '4bet', 'fold'],
    SQZ: ['call', 'sqz', 'fold'],
    SBB: ['fold', 'call', 'raise', 'jam'],
    SBBR: ['fold', 'call', 'raise', 'jam'],
    SB3BB: ['call', '4bet', 'fold'],
    BBLIMP: ['call', 'raise', 'fold'],
    DEFENSE: ['call', '3bet', 'fold'],
  }[scheme] || ['call', 'raise', 'fold'];
  sitList.push({ id, label, cat, sub, actions, sizing, stack: STACK_NUM[stack] || 30, vs, sizes });
  importRanges[id] = { id, label, cat, sub, actions, sizing, stack: STACK_NUM[stack] || 30, vs, edited: true, matrix, sizes };
  LOG.push(`  ${id.padEnd(34)} ${label.padEnd(28)} #${Object.keys(matrix).length}  [${scheme}]`);
});

const bleed = {};
Object.entries(bleed).forEach(([id, [label, cat, sub, actions, sizing, stack, vs]]) => {
  sitList.push({ id, label, cat, sub, actions, sizing, stack, vs });
});

const out = { v: 1, ranges: importRanges };
fs.writeFileSync(OUT_JSON, JSON.stringify(out));
fs.writeFileSync(path.join(ROOT, 'rangos', 'out', 'edu_import_log.txt'), LOG.join('\n'));
console.log('RANGOS IMPORTADOS:', Object.keys(importRanges).length);
console.log('SITUACIONES:', sitList.length);
console.log('SIN ESQUEMA:', noScheme.length ? noScheme.join(' | ') : 'ninguno');

// data.js
const esc = s => `"${String(s).replace(/"/g, '\\"')}"`;
const b = [];
b.push("'use strict';");
b.push('/* =========================================================');
b.push('   data.js — categorías, situaciones y rangos por defecto');
b.push('   General: ER  (generado por ocr/edu2app.js)');
b.push('   ========================================================= */');
b.push('');
b.push("const POSITIONS = ['BB', 'SB', 'BTN', 'CO', 'HJ', 'LJ_UTG'];");
b.push('');
b.push('function S(id, label, cat, sub, actions, sizing, stack, vs, sizes) {');
b.push('  return { id, label, cat, sub, actions, sizing, stack, vs, sizes: sizes || {} };');
b.push('}');
b.push('');
b.push('const SITUATIONS = [');
sitList.forEach(s => {
  b.push(`  S(${esc(s.id)}, ${esc(s.label)}, ${esc(s.cat)}, ${esc(s.sub)}, ${JSON.stringify(s.actions)}, ${esc(s.sizing)}, ${s.stack}, ${esc(s.vs)}, ${JSON.stringify(s.sizes)}),`);
});
b.push('];');
b.push('');
b.push('const CATEGORIES = ' + JSON.stringify(['Open Raise', 'Call Vs Open Push', 'vs OR 10-20bb', 'vs OR 20bb', 'vs OR 30bb', 'vs OR 40bb', 'vs OR 50bb+', 'Otros', 'vs 3Bet 4Bet SQZ'], null, 2) + ';');
b.push('');
b.push('function defaultRange(sit) {');
b.push('  const matrix = {};');
b.push('  return { id: sit.id, label: sit.label, cat: sit.cat, sub: sit.sub,');
b.push('           actions: sit.actions.slice(), sizing: sit.sizing, stack: sit.stack,');
b.push('           vs: sit.vs, edited: false, matrix };');
b.push('}');
b.push('');
b.push('function buildDefaultRanges() {');
b.push('  const out = {};');
b.push('  SITUATIONS.forEach(s => { out[s.id] = defaultRange(s); });');
b.push('  return out;');
b.push('}');
fs.writeFileSync(OUT_DATA, b.join('\n'));
console.log('data.js bloque ->', OUT_DATA);