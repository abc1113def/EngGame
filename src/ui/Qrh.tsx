import { useMemo, useState } from 'react';
import { checklistsFor } from '../game/checklists';
import type { Game } from '../game/game';
import { qrhFor, type QrhLine, type QrhProc } from '../game/qrh';
import { sim } from '../sim/sim';
import type { L } from '../sim/types';
import { useLang, useSimFrame, useT } from './hooks';

const r = (ru: string, en: string): L => ({ ru, en });

/** Нормальные чек-листы как страницы книги (только чтение) */
function normalChecklists(): QrhProc[] {
  return checklistsFor(sim.s).map((cl) => ({
    id: 'cl_' + cl.id,
    title: { ru: cl.name, en: cl.name },
    color: 'gray' as const,
    lines: cl.items.map((it) => ({ ch: it.ch, resp: it.resp(sim.s) })),
  }));
}

// отметки сохраняются между открытиями книги (в пределах игры)
const ticks: Record<string, Set<number>> = {};
let lastSeed = -1;

export function QrhBook({ game, onClose }: { game: Game | null; onClose: () => void }) {
  const s = useSimFrame(2);
  const t = useT();
  const lang = useLang();
  if (s.seed !== lastSeed) {
    lastSeed = s.seed;
    for (const k in ticks) delete ticks[k];
  }
  const chapters = useMemo(() => {
    const book = qrhFor(s);
    const normal = s.type === 'a320' ? [{ id: 'normal', title: r('Нормальные чек-листы', 'Normal checklists'), procs: normalChecklists() }] : [{ id: 'cl', title: r('Чек-листы', 'Checklists'), procs: normalChecklists() }];
    return [...book, ...normal];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.type, s.scn, s.leg]);
  const all = chapters.flatMap((c) => c.procs);
  const active = all.filter((p) => p.active?.(s));
  const [sel, setSel] = useState<string>(() => active[0]?.id ?? chapters[0].procs[0].id);
  const [q, setQ] = useState('');
  const [, force] = useState(0);
  const proc = all.find((p) => p.id === sel) ?? all[0];
  const match = (p: QrhProc) => !q || (p.title.ru + ' ' + p.title.en + ' ' + p.lines.map((l) => (l.ch ?? '') + (l.t?.[lang] ?? '')).join(' ')).toLowerCase().includes(q.toLowerCase());
  const tk = (ticks[proc.id] ??= new Set());
  const toggle = (i: number) => {
    if (tk.has(i)) tk.delete(i);
    else tk.add(i);
    force((x) => x + 1);
  };
  const title = s.type === 'c172' ? 'CESSNA 172S · POH — EMERGENCY & NORMAL PROCEDURES' : 'A320 · QUICK REFERENCE HANDBOOK';
  void game;
  return (
    <div className="overlay qrh-ov" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="qrh">
        <div className="qrh-head">
          <b>📕 {title}</b>
          <input placeholder={t(r('Поиск…', 'Search…'))} value={q} onChange={(e) => setQ(e.target.value)} />
          <button onClick={onClose}>✕</button>
        </div>
        <div className="qrh-body">
          <nav className="qrh-idx">
            {active.length > 0 && (
              <div className="qrh-ch">
                <div className="qrh-ch-h now">{t(r('⚠ Сейчас актуально', '⚠ Relevant now'))}</div>
                {active.map((p) => (
                  <div key={'a' + p.id} className={`qrh-it c-${p.color} ${p.id === proc.id ? 'sel' : ''}`} onClick={() => setSel(p.id)}>
                    {t(p.title)}
                  </div>
                ))}
              </div>
            )}
            {chapters.map((ch) => {
              const ps = ch.procs.filter(match);
              if (!ps.length) return null;
              return (
                <div key={ch.id} className="qrh-ch">
                  <div className="qrh-ch-h">{t(ch.title)}</div>
                  {ps.map((p) => (
                    <div key={p.id} className={`qrh-it c-${p.color} ${p.id === proc.id ? 'sel' : ''} ${p.active?.(s) ? 'act' : ''}`} onClick={() => setSel(p.id)}>
                      {t(p.title)}
                    </div>
                  ))}
                </div>
              );
            })}
          </nav>
          <article className="qrh-page">
            <div className={`qrh-title c-${proc.color}`}>{t(proc.title)}</div>
            <div className="qrh-lines">
              {proc.lines.map((l, i) => (
                <Line key={i} l={l} on={tk.has(i)} onClick={() => toggle(i)} />
              ))}
            </div>
            <div className="qrh-foot">
              <button onClick={() => (tk.clear(), force((x) => x + 1))}>{t(r('Сбросить отметки', 'Clear ticks'))}</button>
              <span className="dim">{t(r('Нажмите на строку, чтобы отметить выполнение. Q — закрыть.', 'Click a line to tick it. Q to close.'))}</span>
            </div>
            <div className="qrh-disc dim">{t(r('Учебный справочник игры: формулировки упрощены и не заменяют официальную документацию.', 'Training reference for the game: simplified wording, not a substitute for official documents.'))}</div>
          </article>
        </div>
      </div>
    </div>
  );
}

function Line({ l, on, onClick }: { l: QrhLine; on: boolean; onClick: () => void }) {
  const t = useT();
  const pad = { paddingLeft: (l.ind ?? 0) * 22 + 8 };
  if (l.kind === 'head') return <div className="ql-head">{t(l.t!)}</div>;
  if (l.kind === 'note') return <div className="ql-note">ℹ {t(l.t!)}</div>;
  if (l.kind === 'warn') return <div className="ql-warn">⚠ {t(l.t!)}</div>;
  if (l.kind === 'cond')
    return (
      <div className="ql-cond" style={pad}>
        {t(l.t!)}
      </div>
    );
  return (
    <div className={`ql ${on ? 'on' : ''}`} style={pad} onClick={onClick}>
      <span className="ql-box">{on ? '✓' : ''}</span>
      <span className="ql-ch">{l.ch}</span>
      <span className="ql-dots" />
      <span className="ql-resp">{l.resp}</span>
    </div>
  );
}
