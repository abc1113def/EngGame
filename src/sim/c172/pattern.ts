import type { SimState } from '../types';

/** Левый круг ВПП 33 LFCL. Точки в системе ВПП: along — вдоль, side — вправо (м); высота — фт над аэродромом. */
export const PATTERN = [
  { along: 1700, side: 0, agl: 700, label: 'UPWIND' },
  { along: 1950, side: -1300, agl: 1000, label: 'CROSSWIND' },
  { along: 0, side: -1300, agl: 1000, label: 'ABEAM 33' },
  { along: -1150, side: -1300, agl: 750, label: 'BASE' },
  { along: -1600, side: 0, agl: 450, label: 'FINAL' },
  { along: 0, side: 0, agl: 30, label: 'RWY 33' },
];

export const PATTERN_ALT_AGL = 1000;

function rel(s: SimState) {
  const g = s.geo;
  const dx = s.ac.x - g.thr.x;
  const dy = s.ac.y - g.thr.y;
  return { a: dx * g.rwyDir.x + dy * g.rwyDir.y, sd: dx * g.side.x + dy * g.side.y };
}

function toWorld(s: SimState, along: number, side: number) {
  const g = s.geo;
  return { x: g.thr.x + g.rwyDir.x * along + g.side.x * side, y: g.thr.y + g.rwyDir.y * along + g.side.y * side };
}

/** Продвижение по точкам круга */
export function updPattern(s: SimState) {
  if (s.type !== 'c172') return;
  const f = s.flags;
  if (s.ac.onGround) {
    if (s.ac.landed) f.cGuide = 6;
    return;
  }
  let i = (f.cGuide as number) ?? 0;
  if (i >= 5) {
    // уход на второй круг: над ВПП с набором — круг заново
    const r = rel(s);
    if (r.a > 400 && s.ac.alt - s.elev > 200 && s.ac.vs > 0) f.cGuide = 0;
    return;
  }
  const p = PATTERN[i];
  const w = toWorld(s, p.along, p.side);
  const d = Math.hypot(s.ac.x - w.x, s.ac.y - w.y);
  const { a, sd } = rel(s);
  let pass = d < 380;
  // точки «проходятся» и при пересечении их линии
  if (i === 0 && a > p.along) pass = true;
  if (i === 1 && sd < p.side + 150) pass = true;
  if (i === 2 && a < p.along && sd < -700) pass = true;
  if (i === 3 && a < p.along && sd < -700) pass = true;
  if (i === 4 && Math.abs(sd) < 150 && a > p.along - 400) pass = true;
  if (pass) {
    i++;
    f.cGuide = i;
  }
}

/** Текущий участок круга (для шагов процедуры) */
export function patternLeg(s: SimState): '' | 'upwind' | 'crosswind' | 'downwind' | 'base' | 'final' {
  if (s.ac.onGround) return '';
  const i = (s.flags.cGuide as number) ?? 0;
  return (['upwind', 'crosswind', 'downwind', 'base', 'final', 'final'] as const)[Math.min(5, i)];
}

/** Точка-подсказка для вида наружу */
export function guideFor(s: SimState): { x: number; y: number; z: number; label: string } | null {
  if (s.type !== 'c172') return null;
  const g = s.geo;
  const ph = s.gnd.phase;
  if (s.ac.onGround) {
    if ((ph === 'gate' || ph === 'taxi') && g.taxi.length) {
      const hp = g.taxi[g.taxi.length - 1];
      return { x: hp.x, y: hp.y, z: 2, label: 'HOLD 33' };
    }
    if (ph === 'taxiin' || (s.ac.landed && ph === 'runway')) return { x: g.stand.x, y: g.stand.y, z: 2, label: 'APRON' };
    return null;
  }
  const i = Math.min(5, (s.flags.cGuide as number) ?? 0);
  const p = PATTERN[i];
  const w = toWorld(s, p.along, p.side);
  return { x: w.x, y: w.y, z: p.agl / 3.28084, label: p.label };
}

export { rel as patternRel, toWorld as patternWorld };
