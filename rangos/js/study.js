'use strict';
/* =========================================================
   study.js — generador de flashcards y lógica de sesión
   ========================================================= */

let session = null;

/* Modos de estudio:
   'limite'   -> solo manos al límite (mezcla o corte frecuencial)
   'limite_y_dentro' -> 65% límites / 35% dentro
   'dentro'   -> solo manos claramente dentro
   'todo'     -> todo el rango ponderado
   cfg.missesOnly -> solo manos con algún fallo registrado
   cfg.limit  -> tope de preguntas (máx. 50 desde la UI)
*/
function buildPool(sitIds, mode) {
  const pool = [];
  sitIds.forEach(sitId => {
    const r = getRange(sitId);
    if (!r || !r.edited) return;
    const matriz = r.matrix || {};
    Object.entries(matriz).forEach(([hand, lines]) => {
      if (!isValidClass(hand)) return; // proteger contra datos corruptos
      const withFold = linesWithImplicitFold(lines);
      const border = isBorderline(lines);
      const inside = isPureInside(lines);
      if (mode === 'limite' && !border) return;
      if (mode === 'dentro' && !inside) return;
      if (mode === 'limite_y_dentro') {
        if (!border && !inside) return;
      }
      pool.push({ sitId, hand, lines: withFold, border, inside });
    });
  });
  return pool;
}

function pickHandPool(mode, sitIds) {
  const base = buildPool(sitIds, 'todo');
  if (mode === 'limite') return base.filter(p => p.border);
  if (mode === 'dentro') return base.filter(p => p.inside);
  if (mode === 'limite_y_dentro') {
    const borders = base.filter(p => p.border);
    const inside = base.filter(p => p.inside && !p.border);
    // 65% bordes / 35% dentro
    const nBorder = Math.ceil(base.length * 0.65);
    const out = [];
    while (borders.length) {
      pickOne(out, borders);
    }
    while (inside.length && out.length < nBorder + Math.ceil(base.length * nBorder * 0.4)) {
      pickOne(out, inside);
    }
    // rellenar con todo si falta
    const seen = new Set(out.map(p => p.sitId + '_' + p.hand));
    base.forEach(p => { if (!seen.has(p.sitId + '_' + p.hand)) out.push(p); });
    return out;
  }
  // 'todo' o desconocido
  return base;
}

function pickOne(out, arr) {
  const i = Math.floor(Math.random() * arr.length);
  out.push(arr[i]);
  arr.splice(i, 1);
}

function buildSession(cfg) {
  const sitIds = cfg.sitIds;
  const mode = cfg.mode;
  const limit = parseInt(cfg.limit, 10) || 0;

  let pool = pickHandPool(mode, sitIds);

  // 'Solo falladas': únicamente manos con al menos un fallo registrado
  if (cfg.missesOnly) {
    pool = pool.filter(p => getStat(p.sitId, p.hand).bad > 0);
  }

  if (cfg.prioritize) {
    // shuffled ponderado por fallos
    const w = pool.map(p => ({ p, w: weightFor(getStat(p.sitId, p.hand), p.sitId, p.hand) + Math.random() * 0.3 }));
    w.sort((a, b) => b.w - a.w);
    session = { list: w.map(x => x.p), idx: 0, done: false, cnt: { ok: 0, warn: 0, bad: 0 }, mode };
  } else {
    shuffle(pool);
    session = { list: pool, idx: 0, done: false, cnt: { ok: 0, warn: 0, bad: 0 }, mode };
  }
  if (limit > 0 && session.list.length > limit) session.list = session.list.slice(0, limit);
  session.list.forEach(entry => {
    entry.cards = randomDeal(entry.hand);
  });

  // cadenas: abrir -> enfrentar un 3bet (misma mano, dos preguntas seguidas)
  if (!cfg.missesOnly) {
    session.list = session.list.concat(buildChainEntries(cfg.chains || 0));
    if (limit > 0 && session.list.length > limit) session.list = session.list.slice(0, limit);
  }
  return session;
}

function buildChainEntries(n) {
  const out = [];
  if (!n) return out;
  for (const c of buildChains(n)) {
    const o = getRange(c.openId);
    const v = getRange(c.vsId);
    if (!o || !v || !o.matrix[c.hand] || !v.matrix[c.hand]) continue;
    const cards = randomDeal(c.hand);
    out.push({
      sitId: c.openId, hand: c.hand,
      lines: linesWithImplicitFold(o.matrix[c.hand]),
      border: isBorderline(o.matrix[c.hand]), inside: isPureInside(o.matrix[c.hand]),
      cards,
      chainKey: c.chainKey, chainStep: 0, chainOpenLabel: o.label, chainVsLabel: v.label,
    });
    out.push({
      sitId: c.vsId, hand: c.hand,
      lines: linesWithImplicitFold(v.matrix[c.hand]),
      border: isBorderline(v.matrix[c.hand]), inside: isPureInside(v.matrix[c.hand]),
      cards,
      chainKey: c.chainKey, chainStep: 1, chainOpenLabel: o.label, chainVsLabel: v.label,
    });
    // Cuarto eslabón real cuando existe la matriz "tras tu 4bet te 5betean all-in"
    // (misma mano y mismo eslabón vs3bet: p. ej. BTN 30-50bb → u_v4bet_3050bb)
    if (c.v4Id && c.v4Id !== c.vsId) {
      const q = getRange(c.v4Id);
      if (q && q.matrix && q.matrix[c.hand]) {
        const w = q.matrix[c.hand].map(l => ({ ...l, freq: l.freq || 0 })) ;
        const totalF = w.reduce((s, l) => s + l.freq, 0);
        if (totalF > 0) {
          out.push({
            sitId: c.v4Id, hand: c.hand,
            lines: w,
            border: isBorderline(w), inside: isPureInside(w),
            cards,
            chainKey: c.chainKey, chainStep: 2, chainOpenLabel: o.label,
            chainVsLabel: v.label, chainV4Label: q.label,
          });
        }
      }
    }
  }
  return out;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
}

function currentCard() {
  return session.list[session.idx];
}

function answerLines(entry) {
  // botones únicos por acción+tag con freq>0 (incluye fold implícito)
  const map = new Map();
  entry.lines.forEach(l => {
    if (l.freq <= 0) return;
    const k = l.action + '|' + l.tag;
    if (map.has(k)) map.get(k).freq += l.freq;
    else map.set(k, { action: l.action, tag: l.tag, freq: l.freq });
  });
  const out = [...map.values()];
  const total = out.reduce((s, l) => s + l.freq, 0);
  out.forEach(l => { l.freq = Math.round((l.freq / Math.max(total, 0.001)) * 100); });
  return out;
}

function isCorrectOption(entry, chosenAction, chosenTag) {
  const rLines = entry.lines.filter(l => l.action === chosenAction && l.freq > 0);
  if (!rLines.length) return false;
  const t = String(chosenTag == null ? '' : chosenTag);
  const WANT_AI = t === 'ai' || /all-in|allin/i.test(t);
  const hasAI = rLines.some(l => l.action === 'jam' || /all-in|allin/i.test(l.tag || ''));
  const hasSized = rLines.some(l => l.action !== 'jam' && !/all-in|allin/i.test(l.tag || ''));
  if (WANT_AI) return hasAI;
  if (t === 'size') return hasSized;
  if (t === '') return true;
  if (Number.isFinite(Number(t))) {
    if (!hasSized) return false;
    const r = getRange(entry.sitId);
    const sz = r && r.sizes ? r.sizes[chosenAction] : null;
    if (sz != null && Math.abs(Number(t) - Number(sz)) > 1e-9) return false;
    return true;
  }
  return true;
}

function gradeCard(entry, chosenAction, chosenTag) {
  return isCorrectOption(entry, chosenAction, chosenTag);
}

function nextCard() {
  session.idx++;
  if (session.idx >= session.list.length) session.done = true;
}

function sessionSummaries() {
  const map = {};
  session.list.forEach(e => {
    (map[e.sitId] = map[e.sitId] || { ok: 0, warn: 0, bad: 0, n: 0 });
  });
  session.list.forEach(e => {
    const s = STATS ? getStatForSit(e.sitId) : null;
    map[e.sitId].n = (s && s.n) || 0;
  });
  return map;
}