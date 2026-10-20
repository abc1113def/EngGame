import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { audio } from '../audio/audio';
import { mcduState } from '../displays/MCDU';
import { Game, type Mode, type Report } from '../game/game';
import type { Step } from '../game/procedure';
import { UI } from '../i18n/ui';
import { Front } from '../panels/Front';
import { Overhead } from '../panels/Overhead';
import { Pedestal } from '../panels/Pedestal';
import { OutView } from '../panels/Out';
import { C172Panel } from '../panels/C172';
import { Walkaround } from '../panels/Walk';
import { QrhBook } from './Qrh';
import { ECAM_BY_ID } from '../sim/ecam';
import { TLA } from '../sim/engines';
import { sim, type SimEvent } from '../sim/sim';
import type { AircraftType, L, Scenario, ViewId } from '../sim/types';
import { HlCtx, getSettings, setSettings, useSettings, useSim, useT, tr } from './hooks';
import { Debrief, StartMenu, Tooltip } from './Menus';
import { SidePanel, type Tab } from './SidePanel';
import { uiStore, useUiStore } from './store';

const VIEW_H: Record<ViewId, number> = { ovhd: 1250, front: 960, ped: 960, out: 960, c172: 1000, walk: 900 };
export const VIEWS: Record<AircraftType, ViewId[]> = { a320: ['ovhd', 'front', 'ped', 'out'], c172: ['walk', 'c172', 'out'] };

function ViewBody({ view }: { view: ViewId }) {
  switch (view) {
    case 'ovhd':
      return <Overhead />;
    case 'front':
      return <Front />;
    case 'ped':
      return <Pedestal />;
    case 'out':
      return <OutView />;
    case 'c172':
      return <C172Panel />;
    case 'walk':
      return <Walkaround />;
  }
}

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
          <ViewBody view={view} />
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

function ClBadge({ game }: { game: Game }) {
  const t = useT();
  useSettings();
  const req = useSim(() => game.clRequired);
  if (req) return null;
  return <span className="badge nocl">{t(UI.clOffBadge)}</span>;
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

const unitName: Record<string, string> = { ATIS: 'ATIS', DEL: 'DELIVERY', GND: 'GROUND', TWR: 'TOWER', APP: 'APPROACH', CREW: 'GROUND CREW', CAB: 'CABIN', PA: 'PA', PAX: 'PASSENGER', SYS: '' };

const START_MSG: Record<string, L> = {
  a320_dep: { ru: 'Самолёт полностью обесточен. Начните с проверки и включения аккумуляторов (BAT 1, BAT 2).', en: 'The aircraft is cold & dark. Start by checking and switching on the batteries (BAT 1, BAT 2).' },
  a320_full: { ru: 'Полный рейс Тулуза → Париж: от Cold & Dark до Cold & Dark. Начните с аккумуляторов (BAT 1, BAT 2).', en: 'Full flight Toulouse → Paris, cold & dark to cold & dark. Start with the batteries (BAT 1, BAT 2).' },
  a320_arr: { ru: 'Снижение к Парижу-Орли, 4000 фт, автопилот включён. Прослушайте ATIS и подготовьте заход ILS 06.', en: 'Descending towards Paris Orly at 4000 ft, autopilot on. Listen to the ATIS and prepare the ILS 06 approach.' },
  c172_pattern: { ru: 'Cessna 172 на стоянке в Ласборде. Начните с предполётного осмотра (вид 1).', en: 'Cessna 172 parked at Lasbordes. Start with the pre-flight walk-around (view 1).' },
};
const RA_CALLS = [2500, 1000, 500, 400, 300, 200, 100, 50, 40, 30, 20, 10];
const RA_WORDS: Record<number, string> = { 2500: 'twenty five hundred', 1000: 'one thousand', 500: 'five hundred', 400: 'four hundred', 300: 'three hundred', 200: 'two hundred', 100: 'one hundred', 50: 'fifty', 40: 'forty', 30: 'thirty', 20: 'twenty', 10: 'ten' };

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
  const [qrh, setQrh] = useState(false);
  const [interlude, setInterlude] = useState<L | null>(null);
  const gameRef = useRef<Game | null>(null);
  const type = useSim((s) => s.type);
  const views = VIEWS[type];

  useEffect(() => audio.setEnabled(settings.sound, settings.volume), [settings.sound, settings.volume]);

  // главный цикл
  useEffect(() => {
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const ph = sim.s.gnd.phase;
      sim.rate = ph === 'runway' || ph === 'airborne' || ph === 'lineup' || !sim.s.ac.onGround ? 1 : rateRef.current;
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
          const m =
            e.key === 'trimNoHyd'
              ? UI.hintTrimNoHyd
              : e.key === 'autobrkNoArm'
                ? UI.hintAutobrk
                : e.key === 'cApNo'
                  ? { ru: 'KAP 140 включается только в воздухе при включённой AVIONICS BUS 2 (после 5-секундного теста).', en: 'The KAP 140 engages only airborne with AVIONICS BUS 2 on (after its 5 s self-test).' }
                  : UI.hintAp;
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
          if (s.type === 'c172') audio.crcDing();
          else audio.cavalry();
          break;
        case 'cEngStop':
          if (s.flags.cAirborne && !s.ac.onGround) uiStore.toast({ ru: 'ДВИГАТЕЛЬ ОСТАНОВИЛСЯ! Скорость планирования 68 уз, выбирайте площадку.', en: 'ENGINE FAILURE! Best glide 68 kt, pick a landing spot.' }, 'pen', 8000);
          break;
        case 'cWater':
          uiStore.toast({ ru: 'В пробе топлива вода! Сливайте отстой ещё.', en: 'Water in the fuel sample! Keep draining.' }, 'warn', 5000);
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
        case 'cruiseSkip':
          sim.paused = true;
          setInterlude({
            ru: 'Набор эшелона 330, крейсерский полёт над Францией… Через 55 минут: снижение к Парижу. Самолёт на 4000 фт, автопилот включён. Прослушайте ATIS Орли и подготовьте заход ILS 06.',
            en: 'Climb to FL330 and cruise across France… 55 minutes later: descending towards Paris. The aircraft is at 4000 ft with the autopilot on. Listen to the Orly ATIS and prepare the ILS 06 approach.',
          });
          break;
        case 'approachAgain':
          uiStore.toast({ ru: 'Уход на второй круг выполнен. Диспетчер выводит вас на повторный заход ILS 06.', en: 'Go-around flown. ATC vectors you for another ILS 06 approach.' }, 'info', 8000);
          raDone.current.clear();
          break;
        case 'landing': {
          const td = e.td ?? e;
          if (td && td.vs !== undefined) uiStore.log(s.t, 'info', { ru: `Касание: ${Math.round(td.vs)} фт/мин, ${Math.round(td.along)} м от торца`, en: `Touchdown: ${Math.round(td.vs)} fpm, ${Math.round(td.along)} m past threshold` });
          break;
        }
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
      if (!s.ac.onGround && !f.coPC && s.ac.vs > 300 && s.ac.alt - s.elev > 30 && s.leg === 'dep' && s.type === 'a320') {
        f.coPC = true;
        audio.say('Positive climb');
      }
      // автоматические выкрики радиовысотомера на заходе
      if (s.type === 'a320' && s.leg === 'arr' && !s.ac.onGround && s.ac.vs < -100) {
        const ra = s.ac.alt - s.elev;
        for (const h of RA_CALLS) {
          if (ra <= h && ra > h - 60 && !raDone.current.has(h)) {
            for (const x of RA_CALLS) if (x >= h) raDone.current.add(x);
            audio.sayNow(RA_WORDS[h]);
            break;
          }
        }
        const mins = s.fms.mda ?? (s.fms.dh != null ? s.elev + s.fms.dh : null);
        if (mins != null) {
          if (s.ac.alt <= mins + 100 && s.ac.alt > mins + 40 && !raDone.current.has(-1)) {
            raDone.current.add(-1);
            audio.sayNow('hundred above');
          }
          if (s.ac.alt <= mins && s.ac.alt > mins - 60 && !raDone.current.has(-2)) {
            raDone.current.add(-2);
            audio.sayNow('minimum');
          }
        }
        const idle = s.sw.TL1 <= 0.5 && s.sw.TL2 <= 0.5;
        if (ra < 20 && !idle && s.t - retardT.current > 1.3) {
          retardT.current = s.t;
          audio.sayNow('retard');
        }
      }
      if (s.ac.onGround) raDone.current.clear();
    });
  }, []);
  const raDone = useRef(new Set<number>());
  const retardT = useRef(0);

  const start = useCallback((mode: Mode, ac: AircraftType, scn: Scenario) => {
    audio.init();
    uiStore.reset();
    gameRef.current?.stop();
    const st = getSettings();
    const seed = (Math.random() * 1e9) | 0;
    sim.reset(seed, st.failures, st.fastAlign, ac, scn);
    const g = new Game(sim, mode, { checklists: st.checklists !== false });
    g.start();
    g.onEnd((r) => setTimeout(() => setReport(r), 1500));
    gameRef.current = g;
    setGame(g);
    setReport(null);
    setMenu(false);
    setView(ac === 'c172' ? 'walk' : scn === 'arr' ? 'front' : 'ovhd');
    setTab('steps');
    setPaused(false);
    setInterlude(null);
    raDone.current.clear();
    sim.paused = false;
    uiStore.toast(mode === 'tutorial' ? START_MSG[`${ac}_${scn}`] : { ru: 'Экзамен начат. Удачи, капитан!', en: 'Exam started. Good luck, captain!' }, 'info', 9000);
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
      const c172 = sim.s.type === 'c172';
      const vs = VIEWS[sim.s.type];
      if (/^[1-9]$/.test(k) && vs[+k - 1]) setView(vs[+k - 1]);
      else if (k === 'q') setQrh((q) => !q);
      else if (k === 'Escape') setQrh(false);
      else if (c172 && e.shiftKey && (k === 'F2' || k === 'PageDown')) sim.setLever('C_MIX', sim.s.sw.C_MIX - 0.05);
      else if (c172 && e.shiftKey && (k === 'F3' || k === 'PageUp')) sim.setLever('C_MIX', sim.s.sw.C_MIX + 0.05);
      else if (c172 && k === 'F1') sim.setLever('C_THR', 0);
      else if (c172 && (k === 'F2' || k === 'PageDown')) sim.setLever('C_THR', sim.s.sw.C_THR - 0.05);
      else if (c172 && (k === 'F3' || k === 'PageUp')) sim.setLever('C_THR', sim.s.sw.C_THR + 0.05);
      else if (c172 && k === 'F4') sim.setLever('C_THR', 1);
      else if (c172 && k === '[') sim.knob('C_TRIM', -1);
      else if (c172 && k === ']') sim.knob('C_TRIM', 1);
      else if (c172 && k === 'p') sim.toggle('C_PARK');
      else if (c172 && k === 'f') sim.setSw('C_FLAPS', sim.s.sw.C_FLAPS + 1);
      else if (c172 && k === 'r') sim.setSw('C_FLAPS', sim.s.sw.C_FLAPS - 1);
      else if (k === 'F1') sim.setThrust(TLA.IDLE);
      else if (k === 'F2' || k === 'PageDown') sim.stepThrust(-1);
      else if (k === 'F3' || k === 'PageUp') sim.stepThrust(1);
      else if (k === 'F4') sim.setThrust(TLA.TOGA);
      else if (k === 'p') sim.toggle('PARK_BRK');
      else if (k === 'g') sim.toggle('GEAR');
      else if (k === 'f') sim.setSw('FLAPS', sim.s.sw.FLAPS + 1);
      else if (k === 'r') sim.setSw('FLAPS', sim.s.sw.FLAPS - 1);
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
    else if (st.view === 'qrh') setQrh(true);
    else if (st.view) setView(st.view);
    if (st.ctl) {
      setFlash(st.ctl);
      setTimeout(() => setFlash([]), 2500);
    }
  };
  const stepView = curStep && game?.mode === 'tutorial' ? (curStep.view === 'mcdu' ? 'ped' : curStep.view) : null;
  const title = type === 'c172' ? '✈ CESSNA 172 · LFCL' : '✈ A320 · COLD & DARK';

  return (
    <HlCtx.Provider value={hl}>
      <div className="app">
        <header className="topbar">
          <div className="tb-title">{title}</div>
          <nav className="tb-views">
            {views.map((v, i) => (
              <button key={v} className={`${view === v ? 'sel' : ''} ${stepView === v && view !== v ? 'pulse' : ''}`} onClick={() => setView(v)}>
                <kbd>{i + 1}</kbd> {t(UI[v])}
              </button>
            ))}
          </nav>
          <div className="tb-right">
            {game && <span className={`badge ${game.mode}`}>{t(game.mode === 'tutorial' ? UI.tutorial : UI.exam)}</span>}
            {game && <ClBadge game={game} />}
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
            <button className={qrh ? 'sel' : ''} onClick={() => setQrh(!qrh)} title="Q">
              📕 {type === 'c172' ? 'POH' : 'QRH'}
            </button>
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
        {qrh && !menu && <QrhBook game={game} onClose={() => setQrh(false)} />}
        {interlude && !menu && (
          <div className="overlay">
            <div className="menu interlude">
              <h1>✈ FL330 · LFBO → LFPO</h1>
              <div className="cruise-anim">
                <svg viewBox="0 0 400 60" width={400} height={60}>
                  <path d="M10 50 Q 200 -10 390 50" fill="none" stroke="#36e3ff" strokeDasharray="5 6" />
                  <circle cx={10} cy={50} r={4} fill="#fff" />
                  <circle cx={390} cy={50} r={4} fill="#fff" />
                  <text x={10} y={40} fill="#ccc" fontSize={11}>LFBO</text>
                  <text x={360} y={40} fill="#ccc" fontSize={11}>LFPO</text>
                </svg>
              </div>
              <p>{t(interlude)}</p>
              <button
                className="big primary"
                onClick={() => {
                  setInterlude(null);
                  setView('front');
                  sim.paused = paused;
                }}
              >
                {t(UI.resume)} ▶
              </button>
            </div>
          </div>
        )}
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
    </HlCtx.Provider>
  );
}
