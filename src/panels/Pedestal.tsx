import { useRef } from 'react';
import { Digits, FcuKnob, Mod, Pb, Rotary, Row, Toggle, Wrap } from '../controls/Controls';
import { EWD } from '../displays/EWD';
import { MCDU } from '../displays/MCDU';
import { SD } from '../displays/SD';
import { UI } from '../i18n/ui';
import { TLA, thrustLimits } from '../sim/engines';
import { freqStr } from '../sim/ground';
import { GEO_LFPO, SCN, SCN_ARR } from '../sim/scenario';
import { speeds } from '../sim/flight';
import { sim } from '../sim/sim';
import { useSim, useSimFrame, useT } from '../ui/hooks';
import { Ecp } from './Front';

// ============================ РУД ============================
const TL_H = 232;
const tlaToY = (v: number) => ((TLA.TOGA - v) / (TLA.TOGA - TLA.REV)) * TL_H;
const yToTla = (y: number) => TLA.TOGA - (y / TL_H) * (TLA.TOGA - TLA.REV);

function ThrustLevers() {
  const ref = useRef<HTMLDivElement>(null);
  const t1 = useSim((s) => s.sw.TL1);
  const t2 = useSim((s) => s.sw.TL2);
  const down = (which: 0 | 1 | 2) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const w: 0 | 1 | 2 = e.shiftKey ? which : 0;
    const move = (ev: MouseEvent) => {
      const r = ref.current!.getBoundingClientRect();
      const scale = r.height / TL_H;
      sim.setThrust(yToTla((ev.clientY - r.top) / scale), w);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      sim.ui('detent');
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    move(e.nativeEvent);
  };
  const marks: [number, string][] = [
    [TLA.TOGA, 'TOGA'],
    [TLA.FLX, 'FLX/MCT'],
    [TLA.CL, 'CL'],
    [TLA.IDLE, 'IDLE'],
    [TLA.REV, 'MAX REV'],
  ];
  return (
    <Wrap id="TL1" className="tlw">
      <div className="pb-label">THRUST LEVERS</div>
      <div className="tl-track" ref={ref} style={{ height: TL_H }} onMouseDown={down(0)} onWheel={(e) => sim.stepThrust(e.deltaY < 0 ? 1 : -1)}>
        {marks.map(([v, l]) => (
          <div key={l} className="tl-mark" style={{ top: tlaToY(v) }}>
            <span>{l}</span>
          </div>
        ))}
        <div className="tl-lever l1" style={{ top: tlaToY(t1) - 14 }} onMouseDown={down(1)}>
          1
        </div>
        <div className="tl-lever l2" style={{ top: tlaToY(t2) - 14 }} onMouseDown={down(2)}>
          2
        </div>
      </div>
      <div className="tl-val">
        TLA {t1.toFixed(0)}° / {t2.toFixed(0)}°
      </div>
    </Wrap>
  );
}

function N1Hint() {
  const s = useSimFrame(5);
  const lim = thrustLimits(s);
  return (
    <div className="tl-hint">
      N1 {s.eng[0].n1.toFixed(1)} / {s.eng[1].n1.toFixed(1)}
      <br />
      <span style={{ opacity: 0.6 }}>TOGA {lim.toga.toFixed(1)}</span>
    </div>
  );
}

function PosLever({ id, labels, title, h = 200 }: { id: string; labels: string[]; title: string; h?: number }) {
  const v = useSim((s) => s.sw[id]);
  const n = labels.length;
  return (
    <Wrap id={id} className="poslever">
      <div className="pb-label">{title}</div>
      <div className="pl-track" style={{ height: h }} onWheel={(e) => sim.setSw(id, v + (e.deltaY > 0 ? 1 : -1))}>
        {labels.map((l, i) => (
          <div key={i} className={`pl-pos ${i === v ? 'sel' : ''}`} style={{ top: (i / (n - 1)) * (h - 26) }} onClick={() => sim.setSw(id, i)}>
            <span>{l}</span>
          </div>
        ))}
        <div className="pl-handle" style={{ top: (v / (n - 1)) * (h - 26) }} />
      </div>
    </Wrap>
  );
}

function SpeedBrake() {
  const v = useSim((s) => s.sw.SPD_BRK); // 0 ARM 1 RET 2 1/2 3 FULL
  const h = 200;
  const pos = (i: number) => (i <= 1 ? 0 : i === 2 ? (h - 26) / 2 : h - 26);
  return (
    <Wrap id="SPD_BRK" className="poslever">
      <div className="pb-label">SPEED BRAKE</div>
      <div className="pl-track" style={{ height: h }}>
        <div className={`pl-pos ${v <= 1 ? 'sel' : ''}`} style={{ top: 0 }} onClick={() => sim.setSw('SPD_BRK', v === 1 ? 0 : 1)}>
          <span>{v === 0 ? 'ARM ▲' : 'RET'}</span>
        </div>
        <div className={`pl-pos ${v === 2 ? 'sel' : ''}`} style={{ top: (h - 26) / 2 }} onClick={() => sim.setSw('SPD_BRK', 2)}>
          <span>1/2</span>
        </div>
        <div className={`pl-pos ${v === 3 ? 'sel' : ''}`} style={{ top: h - 26 }} onClick={() => sim.setSw('SPD_BRK', 3)}>
          <span>FULL</span>
        </div>
        <div className={`pl-handle ${v === 0 ? 'armed' : ''}`} style={{ top: pos(v) }} />
      </div>
      <div className="pl-note">{v === 0 ? 'GND SPLRS ARMED' : ''}</div>
    </Wrap>
  );
}

function TrimWheel() {
  const trim = useSim((s) => s.ac.pitchTrim);
  const onClick = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    sim.knob('PITCH_TRIM', e.clientY - r.top < r.height / 2 ? -1 : 1);
  };
  const off = (trim * 9) % 18;
  return (
    <Wrap id="PITCH_TRIM" className="trimw">
      <div className="pb-label">PITCH TRIM</div>
      <div className="trim-wheel" style={{ height: 170 }} onClick={onClick} onWheel={(e) => sim.knob('PITCH_TRIM', e.deltaY < 0 ? -1 : 1)}>
        <div className="trim-stripes" style={{ backgroundPositionY: `${off}px` }} />
        <div className="trim-dn">NOSE DN</div>
        <div className="trim-up">NOSE UP</div>
      </div>
      <div className="trim-ind">
        <div className="trim-scale">
          <div className="trim-green" />
          <div className="trim-ptr" style={{ top: `${50 - (trim / 13.5) * 45}%` }} />
        </div>
        <div className="trim-val">
          {trim >= 0 ? 'UP' : 'DN'} {Math.abs(trim).toFixed(1)}
        </div>
      </div>
    </Wrap>
  );
}

function RudTrim() {
  const v = useSim((s) => s.ac.rudTrim);
  const p = useSim((s) => s.elec.dcBat);
  return (
    <div className="col" style={{ alignItems: 'center', gap: 4 }}>
      <div className="pb-label">RUD TRIM</div>
      <Digits text={p ? `${v < 0 ? 'L' : 'R'} ${Math.abs(v).toFixed(1)}` : ''} color="green" w={70} />
      <Row gap={6} style={{ alignItems: 'center' }}>
        <FcuKnob id="RUD_TRIM" size={36} />
        <Pb id="RUD_TRIM_RESET" w={42} h={24} inner="RESET" noLabel />
      </Row>
    </div>
  );
}

function ParkBrake() {
  const v = useSim((s) => s.sw.PARK_BRK);
  return (
    <Wrap id="PARK_BRK" className="parkw">
      <div className="pb-label">PARK BRK</div>
      <div className="park" onClick={() => sim.setSw('PARK_BRK', v ? 0 : 1)}>
        <div className="park-handle" style={{ transform: `rotate(${v ? 90 : 0}deg)` }} />
        <span className="park-off">OFF</span>
        <span className="park-on">ON</span>
      </div>
    </Wrap>
  );
}

function GravityCrank() {
  const turns = useSim((s) => (s.flags.gravityCrank as number) ?? 0);
  return (
    <Wrap id="GRAVITY_CRANK" className="crankw">
      <div className="pb-label">GRVTY GEAR EXTN</div>
      <div className="crank" onClick={() => sim.press('GRAVITY_CRANK')}>
        <div className="crank-arm" style={{ transform: `rotate(${Math.min(3, turns) * 120}deg)` }} />
      </div>
      <div className="crank-n">{Math.min(3, turns)}/3 ↻</div>
    </Wrap>
  );
}

function Master({ n }: { n: 1 | 2 }) {
  const id = `ENG${n}_MASTER`;
  const v = useSim((s) => s.sw[id]);
  const lt = useSim((s) => s.ann[`ENG${n}_MLT`] | 0);
  return (
    <div className="col" style={{ alignItems: 'center', gap: 4 }}>
      <div className="eng-lts">
        <div className={`leg one c-red ${lt & 1 ? 'on' : ''}`}>FIRE</div>
        <div className={`leg one c-amber ${lt & 2 ? 'on' : ''}`}>FAULT</div>
      </div>
      <Wrap id={id} className="masterw">
        <div className="pb-label">MASTER {n}</div>
        <div className="master" onClick={() => sim.setSw(id, v ? 0 : 1)}>
          <span className="m-on">ON</span>
          <div className="master-sw" style={{ top: v ? 6 : 50 }} />
          <span className="m-off">OFF</span>
        </div>
      </Wrap>
    </div>
  );
}

function EngPanel() {
  return (
    <Mod x={840} y={355} w={300} h={240} title="ENG">
      <Row gap={16} style={{ justifyContent: 'center', alignItems: 'flex-end', marginTop: 6 }}>
        <Master n={1} />
        <Rotary id="ENG_MODE" size={36} labels={['CRANK', 'NORM', 'IGN/START']} />
        <Master n={2} />
      </Row>
      <div className="eng-note">ENG 1 · MODE · ENG 2</div>
    </Mod>
  );
}

// ============================ RMP ============================
function Rmp() {
  const s = useSimFrame(10);
  const on = s.sw.RMP_ON === 1 && s.elec.dcEss;
  return (
    <Mod x={1160} y={20} w={420} h={230} title="RMP 1">
      <Row gap={12} style={{ justifyContent: 'center', marginTop: 6 }}>
        <div className="col" style={{ alignItems: 'center' }}>
          <div className="pb-label">ACTIVE</div>
          <Digits text={on ? freqStr(s.radio.active) : ''} color="amber" w={110} />
        </div>
        <Pb id="RMP_XFER" w={46} h={30} noLabel inner="⇄" />
        <div className="col" style={{ alignItems: 'center' }}>
          <div className="pb-label">STBY/CRS</div>
          <Digits text={on ? freqStr(s.radio.stby) : ''} color="amber" w={110} />
        </div>
      </Row>
      <Row gap={16} style={{ justifyContent: 'center', alignItems: 'center', marginTop: 8 }}>
        <Toggle id="RMP_ON" h={44} />
        <div className="col" style={{ alignItems: 'center' }}>
          <FcuKnob id="RMP_KNOB" size={58} ring />
          <div className="pb-label" style={{ fontSize: 9 }}>
            MHz ⟳ outer · kHz ⟳ inner
          </div>
        </div>
        <div className="col" style={{ gap: 4 }}>
          <div className="rmp-vhf sel">VHF 1</div>
          <div className="rmp-vhf">VHF 2</div>
          <div className="rmp-vhf">VHF 3</div>
        </div>
      </Row>
    </Mod>
  );
}

function AtcPanel() {
  const s = useSimFrame(10);
  const on = s.elec.dcEss;
  const code = s.radio.xpdrEntry ? s.radio.xpdrEntry.padEnd(4, '-') : s.radio.xpdrCode;
  return (
    <Mod x={20} y={730} w={440} h={215} title="ATC / TCAS">
      <Row gap={10} style={{ justifyContent: 'center', alignItems: 'flex-start' }}>
        <div className="col" style={{ alignItems: 'center', gap: 4 }}>
          <Digits text={on ? code : ''} color="amber" w={80} />
          <div className="xpdr-keys">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <Pb key={i} id={`XPDR_${i}`} w={30} h={24} noLabel inner={String(i)} />
            ))}
            <Pb id="XPDR_CLR" w={30} h={24} noLabel inner="CLR" />
            <Pb id="XPDR_IDENT" w={46} h={24} noLabel inner={s.radio.ident > 0 ? 'IDENT●' : 'IDENT'} />
          </div>
        </div>
        <Rotary id="XPDR_MODE" size={30} />
        <div className="col" style={{ gap: 2 }}>
          <Rotary id="TCAS_MODE" size={30} />
          <Toggle id="ALT_RPTG" h={34} />
        </div>
      </Row>
    </Mod>
  );
}

function WxPanel() {
  return (
    <Mod x={1160} y={260} w={420} h={130} title="WX RADAR">
      <Row gap={22} style={{ justifyContent: 'center' }}>
        <Rotary id="WX_SYS" size={28} />
        <Toggle id="WX_PWS" h={40} />
        <Rotary id="WX_MODE" size={28} />
      </Row>
    </Mod>
  );
}

function ArrCard() {
  const s = useSimFrame(2);
  const t = useT();
  const a = s.atc;
  const sp = speeds(s);
  return (
    <div className="paper" style={{ left: 1160, top: 405, width: 420, height: 540 }}>
      <div className="paper-clip" />
      <div className="paper-h">{t({ ru: 'Брифинг захода', en: 'Approach briefing' })}</div>
      <pre>
        {`LFPO PARIS ORLY   ELEV ${GEO_LFPO.elev} FT
ILS RWY ${SCN_ARR.rwy}   ${SCN_ARR.ils}   CRS ${GEO_LFPO.rwyHdg}°
GS 3.0°   DA ${SCN_ARR.da} FT (BARO)
RWY ${GEO_LFPO.rwyLen} M   EXIT W5 / W7
MISSED APPR: CLIMB RWY HDG 4000 FT

LDG CONF FULL   AUTO BRK LO/MED
VLS ${Math.round(sp.vlsFull)}   VAPP ${Math.round(sp.vapp)}   GW ${(s.ac.gw / 1000).toFixed(1)} T
STAND ${SCN_ARR.stand}`}
      </pre>
      <div className="paper-h">{t(UI.freqs)}</div>
      <pre>{`ATIS ${freqStr(SCN_ARR.freqs.ATIS)}   APP ${freqStr(SCN_ARR.freqs.APP)}
TWR  ${freqStr(SCN_ARR.freqs.TWR)}   GND ${freqStr(SCN_ARR.freqs.GND)}`}</pre>
      <div className="paper-h">ATIS / ATC</div>
      <pre className="hand">
        {(a.arrAtis ? `INFO ${a.arrLetter}  ${a.arrWindDir}/${String(a.arrWindSpd).padStart(2, '0')}  Q${a.arrQnh}  TL60` : `ATIS — ${t(UI.notYet)}`) +
          '\n' +
          (a.ldgClear ? `CLRD TO LAND RWY ${SCN_ARR.rwy}` : a.appClear ? `CLRD ILS ${SCN_ARR.rwy}` : '')}
      </pre>
    </div>
  );
}

function Loadsheet() {
  const s = useSimFrame(2);
  const t = useT();
  const a = s.atc;
  if (s.leg === 'arr') return <ArrCard />;
  return (
    <div className="paper" style={{ left: 1160, top: 405, width: 420, height: 540 }}>
      <div className="paper-clip" />
      <div className="paper-h">{t(UI.ofp)}</div>
      <pre>
        {`FLT ${SCN.callsign}   ${SCN.from} → ${SCN.to}   ALTN ${SCN.altn}
RTE ${SCN.sid} ${SCN.route.slice(0, -1).join(' ')}
CRZ FL${SCN.crzFl}   CI ${SCN.ci}

ZFW ${SCN.zfw.toFixed(1)} T   ZFWCG ${SCN.zfwcg.toFixed(1)} %
BLOCK FUEL ${SCN.block.toFixed(1)} T   TAXI ${SCN.taxiFuel.toFixed(1)}
TOW ${(SCN.zfw + SCN.block - SCN.taxiFuel).toFixed(1)} T`}
      </pre>
      <div className="paper-h">{t(UI.todata)} — RWY {SCN.rwy}</div>
      <pre>
        {`CONF ${SCN.toFlaps}+F   FLEX ${SCN.flex}°C   THS UP${SCN.ths}
V1 ${SCN.v1}   VR ${SCN.vr}   V2 ${SCN.v2}
TRANS ALT ${SCN.transAlt}   THR RED/ACC ${s.fms.thrRed}/${s.fms.accAlt}`}
      </pre>
      <div className="paper-h">{t(UI.freqs)}</div>
      <pre>{`ATIS 123.125   DEL 121.900
GND  121.700   TWR 118.100`}</pre>
      <div className="paper-h">ATIS / ATC</div>
      <pre className="hand">
        {(a.atis ? `INFO ${a.atisLetter}  ${a.windDir}/${String(a.windSpd).padStart(2, '0')}  T${a.oat}  Q${a.qnh}` : `ATIS — ${t(UI.notYet)}`) +
          '\n' +
          (a.clearance ? `CLR: ${SCN.sid} RWY ${SCN.rwy}  ${a.initAlt} FT  SQ ${a.squawk}` : `CLR — ${t(UI.notYet)}`)}
      </pre>
    </div>
  );
}

export function Pedestal() {
  return (
    <div className="canvas ped" style={{ width: 1600, height: 960 }}>
      <div className="mcdu-slot" style={{ left: 20, top: 20 }}>
        <MCDU />
      </div>
      <AtcPanel />
      <div className="du" style={{ left: 480, top: 20, width: 325, height: 325 }}>
        <EWD />
      </div>
      <div className="du" style={{ left: 815, top: 20, width: 325, height: 325 }}>
        <SD />
      </div>
      <Ecp x={480} y={355} />
      <EngPanel />
      <Mod x={480} y={605} w={660} h={340} title="">
        <Row gap={18} style={{ alignItems: 'flex-start', justifyContent: 'center' }}>
          <SpeedBrake />
          <TrimWheel />
          <div className="col" style={{ alignItems: 'center' }}>
            <ThrustLevers />
            <N1Hint />
          </div>
          <PosLever id="FLAPS" title="FLAPS" labels={['0', '1', '2', '3', 'FULL']} />
          <div className="col" style={{ gap: 14, alignItems: 'center' }}>
            <ParkBrake />
            <RudTrim />
            <GravityCrank />
          </div>
        </Row>
      </Mod>
      <Rmp />
      <WxPanel />
      <Loadsheet />
    </div>
  );
}
