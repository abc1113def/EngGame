import { useEffect, useState } from 'react';
import type { Mode, Report } from '../game/game';
import { STEP_BY_ID } from '../game/procedure';
import { KEYS_HELP, UI } from '../i18n/ui';
import { CONTROLS } from '../sim/controls';
import type { FailureLevel } from '../sim/types';
import { setSettings, useSettings, useT, useLang } from './hooks';
import { sim } from '../sim/sim';

export function StartMenu({ onStart }: { onStart: (mode: Mode) => void }) {
  const st = useSettings();
  const t = useT();
  const [mode, setMode] = useState<Mode>('tutorial');
  const [help, setHelp] = useState(false);
  return (
    <div className="overlay">
      <div className="menu">
        <div className="menu-logo">
          <svg viewBox="0 0 120 40" width={120} height={40}>
            <path d="M5 22 L60 18 L100 8 L108 10 L80 22 L112 24 L114 28 L80 28 L100 36 L94 37 L60 30 L5 26 Z" fill="#36e3ff" />
          </svg>
          <div>
            <h1>A320 · COLD &amp; DARK</h1>
            <div className="dim">{t({ ru: 'Запуск самолёта от полностью обесточенного состояния до взлёта', en: 'From a completely dark aircraft to take-off' })}</div>
          </div>
        </div>
        <div className="menu-sec">
          <div className="menu-h">{t(UI.mode)}</div>
          <div className="mode-cards">
            {(['tutorial', 'exam'] as Mode[]).map((m) => (
              <div key={m} className={`mode-card ${mode === m ? 'sel' : ''}`} onClick={() => setMode(m)}>
                <b>{t(m === 'tutorial' ? UI.tutorial : UI.exam)}</b>
                <div>{t(m === 'tutorial' ? UI.tutorialDesc : UI.examDesc)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="menu-grid">
          <div className="menu-sec">
            <div className="menu-h">{t(UI.failures)}</div>
            {(['off', 'light', 'full'] as FailureLevel[]).map((f) => (
              <label key={f} className="radio">
                <input type="radio" checked={st.failures === f} onChange={() => setSettings({ failures: f })} />
                {t(f === 'off' ? UI.failOff : f === 'light' ? UI.failLight : UI.failFull)}
              </label>
            ))}
          </div>
          <div className="menu-sec">
            <div className="menu-h">{t(UI.align)}</div>
            <label className="radio">
              <input type="radio" checked={st.fastAlign} onChange={() => setSettings({ fastAlign: true })} />
              {t(UI.alignFast)}
            </label>
            <label className="radio">
              <input type="radio" checked={!st.fastAlign} onChange={() => setSettings({ fastAlign: false })} />
              {t(UI.alignReal)}
            </label>
          </div>
          <div className="menu-sec">
            <div className="menu-h">{t(UI.lang)}</div>
            <div className="seg">
              <button className={st.lang === 'ru' ? 'sel' : ''} onClick={() => setSettings({ lang: 'ru' })}>
                Русский
              </button>
              <button className={st.lang === 'en' ? 'sel' : ''} onClick={() => setSettings({ lang: 'en' })}>
                English
              </button>
            </div>
            <label className="radio" style={{ marginTop: 10 }}>
              <input type="checkbox" checked={st.sound} onChange={() => setSettings({ sound: !st.sound })} />
              {t(UI.sound)}
            </label>
          </div>
        </div>
        <button className="big primary" onClick={() => onStart(mode)}>
          {t(UI.start)} ▶
        </button>
        <button className="link" onClick={() => setHelp(!help)}>
          {t(UI.controlsHelp)} {help ? '▲' : '▼'}
        </button>
        {help && (
          <table className="keys">
            <tbody>
              {KEYS_HELP.map((k) => (
                <tr key={k.k}>
                  <td>
                    <kbd>{k.k}</kbd>
                  </td>
                  <td>{t(k.d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="note dim">{t(UI.desktop)}</div>
        <div className="note dim">{t(UI.disclaimer)}</div>
      </div>
    </div>
  );
}

export function Debrief({ rep, mode, onAgain, onClose }: { rep: Report; mode: Mode; onAgain: () => void; onClose: () => void }) {
  const t = useT();
  const title = {
    success: { ru: '✈ Взлёт выполнен', en: '✈ Take-off complete' },
    rto: { ru: '■ Взлёт прерван', en: '■ Rejected take-off' },
    fire: { ru: '🔥 Пожар ликвидирован', en: '🔥 Fire handled' },
    fail: { ru: '✗ Полёт не выполнен', en: '✗ Flight failed' },
    '': { ru: t(UI.ended), en: t(UI.ended) },
  }[rep.result || ''];
  const mm = Math.floor(rep.time / 60);
  const ss = Math.floor(rep.time) % 60;
  return (
    <div className="overlay">
      <div className="menu debrief">
        <h1 className={rep.result === 'fail' ? 'bad' : 'ok'}>{t(title)}</h1>
        <div className="dim">{t(rep.reason)}</div>
        <div className="deb-stats">
          {mode === 'exam' && (
            <>
              <div>
                <span>{t(UI.score)}</span>
                <b>{rep.score}</b>
              </div>
              <div>
                <span>{t(UI.grade)}</span>
                <b>{t(rep.grade)}</b>
              </div>
            </>
          )}
          <div>
            <span>{t(UI.time)}</span>
            <b>
              {mm}:{String(ss).padStart(2, '0')}
            </b>
          </div>
          <div>
            <span>{t(UI.stepsDone)}</span>
            <b>
              {rep.done}/{rep.total}
            </b>
          </div>
        </div>
        <div className="menu-h">{t(UI.penalties)}</div>
        <div className="deb-items">
          {rep.items.length === 0 && <div className="ok">{t(UI.noPenalties)}</div>}
          {rep.items.map((it, i) => (
            <div key={i} className={it.pts < 0 ? 'pen' : 'bon'}>
              <b>{it.pts > 0 ? '+' + it.pts : it.pts}</b> {t(it.text)}
            </div>
          ))}
        </div>
        {rep.missed.length > 0 && (
          <>
            <div className="menu-h">{t(UI.missedSteps)}</div>
            <div className="deb-items">
              {rep.missed.map((id) => (
                <div key={id} className="pen">
                  {t(STEP_BY_ID[id].title)}
                </div>
              ))}
            </div>
          </>
        )}
        <div className="row" style={{ gap: 12, justifyContent: 'center', marginTop: 14 }}>
          <button className="big primary" onClick={onAgain}>
            {t(UI.playAgain)}
          </button>
          <button className="big" onClick={onClose}>
            {t(UI.close)}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Всплывающая подсказка над органами управления */
export function Tooltip() {
  const lang = useLang();
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null);
  useEffect(() => {
    let cur = '';
    const over = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest?.('[data-ctl]') as HTMLElement | null;
      const id = el?.dataset.ctl ?? '';
      if (!id || (!CONTROLS[id] && id !== 'MCDU')) {
        if (cur) setTip(null);
        cur = '';
        return;
      }
      cur = id;
      setTip({ id, x: e.clientX, y: e.clientY });
    };
    const leave = () => {
      cur = '';
      setTip(null);
    };
    document.addEventListener('mousemove', over);
    document.addEventListener('mouseleave', leave);
    window.addEventListener('keydown', leave);
    window.addEventListener('wheel', leave);
    return () => {
      document.removeEventListener('mousemove', over);
      document.removeEventListener('mouseleave', leave);
      window.removeEventListener('keydown', leave);
      window.removeEventListener('wheel', leave);
    };
  }, []);
  if (!tip) return null;
  const d = CONTROLS[tip.id];
  const name = d ? d.name[lang] : 'MCDU';
  const desc = d?.desc?.[lang] ?? (tip.id === 'MCDU' ? (lang === 'ru' ? 'Наведите курсор и печатайте с клавиатуры. Backspace — CLR.' : 'Hover and type on your keyboard. Backspace = CLR.') : '');
  let state = '';
  if (d?.pos && d.pos.length && d.kind !== 'knob') state = d.pos[sim.s.sw[d.id]] ?? '';
  else if (d && (d.kind === 'pb' || d.kind === 'guard')) state = sim.s.sw[d.id] ? (lang === 'ru' ? 'нажата' : 'pressed in') : lang === 'ru' ? 'отжата' : 'released';
  const left = Math.min(tip.x + 16, window.innerWidth - 300);
  const top = Math.min(tip.y + 18, window.innerHeight - 120);
  return (
    <div className="tooltip" style={{ left, top }}>
      <b>{name}</b>
      {state && <span className="tt-state"> · {state}</span>}
      {desc && <div>{desc}</div>}
      {d && (d.kind === 'guard' || d.kind === 'guardm') && <div className="dim">{lang === 'ru' ? 'Клик — открыть крышку, ещё клик — нажать, ПКМ — закрыть.' : 'Click to lift the guard, click again to press, right-click to close.'}</div>}
    </div>
  );
}

export function stepTitle(id: string, lang: 'ru' | 'en') {
  return STEP_BY_ID[id]?.title[lang] ?? id;
}
