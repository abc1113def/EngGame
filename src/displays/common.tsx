import type { ReactNode } from 'react';
import type { SimState } from '../sim/types';

export const C = {
  g: '#3dff6a',
  a: '#ffab1a',
  b: '#36e3ff',
  w: '#f4f4f4',
  m: '#ff5cff',
  r: '#ff3a3a',
  y: '#ffff38',
  gray: '#7d8790',
  sky: '#2a7fd4',
  gnd: '#8c5a2b',
};

/** Состояние экрана: выключен, самотестирование, работает */
export function duMode(powered: boolean, t: number, since: number | undefined, testLen = 5): 'off' | 'test' | 'on' {
  if (!powered || since === undefined) return 'off';
  return t - since < testLen ? 'test' : 'on';
}

export function Screen({ children, mode, label }: { children: ReactNode; mode: 'off' | 'test' | 'on'; label?: string }) {
  return (
    <svg viewBox="0 0 500 500" className="screen" preserveAspectRatio="xMidYMid meet">
      <rect x={0} y={0} width={500} height={500} fill={mode === 'off' ? '#020304' : '#000'} />
      {mode === 'test' && (
        <>
          <text x={250} y={235} fill={C.g} fontSize={20} textAnchor="middle" className="du-font">
            SELF TEST IN PROGRESS
          </text>
          <text x={250} y={265} fill={C.g} fontSize={16} textAnchor="middle" className="du-font">
            (MAX 40 SECONDS) {label}
          </text>
        </>
      )}
      {mode === 'on' && children}
    </svg>
  );
}

export function T({ x, y, c = C.w, s = 16, a = 'start', children, w, cls }: { x: number; y: number; c?: string; s?: number; a?: 'start' | 'middle' | 'end'; children: ReactNode; w?: number; cls?: string }) {
  return (
    <text x={x} y={y} fill={c} fontSize={s} textAnchor={a} className={`du-font ${cls ?? ''}`} fontWeight={w}>
      {children}
    </text>
  );
}

export function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as const;
}

export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number) {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

export function utc(s: SimState) {
  const t = 10 * 3600 + 42 * 60 + s.t;
  return [Math.floor(t / 3600) % 24, Math.floor(t / 60) % 60];
}
export const p2 = (n: number) => String(n).padStart(2, '0');

/** Заголовок страницы SD */
export function SdTitle({ t }: { t: string }) {
  return (
    <>
      <T x={14} y={28} s={20}>
        {t}
      </T>
      <line x1={14} y1={32} x2={14 + t.length * 11.5} y2={32} stroke={C.w} strokeWidth={1.5} />
    </>
  );
}
