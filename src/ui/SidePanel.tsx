import { useEffect, useRef, useState } from 'react';
import type { Game } from '../game/game';
import { PHASES, type Step } from '../game/procedure';
import { UI, keysHelp } from '../i18n/ui';
import { freqStr, radioUnit } from '../sim/ground';
import { GEO_LFPO, SCN, SCN_ARR, SCN_C172 } from '../sim/scenario';
import { speeds } from '../sim/flight';
import type { L, SimState } from '../sim/types';
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
const UNIT_NAMES: Record<string, string> = { ATIS: 'ATIS', DEL: 'DELIVERY', GND: 'GROUND', TWR: 'TOWER', APP: 'APPROACH', CREW: 'GROUND CREW', CAB: 'CABIN', PA: 'PA', PAX: 'PASSENGER', SYS: '' };

interface CommBtn {
  id: string;
  ru: string;
  en: string;
  crew?: boolean;
}
interface CommGroup {
  h: L;
  extra?: 'boarding';
  btns: CommBtn[];
}

function commGroups(type: SimState['type'], leg: SimState['leg']): CommGroup[] {
  if (type === 'c172')
    return [
      {
        h: { ru: 'Lasbordes Tower (радио)', en: 'Lasbordes Tower (radio)' },
        btns: [
          { id: 'c_atis', ru: 'ATIS: прослушать', en: 'ATIS: listen' },
          { id: 'c_taxi', ru: 'Вышка: прошу руление', en: 'Tower: request taxi' },
          { id: 'c_ready', ru: 'Вышка: готов к взлёту', en: 'Tower: ready for departure' },
          { id: 'c_dw', ru: 'Вышка: на подветренной', en: 'Tower: downwind' },
          { id: 'c_final', ru: 'Вышка: на прямой', en: 'Tower: final' },
          { id: 'c_vacated', ru: 'Вышка: ВПП освободил', en: 'Tower: runway vacated' },
          { id: 'atc_notify', ru: '⚠ Сообщить об аварии / MAYDAY', en: '⚠ Declare emergency / MAYDAY' },
        ],
      },
      {
        h: { ru: 'В кабине', en: 'In the cockpit' },
        btns: [
          { id: 'c_brief', ru: 'Инструктаж пассажира', en: 'Passenger briefing' },
          { id: 'c_clear', ru: '«ОТ ВИНТА!» (CLEAR PROP)', en: '"CLEAR PROP!"' },
        ],
      },
    ];
  if (leg === 'arr')
    return [
      {
        h: UI.atc,
        btns: [
          { id: 'arr_atis', ru: 'ATIS Орли: прослушать', en: 'Orly ATIS: listen' },
          { id: 'app_est', ru: 'Подход: на курсе ILS', en: 'Approach: established ILS' },
          { id: 'twr_land', ru: 'Вышка: на прямой, прошу посадку', en: 'Tower: on final, request landing' },
          { id: 'gnd_taxiin', ru: 'Земля: руление на стоянку', en: 'Ground: taxi to stand' },
          { id: 'atc_notify', ru: '⚠ Сообщить об аварии / MAYDAY', en: '⚠ Declare emergency / MAYDAY' },
        ],
      },
      {
        h: UI.crew,
        btns: [
          { id: 'crew_gpu_on', ru: 'Подключить наземное питание', en: 'Connect ground power', crew: true },
          { id: 'crew_gpu_off', ru: 'Отключить наземное питание', en: 'Disconnect ground power', crew: true },
        ],
      },
      {
        h: UI.cabin,
        btns: [
          { id: 'cab_land', ru: 'PA: приготовиться к посадке', en: 'PA: prepare for landing' },
          { id: 'cab_disarm', ru: 'PA: двери на ручной режим', en: 'PA: disarm doors' },
          { id: 'cab_alert', ru: 'PA: экипажу по местам (тревога)', en: 'PA: crew at stations (alert)' },
          { id: 'cab_evac', ru: 'PA: ЭВАКУАЦИЯ', en: 'PA: EVACUATE' },
        ],
      },
    ];
  return [
    {
      h: UI.atc,
      btns: [
        { id: 'atis', ru: 'ATIS: прослушать', en: 'ATIS: listen' },
        { id: 'del_clr', ru: 'Delivery: IFR-разрешение', en: 'Delivery: IFR clearance' },
        { id: 'gnd_pushreq', ru: 'Ground: буксировка и запуск', en: 'Ground: push & start' },
        { id: 'gnd_taxi', ru: 'Ground: руление', en: 'Ground: request taxi' },
        { id: 'twr_ready', ru: 'Tower: готов к вылету', en: 'Tower: ready for departure' },
        { id: 'atc_notify', ru: '⚠ Сообщить об аварии / остановке', en: '⚠ Notify emergency / stopping' },
      ],
    },
    {
      h: UI.crew,
      btns: [
        { id: 'crew_gpu_on', ru: 'Подключить наземное питание', en: 'Connect ground power', crew: true },
        { id: 'crew_gpu_off', ru: 'Отключить наземное питание', en: 'Disconnect ground power', crew: true },
        { id: 'crew_push', ru: 'Готовы к буксировке', en: 'Ready for pushback', crew: true },
        { id: 'crew_start', ru: 'Запускаем двигатели', en: 'Starting engines', crew: true },
        { id: 'crew_disc', ru: 'Можно отключаться', en: 'Cleared to disconnect', crew: true },
      ],
    },
    {
      h: UI.cabin,
      extra: 'boarding',
      btns: [
        { id: 'cab_doors', ru: 'Закрыть двери', en: 'Close doors' },
        { id: 'cab_arm', ru: 'PA: двери на автомат', en: 'PA: arm doors' },
        { id: 'cab_seats', ru: 'PA: занять места для взлёта', en: 'PA: seats for take-off' },
        { id: 'cab_alert', ru: 'PA: экипажу по местам (тревога)', en: 'PA: crew at stations (alert)' },
        { id: 'cab_evac', ru: 'PA: ЭВАКУАЦИЯ', en: 'PA: EVACUATE' },
      ],
    },
  ];
}

function CommsTab() {
  const t = useT();
  const st = useUiStore();
  const unit = useSim((s) => radioUnit(s));
  const type = useSim((s) => s.type);
  const leg = useSim((s) => s.leg);
  const on = useSim((s) => (s.type === 'c172' ? s.c.busV > 20 && s.sw.C_AVIONICS1 === 1 : s.sw.RMP_ON === 1 && s.elec.dcEss));
  const active = useSim((s) => (s.type === 'c172' ? s.c.com : s.radio.active));
  const headset = useSim((s) => s.gnd.headset);
  const boarding = useSim((s) => Math.round(s.gnd.boarding * 100));
  const cs = type === 'c172' ? SCN_C172.callsign : SCN.callsign;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: 1e6 });
  }, [st.msgs.length]);
  return (
    <div className="tab-body comms">
      <div className="radio-stat">
        <b>{type === 'c172' ? 'COM 1' : 'VHF 1'}</b>{' '}
        {on ? (
          <>
            {freqStr(active)} — {unit ? <span className="ok">{UNIT_NAMES[unit]}</span> : <span className="warn">{t(UI.unknownFreq)}</span>}
          </>
        ) : (
          <span className="warn">{type === 'c172' ? t({ ru: 'Радио выключено: MASTER и AVIONICS', en: 'Radio off: MASTER and AVIONICS' }) : t(UI.noRadio)}</span>
        )}
      </div>
      {commGroups(type, leg).map((gr, gi) => (
        <div className="cgroup" key={gi}>
          <div className="cg-h">
            {t(gr.h)} {gr.extra === 'boarding' && <span className="dim">· {t(UI.boarding)} {boarding}%</span>}
          </div>
          <div className="cbtns">
            {gr.btns.map((b) => (
              <button key={b.id} disabled={b.crew && !headset} onClick={() => sim.comms(b.id)}>
                {t(b)}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="cg-h">{t(UI.messages)}</div>
      <div className="msgs" ref={ref}>
        {st.msgs.length === 0 && <div className="dim">{t(UI.emptyLog)}</div>}
        {st.msgs.map((m) => (
          <div key={m.id} className={`msg u-${m.unit} ${m.me ? 'me' : ''}`}>
            <span className="msg-t">{fmtT(m.t)}</span> <b>{m.me ? cs : UNIT_NAMES[m.unit] || '•'}</b> {t(m.text)}
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
      {game.checklists().map((cl) => {
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
function Doc({ h, rows, children }: { h: string; rows?: [string, React.ReactNode][]; children?: React.ReactNode }) {
  return (
    <div className="doc">
      <div className="doc-h">{h}</div>
      {rows && (
        <table>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {children}
    </div>
  );
}

function DocsArr() {
  const t = useT();
  const s = useSimFrame(2);
  const a = s.atc;
  const sp = speeds(s);
  return (
    <>
      <Doc h={t({ ru: 'Брифинг захода — LFPO', en: 'Approach briefing — LFPO' })} rows={[
        ['APPROACH', `ILS RWY ${SCN_ARR.rwy} · ${SCN_ARR.ils} · CRS ${GEO_LFPO.rwyHdg}°`],
        ['GLIDE / DA', `3.0° · DA ${SCN_ARR.da} FT (BARO)`],
        ['RWY', `${GEO_LFPO.rwyLen} M · ELEV ${GEO_LFPO.elev} FT`],
        ['GO-AROUND', 'RWY HDG · 4000 FT'],
        ['CONF / AUTO BRK', 'FULL · LO (MED wet)'],
        ['VLS / VAPP', `${Math.round(sp.vlsFull)} / ${Math.round(sp.vapp)} KT`],
        ['STAND', SCN_ARR.stand],
      ]} />
      <Doc h={t(UI.freqs)} rows={Object.entries(SCN_ARR.freqs).map(([k, v]) => [UNIT_NAMES[k], freqStr(v)])} />
      <Doc h="ATIS LFPO">
        {a.arrAtis ? (
          <div>
            INFO <b>{a.arrLetter}</b> · RWY 06 · {a.arrWindDir}°/{a.arrWindSpd} KT · <b>QNH {a.arrQnh}</b> · TL 60
          </div>
        ) : (
          <div className="dim">{t(UI.notYet)}</div>
        )}
      </Doc>
      <Doc h={t({ ru: 'Разрешения', en: 'Clearances' })} rows={[
        ['APP', a.appClear ? 'CLEARED ILS 06' : t(UI.notYet)],
        ['TWR', a.ldgClear ? 'CLEARED TO LAND' : t(UI.notYet)],
        ['GND', a.taxiInClear ? `TAXI ${SCN_ARR.stand}` : t(UI.notYet)],
      ]} />
    </>
  );
}

function DocsC172() {
  const t = useT();
  const s = useSimFrame(2);
  return (
    <>
      <Doc h={t({ ru: 'Самолёт', en: 'Aircraft' })} rows={[
        ['REG', `${SCN_C172.callsign} · C172S · IO-360 180 HP`],
        ['FUEL', '53 USG usable · 100LL'],
        ['OIL', t({ ru: 'мин. 5 qt, норма 6–8 qt', en: 'min 5 qt, normal 6–8 qt' })],
        ['MTOW', '2550 lb'],
      ]} />
      <Doc h={t({ ru: 'Скорости (KIAS)', en: 'Speeds (KIAS)' })} rows={[
        ['VR', '55'],
        ['VX / VY', '62 / 74'],
        [t({ ru: 'Набор (норм.)', en: 'Normal climb' }), '75–85'],
        [t({ ru: 'Планирование', en: 'Best glide' }), '68'],
        [t({ ru: 'Заход, закрылки 30°', en: 'Approach, flaps 30°' }), '60–70'],
        ['VS0 / VS1', '40 / 48'],
        ['VFE 10° / 30°', '110 / 85'],
        ['VNO / VNE', '129 / 163'],
      ]} />
      <Doc h={t({ ru: 'Аэродром LFCL', en: 'Aerodrome LFCL' })} rows={[
        ['RWY', `33 · 1000 × 20 M · ELEV ${s.geo.elev} FT`],
        [t({ ru: 'Круг', en: 'Circuit' }), t({ ru: `левый, ${SCN_C172.patternAgl} фт над аэродромом (≈ 1500 фт QNH)`, en: `left-hand, ${SCN_C172.patternAgl} ft AAL (≈ 1500 ft QNH)` })],
        ...Object.entries(SCN_C172.freqs).map(([k, v]) => [UNIT_NAMES[k], freqStr(v)] as [string, string]),
        ['XPDR', '7000 VFR'],
      ]} />
      <Doc h={t({ ru: 'Опробование двигателя', en: 'Engine run-up' })} rows={[
        ['RPM', '1800'],
        [t({ ru: 'Спад на магнето', en: 'Mag drop' }), t({ ru: 'не более 150, разница ≤ 50', en: 'max 150, difference ≤ 50' })],
        [t({ ru: 'Вакуум', en: 'Suction' }), '4.5–5.5 inHg'],
        [t({ ru: 'Масло', en: 'Oil' }), t({ ru: 'давление и температура в зелёной зоне', en: 'pressure and temperature green' })],
      ]} />
    </>
  );
}

function DocsTab() {
  const t = useT();
  const type = useSim((s) => s.type);
  const leg = useSim((s) => s.leg);
  return (
    <div className="tab-body docs">
      {type === 'c172' ? <DocsC172 /> : leg === 'arr' ? <DocsArr /> : <DocsDep />}
      <>
        <div className="doc">
          <div className="doc-h">{t(UI.controlsHelp)}</div>
          <table className="keys">
            <tbody>
              {keysHelp(type).map((k) => (
                <tr key={k.k}>
                  <td>
                    <kbd>{k.k}</kbd>
                  </td>
                  <td>{t(k.d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="note dim">{t(UI.disclaimer)}</div>
      </>
    </div>
  );
}

function DocsDep() {
  const t = useT();
  const a = useSimFrame(2).atc;
  return (
    <>
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
    </>
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
