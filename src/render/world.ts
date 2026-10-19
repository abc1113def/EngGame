import type { AirportGeo, Pt } from '../sim/scenario';
import type { SimState } from '../sim/types';

/**
 * Простой перспективный рендер «вида из кабины» на canvas 2D.
 * Мир плоский: x — восток, y — север, z — вверх (м). Рисование — по алгоритму художника.
 */

type RGB = [number, number, number];
interface Poly {
  pts: [number, number, number][];
  c: RGB;
  cx: number;
  cy: number;
  r: number; // радиус для отсечения
  noFog?: boolean;
}
interface Light {
  x: number;
  y: number;
  z: number;
  c: string;
  size: number;
  papi?: number;
}
interface Box {
  x: number;
  y: number;
  w: number;
  l: number;
  h: number;
  hdg: number;
  c: RGB;
}
export interface Scene {
  geo: AirportGeo;
  ground: Poly[];
  surf: Poly[];
  marks: Poly[];
  lights: Light[];
  boxes: Box[];
}

const D2R = Math.PI / 180;
const SKY_TOP: RGB = [62, 120, 196];
const SKY_HOR: RGB = [184, 207, 228];
const HAZE: RGB = [170, 186, 196];
const GRASS: RGB = [92, 124, 66];
const ASPH: RGB = [64, 66, 70];
const ASPH2: RGB = [84, 86, 90];
const WHITE: RGB = [228, 228, 222];
const YEL: RGB = [222, 186, 40];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poly(pts: [number, number, number][], c: RGB, noFog = false): Poly {
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p[0];
    cy += p[1];
  }
  cx /= pts.length;
  cy /= pts.length;
  let r = 0;
  for (const p of pts) r = Math.max(r, Math.hypot(p[0] - cx, p[1] - cy));
  return { pts, c, cx, cy, r, noFog };
}

/** Прямоугольник в системе координат ВПП (along, side) */
function rwyRect(g: AirportGeo, a0: number, a1: number, s0: number, s1: number, c: RGB): Poly {
  const P = (a: number, s: number): [number, number, number] => [g.thr.x + g.rwyDir.x * a + g.side.x * s, g.thr.y + g.rwyDir.y * a + g.side.y * s, 0];
  return poly([P(a0, s0), P(a1, s0), P(a1, s1), P(a0, s1)], c);
}

/** Полоса заданной ширины вдоль ломаной */
function strip(pts: Pt[], w: number, c: RGB, out: Poly[]) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (l < 0.1) continue;
    const ux = (b.x - a.x) / l;
    const uy = (b.y - a.y) / l;
    const nx = -uy * (w / 2);
    const ny = ux * (w / 2);
    // небольшое продление, чтобы стыки не «рвались»
    const ex = ux * (w / 2);
    const ey = uy * (w / 2);
    out.push(
      poly(
        [
          [a.x - ex + nx, a.y - ey + ny, 0],
          [b.x + ex + nx, b.y + ey + ny, 0],
          [b.x + ex - nx, b.y + ey - ny, 0],
          [a.x - ex - nx, a.y - ey - ny, 0],
        ],
        c,
      ),
    );
  }
}

// 7-сегментные цифры для маркировки ВПП: a b c d e f g
const SEG: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abged',
  '3': 'abgcd',
  '4': 'fgbc',
  '5': 'afgcd',
  '6': 'afgedc',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcfgd',
  L: 'fed',
  C: 'afed',
  R: 'efabg',
};

function digits(g: AirportGeo, text: string, a0: number, out: Poly[]) {
  const H = Math.min(30, g.rwyWidth * 0.7);
  const W = H * 0.45;
  const T = H * 0.09;
  const gap = W * 0.45;
  const chars = text.split('');
  // буквы — отдельной строкой ниже цифр (ближе к торцу)
  const num = chars.filter((c) => /\d/.test(c));
  const let_ = chars.filter((c) => !/\d/.test(c));
  const row = (cs: string[], aBase: number) => {
    const total = cs.length * W + (cs.length - 1) * gap;
    cs.forEach((ch, i) => {
      const s0 = -total / 2 + i * (W + gap);
      const segs = SEG[ch] ?? '';
      const R = (x0: number, x1: number, y0: number, y1: number) => out.push(rwyRect(g, aBase + y0, aBase + y1, s0 + x0, s0 + x1, WHITE));
      for (const sg of segs) {
        if (sg === 'a') R(0, W, H - T, H);
        if (sg === 'g') R(0, W, H / 2 - T / 2, H / 2 + T / 2);
        if (sg === 'd') R(0, W, 0, T);
        if (sg === 'b') R(W - T, W, H / 2, H);
        if (sg === 'c') R(W - T, W, 0, H / 2);
        if (sg === 'f') R(0, T, H / 2, H);
        if (sg === 'e') R(0, T, 0, H / 2);
      }
    });
  };
  if (let_.length) {
    row(let_, a0);
    row(num, a0 + H + 6);
  } else row(num, a0);
}

function recip(id: string) {
  const n = parseInt(id, 10);
  const suf = id.replace(/^\d+/, '');
  const r = ((n + 17) % 36) + 1;
  return String(r).padStart(2, '0') + (suf === 'L' ? 'R' : suf === 'R' ? 'L' : suf);
}

/** Маркировка одного конца ВПП (в системе этого конца) */
function rwyEndMarks(g: AirportGeo, id: string, flip: boolean, out: Poly[]) {
  const W = g.rwyWidth;
  // для обратного курса строим в зеркальной системе
  const G2: AirportGeo = flip
    ? {
        ...g,
        thr: { x: g.thr.x + g.rwyDir.x * g.rwyLen, y: g.thr.y + g.rwyDir.y * g.rwyLen },
        rwyDir: { x: -g.rwyDir.x, y: -g.rwyDir.y },
        side: { x: -g.side.x, y: -g.side.y },
      }
    : g;
  // «зебра» торца
  const n = W >= 40 ? 6 : 3;
  const sw = W >= 40 ? 1.8 : 1.2;
  const len = W >= 40 ? 30 : 18;
  for (let i = 0; i < n; i++) {
    const off = 3 + i * sw * 2;
    out.push(rwyRect(G2, 6, 6 + len, W / 2 - off - sw, W / 2 - off, WHITE));
    out.push(rwyRect(G2, 6, 6 + len, -W / 2 + off, -W / 2 + off + sw, WHITE));
  }
  digits(G2, id, len + 18, out);
  // зона приземления
  if (g.rwyLen > 1500) {
    out.push(rwyRect(G2, 300, 345, W * 0.17, W * 0.17 + 9, WHITE));
    out.push(rwyRect(G2, 300, 345, -W * 0.17 - 9, -W * 0.17, WHITE));
    for (const a of [150, 450, 600, 750, 900]) {
      const k = a === 150 || a === 450 ? 3 : a === 600 ? 2 : 1;
      for (let j = 0; j < k; j++) {
        const o = W * 0.17 + j * 3.2;
        out.push(rwyRect(G2, a, a + 22, o, o + 1.8, WHITE));
        out.push(rwyRect(G2, a, a + 22, -o - 1.8, -o, WHITE));
      }
    }
  } else {
    out.push(rwyRect(G2, 150, 175, W * 0.15, W * 0.15 + 4, WHITE));
    out.push(rwyRect(G2, 150, 175, -W * 0.15 - 4, -W * 0.15, WHITE));
  }
}

export function buildScene(g: AirportGeo): Scene {
  const r = rng(g.icao.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  const ground: Poly[] = [];
  // поля вокруг аэродрома
  const cell = 650;
  const N = 16;
  const mid = { x: g.thr.x + g.rwyDir.x * g.rwyLen * 0.5, y: g.thr.y + g.rwyDir.y * g.rwyLen * 0.5 };
  const palette: RGB[] = [
    [104, 132, 70],
    [120, 138, 76],
    [140, 132, 84],
    [86, 112, 60],
    [150, 146, 96],
    [74, 98, 56],
    [118, 108, 74],
  ];
  for (let i = -N; i < N; i++)
    for (let j = -N; j < N; j++) {
      const x0 = mid.x + i * cell;
      const y0 = mid.y + j * cell;
      const cx = x0 + cell / 2;
      const cy = y0 + cell / 2;
      // аэродром — сплошная трава
      const ra = (cx - g.thr.x) * g.rwyDir.x + (cy - g.thr.y) * g.rwyDir.y;
      const rs = (cx - g.thr.x) * g.side.x + (cy - g.thr.y) * g.side.y;
      if (ra > -500 && ra < g.rwyLen + 500 && Math.abs(rs) < 900) continue;
      if (r() < 0.25) continue;
      const c = palette[Math.floor(r() * palette.length)];
      const j1 = (r() - 0.5) * 120;
      const j2 = (r() - 0.5) * 120;
      const inset = 12 + r() * 30;
      ground.push(
        poly(
          [
            [x0 + inset + j1, y0 + inset, 0],
            [x0 + cell - inset, y0 + inset + j2, 0],
            [x0 + cell - inset - j1, y0 + cell - inset, 0],
            [x0 + inset, y0 + cell - inset - j2, 0],
          ],
          c,
        ),
      );
    }
  // «лес» — тёмные пятна
  for (let k = 0; k < 40; k++) {
    const a = r() * Math.PI * 2;
    const d = 2500 + r() * 8000;
    const x = mid.x + Math.cos(a) * d;
    const y = mid.y + Math.sin(a) * d;
    const rad = 120 + r() * 260;
    const pts: [number, number, number][] = [];
    for (let q = 0; q < 7; q++) {
      const b = (q / 7) * Math.PI * 2;
      const rr = rad * (0.7 + r() * 0.5);
      pts.push([x + Math.cos(b) * rr, y + Math.sin(b) * rr, 0]);
    }
    ground.push(poly(pts, [52, 78, 46]));
  }

  const surf: Poly[] = [];
  for (const a of g.aprons) surf.push(poly(a.map((p) => [p.x, p.y, 0] as [number, number, number]), ASPH2));
  const twW = g.rwyWidth >= 40 ? 23 : 9;
  const paths: Pt[][] = [];
  if (g.taxi.length) paths.push(g.taxi, g.lineup);
  if (g.pushEnd) paths.push([g.stand, g.pushEnd]);
  for (const e of g.exits) paths.push(e.path);
  for (const p of paths) strip(p, twW, ASPH2, surf);
  // ВПП с концевыми полосами
  surf.push(rwyRect(g, -60, g.rwyLen + 60, -g.rwyWidth / 2 - 4, g.rwyWidth / 2 + 4, [96, 100, 84]));
  surf.push(rwyRect(g, 0, g.rwyLen, -g.rwyWidth / 2, g.rwyWidth / 2, ASPH));

  const marks: Poly[] = [];
  const W = g.rwyWidth;
  // боковые линии
  marks.push(rwyRect(g, 0, g.rwyLen, W / 2 - 1.4, W / 2 - 0.5, WHITE));
  marks.push(rwyRect(g, 0, g.rwyLen, -W / 2 + 0.5, -W / 2 + 1.4, WHITE));
  // осевая
  const dash = W >= 40 ? 30 : 15;
  for (let a = 90; a < g.rwyLen - 90; a += dash * 2) marks.push(rwyRect(g, a, a + dash, -0.45, 0.45, WHITE));
  rwyEndMarks(g, g.rwyId, false, marks);
  rwyEndMarks(g, recip(g.rwyId), true, marks);
  // осевые линии рулёжек
  for (const p of paths) strip(p, 0.6, YEL, marks);
  // стоп-линия на стоянке
  const sh = g.standHdg * D2R;
  const sx = Math.cos(sh) * 6;
  const sy = -Math.sin(sh) * 6;
  marks.push(
    poly(
      [
        [g.stand.x - sx - 0.4 * Math.sin(sh), g.stand.y - sy - 0.4 * Math.cos(sh), 0],
        [g.stand.x + sx - 0.4 * Math.sin(sh), g.stand.y + sy - 0.4 * Math.cos(sh), 0],
        [g.stand.x + sx + 0.4 * Math.sin(sh), g.stand.y + sy + 0.4 * Math.cos(sh), 0],
        [g.stand.x - sx + 0.4 * Math.sin(sh), g.stand.y - sy + 0.4 * Math.cos(sh), 0],
      ],
      YEL,
    ),
  );
  // линия предварительного старта
  if (g.taxi.length) {
    const hp = g.taxi[g.taxi.length - 1];
    const pv = g.taxi[g.taxi.length - 2];
    const l = Math.hypot(hp.x - pv.x, hp.y - pv.y);
    const ux = (hp.x - pv.x) / l;
    const uy = (hp.y - pv.y) / l;
    const nx = -uy * (twW / 2);
    const ny = ux * (twW / 2);
    for (const o of [0, 1.5, 3, 4.5])
      marks.push(
        poly(
          [
            [hp.x + nx + ux * o, hp.y + ny + uy * o, 0],
            [hp.x - nx + ux * o, hp.y - ny + uy * o, 0],
            [hp.x - nx + ux * (o + 0.5), hp.y - ny + uy * (o + 0.5), 0],
            [hp.x + nx + ux * (o + 0.5), hp.y + ny + uy * (o + 0.5), 0],
          ],
          YEL,
        ),
      );
  }

  const lights: Light[] = [];
  const LP = (a: number, s: number) => ({ x: g.thr.x + g.rwyDir.x * a + g.side.x * s, y: g.thr.y + g.rwyDir.y * a + g.side.y * s });
  for (let a = 0; a <= g.rwyLen; a += 60)
    for (const sd of [-W / 2 - 1.5, W / 2 + 1.5]) {
      const p = LP(a, sd);
      lights.push({ ...p, z: 0.4, c: a > g.rwyLen - 600 ? '#ffd88a' : '#fff6e0', size: 0.5 });
    }
  for (let sd = -W / 2; sd <= W / 2; sd += W / 8) {
    lights.push({ ...LP(-2, sd), z: 0.3, c: '#5dff7a', size: 0.6 });
    lights.push({ ...LP(g.rwyLen + 2, sd), z: 0.3, c: '#ff4040', size: 0.6 });
  }
  // огни приближения (только для ВПП с ILS)
  if (g.ils) {
    for (let a = 30; a <= 900; a += 30) {
      const n = a % 150 === 0 ? 9 : 5;
      for (let k = 0; k < n; k++) lights.push({ ...LP(-a, (k - (n - 1) / 2) * 1.6), z: 0.6 + a * 0.01, c: '#fffbe8', size: 0.55 });
    }
  }
  // PAPI
  if (g.papi) {
    // i = 0 — самый дальний от ВПП (наименьший угол срабатывания)
    const step = g.rwyWidth >= 40 ? 9 : 5;
    for (let i = 0; i < 4; i++) lights.push({ ...LP(g.papi.along, g.papi.side < 0 ? g.papi.side - (3 - i) * step : g.papi.side + (3 - i) * step), z: 0.8, c: '#fff', size: 1.1, papi: i });
  }

  // постройки у перрона
  const boxes: Box[] = [];
  const ap = g.aprons[0];
  if (ap) {
    const big = g.rwyWidth >= 40;
    // дальняя сторона перрона от ВПП
    const far = ap.reduce((best, p) => {
      const sd = (p.x - g.thr.x) * g.side.x + (p.y - g.thr.y) * g.side.y;
      return sd > best.sd ? { p, sd } : best;
    }, { p: ap[0], sd: -1e9 });
    const ang = g.rwyHdg;
    const n = big ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const along = (i - (n - 1) / 2) * (big ? 170 : 45);
      const bx = far.p.x + g.side.x * (big ? 40 : 15) + g.rwyDir.x * (along - (big ? 250 : 60));
      const by = far.p.y + g.side.y * (big ? 40 : 15) + g.rwyDir.y * (along - (big ? 250 : 60));
      boxes.push({ x: bx, y: by, w: big ? 140 : 30, l: big ? 50 : 18, h: big ? 18 + r() * 10 : 6 + r() * 3, hdg: ang, c: i % 2 ? [176, 172, 160] : [150, 156, 164] });
    }
    // башня КДП
    const tx = far.p.x + g.side.x * (big ? 120 : 40) + g.rwyDir.x * (big ? 300 : 90);
    const ty = far.p.y + g.side.y * (big ? 120 : 40) + g.rwyDir.y * (big ? 300 : 90);
    boxes.push({ x: tx, y: ty, w: big ? 12 : 5, l: big ? 12 : 5, h: big ? 55 : 14, hdg: ang, c: [196, 198, 200] });
  }
  // посёлки вдали
  for (let k = 0; k < 24; k++) {
    const a = r() * Math.PI * 2;
    const d = 3000 + r() * 7000;
    const x = mid.x + Math.cos(a) * d;
    const y = mid.y + Math.sin(a) * d;
    const ra = (x - g.thr.x) * g.rwyDir.x + (y - g.thr.y) * g.rwyDir.y;
    const rs = (x - g.thr.x) * g.side.x + (y - g.thr.y) * g.side.y;
    if (ra < -100 && ra > -15000 && Math.abs(rs) < 700) continue; // не на глиссаде
    for (let q = 0; q < 5; q++) boxes.push({ x: x + (r() - 0.5) * 220, y: y + (r() - 0.5) * 220, w: 14 + r() * 16, l: 10 + r() * 12, h: 6 + r() * 9, hdg: r() * 90, c: [168 + r() * 30, 150 + r() * 20, 132] as RGB });
  }
  return { geo: g, ground, surf, marks, lights, boxes };
}

// ============================ проекция ============================
interface Cam {
  x: number;
  y: number;
  z: number;
  sh: number;
  ch: number;
  sp: number;
  cp: number;
  sr: number;
  cr: number;
  F: number;
  W: number;
  H: number;
  cy0: number;
}

const NEAR = 0.6;

/** мир → система камеры (f — вперёд, r — вправо, u — вверх) */
function toCam(c: Cam, x: number, y: number, z: number): [number, number, number] {
  const dx = x - c.x;
  const dy = y - c.y;
  const dz = z - c.z;
  const cf = dx * c.sh + dy * c.ch;
  const cr = dx * c.ch - dy * c.sh;
  const f = cf * c.cp + dz * c.sp;
  const u = dz * c.cp - cf * c.sp;
  return [f, cr * c.cr - u * c.sr, u * c.cr + cr * c.sr];
}
function proj(c: Cam, p: [number, number, number]): [number, number] {
  return [c.W / 2 + (p[1] / p[0]) * c.F, c.cy0 - (p[2] / p[0]) * c.F];
}

function clipNear(pts: [number, number, number][]): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const ina = a[0] >= NEAR;
    const inb = b[0] >= NEAR;
    if (ina) out.push(a);
    if (ina !== inb) {
      const t = (NEAR - a[0]) / (b[0] - a[0]);
      out.push([NEAR, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}

function mix(a: RGB, b: RGB, k: number): string {
  return `rgb(${(a[0] + (b[0] - a[0]) * k) | 0},${(a[1] + (b[1] - a[1]) * k) | 0},${(a[2] + (b[2] - a[2]) * k) | 0})`;
}

function drawPoly(ctx: CanvasRenderingContext2D, c: Cam, p: Poly, vis: number) {
  const d = Math.hypot(p.cx - c.x, p.cy - c.y);
  if (d - p.r > vis) return;
  // грубое отсечение: многоугольник целиком позади
  const cam = p.pts.map((q) => toCam(c, q[0], q[1], q[2]));
  if (cam.every((q) => q[0] < NEAR)) return;
  const cl = clipNear(cam);
  if (cl.length < 3) return;
  // отсечение за пределами экрана по горизонтали
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const sp = cl.map((q) => {
    const s = proj(c, q);
    if (s[0] < minX) minX = s[0];
    if (s[0] > maxX) maxX = s[0];
    if (s[1] < minY) minY = s[1];
    if (s[1] > maxY) maxY = s[1];
    return s;
  });
  if (maxX < -50 || minX > c.W + 50 || maxY < -50 || minY > c.H + 50) return;
  // мелочь вдали не рисуем
  if (maxX - minX < 0.3 && maxY - minY < 0.3) return;
  const k = p.noFog ? 0 : Math.min(0.85, Math.pow(d / vis, 1.3) * 0.9);
  ctx.fillStyle = mix(p.c, HAZE, k);
  ctx.beginPath();
  ctx.moveTo(sp[0][0], sp[0][1]);
  for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i][0], sp[i][1]);
  ctx.closePath();
  ctx.fill();
}

function drawBox(ctx: CanvasRenderingContext2D, c: Cam, b: Box, vis: number) {
  const d = Math.hypot(b.x - c.x, b.y - c.y);
  if (d > vis) return;
  const h = b.hdg * D2R;
  const ax = { x: Math.sin(h) * (b.l / 2), y: Math.cos(h) * (b.l / 2) };
  const bx = { x: Math.cos(h) * (b.w / 2), y: -Math.sin(h) * (b.w / 2) };
  const corners = [
    [b.x - ax.x - bx.x, b.y - ax.y - bx.y],
    [b.x + ax.x - bx.x, b.y + ax.y - bx.y],
    [b.x + ax.x + bx.x, b.y + ax.y + bx.y],
    [b.x - ax.x + bx.x, b.y - ax.y + bx.y],
  ];
  const faces: { pts: [number, number, number][]; shade: number; dist: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const p = corners[i];
    const q = corners[(i + 1) % 4];
    const mx = (p[0] + q[0]) / 2;
    const my = (p[1] + q[1]) / 2;
    const nx = mx - b.x;
    const ny = my - b.y;
    if (nx * (c.x - mx) + ny * (c.y - my) <= 0) continue;
    faces.push({
      pts: [
        [p[0], p[1], 0],
        [q[0], q[1], 0],
        [q[0], q[1], b.h],
        [p[0], p[1], b.h],
      ],
      shade: i % 2 ? 0.78 : 0.92,
      dist: Math.hypot(mx - c.x, my - c.y),
    });
  }
  faces.sort((a, b2) => b2.dist - a.dist);
  for (const f of faces) {
    const col: RGB = [b.c[0] * f.shade, b.c[1] * f.shade, b.c[2] * f.shade];
    drawPoly(ctx, c, { ...poly(f.pts, col), noFog: true }, vis + 1e4);
  }
  if (c.z > b.h)
    drawPoly(
      ctx,
      c,
      { ...poly(corners.map((p) => [p[0], p[1], b.h] as [number, number, number]), [b.c[0] * 1.05, b.c[1] * 1.05, b.c[2] * 1.05] as RGB), noFog: true },
      vis + 1e4,
    );
}

export interface ViewCfg {
  hfov: number; // град
  eye: number; // высота глаз над землёй на стоянке, м
  eyeFwd?: number;
  look?: number; // смещение взгляда вниз, град
  guide?: { x: number; y: number; z: number; label: string } | null;
}

export function camFor(s: SimState, W: number, H: number, cfg: ViewCfg): Cam {
  const h = s.ac.hdg * D2R;
  const p = (s.ac.pitch - (cfg.look ?? 0)) * D2R;
  const r = s.ac.roll * D2R;
  const agl = Math.max(0, (s.ac.alt - s.elev) / 3.28084);
  const fwd = cfg.eyeFwd ?? 0;
  return {
    x: s.ac.x + Math.sin(h) * fwd,
    y: s.ac.y + Math.cos(h) * fwd,
    z: agl + cfg.eye,
    sh: Math.sin(h),
    ch: Math.cos(h),
    sp: Math.sin(p),
    cp: Math.cos(p),
    sr: Math.sin(r),
    cr: Math.cos(r),
    F: W / 2 / Math.tan((cfg.hfov / 2) * D2R),
    W,
    H,
    cy0: H * 0.5,
  };
}

/** Рисует мир. Возвращает камеру для последующих наложений (HUD). */
export function drawWorld(ctx: CanvasRenderingContext2D, scene: Scene, s: SimState, W: number, H: number, cfg: ViewCfg) {
  const c = camFor(s, W, H, cfg);
  // ---------- небо и земля ----------
  const tanP = Math.tan(Math.asin(c.sp));
  // горизонт: в нормированных координатах до крена v = -tan(pitch)
  const hp = (t: number): [number, number] => {
    const xn = t * c.cr + tanP * c.sr;
    const yn = -tanP * c.cr + t * c.sr;
    return [W / 2 + xn * c.F, c.cy0 - yn * c.F];
  };
  const A = hp(-50);
  const B = hp(50);
  const dn = { x: c.sr, y: c.cr }; // направление «вниз» на экране (y вниз)
  const cxh = (A[0] + B[0]) / 2;
  const cyh = (A[1] + B[1]) / 2;
  const sky = ctx.createLinearGradient(cxh - dn.x * H, cyh - dn.y * H, cxh, cyh);
  sky.addColorStop(0, mix(SKY_TOP, SKY_TOP, 0));
  sky.addColorStop(1, mix(SKY_HOR, SKY_HOR, 0));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  const far = 20 * W;
  ctx.beginPath();
  ctx.moveTo(A[0] + (A[0] - B[0]) * 50, A[1] + (A[1] - B[1]) * 50);
  ctx.lineTo(B[0] + (B[0] - A[0]) * 50, B[1] + (B[1] - A[1]) * 50);
  ctx.lineTo(B[0] + (B[0] - A[0]) * 50 + dn.x * far, B[1] + (B[1] - A[1]) * 50 + dn.y * far);
  ctx.lineTo(A[0] + (A[0] - B[0]) * 50 + dn.x * far, A[1] + (A[1] - B[1]) * 50 + dn.y * far);
  ctx.closePath();
  const gg = ctx.createLinearGradient(cxh, cyh, cxh + dn.x * H * 0.8, cyh + dn.y * H * 0.8);
  gg.addColorStop(0, mix(GRASS, HAZE, 0.8));
  gg.addColorStop(0.08, mix(GRASS, HAZE, 0.45));
  gg.addColorStop(1, mix(GRASS, HAZE, 0));
  ctx.fillStyle = gg;
  ctx.fill();

  const vis = 14000;
  for (const p of scene.ground) drawPoly(ctx, c, p, vis);
  for (const p of scene.surf) drawPoly(ctx, c, p, vis);
  for (const p of scene.marks) drawPoly(ctx, c, p, 6000);
  // постройки — от дальних к ближним
  const bx = scene.boxes.map((b) => ({ b, d: Math.hypot(b.x - c.x, b.y - c.y) })).sort((a, b) => b.d - a.d);
  for (const { b } of bx) drawBox(ctx, c, b, 11000);

  // ---------- огни ----------
  const g = scene.geo;
  const eyeAngle = (() => {
    if (!g.papi) return 3;
    const pa = { x: g.thr.x + g.rwyDir.x * g.papi.along, y: g.thr.y + g.rwyDir.y * g.papi.along };
    const d = Math.hypot(c.x - pa.x, c.y - pa.y);
    return (Math.atan2(c.z, Math.max(1, d)) * 180) / Math.PI;
  })();
  const papiTh = [2.5, 2.83, 3.17, 3.5];
  for (const L of scene.lights) {
    const q = toCam(c, L.x, L.y, L.z);
    if (q[0] < 5) continue;
    const d = q[0];
    if (d > 9000) continue;
    const [sx, sy] = proj(c, q);
    if (sx < -10 || sx > W + 10 || sy < -10 || sy > H + 10) continue;
    let col = L.c;
    let sz = Math.max(1.1, (L.size / d) * c.F * 1.6);
    if (L.papi !== undefined) {
      col = eyeAngle > papiTh[L.papi] ? '#ffffff' : '#ff2a2a';
      sz = Math.max(2.4, sz * 1.4);
    }
    sz = Math.min(sz, 7);
    ctx.globalAlpha = Math.min(1, 0.45 + 1500 / d);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(sx, sy, sz, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ---------- точка-подсказка (кругу) ----------
  if (cfg.guide) {
    const q = toCam(c, cfg.guide.x, cfg.guide.y, cfg.guide.z);
    if (q[0] > 20) {
      const [sx, sy] = proj(c, q);
      ctx.strokeStyle = '#ff5cf0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 14);
      ctx.lineTo(sx + 14, sy);
      ctx.lineTo(sx, sy + 14);
      ctx.lineTo(sx - 14, sy);
      ctx.closePath();
      ctx.stroke();
      ctx.fillStyle = '#ff5cf0';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${cfg.guide.label} · ${(Math.hypot(q[0], q[1]) / 1852).toFixed(1)} NM`, sx, sy - 22);
    }
  }
  return c;
}

/** Направление → экран (для HUD: вектор пути, горизонт) */
export function projDir(c: Cam, hdgDeg: number, elevDeg: number): [number, number] | null {
  const h = hdgDeg * D2R;
  const e = elevDeg * D2R;
  const q = toCam(c, c.x + Math.sin(h) * Math.cos(e) * 1e4, c.y + Math.cos(h) * Math.cos(e) * 1e4, c.z + Math.sin(e) * 1e4);
  if (q[0] < 1) return null;
  return proj(c, q);
}
