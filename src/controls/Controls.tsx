import { useCallback, type CSSProperties, type ReactNode } from 'react';
import { CONTROLS } from '../sim/controls';
import { sim } from '../sim/sim';
import { useHl, useSim } from '../ui/hooks';

export function Wrap({ id, children, className = '', style, title }: { id?: string; children: ReactNode; className?: string; style?: CSSProperties; title?: string }) {
  const hl = useHl(id ?? '');
  return (
    <div data-ctl={id} className={`ctl ${hl ? 'hl' : ''} ${className}`} style={style} title={title}>
      {children}
    </div>
  );
}

/** Удержание кнопки мыши: press при нажатии, release при отпускании где угодно */
function holdHandlers(id: string, onDown?: () => boolean | void) {
  return {
    onMouseDown: (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      if (onDown && onDown() === false) return;
      sim.press(id);
      const up = () => {
        sim.release(id);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mouseup', up);
    },
  };
}

// ============================ кнопка ============================
export function Pb({
  id,
  label,
  w = 50,
  h = 44,
  noLabel,
  inner,
  className = '',
  red,
}: {
  id: string;
  label?: string;
  w?: number;
  h?: number;
  noLabel?: boolean;
  inner?: string;
  className?: string;
  red?: boolean;
}) {
  const d = CONTROLS[id];
  const ann = useSim((s) => s.ann[id] | 0);
  const sw = useSim((s) => s.sw[id] | 0);
  const mom = useSim((s) => !!s.momentary[id]);
  const open = useSim((s) => !!s.flags[`guard_${id}`]);
  const dim = useSim((s) => s.sw.ANN_LT === 0);
  if (!d) return <div className="ctl-missing">{id}</div>;
  const guarded = d.kind === 'guard' || d.kind === 'guardm';
  const latching = d.kind === 'pb' || d.kind === 'guard';
  const pressed = latching ? sw === 1 : mom;
  const handlers = holdHandlers(id, () => {
    if (guarded && !open) {
      sim.guard(id);
      return false;
    }
  });
  const ctx = (e: React.MouseEvent) => {
    e.preventDefault();
    if (guarded && open) sim.guard(id);
  };
  const leg = (part: 'up' | 'lo', bit: number) => {
    const L = d[part];
    if (!L) return null;
    const on = (ann & bit) !== 0;
    const fl = (ann & 4) !== 0 && on;
    return <div className={`leg ${part} c-${L.c} ${on ? 'on' : ''} ${fl ? 'flash' : ''} ${dim ? 'dim' : ''}`}>{L.t}</div>;
  };
  return (
    <Wrap id={id} className={`pbw ${className}`}>
      {!noLabel && <div className="pb-label">{label ?? d.label}</div>}
      <div className={`pb ${pressed ? 'in' : ''} ${red ? 'redpb' : ''}`} style={{ width: w, height: h }} {...handlers} onContextMenu={ctx}>
        {leg('up', 1)}
        {leg('lo', 2)}
        {inner && <div className="pb-inner">{inner}</div>}
        {guarded && <div className={`guard ${open ? 'open' : ''} ${red ? 'red' : ''}`} />}
      </div>
    </Wrap>
  );
}

/** Большая красная пожарная кнопка под крышкой */
export function FirePb({ id, label }: { id: string; label: string }) {
  const ann = useSim((s) => s.ann[id] | 0);
  const sw = useSim((s) => s.sw[id] | 0);
  const open = useSim((s) => !!s.flags[`guard_${id}`]);
  const handlers = holdHandlers(id, () => {
    if (!open) {
      sim.guard(id);
      return false;
    }
  });
  return (
    <Wrap id={id} className="firepbw">
      <div
        className={`firepb ${sw ? 'out' : ''} ${ann & 1 ? 'lit' : ''}`}
        {...handlers}
        onContextMenu={(e) => {
          e.preventDefault();
          if (open) sim.guard(id);
        }}
      >
        <div className="fire-txt">{label}</div>
        <div className="fire-push">PUSH</div>
        <div className={`guard fire ${open ? 'open' : ''}`} />
      </div>
    </Wrap>
  );
}

// ============================ лампа (не кнопка) ============================
export function Light({ id, text, color = 'amber', w = 46, h = 26 }: { id: string; text: string; color?: string; w?: number; h?: number }) {
  const ann = useSim((s) => s.ann[id] | 0);
  return (
    <div className="light-box" style={{ width: w, height: h }}>
      <div className={`leg one c-${color} ${ann ? 'on' : ''}`}>{text}</div>
    </div>
  );
}

// ============================ тумблер ============================
export function Toggle({ id, label, h = 64, labels }: { id: string; label?: string; h?: number; labels?: string[] }) {
  const d = CONTROLS[id];
  const v = useSim((s) => s.sw[id] | 0);
  const pos = labels ?? d.pos ?? ['OFF', 'ON'];
  const n = pos.length;
  const set = (nv: number) => sim.setSw(id, nv);
  const onClick = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const up = e.clientY - r.top < r.height / 2;
    set(up ? v + 1 : v - 1);
  };
  const onWheel = (e: React.WheelEvent) => set(e.deltaY < 0 ? v + 1 : v - 1);
  const top = ((n - 1 - v) / (n - 1)) * (h - 18);
  return (
    <Wrap id={id} className="togglew">
      <div className="pb-label">{label ?? d.label}</div>
      <div className="toggle" style={{ height: h }} onClick={onClick} onWheel={onWheel}>
        <div className="tg-slot" />
        <div className="tg-knob" style={{ top }} />
        <div className="tg-labels">
          {pos
            .map((p, i) => (
              <div key={i} className={`tg-l ${i === v ? 'sel' : ''}`} style={{ top: ((n - 1 - i) / (n - 1)) * (h - 18) + 2 }}>
                {p}
              </div>
            ))
            .reverse()}
        </div>
      </div>
    </Wrap>
  );
}

// ============================ галетник ============================
export function Rotary({ id, label, size = 40, spread, labels }: { id: string; label?: string; size?: number; spread?: number; labels?: string[] }) {
  const d = CONTROLS[id];
  const v = useSim((s) => s.sw[id] | 0);
  const pos = labels ?? d.pos ?? [];
  const n = pos.length;
  const sp = spread ?? (n <= 3 ? 90 : n <= 5 ? 140 : 220);
  const ang = (i: number) => (n === 1 ? 0 : -sp / 2 + (sp * i) / (n - 1));
  const set = useCallback((nv: number) => sim.setSw(id, nv), [id]);
  const onClick = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    set(e.clientX - r.left < r.width / 2 ? v - 1 : v + 1);
  };
  const box = size * 2.4;
  const R = size * 0.82;
  return (
    <Wrap id={id} className="rotw">
      <div className="pb-label">{label ?? d.label}</div>
      <div className="rot" style={{ width: box, height: size * 1.85 }} onClick={onClick} onWheel={(e) => set(e.deltaY < 0 ? v + 1 : v - 1)}>
        {pos.map((p, i) => {
          const a = ((ang(i) - 90) * Math.PI) / 180;
          return (
            <div key={i} className={`rot-l ${i === v ? 'sel' : ''}`} style={{ left: box / 2 + Math.cos(a) * R, top: size * 1.05 + Math.sin(a) * R }}>
              {p}
            </div>
          );
        })}
        <div className="rot-knob" style={{ width: size * 0.78, height: size * 0.78, left: box / 2 - size * 0.39, top: size * 1.05 - size * 0.39, transform: `rotate(${ang(v)}deg)` }}>
          <div className="rot-ptr" />
        </div>
      </div>
    </Wrap>
  );
}

// ============================ плавная ручка ============================
export function Knob({ id, label, size = 34, value, act = id, ends }: { id: string; label?: string; size?: number; value?: number; act?: string; ends?: [string, string] }) {
  const d = CONTROLS[id];
  const v = useSim((s) => (value != null ? value : s.sw[id] ?? 0.5));
  const onClick = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    sim.knob(act, e.clientX - r.left < r.width / 2 ? -1 : 1);
  };
  const a = -135 + 270 * Math.max(0, Math.min(1, v));
  return (
    <Wrap id={id} className="knobw">
      {label !== '' && <div className="pb-label">{label ?? d?.label}</div>}
      <div className="knob-area" style={{ width: size * 1.9 }} onClick={onClick} onWheel={(e) => sim.knob(act, e.deltaY < 0 ? 1 : -1)}>
        <div className="knob" style={{ width: size, height: size, transform: `rotate(${a}deg)` }}>
          <div className="rot-ptr" />
        </div>
        {ends && (
          <div className="knob-ends">
            <span>{ends[0]}</span>
            <span>{ends[1]}</span>
          </div>
        )}
      </div>
    </Wrap>
  );
}

/** Ручка FCU / RMP без шкалы */
export function FcuKnob({ id, act = id, size = 46, ring }: { id: string; act?: string; size?: number; ring?: boolean }) {
  const onWheel = (e: React.WheelEvent) => {
    const inner = ring && isInner(e, size);
    sim.knob(act, e.deltaY < 0 ? 1 : -1, inner ? 'inner' : 'outer');
  };
  const onClick = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const inner = ring && isInner(e, size);
    sim.knob(act, e.clientX - r.left < r.width / 2 ? -1 : 1, inner ? 'inner' : 'outer');
  };
  return (
    <Wrap id={id} className="fcuknobw">
      <div className={`fcuknob ${ring ? 'ring' : ''}`} style={{ width: size, height: size }} onWheel={onWheel} onClick={onClick} onContextMenu={(e) => e.preventDefault()}>
        {ring && <div className="fcuknob-in" />}
      </div>
    </Wrap>
  );
}
function isInner(e: React.MouseEvent | React.WheelEvent, size: number) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const dx = e.clientX - (r.left + r.width / 2);
  const dy = e.clientY - (r.top + r.height / 2);
  return Math.hypot(dx, dy) < size * 0.28;
}

// ============================ цифровое табло ============================
export function Digits({ text, color = 'green', w, small }: { text: string; color?: string; w?: number; small?: boolean }) {
  return (
    <div className={`digits c-${color} ${small ? 'sm' : ''}`} style={{ width: w }}>
      {text}
    </div>
  );
}

export function Mod({ x, y, w, h, title, children, className = '', titleColor }: { x: number; y: number; w: number; h: number; title?: string; children: ReactNode; className?: string; titleColor?: string }) {
  return (
    <div className={`mod ${className}`} style={{ left: x, top: y, width: w, height: h }}>
      {title && (
        <div className="mod-title" style={titleColor ? { color: titleColor } : undefined}>
          <span>{title}</span>
        </div>
      )}
      <div className="mod-body">{children}</div>
    </div>
  );
}

export function Row({ children, gap = 10, style, className = '' }: { children: ReactNode; gap?: number; style?: CSSProperties; className?: string }) {
  return (
    <div className={`row ${className}`} style={{ gap, ...style }}>
      {children}
    </div>
  );
}

export function Col({ children, gap = 6, style }: { children: ReactNode; gap?: number; style?: CSSProperties }) {
  return (
    <div className="col" style={{ gap, ...style }}>
      {children}
    </div>
  );
}
