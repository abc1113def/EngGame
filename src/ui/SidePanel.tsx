import { useEffect, useRef, useState } from 'react';
import { CHECKLISTS } from '../game/checklists';
import type { Game } from '../game/game';
import { PHASES, type Step } from '../game/procedure';
import { UI, KEYS_HELP } from '../i18n/ui';
import { freqStr, radioUnit } from '../sim/ground';
import { SCN } from '../sim/scenario';
import { sim } from '../sim/sim';
import { useSim, useSimFrame, useT } from './hooks';
import { useUiStore } from './store';

export type Tab = 'steps' | 'comms' | 'checklists' | 'docs' | 'log';

const fmtT = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t) % 60).padStart(2, '0')}`;

function useGameVersion(game: Game) {
  useSimFrame(4);
  return game.version;
}

// ============================ задачи ============================
function StepRow({ st, game, current, onShow }: { st: Step; game: Game; current: boolean; onShow: (st: Step) => void }) {
  const t = useT();
  const done = game.isDone(st.id);
  const ok = st.done(sim.s);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (current) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [current]);
  return (
    <div ref={ref} className={`step ${done ? 'done' : ''} ${current ? 'cur' : ''} k-${st.kind} ${st.phase === 'emer' ? 'emer' : ''}`}>
      <div className="step-h">
        <span className="step-ico">{done ? '✓' : current ? '▶' : st.optional ? '◇' : '○'}</span>
        <span className="step-t">
          {t(st.title)}
          {st.optional && <em> ({t(UI.optional)})</em>}
        </span>
      </div>
      {current && (
        <div className="step-body">
          <div className="step-hint">{t(st.hint)}</div>
          <div className="step-btns">
            {st.view && <button onClick={() => onShow(st)}>{t(UI.show)}</button>}
            {st.kind === 'check' && (
              <button disabled={!ok} onClick={() => game.ack(st.id)} className="primary">
                {t(UI.checked)}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StepsTab({ game, onShow }: { game: Game; onShow: (st: Step) => void }) {
  useGameVersion(game);
  const t = useT();
  const cur = game.currentStep();
  const vis = game.visibleSteps();
  const prog = game.phaseProgress();
  if (game.mode === 'exam') {
    const done = vis.filter((x) => game.isDone(x.id)).sort((a, b) => game.doneAt[a.id] - game.doneAt[b.id]);
    return (
      <div className="tab-body">
        <div className="note">{t(UI.examHidden)}</div>
        <div className="phase-prog">
          {prog
            .filter((p) => p.total > 0)
            .map((p) => (
              <div key={p.id} className="pp">
                <span>{t(p.name)}</span>
                <span className={p.done === p.total ? 'ok' : ''}>
                  {p.done}/{p.total}
                </span>
              </div>
            ))}
        </div>
        {done.map((st) => (
          <div key={st.id} className="step done small">
            <span className="step-ico">✓</span> <span className="step-time">{fmtT(game.doneAt[st.id])}</span> {t(st.title)}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="tab-body">
      {PHASES.map((p) => {
        const steps = vis.filter((x) => x.phase === p.id);
        if (!steps.length) return null;
        const pr = prog.find((x) => x.id === p.id)!;
        return (
          <div key={p.id} className={`phase ${p.id === 'emer' ? 'emer' : ''}`}>
            <div className="phase-h">
              <span>{t(p.name)}</span>
              <span className={pr.done === pr.total ? 'ok' : ''}>
                {pr.done}/{pr.total}
              </span>
            </div>
            {steps.map((st) => (
              <StepRow key={st.id} st={st} game={game} current={cur?.id === st.id} onShow={onShow} />
            ))}
          </div>
        );
      })}
      {!cur && <div className="note ok">{t(UI.allDone)}</div>}
    </div>
  );
}

// ============================ связь ============================
const UNIT_NAMES: Record<string, string> = { ATIS: 'ATIS', DEL: 'DELIVERY', GND: 'GROUND', TWR: 'TOWER', CREW: 'GROUND CREW', CAB: 'CABIN', PA: 'PA', SYS: '' };

function CommsTab() {
  const t = useT();
  const st = useUiStore();
  const unit = useSim((s) => radioUnit(s));
  const on = useSim((s) => s.sw.RMP_ON === 1 && s.elec.dcEss);
  const active = useSim((s) => s.radio.active);
  const headset = useSim((s) => s.gnd.headset);
  const boarding = useSim((s) => Math.round(s.gnd.boarding * 100));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: 1e6 });
  }, [st.msgs.length]);
  const B = ({ id, ru, en, dis }: { id: string; ru: string; en: string; dis?: boolean }) => (
    <button disabled={dis} onClick={() => sim.comms(id)}>
      {t({ ru, en })}
    </button>
  );
  return (
    <div className="tab-body comms">
      <div className="radio-stat">
        <b>VHF 1</b>{' '}
        {on ? (
          <>
            {freqStr(active)} — {unit ? <span className="ok">{UNIT_NAMES[unit]}</span> : <span className="warn">{t(UI.unknownFreq)}</span>}
          </>
        ) : (
          <span className="warn">{t(UI.noRadio)}</span>
        )}
      </div>
      <div className="cgroup">
        <div className="cg-h">{t(UI.atc)}</div>
        <div className="cbtns">
          <B id="atis" ru="ATIS: прослушать" en="ATIS: listen" />
          <B id="del_clr" ru="Delivery: IFR-разрешение" en="Delivery: IFR clearance" />
          <B id="gnd_pushreq" ru="Ground: буксировка и запуск" en="Ground: push & start" />
          <B id="gnd_taxi" ru="Ground: руление" en="Ground: request taxi" />
          <B id="twr_ready" ru="Tower: готов к вылету" en="Tower: ready for departure" />
          <B id="atc_notify" ru="⚠ Сообщить об аварии / остановке" en="⚠ Notify emergency / stopping" />
        </div>
      </div>
      <div className="cgroup">
        <div className="cg-h">{t(UI.crew)}</div>
        <div className="cbtns">
          <B id="crew_gpu_on" ru="Подключить наземное питание" en="Connect ground power" dis={!headset} />
          <B id="crew_gpu_off" ru="Отключить наземное питание" en="Disconnect ground power" dis={!headset} />
          <B id="crew_push" ru="Готовы к буксировке" en="Ready for pushback" dis={!headset} />
          <B id="crew_start" ru="Запускаем двигатели" en="Starting engines" dis={!headset} />
          <B id="crew_disc" ru="Можно отключаться" en="Cleared to disconnect" dis={!headset} />
        </div>
      </div>
      <div className="cgroup">
        <div className="cg-h">
          {t(UI.cabin)} <span className="dim">· {t(UI.boarding)} {boarding}%</span>
        </div>
        <div className="cbtns">
          <B id="cab_doors" ru="Закрыть двери" en="Close doors" />
          <B id="cab_arm" ru="PA: двери на автомат" en="PA: arm doors" />
          <B id="cab_seats" ru="PA: занять места для взлёта" en="PA: seats for take-off" />
          <B id="cab_alert" ru="PA: экипажу по местам (тревога)" en="PA: crew at stations (alert)" />
          <B id="cab_evac" ru="PA: ЭВАКУАЦИЯ" en="PA: EVACUATE" />
        </div>
      </div>
      <div className="cg-h">{t(UI.messages)}</div>
      <div className="msgs" ref={ref}>
        {st.msgs.length === 0 && <div className="dim">{t(UI.emptyLog)}</div>}
        {st.msgs.map((m) => (
          <div key={m.id} className={`msg u-${m.unit} ${m.me ? 'me' : ''}`}>
            <span className="msg-t">{fmtT(m.t)}</span> <b>{m.me ? 'EGM320' : UNIT_NAMES[m.unit] || '•'}</b> {t(m.text)}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================ чек-листы ============================
function ChecklistsTab({ game }: { game: Game }) {
  useGameVersion(game);
  const t = useT();
  return (
    <div className="tab-body">
      {CHECKLISTS.map((cl) => {
        const marks = game.clMarks[cl.id] ?? {};
        const done = !!sim.s.flags[cl.flag];
        return (
          <div key={cl.id} className={`cl ${done ? 'done' : ''}`}>
            <div className="cl-h">
              {cl.name} {done && <span className="ok">· COMPLETED</span>}
            </div>
            {cl.items.map((it, i) => (
              <div key={i}>
                {it.line && <div className="cl-line">— — — — — —</div>}
                <div className={`cl-it ${marks[i] ?? ''}`} onClick={() => game.checkItem(cl.id, i)} title={marks[i] === 'bad' ? t(it.why) : ''}>
                  <span className="cl-box">{marks[i] === 'ok' ? '✓' : marks[i] === 'bad' ? '✗' : ''}</span>
                  <span className="cl-ch">{it.ch}</span>
                  <span className="cl-dots" />
                  <span className="cl-resp">{it.resp(sim.s)}</span>
                </div>
                {marks[i] === 'bad' && <div className="cl-why">{t(it.why)}</div>}
              </div>
            ))}
          </div>
        );
      })}
      <div className="note dim">{t({ ru: 'Нажмите на пункт, чтобы ответить на него. Пункт проверяется по фактическому состоянию самолёта.', en: 'Click an item to respond. Each item is verified against the actual aircraft state.' })}</div>
    </div>
  );
}

// ============================ документы ============================
function DocsTab() {
  const t = useT();
  const a = useSimFrame(2).atc;
  return (
    <div className="tab-body docs">
      <div className="doc">
        <div className="doc-h">{t(UI.ofp)}</div>
        <table>
          <tbody>
            <tr><td>FLT</td><td>{SCN.callsign} ({t(SCN.radioCall)})</td></tr>
            <tr><td>ROUTE</td><td>{SCN.from} {SCN.fromName} → {SCN.to} {SCN.toName}</td></tr>
            <tr><td>ALTN</td><td>{SCN.altn}</td></tr>
            <tr><td>SID</td><td>{SCN.sid} · RWY {SCN.rwy}</td></tr>
            <tr><td>CRZ</td><td>FL{SCN.crzFl} · CI {SCN.ci}</td></tr>
          </tbody>
        </table>
      </div>
      <div className="doc">
        <div className="doc-h">{t(UI.loadsheet)}</div>
        <table>
          <tbody>
            <tr><td>ZFW / ZFWCG</td><td>{SCN.zfw.toFixed(1)} / {SCN.zfwcg.toFixed(1)}</td></tr>
            <tr><td>BLOCK FUEL</td><td>{SCN.block.toFixed(1)} T</td></tr>
            <tr><td>TAXI FUEL</td><td>{SCN.taxiFuel.toFixed(1)} T</td></tr>
            <tr><td>TOW</td><td>{(SCN.zfw + SCN.block - SCN.taxiFuel).toFixed(1)} T</td></tr>
          </tbody>
        </table>
      </div>
      <div className="doc">
        <div className="doc-h">{t(UI.todata)}</div>
        <table>
          <tbody>
            <tr><td>V1 / VR / V2</td><td>{SCN.v1} / {SCN.vr} / {SCN.v2}</td></tr>
            <tr><td>CONF / THS</td><td>{SCN.toFlaps} / UP{SCN.ths.toFixed(1)}</td></tr>
            <tr><td>FLEX TO TEMP</td><td>{SCN.flex} °C</td></tr>
            <tr><td>TRANS ALT</td><td>{SCN.transAlt} FT</td></tr>
          </tbody>
        </table>
      </div>
      <div className="doc">
        <div className="doc-h">{t(UI.freqs)}</div>
        <table>
          <tbody>
            {Object.entries(SCN.freqs).map(([k, v]) => (
              <tr key={k}><td>{UNIT_NAMES[k]}</td><td>{freqStr(v)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="doc">
        <div className="doc-h">{t(UI.atisInfo)}</div>
        {a.atis ? (
          <div>
            INFO <b>{a.atisLetter}</b> · RWY 32L · {a.windDir}°/{a.windSpd} KT · T {a.oat}°C · <b>QNH {a.qnh}</b>
          </div>
        ) : (
          <div className="dim">{t(UI.notYet)}</div>
        )}
      </div>
      <div className="doc">
        <div className="doc-h">{t(UI.clearanceInfo)}</div>
        {a.clearance ? (
          <div>
            {SCN.sid} · RWY 32L · <b>{a.initAlt} FT</b> · SQUAWK <b>{a.squawk}</b>
          </div>
        ) : (
          <div className="dim">{t(UI.notYet)}</div>
        )}
      </div>
      <div className="doc">
        <div className="doc-h">{t(UI.controlsHelp)}</div>
        <table className="keys">
          <tbody>
            {KEYS_HELP.map((k) => (
              <tr key={k.k}><td><kbd>{k.k}</kbd></td><td>{t(k.d)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="note dim">{t(UI.disclaimer)}</div>
    </div>
  );
}

function LogTab() {
  const st = useUiStore();
  const t = useT();
  return (
    <div className="tab-body">
      {st.log.length === 0 && <div className="dim">{t(UI.emptyLog)}</div>}
      {[...st.log].reverse().map((l) => (
        <div key={l.id} className={`log k-${l.kind}`}>
          <span className="msg-t">{fmtT(l.t)}</span> {t(l.text)}
        </div>
      ))}
    </div>
  );
}

export function SidePanel({ game, tab, setTab, onShow }: { game: Game; tab: Tab; setTab: (t: Tab) => void; onShow: (st: Step) => void }) {
  const t = useT();
  const [, force] = useState(0);
  void force;
  const tabs: [Tab, string][] = [
    ['steps', t(UI.steps)],
    ['comms', t(UI.comms)],
    ['checklists', t(UI.checklists)],
    ['docs', t(UI.docs)],
    ['log', t(UI.log)],
  ];
  return (
    <aside className="side">
      <div className="tabs">
        {tabs.map(([k, l]) => (
          <button key={k} className={tab === k ? 'sel' : ''} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'steps' && <StepsTab game={game} onShow={onShow} />}
      {tab === 'comms' && <CommsTab />}
      {tab === 'checklists' && <ChecklistsTab game={game} />}
      {tab === 'docs' && <DocsTab />}
      {tab === 'log' && <LogTab />}
    </aside>
  );
}
