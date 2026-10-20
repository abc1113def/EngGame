/* Самопроверка Cessna 172: осмотр, запуск, круг, посадка, стоянка. Запуск: npx tsx scripts/c172test.ts [seed] [off|light|full] */
import { Game } from '../src/game/game';
import { inHg } from '../src/sim/c172/comms';
import { PATTERN, patternRel } from '../src/sim/c172/pattern';
import { WALK_IDS } from '../src/sim/c172/walk';
import { angDiff } from '../src/sim/scenario';
import { sim } from '../src/sim/sim';
import type { FailureLevel } from '../src/sim/types';

declare const process: { argv: string[]; exit: (c: number) => never };
const seed = Number(process.argv[2] ?? 3) || 3;
const failures = (['off', 'light', 'full'].includes(process.argv[3]) ? process.argv[3] : 'off') as FailureLevel;
sim.reset(seed, failures, true, 'c172', 'pattern');
const s = sim.s;
const c = s.c;
// nocl — чек-листы необязательны и не выполняются
const noCl = process.argv.includes('nocl');
const game = new Game(sim, 'exam', { checklists: !noCl });
game.start();
sim.paused = false;
console.log('failures:', s.failures.map((f) => f.id).join(', ') || 'none');
const P = (...a: unknown[]) => console.log(`[${s.t.toFixed(0).padStart(4)}]`, ...a);
sim.on((e) => {
  if (['cEngStart', 'cEngStop', 'liftoff', 'landing', 'vacated', 'parked', 'cCrash', 'atHold', 'onRunway', 'overrun'].includes(e.type)) P('EV', e.type, JSON.stringify({ ...e, type: undefined }));
  if (e.type === 'score') P('SCORE', e.pts, e.text.en);
  if (e.type === 'radio' && !e.me) P('RADIO', e.unit, e.msg.en);
});
const run = (sec: number, until?: () => boolean, hook?: () => void) => {
  const t0 = s.t;
  while (s.t - t0 < sec && !game.ended) {
    hook?.();
    sim.step(0.05);
    if (until?.()) return true;
  }
  return false;
};
const pr = (id: string) => {
  sim.press(id);
  sim.release(id);
};
const cl = (id: string) => {
  if (noCl) return;
  const ch = game.checklists().find((x) => x.id === id)!;
  ch.items.forEach((_, i) => {
    if (!game.checkItem(id, i)) P('CL FAIL', id, ch.items[i].ch, ch.items[i].why.en);
  });
};
const tune = (khz: number) => {
  while (Math.abs(c.comStby - khz) >= 1000) sim.knob('C_COM_KNOB', c.comStby < khz ? 1 : -1, 'outer');
  while (c.comStby !== khz) sim.knob('C_COM_KNOB', c.comStby < khz ? 1 : -1, 'inner');
  pr('C_COM_FLIP');
};
const clampv = (v: number, a = -1, b = 1) => Math.max(a, Math.min(b, v));
// ---------- осмотр ----------
sim.walk('docs');
sim.walk('lock');
sim.setSw('C_BAT', 1);
run(2);
P('fuel gauges L/R', c.fuelL.toFixed(0), c.fuelR.toFixed(0), 'busV', c.busV.toFixed(1));
sim.setSw('C_BAT', 0);
for (const id of WALK_IDS) {
  if (id === 'docs' || id === 'lock') continue;
  sim.walk(id);
  if (id === 'sumpL') while (c.pre.sumpWater > 0) sim.walk('sumpL');
  if (id === 'sumpL' && !s.flags.sumpL_ok) sim.walk('sumpL');
  if (id === 'oil') while (c.pre.oilQt < 6) sim.walk('oilAdd');
}
sim.walk('sumpL');
run(1);
// ---------- запуск ----------
sim.comms('c_brief');
run(3);
cl('C_BEFORE_START');
sim.setSw('C_BAT', 1);
sim.setSw('C_ALT', 1);
sim.setSw('C_BEACON', 1);
run(1);
sim.setSw('C_FUEL_PUMP', 1);
sim.setLever('C_MIX', 1);
run(4);
sim.setLever('C_MIX', 0);
sim.setSw('C_FUEL_PUMP', 0);
sim.setLever('C_THR', 0.1);
sim.comms('c_clear');
run(2);
s.sw.C_MAGS = 4;
run(9, () => c.running);
s.sw.C_MAGS = 3;
run(0.5);
sim.setLever('C_MIX', 1);
run(5);
P('running', c.running, 'rpm', c.rpm.toFixed(0));
sim.setLever('C_THR', 0.17);
run(10);
if (c.failAlt) {
  sim.setSw('C_ALT', 0);
  run(1);
  sim.setSw('C_ALT', 1);
}
run(25);
P('rpm', c.rpm.toFixed(0), 'oilP', c.oilP.toFixed(0), 'amps', c.amps.toFixed(1), 'busV', c.busV.toFixed(1), 'vac', c.vac.toFixed(1));
sim.setSw('C_AVIONICS1', 1);
sim.setSw('C_AVIONICS2', 1);
sim.setSw('C_NAV', 1);
run(2);
pr('C_COM_FLIP');
sim.comms('c_atis');
run(3);
c.baro = Math.round(inHg(s.atc.qnh) * 100) / 100;
run(40, () => c.hiSpin > 0.7);
sim.knob('C_DG', 0);
c.hiErr = 0;
sim.setSw('C_XPDR', 1);
tune(120375);
sim.comms('c_taxi');
run(4);
// ---------- руление ----------
sim.setSw('C_PARK', 0);
let braked = false;
run(400, () => s.gnd.phase === 'holding', () => {
  const kt = s.ac.gs * 1.944;
  if (!braked && kt > 3) {
    s.keys.brake = true;
    braked = true;
  } else s.keys.brake = kt > 9 || s.gnd.taxiPath < 22;
  sim.setLever('C_THR', kt < 7 && s.gnd.taxiPath > 22 ? 0.3 : 0.05);
});
s.keys.brake = false;
P('at hold', s.gnd.phase);
// ---------- опробование ----------
sim.setSw('C_PARK', 1);
sim.setLever('C_THR', 0.1);
for (const [p, r] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) {
  s.flags.stickMouse = true;
  s.ac.stickP = p;
  s.ac.stickR = r;
  run(0.3);
}
s.ac.stickP = s.ac.stickR = 0;
c.trim = 0;
sim.setLever('C_THR', 0.69);
run(8);
P('runup rpm', c.rpm.toFixed(0));
sim.setSw('C_MAGS', 2);
run(3);
sim.setSw('C_MAGS', 3);
run(3);
sim.setSw('C_MAGS', 1);
run(3);
sim.setSw('C_MAGS', 3);
run(2);
P('mag drops L/R', s.flags.cMagL, s.flags.cMagR, 'bad', s.flags.cMagBad ?? false);
pr('C_ANN_TEST');
sim.setLever('C_THR', 0);
run(4);
sim.setLever('C_THR', 0.17);
run(4);
if (s.flags.cMagBad || s.flags.cRough || (c.failOil && c.running)) {
  P('ABORT: shutting down');
  sim.setLever('C_THR', 0);
  sim.setLever('C_MIX', 0);
  run(8);
  sim.setSw('C_MAGS', 0);
  sim.setSw('C_AVIONICS1', 0);
  sim.setSw('C_AVIONICS2', 0);
  sim.setSw('C_BAT', 0);
  sim.setSw('C_ALT', 0);
  run(5);
} else {
  sim.setSw('C_XPDR', 3);
  sim.setSw('C_LAND', 1);
  sim.setSw('C_STROBE', 1);
  run(1);
  cl('C_BEFORE_TO');
  sim.comms('c_ready');
  run(4);
  // ---------- взлёт ----------
  sim.setSw('C_PARK', 0);
  run(100, () => s.gnd.phase === 'runway', () => {
    const kt = s.ac.gs * 1.944;
    s.keys.brake = kt > 6;
    sim.setLever('C_THR', kt < 5 ? 0.3 : 0.05);
  });
  s.keys.brake = false;
  sim.setLever('C_THR', 1);
  s.flags.stickMouse = true;
  run(60, () => !s.ac.onGround, () => {
    s.ac.stickP = s.ac.ias > 52 ? clampv(0.4 + (8 - s.ac.pitch) * 0.2) : 0;
  });
  let thrI = 0.6;
  const steer = (hdg: number, maxBank = 25) => {
    const rollCmd = clampv(angDiff(hdg, s.ac.hdg) * 1.2, -maxBank, maxBank);
    s.ac.stickR = clampv((rollCmd - s.ac.roll) * 0.08);
  };
  const holdVs = (vsCmd: number) => {
    s.ac.stickP = clampv((vsCmd - s.ac.vs) * 0.0016 - ((s.flags.cGammaDot as number) ?? 0) * 0.1);
  };
  const holdIasPitch = (ias: number) => {
    s.ac.stickP = clampv((s.ac.ias - ias) * 0.05 - ((s.flags.cGammaDot as number) ?? 0) * 0.1);
  };
  const spd = (ias: number) => {
    thrI = clampv(thrI + (ias - s.ac.ias) * 0.001, 0.05, 1);
    sim.setLever('C_THR', clampv(thrI + (ias - s.ac.ias) * 0.03, 0, 1));
  };
  const hdgTo = (al: number, sd: number) => {
    const g = s.geo;
    const x = g.thr.x + g.rwyDir.x * al + g.side.x * sd;
    const y = g.thr.y + g.rwyDir.y * al + g.side.y * sd;
    return (Math.atan2(x - s.ac.x, y - s.ac.y) * 180 / Math.PI + 360) % 360;
  };
  const elev = s.elev;
  let last = -1;
  let dwRep = false;
  let bl = false;
  let fin = false;
  run(900, () => s.ac.onGround, () => {
    const i = (s.flags.cGuide as number) ?? 0;
    const agl = s.ac.alt - elev;
    const p = PATTERN[Math.min(5, i)];
    const r = patternRel(s);
    if (i !== last) {
      last = i;
      P('GUIDE', i, p?.label, 'agl', agl.toFixed(0), 'ias', s.ac.ias.toFixed(0), 'rpm', c.rpm.toFixed(0));
    }
    if (i === 2 && agl > 900 && !dwRep) {
      dwRep = true;
      sim.comms('c_dw');
    }
    if (i === 2 && dwRep && !bl && agl > 900) {
      bl = true;
      cl('C_BEFORE_LDG');
    }
    if (i >= 4 && !fin && Math.abs(r.sd) < 600) {
      fin = true;
      sim.comms('c_final');
    }
    if (agl < 150 && i === 0) {
      sim.setLever('C_THR', 1);
      s.ac.stickP = clampv(0.6 + (9 - s.ac.pitch) * 0.3);
      steer(s.rwyHdg, 5);
    } else if (i <= 2 && agl < 940) {
      sim.setLever('C_THR', 1);
      thrI = 0.55;
      holdIasPitch(76);
      steer(hdgTo(p.along, p.side));
    } else if (i <= 2) {
      holdVs(clampv((elev + 1000 - s.ac.alt) * 2, -500, 500));
      spd(r.a < 200 && i === 2 ? 75 : 90);
      steer(hdgTo(p.along, p.side));
      if (i === 2 && r.a < 200) sim.setSw('C_FLAPS', 1);
    } else if (i === 3) {
      holdVs(clampv((elev + 750 - s.ac.alt) * 2, -600, 300));
      spd(70);
      sim.setSw('C_FLAPS', 2);
      steer(hdgTo(p.along, p.side));
    } else if (i === 4) {
      holdVs(clampv((elev + 450 - s.ac.alt) * 2, -600, 300));
      spd(65);
      sim.setSw('C_FLAPS', 3);
      steer(Math.abs(r.sd) < 450 ? (s.rwyHdg - clampv(r.sd * 0.15, -35, 35) + 360) % 360 : hdgTo(p.along, p.side));
    } else {
      const dist = -r.a + 120;
      const gsAlt = elev + Math.max(0, dist) * Math.tan((3 * Math.PI) / 180) * 3.28;
      steer((s.rwyHdg - clampv(r.sd * 0.15, -35, 35) + 360) % 360, 20);
      if (agl > 15) {
        holdVs(clampv(-360 + (gsAlt - s.ac.alt) * 3, -800, 200));
        spd(62);
      } else {
        sim.setLever('C_THR', 0);
        s.ac.stickP = clampv((-90 - s.ac.vs) * 0.004 + 0.35);
      }
    }
  });
  P('TD', JSON.stringify(s.ac.td));
  s.flags.stickMouse = false;
  s.ac.stickP = s.ac.stickR = 0;
  // ---------- пробег и сход ----------
  run(240, () => s.gnd.phase === 'taxiin', () => {
    const kt = s.ac.gs * 1.944;
    s.keys.brake = kt > 10;
    sim.setLever('C_THR', kt < 7 ? 0.3 : 0);
  });
  P('vacated', s.gnd.phase, 'exit', s.ac.exit, 'dist', s.ac.dist.toFixed(0), 'gs', (s.ac.gs * 1.944).toFixed(1), 'rpm', c.rpm.toFixed(0), 'park', s.sw.C_PARK, 'running', c.running);
  sim.setSw('C_FLAPS', 0);
  sim.setSw('C_XPDR', 1);
  sim.setSw('C_LAND', 0);
  sim.setSw('C_STROBE', 0);
  sim.comms('c_vacated');
  run(4);
  cl('C_AFTER_LDG');
  run(400, () => s.gnd.phase === 'parked', () => {
    const kt = s.ac.gs * 1.944;
    s.keys.brake = kt > 8 || s.gnd.taxiPath < 7;
    sim.setLever('C_THR', kt < 5 && s.gnd.taxiPath > 7 ? 0.3 : 0.05);
  });
  s.keys.brake = false;
  P('parked', s.gnd.phase);
  // ---------- выключение ----------
  sim.setSw('C_PARK', 1);
  sim.setLever('C_THR', 0);
  sim.setSw('C_AVIONICS1', 0);
  sim.setSw('C_AVIONICS2', 0);
  sim.setSw('C_NAV', 0);
  sim.setSw('C_TAXI', 0);
  run(2);
  sim.setLever('C_MIX', 0);
  run(8, () => !c.running);
  run(3);
  sim.setSw('C_MAGS', 0);
  sim.setSw('C_BEACON', 0);
  sim.setSw('C_BAT', 0);
  sim.setSw('C_ALT', 0);
  sim.setSw('C_FUEL_SEL', 0);
  pr('C_LOCK');
  run(1);
  cl('C_SECURE');
  for (const id of ['tieL', 'tieR', 'tieT', 'pitot'] as const) sim.walk(id);
  sim.walk('chocks');
  run(5);
}
const rep = game.report ?? game.finish();
P('RESULT', rep.result, rep.reason.en, 'score', rep.score, rep.grade.en, `${rep.done}/${rep.total}`);
P('missed', rep.missed.join(', '));
for (const it of rep.items) P('  ', it.pts, it.text.en);
if (rep.result !== 'secured') process.exit(1);
