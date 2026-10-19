import { useState } from 'react';
import type { WalkId } from '../sim/c172/walk';
import { sim } from '../sim/sim';
import type { L, SimState } from '../sim/types';
import { useHl, useSimFrame, useT } from '../ui/hooks';

interface Spot {
  id: WalkId;
  x: number;
  y: number;
  label: L;
  done: (s: SimState) => boolean;
  side?: 'l' | 'r';
}

const r = (ru: string, en: string): L => ({ ru, en });

/** Точки осмотра на виде сверху (нос — вверх; левое крыло — слева) */
const SPOTS: Spot[] = [
  { id: 'docs', x: 545, y: 395, label: r('Документы', 'Documents'), done: (s) => !!s.flags.cDocs, side: 'r' },
  { id: 'lock', x: 500, y: 340, label: r('Струбцина рулей', 'Control lock'), done: (s) => !s.c.pre.lock, side: 'r' },
  { id: 'door', x: 452, y: 418, label: r('Двери', 'Doors'), done: (s) => s.c.pre.doors },
  { id: 'prop', x: 500, y: 92, label: r('Винт и кок', 'Propeller & spinner'), done: (s) => !!s.flags.cPropChk, side: 'r' },
  { id: 'oil', x: 470, y: 178, label: r('Масло (щуп)', 'Oil dipstick'), done: (s) => s.c.pre.oilChecked && s.c.pre.oilQt >= 5 },
  { id: 'strainer', x: 530, y: 232, label: r('Отстойник фильтра', 'Fuel strainer'), done: (s) => !!s.flags.strainer_ok, side: 'r' },
  { id: 'chocks', x: 560, y: 470, label: r('Колодки', 'Chocks'), done: (s) => !s.c.pre.chocks, side: 'r' },
  { id: 'stall', x: 285, y: 292, label: r('Сигнализатор сваливания', 'Stall warning'), done: (s) => !!s.flags.cStallChk },
  { id: 'fuelL', x: 345, y: 322, label: r('Бак Л (визуально)', 'Left tank (visual)'), done: (s) => !!s.flags.fuelL_chk },
  { id: 'sumpL', x: 375, y: 362, label: r('Отстой бака Л', 'Left sump'), done: (s) => !!s.flags.sumpL_ok && s.c.pre.sumpWater === 0 },
  { id: 'pitot', x: 215, y: 362, label: r('ПВД (чехол)', 'Pitot tube (cover)'), done: (s) => !s.c.pre.pitotCover },
  { id: 'tieL', x: 122, y: 330, label: r('Швартовка Л', 'Left tie-down'), done: (s) => !!s.flags.tieL_off },
  { id: 'fuelR', x: 655, y: 322, label: r('Бак П (визуально)', 'Right tank (visual)'), done: (s) => !!s.flags.fuelR_chk, side: 'r' },
  { id: 'sumpR', x: 625, y: 362, label: r('Отстой бака П', 'Right sump'), done: (s) => !!s.flags.sumpR_ok, side: 'r' },
  { id: 'tieR', x: 878, y: 330, label: r('Швартовка П', 'Right tie-down'), done: (s) => !!s.flags.tieR_off, side: 'r' },
  { id: 'tail', x: 500, y: 650, label: r('Оперение', 'Empennage'), done: (s) => !!s.flags.cTailChk, side: 'r' },
  { id: 'tieT', x: 500, y: 712, label: r('Швартовка хвоста', 'Tail tie-down'), done: (s) => !!s.flags.tieT_off, side: 'r' },
];

function Hotspot({ sp, s, onClick }: { sp: Spot; s: SimState; onClick: () => void }) {
  const t = useT();
  const hl = useHl('W_' + sp.id);
  const done = sp.done(s);
  const lx = sp.side === 'r' ? sp.x + 18 : sp.x - 18;
  return (
    <g className="w-spot" onClick={onClick} data-ctl={'W_' + sp.id}>
      {hl && <circle cx={sp.x} cy={sp.y} r={22} fill="none" stroke="#ffd000" strokeWidth={4} className="w-hl" />}
      <circle cx={sp.x} cy={sp.y} r={12} fill={done ? '#2fbf5a' : '#f2a516'} stroke="#111" strokeWidth={2} />
      <text x={sp.x} y={sp.y + 4} fontSize={12} textAnchor="middle" fill="#111" fontWeight={700}>
        {done ? '✓' : '?'}
      </text>
      <text x={lx} y={sp.y + 4} fontSize={13} textAnchor={sp.side === 'r' ? 'start' : 'end'} fill="#e8eef2" className="w-lbl">
        {t(sp.label)}
      </text>
    </g>
  );
}

/** Вид сверху на Cessna 172 */
function Plane({ s }: { s: SimState }) {
  const p = s.c.pre;
  return (
    <g>
      {/* крыло */}
      <path d="M 100 300 L 900 300 L 900 352 Q 500 362 100 352 Z" fill="#eef0f2" stroke="#9aa3ab" strokeWidth={2} />
      <path d="M 100 344 L 250 346 L 250 352 L 100 352 Z M 750 346 L 900 344 L 900 352 L 750 352 Z" fill="#b51a22" />
      <path d="M 300 352 L 470 356 L 470 364 L 300 360 Z M 530 356 L 700 352 L 700 360 L 530 364 Z" fill="#d7dbdf" stroke="#9aa3ab" />
      {/* фюзеляж */}
      <path d="M 470 140 Q 500 112 530 140 L 545 300 L 548 440 L 520 640 L 480 640 L 452 440 L 455 300 Z" fill="#f4f5f6" stroke="#9aa3ab" strokeWidth={2} />
      <path d="M 462 300 L 538 300 L 540 420 L 460 420 Z" fill="#7fb2d6" opacity={0.65} />
      <path d="M 455 330 L 545 330" stroke="#b51a22" strokeWidth={3} />
      {/* хвост */}
      <path d="M 400 630 L 600 630 L 590 668 L 410 668 Z" fill="#eef0f2" stroke="#9aa3ab" strokeWidth={2} />
      <path d="M 496 600 L 504 600 L 506 700 L 494 700 Z" fill="#c8cdd1" stroke="#9aa3ab" />
      {/* винт */}
      <ellipse cx={500} cy={112} rx={14} ry={10} fill="#d7d7d2" stroke="#666" />
      <path d="M 410 108 L 590 108 L 590 116 L 410 116 Z" fill="#1d1d1d" />
      {/* шасси */}
      <rect x={493} y={196} width={14} height={26} rx={4} fill="#222" />
      <rect x={412} y={436} width={16} height={34} rx={5} fill="#222" />
      <rect x={572} y={436} width={16} height={34} rx={5} fill="#222" />
      {/* колодки */}
      {p.chocks && (
        <g fill="#f2c200" stroke="#5a4800">
          <rect x={404} y={472} width={32} height={8} />
          <rect x={564} y={472} width={32} height={8} />
          <rect x={485} y={224} width={30} height={7} />
        </g>
      )}
      {/* швартовка */}
      {!s.flags.tieL_off && <line x1={122} y1={330} x2={80} y2={380} stroke="#e8e0c0" strokeWidth={3} strokeDasharray="5 3" />}
      {!s.flags.tieR_off && <line x1={878} y1={330} x2={920} y2={380} stroke="#e8e0c0" strokeWidth={3} strokeDasharray="5 3" />}
      {!s.flags.tieT_off && <line x1={500} y1={712} x2={500} y2={760} stroke="#e8e0c0" strokeWidth={3} strokeDasharray="5 3" />}
      {/* чехол ПВД */}
      {p.pitotCover && <rect x={200} y={356} width={30} height={10} rx={3} fill="#e02020" />}
      {p.pitotCover && (
        <text x={176} y={392} fontSize={10} fill="#ff8a8a">
          REMOVE BEFORE FLIGHT
        </text>
      )}
      <text x={500} y={540} fontSize={14} textAnchor="middle" fill="#7d8790" fontWeight={700}>
        F-HCLD
      </text>
    </g>
  );
}

export function Walkaround() {
  const s = useSimFrame(8);
  const t = useT();
  const [msg, setMsg] = useState<L | null>(null);
  const click = (id: WalkId) => setMsg(sim.walk(id));
  const p = s.c.pre;
  const done = SPOTS.filter((sp) => sp.done(s)).length;
  return (
    <div className="canvas walk" style={{ width: 1600, height: 900 }}>
      <div className="w-ground">
        <svg viewBox="0 0 1000 800" width={1000} height={800}>
          <rect x={0} y={0} width={1000} height={800} fill="#3b4148" />
          <path d="M 0 790 L 1000 790" stroke="#e8c547" strokeWidth={4} strokeDasharray="20 14" />
          <Plane s={s} />
          {SPOTS.map((sp) => (
            <Hotspot key={sp.id} sp={sp} s={s} onClick={() => click(sp.id)} />
          ))}
        </svg>
      </div>
      <div className="w-side">
        <h2>{t({ ru: 'Предполётный осмотр', en: 'Pre-flight walk-around' })}</h2>
        <div className="w-prog">
          {done}/{SPOTS.length} · {t({ ru: 'по часовой стрелке от кабины', en: 'clockwise from the cabin' })}
        </div>
        <div className={`w-msg ${msg && /WATER|ВОДА|BELOW|НИЖЕ|running|работает/.test(msg.en + msg.ru) ? 'bad' : ''}`}>{msg ? t(msg) : t({ ru: 'Нажмите на точку осмотра на самолёте.', en: 'Click an inspection point on the aircraft.' })}</div>
        {p.oilChecked && p.oilQt < 8 && (
          <button className="w-btn" onClick={() => click('oilAdd')}>
            🛢 {t({ ru: 'Долить 1 кварту масла', en: 'Add 1 qt of oil' })} ({p.oilQt.toFixed(1)} qt)
          </button>
        )}
        <div className="w-list">
          {SPOTS.map((sp) => (
            <div key={sp.id} className={`w-it ${sp.done(s) ? 'ok' : ''}`} onClick={() => click(sp.id)}>
              <span>{sp.done(s) ? '✓' : '○'}</span> {t(sp.label)}
            </div>
          ))}
        </div>
        <div className="w-note dim">
          {t({
            ru: 'Колодки, швартовку и чехол ПВД после полёта установите обратно. Струбцину рулей можно снять и здесь, и в кабине.',
            en: 'After the flight, put the chocks, tie-downs and pitot cover back. The control lock can be removed here or in the cockpit.',
          })}
        </div>
      </div>
    </div>
  );
}
