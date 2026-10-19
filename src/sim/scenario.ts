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

// ---------- геометрия аэродрома (м, x — восток, y — север; начало — торец 32L) ----------
const rad = (d: number) => (d * Math.PI) / 180;
const RD = { x: Math.sin(rad(323)), y: Math.cos(rad(323)) }; // направление ВПП
const PR = { x: Math.sin(rad(53)), y: Math.cos(rad(53)) }; // вправо от ВПП (к перрону)
const P = (along: number, side: number) => ({ x: RD.x * along + PR.x * side, y: RD.y * along + PR.y * side });

export const GEO = {
  stand: P(1200, 420),
  pushEnd: P(1200, 335),
  standHdg: 53,
  pushHdg: 143,
  /** Маршрут руления от точки окончания буксировки до предварительного старта */
  taxi: [P(1200, 335), P(1100, 180), P(110, 180), P(10, 95)],
  holdIndex: 3,
  lineup: [P(10, 95), P(0, 30), P(0, 0)],
  thr: P(0, 0),
  rwyDir: RD,
};

export function polyLen(pts: { x: number; y: number }[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return l;
}

export const TAXI_LEN = polyLen(GEO.taxi);
export const LINEUP_LEN = polyLen(GEO.lineup);

/** Точки SID/маршрута для ND (м от торца) */
export const WPTS: Record<string, { x: number; y: number }> = {
  D323A: P(9260, 0), // 5 NM по оси
  BAXOS: { x: P(9260, 0).x + Math.sin(rad(350)) * 27780, y: P(9260, 0).y + Math.cos(rad(350)) * 27780 },
  AMBOR: { x: -12000, y: 80000 },
  KOVIN: { x: 5000, y: 160000 },
  NEVAR: { x: 30000, y: 300000 },
  ORSUD: { x: 60000, y: 480000 },
  LFPO: { x: 80000, y: 560000 },
};

export function samplePath(pts: { x: number; y: number }[], d: number) {
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
