/* Автотест: «робот-пилот» проходит весь сценарий от Cold & Dark до набора 3000 фт.
   Запуск: npm run selftest */
import { ecamLines } from '../src/sim/ecam';
import { KT } from '../src/sim/flight';
import { SCN } from '../src/sim/scenario';
import { sim, type SimEvent } from '../src/sim/sim';
import { Game } from '../src/game/game';
import { CHECKLISTS } from '../src/game/checklists';

declare const process: { argv: string[]; exitCode?: number; exit(c: number): never };

const seed = Number(process.argv[2] ?? 7);
const failures = (process.argv[3] ?? 'off') as 'off' | 'light' | 'full';
sim.reset(seed, failures, true);
const game = new Game(sim, 'exam');
game.start();
sim.paused = false;
const s = () => sim.s;
const log: string[] = [];
const P = (...a: unknown[]) => console.log(`[${s().t.toFixed(0).padStart(5)}s]`, ...a);
sim.on((e: SimEvent) => {
  if (e.type === 'radio') log.push(`${e.unit}: ${e.msg.en}`);
  if (['ecam', 'failure', 'engStartFault', 'apuAutoShutdown', 'tailStrike', 'liftoff', 'rto', 'overrun', 'powerLoss', 'irAlignFault', 'fireOut'].includes(e.type))
    P('EV', e.type, JSON.stringify({ ...e, type: undefined, msg: undefined }));
});
function run(sec: number, until?: () => boolean, hook?: () => void) {
  const t0 = s().t;
  while (s().t - t0 < sec) {
    hook?.();
    sim.step(0.05);
    if (until && until()) return s().t - t0;
  }
  return until ? -1 : sec;
}
const ok = (c: boolean, m: string) => {
  if (!c) {
    P('FAIL:', m);
    P('ECAM:', ecamLines(s()).map((l) => l.t).join(' | '));
    process.exitCode = 1;
  } else P('ok  ', m);
};
const tune = (f: number) => {
  s().radio.stby = f;
  sim.press('RMP_XFER');
  sim.release('RMP_XFER');
};
const type = (txt: string) => {
  for (const ch of txt) sim.mcduKey(ch);
};
const lsk = (side: 'L' | 'R', i: number, txt?: string) => {
  if (txt) type(txt);
  sim.mcduLsk(side, i);
  if (s().fms.msg) P('MCDU MSG', s().fms.msg);
};
const pressRel = (id: string) => {
  sim.press(id);
  sim.release(id);
};

// ---------- питание ----------
P('BAT V', s().elec.bat.map((b) => (23.6 + 3.4 * b.charge).toFixed(1)));
sim.setSw('BAT1', 1);
sim.setSw('BAT2', 1);
run(1);
ok(s().elec.dcBat, 'DC BAT powered');
sim.comms('crew_gpu_on');
run(20);
ok(s().gnd.gpu, 'GPU connected');
sim.setSw('EXT_PWR', 1);
run(1);
ok(s().elec.acEss, 'AC ESS powered from EXT');
if (s().failures.some((f) => f.id === 'lowBat')) run(900, () => s().elec.bat.every((b) => 23.6 + 3.4 * b.charge > 25.6));
sim.press('APU_FIRE_TEST');
run(2);
ok(s().ecam.active.some((a) => a.id === 'APU_FIRE'), 'APU FIRE test warning');
sim.release('APU_FIRE_TEST');
pressRel('MASTER_WARN');
sim.setSw('IR1_MODE', 1);
sim.setSw('IR2_MODE', 1);
sim.setSw('IR3_MODE', 1);
sim.setSw('APU_MASTER', 1);
run(14);
pressRel('APU_START');
let t = run(150, () => s().apu.avail);
if (t < 0 && s().apu.fault) {
  P('APU fault -> restart');
  sim.setSw('APU_MASTER', 0);
  run(40);
  sim.setSw('APU_MASTER', 1);
  run(14);
  pressRel('APU_START');
  t = run(150, () => s().apu.avail);
}
ok(t > 0, `APU AVAIL after ${t.toFixed(0)} s, EGT ${s().apu.egt.toFixed(0)}`);
sim.setSw('APU_BLEED', 1);
for (const id of ['FUEL_L1', 'FUEL_L2', 'FUEL_C1', 'FUEL_C2', 'FUEL_R1', 'FUEL_R2', 'OXY_CREW', 'RCDR_GND', 'SEAT_BELTS']) sim.setSw(id, 1);
sim.setSw('NO_SMOKING', 1);
sim.setSw('EMER_EXIT_LT', 1);
sim.setSw('NAV_LOGO', 1);
if (s().flags.elacFault) {
  run(10);
  sim.setSw('ELAC1', 0);
  sim.setSw('ELAC1', 1);
}
pressRel('ENG1_FIRE_TEST');
pressRel('ENG2_FIRE_TEST');
if (s().hyd.accu < 1500) {
  sim.setSw('HYD_Y_ELEC', 1);
  run(20);
  sim.setSw('HYD_Y_ELEC', 0);
}
run(3);
ok(s().bleed.leftPsi > 30 && s().bleed.rightPsi > 30, `bleed L ${s().bleed.leftPsi.toFixed(0)} R ${s().bleed.rightPsi.toFixed(0)} psi`);

// ---------- связь и MCDU ----------
sim.setSw('RMP_ON', 1);
tune(SCN.freqs.ATIS);
sim.comms('atis');
ok(s().atc.atis, 'ATIS received');
sim.mcduKey('INIT');
lsk('R', 1, 'LFBO/LFPO');
lsk('R', 3);
ok(s().fms.posConfirmed, 'ALIGN IRS confirmed');
lsk('L', 3, 'EGM320');
lsk('L', 5, '30');
lsk('L', 6, 'FL330');
sim.mcduKey('RIGHT');
lsk('R', 1, '58.2/27.0');
lsk('R', 2, '9.8');
sim.mcduKey('F-PLN');
lsk('L', 1);
lsk('L', 1);
lsk('L', 4); // 32L
lsk('L', 2); // BAXOS5B
lsk('R', 6);
ok(s().fms.rwy === '32L' && s().fms.sid === 'BAXOS5B', `RWY ${s().fms.rwy} SID ${s().fms.sid}`);
sim.mcduKey('PERF');
lsk('L', 1, '142');
lsk('L', 2, '145');
lsk('L', 3, '149');
lsk('R', 3, '1/UP0.8');
lsk('R', 4, '54');
ok(s().fms.flex === 54 && s().fms.ths === 0.8 && s().fms.toFlaps === 1, 'PERF TO data');
sim.toggle('FD');
s().fcu.baro = s().atc.qnh;
s().fcu.alt = 6000;
tune(SCN.freqs.DEL);
sim.comms('del_clr');
run(5);
ok(s().atc.clearance, 'IFR clearance squawk ' + s().atc.squawk);
for (const ch of s().atc.squawk) pressRel('XPDR_' + ch);
ok(s().radio.xpdrCode === s().atc.squawk, 'XPDR code set');
t = run(400, () => s().adirs.ir.every((i) => i.aligned));
ok(t >= 0, 'IRS aligned');
run(250, () => s().gnd.boarding >= 1);
sim.comms('cab_doors');
run(25);
ok(!s().gnd.doors.L1, 'doors closed');
sim.comms('cab_arm');
run(12);
sim.setSw('EXT_PWR', 0);
sim.comms('crew_gpu_off');
run(10);
ok(!s().gnd.gpu && s().elec.acEss, 'GPU off, AC from APU');
sim.setSw('BEACON', 1);
CHECKLISTS.find((c) => c.id === 'BEFORE_START')!.items.forEach((_, i) => game.checkItem('BEFORE_START', i));
ok(!!s().flags.cl_BEFORE_START, 'checklist BEFORE_START');
tune(SCN.freqs.GND);
sim.comms('gnd_pushreq');
run(4);
ok(s().atc.pushApproved, 'push approved');
sim.comms('crew_push');
run(3);
sim.setSw('PARK_BRK', 0);
run(5);
ok(s().gnd.pushStage === 'pushing', 'pushing');

// ---------- запуск двигателей во время буксировки ----------
sim.setSw('ENG_MODE', 2);
run(3);
sim.setSw('ENG2_MASTER', 1);
const st2 = s().t;
t = run(120, () => s().eng[1].running || s().eng[1].startFault !== '', () => {
  if (s().gnd.pushStage === 'wait-park') sim.setSw('PARK_BRK', 1);
});
if (s().eng[1].startFault) {
  P('ENG2 start fault', s().eng[1].startFault);
  sim.setSw('ENG2_MASTER', 0);
  run(35);
  sim.setSw('ENG2_MASTER', 1);
  t = run(120, () => s().eng[1].running);
}
ok(s().eng[1].running, `ENG2 running after ${(s().t - st2).toFixed(0)}s, peak EGT ${s().eng[1].peakEgt.toFixed(0)}, N2 ${s().eng[1].n2.toFixed(1)}`);
run(60, () => s().gnd.pushStage === 'wait-park');
sim.setSw('PARK_BRK', 1);
run(2);
ok(s().gnd.pushStage === 'connected-wait', 'push complete, park brake set');
sim.setSw('ENG1_MASTER', 1);
t = run(120, () => s().eng[0].running || s().eng[0].startFault !== '' || s().eng[0].fire);
if (s().eng[0].fire || s().eng[1].fire) {
  const n = s().eng[0].fire ? 1 : 2;
  P('ENGINE FIRE on', n, '— running ECAM procedure');
  sim.setThrust(0);
  sim.setSw('PARK_BRK', 1);
  tune(SCN.freqs.GND);
  sim.comms('atc_notify');
  sim.comms('cab_alert');
  sim.setSw(`ENG${n}_MASTER`, 0);
  sim.press(`ENG${n}_FIRE`);
  sim.press(`ENG${n}_FIRE`);
  pressRel(`ENG${n}_AGENT1`);
  run(12);
  if (s().eng[n - 1].fire) {
    pressRel(`ENG${n}_AGENT2`);
    run(10);
  }
  run(10);
  ok(s().result === 'fire', 'fire scenario finished: ' + s().result);
  const rep = game.finish();
  P('SCORE', rep.score, rep.grade.en, rep.result);
  for (const p of rep.items) P('  ', p.pts, p.text.en);
  process.exit(process.exitCode ?? 0);
}
if (s().eng[0].startFault) {
  sim.setSw('ENG1_MASTER', 0);
  run(35);
  sim.setSw('ENG1_MASTER', 1);
  run(120, () => s().eng[0].running);
}
ok(s().eng[0].running, `ENG1 running, peak EGT ${s().eng[0].peakEgt.toFixed(0)}; idle N1 ${s().eng[0].n1.toFixed(1)} FF ${s().eng[0].ff.toFixed(0)}`);
ok(s().hyd.g > 2800 && s().hyd.y > 2800 && s().hyd.b > 2800, 'hydraulics G/B/Y');
sim.setSw('ENG_MODE', 1);
sim.setSw('APU_BLEED', 0);
run(5);
sim.setSw('APU_MASTER', 0);
sim.setSw('SPD_BRK', 0);
sim.setSw('FLAPS', 1);
sim.knob('PITCH_TRIM', 8);
pressRel('AB_MAX');
ok(s().ac.autobrk === 3, 'autobrake MAX');
sim.comms('crew_disc');
run(14);
ok(!s().gnd.tow, 'tow disconnected');
if (s().bleed.pack1Fault) sim.setSw('PACK1', 0);
pressRel('ECP_STS');
run(1);
pressRel('ECP_STS');

const doCl = (id: string) => {
  const cl = CHECKLISTS.find((c) => c.id === id)!;
  cl.items.forEach((_, i) => {
    if (!game.checkItem(id, i)) P('checklist item failed', id, cl.items[i].ch);
  });
  ok(!!s().flags[cl.flag], 'checklist ' + id);
};
doCl('AFTER_START');
// ---------- руление ----------
sim.comms('gnd_taxi');
run(4);
ok(s().atc.taxiClear, 'taxi clearance');
sim.setSw('NOSE_LT', 1);
sim.setSw('PARK_BRK', 0);
sim.setThrust(4);
const taxiCtl = () => {
  const gs = s().ac.gs * KT;
  const want = s().gnd.taxiPath < 120 ? 6 : 18;
  s().keys.brake = gs > want + 2;
  sim.s.sw.TL1 = sim.s.sw.TL2 = gs < 3 ? 4 : gs < want ? 1.5 : 0;
};
t = run(400, () => s().ac.gs * KT > 10, taxiCtl);
// проверка рулей
for (const k of ['pitchUp', 'pitchDn', 'rollL', 'rollR', 'rudL', 'rudR'] as const) {
  s().keys[k] = true;
  run(1.2, undefined, taxiCtl);
  s().keys[k] = false;
  run(0.6, undefined, taxiCtl);
}
const f = s().ac.fctlCheck;
ok(f.up && f.dn && f.l && f.r && f.rl && f.rr, 'F/CTL check');
pressRel('ECP_TOCONFIG');
run(1, undefined, taxiCtl);
ok(s().ecam.toConfigOk, 'T.O CONFIG NORMAL');
run(5, undefined, taxiCtl);
t = run(600, () => s().gnd.taxiPath < 40, taxiCtl);
s().keys.brake = true;
sim.setThrust(0);
run(15, () => s().ac.stopped);
s().keys.brake = false;
ok(s().gnd.phase === 'holding', `at holding point, max taxi GS ${(s().ac.maxGs * KT).toFixed(0)} kt`);
tune(SCN.freqs.TWR);
sim.comms('cab_seats');
sim.comms('twr_ready');
run(4);
ok(s().atc.lineupClear, 'line up clearance');
sim.setSw('XPDR_MODE', 1);
sim.setSw('TCAS_MODE', 2);
sim.setSw('STROBE', 2);
sim.setSw('LAND_L', 2);
sim.setSw('LAND_R', 2);
sim.setSw('NOSE_LT', 2);
sim.setSw('RWY_TURNOFF', 1);
t = run(200, () => s().gnd.phase === 'runway', taxiCtl);
s().keys.brake = true;
sim.setThrust(0);
run(20, () => s().ac.stopped);
s().keys.brake = false;
t = run(30, () => s().atc.toClear);
ok(s().atc.toClear, 'take-off clearance');
run(40, () => s().gnd.cabinReady);
doCl('BEFORE_TAKEOFF');
doCl('BELOW_LINE');

// ---------- взлёт ----------
sim.setThrust(12);
run(7);
sim.setThrust(35);
const t0 = s().t;
P('FMA', s().fma.thr, s().fma.vert, s().fma.lat, s().fma.col5, 'N1', s().eng[0].n1.toFixed(1));
let rotated = false;
let gearUp = false;
let clb = false;
let vrDist = 0;
t = run(500, () => s().ac.alt - s().elev > 3000 || !!s().ac.overrun || !!s().result, () => {
  const ac = s().ac;
  if (s().eng.some((e) => e.failed) && ac.onGround && (s().flags.engFailIas as number) < SCN.v1) {
    if (!s().flags.botRto) {
      s().flags.botRto = true;
      P('engine failure at', Math.round(s().flags.engFailIas as number), 'kt — REJECT');
    }
    sim.setThrust(-20);
    s().flags.stickMouse = true;
    ac.stickP = 0;
    return;
  }
  if (s().eng.some((e) => e.failed) && !s().flags.botToga) {
    s().flags.botToga = true;
    sim.setThrust(45);
    P('engine failure after V1 — CONTINUE, TOGA');
  }
  if (!rotated && ac.ias >= SCN.vr) {
    rotated = true;
    vrDist = ac.dist;
    P('VR at', (s().t - t0).toFixed(1), 's dist', ac.dist.toFixed(0), 'm');
  }
  if (rotated) {
    const tgt = ac.onGround ? 15 : (s().fdPitch ?? 15);
    const err = tgt - ac.pitch;
    s().flags.stickMouse = true;
    ac.stickP = Math.max(-1, Math.min(1, err * (ac.onGround ? 0.3 : 0.25)));
    if (ac.onGround) ac.stickP = Math.min(ac.stickP, 0.62);
  }
  if (!ac.onGround && ac.vs > 300 && !gearUp && ac.alt - s().elev > 50) {
    gearUp = true;
    sim.setSw('GEAR', 0);
    P('gear up at', (ac.alt - s().elev).toFixed(0), 'ft AGL, IAS', ac.ias.toFixed(0));
  }
  if (s().fma.lvrClb && !clb) {
    clb = true;
    sim.setThrust(25);
    P('LVR CLB -> CL at', (ac.alt - s().elev).toFixed(0), 'ft, IAS', ac.ias.toFixed(0), 'VS', ac.vs.toFixed(0));
  }
});
run(10);
const ac = s().ac;
if (s().result === 'rto' || (s().result === 'success' && s().eng.some((e) => e.failed))) {
  const rep = game.finish();
  P('RTO result; stopped at', ac.dist.toFixed(0), 'm of', s().rwyLen, '; SCORE', rep.score, rep.grade.en);
  for (const p of rep.items) P('  ', p.pts, p.text.en);
  process.exit(process.exitCode ?? 0);
}
ok(!ac.tailStrike, `no tail strike (max ground pitch ${ac.maxPitchGround.toFixed(1)}°)`);
ok(ac.alt - s().elev > 3000, `reached 3000 ft AGL in ${(s().t - t0).toFixed(0)} s; IAS ${ac.ias.toFixed(0)} VS ${ac.vs.toFixed(0)} pitch ${ac.pitch.toFixed(1)} FMA ${s().fma.thr}/${s().fma.vert}`);
P('ground roll to VR', vrDist.toFixed(0), 'm; liftoff flag', s().flags);
P('ECAM active:', s().ecam.active.map((a) => a.id).join(','));
const rep = game.finish();
P('SCORE', rep.score, '/', rep.max, rep.grade, rep.result);
for (const p of rep.items) P('  ', p.pts, p.text.en);
P('radio log:\n  ' + log.slice(-6).join('\n  '));
