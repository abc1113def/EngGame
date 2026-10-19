import { useRef, type ReactNode } from 'react';
import { FcuKnob, Pb, Rotary, Toggle, Wrap } from '../controls/Controls';
import { arcPath, polar } from '../displays/common';
import { inHg } from '../sim/c172/comms';
import { PATTERN } from '../sim/c172/pattern';
import { av1, av2 } from '../sim/c172/systems';
import { freqStr, radioUnit } from '../sim/ground';
import { sim } from '../sim/sim';
import type { SimState } from '../sim/types';
import { useSim, useSimFrame, useT } from '../ui/hooks';
import { c172Nose, WorldCanvas } from './Out';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const WHITE = '#f2f2ee';

/** Круглый прибор: корпус, шкала и стрелки — в системе 200×200 */
function Gauge({ x, y, size = 180, children, label }: { x: number; y: number; size?: number; children: ReactNode; label?: string }) {
  return (
    <div className="c-gauge" style={{ left: x, top: y, width: size, height: size }}>
      <svg viewBox="0 0 200 200" width={size} height={size}>
        <circle cx={100} cy={100} r={98} fill="#15171a" />
        <circle cx={100} cy={100} r={92} fill="#050607" stroke="#2b2f34" strokeWidth={3} />
        {children}
        <circle cx={100} cy={100} r={92} fill="url(#glass)" pointerEvents="none" />
      </svg>
      {label && <div className="c-gauge-l">{label}</div>}
    </div>
  );
}

function Needle({ a, len = 78, w = 5, c = WHITE, tail = 14 }: { a: number; len?: number; w?: number; c?: string; tail?: number }) {
  return (
    <g transform={`rotate(${a} 100 100)`}>
      <path d={`M ${100 - w / 2} ${100 + tail} L ${100 - w / 2} ${100 - len + 8} L 100 ${100 - len} L ${100 + w / 2} ${100 - len + 8} L ${100 + w / 2} ${100 + tail} Z`} fill={c} />
      <circle cx={100} cy={100} r={7} fill="#222" stroke="#666" />
    </g>
  );
}

function Ticks({ from, to, step, major, a0, a1, r = 86, labels, fmt = (v: number) => String(v), ls = 15 }: { from: number; to: number; step: number; major: number; a0: number; a1: number; r?: number; labels?: boolean; fmt?: (v: number) => string; ls?: number }) {
  const out: ReactNode[] = [];
  for (let v = from; v <= to + 1e-6; v += step) {
    const a = a0 + ((v - from) / (to - from)) * (a1 - a0) - 90;
    const big = Math.abs(v / major - Math.round(v / major)) < 1e-6;
    const [x1, y1] = polar(100, 100, r, a);
    const [x2, y2] = polar(100, 100, r - (big ? 12 : 6), a);
    out.push(<line key={v} x1={x1} y1={y1} x2={x2} y2={y2} stroke={WHITE} strokeWidth={big ? 2.5 : 1.4} />);
    if (labels && big) {
      const [tx, ty] = polar(100, 100, r - 25, a);
      out.push(
        <text key={'t' + v} x={tx} y={ty + 5} fill={WHITE} fontSize={ls} textAnchor="middle" className="c-font">
          {fmt(v)}
        </text>,
      );
    }
  }
  return <>{out}</>;
}

// ============================ шесть основных приборов ============================
const asiA = (v: number) => (v < 40 ? (v / 40) * 25 : 25 + ((Math.min(v, 200) - 40) / 160) * 300);

function Asi({ x, y }: { x: number; y: number }) {
  const s = useSimFrame(30);
  const v = s.c.pre.pitotCover ? 0 : s.ac.ias;
  const arc = (a: number, b: number, r: number, c: string, w: number) => <path d={arcPath(100, 100, r, asiA(a) - 90, asiA(b) - 90)} stroke={c} strokeWidth={w} fill="none" />;
  return (
    <Gauge x={x} y={y}>
      {arc(40, 85, 80, '#e8e8e8', 6)}
      {arc(48, 129, 86, '#1fb64a', 7)}
      {arc(129, 163, 86, '#f0c419', 7)}
      <line {...lineAt(asiA(163), 76, 92)} stroke="#e52222" strokeWidth={4} />
      {[40, 60, 80, 100, 120, 140, 160, 180, 200].map((k) => {
        const [tx, ty] = polar(100, 100, 62, asiA(k) - 90);
        return (
          <g key={k}>
            <line {...lineAt(asiA(k), 74, 90)} stroke={WHITE} strokeWidth={2.4} />
            <text x={tx} y={ty + 5} fill={WHITE} fontSize={14} textAnchor="middle" className="c-font">
              {k}
            </text>
          </g>
        );
      })}
      <text x={100} y={130} fill={WHITE} fontSize={11} textAnchor="middle" className="c-font">
        KNOTS
      </text>
      <Needle a={asiA(v)} />
    </Gauge>
  );
}
function lineAt(a: number, r0: number, r1: number) {
  const [x1, y1] = polar(100, 100, r0, a - 90);
  const [x2, y2] = polar(100, 100, r1, a - 90);
  return { x1, y1, x2, y2 };
}

function Ai({ x, y }: { x: number; y: number }) {
  const s = useSimFrame(30);
  const k = s.c.aiSpin;
  // недораскрученный гироскоп «заваливается»
  const roll = s.ac.roll * k + (1 - k) * 28;
  const pitch = s.ac.pitch * k - (1 - k) * 12;
  const P = 3.2;
  return (
    <Gauge x={x} y={y}>
      <defs>
        <clipPath id="c-ai-clip">
          <circle cx={100} cy={100} r={86} />
        </clipPath>
      </defs>
      <g clipPath="url(#c-ai-clip)">
        <g transform={`rotate(${-roll} 100 100) translate(0 ${pitch * P})`}>
          <rect x={-100} y={-300} width={400} height={400} fill="#2c86d9" />
          <rect x={-100} y={100} width={400} height={400} fill="#7a4a22" />
          <line x1={-100} y1={100} x2={300} y2={100} stroke={WHITE} strokeWidth={2} />
          {[-20, -10, -5, 5, 10, 20].map((p) => (
            <line key={p} x1={100 - (Math.abs(p) % 10 === 0 ? 22 : 11)} y1={100 - p * P} x2={100 + (Math.abs(p) % 10 === 0 ? 22 : 11)} y2={100 - p * P} stroke={WHITE} strokeWidth={1.6} />
          ))}
        </g>
        {/* шкала крена */}
        <g transform={`rotate(${-roll} 100 100)`}>
          {[-60, -30, -20, -10, 0, 10, 20, 30, 60].map((a) => (
            <line key={a} {...lineAt(a, 72, a % 30 === 0 ? 86 : 80)} stroke={WHITE} strokeWidth={2.4} />
          ))}
        </g>
      </g>
      <path d="M 100 20 l -7 12 h 14 z" fill="#f2a516" />
      <g stroke="#f2a516" strokeWidth={5} fill="none" strokeLinecap="round">
        <path d="M 52 102 h 30 l 8 8" />
        <path d="M 148 102 h -30 l -8 8" />
      </g>
      <circle cx={100} cy={102} r={4} fill="#f2a516" />
    </Gauge>
  );
}

function Alt({ x, y }: { x: number; y: number }) {
  const s = useSimFrame(30);
  const a = s.ac.alt + (s.c.baro - inHg(s.atc.qnh)) * 1000;
  return (
    <Wrap id="C_BARO" className="c-abs" style={{ left: x, top: y }}>
      <Gauge x={0} y={0}>
        <Ticks from={0} to={1000} step={20} major={100} a0={0} a1={360} labels fmt={(v) => (v < 1000 ? String(v / 100) : '')} ls={17} />
        <rect x={122} y={88} width={44} height={22} fill="#111" stroke="#555" />
        <text x={144} y={104} fill={WHITE} fontSize={12} textAnchor="middle" className="c-font">
          {s.c.baro.toFixed(2)}
        </text>
        <text x={100} y={70} fill={WHITE} fontSize={10} textAnchor="middle" className="c-font">
          ALT · FEET
        </text>
        <Needle a={((a / 10000) % 1) * 360} len={40} w={3} tail={0} />
        <Needle a={((a / 1000) % 1) * 360} len={52} w={9} tail={8} />
        <Needle a={((a / 100) % 10) * 36} len={80} w={5} />
      </Gauge>
      <div className="c-kollsman" onWheel={(e) => sim.knob('C_BARO', e.deltaY < 0 ? 1 : -1)} onClick={(e) => sim.knob('C_BARO', e.nativeEvent.offsetX < 20 ? -1 : 1)} title="BARO" />
    </Wrap>
  );
}

function Tc({ x, y }: { x: number; y: number }) {
  const s = useSimFrame(30);
  const pwr = s.c.busV > 18;
  const rate = s.ac.onGround ? (s.ac.gs > 0.3 ? 0 : 0) : (9.81 * Math.tan((s.ac.roll * Math.PI) / 180)) / Math.max(15, s.ac.gs) * 57.3;
  const turn = pwr ? clamp(rate / 3, -1.6, 1.6) * 20 : 0;
  const ball = s.ac.onGround ? clamp(s.ac.rudder * -12, -14, 14) : clamp(s.ac.rudder * -10, -14, 14);
  return (
    <Gauge x={x} y={y} label="">
      <text x={100} y={50} fill={WHITE} fontSize={11} textAnchor="middle" className="c-font">
        TURN COORDINATOR
      </text>
      <line x1={22} y1={118} x2={40} y2={122} stroke={WHITE} strokeWidth={3} />
      <line x1={178} y1={118} x2={160} y2={122} stroke={WHITE} strokeWidth={3} />
      <line x1={26} y1={96} x2={42} y2={96} stroke={WHITE} strokeWidth={3} />
      <line x1={174} y1={96} x2={158} y2={96} stroke={WHITE} strokeWidth={3} />
      <text x={30} y={140} fill={WHITE} fontSize={14} className="c-font">
        L
      </text>
      <text x={162} y={140} fill={WHITE} fontSize={14} className="c-font">
        R
      </text>
      <g transform={`rotate(${turn} 100 100)`} stroke={WHITE} strokeWidth={5} fill={WHITE} strokeLinecap="round">
        <line x1={40} y1={100} x2={160} y2={100} />
        <circle cx={100} cy={100} r={9} />
        <line x1={100} y1={100} x2={100} y2={84} />
      </g>
      <path d="M 60 148 Q 100 162 140 148 L 140 160 Q 100 174 60 160 Z" fill="#cfd5c7" opacity={0.9} />
      <circle cx={100 + ball} cy={158} r={6.5} fill="#111" />
      {!pwr && (
        <g>
          <rect x={120} y={60} width={34} height={18} fill="#d22" />
          <text x={137} y={74} fill="#fff" fontSize={12} textAnchor="middle" className="c-font">
            OFF
          </text>
        </g>
      )}
      <text x={100} y={190} fill="#999" fontSize={9} textAnchor="middle" className="c-font">
        2 MIN
      </text>
    </Gauge>
  );
}

function Hi({ x, y }: { x: number; y: number }) {
  const s = useSimFrame(30);
  const shown = s.ac.hdg + s.c.hiErr;
  const card: ReactNode[] = [];
  for (let d = 0; d < 360; d += 5) {
    const big = d % 10 === 0;
    card.push(<line key={d} {...lineAt(d, big ? 74 : 79, 86)} stroke={WHITE} strokeWidth={big ? 2.2 : 1.2} />);
    if (d % 30 === 0) {
      const [tx, ty] = polar(100, 100, 62, d - 90);
      const lbl = d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : d === 270 ? 'W' : String(d / 10);
      card.push(
        <text key={'t' + d} x={tx} y={ty + 6} fill={WHITE} fontSize={16} textAnchor="middle" className="c-font" transform={`rotate(${d} ${tx} ${ty})`}>
          {lbl}
        </text>,
      );
    }
  }
  return (
    <div className="c-abs" style={{ left: x, top: y }}>
      <Gauge x={0} y={0}>
        <g transform={`rotate(${-shown} 100 100)`}>
          {card}
          <g transform={`rotate(${s.c.hdgBug} 100 100)`}>
            <path d="M 92 13 h 16 v 10 l -8 -5 l -8 5 z" fill="#f2a516" />
          </g>
        </g>
        <path d="M 100 20 l -6 -9 h 12 z" fill="#f2a516" />
        <g stroke="#f2a516" strokeWidth={3} fill="none">
          <path d="M 100 70 v 60 M 78 100 h 44 M 90 124 h 20" />
        </g>
      </Gauge>
      <div className="c-hi-knobs">
        <FcuKnob id="C_DG" size={34} ring />
        <FcuKnob id="C_HDG_BUG" size={34} ring />
      </div>
    </div>
  );
}

function Vsi({ x, y }: { x: number; y: number }) {
  const s = useSimFrame(30);
  const v = clamp(s.ac.vs, -2000, 2000);
  const a = -90 + (v / 2000) * 170;
  return (
    <Gauge x={x} y={y}>
      {[-20, -15, -10, -5, 0, 5, 10, 15, 20].map((k) => {
        const ang = -90 + (k / 20) * 170;
        const [tx, ty] = polar(100, 100, 60, ang - 90);
        return (
          <g key={k}>
            <line {...lineAt(ang, 74, 88)} stroke={WHITE} strokeWidth={2.4} />
            {k % 5 === 0 && (
              <text x={tx} y={ty + 5} fill={WHITE} fontSize={14} textAnchor="middle" className="c-font">
                {Math.abs(k / 5)}
              </text>
            )}
          </g>
        );
      })}
      <text x={120} y={80} fill={WHITE} fontSize={10} className="c-font">
        UP
      </text>
      <text x={120} y={128} fill={WHITE} fontSize={10} className="c-font">
        DOWN
      </text>
      <text x={130} y={104} fill={WHITE} fontSize={9} className="c-font">
        ×1000 FPM
      </text>
      <Needle a={a} />
    </Gauge>
  );
}

// ============================ двигатель ============================
function Tach({ x, y }: { x: number; y: number }) {
  const s = useSimFrame(30);
  const rA = (r: number) => -135 + (clamp(r, 0, 3500) / 3500) * 270;
  return (
    <Gauge x={x} y={y} size={170}>
      <path d={arcPath(100, 100, 84, rA(2100) - 90, rA(2700) - 90)} stroke="#1fb64a" strokeWidth={8} fill="none" />
      <line {...lineAt(rA(2700), 74, 92)} stroke="#e52222" strokeWidth={4} />
      <Ticks from={0} to={3500} step={100} major={500} a0={-135} a1={135} labels fmt={(v) => String(v / 100)} />
      <text x={100} y={68} fill={WHITE} fontSize={10} textAnchor="middle" className="c-font">
        RPM ×100
      </text>
      <rect x={70} y={130} width={60} height={18} fill="#111" stroke="#444" />
      <text x={100} y={144} fill={WHITE} fontSize={12} textAnchor="middle" className="c-font">
        {s.c.hobbs.toFixed(1)}
      </text>
      <Needle a={rA(s.c.rpm)} />
    </Gauge>
  );
}

/** Маленький стрелочный прибор двигателя */
function Mini({ label, v, min, max, green, red, fmt, unit }: { label: string; v: number; min: number; max: number; green?: [number, number]; red?: number[]; fmt?: (v: number) => string; unit?: string }) {
  const A = (x: number) => -60 + ((clamp(x, min, max) - min) / (max - min)) * 120;
  return (
    <div className="c-mini">
      <svg viewBox="0 0 100 64" width={86} height={55}>
        <rect x={0} y={0} width={100} height={64} rx={6} fill="#060708" />
        {green && <path d={`M ${50 + Math.sin((A(green[0]) * Math.PI) / 180) * 40} ${58 - Math.cos((A(green[0]) * Math.PI) / 180) * 40} A 40 40 0 0 1 ${50 + Math.sin((A(green[1]) * Math.PI) / 180) * 40} ${58 - Math.cos((A(green[1]) * Math.PI) / 180) * 40}`} stroke="#1fb64a" strokeWidth={5} fill="none" />}
        {(red ?? []).map((r) => (
          <line key={r} x1={50 + Math.sin((A(r) * Math.PI) / 180) * 34} y1={58 - Math.cos((A(r) * Math.PI) / 180) * 34} x2={50 + Math.sin((A(r) * Math.PI) / 180) * 45} y2={58 - Math.cos((A(r) * Math.PI) / 180) * 45} stroke="#e52222" strokeWidth={3} />
        ))}
        <line x1={50} y1={58} x2={50 + Math.sin((A(v) * Math.PI) / 180) * 42} y2={58 - Math.cos((A(v) * Math.PI) / 180) * 42} stroke={WHITE} strokeWidth={2.6} />
        <circle cx={50} cy={58} r={4} fill="#333" />
        <text x={50} y={12} fill={WHITE} fontSize={9} textAnchor="middle" className="c-font">
          {label}
        </text>
        <text x={50} y={38} fill="#9fa" fontSize={9} textAnchor="middle" className="c-font">
          {fmt ? fmt(v) : Math.round(v)}
          {unit}
        </text>
      </svg>
    </div>
  );
}

function EngCluster({ x, y }: { x: number; y: number }) {
  const s = useSimFrame(10);
  const c = s.c;
  const p = c.busV > 18;
  return (
    <div className="c-cluster" style={{ left: x, top: y }}>
      <Mini label="FUEL L GAL" v={p ? c.fuelL : 0} min={0} max={26} red={[0]} />
      <Mini label="FUEL R GAL" v={p ? c.fuelR : 0} min={0} max={26} red={[0]} />
      <Mini label="OIL °F" v={c.oilT} min={75} max={250} green={[100, 245]} red={[245]} />
      <Mini label="OIL PSI" v={c.oilP} min={0} max={115} green={[50, 90]} red={[20, 115]} />
      <Mini label="EGT" v={p ? c.egt : 0} min={0} max={1700} fmt={() => ''} />
      <Mini label="FUEL FLOW GPH" v={p ? c.ff : 0} min={0} max={20} fmt={(v) => v.toFixed(1)} />
      <Mini label="SUCTION" v={c.vac} min={3} max={7} green={[4.5, 5.5]} fmt={(v) => v.toFixed(1)} />
      <Mini label="AMPS" v={c.amps} min={-60} max={60} fmt={(v) => (v > 0 ? '+' : '') + v.toFixed(0)} />
      <Mini label="VOLTS" v={c.busV} min={16} max={32} green={[24.5, 29]} fmt={(v) => v.toFixed(1)} />
    </div>
  );
}

// ============================ табло, часы ============================
function Annunciators({ x, y }: { x: number; y: number }) {
  const s = useSimFrame(8);
  const c = s.c;
  const pwr = c.busV > 12;
  const test = pwr && !!s.momentary.C_ANN_TEST;
  const lt = (on: boolean, txt: string, col = 'amber') => <div className={`c-ann c-${col} ${pwr && (on || test) ? 'on' : ''}`}>{txt}</div>;
  return (
    <div className="c-annp" style={{ left: x, top: y }}>
      <div className="c-ann-grid">
        {lt(c.fuelL < 5, 'L LOW FUEL')}
        {lt(c.oilP < 20, 'OIL PRESS', 'red')}
        {lt(c.fuelR < 5, 'LOW FUEL R')}
        {lt(c.vac < 3.5, 'LOW VACUUM')}
        {lt(c.busV < 24.5, 'VOLTS', 'red')}
        <Pb id="C_ANN_TEST" w={52} h={22} noLabel inner="TEST" />
      </div>
    </div>
  );
}

// ============================ замок зажигания ============================
function MagKey({ x, y }: { x: number; y: number }) {
  const v = useSim((s) => s.sw.C_MAGS);
  const pos = ['OFF', 'R', 'L', 'BOTH', 'START'];
  const ang = (i: number) => -70 + i * 35;
  const down = (e: React.MouseEvent) => {
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const right = e.clientX - r.left > r.width / 2;
    if (right && v === 3) {
      sim.setSw('C_MAGS', 4);
      const up = () => {
        sim.setSw('C_MAGS', 3);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mouseup', up);
    } else sim.setSw('C_MAGS', right ? v + 1 : v - 1);
  };
  return (
    <Wrap id="C_MAGS" className="c-abs" style={{ left: x, top: y }}>
      <div className="pb-label">MAGNETOS</div>
      <div className="c-key" onMouseDown={down} onWheel={(e) => sim.setSw('C_MAGS', Math.min(3, e.deltaY < 0 ? v + 1 : v - 1))}>
        {pos.map((p, i) => {
          const [lx, ly] = polar(70, 70, 56, ang(i) - 90);
          return (
            <span key={p} className={`c-key-l ${i === v ? 'sel' : ''} ${p === 'START' ? 'start' : ''}`} style={{ left: lx, top: ly }}>
              {p}
            </span>
          );
        })}
        <div className="c-key-face" style={{ transform: `rotate(${ang(v)}deg)` }}>
          <div className="c-key-blade" />
        </div>
      </div>
      <div className="c-hint">{v === 3 ? 'hold → START' : ''}</div>
    </Wrap>
  );
}

// ============================ РУД и смесь ============================
function PushPull({ id, label, color }: { id: 'C_THR' | 'C_MIX'; label: string; color: string }) {
  const v = useSim((s) => s.sw[id] ?? 0);
  const ref = useRef<HTMLDivElement>(null);
  const H = 160;
  const down = (e: React.MouseEvent) => {
    e.preventDefault();
    const move = (ev: MouseEvent) => {
      const r = ref.current!.getBoundingClientRect();
      const k = r.height / H;
      sim.setLever(id, 1 - (ev.clientY - r.top) / k / H);
    };
    move(e.nativeEvent);
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  return (
    <Wrap id={id} className="c-ppw">
      <div className="pb-label">{label}</div>
      <div className="c-pp" ref={ref} style={{ height: H }} onMouseDown={down} onWheel={(e) => sim.setLever(id, v + (e.deltaY < 0 ? 0.02 : -0.02))}>
        <div className="c-pp-shaft" style={{ top: (1 - v) * (H - 30) + 26, height: v * (H - 30) + 4 }} />
        <div className="c-pp-knob" style={{ top: (1 - v) * (H - 30), background: color }} />
      </div>
      <div className="c-pp-val">{id === 'C_MIX' ? (v < 0.05 ? 'CUTOFF' : v > 0.85 ? 'RICH' : `${Math.round(v * 100)}%`) : `${Math.round(v * 100)}%`}</div>
    </Wrap>
  );
}

function FlapLever() {
  const v = useSim((s) => s.sw.C_FLAPS);
  const deg = useSim((s) => Math.round(s.c.flaps));
  const pos = ['UP', '10°', '20°', 'FULL'];
  const click = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    sim.setSw('C_FLAPS', e.clientY - r.top < r.height / 2 ? v - 1 : v + 1);
  };
  return (
    <Wrap id="C_FLAPS" className="c-flapw">
      <div className="pb-label">WING FLAPS</div>
      <div className="c-flap" onClick={click} onWheel={(e) => sim.setSw('C_FLAPS', e.deltaY < 0 ? v - 1 : v + 1)}>
        {pos.map((p, i) => (
          <span key={p} className={`c-flap-l ${i === v ? 'sel' : ''}`} style={{ top: 6 + i * 30 }}>
            {p}
          </span>
        ))}
        <div className="c-flap-slot" />
        <div className="c-flap-knob" style={{ top: 4 + v * 30 }} />
      </div>
      <div className="c-pp-val">{deg}°</div>
    </Wrap>
  );
}

function TrimWheel() {
  const t = useSim((s) => s.c.trim);
  const click = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    sim.knob('C_TRIM', e.clientY - r.top < r.height / 2 ? -1 : 1);
  };
  return (
    <Wrap id="C_TRIM" className="c-trimw">
      <div className="pb-label">ELEVATOR TRIM</div>
      <div className="c-trim" onClick={click} onWheel={(e) => sim.knob('C_TRIM', e.deltaY < 0 ? -1 : 1)}>
        <div className="c-trim-wheel" style={{ backgroundPositionY: `${t * 120}px` }} />
        <div className="c-trim-scale">
          <span style={{ top: 2 }}>DN</span>
          <span style={{ top: 58, color: '#fff' }}>T/O ▸</span>
          <span style={{ top: 112 }}>UP</span>
          <div className="c-trim-ptr" style={{ top: 64 + t * 56 }} />
        </div>
      </div>
      <div className="c-pp-val">{t > 0 ? '+' : ''}{t.toFixed(2)}</div>
    </Wrap>
  );
}

function ControlLock() {
  const lock = useSim((s) => s.c.pre.lock);
  return (
    <Wrap id="C_LOCK" className="c-lockw">
      <div className={`c-lock ${lock ? 'in' : ''}`} onClick={() => sim.press('C_LOCK')}>
        {lock ? (
          <>
            <b>CONTROL LOCK</b>
            <span>REMOVE BEFORE FLIGHT</span>
          </>
        ) : (
          <span>CONTROL LOCK — STOWED</span>
        )}
      </div>
    </Wrap>
  );
}

// ============================ радио ============================
function ComRadio({ x, y }: { x: number; y: number }) {
  const s = useSimFrame(8);
  const on = av1(s);
  const u = radioUnit(s);
  return (
    <div className="c-radio" style={{ left: x, top: y }}>
      <div className="c-radio-h">COM 1 · NAV 1</div>
      <div className="c-radio-row">
        <div className="c-lcd">
          <small>COM</small>
          {on ? freqStr(s.c.com) : ''}
        </div>
        <Pb id="C_COM_FLIP" w={34} h={26} noLabel inner="⇄" />
        <div className="c-lcd stby">
          <small>STBY</small>
          {on ? freqStr(s.c.comStby) : ''}
        </div>
        <FcuKnob id="C_COM_KNOB" size={44} ring />
      </div>
      <div className="c-radio-st">{on ? (u ? (u === 'TWR' ? 'LASBORDES TOWER' : 'LASBORDES ATIS') : '') : ''}</div>
    </div>
  );
}

function Xpdr({ x, y }: { x: number; y: number }) {
  const s = useSimFrame(8);
  const on = av2(s) && s.sw.C_XPDR > 0;
  return (
    <div className="c-radio xp" style={{ left: x, top: y }}>
      <div className="c-radio-h">TRANSPONDER</div>
      <div className="c-radio-row">
        <div className="c-lcd">
          <small>{on ? ['', 'SBY', 'ON', 'ALT'][s.sw.C_XPDR] : ''}</small>
          {on ? s.c.xpdrCode : ''}
        </div>
        <div className={`c-reply ${on && s.sw.C_XPDR >= 2 && Math.floor(s.t * 1.3) % 2 === 0 ? 'on' : ''}`}>R</div>
        <Rotary id="C_XPDR" size={26} />
      </div>
    </div>
  );
}

function Kap140({ x, y }: { x: number; y: number }) {
  const s = useSimFrame(8);
  const c = s.c;
  const on = av2(s);
  const test = on && s.t - ((s.flags.cApPwrT as number) ?? s.t) < 5;
  const txt = !on ? '' : test ? 'PFT' : c.ap ? `AP  ${c.apHdg ? 'HDG' : 'ROL'}   ${c.apAlt ? 'ALT ' + Math.round(c.apAltTgt) : 'VS ' + ((s.flags.cApVs as number) ?? 0)}` : '';
  return (
    <div className="c-radio ap" style={{ left: x, top: y }}>
      <div className="c-radio-h">AUTOPILOT KAP 140</div>
      <div className="c-radio-row">
        <div className="c-lcd ap">{txt}</div>
        <Pb id="C_AP" w={38} h={24} noLabel inner="AP" />
        <Pb id="C_AP_HDG" w={38} h={24} noLabel inner="HDG" />
        <Pb id="C_AP_ALT" w={38} h={24} noLabel inner="ALT" />
      </div>
    </div>
  );
}

// ============================ мини-карта круга ============================
function PatternMap({ x, y }: { x: number; y: number }) {
  const s = useSimFrame(6);
  const t = useT();
  const g = s.geo;
  const toScr = (px: number, py: number) => {
    const a = (px - g.thr.x) * g.rwyDir.x + (py - g.thr.y) * g.rwyDir.y;
    const sd = (px - g.thr.x) * g.side.x + (py - g.thr.y) * g.side.y;
    return [200 - (a - 400) * 0.075, 64 - sd * 0.035 - 16];
  };
  const P = (a: number, sd: number) => toScr(g.thr.x + g.rwyDir.x * a + g.side.x * sd, g.thr.y + g.rwyDir.y * a + g.side.y * sd);
  const t0 = P(0, 0);
  const t1 = P(g.rwyLen, 0);
  const pts = PATTERN.slice(0, 5).map((p) => P(p.along, p.side));
  const [ax, ay] = toScr(s.ac.x, s.ac.y);
  const i = Math.min(5, (s.flags.cGuide as number) ?? 0);
  const gp = !s.ac.onGround ? P(PATTERN[i].along, PATTERN[i].side) : null;
  const rot = 90 - (s.ac.hdg - g.rwyHdg) + 180;
  return (
    <div className="c-map" style={{ left: x, top: y }}>
      <svg viewBox="0 0 400 120" width={400} height={120}>
        <rect x={0} y={0} width={400} height={120} rx={6} fill="#13202a" />
        <polyline points={[t0, ...pts, t0].map((p) => p.join(',')).join(' ')} fill="none" stroke="#5f7d92" strokeDasharray="4 5" />
        <line x1={t0[0]} y1={t0[1]} x2={t1[0]} y2={t1[1]} stroke="#cfd6dc" strokeWidth={5} />
        <text x={t0[0] + 4} y={t0[1] + 16} fill="#cfd6dc" fontSize={10}>
          33
        </text>
        {gp && <path d={`M ${gp[0]} ${gp[1] - 6} l 6 6 l -6 6 l -6 -6 z`} fill="none" stroke="#ff5cf0" strokeWidth={2} />}
        <g transform={`translate(${ax},${ay}) rotate(${rot})`}>
          <path d="M0,-7 L4,5 L0,3 L-4,5 Z" fill="#4fd1ff" />
        </g>
        <text x={8} y={112} fill="#9fb" fontSize={11}>
          {t({ ru: 'Левый круг · 1500 фт QNH', en: 'Left-hand circuit · 1500 ft QNH' })}
        </text>
        <text x={392} y={14} fill="#ff9cf5" fontSize={11} textAnchor="end">
          {!s.ac.onGround ? PATTERN[i].label : ''}
        </text>
      </svg>
    </div>
  );
}

// ============================ компас ============================
function Compass({ s }: { s: SimState }) {
  const h = ((s.ac.hdg % 360) + 360) % 360 + Math.sin(s.t * 1.7) * (s.ac.onGround ? 0.3 : 1.5) * Math.min(1, Math.abs(s.ac.roll) / 10 + 0.2);
  const items: ReactNode[] = [];
  for (let d = -40; d <= 40; d += 5) {
    const hd = Math.round(h / 5) * 5 + d;
    const xx = 60 + (hd - h) * 2.6;
    const n = ((hd % 360) + 360) % 360;
    items.push(<line key={'l' + hd} x1={xx} y1={22} x2={xx} y2={n % 10 === 0 ? 30 : 26} stroke="#222" strokeWidth={1.2} />);
    if (n % 30 === 0) {
      const lbl = n === 0 ? 'N' : n === 90 ? 'E' : n === 180 ? 'S' : n === 270 ? 'W' : String(n / 10);
      items.push(
        <text key={'t' + hd} x={xx} y={18} fontSize={12} textAnchor="middle" fill="#222" className="c-font">
          {lbl}
        </text>,
      );
    }
  }
  return (
    <svg viewBox="0 0 120 36" width={150} height={45} className="c-compass">
      <defs>
        <clipPath id="c-cmp-clip">
          <rect x={8} y={4} width={104} height={28} rx={4} />
        </clipPath>
      </defs>
      <rect x={0} y={0} width={120} height={36} rx={8} fill="#111" />
      <rect x={8} y={4} width={104} height={28} rx={4} fill="#e9e2c8" />
      <g clipPath="url(#c-cmp-clip)">{items}</g>
      <line x1={60} y1={2} x2={60} y2={34} stroke="#d22" strokeWidth={1.5} />
    </svg>
  );
}

function Windshield() {
  const s = useSimFrame(10);
  return (
    <div className="c-wind">
      <WorldCanvas
        w={1600}
        h={400}
        big={false}
        overlay={(ctx, st, W, H) => {
          c172Nose(ctx, st, W, H);
          ctx.fillStyle = '#25282c';
          ctx.fillRect(0, 0, W, 18);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(120, 0);
          ctx.lineTo(60, H);
          ctx.lineTo(0, H);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(W, 0);
          ctx.lineTo(W - 120, 0);
          ctx.lineTo(W - 60, H);
          ctx.lineTo(W, H);
          ctx.fill();
          ctx.fillRect(W / 2 - 6, 0, 12, 60);
        }}
      />
      <div className="c-compass-w">
        <Compass s={s} />
      </div>
    </div>
  );
}

export function C172Panel() {
  return (
    <div className="canvas c172" style={{ width: 1600, height: 1000 }}>
      <svg width={0} height={0} style={{ position: 'absolute' }}>
        <defs>
          <radialGradient id="glass" cx="35%" cy="25%" r="80%">
            <stop offset="0%" stopColor="#fff" stopOpacity={0.1} />
            <stop offset="60%" stopColor="#fff" stopOpacity={0.02} />
            <stop offset="100%" stopColor="#000" stopOpacity={0.15} />
          </radialGradient>
        </defs>
      </svg>
      <Windshield />
      <div className="c-panel">
        <Annunciators x={20} y={14} />
        <MagKey x={30} y={140} />
        <div className="c-abs c-sw-col" style={{ left: 20, top: 330 }}>
          <div className="c-master">
            <Toggle id="C_ALT" h={56} />
            <Toggle id="C_BAT" h={56} />
          </div>
          <div className="c-master av">
            <Toggle id="C_AVIONICS1" h={56} />
            <Toggle id="C_AVIONICS2" h={56} />
          </div>
        </div>
        <Asi x={230} y={10} />
        <Ai x={420} y={10} />
        <Alt x={610} y={10} />
        <Tc x={230} y={200} />
        <Hi x={420} y={200} />
        <Vsi x={610} y={200} />
        <ComRadio x={810} y={10} />
        <Xpdr x={810} y={118} />
        <Kap140 x={810} y={210} />
        <PatternMap x={810} y={290} />
        <Tach x={1225} y={10} />
        <EngCluster x={1403} y={10} />
        <div className="c-abs c-levers" style={{ left: 1225, top: 196 }}>
          <PushPull id="C_THR" label="THROTTLE" color="#141414" />
          <PushPull id="C_MIX" label="MIXTURE" color="#c4161c" />
        </div>
        <div className="c-abs c-swrow" style={{ left: 230, top: 418 }}>
          <Toggle id="C_FUEL_PUMP" h={46} />
          <Toggle id="C_BEACON" h={46} />
          <Toggle id="C_LAND" h={46} />
          <Toggle id="C_TAXI" h={46} />
          <Toggle id="C_NAV" h={46} />
          <Toggle id="C_STROBE" h={46} />
          <Toggle id="C_PITOT" h={46} />
        </div>
        <div className="c-abs c-bottom" style={{ left: 810, top: 418 }}>
          <FlapLever />
          <TrimWheel />
          <Rotary id="C_FUEL_SEL" size={34} />
          <Toggle id="C_FUEL_SHUTOFF" h={46} />
          <Toggle id="C_PARK" h={46} />
          <ControlLock />
        </div>
      </div>
    </div>
  );
}
