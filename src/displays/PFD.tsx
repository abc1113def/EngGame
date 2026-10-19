import { vfe, speeds } from '../sim/flight';
import { attOk, dispPower, irOk } from '../sim/systems';
import { useSimFrame } from '../ui/hooks';
import { C, Screen, T, duMode, polar } from './common';

const K = 6.5; // px на градус тангажа

function Fma() {
  const s = useSimFrame(10);
  const f = s.fma;
  const blink = Math.floor(s.t * 2) % 2 === 0;
  const col5 = f.col5.split('|').filter(Boolean);
  const thrMan = f.thr.startsWith('MAN');
  return (
    <g>
      {[100, 200, 300, 400].map((x) => (
        <line key={x} x1={x} y1={4} x2={x} y2={58} stroke={C.w} strokeWidth={1.4} />
      ))}
      {thrMan ? (
        <>
          <rect x={8} y={6} width={86} height={42} fill="none" stroke={C.w} strokeWidth={1.4} />
          <T x={51} y={24} a="middle" s={15}>
            MAN
          </T>
          <T x={51} y={43} a="middle" s={14}>
            {f.thr.replace('MAN ', '')}
          </T>
        </>
      ) : (
        <T x={50} y={24} a="middle" c={C.g} s={16}>
          {f.thr}
        </T>
      )}
      {f.lvrClb && blink && (
        <T x={50} y={56} a="middle" s={13}>
          LVR CLB
        </T>
      )}
      <T x={150} y={24} a="middle" c={C.g} s={17}>
        {f.vert}
      </T>
      {f.vert === 'SRS' && !s.ac.onGround && (
        <T x={150} y={46} a="middle" c={C.b} s={14}>
          CLB
        </T>
      )}
      <T x={250} y={24} a="middle" c={C.g} s={17}>
        {f.lat}
      </T>
      {f.lat === 'RWY' && s.fms.sid && (
        <T x={250} y={46} a="middle" c={C.b} s={14}>
          NAV
        </T>
      )}
      {col5.map((t, i) => (
        <T key={t} x={450} y={20 + i * 18} a="middle" s={15} c={t === 'A/THR' && !s.ac.athrActive ? C.b : C.w}>
          {t}
        </T>
      ))}
    </g>
  );
}

function Attitude({ ok }: { ok: boolean }) {
  const s = useSimFrame(30);
  const { pitch, roll } = s.ac;
  if (!ok)
    return (
      <g>
        <T x={250} y={258} a="middle" c={C.r} s={30}>
          ATT
        </T>
      </g>
    );
  const ladder = [];
  for (let p = -30; p <= 30; p += 2.5) {
    if (p === 0) continue;
    const y = -p * K;
    const big = p % 10 === 0;
    const mid = p % 5 === 0;
    const w = big ? 50 : mid ? 26 : 12;
    ladder.push(<line key={p} x1={-w} y1={y} x2={w} y2={y} stroke={C.w} strokeWidth={1.6} />);
    if (big)
      ladder.push(
        <T key={'t' + p} x={-w - 6} y={y + 5} a="end" s={13}>
          {Math.abs(p)}
        </T>,
        <T key={'u' + p} x={w + 6} y={y + 5} s={13}>
          {Math.abs(p)}
        </T>,
      );
  }
  const fd = s.fcu.fd && s.fdPitch != null && !s.ac.onGround;
  const fdY = fd ? Math.max(-60, Math.min(60, -(s.fdPitch! - pitch) * K)) : 0;
  const ra = s.ac.alt - s.elev;
  return (
    <g>
      <defs>
        <clipPath id="attclip">
          <rect x={130} y={100} width={240} height={300} rx={30} />
        </clipPath>
      </defs>
      <g clipPath="url(#attclip)">
        <g transform={`translate(250,250) rotate(${-roll}) translate(0,${pitch * K})`}>
          <rect x={-400} y={-800} width={800} height={800} fill={C.sky} />
          <rect x={-400} y={0} width={800} height={800} fill={C.gnd} />
          <line x1={-400} y1={0} x2={400} y2={0} stroke={C.w} strokeWidth={2} />
          {ladder}
        </g>
      </g>
      {/* шкала крена */}
      <g>
        {[-45, -30, -20, -10, 0, 10, 20, 30, 45].map((a) => {
          const [x1, y1] = polar(250, 250, 128, a - 90);
          const [x2, y2] = polar(250, 250, a % 30 === 0 || a === 45 ? 140 : 135, a - 90);
          return <line key={a} x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.w} strokeWidth={2} />;
        })}
        <path d="M 244 106 L 256 106 L 250 117 Z" fill={C.y} />
        <g transform={`rotate(${-roll} 250 250)`}>
          <path d="M 243 132 L 257 132 L 250 121 Z" fill="none" stroke={C.y} strokeWidth={2} />
        </g>
      </g>
      {/* ФД */}
      {fd && (
        <g>
          <line x1={185} y1={250 + fdY} x2={315} y2={250 + fdY} stroke={C.g} strokeWidth={3} />
          <line x1={250} y1={190} x2={250} y2={310} stroke={C.g} strokeWidth={3} />
        </g>
      )}
      {/* символ самолёта */}
      <g stroke={C.y} strokeWidth={4} fill="#000">
        <path d="M 160 246 h 52 v 14 h -8 v -6 h -44 z" />
        <path d="M 340 246 h -52 v 14 h 8 v -6 h 44 z" />
        <rect x={245} y={245} width={10} height={10} />
      </g>
      {!s.ac.onGround && ra < 2500 && (
        <T x={250} y={385} a="middle" c={ra < 400 ? C.a : C.g} s={18}>
          {Math.round(ra / 10) * 10}
        </T>
      )}
    </g>
  );
}

function SpeedTape({ ok }: { ok: boolean }) {
  const s = useSimFrame(30);
  if (!ok)
    return (
      <T x={72} y={258} a="middle" c={C.r} s={24}>
        SPD
      </T>
    );
  const v = Math.max(30, s.ac.ias);
  const PX = 4;
  const y = (kt: number) => 250 - (kt - v) * PX;
  const ticks = [];
  for (let k = Math.floor((v - 40) / 10) * 10; k <= v + 40; k += 10) {
    if (k < 30) continue;
    ticks.push(<line key={k} x1={94} y1={y(k)} x2={106} y2={y(k)} stroke={C.w} strokeWidth={1.6} />);
    if (k % 20 === 0)
      ticks.push(
        <T key={'t' + k} x={88} y={y(k) + 6} a="end" s={17}>
          {k}
        </T>,
      );
  }
  const v1 = s.fms.v1;
  const tgt = s.flags.spdTarget as number | undefined;
  const vmax = vfe(s);
  const sp = speeds(s);
  const trend = ((s.flags.accel as number) || 0) * 10;
  return (
    <g>
      <defs>
        <clipPath id="spdclip">
          <rect x={30} y={100} width={80} height={300} />
        </clipPath>
      </defs>
      <rect x={30} y={100} width={80} height={300} fill="#3a4148" />
      <g clipPath="url(#spdclip)">
        {ticks}
        {v1 != null && s.ac.onGround && (
          <T x={112} y={y(v1) + 6} c={C.b} s={17}>
            1
          </T>
        )}
        {tgt != null && <path d={`M 106 ${y(tgt)} l 12 -8 v 16 z`} fill={C.m} />}
        {!s.ac.onGround && <rect x={104} y={y(sp.vls) } width={6} height={Math.max(0, (sp.vls - 30) * PX)} fill={C.a} opacity={0.9} />}
        {[...Array(12)].map((_, i) => (
          <rect key={i} x={104} y={y(vmax) - 400 + i * 34} width={6} height={17} fill={C.r} />
        ))}
        <rect x={104} y={y(vmax) - 400} width={6} height={400} fill="none" stroke={C.r} strokeWidth={1} />
      </g>
      {Math.abs(trend) > 2 && <line x1={100} y1={250} x2={100} y2={250 - trend * PX} stroke={C.y} strokeWidth={3} />}
      <line x1={30} y1={250} x2={118} y2={250} stroke={C.y} strokeWidth={3} />
      <path d="M 118 250 l 12 -7 v 14 z" fill={C.y} />
      {s.ac.onGround && s.ac.ias < 30 && <rect x={30} y={100} width={80} height={300} fill="#3a4148" opacity={0.6} />}
    </g>
  );
}

function AltTape({ ok }: { ok: boolean }) {
  const s = useSimFrame(30);
  const baro = s.fcu.baroStd ? 1013 : s.fcu.baro;
  if (!ok)
    return (
      <T x={420} y={258} a="middle" c={C.r} s={24}>
        ALT
      </T>
    );
  const alt = s.ac.alt + (baro - s.atc.qnh) * 27;
  const PX = 0.11;
  const y = (a: number) => 250 - (a - alt) * PX;
  const els = [];
  for (let a = Math.floor((alt - 1200) / 100) * 100; a <= alt + 1200; a += 100) {
    els.push(<line key={a} x1={378} y1={y(a)} x2={a % 500 === 0 ? 392 : 386} y2={y(a)} stroke={C.w} strokeWidth={1.6} />);
    if (a % 500 === 0)
      els.push(
        <T key={'t' + a} x={398} y={y(a) + 6} s={15}>
          {String(Math.round(a / 100)).padStart(2, '0')}
        </T>,
      );
  }
  const vs = s.ac.vs;
  const vsY = (v: number) => {
    const sgn = Math.sign(v);
    const a = Math.min(6000, Math.abs(v));
    const px = a <= 1000 ? a * 0.06 : a <= 2000 ? 60 + (a - 1000) * 0.035 : 95 + (a - 2000) * 0.012;
    return 250 - sgn * px;
  };
  return (
    <g>
      <defs>
        <clipPath id="altclip">
          <rect x={376} y={100} width={70} height={300} />
        </clipPath>
      </defs>
      <rect x={376} y={100} width={70} height={300} fill="#3a4148" />
      <g clipPath="url(#altclip)">{els}</g>
      <T x={410} y={92} a="middle" c={C.b} s={17}>
        {s.fcu.alt}
      </T>
      <rect x={378} y={234} width={84} height={32} fill="#000" stroke={C.y} strokeWidth={2} />
      <T x={455} y={257} a="end" c={C.g} s={20}>
        {Math.round(alt / 10) * 10}
      </T>
      <rect x={378} y={402} width={84} height={22} fill="#000" />
      <T x={381} y={420} c={C.b} s={15}>
        {s.fcu.baroStd ? 'STD' : `QNH ${s.fcu.baro}`}
      </T>
      {/* вариометр */}
      <path d="M 466 140 L 488 160 L 488 340 L 466 360 Z" fill="#3a4148" />
      {[-6000, -2000, -1000, 1000, 2000, 6000].map((v) => (
        <line key={v} x1={466} y1={vsY(v)} x2={474} y2={vsY(v)} stroke={C.w} strokeWidth={1.5} />
      ))}
      <line x1={500} y1={250} x2={470} y2={vsY(vs)} stroke={C.g} strokeWidth={3} />
      {Math.abs(vs) > 200 && (
        <T x={478} y={vs > 0 ? vsY(vs) - 6 : vsY(vs) + 18} a="middle" c={C.g} s={13}>
          {Math.round(Math.abs(vs) / 100)}
        </T>
      )}
    </g>
  );
}

function HdgTape({ ok }: { ok: boolean }) {
  const s = useSimFrame(20);
  if (!ok)
    return (
      <T x={250} y={452} a="middle" c={C.r} s={22}>
        HDG
      </T>
    );
  const h = s.ac.hdg;
  const PX = 5;
  const els = [];
  for (let d = Math.floor((h - 26) / 5) * 5; d <= h + 26; d += 5) {
    const x = 250 + (d - h) * PX;
    const dd = ((d % 360) + 360) % 360;
    els.push(<line key={d} x1={x} y1={430} x2={x} y2={dd % 10 === 0 ? 442 : 436} stroke={C.w} strokeWidth={1.6} />);
    if (dd % 10 === 0)
      els.push(
        <T key={'t' + d} x={x} y={462} a="middle" s={dd % 30 === 0 ? 17 : 14}>
          {String(dd / 10).padStart(2, '0')}
        </T>,
      );
  }
  return (
    <g>
      <defs>
        <clipPath id="hdgclip">
          <rect x={140} y={428} width={220} height={44} />
        </clipPath>
      </defs>
      <rect x={140} y={428} width={220} height={40} fill="#3a4148" />
      <g clipPath="url(#hdgclip)">{els}</g>
      <line x1={250} y1={422} x2={250} y2={446} stroke={C.y} strokeWidth={3} />
    </g>
  );
}

export function PFD() {
  const s = useSimFrame(10);
  const mode = duMode(dispPower(s), s.t, s.flags.acEssT as number | undefined);
  const att = attOk(s, 0);
  const adr = s.adirs.adr[0];
  return (
    <Screen mode={mode} label="PFD">
      <Fma />
      <Attitude ok={att} />
      <SpeedTape ok={adr} />
      <AltTape ok={adr} />
      <HdgTape ok={irOk(s, 0)} />
      {s.adirs.ir[0].aligning && (
        <T x={250} y={490} a="middle" c={C.w} s={13}>
          IR 1 ALIGN
        </T>
      )}
    </Screen>
  );
}
