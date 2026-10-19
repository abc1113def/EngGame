import { ecamLines, leftMemo, rightMemo } from '../sim/ecam';
import { n1Command, thrustLimits, tlaDetent, START_EGT_LIMIT } from '../sim/engines';
import { dispPower, fob } from '../sim/systems';
import type { EngineState, SimState } from '../sim/types';
import { useSimFrame } from '../ui/hooks';
import { C, Screen, T, arcPath, polar , duMode } from './common';

const MC: Record<string, string> = { green: C.g, blue: C.b, amber: C.a, white: C.w, red: C.r, magenta: C.m };

function fadecOn(s: SimState, i: number) {
  return s.elec.dcBat && (s.sw.ENG_MODE !== 1 || s.sw[`ENG${i + 1}_MASTER`] === 1 || s.eng[i].n2 > 5);
}

function N1Dial({ e, i, cx, cy, s }: { e: EngineState; i: number; cx: number; cy: number; s: SimState }) {
  const on = fadecOn(s, i);
  const r = 56;
  const ang = (v: number) => 150 + (Math.max(0, Math.min(110, v)) / 110) * 240;
  const [nx, ny] = polar(cx, cy, r - 4, ang(e.n1));
  const cmd = n1Command(s, s.sw[`TL${i + 1}`]);
  const [bx, by] = polar(cx, cy, r + 7, ang(cmd));
  const ticks = [0, 50, 100].map((v) => {
    const [x1, y1] = polar(cx, cy, r, ang(v));
    const [x2, y2] = polar(cx, cy, r - 9, ang(v));
    return <line key={v} x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.w} strokeWidth={2} />;
  });
  return (
    <g>
      <path d={arcPath(cx, cy, r, 150, ang(104))} stroke={on ? C.w : C.a} strokeWidth={2.5} fill="none" />
      <path d={arcPath(cx, cy, r, ang(104), ang(110))} stroke={C.r} strokeWidth={5} fill="none" />
      {ticks}
      {on ? (
        <>
          <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={C.g} strokeWidth={3.5} />
          {e.running && <circle cx={bx} cy={by} r={5} fill="none" stroke={C.b} strokeWidth={2} />}
          <rect x={cx - 4} y={cy + 6} width={60} height={30} fill="#000" stroke={C.gray} strokeWidth={1} />
          <T x={cx + 52} y={cy + 30} a="end" c={C.g} s={24}>
            {e.n1.toFixed(1)}
          </T>
          {e.availTimer > 0 && (
            <T x={cx} y={cy - 18} a="middle" c={C.g} s={15}>
              AVAIL
            </T>
          )}
          {e.rev > 0.05 && (
            <>
              <rect x={cx - 22} y={cy - 36} width={44} height={20} fill="#000" stroke={C.gray} />
              <T x={cx} y={cy - 20} a="middle" c={e.rev > 0.95 ? C.g : C.a} s={16}>
                REV
              </T>
            </>
          )}
        </>
      ) : (
        <T x={cx + 20} y={cy + 30} a="middle" c={C.a} s={24}>
          XX
        </T>
      )}
    </g>
  );
}

function EgtDial({ e, i, cx, cy, s }: { e: EngineState; i: number; cx: number; cy: number; s: SimState }) {
  const on = fadecOn(s, i);
  const r = 40;
  const ang = (v: number) => 180 + (Math.max(0, Math.min(1100, v)) / 1100) * 180;
  const [nx, ny] = polar(cx, cy, r - 3, ang(e.egt));
  const starting = ['crank', 'fuel', 'accel', 'abort'].includes(e.phase);
  const lim = starting ? START_EGT_LIMIT : 950;
  const amber = e.egt > (starting ? START_EGT_LIMIT : 915);
  return (
    <g>
      <path d={arcPath(cx, cy, r, 180, ang(lim))} stroke={on ? C.w : C.a} strokeWidth={2.5} fill="none" />
      <path d={arcPath(cx, cy, r, ang(lim), 360)} stroke={C.r} strokeWidth={5} fill="none" />
      {on ? (
        <>
          <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={amber ? C.a : C.g} strokeWidth={3} />
          <T x={cx} y={cy + 22} a="middle" c={amber ? C.a : C.g} s={20}>
            {Math.round(e.egt / 5) * 5}
          </T>
        </>
      ) : (
        <T x={cx} y={cy + 22} a="middle" c={C.a} s={20}>
          XX
        </T>
      )}
    </g>
  );
}

function engDigits(s: SimState, i: number, x: number) {
  const e = s.eng[i];
  const on = fadecOn(s, i);
  const starting = ['crank', 'fuel', 'accel'].includes(e.phase);
  return (
    <g key={i}>
      {on && starting && <rect x={x - 54} y={262} width={60} height={26} fill="#4a4f55" />}
      <T x={x} y={284} a="end" c={on ? C.g : C.a} s={22}>
        {on ? e.n2.toFixed(1) : 'XX'}
      </T>
      <T x={x} y={320} a="end" c={on ? C.g : C.a} s={22}>
        {on ? Math.round(e.ff / 20) * 20 : 'XX'}
      </T>
    </g>
  );
}

function FlapInd({ s }: { s: SimState }) {
  const sl = s.ac.slats;
  const fl = s.ac.flaps;
  const x0 = 360;
  const y0 = 300;
  const slX = x0 + 45 - (sl / 27) * 40;
  const slY = y0 + (sl / 27) * 16;
  const flX = x0 + 75 + (fl / 40) * 55;
  const flY = y0 + (fl / 40) * 22;
  const lever = s.sw.FLAPS;
  const conf = ['0', s.flags.conf1F ? '1+F' : '1', '2', '3', 'FULL'][lever];
  const moving = Math.abs(sl - [0, 18, 22, 22, 27][lever]) > 0.5 || Math.abs(fl - [0, s.flags.conf1F ? 10 : 0, 15, 20, 40][lever]) > 0.5;
  if (sl < 0.5 && fl < 0.5 && lever === 0) return null;
  return (
    <g>
      <T x={x0 + 20} y={y0 - 4} s={14}>
        S
      </T>
      <T x={x0 + 120} y={y0 - 4} s={14}>
        F
      </T>
      <path d={`M ${x0 + 50} ${y0} L ${x0 + 75} ${y0} L ${x0 + 70} ${y0 + 6} L ${x0 + 52} ${y0 + 6} Z`} fill={C.w} />
      <line x1={x0 + 48} y1={y0 + 3} x2={slX} y2={slY} stroke={C.g} strokeWidth={4} />
      <line x1={x0 + 76} y1={y0 + 3} x2={flX} y2={flY} stroke={C.g} strokeWidth={4} />
      <T x={x0 + 62} y={y0 + 42} a="middle" c={moving ? C.b : C.g} s={18}>
        {conf}
      </T>
    </g>
  );
}

export function EWD() {
  const s = useSimFrame(15);
  const mode = duMode(dispPower(s), s.t, s.flags.acEssT as number | undefined);
  const lim = thrustLimits(s);
  const td = [tlaDetent(s.sw.TL1), tlaDetent(s.sw.TL2)];
  let limMode = 'TOGA';
  let limVal = lim.toga;
  if (s.ac.onGround) {
    if (s.fms.flex != null && lim.flex != null && !td.includes('TOGA')) {
      limMode = 'FLX';
      limVal = lim.flex;
    }
  } else if (s.ac.athrActive || td.includes('CL')) {
    limMode = 'CLB';
    limVal = lim.cl;
  } else if (td.includes('FLX') && s.flags.flxLocked) {
    limMode = 'FLX';
    limVal = lim.flex ?? lim.mct;
  }
  const lines = ecamLines(s);
  const memoL = lines.length ? lines : leftMemo(s);
  const memoR = rightMemo(s);
  const anyFadec = fadecOn(s, 0) || fadecOn(s, 1);
  return (
    <Screen mode={mode} label="E/WD">
      <N1Dial e={s.eng[0]} i={0} cx={95} cy={90} s={s} />
      <N1Dial e={s.eng[1]} i={1} cx={265} cy={90} s={s} />
      <T x={180} y={92} a="middle" s={15}>
        N1
      </T>
      <T x={180} y={110} a="middle" c={C.b} s={13}>
        %
      </T>
      <EgtDial e={s.eng[0]} i={0} cx={95} cy={205} s={s} />
      <EgtDial e={s.eng[1]} i={1} cx={265} cy={205} s={s} />
      <T x={180} y={200} a="middle" s={15}>
        EGT
      </T>
      <T x={180} y={218} a="middle" c={C.b} s={13}>
        °C
      </T>
      {engDigits(s, 0, 125)}
      {engDigits(s, 1, 295)}
      <T x={180} y={280} a="middle" s={15}>
        N2
      </T>
      <T x={180} y={296} a="middle" c={C.b} s={12}>
        %
      </T>
      <T x={180} y={316} a="middle" s={15}>
        FF
      </T>
      <T x={180} y={332} a="middle" c={C.b} s={12}>
        KG/H
      </T>
      {/* предел тяги */}
      {anyFadec && (
        <>
          <T x={385} y={36} c={C.b} s={18}>
            {limMode}
          </T>
          <T x={490} y={60} a="end" c={C.g} s={22}>
            {limVal.toFixed(1)}
            <tspan fill={C.b} fontSize={15}>
              %
            </tspan>
          </T>
          {limMode === 'FLX' && (
            <T x={490} y={84} a="end" c={C.g} s={17}>
              {s.fms.flex}
              <tspan fill={C.b} fontSize={13}>
                °C
              </tspan>
            </T>
          )}
        </>
      )}
      <T x={360} y={260} s={16}>
        FOB :
      </T>
      <T x={490} y={260} a="end" c={C.g} s={20}>
        {Math.round(fob(s) / 20) * 20}
        <tspan fill={C.b} fontSize={13}>
          {' '}
          KG
        </tspan>
      </T>
      <FlapInd s={s} />
      {/* зона сообщений */}
      <line x1={8} y1={362} x2={492} y2={362} stroke={C.w} strokeWidth={2} />
      <line x1={300} y1={370} x2={300} y2={492} stroke={C.w} strokeWidth={1.5} />
      {memoL.map((l, i) => (
        <g key={i}>
          <T x={12} y={386 + i * 17} c={MC[l.c]} s={15}>
            {l.t}
          </T>
          {'u' in l && l.u ? <line x1={12} y1={389 + i * 17} x2={12 + (l.u as number) * 9.2} y2={389 + i * 17} stroke={MC[l.c]} strokeWidth={1.4} /> : null}
        </g>
      ))}
      {memoR.map((l, i) => (
        <T key={i} x={310} y={386 + i * 17} c={MC[l.c]} s={15}>
          {l.t}
        </T>
      ))}
    </Screen>
  );
}
