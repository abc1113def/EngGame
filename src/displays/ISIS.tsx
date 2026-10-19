import { useSimFrame } from '../ui/hooks';
import { C } from './common';

export function ISIS() {
  const s = useSimFrame(15);
  const pwr = s.elec.dcEss;
  const t0 = s.flags.powerOnT as number | undefined;
  const since = t0 != null ? s.t - t0 : 0;
  const aligned = pwr && since > 90;
  const K = 4;
  return (
    <svg viewBox="0 0 300 300" className="screen">
      <rect width={300} height={300} fill={pwr ? '#000' : '#020304'} />
      {pwr && (
        <>
          <defs>
            <clipPath id="isisclip">
              <rect x={60} y={40} width={180} height={220} />
            </clipPath>
          </defs>
          {aligned ? (
            <g clipPath="url(#isisclip)">
              <g transform={`translate(150,150) rotate(${-s.ac.roll}) translate(0,${s.ac.pitch * K})`}>
                <rect x={-300} y={-600} width={600} height={600} fill={C.sky} />
                <rect x={-300} y={0} width={600} height={600} fill={C.gnd} />
                <line x1={-300} y1={0} x2={300} y2={0} stroke="#fff" strokeWidth={2} />
                {[-20, -10, 10, 20].map((p) => (
                  <line key={p} x1={-30} y1={-p * K} x2={30} y2={-p * K} stroke="#fff" strokeWidth={1.5} />
                ))}
              </g>
            </g>
          ) : (
            <text x={150} y={110} fill={C.r} fontSize={22} textAnchor="middle" className="du-font">
              ATT {Math.max(0, Math.ceil(90 - since))}s
            </text>
          )}
          <path d="M 110 150 h 30 v 8 M 190 150 h -30 v 8" stroke={C.y} strokeWidth={4} fill="none" />
          <rect x={4} y={135} width={56} height={30} fill="#000" stroke="#fff" />
          <text x={56} y={158} fill="#fff" fontSize={20} textAnchor="end" className="du-font">
            {s.ac.ias < 30 ? '---' : Math.round(s.ac.ias)}
          </text>
          <rect x={240} y={135} width={58} height={30} fill="#000" stroke="#fff" />
          <text x={295} y={158} fill={C.g} fontSize={18} textAnchor="end" className="du-font">
            {Math.round((s.ac.alt + (s.fcu.baro - s.atc.qnh) * 27) / 10) * 10}
          </text>
          <text x={270} y={290} fill={C.b} fontSize={16} textAnchor="middle" className="du-font">
            {s.fcu.baro}
          </text>
          <text x={10} y={28} fill="#fff" fontSize={14} className="du-font">
            ISIS
          </text>
        </>
      )}
    </svg>
  );
}
