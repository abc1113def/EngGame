import { useRef } from 'react';
import { FcuKnob, Mod, Pb, Rotary, Row, Toggle, Wrap } from '../controls/Controls';
import { EWD } from '../displays/EWD';
import { ISIS } from '../displays/ISIS';
import { ND } from '../displays/ND';
import { PFD } from '../displays/PFD';
import { SD } from '../displays/SD';
import { UI } from '../i18n/ui';
import { KT } from '../sim/flight';
import { GEO, SCN } from '../sim/scenario';
import { sim } from '../sim/sim';
import { useSim, useSimFrame, useT } from '../ui/hooks';

const pad = (n: number, w: number) => String(Math.round(n)).padStart(w, '0');

function Win({ label, text, dot, w = 96 }: { label: string; text: string; dot?: boolean; w?: number }) {
  return (
    <div className="fcu-win-wrap">
      <div className="fcu-lbl">{label}</div>
      <div className="fcu-win" style={{ width: w }}>
        {text}
        {dot && <span className="fcu-dot">●</span>}
      </div>
    </div>
  );
}

function FcuWindowsSlot({ i }: { i: number }) {
  const p = useSim((s) => s.elec.dcBat);
  const spd = useSim((s) => (s.fms.v2 != null && s.ac.onGround ? null : s.fcu.spd));
  const hdgMan = useSim((s) => !!s.fms.sid);
  const hdg = useSim((s) => s.fcu.hdg);
  const alt = useSim((s) => s.fcu.alt);
  if (i === 0) return <Win label="SPD     MACH" text={!p ? '' : spd == null ? '---' : pad(spd, 3)} dot={p && spd == null} />;
  if (i === 1) return <Win label="HDG     LAT" text={!p ? '' : hdgMan ? '---' : pad(hdg, 3)} dot={p && hdgMan} />;
  if (i === 2) return <Win label="ALT   LVL/CH" text={!p ? '' : String(alt).padStart(5, ' ')} w={120} />;
  return <Win label="V/S" text={!p ? '' : '-----'} />;
}

function BaroWin() {
  const p = useSim((s) => s.elec.dcBat);
  const std = useSim((s) => s.fcu.baroStd);
  const baro = useSim((s) => s.fcu.baro);
  const unit = useSim((s) => s.sw.BARO_UNIT);
  const txt = !p ? '' : std ? 'Std' : unit === 1 ? String(baro) : (baro * 0.02953).toFixed(2);
  return (
    <div className="fcu-win-wrap">
      <div className="fcu-lbl">{std ? '' : 'QNH'}</div>
      <div className="fcu-win" style={{ width: 80 }}>
        {txt}
      </div>
    </div>
  );
}

function Glareshield() {
  return (
    <div className="glare">
      <Mod x={10} y={10} w={120} h={170} className="dark">
        <div className="col" style={{ gap: 6, alignItems: 'center' }}>
          <Pb id="MASTER_WARN" w={70} h={42} noLabel />
          <Pb id="MASTER_CAUT" w={70} h={42} noLabel />
          <Pb id="CHRONO" w={46} h={24} />
        </div>
      </Mod>
      <Mod x={140} y={10} w={420} h={170} className="dark" title="EFIS CTL">
        <Row gap={6} style={{ justifyContent: 'center' }}>
          <Pb id="EFIS_CSTR" w={40} h={26} />
          <Pb id="EFIS_WPT" w={40} h={26} />
          <Pb id="EFIS_VORD" w={40} h={26} />
          <Pb id="EFIS_NDB" w={40} h={26} />
          <Pb id="EFIS_ARPT" w={40} h={26} />
          <div style={{ width: 8 }} />
          <Pb id="FD" w={40} h={30} />
          <Pb id="LS" w={40} h={30} />
        </Row>
        <Row gap={6} style={{ justifyContent: 'center', alignItems: 'flex-end', marginTop: 2 }}>
          <div className="col" style={{ alignItems: 'center' }}>
            <BaroWin />
            <Row gap={4} style={{ alignItems: 'center' }}>
              <FcuKnob id="BARO_STD" act="BARO_KNOB" size={40} />
              <Pb id="BARO_STD" w={34} h={22} inner="PULL STD" noLabel />
            </Row>
          </div>
          <Toggle id="BARO_UNIT" h={36} />
          <Rotary id="ND_MODE" size={26} />
          <Rotary id="ND_RANGE" size={26} />
        </Row>
      </Mod>
      <Mod x={570} y={10} w={880} h={170} className="dark" title="FCU">
        <Row gap={16} style={{ justifyContent: 'center', alignItems: 'flex-start', marginTop: 4 }}>
          <div className="col" style={{ alignItems: 'center', gap: 4 }}>
            <FcuWindowsSlot i={0} />
            <Row gap={8} style={{ alignItems: 'center' }}>
              <Pb id="SPD_MACH" w={40} h={22} noLabel inner="SPD MACH" />
              <FcuKnob id="SPD_KNOB" />
            </Row>
          </div>
          <div className="col" style={{ alignItems: 'center', gap: 4 }}>
            <FcuWindowsSlot i={1} />
            <Row gap={8} style={{ alignItems: 'center' }}>
              <FcuKnob id="HDG_KNOB" />
              <Pb id="LOC" w={40} h={30} />
            </Row>
          </div>
          <div className="col" style={{ alignItems: 'center', gap: 6, marginTop: 14 }}>
            <Row gap={8}>
              <Pb id="AP1" w={46} h={30} />
              <Pb id="AP2" w={46} h={30} />
            </Row>
            <Pb id="ATHR" w={46} h={30} />
          </div>
          <div className="col" style={{ alignItems: 'center', gap: 4 }}>
            <FcuWindowsSlot i={2} />
            <Row gap={8} style={{ alignItems: 'center' }}>
              <Toggle id="ALT_INC" h={34} />
              <FcuKnob id="ALT_KNOB" />
              <Pb id="EXPED" w={40} h={30} />
            </Row>
          </div>
          <div className="col" style={{ alignItems: 'center', gap: 4 }}>
            <FcuWindowsSlot i={3} />
            <Row gap={8} style={{ alignItems: 'center' }}>
              <FcuKnob id="VS_KNOB" />
              <Pb id="APPR" w={40} h={30} />
            </Row>
          </div>
        </Row>
      </Mod>
      <Mod x={1460} y={10} w={130} h={170} className="dark">
        <div className="col" style={{ gap: 6, alignItems: 'center' }}>
          <Pb id="MASTER_WARN" w={70} h={42} noLabel />
          <Pb id="MASTER_CAUT" w={70} h={42} noLabel />
          <div className="light-box" style={{ width: 70, height: 26 }}>
            <div className="leg one c-red">AUTO LAND</div>
          </div>
        </div>
      </Mod>
    </div>
  );
}

// ============================ шасси / тормоза ============================
function GearLever() {
  const v = useSim((s) => s.sw.GEAR);
  return (
    <Wrap id="GEAR" className="gearw">
      <div className="pb-label">L/G</div>
      <div className="gear-slot" onClick={() => sim.setSw('GEAR', v ? 0 : 1)}>
        <div className="gear-u">UP</div>
        <div className="gear-d">DOWN</div>
        <div className="gear-handle" style={{ top: v ? 92 : 8 }}>
          <div className="gear-wheel" />
        </div>
      </div>
    </Wrap>
  );
}

function GearLights() {
  const s = useSimFrame(10);
  const p = s.elec.dcBat;
  const g = s.ac.gear;
  const lever = s.sw.GEAR;
  const tri = (k: string) => {
    if (!p) return <div key={k} className="gtri" />;
    const down = g > 0.99;
    const transit = g > 0.01 && g < 0.99;
    return (
      <div key={k} className="gtri">
        {transit && <span className="unlk">UNLK</span>}
        {down && <span className="dn">▼</span>}
      </div>
    );
  };
  return (
    <div className="gear-lights">
      <div className="pb-label">LDG GEAR</div>
      <div className="gl-row">{tri('n')}</div>
      <div className="gl-row">
        {tri('l')}
        {tri('r')}
      </div>
      {p && lever === 0 && g > 0.01 && <div className="gl-arrow">▲</div>}
    </div>
  );
}

function BrakeGauge() {
  const s = useSimFrame(10);
  const acc = s.hyd.accu;
  const L = s.hyd.brkL;
  const R = s.hyd.brkR;
  const ang = (v: number, max: number, a0: number, a1: number) => a0 + ((a1 - a0) * Math.max(0, Math.min(max, v))) / max;
  const needle = (a: number, cx: number, cy: number, len: number) => {
    const r = ((a - 90) * Math.PI) / 180;
    return <line x1={cx} y1={cy} x2={cx + Math.cos(r) * len} y2={cy + Math.sin(r) * len} stroke="#fff" strokeWidth={3} strokeLinecap="round" />;
  };
  return (
    <div className="brk-gauge">
      <svg viewBox="0 0 160 130" width={160} height={130}>
        <circle cx={80} cy={70} r={60} fill="#0b0d10" stroke="#5c6a75" strokeWidth={3} />
        <text x={80} y={26} fill="#ddd" fontSize={9} textAnchor="middle">
          ACCU PRESS
        </text>
        <path d="M 52 40 A 40 40 0 0 1 108 40" stroke="#2ecc71" strokeWidth={5} fill="none" opacity={0.85} />
        {needle(ang(acc, 4000, -60, 60), 80, 76, 44)}
        <text x={80} y={100} fill="#ddd" fontSize={9} textAnchor="middle">
          BRAKES
        </text>
        <text x={44} y={118} fill="#aaa" fontSize={8}>
          L
        </text>
        <text x={110} y={118} fill="#aaa" fontSize={8}>
          R
        </text>
        {needle(ang(L, 3000, 200, 120), 62, 108, 24)}
        {needle(ang(R, 3000, 160, 240), 98, 108, 24)}
        <text x={80} y={128} fill="#888" fontSize={7} textAnchor="middle">
          PSI ×1000
        </text>
      </svg>
    </div>
  );
}

function GearPanel() {
  return (
    <Mod x={420} y={590} w={400} h={350} title="L/G · BRAKES">
      <Row gap={14} style={{ alignItems: 'flex-start', justifyContent: 'center' }}>
        <GearLever />
        <div className="col" style={{ gap: 8, alignItems: 'center' }}>
          <GearLights />
          <Toggle id="ASKID_NWS" h={40} />
        </div>
        <div className="col" style={{ gap: 6, alignItems: 'center' }}>
          <div className="pb-label">AUTO BRK</div>
          <Pb id="AB_LO" noLabel inner="" w={52} h={34} />
          <div className="pb-label">LO</div>
          <Pb id="AB_MED" noLabel w={52} h={34} />
          <div className="pb-label">MED</div>
          <Pb id="AB_MAX" noLabel w={52} h={34} />
          <div className="pb-label">MAX</div>
        </div>
      </Row>
      <Row gap={10} style={{ justifyContent: 'center', alignItems: 'flex-end', marginTop: -8 }}>
        <BrakeGauge />
        <Pb id="BRK_FAN" w={44} h={34} />
        <Pb id="TERR_ND" w={44} h={34} />
      </Row>
    </Mod>
  );
}

// ============================ ручка управления ============================
function Sidestick() {
  const ref = useRef<HTMLDivElement>(null);
  const s = useSimFrame(20);
  const sp = s.ac.stickP;
  const sr = s.ac.stickR;
  const rud = s.ac.rudder;
  const t = useT();
  const onDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const move = (ev: MouseEvent) => {
      const r = ref.current!.getBoundingClientRect();
      const x = ((ev.clientX - r.left) / r.width) * 2 - 1;
      const y = ((ev.clientY - r.top) / r.height) * 2 - 1;
      sim.s.flags.stickMouse = true;
      sim.s.ac.stickR = Math.max(-1, Math.min(1, x));
      sim.s.ac.stickP = Math.max(-1, Math.min(1, y)); // вниз = на себя
    };
    const up = () => {
      sim.s.flags.stickMouse = false;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    move(e.nativeEvent);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  return (
    <Mod x={30} y={590} w={380} h={350} title="SIDESTICK · RUDDER">
      <div className="stick-wrap">
        <div className="stick-area" ref={ref} onMouseDown={onDown}>
          <div className="stick-cross" />
          <div className="stick-dot" style={{ left: `${50 + sr * 45}%`, top: `${50 + sp * 45}%` }} />
          <div className="stick-lbl top">{t({ ru: 'от себя', en: 'push' })}</div>
          <div className="stick-lbl bot">{t({ ru: 'на себя', en: 'pull' })}</div>
        </div>
        <div className="rud-bar">
          <div className="rud-dot" style={{ left: `${50 + rud * 45}%` }} />
          <span className="rud-l">Z</span>
          <span className="rud-r">X</span>
        </div>
        <div className="stick-help">{t({ ru: 'Перетаскивайте мышью или ↑↓←→ / WASD, педали — Z/X', en: 'Drag with the mouse or use ↑↓←→ / WASD, rudder Z/X' })}</div>
      </div>
    </Mod>
  );
}

// ============================ ECAM CONTROL PANEL ============================
export function Ecp({ x, y }: { x: number; y: number }) {
  const pages = ['ENG', 'BLEED', 'PRESS', 'ELEC', 'HYD', 'FUEL', 'APU', 'COND', 'DOOR', 'WHEEL', 'F/CTL', 'ALL'];
  const id = (p: string) => 'ECP_' + p.replace(/[^A-Z]/g, '');
  return (
    <Mod x={x} y={y} w={360} h={250} title="ECAM">
      <Row gap={8} style={{ justifyContent: 'center', marginTop: 4 }}>
        <Pb id="ECP_TOCONFIG" w={66} h={30} noLabel inner="T.O CONFIG" />
        <Pb id="ECP_EMERCANC" w={66} h={30} noLabel inner="EMER CANC" />
        <Pb id="ECP_CLR" w={56} h={30} noLabel inner="CLR" />
      </Row>
      <div className="ecp-grid">
        {pages.map((p) => (
          <Pb key={p} id={id(p)} w={50} h={28} noLabel inner={p} className="ecp-pb" />
        ))}
      </div>
      <Row gap={8} style={{ justifyContent: 'center' }}>
        <Pb id="ECP_STS" w={56} h={28} noLabel inner="STS" />
        <Pb id="ECP_RCL" w={56} h={28} noLabel inner="RCL" />
      </Row>
    </Mod>
  );
}

// ============================ часы ============================
function Clock() {
  const s = useSimFrame(4);
  const t = 10 * 3600 + 42 * 60 + s.t;
  const hh = Math.floor(t / 3600) % 24;
  const mm = Math.floor(t / 60) % 60;
  const ss = Math.floor(t) % 60;
  const p = s.elec.dcBat;
  return (
    <div className="clock" style={{ left: 1425, top: 200 }}>
      <div className="pb-label">CLOCK · UTC</div>
      <div className="clock-face">{p ? `${pad(hh, 2)}:${pad(mm, 2)}` : ''}</div>
      <div className="clock-sec">{p ? pad(ss, 2) : ''}</div>
      <div className="clock-et">{p ? `ET ${pad(Math.floor(s.t / 60), 2)}:${pad(Math.floor(s.t) % 60, 2)}` : ''}</div>
    </div>
  );
}

// ============================ EFB: схема аэродрома ============================
function Efb() {
  const s = useSimFrame(10);
  const t = useT();
  // схема: ось ВПП горизонтально, перпендикуляр растянут для читаемости
  const toScr = (x: number, y: number) => {
    const along = x * GEO.rwyDir.x + y * GEO.rwyDir.y;
    const side = x * GEO.rwyDir.y - y * GEO.rwyDir.x;
    return [18 + along * 0.098, 58 + side * 0.36];
  };
  const thr = toScr(GEO.thr.x, GEO.thr.y);
  const end = toScr(GEO.thr.x + GEO.rwyDir.x * SCN.rwyLen, GEO.thr.y + GEO.rwyDir.y * SCN.rwyLen);
  const path = [GEO.stand, GEO.pushEnd, ...GEO.taxi.slice(1), ...GEO.lineup.slice(1)].map((p) => toScr(p.x, p.y).join(',')).join(' ');
  const hp = toScr(GEO.taxi[GEO.taxi.length - 1].x, GEO.taxi[GEO.taxi.length - 1].y);
  const [ax, ay] = toScr(s.ac.x, s.ac.y);
  const hdgScr = 90 + s.ac.hdg - 323;
  const gs = Math.abs(s.ac.gs * KT);
  const showDist = s.gnd.phase === 'taxi' || s.gnd.phase === 'holding' || s.gnd.phase === 'pushdone';
  return (
    <Mod x={1230} y={660} w={350} h={280} title={t(UI.taxiMap)} className="efb">
      <svg viewBox="0 0 350 250" width={350} height={232} style={{ marginTop: -4 }}>
        <rect x={0} y={0} width={350} height={250} fill="#1d2329" />
        <line x1={thr[0]} y1={thr[1]} x2={end[0]} y2={end[1]} stroke="#55606a" strokeWidth={14} />
        <line x1={thr[0]} y1={thr[1]} x2={end[0]} y2={end[1]} stroke="#fff" strokeWidth={1} strokeDasharray="6 6" />
        <text x={thr[0] + 2} y={thr[1] - 10} fill="#fff" fontSize={10}>
          32L
        </text>
        <text x={end[0] - 26} y={end[1] - 10} fill="#fff" fontSize={10}>
          14R
        </text>
        <polyline points={path} fill="none" stroke="#e8c547" strokeWidth={2} opacity={0.75} />
        <line x1={hp[0] - 8} y1={hp[1] - 4} x2={hp[0] + 8} y2={hp[1] + 4} stroke="#ff4d4d" strokeWidth={3} />
        <text x={hp[0] + 8} y={hp[1] + 14} fill="#ff8080" fontSize={9}>
          HOLD 32L
        </text>
        <g transform={`translate(${ax},${ay}) rotate(${hdgScr})`}>
          <path d="M0,-9 L5,6 L0,3 L-5,6 Z" fill="#4fd1ff" stroke="#000" strokeWidth={0.8} />
        </g>
        <text x={8} y={200} fill="#9fe" fontSize={13}>
          GS {gs.toFixed(0)} KT
        </text>
        <text x={8} y={216} fill="#ccc" fontSize={11}>
          {s.gnd.phase.toUpperCase()}
        </text>
        {showDist && (
          <text x={8} y={232} fill={s.gnd.taxiPath < 80 ? '#ff8080' : '#ccc'} fontSize={12}>
            {Math.max(0, Math.round(s.gnd.taxiPath))} m {t(UI.toHold)}
          </text>
        )}
        {s.gnd.phase === 'runway' && (
          <text x={8} y={232} fill="#ccc" fontSize={12}>
            RWY {Math.max(0, Math.round(SCN.rwyLen - s.ac.dist))} m
          </text>
        )}
        <text x={300} y={200} fill="#888" fontSize={9}>
          STAND 12
        </text>
      </svg>
    </Mod>
  );
}

export function Front() {
  return (
    <div className="canvas front" style={{ width: 1600, height: 960 }}>
      <Glareshield />
      <div className="du" style={{ left: 30, top: 200, width: 370, height: 370 }}>
        <PFD />
      </div>
      <div className="du" style={{ left: 430, top: 200, width: 370, height: 370 }}>
        <ND />
      </div>
      <div className="du" style={{ left: 840, top: 200, width: 370, height: 370 }}>
        <EWD />
      </div>
      <div className="du" style={{ left: 840, top: 580, width: 370, height: 370 }}>
        <SD />
      </div>
      <div className="du isis" style={{ left: 1235, top: 200, width: 175, height: 175 }}>
        <ISIS />
      </div>
      <Clock />
      <Ecp x={1230} y={395} />
      <Efb />
      <Sidestick />
      <GearPanel />
    </div>
  );
}
