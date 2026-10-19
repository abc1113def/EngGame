import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { audio } from '../audio/audio';
import { mcduState } from '../displays/MCDU';
import { Game, type Mode, type Report } from '../game/game';
import type { Step } from '../game/procedure';
import { UI } from '../i18n/ui';
import { Front } from '../panels/Front';
import { Overhead } from '../panels/Overhead';
import { Pedestal } from '../panels/Pedestal';
import { ECAM_BY_ID } from '../sim/ecam';
import { TLA } from '../sim/engines';
import { SCN } from '../sim/scenario';
import { sim, type SimEvent } from '../sim/sim';
import type { ViewId } from '../sim/types';
import { HlCtx, getSettings, setSettings, useSettings, useSim, useT, tr } from './hooks';
import { Debrief, StartMenu, Tooltip } from './Menus';
import { SidePanel, type Tab } from './SidePanel';
import { uiStore, useUiStore } from './store';

const VIEW_H: Record<ViewId, number> = { ovhd: 1250, front: 960, ped: 960 };

function Viewport({ view }: { view: ViewId }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = VIEW_H[view];
  let sc = Math.min(size.w / 1600, size.h / H);
  let scroll = false;
  if (sc < 0.6) {
    sc = Math.min(size.w / 1600, 0.75);
    scroll = true;
  }
  return (
    <div className="viewport" ref={ref} style={{ overflowY: scroll ? 'auto' : 'hidden' }}>
      <div className="scaler" style={{ width: 1600 * sc, height: H * sc }}>
        <div style={{ transform: `scale(${sc})`, transformOrigin: '0 0', width: 1600, height: H }}>
          {view === 'ovhd' ? <Overhead /> : view === 'front' ? <Front /> : <Pedestal />}
        </div>
      </div>
    </div>
  );
}

function Toasts() {
  const st = useUiStore();
  const t = useT();
  const now = performance.now();
  return (
    <div className="toasts">
      {st.toasts
        .filter((x) => x.until > now)
        .map((x) => (
          <div key={x.id} className={`toast k-${x.kind}`}>
            {t(x.text)}
          </div>
        ))}
    </div>
  );
}

function Clock() {
  const t = useSim((s) => Math.floor(s.t));
  return (
    <span className="tb-clock">
      {String(Math.floor(t / 60)).padStart(2, '0')}:{String(t % 60).padStart(2, '0')}
    </span>
  );
}

function Score({ game }: { game: Game }) {
  useSim((s) => Math.floor(s.t * 2));
  return <span className="tb-score">{game.score}</span>;
}

const unitName: Record<string, string> = { ATIS: 'ATIS', DEL: 'DELIVERY', GND: 'GROUND', TWR: 'TOWER', CREW: 'GROUND CREW', CAB: 'CABIN', PA: 'PA', SYS: '' };

export function App() {
  const settings = useSettings();
  const t = useT();
  const [game, setGame] = useState<Game | null>(null);
  const [menu, setMenu] = useState(true);
  const [view, setView] = useState<ViewId>('ovhd');
  const [tab, setTab] = useState<Tab>('steps');
  const [report, setReport] = useState<Report | null>(null);
  const [paused, setPaused] = useState(false);
  const [rate, setRate] = useState(1);
  const [flash, setFlash] = useState<string[]>([]);
  const gameRef = useRef<Game | null>(null);

  useEffect(() => audio.setEnabled(settings.sound, settings.volume), [settings.sound, settings.volume]);

  // главный цикл
  useEffect(() => {
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const ph = sim.s.gnd.phase;
      sim.rate = ph === 'runway' || ph === 'airborne' || ph === 'lineup' ? 1 : rateRef.current;
      sim.frame(dt);
      audio.update(sim.s, sim.paused || !!sim.s.result);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  const rateRef = useRef(1);
  rateRef.current = rate;

  // события симуляции → звук, сообщения, журнал
  useEffect(() => {
    const lang = () => getSettings().lang;
    return sim.on((e: SimEvent) => {
      const s = sim.s;
      switch (e.type) {
        case 'ui':
          audio.ui(e.snd);
          break;
        case 'ecam': {
          const d = ECAM_BY_ID[e.id];
          if (e.level === 'caut') audio.singleChime();
          if (!e.id.endsWith('_FIRE') || s.eng.some((x) => x.fire)) uiStore.log(s.t, 'ecam', { ru: `ECAM: ${d.title}${d.sub ? ' ' + d.sub(s) : ''}`, en: `ECAM: ${d.title}${d.sub ? ' ' + d.sub(s) : ''}` });
          break;
        }
        case 'radio':
          uiStore.msg(s.t, e.unit, e.msg, e.me);
          if (!e.me) {
            const prefix = unitName[e.unit] ? unitName[e.unit] + ': ' : '';
            uiStore.toast({ ru: prefix + e.msg.ru, en: prefix + e.msg.en }, e.unit === 'SYS' ? 'warn' : 'radio', 8000);
            if (e.unit === 'CAB' || e.unit === 'CREW') audio.cabinChime();
          }
          break;
        case 'hint': {
          const m = e.key === 'trimNoHyd' ? UI.hintTrimNoHyd : e.key === 'autobrkNoArm' ? UI.hintAutobrk : UI.hintAp;
          uiStore.toast(m, 'warn', 5000);
          break;
        }
        case 'score':
          if (e.pts !== 0) {
            uiStore.log(s.t, e.pts < 0 ? 'pen' : 'bonus', { ru: `${e.pts > 0 ? '+' : ''}${e.pts} · ${e.text.ru}`, en: `${e.pts > 0 ? '+' : ''}${e.pts} · ${e.text.en}` });
            if (gameRef.current?.mode === 'exam') uiStore.toast({ ru: `${e.pts > 0 ? '+' : ''}${e.pts}: ${e.text.ru}`, en: `${e.pts > 0 ? '+' : ''}${e.pts}: ${e.text.en}` }, e.pts < 0 ? 'pen' : 'bonus', 5000);
          }
          break;
        case 'apDisc':
          audio.cavalry();
          break;
        case 'sw':
          if ((e.id === 'SEAT_BELTS' || e.id === 'NO_SMOKING') && s.elec.dcBat) audio.cabinChime();
          break;
        case 'failure':
          uiStore.log(s.t, 'fail', { ru: 'Отказ: ' + e.id, en: 'Failure: ' + e.id });
          break;
        case 'tailStrike':
          uiStore.toast({ ru: 'УДАР ХВОСТОМ!', en: 'TAIL STRIKE!' }, 'pen', 5000);
          break;
        case 'powerLoss':
          uiStore.toast({ ru: 'Самолёт обесточен!', en: 'Aircraft lost all AC power!' }, 'pen', 5000);
          break;
        case 'irAlignFault':
          uiStore.toast({ ru: 'Выставка ИНС сбита движением самолёта! Нужно OFF → NAV и выставка заново.', en: 'IRS alignment lost: aircraft moved! Set OFF → NAV and realign.' }, 'pen', 7000);
          break;
        case 'crossHold':
          if (!s.atc.lineupClear) uiStore.toast({ ru: 'Вы пересекли линию предварительного старта без разрешения!', en: 'You crossed the holding point without clearance!' }, 'pen', 6000);
          break;
      }
      void lang;
    });
  }, []);

  // голосовые выкрики на разбеге
  useEffect(() => {
    return sim.onTick(() => {
      const s = sim.s;
      const f = s.flags;
      if (s.gnd.phase === 'runway' && f.toPowerSet && s.ac.onGround) {
        if (!f.coThr && s.eng[0].n1 > 80 && s.eng[1].n1 > 80) {
          f.coThr = true;
          audio.say(s.fma.thr.includes('TOGA') ? 'TOGA set' : 'Flex set');
        }
        if (!f.co100 && s.ac.ias >= 100) {
          f.co100 = true;
          audio.say('One hundred knots');
        }
        if (!f.coV1 && s.fms.v1 && s.ac.ias >= s.fms.v1) {
          f.coV1 = true;
          audio.say('V one');
        }
        if (!f.coVR && s.fms.vr && s.ac.ias >= s.fms.vr) {
          f.coVR = true;
          audio.say('Rotate');
        }
      }
      if (!s.ac.onGround && !f.coPC && s.ac.vs > 300 && s.ac.alt - s.elev > 30) {
        f.coPC = true;
        audio.say('Positive climb');
      }
    });
  }, []);

  const start = useCallback((mode: Mode) => {
    audio.init();
    uiStore.reset();
    gameRef.current?.stop();
    const st = getSettings();
    const seed = (Math.random() * 1e9) | 0;
    sim.reset(seed, st.failures, st.fastAlign);
    const g = new Game(sim, mode);
    g.start();
    g.onEnd((r) => setTimeout(() => setReport(r), 1500));
    gameRef.current = g;
    setGame(g);
    setReport(null);
    setMenu(false);
    setView('ovhd');
    setTab('steps');
    setPaused(false);
    sim.paused = false;
    uiStore.toast(mode === 'tutorial' ? { ru: 'Самолёт полностью обесточен. Начните с проверки и включения аккумуляторов (BAT 1, BAT 2).', en: 'The aircraft is cold & dark. Start by checking and switching on the batteries (BAT 1, BAT 2).' } : { ru: 'Экзамен начат. Удачи, капитан!', en: 'Exam started. Good luck, captain!' }, 'info', 8000);
  }, []);

  const togglePause = useCallback(() => {
    setPaused((p) => {
      sim.paused = !p;
      return !p;
    });
  }, []);

  // клавиатура
  useEffect(() => {
    const keyMap: Record<string, string> = {
      ArrowDown: 'pitchUp',
      s: 'pitchUp',
      ArrowUp: 'pitchDn',
      w: 'pitchDn',
      ArrowLeft: 'rollL',
      a: 'rollL',
      ArrowRight: 'rollR',
      d: 'rollR',
      z: 'rudL',
      x: 'rudR',
      b: 'brake',
    };
    const down = (e: KeyboardEvent) => {
      if (menu || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (mcduState.hover) {
        if (/^[a-z0-9./]$/i.test(e.key)) {
          sim.mcduKey(e.key.toUpperCase());
          e.preventDefault();
          return;
        }
        if (e.key === 'Backspace' || e.key === 'Delete') {
          sim.mcduKey('CLR');
          e.preventDefault();
          return;
        }
        if (e.key === ' ') {
          sim.mcduKey('SP');
          e.preventDefault();
          return;
        }
        if (e.key === '-' || e.key === '+') {
          sim.mcduKey('+/-');
          e.preventDefault();
          return;
        }
      }
      if (k === '1') setView('ovhd');
      else if (k === '2') setView('front');
      else if (k === '3') setView('ped');
      else if (k === 'F1') sim.setThrust(TLA.IDLE);
      else if (k === 'F2' || k === 'PageDown') sim.stepThrust(-1);
      else if (k === 'F3' || k === 'PageUp') sim.stepThrust(1);
      else if (k === 'F4') sim.setThrust(TLA.TOGA);
      else if (k === 'p') sim.toggle('PARK_BRK');
      else if (k === 'g') sim.toggle('GEAR');
      else if (k === ' ') togglePause();
      else if (keyMap[k]) sim.s.keys[keyMap[k]] = true;
      else return;
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (keyMap[k]) sim.s.keys[keyMap[k]] = false;
    };
    const blur = () => {
      for (const k in sim.s.keys) sim.s.keys[k] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [menu, togglePause]);

  const cur = useSim(() => (game && game.mode === 'tutorial' ? game.currentStep()?.id ?? '' : ''));
  const curStep = game?.currentStep() ?? null;
  const hl = useMemo(() => {
    const set = new Set<string>(flash);
    if (curStep && game?.mode === 'tutorial') for (const c of curStep.ctl ?? []) set.add(c);
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, flash, game]);

  const onShow = (st: Step) => {
    if (st.view === 'comms') setTab('comms');
    else if (st.view === 'checklist') setTab('checklists');
    else if (st.view === 'mcdu') setView('ped');
    else if (st.view) setView(st.view);
    if (st.ctl) {
      setFlash(st.ctl);
      setTimeout(() => setFlash([]), 2500);
    }
  };
  const stepView = curStep && game?.mode === 'tutorial' ? (curStep.view === 'mcdu' ? 'ped' : curStep.view) : null;

  return (
    <HlCtx.Provider value={hl}>
      <div className="app">
        <header className="topbar">
          <div className="tb-title">✈ A320 · COLD &amp; DARK</div>
          <nav className="tb-views">
            {(['ovhd', 'front', 'ped'] as ViewId[]).map((v, i) => (
              <button key={v} className={`${view === v ? 'sel' : ''} ${stepView === v && view !== v ? 'pulse' : ''}`} onClick={() => setView(v)}>
                <kbd>{i + 1}</kbd> {t(UI[v])}
              </button>
            ))}
          </nav>
          <div className="tb-right">
            {game && <span className={`badge ${game.mode}`}>{t(game.mode === 'tutorial' ? UI.tutorial : UI.exam)}</span>}
            <Clock />
            {game?.mode === 'exam' && (
              <span>
                {t(UI.score)}: <Score game={game} />
              </span>
            )}
            <span className="seg small" title={t(UI.speed)}>
              {[1, 2, 4, 8].map((r) => (
                <button key={r} className={rate === r ? 'sel' : ''} onClick={() => setRate(r)}>
                  ×{r}
                </button>
              ))}
            </span>
            <button onClick={togglePause}>{paused ? '▶' : '❚❚'}</button>
            <button onClick={() => setSettings({ sound: !settings.sound })} title={t(UI.sound)}>
              {settings.sound ? '🔊' : '🔇'}
            </button>
            <button onClick={() => setSettings({ lang: settings.lang === 'ru' ? 'en' : 'ru' })}>{settings.lang === 'ru' ? 'RU' : 'EN'}</button>
            <button
              onClick={() => {
                sim.paused = true;
                setMenu(true);
              }}
            >
              {t(UI.menu)}
            </button>
          </div>
        </header>
        <main className="main">
          <Viewport view={view} />
          {game && <SidePanel game={game} tab={tab} setTab={setTab} onShow={onShow} />}
        </main>
        {paused && !menu && <div className="paused">{t(UI.paused)}</div>}
        <Toasts />
        <Tooltip />
        {menu && <StartMenu onStart={start} />}
        {report && !menu && (
          <Debrief
            rep={report}
            mode={game!.mode}
            onAgain={() => {
              setReport(null);
              setMenu(true);
            }}
            onClose={() => setReport(null)}
          />
        )}
        <div className="narrow">{tr(UI.desktop, settings.lang)}</div>
      </div>
      <span style={{ display: 'none' }}>{SCN.callsign}</span>
    </HlCtx.Provider>
  );
}
