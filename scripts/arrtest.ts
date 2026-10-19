/* Самопроверка прилёта A320: заход ILS, посадка, заруливание и обесточивание. Запуск: npx tsx scripts/arrtest.ts [manual] */
import { Game } from '../src/game/game';
import { ecamLines } from '../src/sim/ecam';
import { KT, ilsDev, speeds } from '../src/sim/flight';
import { sim } from '../src/sim/sim';

declare const process: { argv: string[]; exit: (c: number) => never };
const manual = process.argv.includes('manual');
const scn = process.argv.includes('full') ? 'full' : 'arr';
sim.reset(5, 'off', true, 'a320', 'arr');
const s = sim.s;
const game = new Game(sim, 'exam');
game.start();
sim.paused = false;
const P = (...a: unknown[]) => console.log(`[${s.t.toFixed(0).padStart(4)}]`, ...a);
sim.on((e) => {
  if (['locCapture', 'gsCapture', 'landMode', 'flare', 'landing', 'vacated', 'parked', 'goAround', 'stepDone'].includes(e.type)) P('EV', e.type, e.id ?? '', e.td ? JSON.stringify(e.td) : '');
  if (e.type === 'score') P('SCORE', e.pts, e.text.en);
  if (e.type === 'radio') P('RADIO', e.unit, e.me ? '>' : '<', e.msg.en);
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
  const c = game.checklists().find((x) => x.id === id)!;
  c.items.forEach((_, i) => {
    if (!game.checkItem(id, i)) P('CL FAIL', id, c.items[i].ch, c.items[i].why.en);
  });
};
const swap = () => pr('RMP_XFER');
void scn;
run(1);
// ---------- подготовка к заходу ----------
swap(); // ATIS в активной
sim.comms('arr_atis');
run(3);
swap(); // назад на Подход
pr('BARO_STD');
s.fcu.baro = s.atc.arrQnh;
// PERF APPR
s.fms.qnhAppr = s.atc.arrQnh;
s.fms.mda = 491;
sim.setSw('SEAT_BELTS', 1);
sim.setSw('LAND_L', 2);
sim.setSw('LAND_R', 2);
sim.setSw('NOSE_LT', 2);
sim.toggle('LS');
pr('AB_LO');
run(2);
pr('ECP_STS');
run(2);
pr('ECP_STS');
cl('APPROACH');
pr('APPR');
let flaps = 0,
  gear = false,
  retard = false,
  apOff = false,
  est = false,
  twr = false,
  cab = false,
  ldgCl = false;
const hook = () => {
  const d = ilsDev(s)!;
  const ias = s.ac.ias;
  if (!est && s.flags.locCap && s.t - (s.flags.locCapT as number) > 10) {
    est = true;
    sim.comms('app_est');
  }
  if (est && !twr && s.atc.pending.length === 0) {
    twr = true;
    s.radio.stby = 120500;
    swap();
    sim.comms('twr_land');
  }
  if (flaps === 0 && d.dist < 15.5 * 1852) {
    sim.setSw('FLAPS', 1);
    flaps = 1;
  }
  if (flaps === 1 && ias < 198) {
    sim.setSw('FLAPS', 2);
    flaps = 2;
  }
  if (flaps === 2 && !gear && d.dist < 11 * 1852) {
    sim.setSw('GEAR', 1);
    gear = true;
    sim.setSw('SPD_BRK', 0);
  }
  if (flaps === 2 && gear && d.dist < 7.5 * 1852 && ias < 182) {
    sim.setSw('FLAPS', 3);
    flaps = 3;
  }
  if (flaps === 3 && d.dist < 8 * 1852 && ias < 172) {
    sim.setSw('FLAPS', 4);
    flaps = 4;
  }
  if (flaps === 4 && !cab) {
    cab = true;
    sim.comms('cab_land');
  }
  if (cab && s.gnd.cabinReady && s.atc.ldgClear && !ldgCl && s.ac.flaps > 35 && s.ac.alt - s.elev < 1900) {
    ldgCl = true;
    cl('LANDING');
  }
  const agl = s.ac.alt - s.elev;
  if (!s.flags.p1000 && agl < 1000) {
    s.flags.p1000 = true;
    P('1000 ft', 'ias', ias.toFixed(0), 'vapp', speeds(s).vapp, 'gs', d.gsDots.toFixed(2), 'loc', d.locDots.toFixed(2), 'vs', s.ac.vs.toFixed(0));
  }
  if (manual && !apOff && agl < 600) {
    apOff = true;
    pr('AP1');
  }
  if (manual && apOff && !s.ac.onGround) {
    s.flags.stickMouse = true;
    const fdP = s.fdPitch ?? s.ac.pitch;
    s.ac.stickP = Math.max(-1, Math.min(1, (fdP - s.ac.pitch) * 0.35));
    s.ac.stickR = Math.max(-1, Math.min(1, (((s.flags.fdRoll as number) ?? 0) - s.ac.roll) * 0.08));
  }
  if (!retard && agl < 20 && !s.ac.onGround) {
    retard = true;
    sim.setThrust(0);
  }
};
run(700, () => s.ac.landed, hook);
const td = s.ac.td!;
P('TOUCHDOWN vs', td.vs.toFixed(0), 'along', td.along.toFixed(0), 'side', td.side.toFixed(1), 'pitch', td.pitch.toFixed(1));
s.flags.stickMouse = false;
s.ac.stickP = 0;
s.ac.stickR = 0;
sim.setThrust(-20);
run(8);
run(60, () => s.ac.ias < 70);
sim.setThrust(-2);
run(4);
sim.setThrust(0);
run(60, () => s.ac.gs * KT < 25);
run(200, () => s.gnd.phase === 'taxiin', () => {
  const gs = s.ac.gs * KT;
  s.keys.brake = gs > 22;
  s.sw.TL1 = s.sw.TL2 = gs < 12 ? 6 : 0;
});
P('vacated, exit', s.ac.exit);
// ---------- после посадки ----------
s.keys.brake = true;
s.sw.TL1 = s.sw.TL2 = 0;
run(10, () => s.ac.stopped);
sim.setSw('SPD_BRK', 1);
sim.setSw('FLAPS', 0);
sim.setSw('STROBE', 1);
sim.setSw('LAND_L', 0);
sim.setSw('LAND_R', 0);
sim.setSw('NOSE_LT', 1);
sim.setSw('WX_SYS', 1);
sim.setSw('WX_PWS', 0);
sim.setSw('TCAS_MODE', 0);
sim.setSw('APU_MASTER', 1);
run(3);
pr('APU_START');
s.radio.stby = 121950;
swap();
run(3);
sim.comms('gnd_taxiin');
run(5);
run(60, () => s.apu.avail);
cl('AFTER_LANDING');
s.keys.brake = false;
run(500, () => s.gnd.phase === 'parked', () => {
  const gs = s.ac.gs * KT;
  const want = s.gnd.taxiPath < 80 ? 5 : 16;
  s.keys.brake = gs > want + 2 || s.gnd.taxiPath < 12;
  s.sw.TL1 = s.sw.TL2 = gs < want ? 5 : 0;
});
P('PARKED', s.gnd.phase, 'remaining', s.gnd.taxiPath.toFixed(1));
// ---------- стоянка ----------
sim.setSw('PARK_BRK', 1);
s.keys.brake = false;
run(2);
sim.setSw('APU_BLEED', 1);
run(3);
sim.setSw('ENG1_MASTER', 0);
sim.setSw('ENG2_MASTER', 0);
run(60, () => s.eng.every((e) => e.n2 < 5));
sim.setSw('BEACON', 0);
sim.setSw('SEAT_BELTS', 0);
for (const k of ['L1', 'L2', 'C1', 'C2', 'R1', 'R2']) sim.setSw('FUEL_' + k, 0);
sim.setSw('XPDR_MODE', 0);
run(2);
sim.comms('cab_disarm');
run(30);
cl('PARKING');
// ---------- обесточивание ----------
for (const n of [1, 2, 3]) sim.setSw(`IR${n}_MODE`, 0);
sim.setSw('OXY_CREW', 0);
sim.setSw('EMER_EXIT_LT', 0);
sim.setSw('NO_SMOKING', 0);
sim.setSw('NAV_LOGO', 0);
sim.setSw('STROBE', 0);
sim.setSw('NOSE_LT', 0);
sim.setSw('RWY_TURNOFF', 0);
run(2);
sim.setSw('APU_BLEED', 0);
run(2);
sim.setSw('APU_MASTER', 0);
run(200, () => s.apu.n < 1 && s.apu.flap < 0.05);
P('APU n', s.apu.n.toFixed(1));
cl('SECURING');
sim.setSw('BAT1', 0);
sim.setSw('BAT2', 0);
run(5);
const rep = game.report ?? game.finish();
P('ECAM', ecamLines(s).map((l) => l.t).join('|'));
P('RESULT', rep.result, rep.reason.en, 'score', rep.score, rep.grade.en);
P('missed', rep.missed.join(', '));
for (const it of rep.items) P('  ', it.pts, it.text.en);
if (rep.result !== 'secured') process.exit(1);
