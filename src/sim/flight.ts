import { engThrust, tlaDetent, TLA } from './engines';
import { GEO, LINEUP_LEN, samplePath, TAXI_LEN, norm360 } from './scenario';
import { approach, clamp, fob, lag, type Emit, irOk, dispPower } from './systems';
import type { SimState } from './types';

const G = 9.81;
const WING = 122.6;
export const KT = 1.943844;
export const PUSH_LEN = Math.hypot(GEO.pushEnd.x - GEO.stand.x, GEO.pushEnd.y - GEO.stand.y);

const smooth = (x: number) => x * x * (3 - 2 * x);

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

export function speeds(s: SimState) {
  const w = s.ac.gw * G;
  const vsClean = Math.sqrt((2 * w) / (1.225 * WING * 1.35)) * KT;
  const vs1F = Math.sqrt((2 * w) / (1.225 * WING * 1.92)) * KT;
  const S = Math.round(1.23 * vsClean);
  const F = Math.round(1.22 * vs1F);
  return { S, F, GD: S + 14, vls: Math.round(1.13 * (s.ac.slats > 2 ? vs1F : vsClean)) };
}

function aero(s: SimState, alpha: number) {
  const { slats, flaps, gear, spoilers } = s.ac;
  const cl0 = 0.25 + 0.012 * slats + 0.028 * flaps;
  const clMax = 1.35 + 0.025 * slats + 0.012 * flaps;
  let cl = Math.min(cl0 + 0.095 * alpha, clMax);
  cl *= 1 - 0.45 * spoilers;
  const cd = 0.021 + 0.0006 * slats + 0.0012 * flaps + 0.017 * gear + 0.036 * cl * cl + 0.08 * spoilers;
  return { cl, cd, cl0, clMax };
}

export function headwind(s: SimState) {
  if (s.gnd.phase !== 'runway' && s.gnd.phase !== 'airborne') return 0;
  return (s.atc.windSpd * Math.cos(((s.atc.windDir - s.ac.hdg) * Math.PI) / 180)) / KT;
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
  }
  if (ac.onGround && hydOk && s.eng[0].running && s.eng[1].running) {
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

  // шасси
  if (s.hyd.g > 1500) {
    if (s.sw.GEAR === 0 && !ac.onGround) ac.gear = approach(ac.gear, 0, 1 / 9, dt);
    if (s.sw.GEAR === 1) ac.gear = approach(ac.gear, 1, 1 / 12, dt);
  }

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
  ac.gw = s.fms.zfw != null ? s.fms.zfw * 1000 + fob(s) : 58200 + fob(s);
  const m = ac.gw;
  const W = m * G;
  const hw = headwind(s);
  let T = engThrust(s.eng[0], ac.ias) + engThrust(s.eng[1], ac.ias);
  // реверс не может разогнать самолёт назад
  if (T < 0 && ac.gs < 2) T *= Math.max(0, ac.gs / 2);
  const rho = ((1.225 * 288.15) / (273.15 + s.oat)) * Math.pow(Math.max(0.2, 1 - 6.88e-6 * (ac.alt - s.elev)), 4.256);

  // ---------- буксировка ----------
  if (gnd.pushStage === 'pushing') {
    gnd.pushDist = Math.min(PUSH_LEN, gnd.pushDist + 1.1 * dt);
    const f = gnd.pushDist / PUSH_LEN;
    ac.x = GEO.stand.x + (GEO.pushEnd.x - GEO.stand.x) * f;
    ac.y = GEO.stand.y + (GEO.pushEnd.y - GEO.stand.y) * f;
    ac.hdg = norm360(GEO.standHdg + 90 * smooth(f));
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
    if (td1 === 'FLX' || td1 === 'TOGA' || td2 === 'FLX' || td2 === 'TOGA') s.flags.toPowerSet = true;
    if (ac.autobrk === 3 && !ac.autobrkActive && s.flags.toPowerSet && ac.ias > 72 && s.sw.TL1 <= 0.5 && s.sw.TL2 <= 0.5) {
      ac.autobrkActive = true;
      s.flags.rtoSplrs = true;
      emit({ type: 'rto', ias: ac.ias });
    }
    let brakeG = brakeHyd ? ac.brakes * 0.35 : 0;
    if (ac.autobrkActive) brakeG = Math.max(brakeG, 0.42);
    if (ac.autobrkActive && Math.abs(ac.gs) < 0.3) ac.autobrkActive = false;
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
    ac.maxGs = Math.max(ac.maxGs, ac.gs);

    // ---------- путь ----------
    const ds = ac.gs * dt;
    if (gnd.phase === 'pushdone' || gnd.phase === 'taxi' || gnd.phase === 'holding') {
      if (gnd.phase === 'pushdone' && Math.abs(ac.gs) > 0.3) {
        gnd.phase = 'taxi';
        emit({ type: 'taxiStart' });
      }
      ac.dist = Math.max(0, ac.dist + ds);
      if (ac.dist >= TAXI_LEN) {
        const over = ac.dist - TAXI_LEN;
        gnd.phase = 'lineup';
        ac.dist = over;
        emit({ type: 'crossHold' });
      } else {
        const p = samplePath(GEO.taxi, ac.dist);
        ac.x = p.x;
        ac.y = p.y;
        ac.hdg = p.hdg;
        gnd.taxiPath = TAXI_LEN - ac.dist;
        if (gnd.phase === 'taxi' && gnd.taxiPath < 60 && ac.stopped) {
          gnd.phase = 'holding';
          emit({ type: 'atHold' });
        } else if (gnd.phase === 'holding' && gnd.taxiPath >= 60) gnd.phase = 'taxi';
      }
    }
    if (gnd.phase === 'lineup') {
      ac.dist = Math.max(0, ac.dist + ds);
      if (ac.dist >= LINEUP_LEN) {
        gnd.phase = 'runway';
        ac.dist = ac.dist - LINEUP_LEN;
        emit({ type: 'onRunway' });
      } else {
        const p = samplePath(GEO.lineup, ac.dist);
        ac.x = p.x;
        ac.y = p.y;
        // плавный разворот на курс ВПП на последних метрах
        const f = clamp((ac.dist - LINEUP_LEN * 0.45) / (LINEUP_LEN * 0.55), 0, 1);
        const turn = ((s.rwyHdg - p.hdg + 540) % 360) - 180;
        ac.hdg = norm360(p.hdg + turn * smooth(f));
      }
    }
    if (gnd.phase === 'runway') {
      ac.dist += ds;
      ac.x = GEO.thr.x + GEO.rwyDir.x * ac.dist;
      ac.y = GEO.thr.y + GEO.rwyDir.y * ac.dist;
      ac.hdg = s.rwyHdg;
      if (ac.dist > s.rwyLen && !ac.overrun) {
        ac.overrun = true;
        emit({ type: 'overrun', gs: ac.gs * KT });
      }
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
      ac.pitch = lag(ac.pitch, 0, 2, dt);
    }
    ac.vs = 0;
    ac.alt = s.elev;
    ac.roll = 0;
    return;
  }

  // ============================ в воздухе ============================
  const V = Math.max(30, ac.gs + hw); // воздушная скорость, м/с
  // тангаж
  let pRate = ac.stickP * 4;
  if (ac.ap && s.fdPitch != null) pRate = clamp((s.fdPitch - ac.pitch) * 0.8, -2.5, 2.5);
  if (ac.ap && Math.abs(ac.stickP) > 0.5) {
    ac.ap = false;
    emit({ type: 'apDisc', reason: 'takeover' });
  }
  const alpha0 = ac.pitch - ac.gamma;
  if (alpha0 > 13 && pRate > 0) pRate = 0;
  if (alpha0 > 14.5) pRate = -2;
  ac.pitch = clamp(ac.pitch + pRate * dt, -15, 30);
  // крен
  let rRate = ac.stickR * 15;
  if (ac.ap) rRate = clamp(-ac.roll * 0.8, -5, 5);
  ac.roll = clamp(ac.roll + rRate * dt, -67, 67);
  if (Math.abs(ac.stickR) < 0.05 && Math.abs(ac.roll) > 33) ac.roll = approach(ac.roll, Math.sign(ac.roll) * 33, 5, dt);

  const alpha = ac.pitch - ac.gamma;
  const q = 0.5 * rho * V * V;
  const { cl, cd } = aero(s, alpha);
  const L = q * WING * cl;
  const D = q * WING * cd;
  const ar = (alpha * Math.PI) / 180;
  const gr = (ac.gamma * Math.PI) / 180;
  const dV = (T * Math.cos(ar) - D) / m - G * Math.sin(gr);
  const dGamma = (L * Math.cos((ac.roll * Math.PI) / 180) + T * Math.sin(ar) - m * G * Math.cos(gr)) / (m * V);
  s.flags.accel = dV * KT;
  ac.gs += dV * dt;
  ac.gamma = clamp(ac.gamma + ((dGamma * 180) / Math.PI) * dt, -20, 25);
  const vNew = ac.gs + hw;
  ac.ias = vNew * KT;
  const vv = vNew * Math.sin((ac.gamma * Math.PI) / 180);
  ac.vs = vv * 196.85;
  ac.alt += vv * 3.28084 * dt;
  // курс и положение
  ac.hdg = norm360(ac.hdg + ((G * Math.tan((ac.roll * Math.PI) / 180)) / V) * (180 / Math.PI) * dt);
  const hr = (ac.hdg * Math.PI) / 180;
  const gsH = ac.gs * Math.cos(gr);
  ac.x += Math.sin(hr) * gsH * dt;
  ac.y += Math.cos(hr) * gsH * dt;
  if (ac.alt <= s.elev) {
    ac.alt = s.elev;
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
export function updAfs(s: SimState, dt: number, emit: Emit) {
  const ac = s.ac;
  const fma = s.fma;
  const fd = s.fcu.fd && dispPower(s) && irOk(s, 0);
  const v2 = s.fms.v2;
  const t1 = tlaDetent(s.sw.TL1);
  const t2 = tlaDetent(s.sw.TL2);
  const maxTla = Math.max(s.sw.TL1, s.sw.TL2);
  const agl = ac.alt - s.elev;

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
    if (fd && ac.onGround) ac.athr = true;
  }
  if (!ac.onGround && ac.athr && (t1 === 'CL' || t2 === 'CL') && maxTla <= TLA.CL + 0.6) {
    if (!ac.athrActive) emit({ type: 'athrActive' });
    ac.athrActive = true;
    fma.lvrClb = false;
  }
  if (ac.athrActive && maxTla > TLA.CL + 0.6) ac.athrActive = false;
  if (ac.athrActive) thr = 'THR CLB';
  fma.lvrClb = !ac.onGround && !ac.athrActive && agl >= s.fms.thrRed - s.elev && toThr;
  fma.thr = thr;

  // вертикальный / боковой
  if (fd && v2 != null) {
    if (ac.onGround || agl < s.fms.accAlt - s.elev) fma.vert = 'SRS';
    else fma.vert = 'CLB';
    fma.lat = ac.onGround ? (s.fms.rwy ? 'RWY' : '') : agl < 30 ? 'RWY TRK' : s.fms.sid ? 'NAV' : 'RWY TRK';
  } else {
    fma.vert = '';
    fma.lat = '';
  }
  const fdTxt = fd ? '1 FD 2' : '';
  fma.col5 = [ac.ap ? 'AP1' : '', fdTxt, ac.athr ? 'A/THR' : ''].filter(Boolean).join('|');

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
  } else if (ac.onGround) {
    s.fdPitch = null;
    s.flags.spdTarget = v2 ?? undefined;
  }
  if (ac.ap && (!fd || ac.onGround)) ac.ap = false;
}
