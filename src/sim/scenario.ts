import type { L } from './types';

/**
 * Данные сценария. Аэропорты настоящие, но SID, точки маршрута и частоты
 * упрощены/вымышлены — не для реальной навигации.
 */
export const SCN = {
  callsign: 'EGM320',
  radioCall: { ru: 'ЭНГЕЙМ 320', en: 'ENGAME 320' } as L,
  from: 'LFBO',
  fromName: 'TOULOUSE BLAGNAC',
  to: 'LFPO',
  toName: 'PARIS ORLY',
  altn: 'LFPG',
  elev: 499,
  rwy: '32L',
  rwyHdg: 323,
  rwyLen: 3000,
  sid: 'BAXOS5B',
  crzFl: 330,
  ci: 30,
  zfw: 58.2,
  zfwcg: 27.0,
  block: 9.8,
  taxiFuel: 0.2,
  v1: 142,
  vr: 145,
  v2: 149,
  flex: 54,
  toFlaps: 1,
  ths: 0.8, // UP 0.8
  transAlt: 5000,
  initAlt: 6000,
  freqs: {
    ATIS: 123125,
    DEL: 121900,
    GND: 121700,
    TWR: 118100,
  } as Record<string, number>,
  route: ['BAXOS', 'AMBOR', 'KOVIN', 'NEVAR', 'ORSUD', 'LFPO'],
};

export interface Runway {
  id: string;
  hdg: number;
  len: number;
  sids: string[];
}

export const AIRPORTS: Record<string, { name: string; elev: number; rwys: Runway[] }> = {
  LFBO: {
    name: 'TOULOUSE BLAGNAC',
    elev: 499,
    rwys: [
      { id: '14L', hdg: 143, len: 3500, sids: ['PERIG5A', 'NEVEL5A'] },
      { id: '14R', hdg: 143, len: 3000, sids: ['PERIG5C', 'NEVEL5C'] },
      { id: '32L', hdg: 323, len: 3000, sids: ['BAXOS5B', 'PERIG5B', 'NEVEL5B'] },
      { id: '32R', hdg: 323, len: 3500, sids: ['BAXOS5D', 'PERIG5D'] },
    ],
  },
  LFPO: { name: 'PARIS ORLY', elev: 291, rwys: [] },
  LFPG: { name: 'PARIS CDG', elev: 392, rwys: [] },
};

// ---------- геометрия аэродромов (м, x — восток, y — север; начало — торец рабочей ВПП) ----------
const rad = (d: number) => (d * Math.PI) / 180;
export interface Pt {
  x: number;
  y: number;
}
export interface AirportGeo {
  icao: string;
  name: string;
  elev: number;
  rwyId: string;
  rwyHdg: number;
  rwyLen: number;
  rwyWidth: number;
  thr: Pt;
  rwyDir: Pt;
  side: Pt; // вправо от оси ВПП
  stand: Pt;
  standHdg: number;
  pushEnd: Pt | null;
  pushHdg: number;
  taxi: Pt[]; // от стоянки (или конца буксировки) до предварительного старта
  lineup: Pt[];
  exits: { along: number; path: Pt[] }[]; // сход с ВПП → стоянка
  wpts: Record<string, Pt>;
  papi: { along: number; side: number } | null;
  ils: { gsAlong: number; angle: number; ident: string; freq: string } | null;
  aprons: Pt[][]; // полигоны перронов для внешнего вида
}

function frame(hdg: number) {
  const RD = { x: Math.sin(rad(hdg)), y: Math.cos(rad(hdg)) };
  const PR = { x: Math.sin(rad(hdg + 90)), y: Math.cos(rad(hdg + 90)) };
  const P = (along: number, side: number): Pt => ({ x: RD.x * along + PR.x * side, y: RD.y * along + PR.y * side });
  return { RD, PR, P };
}

// ----- LFBO, ВПП 32L (вылет A320) -----
const F1 = frame(323);
const P1 = F1.P;
export const GEO_LFBO: AirportGeo = {
  icao: 'LFBO',
  name: 'TOULOUSE BLAGNAC',
  elev: 499,
  rwyId: '32L',
  rwyHdg: 323,
  rwyLen: 3000,
  rwyWidth: 45,
  thr: P1(0, 0),
  rwyDir: F1.RD,
  side: F1.PR,
  stand: P1(1200, 420),
  standHdg: 53,
  pushEnd: P1(1200, 335),
  pushHdg: 143,
  taxi: [P1(1200, 335), P1(1100, 180), P1(110, 180), P1(10, 95)],
  lineup: [P1(10, 95), P1(0, 30), P1(0, 0)],
  exits: [
    { along: 1900, path: [P1(1900, 0), P1(2050, 100), P1(2100, 180), P1(1300, 180), P1(1200, 300), P1(1200, 420)] },
    { along: 2900, path: [P1(2900, 0), P1(2900, 180), P1(1300, 180), P1(1200, 300), P1(1200, 420)] },
  ],
  wpts: {
    D323A: P1(9260, 0),
    BAXOS: { x: P1(9260, 0).x + Math.sin(rad(350)) * 27780, y: P1(9260, 0).y + Math.cos(rad(350)) * 27780 },
    AMBOR: { x: -12000, y: 80000 },
    KOVIN: { x: 5000, y: 160000 },
    NEVAR: { x: 30000, y: 300000 },
    ORSUD: { x: 60000, y: 480000 },
    LFPO: { x: 80000, y: 560000 },
  },
  papi: { along: 320, side: -32 },
  ils: { gsAlong: 300, angle: 3, ident: 'TBN', freq: '108.90' },
  aprons: [[P1(900, 330), P1(1600, 330), P1(1600, 650), P1(900, 650)]],
};
/** совместимость: геометрия вылета */
export const GEO = GEO_LFBO;
export const WPTS = GEO_LFBO.wpts;

// ----- LFPO, ВПП 06 (прилёт A320) -----
const F2 = frame(62);
const P2 = F2.P;
export const GEO_LFPO: AirportGeo = {
  icao: 'LFPO',
  name: 'PARIS ORLY',
  elev: 291,
  rwyId: '06',
  rwyHdg: 62,
  rwyLen: 3320,
  rwyWidth: 45,
  thr: P2(0, 0),
  rwyDir: F2.RD,
  side: F2.PR,
  stand: P2(1200, 470),
  standHdg: 152,
  pushEnd: null,
  pushHdg: 152,
  taxi: [],
  lineup: [],
  exits: [
    { along: 2050, path: [P2(2050, 0), P2(2230, 90), P2(2300, 200), P2(1300, 200), P2(1200, 300), P2(1200, 470)] },
    { along: 3200, path: [P2(3200, 0), P2(3200, 200), P2(1300, 200), P2(1200, 300), P2(1200, 470)] },
  ],
  wpts: {
    CI06: P2(-25930, 0),
    FF06: P2(-11112, 0),
    RW06: P2(0, 0),
    MA06: P2(9260, 0),
  },
  papi: { along: 320, side: -32 },
  ils: { gsAlong: 300, angle: 3, ident: 'OLE', freq: '110.30' },
  aprons: [[P2(800, 380), P2(1700, 380), P2(1700, 700), P2(800, 700)]],
};

// ----- LFCL, ВПП 33 (Cessna 172) -----
const F3 = frame(330);
const P3 = F3.P;
export const GEO_LFCL: AirportGeo = {
  icao: 'LFCL',
  name: 'TOULOUSE LASBORDES',
  elev: 459,
  rwyId: '33',
  rwyHdg: 330,
  rwyLen: 1000,
  rwyWidth: 20,
  thr: P3(0, 0),
  rwyDir: F3.RD,
  side: F3.PR,
  stand: P3(320, 150),
  standHdg: 240,
  pushEnd: null,
  pushHdg: 240,
  taxi: [P3(320, 150), P3(300, 70), P3(40, 70), P3(15, 45)],
  lineup: [P3(15, 45), P3(0, 15), P3(0, 0)],
  exits: [
    { along: 450, path: [P3(450, 0), P3(470, 45), P3(450, 70), P3(330, 70), P3(320, 150)] },
    { along: 960, path: [P3(960, 0), P3(960, 70), P3(330, 70), P3(320, 150)] },
  ],
  wpts: {},
  papi: { along: 150, side: -18 },
  ils: null,
  aprons: [[P3(250, 100), P3(420, 100), P3(420, 220), P3(250, 220)]],
};

export function polyLen(pts: Pt[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return l;
}

export const TAXI_LEN = polyLen(GEO.taxi);
export const LINEUP_LEN = polyLen(GEO.lineup);

/** Данные прилёта A320 (LFPO). Частоты и схемы вымышлены. */
export const SCN_ARR = {
  rwy: '06',
  appr: 'ILS06',
  ils: 'OLE 110.30',
  freqs: { ATIS: 126500, APP: 118850, TWR: 120500, GND: 121950 } as Record<string, number>,
  da: 491,
  ldgFlaps: 4,
  stand: 'K24',
};

/** Данные Cessna 172 (LFCL). Частоты вымышлены. */
export const SCN_C172 = {
  callsign: 'F-HCLD',
  radioCall: { ru: 'ФОКСТРОТ ЧАРЛИ ЛИМА ДЕЛЬТА', en: 'FOXTROT CHARLIE LIMA DELTA' } as L,
  rwy: '33',
  freqs: { ATIS: 128925, TWR: 120375 } as Record<string, number>,
  patternAgl: 1000,
};

export function samplePath(pts: Pt[], d: number) {
  let rem = Math.max(0, d);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (rem <= l || i === pts.length - 1) {
      const f = l > 0 ? Math.min(1, rem / l) : 1;
      const hdg = (Math.atan2(b.x - a.x, b.y - a.y) * 180) / Math.PI;
      // сглаживание курса на поворотах
      let h = hdg;
      if (i < pts.length - 1 && l - rem < 25) {
        const c = pts[i + 1];
        const h2 = (Math.atan2(c.x - b.x, c.y - b.y) * 180) / Math.PI;
        const k = 1 - (l - rem) / 25;
        h = hdg + angDiff(h2, hdg) * k * 0.5;
      } else if (i > 1 && rem < 25) {
        const z = pts[i - 2];
        const h0 = (Math.atan2(a.x - z.x, a.y - z.y) * 180) / Math.PI;
        const k = 1 - rem / 25;
        h = hdg + angDiff(h0, hdg) * k * 0.5;
      }
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, hdg: norm360(h) };
    }
    rem -= l;
  }
  const z = pts[pts.length - 1];
  return { x: z.x, y: z.y, hdg: 0 };
}

export function angDiff(a: number, b: number) {
  let d = ((a - b) % 360 + 540) % 360 - 180;
  if (d < -180) d += 360;
  return d;
}
export function norm360(a: number) {
  return ((a % 360) + 360) % 360;
}
