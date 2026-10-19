import type { ReactNode } from 'react';
import { sdPage, statusLines } from '../sim/ecam';
import { sdPower } from '../sim/systems';
import type { SimState } from '../sim/types';
import { useSimFrame } from '../ui/hooks';
import { C, Screen, SdTitle, T, arcPath, p2, polar, duMode, utc } from './common';

const col = (ok: boolean) => (ok ? C.g : C.a);

function Box({ x, y, w, h, title, ok, children }: { x: number; y: number; w: number; h: number; title: string; ok: boolean; children?: ReactNode }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill="none" stroke={C.w} strokeWidth={1.5} />
      <T x={x + w / 2} y={y + 18} a="middle" c={ok ? C.w : C.a} s={15}>
        {title}
      </T>
      {children}
    </g>
  );
}

function Valve({ x, y, open, ok = true, vertical = true }: { x: number; y: number; open: boolean; ok?: boolean; vertical?: boolean }) {
  const c = ok ? C.g : C.a;
  const inline = vertical ? open : !open;
  return (
    <g>
      <circle cx={x} cy={y} r={11} fill="#000" stroke={c} strokeWidth={2} />
      {inline ? <line x1={x} y1={y - 11} x2={x} y2={y + 11} stroke={c} strokeWidth={2.5} /> : <line x1={x - 11} y1={y} x2={x + 11} y2={y} stroke={c} strokeWidth={2.5} />}
    </g>
  );
}

function Bottom({ s }: { s: SimState }) {
  const [hh, mm] = utc(s);
  return (
    <g>
      <line x1={0} y1={436} x2={500} y2={436} stroke={C.w} strokeWidth={1.5} />
      <line x1={170} y1={436} x2={170} y2={500} stroke={C.w} strokeWidth={1.5} />
      <line x1={330} y1={436} x2={330} y2={500} stroke={C.w} strokeWidth={1.5} />
      <T x={8} y={460} s={14}>
        TAT
      </T>
      <T x={110} y={460} a="end" c={C.g} s={15}>
        {s.oat >= 0 ? '+' : ''}
        {Math.round(s.oat + (s.ac.ias * s.ac.ias) / 87000)}
      </T>
      <T x={116} y={460} c={C.b} s={13}>
        °C
      </T>
      <T x={8} y={484} s={14}>
        SAT
      </T>
      <T x={110} y={484} a="end" c={C.g} s={15}>
        {s.oat >= 0 ? '+' : ''}
        {s.oat}
      </T>
      <T x={116} y={484} c={C.b} s={13}>
        °C
      </T>
      <T x={250} y={472} a="middle" s={16}>
        <tspan fill={C.g}>{p2(hh)}</tspan> H <tspan fill={C.g}>{p2(mm)}</tspan>
      </T>
      <T x={340} y={472} s={14}>
        GW
      </T>
      <T x={460} y={472} a="end" c={s.fms.zfw != null ? C.g : C.b} s={16}>
        {s.fms.zfw != null ? Math.round(s.ac.gw / 100) * 100 : '-----'}
      </T>
      <T x={465} y={472} c={C.b} s={12}>
        KG
      </T>
    </g>
  );
}

// ============================ страницы ============================
function Eng({ s }: { s: SimState }) {
  const rows: [string, string, (i: number) => string, (i: number) => boolean][] = [
    ['F.USED', 'KG', (i) => String(Math.round(s.eng[i].fuelUsed / 10) * 10), () => true],
    ['OIL', 'QT', (i) => s.eng[i].oilQ.toFixed(1), () => true],
    ['', 'PSI', (i) => String(Math.round(s.eng[i].oilP)), (i) => !s.eng[i].running || s.eng[i].oilP > 13],
    ['', '°C', (i) => String(Math.round(s.eng[i].oilT)), () => true],
    ['VIB', 'N1', (i) => s.eng[i].vibN1.toFixed(1), () => true],
    ['', 'N2', (i) => s.eng[i].vibN2.toFixed(1), () => true],
  ];
  const starting = s.sw.ENG_MODE === 2 || s.eng.some((e) => ['crank', 'fuel', 'accel', 'abort'].includes(e.phase));
  return (
    <g>
      <SdTitle t="ENGINE" />
      {rows.map(([a, b, f, ok], r) => (
        <g key={r}>
          <T x={250} y={70 + r * 36} a="middle" s={15}>
            {a}
          </T>
          <T x={250} y={86 + r * 36} a="middle" c={C.b} s={13}>
            {b}
          </T>
          {[0, 1].map((i) => (
            <T key={i} x={i === 0 ? 150 : 350} y={80 + r * 36} a="middle" c={col(ok(i))} s={20}>
              {f(i)}
            </T>
          ))}
        </g>
      ))}
      {starting &&
        [0, 1].map((i) => {
          const e = s.eng[i];
          const x = i === 0 ? 150 : 350;
          const psi = i === 0 ? s.bleed.leftPsi : s.bleed.rightPsi;
          return (
            <g key={i}>
              <T x={x} y={318} a="middle" c={C.g} s={18}>
                {e.ign ? `IGN ${e.ign}` : ''}
              </T>
              <Valve x={x} y={352} open={e.startValve} />
              <line x1={x} y1={363} x2={x} y2={392} stroke={psi > 15 ? C.g : C.a} strokeWidth={2} />
              <T x={x + 20} y={396} c={psi > 15 ? C.g : C.a} s={18}>
                {Math.round(psi)}
              </T>
              <T x={x + 52} y={396} c={C.b} s={12}>
                PSI
              </T>
            </g>
          );
        })}
      {starting && (
        <T x={250} y={356} a="middle" s={14}>
          START
        </T>
      )}
    </g>
  );
}

function Bleed({ s }: { s: SimState }) {
  const b = s.bleed;
  const eng = (i: number) => {
    const e = s.eng[i];
    const x = i === 0 ? 110 : 390;
    const open = i === 0 ? b.eng1Valve : b.eng2Valve;
    const psi = i === 0 ? b.leftPsi : b.rightPsi;
    return (
      <g key={i}>
        <T x={x} y={420} a="middle" s={20}>
          {i + 1}
        </T>
        <Valve x={x} y={330} open={open} />
        <line x1={x} y1={341} x2={x} y2={398} stroke={e.n2 > 45 ? C.g : C.w} strokeWidth={2} />
        <line x1={x} y1={200} x2={x} y2={319} stroke={psi > 8 ? C.g : C.w} strokeWidth={2} />
        <T x={x + 18} y={268} c={psi > 8 ? C.g : C.a} s={18}>
          {Math.round(psi)}
        </T>
        <T x={x + 18} y={286} c={C.b} s={12}>
          PSI
        </T>
        <T x={x} y={150} a="middle" c={(i === 0 ? b.pack1 : b.pack2) ? C.g : C.a} s={16}>
          PACK {i + 1}
        </T>
        <Valve x={x} y={180} open={i === 0 ? b.pack1 : b.pack2} ok={(i === 0 ? s.sw.PACK1 : s.sw.PACK2) === 0 || (i === 0 ? b.pack1 : b.pack2) || psi < 8} />
        <T x={x} y={84} a="middle" c={C.g} s={15}>
          {Math.round((i === 0 ? b.pack1Flow : b.pack2Flow) * 100)}%
        </T>
        <T x={x} y={110} a="middle" c={C.g} s={15}>
          {Math.round(i === 0 ? b.cabin.fwd - 6 : b.cabin.aft - 6)}°C
        </T>
      </g>
    );
  };
  return (
    <g>
      <SdTitle t="BLEED" />
      <line x1={110} y1={200} x2={239} y2={200} stroke={b.leftPsi > 8 ? C.g : C.w} strokeWidth={2} />
      <line x1={261} y1={200} x2={390} y2={200} stroke={b.rightPsi > 8 ? C.g : C.w} strokeWidth={2} />
      <Valve x={250} y={200} open={b.xbleed} vertical={false} />
      <T x={250} y={232} a="middle" s={13}>
        X BLEED
      </T>
      <line x1={180} y1={200} x2={180} y2={340} stroke={b.apuValve ? C.g : C.w} strokeWidth={2} />
      <Valve x={180} y={352} open={b.apuValve} />
      <T x={180} y={388} a="middle" s={15}>
        APU
      </T>
      {eng(0)}
      {eng(1)}
      <T x={250} y={60} a="middle" s={13}>
        RAM AIR
      </T>
      <Valve x={250} y={84} open={s.sw.RAM_AIR === 1} vertical={false} />
    </g>
  );
}

function Press({ s }: { s: SimState }) {
  const elev = s.fms.to === 'LFPO' ? 291 : null;
  return (
    <g>
      <SdTitle t="CAB PRESS" />
      <T x={300} y={30} s={15}>
        LDG ELEV
      </T>
      <T x={400} y={30} c={C.g} s={15}>
        AUTO
      </T>
      <T x={470} y={52} a="end" c={elev != null ? C.g : C.a} s={18}>
        {elev != null ? elev : 'XX'}
      </T>
      <T x={478} y={52} c={C.b} s={12}>
        FT
      </T>
      {[
        ['ΔP', 'PSI', '0.0', 90],
        ['V/S', 'FT/MIN', s.ac.onGround ? '0' : String(Math.round(Math.min(500, s.ac.vs * 0.3) / 50) * 50), 250],
        ['CAB ALT', 'FT', String(Math.round(Math.min(s.ac.alt, s.elev + (s.ac.alt - s.elev) * 0.3) / 50) * 50), 410],
      ].map(([a, u, v, x]) => (
        <g key={a as string}>
          <path d={arcPath(x as number, 180, 60, 180, 360)} stroke={C.w} strokeWidth={2} fill="none" />
          <T x={x as number} y={120} a="middle" s={15}>
            {a}
          </T>
          <T x={x as number} y={200} a="middle" c={C.g} s={22}>
            {v}
          </T>
          <T x={x as number} y={220} a="middle" c={C.b} s={12}>
            {u}
          </T>
        </g>
      ))}
      <T x={250} y={300} a="middle" s={15}>
        OUTFLOW
      </T>
      <path d={arcPath(250, 380, 50, 200, 340)} stroke={C.w} strokeWidth={2} fill="none" />
      <line x1={250} y1={380} x2={polar(250, 380, 50, s.ac.onGround ? 335 : 280)[0]} y2={polar(250, 380, 50, s.ac.onGround ? 335 : 280)[1]} stroke={C.g} strokeWidth={3} />
      <T x={90} y={400} a="middle" c={s.bleed.pack1 ? C.g : C.a} s={15}>
        PACK 1
      </T>
      <T x={410} y={400} a="middle" c={s.bleed.pack2 ? C.g : C.a} s={15}>
        PACK 2
      </T>
    </g>
  );
}

function Elec({ s }: { s: SimState }) {
  const e = s.elec;
  const bus = (x: number, y: number, name: string, ok: boolean) => (
    <g>
      <rect x={x} y={y} width={100} height={26} fill="#000" stroke={C.gray} />
      <T x={x + 50} y={y + 19} a="middle" c={col(ok)} s={16}>
        {name}
      </T>
    </g>
  );
  const bat = (i: number, x: number) => {
    const b = e.bat[i];
    const on = s.sw[`BAT${i + 1}`] === 1;
    return (
      <Box x={x} y={40} w={100} h={70} title={`BAT ${i + 1}`} ok={on}>
        {on && (
          <>
            <T x={x + 60} y={78} a="end" c={col(b.v > 25)} s={17}>
              {b.v.toFixed(0)}
            </T>
            <T x={x + 64} y={78} c={C.b} s={12}>
              V
            </T>
            <T x={x + 60} y={100} a="end" c={C.g} s={17}>
              {Math.abs(Math.round(b.a))}
            </T>
            <T x={x + 64} y={100} c={C.b} s={12}>
              A
            </T>
            {b.a > 2 && <path d={`M ${x + 50} ${118} l -6 -8 h 12 z`} fill={C.g} />}
            {b.a < -2 && <path d={`M ${x + 50} ${110} l -6 8 h 12 z`} fill={C.a} />}
          </>
        )}
      </Box>
    );
  };
  const gen = (x: number, name: string, on: boolean, load: number, present = true) => (
    <Box x={x} y={340} w={108} h={90} title={name} ok={on || !present}>
      {on && (
        <>
          <T x={x + 64} y={380} a="end" c={C.g} s={16}>
            {load}
          </T>
          <T x={x + 68} y={380} c={C.b} s={12}>
            %
          </T>
          <T x={x + 64} y={400} a="end" c={C.g} s={16}>
            115
          </T>
          <T x={x + 68} y={400} c={C.b} s={12}>
            V
          </T>
          <T x={x + 64} y={420} a="end" c={C.g} s={16}>
            400
          </T>
          <T x={x + 68} y={420} c={C.b} s={12}>
            HZ
          </T>
        </>
      )}
    </Box>
  );
  return (
    <g>
      <SdTitle t="ELEC" />
      {bat(0, 20)}
      {bat(1, 380)}
      {bus(200, 46, 'DC BAT', e.dcBat)}
      {bus(20, 140, 'DC 1', e.dc1)}
      {bus(200, 140, 'DC ESS', e.dcEss)}
      {bus(380, 140, 'DC 2', e.dc2)}
      <T x={70} y={204} a="middle" c={col(e.tr1)} s={15}>
        TR 1
      </T>
      <T x={430} y={204} a="middle" c={col(e.tr2)} s={15}>
        TR 2
      </T>
      <T x={250} y={204} a="middle" c={col(e.acEss)} s={15}>
        ESS TR
      </T>
      {bus(20, 250, 'AC 1', !!e.ac1)}
      {bus(200, 250, 'AC ESS', e.acEss)}
      {bus(380, 250, 'AC 2', !!e.ac2)}
      <T x={70} y={300} a="middle" c={C.g} s={13}>
        {e.ac1 ? '← ' + e.ac1 : ''}
      </T>
      <T x={430} y={300} a="middle" c={C.g} s={13}>
        {e.ac2 ? e.ac2 + ' →' : ''}
      </T>
      {gen(8, 'GEN 1', e.gen1, e.loads.gen1)}
      {gen(130, 'APU GEN', e.apuGen, e.loads.apu, s.apu.avail)}
      <Box x={252} y={340} w={108} h={90} title="EXT PWR" ok>
        {s.gnd.gpu && (
          <>
            <T x={316} y={390} a="end" c={C.g} s={16}>
              115
            </T>
            <T x={320} y={390} c={C.b} s={12}>
              V
            </T>
            <T x={316} y={414} a="end" c={C.g} s={16}>
              400
            </T>
            <T x={320} y={414} c={C.b} s={12}>
              HZ
            </T>
          </>
        )}
      </Box>
      {gen(384, 'GEN 2', e.gen2, e.loads.gen2)}
    </g>
  );
}

function Hyd({ s }: { s: SimState }) {
  const h = s.hyd;
  const sys: [string, number, number, string[]][] = [
    ['GREEN', h.g, 90, ['ENG 1']],
    ['BLUE', h.b, 250, ['ELEC']],
    ['YELLOW', h.y, 410, ['ENG 2', 'ELEC']],
  ];
  return (
    <g>
      <SdTitle t="HYD" />
      {sys.map(([n, p, x, pumps]) => (
        <g key={n}>
          <T x={x} y={70} a="middle" c={col(p > 1450)} s={18}>
            {n}
          </T>
          <T x={x} y={100} a="middle" c={col(p > 1450)} s={22}>
            {Math.round(p / 50) * 50}
          </T>
          <line x1={x} y1={108} x2={x} y2={300} stroke={col(p > 1450)} strokeWidth={2} />
          <path d={`M ${x} 106 l -8 12 h 16 z`} fill={col(p > 1450)} />
          {pumps.map((pp, i) => {
            const on =
              n === 'GREEN' ? s.sw.HYD_G_ENG1 === 1 && s.eng[0].n2 > 45 : n === 'BLUE' ? s.sw.HYD_B_ELEC === 1 && p > 1450 : pp === 'ENG 2' ? s.sw.HYD_Y_ENG2 === 1 && s.eng[1].n2 > 45 : s.sw.HYD_Y_ELEC === 1 && !!s.elec.ac2;
            const bx = pumps.length === 2 ? x - 34 + i * 68 : x;
            return (
              <g key={pp}>
                <rect x={bx - 24} y={200} width={48} height={36} fill="#000" stroke={col(on)} strokeWidth={2} />
                {on ? <line x1={bx} y1={200} x2={bx} y2={236} stroke={C.g} strokeWidth={2.5} /> : <line x1={bx - 12} y1={218} x2={bx + 12} y2={218} stroke={C.a} strokeWidth={2.5} />}
                <T x={bx} y={256} a="middle" s={12}>
                  {pp}
                </T>
              </g>
            );
          })}
          <rect x={x - 10} y={320} width={20} height={70} fill="none" stroke={C.w} />
          <rect x={x - 10} y={335} width={20} height={55} fill={C.g} opacity={0.7} />
        </g>
      ))}
      <T x={170} y={150} a="middle" c={h.ptu ? C.g : C.w} s={15}>
        PTU
      </T>
      <path d="M 100 160 L 400 160" stroke={h.ptu ? C.g : C.gray} strokeWidth={1.5} strokeDasharray={h.ptu ? '' : '4 4'} />
      {h.ptu && <path d={`M ${h.g < h.y ? 120 : 380} 160 l ${h.g < h.y ? 12 : -12} -7 v 14 z`} fill={C.g} />}
      <T x={250} y={420} a="middle" s={13}>
        RAT
      </T>
    </g>
  );
}

function Fuel({ s }: { s: SimState }) {
  const f = s.fuel;
  const pump = (x: number, on: boolean, swOn: boolean) => (
    <g>
      <rect x={x - 14} y={250} width={28} height={26} fill="#000" stroke={on ? C.g : C.a} strokeWidth={2} />
      {on ? <line x1={x} y1={250} x2={x} y2={276} stroke={C.g} strokeWidth={2.5} /> : <T x={x} y={268} a="middle" c={C.a} s={11}>{swOn ? 'LO' : 'OFF'}</T>}
    </g>
  );
  const tank = (x: number, w: number, q: number, name: string) => (
    <g>
      <rect x={x} y={290} width={w} height={70} fill="none" stroke={C.w} strokeWidth={1.5} />
      <T x={x + w / 2} y={312} a="middle" s={13}>
        {name}
      </T>
      <T x={x + w / 2} y={344} a="middle" c={C.g} s={22}>
        {Math.round(q / 20) * 20}
      </T>
    </g>
  );
  return (
    <g>
      <SdTitle t="FUEL" />
      <T x={250} y={60} a="middle" s={14}>
        F.USED
      </T>
      <T x={250} y={82} a="middle" c={C.g} s={18}>
        {Math.round(f.used / 10) * 10}
      </T>
      <T x={250} y={98} a="middle" c={C.b} s={12}>
        KG
      </T>
      {[0, 1].map((i) => {
        const x = i === 0 ? 95 : 405;
        const lp = s.eng[i].lpValve;
        return (
          <g key={i}>
            <T x={x} y={60} a="middle" s={20}>
              {i + 1}
            </T>
            <Valve x={x} y={110} open={lp} />
            <line x1={x} y1={121} x2={x} y2={250} stroke={lp ? C.g : C.w} strokeWidth={2} />
          </g>
        );
      })}
      <line x1={95} y1={180} x2={239} y2={180} stroke={C.w} strokeWidth={1.5} />
      <line x1={261} y1={180} x2={405} y2={180} stroke={C.w} strokeWidth={1.5} />
      <Valve x={250} y={180} open={f.xfeed > 0.9} vertical={false} />
      <T x={140} y={160} s={13}>
        APU
      </T>
      {pump(70, f.press.L1, s.sw.FUEL_L1 === 1)}
      {pump(120, f.press.L2, s.sw.FUEL_L2 === 1)}
      {pump(225, f.press.C1, s.sw.FUEL_C1 === 1)}
      {pump(275, f.press.C2, s.sw.FUEL_C2 === 1)}
      {pump(380, f.press.R1, s.sw.FUEL_R1 === 1)}
      {pump(430, f.press.R2, s.sw.FUEL_R2 === 1)}
      {tank(20, 150, f.left, 'LEFT')}
      {tank(185, 130, f.center, 'CTR')}
      {tank(330, 150, f.right, 'RIGHT')}
      <T x={20} y={410} s={16}>
        FOB
      </T>
      <T x={170} y={410} a="end" c={C.g} s={22}>
        {Math.round((f.left + f.right + f.center) / 20) * 20}
      </T>
      <T x={176} y={410} c={C.b} s={12}>
        KG
      </T>
      <T x={480} y={410} a="end" c={C.w} s={14}>
        {s.sw.FUEL_MODE === 0 ? 'AUTO' : 'MAN'}
      </T>
    </g>
  );
}

function Apu({ s }: { s: SimState }) {
  const a = s.apu;
  const nAng = (v: number) => 180 + (Math.min(110, v) / 110) * 200;
  const eAng = (v: number) => 180 + (Math.min(1100, v) / 1100) * 200;
  const showVals = s.sw.APU_MASTER === 1 || a.n > 1;
  return (
    <g>
      <SdTitle t="APU" />
      {a.avail && (
        <T x={250} y={40} a="middle" c={C.g} s={20}>
          AVAIL
        </T>
      )}
      <Box x={20} y={55} w={130} h={100} title="APU GEN" ok={!a.avail || s.elec.apuGen}>
        {a.avail && s.sw.APU_GEN === 1 && (
          <>
            <T x={95} y={100} a="end" c={C.g} s={17}>
              {s.elec.loads.apu}
            </T>
            <T x={100} y={100} c={C.b} s={12}>
              %
            </T>
            <T x={95} y={122} a="end" c={C.g} s={17}>
              115
            </T>
            <T x={100} y={122} c={C.b} s={12}>
              V
            </T>
            <T x={95} y={144} a="end" c={C.g} s={17}>
              400
            </T>
            <T x={100} y={144} c={C.b} s={12}>
              HZ
            </T>
          </>
        )}
      </Box>
      <T x={360} y={80} a="middle" s={15}>
        APU BLEED
      </T>
      <T x={360} y={106} a="middle" c={s.bleed.apuValve ? C.g : C.a} s={20}>
        {s.bleed.apuValve ? Math.round(s.bleed.leftPsi) : 'XX'}
      </T>
      <T x={392} y={106} c={C.b} s={12}>
        PSI
      </T>
      <Valve x={360} y={140} open={s.bleed.apuValve} />
      {/* N */}
      <path d={arcPath(140, 290, 60, 180, nAng(100))} stroke={C.w} strokeWidth={2} fill="none" />
      <path d={arcPath(140, 290, 60, nAng(101), nAng(110))} stroke={C.r} strokeWidth={4} fill="none" />
      {showVals && <line x1={140} y1={290} x2={polar(140, 290, 56, nAng(a.n))[0]} y2={polar(140, 290, 56, nAng(a.n))[1]} stroke={C.g} strokeWidth={3} />}
      <T x={140} y={250} a="middle" s={16}>
        N
      </T>
      <T x={170} y={330} a="end" c={C.g} s={22}>
        {showVals ? Math.round(a.n) : ''}
      </T>
      <T x={174} y={330} c={C.b} s={12}>
        %
      </T>
      {/* EGT */}
      <path d={arcPath(360, 290, 60, 180, eAng(1000))} stroke={C.w} strokeWidth={2} fill="none" />
      <path d={arcPath(360, 290, 60, eAng(1000), eAng(1100))} stroke={C.r} strokeWidth={4} fill="none" />
      {showVals && <line x1={360} y1={290} x2={polar(360, 290, 56, eAng(a.egt))[0]} y2={polar(360, 290, 56, eAng(a.egt))[1]} stroke={C.g} strokeWidth={3} />}
      <T x={360} y={250} a="middle" s={16}>
        EGT
      </T>
      <T x={395} y={330} a="end" c={C.g} s={22}>
        {showVals ? Math.round(a.egt / 5) * 5 : ''}
      </T>
      <T x={399} y={330} c={C.b} s={12}>
        °C
      </T>
      {a.flap > 0.95 && (
        <T x={250} y={395} a="middle" c={C.g} s={16}>
          FLAP OPEN
        </T>
      )}
      {a.fault && (
        <T x={250} y={420} a="middle" c={C.a} s={16}>
          APU AUTO SHUT DOWN
        </T>
      )}
    </g>
  );
}

function Cond({ s }: { s: SimState }) {
  const c = s.bleed.cabin;
  return (
    <g>
      <SdTitle t="COND" />
      <T x={420} y={30} s={14}>
        TEMP :
      </T>
      <T x={488} y={30} a="end" c={C.b} s={13}>
        °C
      </T>
      <path d="M 40 200 Q 40 140 110 140 L 460 140 L 460 260 L 110 260 Q 40 260 40 200 Z" fill="none" stroke={C.w} strokeWidth={2} />
      {[
        ['CKPT', c.ckpt, 85],
        ['FWD', c.fwd, 220],
        ['AFT', c.aft, 380],
      ].map(([n, v, x]) => (
        <g key={n as string}>
          <T x={x as number} y={180} a="middle" s={16}>
            {n}
          </T>
          <T x={x as number} y={215} a="middle" c={C.g} s={22}>
            {Math.round(v as number)}
          </T>
          <T x={x as number} y={240} a="middle" c={C.g} s={14}>
            {Math.round((v as number) - 3)}
          </T>
        </g>
      ))}
      <T x={250} y={320} a="middle" s={15}>
        HOT AIR
      </T>
      <Valve x={250} y={350} open={s.sw.HOT_AIR === 1 && (s.bleed.pack1 || s.bleed.pack2)} vertical={false} />
      <T x={90} y={400} a="middle" c={s.bleed.pack1 ? C.g : C.a} s={15}>
        PACK 1
      </T>
      <T x={410} y={400} a="middle" c={s.bleed.pack2 ? C.g : C.a} s={15}>
        PACK 2
      </T>
    </g>
  );
}

function Door({ s }: { s: SimState }) {
  const d = s.gnd.doors;
  const door = (x: number, y: number, open: boolean, label: string, side: 'l' | 'r', slide?: boolean) => (
    <g>
      <rect x={x} y={y} width={16} height={26} fill={open ? C.a : 'none'} stroke={open ? C.a : C.g} strokeWidth={2} />
      {open && (
        <T x={side === 'l' ? x - 8 : x + 24} y={y + 18} a={side === 'l' ? 'end' : 'start'} c={C.a} s={13}>
          {label}
        </T>
      )}
      {!open && slide && (
        <T x={side === 'l' ? x - 8 : x + 24} y={y + 18} a={side === 'l' ? 'end' : 'start'} c={C.w} s={12}>
          SLIDE
        </T>
      )}
    </g>
  );
  return (
    <g>
      <SdTitle t="DOOR/OXY" />
      <T x={330} y={30} s={14}>
        CKPT OXY
      </T>
      <T x={450} y={30} a="end" c={C.g} s={16}>
        1850
      </T>
      <T x={455} y={30} c={C.b} s={12}>
        PSI
      </T>
      <path d="M 250 50 Q 290 50 296 110 L 296 380 Q 296 420 250 425 Q 204 420 204 380 L 204 110 Q 210 50 250 50 Z" fill="none" stroke={C.w} strokeWidth={2} />
      {door(196, 112, d.L1, 'CABIN', 'l', s.gnd.slidesArmed)}
      {door(288, 112, d.R1, 'CABIN', 'r', s.gnd.slidesArmed)}
      {door(196, 360, d.L2, 'CABIN', 'l', s.gnd.slidesArmed)}
      {door(288, 360, d.R2, 'CABIN', 'r', s.gnd.slidesArmed)}
      {door(288, 170, d.FWD, 'CARGO', 'r')}
      {door(288, 300, d.AFT, 'CARGO', 'r')}
      {door(288, 336, d.BULK, 'BULK', 'r')}
      <T x={20} y={420} s={13} c={C.w}>
        BOARDING {Math.round(s.gnd.boarding * 100)}%
      </T>
    </g>
  );
}

function Wheel({ s }: { s: SimState }) {
  const down = s.ac.gear > 0.99;
  const tri = (x: number, y: number) => (
    <path d={`M ${x - 14} ${y} L ${x + 14} ${y} L ${x} ${y + 18} Z`} fill={down ? C.g : 'none'} stroke={down ? C.g : C.r} strokeWidth={2} />
  );
  const temp = Math.round(s.oat + 20 + (s.flags.rtoT ? 260 : 0));
  return (
    <g>
      <SdTitle t="WHEEL" />
      <T x={250} y={60} a="middle" s={14}>
        SPLRS
      </T>
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <path d={`M ${80 + i * 26} ${s.ac.spoilers > 0.1 ? 62 : 76} l -6 10 h 12 z`} fill={C.g} />
          <path d={`M ${420 - i * 26} ${s.ac.spoilers > 0.1 ? 62 : 76} l -6 10 h 12 z`} fill={C.g} />
        </g>
      ))}
      {tri(250, 120)}
      {tri(110, 220)}
      {tri(390, 220)}
      {[60, 160, 340, 440].map((x, i) => (
        <g key={i}>
          <T x={x} y={300} a="middle" c={temp > 300 ? C.a : C.g} s={18}>
            {temp}
          </T>
          <rect x={x - 20} y={310} width={40} height={60} fill="none" stroke={C.w} strokeWidth={1.5} />
          <T x={x} y={346} a="middle" s={16}>
            {i + 1}
          </T>
        </g>
      ))}
      <T x={250} y={300} a="middle" s={14}>
        °C
      </T>
      {s.ac.autobrk > 0 && (
        <>
          <T x={250} y={400} a="middle" c={C.g} s={16}>
            AUTO BRK
          </T>
          <T x={250} y={422} a="middle" c={C.g} s={16}>
            {['', 'LO', 'MED', 'MAX'][s.ac.autobrk]}
          </T>
        </>
      )}
      {s.gnd.tow && (
        <T x={250} y={170} a="middle" c={s.eng.some((e) => e.running) ? C.a : C.g} s={14}>
          N/W STEERING DISC
        </T>
      )}
      <T x={60} y={400} c={s.hyd.g > 1500 && s.sw.ASKID_NWS === 1 ? C.g : C.a} s={14}>
        {s.hyd.g > 1500 && s.sw.ASKID_NWS === 1 ? 'NORM BRK' : 'ALTN BRK'}
      </T>
    </g>
  );
}

function Fctl({ s }: { s: SimState }) {
  const ac = s.ac;
  const hydOk = s.hyd.g > 1500 || s.hyd.b > 1500 || s.hyd.y > 1500;
  const sp = hydOk ? ac.stickP : -0.3;
  const sr = hydOk ? ac.stickR : 0;
  const rud = hydOk ? ac.rudder + ac.rudTrim / 25 : 0;
  const scale = (x: number, y0: number, v: number, lbl: string) => (
    <g>
      <line x1={x} y1={y0 - 50} x2={x} y2={y0 + 50} stroke={C.w} strokeWidth={2} />
      {[-50, 0, 50].map((d) => (
        <line key={d} x1={x - 6} y1={y0 + d} x2={x + 6} y2={y0 + d} stroke={C.w} strokeWidth={2} />
      ))}
      <path d={`M ${x - 4} ${y0 + v * 46} l -14 -7 v 14 z`} fill={hydOk ? C.g : C.a} />
      <T x={x} y={y0 + 72} a="middle" s={13}>
        {lbl}
      </T>
    </g>
  );
  const hyd = (x: number, y: number, letters: string) => (
    <T x={x} y={y} a="middle" s={13}>
      {letters.split('').map((l, i) => (
        <tspan key={i} fill={(l === 'G' ? s.hyd.g : l === 'B' ? s.hyd.b : s.hyd.y) > 1500 ? C.g : C.a}>
          {l}
        </tspan>
      ))}
    </T>
  );
  return (
    <g>
      <SdTitle t="F/CTL" />
      <T x={250} y={60} a="middle" s={14}>
        SPD BRK
      </T>
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <path d={`M ${70 + i * 26} ${ac.spoilers > 0.1 ? 64 : 78} l -6 10 h 12 z`} fill={C.g} />
          <path d={`M ${430 - i * 26} ${ac.spoilers > 0.1 ? 64 : 78} l -6 10 h 12 z`} fill={C.g} />
        </g>
      ))}
      {scale(60, 170, -sr, 'L AIL')}
      {scale(440, 170, sr, 'R AIL')}
      {hyd(60, 260, 'BG')}
      {hyd(440, 260, 'GB')}
      {scale(120, 340, sp, 'L ELEV')}
      {scale(380, 340, sp, 'R ELEV')}
      {hyd(120, 428, 'BG')}
      {hyd(380, 428, 'YB')}
      <T x={250} y={130} a="middle" s={14}>
        PITCH TRIM
      </T>
      <T x={250} y={155} a="middle" c={hydOk ? C.g : C.a} s={18}>
        {Math.abs(ac.pitchTrim).toFixed(1)}°{' '}
        <tspan fill={C.b} fontSize={14}>
          {ac.pitchTrim >= 0 ? 'UP' : 'DN'}
        </tspan>
      </T>
      {hyd(250, 175, 'GY')}
      <T x={250} y={220} a="middle" s={13}>
        ELAC
      </T>
      <T x={250} y={240} a="middle" s={16}>
        <tspan fill={s.flags.elacFault || !s.sw.ELAC1 ? C.a : C.g}>1</tspan> <tspan fill={s.sw.ELAC2 ? C.g : C.a}>2</tspan>
      </T>
      <T x={250} y={268} a="middle" s={13}>
        SEC
      </T>
      <T x={250} y={288} a="middle" s={16}>
        <tspan fill={s.sw.SEC1 ? C.g : C.a}>1</tspan> <tspan fill={s.sw.SEC2 ? C.g : C.a}>2</tspan> <tspan fill={s.sw.SEC3 ? C.g : C.a}>3</tspan>
      </T>
      <T x={250} y={330} a="middle" s={14}>
        RUD
      </T>
      <path d={arcPath(250, 300, 100, 60, 120)} stroke={C.w} strokeWidth={2} fill="none" />
      <line x1={250} y1={300} x2={polar(250, 300, 105, 90 - rud * 28)[0]} y2={polar(250, 300, 105, 90 - rud * 28)[1]} stroke={hydOk ? C.g : C.a} strokeWidth={3} />
      {hyd(250, 425, 'GBY')}
    </g>
  );
}

function Sts({ s }: { s: SimState }) {
  const lines = statusLines(s);
  const MC: Record<string, string> = { green: C.g, amber: C.a, white: C.w, blue: C.b };
  return (
    <g>
      <SdTitle t="STATUS" />
      {lines.map((l, i) => (
        <T key={i} x={l.t === 'INOP SYS' || l.t === 'NORMAL' ? 250 : 270} y={80 + i * 24} a={l.t === 'NORMAL' ? 'middle' : 'start'} c={MC[l.c]} s={18}>
          {l.t}
        </T>
      ))}
    </g>
  );
}

function Cruise({ s }: { s: SimState }) {
  return (
    <g>
      <SdTitle t="CRUISE" />
      <T x={250} y={60} a="middle" s={15}>
        ENG
      </T>
      <T x={250} y={90} a="middle" s={14}>
        F.USED
      </T>
      <T x={150} y={90} a="middle" c={C.g} s={18}>
        {Math.round(s.eng[0].fuelUsed / 10) * 10}
      </T>
      <T x={350} y={90} a="middle" c={C.g} s={18}>
        {Math.round(s.eng[1].fuelUsed / 10) * 10}
      </T>
      <T x={250} y={120} a="middle" s={14}>
        OIL
      </T>
      <T x={150} y={120} a="middle" c={C.g} s={18}>
        {s.eng[0].oilQ.toFixed(1)}
      </T>
      <T x={350} y={120} a="middle" c={C.g} s={18}>
        {s.eng[1].oilQ.toFixed(1)}
      </T>
      <T x={250} y={200} a="middle" s={15}>
        AIR
      </T>
      <T x={60} y={240} s={14}>
        LDG ELEV AUTO
      </T>
      <T x={330} y={240} c={C.g} s={18}>
        291 FT
      </T>
      <T x={60} y={280} s={14}>
        CAB V/S
      </T>
      <T x={330} y={280} c={C.g} s={18}>
        {Math.round(Math.min(800, s.ac.vs * 0.3) / 50) * 50} FT/MIN
      </T>
      <T x={60} y={320} s={14}>
        CAB ALT
      </T>
      <T x={330} y={320} c={C.g} s={18}>
        {Math.round((s.elev + (s.ac.alt - s.elev) * 0.3) / 50) * 50} FT
      </T>
      <T x={60} y={370} s={14}>
        CKPT {Math.round(s.bleed.cabin.ckpt)} FWD {Math.round(s.bleed.cabin.fwd)} AFT {Math.round(s.bleed.cabin.aft)} °C
      </T>
    </g>
  );
}

const PAGES: Record<string, (p: { s: SimState }) => JSX.Element> = {
  ENG: Eng,
  BLEED: Bleed,
  PRESS: Press,
  ELEC: Elec,
  HYD: Hyd,
  FUEL: Fuel,
  APU: Apu,
  COND: Cond,
  DOOR: Door,
  WHEEL: Wheel,
  'F/CTL': Fctl,
  STS: Sts,
  CRUISE: Cruise,
};

export function SD() {
  const s = useSimFrame(12);
  const mode = duMode(sdPower(s), s.t, s.flags.ac2T as number | undefined);
  const page = sdPage(s);
  const P = PAGES[page] ?? Door;
  return (
    <Screen mode={mode} label="SD">
      <P s={s} />
      <Bottom s={s} />
    </Screen>
  );
}
