import { speeds } from './flight';
import { AIRPORTS, SCN } from './scenario';
import { irOk, type Emit } from './systems';
import type { SimState } from './types';

export type Col = 'w' | 'b' | 'g' | 'a' | 'm' | 'y';
export interface Seg {
  t: string;
  c: Col;
  sm?: boolean;
}
export interface McduRow {
  l?: Seg[];
  c?: Seg[];
  r?: Seg[];
}
export interface McduPage {
  title: Seg[];
  rows: [McduRow, McduRow][]; // 6 пар: (метка, данные)
  arrowsLR?: boolean;
  arrowsUD?: boolean;
}

const w = (t: string, sm = false): Seg => ({ t, c: 'w', sm });
const b = (t: string, sm = false): Seg => ({ t, c: 'b', sm });
const g = (t: string, sm = false): Seg => ({ t, c: 'g', sm });
const a = (t: string, sm = false): Seg => ({ t, c: 'a', sm });
const m = (t: string, sm = false): Seg => ({ t, c: 'm', sm });
const box = (n: number) => a('□'.repeat(n));
const E: McduRow = {};

const DEP_SID_LEGS: Record<string, string[]> = {
  BAXOS5B: ['D323A', 'BAXOS'],
  PERIG5B: ['D323A', 'PERIG'],
  NEVEL5B: ['D323A', 'NEVEL'],
  BAXOS5D: ['D323B', 'BAXOS'],
  PERIG5D: ['D323B', 'PERIG'],
};

export function mcduPowered(s: SimState) {
  return s.elec.acEss;
}

function fmt1(v: number | null) {
  return v == null ? null : v.toFixed(1);
}

function thsStr(v: number | null) {
  if (v == null) return null;
  return (v >= 0 ? 'UP' : 'DN') + Math.abs(v).toFixed(1);
}

export function fplnLegs(s: SimState): { id: string; kind: 'dep' | 'sid' | 'rte' | 'dest' }[] {
  const f = s.fms;
  if (!f.from) return [];
  if (f.arr) return [{ id: 'CI06', kind: 'rte' }, { id: 'FF06', kind: 'rte' }, { id: 'RW06', kind: 'rte' }, { id: 'MA06', kind: 'rte' }, { id: 'LFPO06', kind: 'dest' }];
  const out: { id: string; kind: 'dep' | 'sid' | 'rte' | 'dest' }[] = [{ id: f.from + (f.rwy || ''), kind: 'dep' }];
  if (f.sid) for (const x of DEP_SID_LEGS[f.sid] ?? []) out.push({ id: x, kind: 'sid' });
  for (const x of f.route) if (x !== f.to && !out.some((o) => o.id === x)) out.push({ id: x, kind: 'rte' });
  out.push({ id: f.to, kind: 'dest' });
  return out;
}

// ============================ отрисовка ============================
export function renderMcdu(s: SimState): McduPage {
  const f = s.fms;
  switch (f.page) {
    case 'INIT':
      return initA(s);
    case 'INITB':
      return initB(s);
    case 'FPLN':
      return fpln(s);
    case 'LATREV':
      return {
        title: [w('LAT REV '), g('FROM ' + f.from)],
        rows: [
          [E, { l: [w('<DEPARTURE')], r: [w('FIX INFO>')] }],
          [E, { l: [w('<OFFSET')], r: [w('[    ]°/[ ]°/[  ]', true)] }],
          [E, { r: [w('NEXT WPT', true)] }],
          [E, { r: [b('[      ]')] }],
          [E, E],
          [E, { l: [w('<RETURN')] }],
        ],
      };
    case 'DEP':
      return dep(s);
    case 'PERF':
      return perf(s);
    case 'PERFAPPR':
      return perfAppr(s);
    case 'PROG':
      return {
        title: [g(s.ac.onGround ? 'TAKE OFF ' : 'CLB '), w(SCN.callsign)],
        rows: [
          [{ l: [w('CRZ')], c: [w('OPT')], r: [w('REC MAX')] }, { l: [b(f.crzFl ? 'FL' + f.crzFl : '-----')], c: [g('-----')], r: [m('FL398')] }],
          [E, { l: [w('<REPORT')] }],
          [{ l: [w('POSITION UPDATE AT')] }, { l: [b('*[      ]')] }],
          [{ c: [w('BRG / DIST')] }, { c: [g('---°/----.-')], r: [w('TO '), b('[    ]')] }],
          [{ l: [w('PREDICTIVE')] }, { l: [w('<GPS')], r: [w('GPS PRIMARY')] }],
          [{ l: [w('REQUIRED')], c: [w('ACCUR')], r: [w('ESTIMATED')] }, { l: [b('1.0NM')], c: [g('HIGH')], r: [g('0.08NM')] }],
        ],
      };
    case 'RADNAV':
      return {
        title: [w('RADIO NAV')],
        rows: [
          [{ l: [w('VOR1/FREQ')], r: [w('FREQ/VOR2')] }, { l: [b('TOU/117.70', false)], r: [b('[ ]/[  . ]')] }],
          [{ l: [w('CRS')], r: [w('CRS')] }, { l: [b('[ ]')], r: [b('[ ]')] }],
          [{ l: [w('ILS /FREQ')] }, { l: [b('[  ]/[  . ]')] }],
          [{ l: [w('CRS')] }, { l: [b('[ ]')] }],
          [{ l: [w('ADF1/FREQ')], r: [w('FREQ/ADF2')] }, { l: [b('[ ]/[  . ]')], r: [b('[ . ]/[ ]')] }],
          [E, E],
        ],
      };
    case 'FUEL':
      return {
        title: [w('FUEL PRED')],
        rows: [
          [{ l: [w('AT')], c: [w('UTC')], r: [w('EFOB')] }, { l: [g(f.to || '----')], c: [g('----')], r: [g('---.-')] }],
          [E, { l: [g(f.altn ?? '')] }],
          [E, E],
          [{ l: [w('GW')], c: [w('CG')], r: [w('FOB')] }, { l: [g((s.ac.gw / 1000).toFixed(1))], c: [g(f.zfwcg != null ? f.zfwcg.toFixed(1) : '--.-')], r: [g(((s.fuel.left + s.fuel.right + s.fuel.center) / 1000).toFixed(1))] }],
          [{ l: [w('RTE RSV/%')] }, { l: [b('0.3/5.0')] }],
          [{ l: [w('FINAL/TIME')], r: [w('EXTRA/TIME')] }, { l: [b('1.1/0030')], r: [g('---.-/----')] }],
        ],
      };
    case 'MENU':
      return {
        title: [w('MCDU MENU')],
        rows: [
          [E, { l: [g('<FMGC')] }],
          [E, { l: [w('<ATSU')] }],
          [E, { l: [w('<AIDS')] }],
          [E, { l: [w('<CFDS')] }],
          [E, E],
          [E, { r: [w('RETURN>')] }],
        ],
      };
    case 'STATUS':
    default:
      return {
        title: [w('A320-200')],
        rows: [
          [{ l: [w(' ENG')] }, { l: [g('CFM56-5B4')] }],
          [{ l: [w(' ACTIVE NAV DATA BASE')] }, { l: [b(' 09OCT-05NOV')], r: [b('EGM2611001')] }],
          [{ l: [w(' SECOND NAV DATA BASE')] }, { l: [b('<05NOV-03DEC', true)] }],
          [E, E],
          [{ l: [w('CHG CODE')] }, { l: [b('[  ]')] }],
          [{ l: [w('IDLE/PERF')], r: [w('SOFTWARE')] }, { l: [g('+0.0/+0.0')], r: [w('STATUS/XLOAD>')] }],
        ],
      };
  }
}

function initA(s: SimState): McduPage {
  const f = s.fms;
  const aligning = s.adirs.ir.some((ir) => ir.aligning && !ir.fault) && !f.posConfirmed;
  const ap = f.from ? AIRPORTS[f.from] : null;
  const lat = ap ? (f.from === 'LFBO' ? '4337.8N' : '4843.5N') : '----.-';
  const lon = ap ? (f.from === 'LFBO' ? '00121.8E' : '00222.8E') : '-----.--';
  return {
    title: [w('INIT')],
    arrowsLR: true,
    rows: [
      [{ l: [w(' CO RTE')], r: [w('FROM/TO  ')] }, { l: [f.from ? b('NONE') : box(10)], r: [f.from ? b(`${f.from}/${f.to}`) : box(9)] }],
      [{ l: [w('ALTN/CO RTE')] }, { l: [f.altn ? b(f.altn) : b('----'), w('/----------')], r: [f.from ? w('INIT ') : w(''), f.from ? a('REQUEST*') : w('')] }],
      [{ l: [w('FLT NBR')] }, { l: [f.fltNbr ? b(f.fltNbr) : box(8)], r: [aligning && f.from ? a('ALIGN IRS→') : w('')] }],
      [{ l: [w('LAT')], r: [w('LONG')] }, { l: [b(lat)], r: [b(lon)] }],
      [{ l: [w('COST INDEX')] }, { l: [f.ci != null ? b(String(f.ci)) : f.from ? box(3) : w('---')], r: [w('WIND/TEMP>')] }],
      [
        { l: [w('CRZ FL/TEMP')], r: [w('TROPO')] },
        {
          l: [f.crzFl ? b(`FL${f.crzFl}/${f.crzTemp ?? Math.round(15 - 1.98 * f.crzFl / 10)}°`) : f.from ? box(5) : w('-----'), f.crzFl ? w('') : w('/---°')],
          r: [b('36090')],
        },
      ],
    ],
  };
}

function initB(s: SimState): McduPage {
  const f = s.fms;
  const tow = f.zfw != null && f.block != null ? (f.zfw + f.block - SCN.taxiFuel).toFixed(1) : '---.-';
  const lw = f.zfw != null && f.block != null ? (f.zfw + f.block - SCN.taxiFuel - 4.1).toFixed(1) : '---.-';
  return {
    title: [w('INIT '), w('FUEL & LOAD', true)],
    arrowsLR: true,
    rows: [
      [{ l: [w('TAXI')], r: [w('ZFW/ZFWCG')] }, { l: [b(SCN.taxiFuel.toFixed(1))], r: [f.zfw != null ? b(`${fmt1(f.zfw)}/${fmt1(f.zfwcg) ?? '--.-'}`) : box(9)] }],
      [{ l: [w('TRIP/TIME')], r: [w('BLOCK')] }, { l: [g(f.zfw != null && f.block != null ? '4.1/0108' : '---.-/----')], r: [f.block != null ? b(fmt1(f.block)!) : box(4)] }],
      [{ l: [w('RTE RSV/%')] }, { l: [g(f.block != null ? '0.3/5.0' : '---.-/---')] }],
      [{ l: [w('ALTN/TIME')], r: [w('TOW/LW')] }, { l: [g(f.block != null ? '1.6/0034' : '---.-/----')], r: [g(`${tow}/${lw}`)] }],
      [{ l: [w('FINAL/TIME')], r: [w('TRIP WIND')] }, { l: [b(f.block != null ? '1.1/0030' : '---.-/----')], r: [b('HD000')] }],
      [{ l: [w('EXTRA/TIME')], r: [w('MIN DEST FOB')] }, { l: [g(f.block != null ? '2.5/0102' : '---.-/----')], r: [b(f.block != null ? '2.7' : '---.-')] }],
    ],
  };
}

function fpln(s: SimState): McduPage {
  const f = s.fms;
  const legs = fplnLegs(s);
  if (!legs.length)
    return {
      title: [w('')],
      rows: [[E, { c: [w('------NO F-PLN------')] }], [E, E], [E, E], [E, E], [E, E], [E, E]],
    };
  const rows: [McduRow, McduRow][] = [];
  const start = Math.min(f.depScroll, Math.max(0, legs.length - 5));
  const vis = legs.slice(start, start + 5);
  vis.forEach((L, i) => {
    const isDest = L.kind === 'dest';
    const col: Col = isDest ? 'w' : i === 0 && start === 0 ? 'w' : 'g';
    rows.push([
      i === 0 ? { l: [w(' FROM')], r: [w(isDest ? '' : 'UTC  SPD/ALT  ')] } : { l: [w(L.kind === 'sid' ? ' C323°' : '')] },
      { l: [{ t: L.id, c: col }], r: [{ t: L.kind === 'dep' ? `----  ---/${s.elev}` : '----  ---/ ----', c: 'g' }] },
    ]);
  });
  while (rows.length < 5) rows.push([E, E]);
  rows.push([{ l: [w('DEST    UTC  DIST  EFOB')] }, { l: [w(f.to)], c: [g('----  ' + (f.to ? '  337' : ''))], r: [g('---.-')] }]);
  return { title: [w(' '), w(f.fltNbr || '')], rows, arrowsUD: true };
}

function dep(s: SimState): McduPage {
  const f = s.fms;
  const ap = AIRPORTS[f.from];
  const rows: [McduRow, McduRow][] = [];
  rows.push([
    { l: [w(' RWY')], c: [w('SID')], r: [w('TRANS ')] },
    { l: [f.tmpRwy ? { t: f.tmpRwy, c: 'y' } : f.rwy ? g(f.rwy) : w('---')], c: [f.tmpSid ? { t: f.tmpSid, c: 'y' } : f.sid ? g(f.sid) : w('------')], r: [w('------')] },
  ]);
  if (!f.tmpRwy) {
    const list = ap?.rwys ?? [];
    for (let i = 0; i < 4; i++) {
      const r = list[i];
      rows.push([
        i === 0 ? { c: [w('AVAILABLE RUNWAYS')] } : E,
        r ? { l: [b(`←${r.id}`)], c: [b(`${r.len}M`, true)], r: [b(`CRS${String(r.hdg).padStart(3, '0')}`)] } : E,
      ]);
    }
  } else {
    const rw = ap.rwys.find((r) => r.id === f.tmpRwy);
    const sids = rw?.sids ?? [];
    for (let i = 0; i < 4; i++) {
      rows.push([i === 0 ? { c: [w('SIDS  AVAILABLE  TRANS')] } : E, sids[i] ? { l: [b(`←${sids[i]}`)] } : E]);
    }
  }
  rows.push([{ r: [a('TMPY', true)] }, { l: [w('<ERASE')], r: [f.tmpRwy ? a('INSERT*') : w('')] }]);
  return { title: [w('DEPARTURES FROM '), g(f.from)], rows, arrowsLR: true };
}

function perfAppr(s: SimState): McduPage {
  const f = s.fms;
  const sp = speeds(s);
  const n = (x: number | null, boxes: number) => (x != null ? b(String(x)) : box(boxes));
  return {
    title: [g('APPR', false)],
    rows: [
      [{ l: [w('QNH')], c: [w('FLP RETR')], r: [w('FINAL')] }, { l: [n(f.qnhAppr, 4)], c: [w('F='), g(String(sp.F))], r: [g(f.appr || '----')] }],
      [{ l: [w('TEMP')], c: [w('SLT RETR')], r: [w('BARO')] }, { l: [f.tempAppr != null ? b(`${f.tempAppr}°`) : b('---°')], c: [w('S='), g(String(sp.S))], r: [f.mda != null ? b(String(f.mda)) : b('[    ]')] }],
      [{ l: [w('MAG WIND')], c: [w('CLEAN')], r: [w('RADIO')] }, { l: [b(f.windAppr || '---°/---')], c: [w('O='), g(String(sp.GD))], r: [f.dh != null ? b(String(f.dh)) : b('[   ]')] }],
      [{ l: [w('TRANS FL')], r: [w('LDG CONF  ')] }, { l: [b('FL060')], r: [f.ldgConf === 3 ? b('CONF3*') : w('CONF3*')] }],
      [{ l: [w('VAPP')], c: [w('VLS')] }, { l: [b(String(sp.vapp))], c: [g(String(f.ldgConf === 4 ? sp.vlsFull : sp.vlsConf3))], r: [f.ldgConf === 4 ? b('FULL*') : w('FULL*')] }],
      [E, { l: [w('<PREV PHASE')], r: [w('NEXT PHASE>')] }],
    ],
  };
}

function perf(s: SimState): McduPage {
  const f = s.fms;
  const sp = speeds(s);
  const v = (x: number | null) => (x != null ? b(String(x)) : box(3));
  return {
    title: [g('TAKE OFF ', false), w(f.rwy ? 'RWY ' : ''), g(f.rwy)],
    rows: [
      [{ l: [w(' V1')], c: [w('FLP RETR')], r: [w('RWY ')] }, { l: [v(f.v1)], c: [w('F='), g(String(sp.F))], r: [g(f.rwy || '---')] }],
      [{ l: [w(' VR')], c: [w('SLT RETR')], r: [w('TO SHIFT ')] }, { l: [v(f.vr)], c: [w('S='), g(String(sp.S))], r: [b('[M][   ]*')] }],
      [{ l: [w(' V2')], c: [w('CLEAN')], r: [w('FLAPS/THS')] }, { l: [v(f.v2)], c: [w('O='), g(String(sp.GD))], r: [f.toFlaps != null ? b(`${f.toFlaps}/${thsStr(f.ths) ?? '[   ]'}`) : b('[ ]/[    ]')] }],
      [{ l: [w('TRANS ALT')], r: [w('FLEX TO TEMP')] }, { l: [b(String(f.transAlt))], r: [f.flex != null ? b(`${f.flex}°`) : b('[ ]°')] }],
      [{ l: [w('THR RED/ACC')], r: [w('ENG OUT ACC')] }, { l: [b(`${f.thrRed}/${f.accAlt}`)], r: [b(String(f.accAlt))] }],
      [E, { l: [w('<TO DATA')], r: [w('NEXT PHASE>')] }],
    ],
  };
}

// ============================ ввод ============================
const MSG = {
  fmt: 'FORMAT ERROR',
  na: 'NOT ALLOWED',
  range: 'ENTRY OUT OF RANGE',
  db: 'NOT IN DATABASE',
};

function setMsg(s: SimState, t: string) {
  s.fms.msg = t;
}

export function mcduKey(s: SimState, key: string, emit: Emit) {
  const f = s.fms;
  if (!mcduPowered(s)) return;
  emit({ type: 'mcduKey', key });
  if (f.msg && key !== 'CLR') {
    // любое нажатие убирает сообщение
    f.msg = '';
  }
  const pages: Record<string, string> = {
    INIT: 'INIT',
    PERF: 'PERF',
    'F-PLN': 'FPLN',
    PROG: 'PROG',
    DATA: 'STATUS',
    'RAD NAV': 'RADNAV',
    'FUEL PRED': 'FUEL',
    'MCDU MENU': 'MENU',
    AIRPORT: 'FPLN',
    DIR: 'FPLN',
    'SEC F-PLN': 'FPLN',
    'ATC COMM': 'MENU',
  };
  if (pages[key]) {
    f.page = pages[key];
    if (key === 'PERF' && f.arr) f.page = 'PERFAPPR';
    return;
  }
  switch (key) {
    case 'CLR':
      if (f.msg) f.msg = '';
      else if (f.scratch === 'CLR') f.scratch = '';
      else if (f.scratch) f.scratch = f.scratch.slice(0, -1);
      else f.scratch = 'CLR';
      return;
    case 'LEFT':
    case 'RIGHT':
      if (f.page === 'INIT') f.page = 'INITB';
      else if (f.page === 'INITB') f.page = 'INIT';
      return;
    case 'UP':
      f.depScroll = Math.max(0, f.depScroll - 1);
      return;
    case 'DOWN':
      f.depScroll = Math.min(6, f.depScroll + 1);
      return;
    case 'SP':
      key = ' ';
      break;
    case '+/-':
      if (f.scratch.endsWith('-')) f.scratch = f.scratch.slice(0, -1) + '+';
      else if (f.scratch.endsWith('+')) f.scratch = f.scratch.slice(0, -1) + '-';
      else f.scratch += '-';
      return;
    case 'OVFY':
      key = 'Δ';
      break;
  }
  if (key.length === 1) {
    if (f.scratch === 'CLR') f.scratch = '';
    if (f.scratch.length < 22) f.scratch += key;
  }
}

function num(t: string) {
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return parseFloat(t);
}

export function mcduLsk(s: SimState, side: 'L' | 'R', i: number, emit: Emit) {
  const f = s.fms;
  if (!mcduPowered(s)) return;
  emit({ type: 'mcduKey', key: `LSK${i}${side}` });
  const sp = f.scratch === 'CLR' ? '' : f.scratch.trim();
  const clr = f.scratch === 'CLR';
  const ok = () => {
    f.scratch = '';
    emit({ type: 'fms', page: f.page, lsk: `${i}${side}` });
  };
  const err = (t: string) => setMsg(s, t);
  const k = `${i}${side}`;

  switch (f.page) {
    case 'INIT':
      if (k === '1R') {
        const m2 = /^([A-Z]{4})\/([A-Z]{4})$/.exec(sp);
        if (!m2) return err(MSG.fmt);
        if (!AIRPORTS[m2[1]] || !AIRPORTS[m2[2]]) return err(MSG.db);
        f.from = m2[1];
        f.to = m2[2];
        f.route = m2[1] === SCN.from && m2[2] === SCN.to ? [...SCN.route] : [m2[2]];
        if (!f.fltNbr && !f.ci) {
          /* ничего */
        }
        return ok();
      }
      if (k === '2L') {
        if (clr) {
          f.altn = '';
          return ok();
        }
        const ap = sp.split('/')[0];
        if (!/^[A-Z]{4}$/.test(ap)) return err(MSG.fmt);
        if (!AIRPORTS[ap]) return err(MSG.db);
        f.altn = ap;
        return ok();
      }
      if (k === '3L') {
        if (!/^[A-Z0-9]{1,8}$/.test(sp)) return err(MSG.fmt);
        f.fltNbr = sp;
        return ok();
      }
      if (k === '3R') {
        const aligning = s.adirs.ir.some((ir) => ir.aligning && !ir.fault);
        if (!f.from || !aligning || f.posConfirmed) return err(MSG.na);
        f.posConfirmed = true;
        emit({ type: 'alignIrs' });
        return ok();
      }
      if (k === '5L') {
        const n = num(sp);
        if (n == null || !Number.isInteger(n)) return err(MSG.fmt);
        if (n < 0 || n > 999) return err(MSG.range);
        if (!f.from) return err(MSG.na);
        f.ci = n;
        return ok();
      }
      if (k === '6L') {
        const m2 = /^(?:FL)?(\d{2,3})(?:\/([+-]?\d{1,2}))?$/.exec(sp);
        if (!m2) return err(MSG.fmt);
        const fl = parseInt(m2[1], 10);
        if (fl < 10 || fl > 398) return err(MSG.range);
        if (!f.from) return err(MSG.na);
        f.crzFl = fl;
        f.crzTemp = m2[2] != null ? parseInt(m2[2], 10) : null;
        return ok();
      }
      if (k === '5R' || k === '2R') return;
      return err(MSG.na);
    case 'INITB':
      if (k === '1R') {
        const m2 = /^(\d{2,3}(?:\.\d)?)?\/?(\d{1,2}(?:\.\d)?)?$/.exec(sp);
        if (!sp || !m2 || (!m2[1] && !m2[2])) return err(MSG.fmt);
        if (m2[1]) {
          const z = parseFloat(m2[1]);
          if (z < 35 || z > 64.3) return err(MSG.range);
          f.zfw = z;
        }
        if (m2[2]) {
          const cg = parseFloat(m2[2]);
          if (cg < 8 || cg > 45) return err(MSG.range);
          f.zfwcg = cg;
        }
        return ok();
      }
      if (k === '2R') {
        const n = num(sp);
        if (n == null) return err(MSG.fmt);
        if (n < 0.5 || n > 19.5) return err(MSG.range);
        f.block = n;
        return ok();
      }
      return err(MSG.na);
    case 'FPLN': {
      if (k === '1L' && f.from && f.depScroll === 0) {
        f.page = 'LATREV';
        return;
      }
      return err(MSG.na);
    }
    case 'LATREV':
      if (k === '1L') {
        f.page = 'DEP';
        f.tmpRwy = '';
        f.tmpSid = '';
        return;
      }
      if (k === '6L') {
        f.page = 'FPLN';
        return;
      }
      return;
    case 'DEP': {
      const ap = AIRPORTS[f.from];
      if (k === '6L') {
        f.tmpRwy = '';
        f.tmpSid = '';
        f.page = 'FPLN';
        return;
      }
      if (k === '6R') {
        if (!f.tmpRwy) return;
        f.rwy = f.tmpRwy;
        f.sid = f.tmpSid;
        f.tmpRwy = '';
        f.tmpSid = '';
        f.page = 'FPLN';
        emit({ type: 'fms', page: 'DEP', lsk: 'INSERT' });
        return;
      }
      if (side === 'L' && i >= 2 && i <= 5) {
        if (!f.tmpRwy) {
          const r = ap.rwys[i - 2];
          if (r) f.tmpRwy = r.id;
        } else {
          const rw = ap.rwys.find((r) => r.id === f.tmpRwy);
          const sid = rw?.sids[i - 2];
          if (sid) f.tmpSid = sid;
        }
        return;
      }
      return;
    }
    case 'PERF': {
      if (k === '6R' && f.arr) {
        f.page = 'PERFAPPR';
        return;
      }
      const sp3 = (x: string) => {
        const n = num(x);
        if (n == null || !Number.isInteger(n)) return 'fmt';
        if (n < 90 || n > 350) return 'range';
        return n;
      };
      if (k === '1L' || k === '2L' || k === '3L') {
        if (clr) {
          if (k === '1L') f.v1 = null;
          if (k === '2L') f.vr = null;
          if (k === '3L') f.v2 = null;
          return ok();
        }
        const r = sp3(sp);
        if (r === 'fmt') return err(MSG.fmt);
        if (r === 'range') return err(MSG.range);
        if (k === '1L') f.v1 = r;
        if (k === '2L') f.vr = r;
        if (k === '3L') f.v2 = r;
        if (f.v1 != null && f.vr != null && f.v1 > f.vr) setMsg(s, 'V1/VR/V2 DISAGREE');
        if (f.vr != null && f.v2 != null && f.vr > f.v2) setMsg(s, 'V1/VR/V2 DISAGREE');
        f.scratch = '';
        emit({ type: 'fms', page: 'PERF', lsk: k });
        return;
      }
      if (k === '3R') {
        const m2 = /^([0-3])?\/?(?:(UP|DN)(\d{1,2}(?:\.\d)?)|(\d{1,2}(?:\.\d)?)(UP|DN))?$/.exec(sp);
        if (!sp || !m2) return err(MSG.fmt);
        if (m2[1]) f.toFlaps = parseInt(m2[1], 10);
        const dir = m2[2] ?? m2[5];
        const val = m2[3] ?? m2[4];
        if (dir && val) {
          const v = parseFloat(val);
          if (v > 5) return err(MSG.range);
          f.ths = dir === 'UP' ? v : -v;
        }
        return ok();
      }
      if (k === '4R') {
        const n = num(sp);
        if (n == null || !Number.isInteger(n)) return err(MSG.fmt);
        if (n < s.oat || n > 75) return err(MSG.range);
        f.flex = n;
        return ok();
      }
      if (k === '4L') {
        const n = num(sp);
        if (n == null) return err(MSG.fmt);
        f.transAlt = Math.round(n / 10) * 10;
        return ok();
      }
      if (k === '5L') {
        const m2 = /^(\d{3,5})?\/?(\d{3,5})?$/.exec(sp);
        if (!sp || !m2) return err(MSG.fmt);
        if (m2[1]) f.thrRed = parseInt(m2[1], 10);
        if (m2[2]) f.accAlt = parseInt(m2[2], 10);
        return ok();
      }
      return err(MSG.na);
    }
    case 'PERFAPPR': {
      if (k === '1L') {
        const n = num(sp);
        if (n == null || !Number.isInteger(n)) return err(MSG.fmt);
        if (n < 940 || n > 1060) return err(MSG.range);
        f.qnhAppr = n;
        return ok();
      }
      if (k === '2L') {
        const n = num(sp);
        if (n == null) return err(MSG.fmt);
        f.tempAppr = Math.round(n);
        return ok();
      }
      if (k === '3L') {
        if (!/^\d{1,3}\/\d{1,3}$/.test(sp)) return err(MSG.fmt);
        f.windAppr = sp.split('/').map((x, i) => (i === 0 ? x.padStart(3, '0') + '°' : x)).join('/');
        return ok();
      }
      if (k === '2R') {
        if (clr) {
          f.mda = null;
          return ok();
        }
        const n = num(sp);
        if (n == null || !Number.isInteger(n)) return err(MSG.fmt);
        if (n < s.elev || n > 5000) return err(MSG.range);
        f.mda = n;
        f.dh = null;
        return ok();
      }
      if (k === '3R') {
        if (clr) {
          f.dh = null;
          return ok();
        }
        const n = num(sp);
        if (n == null || !Number.isInteger(n)) return err(MSG.fmt);
        if (n < 0 || n > 1000) return err(MSG.range);
        f.dh = n;
        f.mda = null;
        return ok();
      }
      if (k === '4R') {
        f.ldgConf = 3;
        return ok();
      }
      if (k === '5R') {
        f.ldgConf = 4;
        return ok();
      }
      if (k === '6L') {
        f.page = 'PERF';
        return;
      }
      return err(MSG.na);
    }
    case 'MENU':
      if (k === '1L' || k === '6R') f.page = 'STATUS';
      return;
  }
  void irOk;
}

export function scratchLine(s: SimState): { t: string; c: Col } {
  if (s.fms.msg) return { t: s.fms.msg, c: s.fms.msg.includes('DISAGREE') ? 'a' : 'w' };
  return { t: s.fms.scratch, c: 'w' };
}

export const fmsHelpers = { thsStr };
void m;
