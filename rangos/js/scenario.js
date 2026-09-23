'use strict';
/* =========================================================
   scenario.js — construye la escena de cada pregunta de estudio:
   mesa con todos los jugadores, posiciones, heroe y la secuencia completa
   ========================================================= */

const SEAT_COORDS = {
  BB:    { left: '43%', top: '86%' },
  SB:    { left: '76%', top: '82%' },
  BTN:   { left: '86%', top: '30%' },
  CO:    { left: '64%', top: '12%' },
  HJ:    { left: '50%', top: '10%' },
  LJ:    { left: '31%', top: '13%' },
  UTG:   { left: '8%',  top: '46%' },
  'UTG+1': { left: '15%', top: '27%' },
  EP:    { left: '8%',  top: '62%' },
};

function posLabel(pos) {
  return { BB: 'BB', SB: 'SB', BTN: 'BTN', CO: 'CO', HJ: 'HJ', LJ: 'LJ', UTG: 'UTG', 'UTG+1': 'UTG+1' }[pos] || pos;
}
function fmtBb(n) {
  const v = Math.round(Number(n) * 10) / 10;
  return String(v).replace('.', ',') + 'bb';
}
function openSizeOf(sitId) {
  const r = getRange(sitId);
  return (r && r.sizes && r.sizes.raise) || 2;
}
function threeSizeOf(sitId) {
  const r = getRange(sitId);
  return (r && r.sizes && r.sizes['3bet']) || 7.5;
}

const _POSM = { utg: 'UTG', utg_1: 'UTG+1', lj: 'LJ', hj: 'HJ', co: 'CO', btn: 'BTN', sb: 'SB', bb: 'BB' };
/* Orden de actuación en la mesa (de early a BB) */
const ROW = ['UTG', 'UTG+1', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

/* Convierte el código de stack de un id en etiqueta legible (1020 → 10-20bb) */
function stackLabel(code) {
  const map = { 1020: '10-20bb', 3040: '30-40bb', 1012: '10-12bb', 2025: '20-25bb', 50: '50bb', 40: '40bb', 35: '30-40bb', 30: '30bb', 22: '20-25bb', 20: '20bb', 15: '15bb', 11: '10-12bb' };
  const k = String(code).replace(/bb$/, '');
  return map[k] || (k === String(code) ? code : k + 'bb');
}

function parseSid(id) {
  if (/^uor_/.test(id)) {
    const m = id.match(/^uor_([^_]+(?:_\d)?)_(.+)$/);
    return { type: 'OPEN', hero: _POSM[m[1]] || m[1], stack: m[2] };
  }
  let m;
  if ((m = id.match(/^vsor(\d+)_(bb|sb)(?:_(utg|utg_1|lj|hj|co|btn|sb))?$/))) {
    const key = { 1020: '10-20bb', 20: '20bb', 30: '30bb', 40: '40bb', 50: '50bb' }[m[1]] || m[1] + 'bb';
    return { type: 'DEFENSE', hero: m[2], opener: m[3] ? _POSM[m[3]] : null, stack: key };
  }
  if ((m = id.match(/^vsor(\d+)_(lj_utg|hj|co|btn)$/))) {
    const key = { 1020: '10-20bb', 20: '20bb', 30: '30bb', 40: '40bb', 50: '50bb' }[m[1]] || m[1] + 'bb';
    return { type: 'DEFENSE', hero: m[2] === 'lj_utg' ? 'lj' : m[2], opener: null, stack: key };
  }
  if ((m = id.match(/^cvp_bb_os_sb_(\d+)$/))) return { type: 'CVP', hero: 'BB', stack: m[1] + 'bb' };
  if ((m = id.match(/^cvp_(\d+|0_10)$/))) return { type: 'CVP', hero: 'BB', stack: (m[1] === '0_10' ? '0-10' : m[1]) + 'bb' };
  if (id === 'bb_vs_sb') return { type: 'BBVSSB', hero: 'BB', stack: '30bb' };
  if ((m = id.match(/^u_vs3(ip|oop)_(.+)$/))) return { type: 'VS3B', ip: m[1] === 'ip', hero: m[1] === 'ip' ? 'BTN' : 'CO', stack: m[2] };
  if ((m = id.match(/^u_v4bet_(.+)$/))) return { type: 'VS4B', hero: 'BTN', stack: m[1] };
  if ((m = id.match(/^u_vsqz_(.+)$/))) return { type: 'VSQ', hero: 'BTN', stack: m[1] };
  if ((m = id.match(/^u_sqz_(bb|sb|btn|co)_(.+?)(?:_(lj|hj|co|btn))?$/))) {
    return { type: 'SQZ', hero: _POSM[m[1]], opener: m[3] ? _POSM[m[3]] : null, stack: stackLabel(m[2]), stackRaw: m[2] };
  }
  if ((m = id.match(/^u_sbb_(.+)$/))) return { type: 'SBB', hero: 'SB', stack: m[1] };
  if ((m = id.match(/^u_sbbr_(.+)$/))) return { type: 'SBBR', hero: 'SB', stack: m[1] };
  if (id === 'u_sb3bb_20') return { type: 'SB3BB', hero: 'SB', stack: '20bb' };
  if ((m = id.match(/^u_bb_lsb_(.+)$/))) return { type: 'BBLIMP', hero: 'BB', stack: m[1] };
  if (/^mw_/.test(id)) return { type: 'MW', hero: 'BB', stack: id.split('_').slice(1).join(' ') };
  return { type: 'GEN', hero: null, stack: null };
}

function buildScene(id) {
  const info = parseSid(id);
  const r = getRange(id);
  const oSz = fmtBb(openSizeOf(id));
  const sz3 = fmtBb(threeSizeOf(id));
  const seats = [];
  const seq = [];
  const seat = (pos, text, cls) => { if (pos && pos !== 'TÚ') seats.push({ pos, text, cls: cls || '' }); };
  const die = (p) => { if (!p) return; seq.push({ player: p, text: 'fold' }); seat(p, '✕', 'fold'); };

  const opBefore = (def) => {
    const i = ROW.indexOf(def);
    const before = (i > 0 ? ROW.slice(0, i) : ['UTG']);
    return before[Math.floor(Math.random() * before.length)];
  };
  const between = (a, b) => {
    const i = ROW.indexOf(a), j = ROW.indexOf(b);
    return (i >= 0 && j > i + 1) ? ROW.slice(i + 1, j) : [];
  };

  switch (info.type) {
    case 'OPEN': {
      const H = info.hero;
      const idx = ROW.indexOf(H);
      for (let j = 0; j < idx && j < ROW.length; j++) die(ROW[j]);
      seq.push({ player: H, text: 'tú decides (abrir o retirarte)', hero: true });
      seat(H, 'TÚ', 'hero');
      return {
        intro: `Tú en ${posLabel(H)} · Stack ${info.stack} (ref ${fmtBb(r ? r.stack : info.stack)})`,
        hero: H, seats, seq,
        decisión: `Abrir (Bet ${oSz}) o retirarte`,
      };
    }
    case 'DEFENSE': {
      const HS = info.hero.toUpperCase();
      const H = (HS === 'BB' || HS === 'SB' || HS === 'BTN' || HS === 'CO' || HS === 'HJ' || HS === 'LJ' || HS === 'UTG') ? HS : 'BB';
      let op = info.opener;
      if (!op) op = opBefore(H);
      seq.push({ player: op, text: `abre ${oSz}` });
      seat(op, `abre ${oSz}`);
      const start = ROW.indexOf(op) + 1;
      const end = ROW.indexOf(H);
      for (let j = start; j < end; j++) die(ROW[j]);
      seq.push({ player: H, text: 'tú defiendes', hero: true });
      seat(H, 'TÚ', 'hero');
      const call = (r && r.sizes && r.sizes.call) || 2;
      return {
        intro: `vs OR de ${posLabel(op)} · Tú en ${posLabel(H)} · Stack ${info.stack}`,
        hero: H, seats, seq,
        decisión: `Defender (Call ${fmtBb(call)} / 3bet ${sz3}) o retirarte`,
      };
    }
    case 'CVP': {
      const pila = info.stack;
      seq.push({ player: 'SB', text: `va all-in ${pila}` });
      seat('SB', `all-in ${pila}`);
      seq.push({ player: 'BB', text: 'tú decides', hero: true });
      seat('BB', 'TÚ', 'hero');
      return { intro: 'Call al All-in o retirarte · Tú en BB', hero: 'BB', seats, seq, decisión: `Pagar ${pila} o retirarte` };
    }
    case 'BBVSSB': {
      // SB abre (o sube), BB decide
      seq.push({ player: 'SB', text: `abre ${oSz}` });
      seat('SB', `abre ${oSz}`);
      seq.push({ player: 'BB', text: 'tú decides', hero: true });
      seat('BB', 'TÚ', 'hero');
      const call = (r && r.sizes && r.sizes.call) || 2;
      return { intro: `SB abre, tú en BB · Stack ${info.stack}`, hero: 'BB', seats, seq, decisión: `Call ${fmtBb(call)} / 3bet ${sz3} o fold` };
    }
    case 'VS3B': {
      const H = info.hero; // IP=BTN · OOP=CO (abre el que sufrió el 3bet)
      const op = H === 'BTN' ? 'BB' : 'BTN';
      if (H === 'CO') for (let j = 0; j < ROW.indexOf('CO'); j++) die(ROW[j]);
      seq.push({ player: H, text: `abres ${oSz}`, hero: true });
      seat(H, `abre ${oSz}`, 'hero');
      seq.push({ player: op, text: `3betea ${sz3}` });
      seat(op, `3bet ${sz3}`);
      seq.push({ player: H, text: 'tú decides', hero: true });
      return {
        intro: `vs 3Bet ${info.ip ? 'IP' : 'OOP'} · tú en ${posLabel(H)} · Stack ${info.stack}`,
        hero: H, seats, seq, decisión: 'Responder al 3bet',
      };
    }
    case 'VS4B': {
      // BTN abre IP, BB 3betea, BTN 4betea, BB 5betea all-in
      seq.push({ player: 'BTN', text: `abres ${oSz}`, hero: true });
      seat('BTN', `abre ${oSz}`, 'hero');
      seq.push({ player: 'BB', text: `3betea ${sz3}` });
      seat('BB', `3bet ${sz3}`);
      seq.push({ player: 'BTN', text: 'tú 4beteas', hero: true });
      seq.push({ player: 'BB', text: '5betea all-in' });
      seq.push({ player: 'BTN', text: 'tú decides', hero: true });
      return { intro: `vs 4Bet · Stack ${info.stack}`, hero: 'BTN', seats, seq, decisión: 'Continuar frente al 4bet/5bet' };
    }
    case 'VSQ': {
      // BTN abre IP, SB paga, BB squeeze (3bet)
      seq.push({ player: 'BTN', text: `abres ${oSz}`, hero: true });
      seat('BTN', `abre ${oSz}`, 'hero');
      seq.push({ player: 'SB', text: 'paga' });
      seat('SB', 'paga');
      seq.push({ player: 'BB', text: `squeeze 3betea ${sz3}` });
      seat('BB', `3bet ${sz3}`);
      seq.push({ player: 'BTN', text: 'tú decides', hero: true });
      return { intro: 'Tú sufres el Squeeze · Stack ' + info.stack, hero: 'BTN', seats, seq, decisión: 'Responder al Squeeze' };
    }
    case 'SQZ': {
      const H = info.hero;
      const opn = info.opener ||
        ({ CO: 'UTG', BTN: 'HJ', SB: 'BTN', BB: 'BTN' }[H] || 'UTG');
      seq.push({ player: opn, text: `abre ${oSz}` });
      seat(opn, `abre ${oSz}`);
      // quien paga: jugador entre el que abre y el heroe (si hay sitio)
      const i0 = ROW.indexOf(opn), iH = ROW.indexOf(H);
      const caller = (i0 >= 0 && iH > i0 + 1) ? ROW[i0 + 1] : null;
      if (caller) {
        seq.push({ player: caller, text: 'paga' });
        seat(caller, 'paga');
      }
      seq.push({ player: H, text: 'tú decides', hero: true });
      seat(H, 'TÚ', 'hero');
      const vsTxt = opn ? ` vs OR ${posLabel(opn)}` : '';
      return { intro: `Squeeze desde ${posLabel(H)}${vsTxt} · Stack ${info.stack}`, hero: H, seats, seq, decisión: 'Squeeze (all-in), igualar o retirarte' };
    }
    case 'SBB': {
      seq.push({ player: 'SB', text: 'tú decides (limpear/abrir)', hero: true });
      seat('SB', 'TÚ', 'hero');
      seat('BB', '—');
      return { intro: `SB vs BB · Stack ${info.stack}`, hero: 'SB', seats, seq, decisión: 'Limpear / abrir / all-in' };
    }
    case 'SBBR': {
      seq.push({ player: 'SB', text: 'limpeas 0,5bb', hero: true });
      seat('SB', 'limp 0,5', 'hero');
      seq.push({ player: 'BB', text: 'sube 3bb' });
      seat('BB', 'sube 3bb');
      seq.push({ player: 'SB', text: 'tú decides', hero: true });
      return { intro: `SB vs BB tras rol · Stack ${info.stack}`, hero: 'SB', seats, seq, decisión: 'Responder al rol del BB' };
    }
    case 'SB3BB': {
      seq.push({ player: 'SB', text: 'abres (o pagas)', hero: true });
      seat('SB', 'OR', 'hero');
      seq.push({ player: 'BB', text: `3betea ${sz3}` });
      seat('BB', `3bet ${sz3}`);
      seq.push({ player: 'SB', text: 'tú decides', hero: true });
      return { intro: 'SB vs 3Bet del BB · 20bb', hero: 'SB', seats, seq, decisión: 'Continuar tras el 3bet del BB' };
    }
    case 'BBLIMP': {
      seq.push({ player: 'SB', text: 'limpea 0,5bb' });
      seat('SB', 'limp 0,5');
      seq.push({ player: 'BB', text: 'tú decides', hero: true });
      seat('BB', 'TÚ', 'hero');
      return { intro: `BB vs SB Limp · Stack ${info.stack}`, hero: 'BB', seats, seq, decisión: 'Chequear o subir (Rol)' };
    }
    default: {
      const H = info.hero || 'BB';
      seq.push({ player: H, text: 'tú decides', hero: true });
      seat(H, 'TÚ', 'hero');
      return { intro: (r && r.label) || id, hero: H, seats, seq, decisión: '' };
    }
  }
}

/* -- Cadena: abrir -> enfrentar un 3bet (misma mano) -- */
function buildChains(limit) {
  const vsSits = SITUATIONS.filter(s => /^u_vs3ip_/.test(s.id) && getRange(s.id) && getRange(s.id).edited);
  const openSits = SITUATIONS.filter(s => /^uor_/.test(s.id) && getRange(s.id) && getRange(s.id).edited);
  const out = [];
  for (const v of vsSits) {
    const own = v.stack;
    const cand = openSits.filter(o => Math.abs(o.stack - own) <= 10);
    const pool = cand.length ? cand : openSits;
    const op = pool[Math.floor(Math.random() * pool.length)];
    const hands = Object.keys(getRange(op.id).matrix || {});
    if (!hands.length) continue;
    const hand = hands[Math.floor(Math.random() * hands.length)];
    // eslabón 3 real cuando existe: tras tu 4bet te 5betean all-in (mismo stack, hero BTN)
    let v4Id = null;
    if (op.hero === 'BTN') {
      const v4 = v4betForStack(own);
      if (v4) v4Id = v4.id;
    }
    out.push({
      chainKey: 'chain_' + op.id + '_' + hand,
      step: 0, openId: op.id, vsId: v.id, v4Id, hand,
      intro: `Cadena: abres desde ${posLabel(parseSid(op.id).hero)} y luego te 3betean`,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/* Devuelve la situación `u_v4bet_*` para el stack dado (hero BTN) */
function v4betForStack(stack) {
  const id = 'u_v4bet_' + stack.replace(/-/g, '_');
  return getRange(id) ? { id } : null;
}