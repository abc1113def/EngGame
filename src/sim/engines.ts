import { approach, clamp, lag, type Emit } from './systems';
import type { EngineState, SimState } from './types';

export const IDLE_N2 = 58.4;
export const IDLE_N1 = 19.6;
export const START_EGT_LIMIT = 725;
export const EGT_RED = 950;

/** Положения РУД (TLA, градусы) */
export const TLA = { REV: -20, IDLE: 0, CL: 25, FLX: 35, TOGA: 45 };

export function thrustLimits(s: SimState) {
  const toga = 93.2 - (s.oat - 15) * 0.07;
  const mct = toga - 3.4;
  const cl = toga - 8.6;
  const flex = s.fms.flex != null && s.fms.flex > s.oat ? toga - (s.fms.flex - s.oat) * 0.18 : null;
  return { toga, mct, cl, flex };
}

export function tlaDetent(tla: number): 'REV' | 'IDLE' | 'MAN' | 'CL' | 'FLX' | 'TOGA' {
  if (tla < -0.5) return 'REV';
  if (tla <= 0.5) return 'IDLE';
  if (Math.abs(tla - TLA.CL) <= 0.6) return 'CL';
  if (Math.abs(tla - TLA.FLX) <= 0.6) return 'FLX';
  if (tla >= TLA.TOGA - 0.6) return 'TOGA';
  return 'MAN';
}

/** Команда N1 от FADEC по положению РУД */
export function n1Command(s: SimState, tla: number): number {
  const lim = thrustLimits(s);
  const ac = s.ac;
  if (tla < -0.5) {
    if (!ac.onGround) return IDLE_N1;
    return IDLE_N1 + (70 - IDLE_N1) * clamp(-tla / 20, 0, 1);
  }
  if (tla <= 0.5) return IDLE_N1 + (ac.onGround ? 0 : 6);
  if (ac.athrActive && tla <= TLA.CL + 0.6) {
    return s.flags.athrN1 != null ? (s.flags.athrN1 as number) : lim.cl;
  }
  const flxN1 = s.flags.flxLocked && lim.flex != null ? lim.flex : lim.mct;
  if (tla <= TLA.CL) return IDLE_N1 + (lim.cl - IDLE_N1) * (tla / TLA.CL);
  if (tla <= TLA.FLX) return lim.cl + (flxN1 - lim.cl) * ((tla - TLA.CL) / (TLA.FLX - TLA.CL));
  return flxN1 + (lim.toga - flxN1) * clamp((tla - TLA.FLX) / (TLA.TOGA - TLA.FLX), 0, 1);
}

export function engThrust(e: EngineState, vKt: number): number {
  if (e.n1 < 5) return 0;
  const lapse = 1 - 0.0014 * clamp(vKt, 0, 250);
  const fwd = 104000 * Math.pow(e.n1 / 93, 2.2) * lapse;
  if (e.rev > 0.05) return -fwd * 0.38 * e.rev;
  return fwd;
}

export function updEngines(s: SimState, dt: number, emit: Emit) {
  const mode = s.sw.ENG_MODE; // 0 CRANK, 1 NORM, 2 IGN/START
  for (let i = 0; i < 2; i++) {
    const e = s.eng[i];
    const n = i + 1;
    const master = s.sw[`ENG${n}_MASTER`] === 1;
    const firePb = s.sw[`ENG${n}_FIRE`] === 1;
    const man = s.sw[`ENG${n}_MAN_START`] === 1;
    const psi = i === 0 ? s.bleed.leftPsi : s.bleed.rightPsi;
    const fadec = s.elec.dcBat && (mode !== 1 || master || e.n2 > 5);
    const tank = (i === 0 ? s.fuel.left : s.fuel.right) + s.fuel.center + (s.fuel.xfeed > 0.9 ? s.fuel.left + s.fuel.right : 0);
    e.lpValve = master && !firePb && s.elec.dcBat;
    const fuelAvail = e.lpValve && tank > 0;
    const prevRunning = e.running;

    const abort = (reason: EngineState['startFault']) => {
      e.phase = 'abort';
      e.hpValve = false;
      e.ign = '';
      e.timer = 0;
      e.startFault = reason;
      emit({ type: 'engStartFault', eng: n, reason });
    };

    // ---------- логика фаз ----------
    if (!master) {
      if (e.startFault && e.phase !== 'abort') e.startFault = '';
      if (e.phase === 'fuel' || e.phase === 'accel' || e.phase === 'run') {
        e.phase = 'shutdown';
        e.running = false;
        emit({ type: 'engShutdown', eng: n });
      }
      if (e.phase === 'crank' && !e.manualStart) e.phase = 'off';
      if (e.phase === 'abort' && e.timer > 30) {
        e.phase = 'off';
        e.startFault = '';
      }
      e.hpValve = false;
      if (e.phase !== 'abort') e.ign = '';
    }

    if ((e.phase === 'off' || e.phase === 'shutdown') && !e.running && fadec && !firePb && !e.failed) {
      if (master && mode === 2 && !man && e.startFault === '' && e.n2 < 30) {
        e.phase = 'crank';
        e.manualStart = false;
        e.timer = 0;
        e.peakEgt = e.egt;
        emit({ type: 'engStart', eng: n });
      } else if (man && mode !== 1 && !master) {
        e.phase = 'crank';
        e.manualStart = true;
        e.timer = 0;
        e.peakEgt = e.egt;
      }
    }
    if (e.phase === 'crank' && e.manualStart && !man && !master) e.phase = 'off';

    // ---------- клапан стартера ----------
    let wantValve = false;
    if (e.phase === 'crank' || e.phase === 'fuel' || e.phase === 'accel') wantValve = e.n2 < 50;
    if (e.phase === 'abort') wantValve = e.timer <= 30 && e.n2 < 50;
    if (e.manualStart && e.phase !== 'run' && e.phase !== 'off' && e.phase !== 'shutdown') wantValve = wantValve && (man || e.phase !== 'crank');
    if (firePb) wantValve = false;
    e.startValve = wantValve && s.elec.dcEss;
    const torque = e.startValve && psi > 15 ? clamp((psi - 15) / 15, 0, 1.25) : 0;

    // ---------- автоматика запуска ----------
    if (e.phase === 'crank') {
      e.timer += dt;
      if (!e.manualStart) {
        if (e.n2 >= 16 && !e.ign) {
          e.ign = e.lastIgn === 'A' ? 'B' : 'A';
          e.lastIgn = e.ign;
        }
        if (e.n2 >= 22 && fuelAvail) {
          e.phase = 'fuel';
          e.hpValve = true;
          e.timer = 0;
          e.lightoff = 2.5 + Math.random() * 2;
        } else if (e.timer > 50 && e.n2 < 20) abort('STARTER');
      } else if (master && mode === 2 && e.n2 >= 20 && fuelAvail) {
        e.ign = 'AB';
        e.phase = 'fuel';
        e.hpValve = true;
        e.timer = 0;
        e.lightoff = 2 + Math.random();
      }
    } else if (e.phase === 'fuel') {
      e.timer += dt;
      if (!fuelAvail) {
        e.phase = 'shutdown';
        e.hpValve = false;
      } else if (e.failPending === 'NOLIGHT') {
        if (e.timer > 9) e.ign = 'AB';
        if (e.timer > 18 && !e.manualStart) {
          e.failPending = '';
          abort('IGN');
        }
      } else if (e.timer >= e.lightoff) {
        e.phase = 'accel';
        e.timer = 0;
      }
    } else if (e.phase === 'accel') {
      e.timer += dt;
      if (e.n2 >= 50 && !e.manualStart) e.ign = '';
      if (e.n2 >= 50 && e.manualStart) e.ign = '';
      if (!fuelAvail) {
        e.phase = 'shutdown';
        e.hpValve = false;
      } else if (e.egt > START_EGT_LIMIT && !e.manualStart) {
        e.failPending = '';
        abort('EGT');
      } else if (e.egt > START_EGT_LIMIT && e.manualStart && !e.startFault) {
        e.startFault = 'EGT';
        emit({ type: 'engStartFault', eng: n, reason: 'EGT' });
      } else if (e.n2 >= IDLE_N2 - 0.6) {
        e.phase = 'run';
        e.running = true;
        e.availTimer = 10;
        e.ign = '';
        e.failPending = e.failPending === 'HOT' ? '' : e.failPending;
        emit({ type: 'engRunning', eng: n });
      }
    } else if (e.phase === 'abort') {
      e.timer += dt;
    } else if (e.phase === 'run') {
      if (!fuelAvail || e.failed) {
        e.phase = 'shutdown';
        e.running = false;
        e.hpValve = false;
        emit({ type: 'engFlameout', eng: n });
      }
      e.ign = mode === 2 || (mode === 0 && false) ? 'AB' : '';
    }

    // ---------- динамика ----------
    const hot = e.failPending === 'HOT';
    if (e.phase === 'run') {
      const tla = s.sw[`TL${n}`];
      const cmd = n1Command(s, tla);
      // реверс
      const revWanted = tla < -0.5 && s.ac.onGround && (i === 0 ? s.hyd.g : s.hyd.y) > 1500;
      e.rev = approach(e.rev, revWanted ? 1 : 0, 0.6, dt);
      const tgt = e.rev > 0.05 && e.rev < 0.95 ? IDLE_N1 : cmd;
      const d = tgt - e.n1;
      const inc = e.n1 < 30 ? 4.5 : 9;
      e.n1 = clamp(e.n1 + clamp(d * 0.9, -7, inc) * dt, 0, 104);
      const n2T = IDLE_N2 + (e.n1 - IDLE_N1) * 0.53;
      e.n2 = lag(e.n2, n2T, 2.5, dt);
      const egtT = 395 + (s.oat - 15) * 0.8 + (e.n1 - IDLE_N1) * 5.5 + (s.bleed.eng1Valve && i === 0 ? 8 : 0);
      e.egt = lag(e.egt, egtT, 0.45, dt);
      const ffT = 290 + Math.pow(Math.max(0, e.n1 - IDLE_N1), 2) * 0.56;
      e.ff = lag(e.ff, ffT, 1.2, dt);
    } else if (e.phase === 'accel') {
      const p = clamp((e.n2 - 22) / (IDLE_N2 - 22), 0, 1);
      const rate = Math.max(0.45, 0.075 * (IDLE_N2 + 1.2 - e.n2)) + torque * 0.35;
      e.n2 = Math.min(IDLE_N2 + 0.2, e.n2 + rate * dt);
      const peak = hot ? 860 : 700 + (s.oat - 15) * 1.5;
      const idleEgt = 395 + (s.oat - 15) * 0.8;
      const egtT = p < 0.35 ? s.oat + (peak - s.oat) * (p / 0.35) : peak + (idleEgt - peak) * ((p - 0.35) / 0.65);
      e.egt = lag(e.egt, hot ? Math.max(egtT, e.egt + 40 * dt) : egtT, 0.55, dt);
      e.ff = lag(e.ff, 160 + p * 140, 1.5, dt);
      const n1T = IDLE_N1 * Math.pow(clamp((e.n2 - 14) / (IDLE_N2 - 14), 0, 1), 1.6);
      e.n1 = lag(e.n1, n1T, 0.6, dt);
      e.rev = 0;
    } else {
      // без горения: прокрутка стартером или выбег
      if (torque > 0) {
        const t = 23 + 4 * torque;
        e.n2 = e.n2 < t ? e.n2 + (t - e.n2) * 0.1 * dt : Math.max(t, e.n2 - Math.max(0.4, e.n2 * 0.06) * dt);
      } else e.n2 = Math.max(0, e.n2 - Math.max(0.35, e.n2 * 0.055) * dt);
      e.n1 = lag(e.n1, e.n2 * 0.2, 0.25, dt);
      if (e.n1 < 0.05) e.n1 = 0;
      e.egt = lag(e.egt, s.oat, e.phase === 'abort' ? 0.06 : 0.025, dt);
      e.ff = e.phase === 'fuel' ? lag(e.ff, 140, 2, dt) : lag(e.ff, 0, 3, dt);
      e.rev = approach(e.rev, 0, 0.5, dt);
    }
    e.peakEgt = Math.max(e.peakEgt, e.egt);
    if (e.egt > EGT_RED && !s.flags[`egtOver${n}`]) {
      s.flags[`egtOver${n}`] = true;
      emit({ type: 'egtOverlimit', eng: n });
    }

    // масло, вибрации
    const oilPT = e.n2 > 5 ? 8 + e.n2 * 0.32 : 0;
    e.oilP = lag(e.oilP, oilPT, 0.6, dt);
    e.oilT = lag(e.oilT, e.running ? 62 + e.n1 * 0.35 : s.oat, e.running ? 0.006 : 0.002, dt);
    e.vibN1 = lag(e.vibN1, e.n1 > 10 ? 0.3 + e.n1 * 0.006 : 0, 0.5, dt);
    e.vibN2 = lag(e.vibN2, e.n2 > 10 ? 0.4 + e.n2 * 0.006 : 0, 0.5, dt);
    e.fuelUsed += (e.ff * dt) / 3600;
    if (e.availTimer > 0) e.availTimer -= dt;
    if (e.running && !prevRunning) {
      s.fuel.ctrRun = 120;
    }
  }
  if (s.eng[0].running && s.eng[1].running && s.flags.bothRunningT === undefined) s.flags.bothRunningT = s.t;
}
