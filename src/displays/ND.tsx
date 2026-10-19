import { KT, headwind, ilsDev } from '../sim/flight';
import { fplnLegs } from '../sim/fms';
import { dispPower, irOk } from '../sim/systems';
import { useSimFrame } from '../ui/hooks';
import { C, Screen, T, duMode, polar } from './common';

const RANGES = [10, 20, 40, 80, 160, 320];

export function ND() {
  const s = useSimFrame(15);
  const mode = duMode(dispPower(s), s.t, s.flags.acEssT as number | undefined);
  const ok = irOk(s, 0);
  const ndMode = s.sw.ND_MODE; // LS VOR NAV ARC PLAN
  const range = RANGES[s.sw.ND_RANGE] ?? 40;
  const arc = ndMode === 3;
  const cx = 250;
  const cy = arc ? 420 : 265;
  const R = arc ? 330 : 185;
  const hdg = s.ac.hdg;
  const nmPx = R / range;

  // перевод мировых координат в экран
  const toScr = (x: number, y: number) => {
    const dx = (x - s.ac.x) / 1852;
    const dy = (y - s.ac.y) / 1852;
    const a = (hdg * Math.PI) / 180;
    const rx = dx * Math.cos(a) - dy * Math.sin(a);
    const ry = -dx * Math.sin(a) + dy * Math.cos(a);
    return [cx + rx * nmPx, cy - ry * nmPx] as const;
  };

  const G = s.geo;
  const legs = fplnLegs(s);
  const pts: { id: string; x: number; y: number }[] = [];
  for (const L of legs) {
    if (L.kind === 'dep') pts.push({ id: L.id, x: G.thr.x, y: G.thr.y });
    else if (G.wpts[L.id]) pts.push({ id: L.id, ...G.wpts[L.id] });
  }
  const route = pts.map((p) => toScr(p.x, p.y));
  const alongOf = (x: number, y: number) => (x - G.thr.x) * G.rwyDir.x + (y - G.thr.y) * G.rwyDir.y;
  const acAlong = alongOf(s.ac.x, s.ac.y);
  const toWpt =
    s.leg === 'arr'
      ? pts.find((p) => alongOf(p.x, p.y) > acAlong + 300)
      : pts.find((p, i) => i > 0 && Math.hypot(p.x - s.ac.x, p.y - s.ac.y) > 1000);
  const brg = toWpt ? (((Math.atan2(toWpt.x - s.ac.x, toWpt.y - s.ac.y) * 180) / Math.PI + 360) % 360) : 0;
  const dist = toWpt ? Math.hypot(toWpt.x - s.ac.x, toWpt.y - s.ac.y) / 1852 : 0;
  const gs = Math.max(0, s.ac.gs * KT);
  const tas = s.ac.ias;

  const compass = [];
  for (let d = 0; d < 360; d += 5) {
    const rel = ((d - hdg + 540) % 360) - 180;
    if (arc && Math.abs(rel) > 52) continue;
    const ang = rel - 90;
    const [x1, y1] = polar(cx, cy, R, ang);
    const [x2, y2] = polar(cx, cy, R + (d % 10 === 0 ? 14 : 8), ang);
    compass.push(<line key={d} x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.w} strokeWidth={2} />);
    if (d % 30 === 0) {
      const [tx, ty] = polar(cx, cy, R + 28, ang);
      compass.push(
        <T key={'t' + d} x={tx} y={ty + 6} a="middle" s={d % 90 === 0 ? 20 : 17}>
          {d / 10}
        </T>,
      );
    }
  }

  const thr = toScr(G.thr.x, G.thr.y);
  const rend = toScr(G.thr.x + G.rwyDir.x * G.rwyLen, G.thr.y + G.rwyDir.y * G.rwyLen);
  const wind = !s.ac.onGround && tas > 100;
  const hw = headwind(s);
  void hw;

  return (
    <Screen mode={mode} label="ND">
      <T x={10} y={24} s={15}>
        GS
      </T>
      <T x={38} y={24} c={C.g} s={18}>
        {ok ? Math.round(gs) : ''}
      </T>
      <T x={80} y={24} s={15}>
        TAS
      </T>
      <T x={118} y={24} c={C.g} s={18}>
        {ok && tas > 60 ? Math.round(tas) : '---'}
      </T>
      {wind && (
        <T x={10} y={46} c={C.g} s={16}>
          {s.leg === 'arr' ? `${s.atc.arrWindDir}/${s.atc.arrWindSpd}` : `${s.atc.windDir}/${s.atc.windSpd}`}
        </T>
      )}
      {ok && toWpt && (
        <>
          <T x={380} y={24} s={17}>
            {toWpt.id}
          </T>
          <T x={490} y={24} a="end" c={C.g} s={17}>
            {String(Math.round(brg)).padStart(3, '0')}°
          </T>
          <T x={490} y={46} a="end" c={C.g} s={17}>
            {dist.toFixed(1)} NM
          </T>
        </>
      )}
      {!ok ? (
        <>
          <T x={250} y={44} a="middle" c={C.r} s={22}>
            HDG
          </T>
          <T x={250} y={250} a="middle" c={C.r} s={22}>
            MAP NOT AVAIL
          </T>
          {s.adirs.ir[0].aligning && (
            <T x={250} y={280} a="middle" c={C.w} s={15}>
              IR ALIGN
            </T>
          )}
        </>
      ) : (
        <>
          <defs>
            <clipPath id="ndclip">
              <rect x={0} y={60} width={500} height={420} />
            </clipPath>
          </defs>
          <g clipPath="url(#ndclip)">
            {arc ? (
              <path d={`M ${polar(cx, cy, R, -142)[0]} ${polar(cx, cy, R, -142)[1]} A ${R} ${R} 0 0 1 ${polar(cx, cy, R, -38)[0]} ${polar(cx, cy, R, -38)[1]}`} stroke={C.w} strokeWidth={2} fill="none" />
            ) : (
              <circle cx={cx} cy={cy} r={R} stroke={C.w} strokeWidth={2} fill="none" />
            )}
            <circle cx={cx} cy={cy} r={R / 2} stroke={C.w} strokeWidth={1.2} strokeDasharray="4 8" fill="none" />
            <T x={cx - R / 2 * 0.72 - 8} y={cy - R / 2 * 0.72} c={C.b} s={14} a="end">
              {range / 2}
            </T>
            {compass}
            {/* ВПП */}
            <line x1={thr[0]} y1={thr[1]} x2={rend[0]} y2={rend[1]} stroke={C.w} strokeWidth={Math.max(2, 45 * nmPx / 1852 * 4)} opacity={0.9} />
            {(ndMode === 2 || ndMode === 3 || ndMode === 4) && route.length > 1 && (
              <polyline points={route.map((p) => p.join(',')).join(' ')} fill="none" stroke={C.g} strokeWidth={2.5} />
            )}
            {(ndMode === 2 || ndMode === 3 || ndMode === 4) &&
              pts.map((p, i) => {
                if (i === 0 && s.leg === 'dep') return null;
                const [x, y] = route[i];
                return (
                  <g key={p.id}>
                    <path d={`M ${x} ${y - 7} L ${x + 7} ${y} L ${x} ${y + 7} L ${x - 7} ${y} Z`} fill="none" stroke={p === toWpt ? C.w : C.g} strokeWidth={2} />
                    <T x={x + 10} y={y + 5} s={14} c={p === toWpt ? C.w : C.g}>
                      {p.id}
                    </T>
                  </g>
                );
              })}
          </g>
          {/* курсовая черта и самолёт */}
          <line x1={cx} y1={cy - R - 16} x2={cx} y2={cy - R + 6} stroke={C.y} strokeWidth={4} />
          <g stroke={C.y} strokeWidth={4} fill="none">
            <line x1={cx} y1={cy - 18} x2={cx} y2={cy + 24} />
            <line x1={cx - 24} y1={cy} x2={cx + 24} y2={cy} />
            <line x1={cx - 9} y1={cy + 20} x2={cx + 9} y2={cy + 20} />
          </g>
          {ndMode === 0 && G.ils && s.fms.appr && <LsRose cx={cx} cy={cy} R={R} />}
          {ndMode <= 1 && (
            <T x={10} y={480} s={15} c={ndMode === 0 && G.ils && s.fms.appr ? C.m : C.w}>
              {ndMode === 0 ? (G.ils && s.fms.appr ? `ILS1 ${G.ils.ident} ${G.ils.freq}  CRS ${String(G.rwyHdg).padStart(3, '0')}°` : 'ILS1 ---') : 'VOR1 TOU'}
            </T>
          )}
        </>
      )}
    </Screen>
  );
}

function LsRose({ cx, cy, R }: { cx: number; cy: number; R: number }) {
  const s = useSimFrame(15);
  const dev = ilsDev(s);
  const rel = s.geo.rwyHdg - s.ac.hdg;
  const off = dev && dev.locValid ? -dev.locDots * R * 0.16 : 0;
  return (
    <g transform={`rotate(${rel} ${cx} ${cy})`}>
      {[-2, -1, 1, 2].map((d) => (
        <circle key={d} cx={cx + d * R * 0.16} cy={cy} r={4} fill="none" stroke={C.w} strokeWidth={1.5} />
      ))}
      <line x1={cx} y1={cy - R * 0.85} x2={cx} y2={cy - R * 0.45} stroke={C.m} strokeWidth={4} />
      <path d={`M ${cx - 10} ${cy - R * 0.72} L ${cx} ${cy - R * 0.85} L ${cx + 10} ${cy - R * 0.72}`} stroke={C.m} strokeWidth={4} fill="none" />
      <line x1={cx} y1={cy + R * 0.45} x2={cx} y2={cy + R * 0.85} stroke={C.m} strokeWidth={4} />
      {dev && dev.locValid && <line x1={cx + off} y1={cy - R * 0.4} x2={cx + off} y2={cy + R * 0.4} stroke={C.m} strokeWidth={4} />}
    </g>
  );
}
