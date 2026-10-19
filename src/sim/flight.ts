import { engThrust, thrustLimits, tlaDetent, TLA, IDLE_N1 } from './engines';
import { angDiff, polyLen, samplePath, norm360 } from './scenario';
import { approach, clamp, fob, lag, type Emit, irOk, dispPower } from './systems';
import type { SimState } from './types';

const G = 9.81;
const WING = 122.6;
export const KT = 1.943844;

const smooth = (x: number) => x * x * (3 - 2 * x);
const D2R = Math.PI / 180;

/** Таблица VFE по положению рычага/конфигурации */
export function vfe(s: SimState): number {
  const sl = s.ac.slats;
  const fl = s.ac.flaps;
  if (fl > 30) return 177;
  if (fl > 17) return 185;
  if (fl > 12) return 200;
  if (fl > 2) return 215;
  if (sl > 2) return 230;
  return 350;
}

const clMaxOf = (sl: number, fl: number) => 1.35 + 0.03 * sl + 0.02 * fl;
const cl0Of = (sl: number, fl: number) => 0.25 + 0.012 * sl + (fl <= 10 ? 0.028 * fl : 0.28 + 0.0167 * (fl - 10));
const vsOf = (w: number, clmax: number) => Math.sqrt((2 * w) / (1.225 * WING * clmax)) * KT;

export function speeds(s: SimState) {
  const w = s.ac.gw * G;
  const vsClean = vsOf(w, clMaxOf(0, 0));
  const vs1F = vsOf(w, clMaxOf(18, 10));
  const vsFull = vsOf(w, clMaxOf(27, 40));
  const vsConf3 = vsOf(w, clMaxOf(22, 20));
  const vsCur = vsOf(w, clMaxOf(s.ac.slats, s.ac.flaps));
  const S = Math.round(1.23 * vsClean);
  const F = Math.round(1.22 * vs1F);
  const vlsFull = Math.round(1.23 * vsFull);
  const vlsConf3 = Math.round(1.23 * vsConf3);
  const k = s.leg === 'arr' || s.ac.landed ? 1.23 : 1.13;
  return { S, F, GD: S + 20, vls: Math.round(k * vsCur), vlsFull, vlsConf3, vapp: (s.fms.ldgConf === 4 ? vlsFull : vlsConf3) + 5 };
}

function aero(s: SimState, alpha: number) {
  const { slats, flaps, gear, spoilers } = s.ac;
  const cl0 = cl0Of(slats, flaps);
  const clMax = clMaxOf(slats, flaps);
  let cl = Math.min(cl0 + 0.095 * alpha, clMax);
  cl *= 1 - 0.45 * spoilers;
  const cd = 0.021 + 0.001 * slats + 0.0012 * flaps + 0.021 * gear + 0.036 * cl * cl + 0.08 * spoilers;
  return { cl, cd, cl0, clMax };
}

export function wind(s: SimState) {
  return s.leg === 'arr' ? { dir: s.atc.arrWindDir, spd: s.atc.arrWindSpd } : { dir: s.atc.windDir, spd: s.atc.windSpd };
}

export function headwind(s: SimState) {
  if (s.gnd.phase !== 'runway' && s.gnd.phase !== 'airborne') return 0;
  const w = wind(s);
  return (w.spd * Math.cos(((w.dir - s.ac.hdg) * Math.PI) / 180)) / KT;
}

/** Положение относительно оси ВПП текущего аэродрома: вдоль (м от торца) и вбок (м, + вправо) */
export function rwyRel(s: SimState, x = s.ac.x, y = s.ac.y) {
  const g = s.geo;
  const dx = x - g.thr.x;
  const dy = y - g.thr.y;
  return { along: dx * g.rwyDir.x + dy * g.rwyDir.y, side: dx * g.side.x + dy * g.side.y };
}

/** Отклонения от курсо-глиссадной системы */
export function ilsDev(s: SimState) {
  const g = s.geo;
  if (!g.ils || !s.fms.appr) return null;
  const { along, side } = rwyRel(s);
  const aglM = (s.ac.alt - s.elev) / 3.28084;
  const dG = g.ils.gsAlong - along;
  const gsAngle = (Math.atan2(aglM, Math.max(1, dG)) * 180) / Math.PI;
  const dL = g.rwyLen + 300 - along;
  const locAngle = (Math.atan2(side, Math.max(1, dL)) * 180) / Math.PI;
  const gsHeightFt = Math.tan(g.ils.angle * D2R) * Math.max(0, dG) * 3.28084;
  return {
    gsDots: clamp((gsAngle - g.ils.angle) / 0.35, -2.6, 2.6),
    locDots: clamp(locAngle / 0.8, -2.6, 2.6),
    gsErrFt: aglM * 3.28084 - gsHeightFt,
    dist: dG,
    along,
    side,
    gsValid: dG > 100 && along < g.rwyLen,
    locValid: Math.abs(locAngle) < 35 && along < g.rwyLen + 200,
  };
}

// ============================ органы управления ============================
export function updControls(s: SimState, dt: number) {
  const ac = s.ac;
  const k = s.keys;
  const hydOk = s.hyd.g > 1500 || s.hyd.b > 1500 || s.hyd.y > 1500;
  // ручка управления
  if (!s.flags.stickMouse) {
    const pT = (k.pitchUp ? 1 : 0) - (k.pitchDn ? 1 : 0);
    const rT = (k.rollR ? 1 : 0) - (k.rollL ? 1 : 0);
    ac.stickP = approach(ac.stickP, pT, pT === 0 ? 3 : 1.4, dt);
    ac.stickR = approach(ac.stickR, rT, rT === 0 ? 4 : 2.5, dt);
  }
  const rudT = (k.rudR ? 1 : 0) - (k.rudL ? 1 : 0);
  ac.rudder = approach(ac.rudder, rudT, 2.5, dt);
  ac.brakes = approach(ac.brakes, k.brake ? 1 : 0, 3, dt);
  if (k.brake && ac.autobrkActive && ac.onGround) {
    ac.autobrkActive = false;
    s.flags.abDisc = true;
  }
  if (ac.onGround && hydOk && s.eng[0].running && s.eng[1].running && !ac.landed) {
    const f = ac.fctlCheck;
    if (ac.stickP > 0.94) f.up = true;
    if (ac.stickP < -0.94) f.dn = true;
    if (ac.stickR < -0.94) f.l = true;
    if (ac.stickR > 0.94) f.r = true;
    if (ac.rudder < -0.94) f.rl = true;
    if (ac.rudder > 0.94) f.rr = true;
    if (Math.abs(ac.stickP) > 0.3 || Math.abs(ac.stickR) > 0.3 || Math.abs(ac.rudder) > 0.3) s.flags.fctlMoveT = s.t;
  }

  // закрылки / предкрылки
  const lever = s.sw.FLAPS;
  if (lever === 1 && (ac.onGround || ac.ias < 100) && !s.flags.conf1F) s.flags.conf1F = true;
  if (lever !== 1 || ac.ias > 210) s.flags.conf1F = false;
  const tgt: [number, number][] = [
    [0, 0],
    [18, s.flags.conf1F ? 10 : 0],
    [22, 15],
    [22, 20],
    [27, 40],
  ];
  const [slT, flT] = tgt[lever] ?? [0, 0];
  if (s.hyd.g > 1500 || s.hyd.b > 1500) ac.slats = approach(ac.slats, slT, s.hyd.g > 1500 && s.hyd.b > 1500 ? 1.6 : 0.8, dt);
  if (s.hyd.g > 1500 || s.hyd.y > 1500) ac.flaps = approach(ac.flaps, flT, s.hyd.g > 1500 && s.hyd.y > 1500 ? 1.3 : 0.65, dt);

  // шасси (при отказе — только аварийный выпуск)
  const gearJam = !!s.flags.lgJam;
  if (s.hyd.g > 1500 && !gearJam) {
    if (s.sw.GEAR === 0 && !ac.onGround) ac.gear = approach(ac.gear, 0, 1 / 9, dt);
    if (s.sw.GEAR === 1) ac.gear = approach(ac.gear, 1, 1 / 12, dt);
  } else if (gearJam && s.sw.GEAR === 1 && ac.gear < 0.62) ac.gear = approach(ac.gear, 0.6, 1 / 10, dt);
  if (s.flags.gravityCrank && (s.flags.gravityCrank as number) >= 3) ac.gear = approach(ac.gear, 1, 1 / 14, dt);

  // триммер руля (сброс)
  if (s.flags.rudReset) {
    ac.rudTrim = approach(ac.rudTrim, 0, 1.5, dt);
    if (ac.rudTrim === 0) s.flags.rudReset = false;
  }

  // интерцепторы
  ac.gndSplrsArmed = s.sw.SPD_BRK === 0;
  const spdBrk = [0, 0, 0.5, 1][s.sw.SPD_BRK] ?? 0;
  const tlIdle = s.sw.TL1 <= 0.5 && s.sw.TL2 <= 0.5;
  let gndSpl = 0;
  if (ac.onGround && ac.gndSplrsArmed && tlIdle && ac.ias > 72) gndSpl = 1;
  if (ac.onGround && s.flags.rtoSplrs) gndSpl = 1;
  if (gndSpl && ac.onGround) s.flags.rtoSplrs = ac.ias > 10;
  ac.spoilers = approach(ac.spoilers, Math.max(gndSpl, ac.onGround ? 0 : spdBrk * 0.6), 1.5, dt);
}

// ============================ движение ============================
export function updFlight(s: SimState, dt: number, emit: Emit) {
  const ac = s.ac;
  const gnd = s.gnd;
  const geo = s.geo;
  ac.gw = s.fms.zfw != null ? s.fms.zfw * 1000 + fob(s) : 58200 + fob(s);
  const m = ac.gw;
  const W = m * G;
  const hw = headwind(s);
  let T = engThrust(s.eng[0], ac.ias) + engThrust(s.eng[1], ac.ias);
  // реверс не может разогнать самолёт назад
  if (T < 0 && ac.gs < 2) T *= Math.max(0, ac.gs / 2);
  const rho = ((1.225 * 288.15) / (273.15 + s.oat)) * Math.pow(Math.max(0.2, 1 - 6.88e-6 * (ac.alt - s.elev)), 4.256);

  // ---------- буксировка ----------
  if (gnd.pushStage === 'pushing' && geo.pushEnd) {
    const PUSH_LEN = Math.hypot(geo.pushEnd.x - geo.stand.x, geo.pushEnd.y - geo.stand.y);
    gnd.pushDist = Math.min(PUSH_LEN, gnd.pushDist + 1.1 * dt);
    const f = gnd.pushDist / PUSH_LEN;
    ac.x = geo.stand.x + (geo.pushEnd.x - geo.stand.x) * f;
    ac.y = geo.stand.y + (geo.pushEnd.y - geo.stand.y) * f;
    ac.hdg = norm360(geo.standHdg + angDiff(geo.pushHdg, geo.standHdg) * smooth(f));
    ac.gs = -1.1;
    ac.ias = 0;
    ac.stopped = false;
    if (f >= 1) {
      gnd.pushStage = 'wait-park';
      ac.gs = 0;
      emit({ type: 'pushComplete' });
    }
    return;
  }

  if (ac.onGround) {
    const vAir = ac.gs + hw;
    const q = 0.5 * rho * vAir * Math.abs(vAir);
    const alpha = ac.pitch;
    const { cl, cd } = aero(s, alpha);
    const L = q * WING * cl;
    const D = q * WING * cd;
    const N = Math.max(0, W - L);
    const movable = !gnd.chocks && !gnd.tow;
    const park = s.sw.PARK_BRK === 1 && s.hyd.accu > 900;
    const brakeHyd = s.hyd.g > 1500 || s.hyd.y > 1500 || s.hyd.accu > 900;
    // автоторможение RTO
    const td1 = tlaDetent(s.sw.TL1);
    const td2 = tlaDetent(s.sw.TL2);
    if (!ac.landed && (td1 === 'FLX' || td1 === 'TOGA' || td2 === 'FLX' || td2 === 'TOGA')) s.flags.toPowerSet = true;
    if (!ac.landed && ac.autobrk === 3 && !ac.autobrkActive && s.flags.toPowerSet && ac.ias > 72 && s.sw.TL1 <= 0.5 && s.sw.TL2 <= 0.5) {
      ac.autobrkActive = true;
      s.flags.rtoSplrs = true;
      emit({ type: 'rto', ias: ac.ias });
    }
    // автоторможение на посадке
    if (ac.landed && ac.autobrk > 0 && ac.autobrk < 3 && !ac.autobrkActive && !s.flags.abDisc && !s.flags.abUsed && ac.spoilers > 0.5) {
      ac.autobrkActive = true;
      s.flags.abUsed = true;
      s.flags.abStartT = s.t;
    }
    let brakeG = brakeHyd ? ac.brakes * 0.35 : 0;
    if (ac.autobrkActive) {
      if (ac.landed) {
        const target = ac.autobrk === 1 ? 1.7 : 3.0; // м/с²
        const delay = ac.autobrk === 1 ? 4 : 2;
        if (s.t - ((s.flags.abStartT as number) ?? s.t) > delay) {
          const other = (D + 0.0065 * N - T) / m;
          brakeG = Math.max(brakeG, clamp((target - other) / G, 0, 0.45));
        }
      } else brakeG = Math.max(brakeG, 0.42);
    }
    if (ac.autobrkActive && Math.abs(ac.gs) < 0.3) ac.autobrkActive = false;
    s.flags.decel = brakeG > 0.05 && ac.autobrkActive;
    const mu = Math.abs(ac.gs) < 0.3 ? 0.014 : 0.0065;
    let roll = mu * N + brakeG * N + (park ? 0.55 * N : 0);
    if (!movable) roll = 1e9;
    const drive = T - D * Math.sign(vAir || 1);
    if (Math.abs(ac.gs) < 0.05) {
      if (Math.abs(drive) <= roll) ac.gs = 0;
      else ac.gs += ((drive - Math.sign(drive) * roll) / m) * dt;
    } else {
      const a = (drive - Math.sign(ac.gs) * roll) / m;
      const ng = ac.gs + a * dt;
      ac.gs = Math.sign(ng) !== Math.sign(ac.gs) ? 0 : ng;
    }
    if (gnd.phase !== 'runway' && ac.gs < 0) ac.gs = Math.max(ac.gs, -1); // назад только чуть-чуть
    ac.stopped = Math.abs(ac.gs) < 0.05;
    ac.ias = Math.max(0, (ac.gs + hw) * KT);
    if (!ac.landed) ac.maxGs = Math.max(ac.maxGs, ac.gs);

    // ---------- путь ----------
    const ds = ac.gs * dt;
    const taxiLen = polyLen(geo.taxi);
    if (gnd.phase === 'pushdone' || gnd.phase === 'taxi' || gnd.phase === 'holding') {
      if (gnd.phase === 'pushdone' && Math.abs(ac.gs) > 0.3) {
        gnd.phase = 'taxi';
        emit({ type: 'taxiStart' });
      }
      ac.dist = Math.max(0, ac.dist + ds);
      if (ac.dist >= taxiLen) {
        const over = ac.dist - taxiLen;
        gnd.phase = 'lineup';
        ac.dist = over;
        emit({ type: 'crossHold' });
      } else {
        const p = samplePath(geo.taxi, ac.dist);
        ac.x = p.x;
        ac.y = p.y;
        ac.hdg = p.hdg;
        gnd.taxiPath = taxiLen - ac.dist;
        if (gnd.phase === 'taxi' && gnd.taxiPath < 60 && ac.stopped) {
          gnd.phase = 'holding';
          emit({ type: 'atHold' });
        } else if (gnd.phase === 'holding' && gnd.taxiPath >= 60) gnd.phase = 'taxi';
      }
    }
    if (gnd.phase === 'lineup') {
      const LL = polyLen(geo.lineup);
      ac.dist = Math.max(0, ac.dist + ds);
      if (ac.dist >= LL) {
        gnd.phase = 'runway';
        ac.dist = ac.dist - LL;
        emit({ type: 'onRunway' });
      } else {
        const p = samplePath(geo.lineup, ac.dist);
        ac.x = p.x;
        ac.y = p.y;
        // плавный разворот на курс ВПП на последних метрах
        const f = clamp((ac.dist - LL * 0.45) / (LL * 0.55), 0, 1);
        const turn = ((s.rwyHdg - p.hdg + 540) % 360) - 180;
        ac.hdg = norm360(p.hdg + turn * smooth(f));
      }
    }
    if (gnd.phase === 'runway') {
      ac.dist += ds;
      const side = ac.landed && ac.td ? ac.td.side * Math.max(0, 1 - (ac.dist - ac.td.along) / 600) : 0;
      ac.x = geo.thr.x + geo.rwyDir.x * ac.dist + geo.side.x * side;
      ac.y = geo.thr.y + geo.rwyDir.y * ac.dist + geo.side.y * side;
      ac.hdg = s.rwyHdg;
      if (ac.dist > s.rwyLen && !ac.overrun) {
        ac.overrun = true;
        emit({ type: 'overrun', gs: ac.gs * KT });
      }
      if (!ac.landed) {
        // подъём носа
        const auth = clamp((ac.ias - 110) / 30, 0, 1);
        let rate = 0;
        if (ac.stickP > 0.05 && auth > 0) rate = ac.stickP * 4.5 * auth;
        else if (ac.pitch > 0) rate = ac.stickP < -0.05 ? -4 : -2.5;
        ac.pitch = Math.max(0, ac.pitch + rate * dt);
        ac.maxPitchGround = Math.max(ac.maxPitchGround, ac.pitch);
        if (ac.pitch > 11.7 && !ac.tailStrike) {
          ac.tailStrike = true;
          emit({ type: 'tailStrike', pitch: ac.pitch });
        }
        if (L > W && ac.ias > 100) {
          ac.onGround = false;
          ac.gamma = 0;
          ac.liftoffT = s.t;
          gnd.phase = 'airborne';
          s.fdPitch = Math.max(ac.pitch, 12.5);
          emit({ type: 'liftoff', ias: ac.ias, pitch: ac.pitch });
        }
      } else {
        // опускание передней стойки после касания
        ac.pitch = Math.max(0, ac.pitch - (ac.stickP > 0.3 ? 0.5 : 2.2) * dt);
        if (!s.flags.nlgDown && ac.pitch < 0.3) {
          s.flags.nlgDown = true;
          emit({ type: 'nosewheel' });
        }
        // сход с ВПП
        for (let i = 0; i < geo.exits.length; i++) {
          const ex = geo.exits[i];
          if (Math.abs(ac.dist - ex.along) < 30 && ac.gs * KT < 35 && ac.gs > 0.3) {
            gnd.phase = 'taxiin';
            ac.exit = i;
            ac.dist = 0;
            emit({ type: 'vacated', exit: i });
            break;
          }
        }
      }
    } else {
      ac.pitch = lag(ac.pitch, 0, 2, dt);
    }
    if (gnd.phase === 'taxiin') {
      const path = geo.exits[ac.exit]?.path ?? [];
      const len = polyLen(path);
      ac.dist = clamp(ac.dist + ds, 0, len);
      const p = samplePath(path, ac.dist);
      ac.x = p.x;
      ac.y = p.y;
      ac.hdg = p.hdg;
      gnd.taxiPath = len - ac.dist;
      if (ac.dist >= len - 0.01 && ac.gs > 0.3) {
        // проскочили место стоянки
        if (!s.flags.standOvershoot) {
          s.flags.standOvershoot = true;
          emit({ type: 'standOvershoot', gs: ac.gs * KT });
        }
        ac.gs = 0;
      }
      if (gnd.taxiPath < 12 && ac.stopped) {
        gnd.phase = 'parked';
        emit({ type: 'parked' });
      }
    }
    ac.vs = 0;
    ac.alt = s.elev;
    ac.roll = 0;
    ac.gamma = 0;
    return;
  }

  // ============================ в воздухе ============================
  const V = Math.max(30, ac.gs + hw); // воздушная скорость, м/с
  // тангаж
  let pRate = ac.stickP * 4;
  if (ac.ap && s.fdPitch != null) pRate = clamp((s.fdPitch - ac.pitch) * 0.9, -2.5, 2.5);
  if (ac.ap && (Math.abs(ac.stickP) > 0.5 || Math.abs(ac.stickR) > 0.5)) {
    ac.ap = false;
    emit({ type: 'apDisc', reason: 'takeover' });
  }
  const alpha0 = ac.pitch - ac.gamma;
  if (alpha0 > 13 && pRate > 0) pRate = 0;
  if (alpha0 > 14.5) pRate = -2;
  ac.pitch = clamp(ac.pitch + pRate * dt, -15, 30);
  // крен
  let rRate = ac.stickR * 15;
  if (ac.ap) rRate = clamp((((s.flags.fdRoll as number) ?? 0) - ac.roll) * 0.8, -5, 5);
  ac.roll = clamp(ac.roll + rRate * dt, -67, 67);
  if (Math.abs(ac.stickR) < 0.05 && Math.abs(ac.roll) > 33) ac.roll = approach(ac.roll, Math.sign(ac.roll) * 33, 5, dt);

  const alpha = ac.pitch - ac.gamma;
  const q = 0.5 * rho * V * V;
  const { cl, cd } = aero(s, alpha);
  const L = q * WING * cl;
  const D = q * WING * cd;
  const ar = alpha * D2R;
  const gr = ac.gamma * D2R;
  const dV = (T * Math.cos(ar) - D) / m - G * Math.sin(gr);
  const dGamma = (L * Math.cos(ac.roll * D2R) + T * Math.sin(ar) - m * G * Math.cos(gr)) / (m * V);
  s.flags.accel = dV * KT;
  ac.gs += dV * dt;
  ac.gamma = clamp(ac.gamma + ((dGamma * 180) / Math.PI) * dt, -20, 25);
  const vNew = ac.gs + hw;
  ac.ias = vNew * KT;
  const vv = vNew * Math.sin(ac.gamma * D2R);
  ac.vs = vv * 196.85;
  ac.alt += vv * 3.28084 * dt;
  // курс и положение
  ac.hdg = norm360(ac.hdg + ((G * Math.tan(ac.roll * D2R)) / V) * (180 / Math.PI) * dt);
  const hr = ac.hdg * D2R;
  const gsH = ac.gs * Math.cos(gr);
  ac.x += Math.sin(hr) * gsH * dt;
  ac.y += Math.cos(hr) * gsH * dt;
  if (ac.alt <= s.elev) {
    ac.alt = s.elev;
    if (s.leg === 'arr' && !ac.landed) {
      const r = rwyRel(s);
      ac.landed = true;
      ac.td = { vs: ac.vs, along: r.along, side: r.side, pitch: ac.pitch, ias: ac.ias };
      s.flags.tdT = s.t;
      ac.onGround = true;
      ac.gamma = 0;
      ac.dist = r.along;
      ac.roll = 0;
      s.gnd.phase = 'runway';
      ac.ap = false;
      emit({ type: 'landing', ...ac.td });
      return;
    }
    if (!s.flags.touchdown) {
      s.flags.touchdown = true;
      emit({ type: 'touchdown', vs: ac.vs });
    }
    ac.onGround = true;
    ac.gamma = 0;
    s.gnd.phase = 'runway';
  }
}

// ============================ FMGS / FD / FMA ============================
export function managedApprSpeed(s: SimState) {
  const sp = speeds(s);
  const lever = s.sw.FLAPS;
  let t = [sp.GD, sp.S, sp.F, s.fms.ldgConf === 3 ? sp.vapp : sp.F, sp.vapp][lever] ?? sp.GD;
  t = Math.min(t, vfe(s) - 5, 250);
  return Math.max(t, sp.vapp);
}

export function updAfs(s: SimState, dt: number, emit: Emit) {
  const ac = s.ac;
  const fma = s.fma;
  const fd = s.fcu.fd && dispPower(s) && irOk(s, 0);
  const v2 = s.fms.v2;
  const t1 = tlaDetent(s.sw.TL1);
  const t2 = tlaDetent(s.sw.TL2);
  const maxTla = Math.max(s.sw.TL1, s.sw.TL2);
  const agl = ac.alt - s.elev;
  fma.vArm = '';
  fma.lArm = '';
  fma.cat = '';

  // FLX фиксируется, когда РУД ставят в FLX на земле
  if (ac.onGround && (t1 === 'FLX' || t2 === 'FLX') && s.fms.flex != null) s.flags.flxLocked = true;
  if (ac.onGround && maxTla < TLA.CL - 1 && !s.flags.toPowerSet) s.flags.flxLocked = false;

  // режим тяги
  let thr = '';
  const toThr = t1 === 'FLX' || t1 === 'TOGA' || t2 === 'FLX' || t2 === 'TOGA';
  if (toThr || (maxTla > TLA.CL + 0.6 && !ac.athrActive)) {
    if (t1 === 'TOGA' || t2 === 'TOGA') thr = 'MAN TOGA';
    else if (s.flags.flxLocked && s.fms.flex != null) thr = `MAN FLX +${s.fms.flex}`;
    else thr = 'MAN MCT';
    if (fd && ac.onGround && !ac.landed) ac.athr = true;
  }
  if (!ac.onGround && ac.athr && (t1 === 'CL' || t2 === 'CL') && maxTla <= TLA.CL + 0.6) {
    if (!ac.athrActive) {
      emit({ type: 'athrActive' });
      s.flags.athrN1 = s.leg === 'arr' ? Math.max(s.eng[0].n1, s.eng[1].n1) : undefined;
    }
    ac.athrActive = true;
    fma.lvrClb = false;
  }
  if (ac.athrActive && maxTla > TLA.CL + 0.6) ac.athrActive = false;
  // РУД в IDLE — автомат тяги отключается (посадка)
  if (ac.athr && maxTla <= 0.5 && (ac.landed || (s.leg === 'arr' && agl < 100))) {
    ac.athr = false;
    ac.athrActive = false;
    emit({ type: 'athrOff' });
  }
  if (ac.athrActive) thr = s.leg === 'arr' ? (s.flags.retard ? 'RETARD' : 'SPEED') : 'THR CLB';
  fma.lvrClb = !ac.onGround && !ac.athrActive && agl >= s.fms.thrRed - s.elev && toThr && s.leg === 'dep';
  fma.thr = thr;

  if (s.leg === 'arr') {
    afsArrival(s, dt, emit, fd);
  } else {
    // вертикальный / боковой (вылет)
    if (fd && v2 != null) {
      if (ac.onGround || agl < s.fms.accAlt - s.elev) fma.vert = 'SRS';
      else fma.vert = 'CLB';
      fma.lat = ac.onGround ? (s.fms.rwy ? 'RWY' : '') : agl < 30 ? 'RWY TRK' : s.fms.sid ? 'NAV' : 'RWY TRK';
    } else {
      fma.vert = '';
      fma.lat = '';
    }
    // командный тангаж директора
    if (!ac.onGround && fd && v2 != null) {
      const sp = speeds(s);
      const oei = s.eng.some((e) => e.failed || (!e.running && e.n2 < 50));
      const tgt = fma.vert === 'SRS' ? (oei ? v2 : v2 + 10) : Math.min(250, vfe(s) - 5, Math.max(sp.F, 200));
      const acc = (s.flags.accel as number) || 0;
      const err = ac.ias - tgt;
      const cur = s.fdPitch ?? ac.pitch;
      s.fdPitch = clamp(cur + (0.12 * err + 0.5 * acc) * dt, fma.vert === 'SRS' ? 8 : 0, fma.vert === 'SRS' ? 18 : 22);
      s.flags.spdTarget = tgt;
      s.flags.fdRoll = clamp(-ac.roll * 0.5, -5, 5) + 0;
    } else if (ac.onGround) {
      s.fdPitch = null;
      s.flags.spdTarget = v2 ?? undefined;
    }
  }
  const fdTxt = fd ? '1 FD 2' : '';
  fma.col5 = [ac.ap ? 'AP1' : '', fdTxt, ac.athr ? 'A/THR' : ''].filter(Boolean).join('|');
  if (ac.ap && (!fd || (ac.onGround && !ac.landed))) ac.ap = false;
}

/** Режимы захода на посадку: ALT, LOC/G/S, LAND, FLARE, ROLL OUT, уход на второй круг */
function afsArrival(s: SimState, dt: number, emit: Emit, fd: boolean) {
  const ac = s.ac;
  const fma = s.fma;
  const f = s.flags;
  const agl = ac.alt - s.elev;
  const dev = ilsDev(s);
  const V = Math.max(40, ac.ias / KT);
  // уход на второй круг
  const toga = tlaDetent(s.sw.TL1) === 'TOGA' || tlaDetent(s.sw.TL2) === 'TOGA';
  if (!ac.onGround && toga && !f.ga && !ac.landed) {
    f.ga = true;
    f.gaT = s.t;
    f.locCap = false;
    f.gsCap = false;
    f.land = false;
    f.flare = false;
    s.fcu.appr = false;
    s.fcu.loc = false;
    emit({ type: 'goAround' });
  }
  // захват LOC / G/S
  if ((s.fcu.appr || s.fcu.loc) && !f.locCap && !f.ga) fma.lArm = 'LOC';
  if (s.fcu.appr && !f.gsCap && !f.ga) fma.vArm = 'G/S';
  if ((s.fcu.appr || s.fcu.loc) && dev && dev.locValid && Math.abs(dev.locDots) < 1.6 && !f.locCap && !f.ga && !ac.onGround) {
    f.locCap = true;
    f.locCapT = s.t;
    emit({ type: 'locCapture' });
  }
  if (s.fcu.appr && f.locCap && dev && dev.gsValid && !f.gsCap && dev.gsDots <= 0.4 && dev.gsDots > -0.25 && !ac.onGround) {
    f.gsCap = true;
    f.gsCapT = s.t;
    emit({ type: 'gsCapture' });
  }
  if (f.locCap && f.gsCap && agl < 400 && !ac.onGround && !f.land) {
    f.land = true;
    emit({ type: 'landMode' });
  }
  if (f.land && agl < 40 && !f.flare && !ac.onGround) {
    f.flare = true;
    emit({ type: 'flare' });
  }
  f.retard = !!(f.flare && ac.ap && ac.athrActive);

  // режимы FMA
  let vert = 'ALT';
  let lat = 'NAV';
  if (ac.onGround && ac.landed) {
    vert = 'ROLL OUT';
    lat = '';
  } else if (f.ga) {
    vert = 'SRS';
    lat = 'GA TRK';
  } else if (f.flare) {
    vert = 'FLARE';
    lat = '';
  } else if (f.land) {
    vert = 'LAND';
    lat = '';
  } else {
    if (f.gsCap) vert = s.t - (f.gsCapT as number) < 8 ? 'G/S*' : 'G/S';
    else if (Math.abs(s.fcu.alt - ac.alt) > 250) vert = s.fcu.alt > ac.alt ? 'OP CLB' : 'OP DES';
    if (f.locCap) lat = s.t - (f.locCapT as number) < 8 ? 'LOC*' : 'LOC';
  }
  fma.vert = fd || ac.ap ? vert : '';
  fma.lat = fd || ac.ap ? lat : '';
  if (s.fcu.appr && (f.locCap || f.gsCap)) fma.cat = ac.ap ? 'CAT3 SINGLE' : 'CAT1';

  // целевая скорость
  const sp = speeds(s);
  const tgt = f.ga ? Math.max(sp.vapp, Math.min(sp.S, ac.ias)) : managedApprSpeed(s);
  f.spdTarget = Math.round(tgt);

  // автомат тяги SPEED
  if (ac.athrActive && !ac.onGround) {
    const lim = thrustLimits(s);
    const acc = (f.accel as number) || 0;
    let n1 = (f.athrN1 as number) ?? 50;
    if (f.retard) n1 = approach(n1, IDLE_N1 + 3, 6, dt);
    else n1 = clamp(n1 + (0.35 * (tgt - ac.ias) - 1.6 * acc) * dt, IDLE_N1 + 3, lim.cl);
    f.athrN1 = n1;
  }

  if (ac.onGround) {
    s.fdPitch = null;
    return;
  }
  // командная вертикальная скорость
  let vsDes: number;
  if (f.ga) {
    // SRS: удерживать скорость тангажем
    const cur = s.fdPitch ?? ac.pitch;
    s.fdPitch = clamp(cur + (0.12 * (ac.ias - tgt) + 0.5 * ((f.accel as number) || 0)) * dt, 8, 18);
    f.fdRoll = clamp(-ac.roll * 0.5, -5, 5);
    return;
  }
  if (f.flare) vsDes = -Math.max(110, agl * 11);
  else if (f.gsCap && dev) vsDes = -V * Math.sin(3 * D2R) * 196.85 + clamp(-dev.gsErrFt * 4, -700, 700);
  else vsDes = clamp((s.fcu.alt - ac.alt) * 1.6, -1500, 1500);
  const gammaCmd = (Math.asin(clamp(vsDes / 196.85 / V, -0.3, 0.3)) * 180) / Math.PI;
  const alpha = ac.pitch - ac.gamma;
  s.fdPitch = clamp(alpha + gammaCmd, -10, 20);
  // боковой канал: выход на ось ВПП
  const side = dev ? dev.side : rwyRel(s).side;
  const hdgCmd = s.rwyHdg - clamp(side * 0.012, -18, 18);
  f.fdRoll = clamp(angDiff(hdgCmd, ac.hdg) * 2.2, -25, 25);
}
