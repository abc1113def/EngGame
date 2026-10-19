import { useEffect, useRef } from 'react';
import { buildScene, drawWorld, projDir, type Scene, type ViewCfg } from '../render/world';
import { ilsDev, KT, speeds } from '../sim/flight';
import type { AirportGeo } from '../sim/scenario';
import { sim } from '../sim/sim';
import type { SimState } from '../sim/types';
import { guideFor } from '../sim/c172/pattern';
import { getSettings } from '../ui/hooks';

const sceneCache = new WeakMap<AirportGeo, Scene>();
export function sceneFor(g: AirportGeo) {
  let sc = sceneCache.get(g);
  if (!sc) {
    sc = buildScene(g);
    sceneCache.set(g, sc);
  }
  return sc;
}

export function viewCfg(s: SimState, big: boolean): ViewCfg {
  if (s.type === 'c172') return { hfov: big ? 70 : 80, eye: 1.75, eyeFwd: 0.5, look: big ? 3 : 2, guide: getSettings().guide !== false ? guideFor(s) : null };
  return { hfov: 62, eye: 5.6, eyeFwd: 17, look: 5 };
}

type Overlay = (ctx: CanvasRenderingContext2D, s: SimState, W: number, H: number, cam: ReturnType<typeof drawWorld>) => void;

/** Холст с видом наружу, перерисовывается на каждом кадре симуляции */
export function WorldCanvas({ w, h, big, overlay }: { w: number; h: number; big: boolean; overlay?: Overlay }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ov = useRef(overlay);
  ov.current = overlay;
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    let dirty = true;
    let raf = 0;
    const unsub = sim.subscribe(() => {
      dirty = true;
    });
    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!dirty) return;
      dirty = false;
      const s = sim.s;
      const cam = drawWorld(ctx, sceneFor(s.geo), s, w, h, viewCfg(s, big));
      ov.current?.(ctx, s, w, h, cam);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      unsub();
    };
  }, [w, h, big]);
  return <canvas ref={ref} width={w} height={h} style={{ display: 'block', width: w, height: h }} />;
}

// ============================ HUD ============================
const HUD = '#63ff8f';
const MAG = '#ff6cf3';

function txt(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, size = 18, color = HUD, align: CanvasTextAlign = 'center') {
  ctx.fillStyle = color;
  ctx.font = `${size}px 'B612 Mono', ui-monospace, monospace`;
  ctx.textAlign = align;
  ctx.fillText(t, x, y);
}

function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.strokeStyle = HUD;
  ctx.lineWidth = 1.6;
  ctx.strokeRect(x, y, w, h);
}

/** Общие элементы: горизонт, лестница тангажа, вектор пути */
function hudAttitude(ctx: CanvasRenderingContext2D, s: SimState, cam: ReturnType<typeof drawWorld>) {
  ctx.strokeStyle = HUD;
  ctx.lineWidth = 1.8;
  ctx.globalAlpha = 0.9;
  const hdg = s.ac.hdg;
  for (const e of [-10, -5, 0, 5, 10, 15, 20]) {
    const segs: [number, number][] = e === 0 ? [[-30, -4], [4, 30]] : [[-9, -3], [3, 9]];
    for (const [a0, a1] of segs) {
      const p0 = projDir(cam, hdg + a0, e);
      const p1 = projDir(cam, hdg + a1, e);
      if (!p0 || !p1) continue;
      ctx.setLineDash(e < 0 ? [8, 6] : []);
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.lineTo(p1[0], p1[1]);
      ctx.stroke();
      if (e !== 0 && a0 > 0) txt(ctx, String(Math.abs(e)), p1[0] + 18, p1[1] + 6, 14);
    }
  }
  ctx.setLineDash([]);
  // вектор пути
  const fpv = projDir(cam, hdg, s.ac.onGround ? 0 : s.ac.gamma);
  if (fpv && !s.ac.onGround) {
    const [x, y] = fpv;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.moveTo(x - 9, y);
    ctx.lineTo(x - 26, y);
    ctx.moveTo(x + 9, y);
    ctx.lineTo(x + 26, y);
    ctx.moveTo(x, y - 9);
    ctx.lineTo(x, y - 18);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return fpv;
}

function hudA320(ctx: CanvasRenderingContext2D, s: SimState, W: number, H: number, cam: ReturnType<typeof drawWorld>) {
  // стойки остекления и козырёк
  ctx.fillStyle = '#1b1f24';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(70, 0);
  ctx.lineTo(28, H);
  ctx.lineTo(0, H);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(W, 0);
  ctx.lineTo(W - 70, 0);
  ctx.lineTo(W - 28, H);
  ctx.lineTo(W, H);
  ctx.fill();
  ctx.fillRect(0, 0, W, 14);
  const fpv = hudAttitude(ctx, s, cam);
  const cx = W / 2;
  const spdX = W * 0.27;
  const altX = W * 0.73;
  const cy = H * 0.5;
  // скорость
  box(ctx, spdX - 52, cy - 20, 104, 40);
  txt(ctx, String(Math.round(s.ac.ias)), spdX, cy + 9, 26);
  const tgt = s.flags.spdTarget as number | undefined;
  if (tgt) txt(ctx, `${Math.round(tgt)}`, spdX, cy - 32, 18, MAG);
  const sp = speeds(s);
  if (!s.ac.onGround && s.ac.ias < sp.vls) txt(ctx, `VLS ${Math.round(sp.vls)}`, spdX, cy + 48, 16, '#ffb347');
  // высота
  const qnh = s.leg === 'arr' ? s.atc.arrQnh : s.atc.qnh;
  const baro = s.fcu.baroStd ? 1013 : s.fcu.baro;
  const alt = s.ac.alt + (baro - qnh) * 27;
  box(ctx, altX - 62, cy - 20, 124, 40);
  txt(ctx, String(Math.round(alt / 10) * 10), altX, cy + 9, 26);
  txt(ctx, `${s.fcu.alt}`, altX, cy - 32, 18, '#58d6ff');
  txt(ctx, `${s.ac.vs > 0 ? '+' : ''}${Math.round(s.ac.vs / 10) * 10}`, altX, cy + 48, 16);
  txt(ctx, s.fcu.baroStd ? 'STD' : `Q${s.fcu.baro}`, altX, cy + 70, 14, '#58d6ff');
  // курс
  txt(ctx, String(Math.round(((s.ac.hdg % 360) + 360) % 360)).padStart(3, '0') + '°', cx, 46, 22);
  ctx.strokeStyle = HUD;
  ctx.beginPath();
  ctx.moveTo(cx, 52);
  ctx.lineTo(cx, 62);
  ctx.stroke();
  // радиовысота
  const ra = s.ac.alt - s.elev;
  if (!s.ac.onGround && ra < 2500 && fpv) txt(ctx, String(ra < 50 ? Math.round(ra) : Math.round(ra / 10) * 10), fpv[0], fpv[1] + 48, 20, ra < 400 ? '#ffd166' : HUD);
  // ILS
  const dev = s.fcu.ls ? ilsDev(s) : null;
  if (dev) {
    const gx = cx + 170;
    for (const d of [-2, -1, 1, 2]) {
      ctx.beginPath();
      ctx.arc(gx, cy + d * 26, 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + d * 26, cy + 170, 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = MAG;
    if (dev.gsValid) {
      const y = cy + dev.gsDots * 26;
      ctx.beginPath();
      ctx.moveTo(gx, y - 10);
      ctx.lineTo(gx + 7, y);
      ctx.lineTo(gx, y + 10);
      ctx.lineTo(gx - 7, y);
      ctx.fill();
    }
    if (dev.locValid) {
      const x = cx - dev.locDots * 26;
      ctx.beginPath();
      ctx.moveTo(x - 10, cy + 170);
      ctx.lineTo(x, cy + 163);
      ctx.lineTo(x + 10, cy + 170);
      ctx.lineTo(x, cy + 177);
      ctx.fill();
    }
    txt(ctx, `${s.geo.ils?.ident} ${(Math.max(0, dev.dist) / 1852).toFixed(1)} NM`, cx - 200, cy + 176, 14, MAG, 'left');
  }
  // FMA
  const f = s.fma;
  const fma = [f.thr, f.vert, f.lat, f.col5.replace(/\|/g, ' ')].filter(Boolean).join('  │  ');
  txt(ctx, fma, cx, 92, 17);
  const arm = [f.vArm, f.lArm].filter(Boolean).join(' ');
  if (arm) txt(ctx, arm, cx, 114, 15, '#58d6ff');
  // состояние конфигурации
  const flaps = ['0', '1', '2', '3', 'FULL'][s.sw.FLAPS] ?? '';
  const gear = s.ac.gear > 0.99 ? 'DN' : s.ac.gear < 0.01 ? 'UP' : '↕';
  const ab = ['', 'LO', 'MED', 'MAX'][s.ac.autobrk];
  const lines = [
    `N1 ${s.eng[0].n1.toFixed(0)} / ${s.eng[1].n1.toFixed(0)} %`,
    `FLAPS ${flaps}   GEAR ${gear}`,
    `SPLR ${s.sw.SPD_BRK === 0 ? 'ARM' : s.ac.spoilers > 0.1 ? 'EXT' : 'RET'}   A/BRK ${ab || 'OFF'}${s.ac.autobrkActive ? ' ●' : ''}`,
    `GS ${Math.round(Math.abs(s.ac.gs * KT))} KT   PARK ${s.sw.PARK_BRK ? 'ON' : 'OFF'}`,
  ];
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(90, H - 128, 330, 110);
  lines.forEach((l, i) => txt(ctx, l, 104, H - 100 + i * 24, 16, HUD, 'left'));
  if (s.ac.landed && s.ac.td) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(W - 420, H - 104, 330, 86);
    txt(ctx, `TOUCHDOWN ${Math.round(s.ac.td.vs)} FPM`, W - 404, H - 76, 16, HUD, 'left');
    txt(ctx, `${Math.round(s.ac.td.along)} M · ${s.ac.td.side.toFixed(1)} M CL`, W - 404, H - 52, 16, HUD, 'left');
    if (s.gnd.phase === 'taxiin') txt(ctx, `STAND ${Math.max(0, Math.round(s.gnd.taxiPath))} M`, W - 404, H - 28, 16, '#ffd166', 'left');
  }
}

/** Капот и винт Cessna */
export function c172Nose(ctx: CanvasRenderingContext2D, s: SimState, W: number, H: number) {
  const cx = W / 2;
  ctx.fillStyle = '#e9e9e4';
  ctx.beginPath();
  ctx.moveTo(cx - W * 0.33, H);
  ctx.quadraticCurveTo(cx - W * 0.2, H - H * 0.17, cx, H - H * 0.19);
  ctx.quadraticCurveTo(cx + W * 0.2, H - H * 0.17, cx + W * 0.33, H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#8f1d22';
  ctx.beginPath();
  ctx.moveTo(cx - W * 0.25, H);
  ctx.quadraticCurveTo(cx, H - H * 0.13, cx + W * 0.25, H);
  ctx.closePath();
  ctx.fill();
  // винт
  const rpm = s.c.rpm;
  const ang = (s.t * rpm * 0.1) % (Math.PI * 2);
  const py = H - H * 0.2;
  if (rpm > 600) {
    ctx.fillStyle = 'rgba(30,30,30,0.16)';
    ctx.beginPath();
    ctx.ellipse(cx, py, W * 0.24, H * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = '#151515';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(ang) * W * 0.22, py - Math.sin(ang) * H * 0.06);
    ctx.lineTo(cx + Math.cos(ang) * W * 0.22, py + Math.sin(ang) * H * 0.06);
    ctx.stroke();
  }
  ctx.fillStyle = '#d7d7d2';
  ctx.beginPath();
  ctx.ellipse(cx, py, 16, 12, 0, 0, Math.PI * 2);
  ctx.fill();
}

function hudC172(ctx: CanvasRenderingContext2D, s: SimState, W: number, H: number, cam: ReturnType<typeof drawWorld>) {
  c172Nose(ctx, s, W, H);
  // стойки
  ctx.fillStyle = '#2a2d31';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(110, 0);
  ctx.lineTo(40, H);
  ctx.lineTo(0, H);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(W, 0);
  ctx.lineTo(W - 110, 0);
  ctx.lineTo(W - 40, H);
  ctx.lineTo(W, H);
  ctx.fill();
  ctx.fillRect(0, 0, W, 34);
  hudAttitude(ctx, s, cam);
  const c = s.c;
  const lines = [
    `IAS ${Math.round(s.ac.ias)} KT`,
    `ALT ${Math.round((s.ac.alt + (c.baro - s.atc.qnh / 33.8639) * 1000) / 10) * 10} FT`,
    `VS ${s.ac.vs > 0 ? '+' : ''}${Math.round(s.ac.vs / 10) * 10}`,
    `HDG ${String(Math.round(((s.ac.hdg % 360) + 360) % 360)).padStart(3, '0')}°`,
    `RPM ${Math.round(c.rpm / 10) * 10}`,
    `FLAPS ${Math.round(c.flaps)}°  TRIM ${c.trim > 0 ? '+' : ''}${c.trim.toFixed(2)}`,
  ];
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(130, 50, 250, lines.length * 24 + 18);
  lines.forEach((l, i) => txt(ctx, l, 144, 76 + i * 24, 17, HUD, 'left'));
  if (c.stallHorn && Math.floor(s.t * 4) % 2 === 0) txt(ctx, 'STALL', W / 2, 120, 34, '#ff4d4d');
}

export function OutView() {
  return (
    <div className="canvas out" style={{ width: 1600, height: 960, position: 'relative', background: '#000' }}>
      <WorldCanvas w={1600} h={960} big overlay={(ctx, s, W, H, cam) => (s.type === 'c172' ? hudC172(ctx, s, W, H, cam) : hudA320(ctx, s, W, H, cam))} />
    </div>
  );
}
