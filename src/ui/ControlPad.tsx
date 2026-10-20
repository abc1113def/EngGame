import { useEffect, useRef, type ReactNode } from 'react';
import { tlaDetent } from '../sim/engines';
import { sim } from '../sim/sim';
import type { L } from '../sim/types';
import { doAction, hold, releaseAll, type ActionId, type HoldKey } from './actions';
import { setSettings, useSettings, useSimFrame, useT } from './hooks';

const r = (ru: string, en: string): L => ({ ru, en });

/** Кнопка с автоповтором при удержании (тяга, триммер) */
function RepBtn({ a, children, title, wide }: { a: ActionId; children: ReactNode; title?: string; wide?: boolean }) {
  const timer = useRef<number[]>([]);
  const stop = () => {
    for (const id of timer.current) {
      clearTimeout(id);
      clearInterval(id);
    }
    timer.current = [];
  };
  useEffect(() => stop, []);
  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    doAction(a);
    stop();
    timer.current.push(
      window.setTimeout(() => {
        timer.current.push(window.setInterval(() => doAction(a), 110));
      }, 380),
    );
  };
  return (
    <button className={`pad-btn ${wide ? 'wide' : ''}`} title={title} onPointerDown={down} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} onContextMenu={(e) => e.preventDefault()}>
      {children}
    </button>
  );
}

/** Одиночное нажатие (переключатели) */
function TapBtn({ a, children, title, on }: { a: ActionId; children: ReactNode; title?: string; on?: boolean }) {
  return (
    <button
      className={`pad-btn ${on ? 'on' : ''}`}
      title={title}
      onPointerDown={(e) => {
        e.preventDefault();
        doAction(a);
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

/** Удерживаемая кнопка (тормоза, педали) */
function HoldBtn({ k, children, title, wide }: { k: HoldKey; children: ReactNode; title?: string; wide?: boolean }) {
  const s = useSimFrame(15);
  const on = !!s.keys[k];
  const up = () => hold(k, false);
  return (
    <button
      className={`pad-btn hold ${on ? 'on' : ''} ${wide ? 'wide' : ''}`}
      title={title}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        hold(k, true);
      }}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

/** Ручка управления / штурвал: перетаскивание пальцем или мышью, отпускание — в нейтраль */
function StickPad() {
  const ref = useRef<HTMLDivElement>(null);
  const s = useSimFrame(20);
  const t = useT();
  const set = (e: React.PointerEvent) => {
    const b = ref.current!.getBoundingClientRect();
    const x = ((e.clientX - b.left) / b.width) * 2 - 1;
    const y = ((e.clientY - b.top) / b.height) * 2 - 1;
    sim.s.flags.stickMouse = true;
    sim.s.flags.stickPad = true;
    sim.s.ac.stickR = Math.max(-1, Math.min(1, x));
    sim.s.ac.stickP = Math.max(-1, Math.min(1, y)); // вниз = на себя
  };
  const end = () => {
    sim.s.flags.stickMouse = false;
    sim.s.flags.stickPad = false;
  };
  const sr = s.ac.stickR;
  const sp = s.ac.stickP;
  return (
    <div
      className="pad-stick"
      ref={ref}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        set(e);
      }}
      onPointerMove={(e) => {
        if (sim.s.flags.stickPad) set(e);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <div className="pad-stick-x" />
      <div className="pad-stick-dot" style={{ left: `${50 + sr * 42}%`, top: `${50 + sp * 42}%` }} />
      <span className="pad-stick-l t">{t(r('от себя', 'push'))}</span>
      <span className="pad-stick-l b">{t(r('на себя', 'pull'))}</span>
    </div>
  );
}

function Row({ label, value, children }: { label: string; value?: ReactNode; children: ReactNode }) {
  return (
    <div className="pad-row">
      <div className="pad-lbl">
        <span>{label}</span>
        {value !== undefined && <b>{value}</b>}
      </div>
      <div className="pad-btns">{children}</div>
    </div>
  );
}

function Pad() {
  const s = useSimFrame(8);
  const t = useT();
  const c172 = s.type === 'c172';
  const flaps = c172 ? ['UP', '10°', '20°', '30°'][s.sw.C_FLAPS] : ['0', '1', '2', '3', 'FULL'][s.sw.FLAPS];
  const park = c172 ? s.sw.C_PARK === 1 : s.sw.PARK_BRK === 1;
  const thrTxt = c172
    ? `${Math.round(s.sw.C_THR * 100)}% · ${Math.round(s.c.rpm / 10) * 10} RPM`
    : `${tlaDetent(s.sw.TL1)} · N1 ${Math.round(s.eng[0].n1)}/${Math.round(s.eng[1].n1)}%`;
  return (
    <div className="pad-body">
      <div className="pad-grid">
        <div className="pad-col">
          <Row label={t(c172 ? r('Газ', 'Throttle') : r('Тяга (РУД)', 'Thrust levers'))} value={thrTxt}>
            <TapBtn a="thrIdle" title="F1 / Home">
              {c172 ? 'IDLE' : 'IDLE'}
            </TapBtn>
            <RepBtn a="thrDec" title="F2 / PgDn / −">
              −
            </RepBtn>
            <RepBtn a="thrInc" title="F3 / PgUp / =">
              +
            </RepBtn>
            <TapBtn a="thrMax" title="F4 / End">
              {c172 ? 'FULL' : 'TOGA'}
            </TapBtn>
          </Row>
          {c172 && (
            <Row label={t(r('Смесь', 'Mixture'))} value={s.sw.C_MIX < 0.05 ? 'CUTOFF' : s.sw.C_MIX > 0.85 ? 'RICH' : `${Math.round(s.sw.C_MIX * 100)}%`}>
              <RepBtn a="mixDec" title="Shift + −" wide>
                − {t(r('беднее', 'lean'))}
              </RepBtn>
              <RepBtn a="mixInc" title="Shift + =" wide>
                + {t(r('богаче', 'rich'))}
              </RepBtn>
            </Row>
          )}
          <Row label={t(r('Триммер', 'Trim'))} value={c172 ? `${s.c.trim > 0 ? '+' : ''}${s.c.trim.toFixed(2)}` : `${s.ac.pitchTrim >= 0 ? 'UP ' : 'DN '}${Math.abs(s.ac.pitchTrim).toFixed(1)}`}>
            <RepBtn a="trimDn" title="[" wide>
              ▼ {t(r('нос вниз', 'nose dn'))}
            </RepBtn>
            <RepBtn a="trimUp" title="]" wide>
              ▲ {t(r('нос вверх', 'nose up'))}
            </RepBtn>
          </Row>
          <Row label={t(r('Закрылки', 'Flaps'))} value={flaps}>
            <TapBtn a="flapsRet" title={t(r('Убрать на одну позицию (R)', 'One step up (R)'))}>
              ▲ {t(r('убр.', 'up'))}
            </TapBtn>
            <TapBtn a="flapsExt" title={t(r('Выпустить на одну позицию (F)', 'One step down (F)'))}>
              ▼ {t(r('вып.', 'down'))}
            </TapBtn>
            {!c172 && (
              <TapBtn a="gear" title="G" on={s.sw.GEAR === 1}>
                {t(r('Шасси', 'Gear'))} {s.sw.GEAR === 1 ? '▼' : '▲'}
              </TapBtn>
            )}
          </Row>
          <Row label={t(r('Тормоза', 'Brakes'))}>
            <HoldBtn k="brake" title="B" wide>
              ■ {t(r('Тормоз (держать)', 'Brake (hold)'))}
            </HoldBtn>
            <TapBtn a="park" title="P" on={park}>
              PARK {park ? 'ON' : 'OFF'}
            </TapBtn>
          </Row>
        </div>
        <div className="pad-col stick">
          <div className="pad-lbl">
            <span>{t(c172 ? r('Штурвал', 'Yoke') : r('Ручка', 'Sidestick'))}</span>
          </div>
          <StickPad />
          <div className="pad-lbl">
            <span>{t(r('Педали', 'Rudder'))}</span>
          </div>
          <div className="pad-btns">
            <HoldBtn k="rudL" title="Z">
              ◀
            </HoldBtn>
            <HoldBtn k="rudR" title="X">
              ▶
            </HoldBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Экранный пульт под вкладками боковой панели */
export function ControlPad() {
  const st = useSettings();
  const t = useT();
  const open = !!st.pad;
  useEffect(() => () => releaseAll(), []);
  return (
    <div className={`pad ${open ? 'open' : ''}`}>
      <button className="pad-head" onClick={() => setSettings({ pad: !open })}>
        🎮 {t(r('Экранный пульт', 'On-screen controls'))}
        <span className="dim">{t(open ? r('скрыть ▼', 'hide ▼') : r('показать ▲', 'show ▲'))}</span>
      </button>
      {open && <Pad />}
    </div>
  );
}
