import { angDiff, norm360, polyLen, samplePath } from '../scenario';
import type { SimState } from '../types';
import { av2 } from './systems';
import { updPattern } from './pattern';

type Emit = (e: { type: string; [k: string]: unknown }) => void;

const G = 9.81;
const KT = 1.943844;
const D2R = Math.PI / 180;
const MASS = 1045; // кг (около 2300 фунтов)
const S = 16.2;
const RHO = 1.19;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const approach = (v: number, t: number, rate: number, dt: number) => (v < t ? Math.min(t, v + rate * dt) : Math.max(t, v - rate * dt));
const smooth = (x: number) => x * x * (3 - 2 * x);

export const C172_SPEEDS = { vr: 55, vx: 62, vy: 74, glide: 68, appr: 65, vfe10: 110, vfe: 85, vno: 129, vne: 163, vs0: 40, vs1: 48 };

/** Угол атаки сваливания с учётом закрылков */
function alphaStall(flapDeg: number) {
  return 15.5 - flapDeg * 0.04;
}

export function c172Aero(alpha: number, flapDeg: number) {
  const dcl = flapDeg <= 10 ? flapDeg * 0.026 : 0.26 + (flapDeg - 10) * 0.022;
  const aS = alphaStall(flapDeg);
  let cl = 0.33 + 0.088 * alpha + dcl;
  let stalled = false;
  if (alpha > aS) {
    const clMax = 0.33 + 0.088 * aS + dcl;
    cl = clMax - 0.09 * (alpha - aS);
    stalled = true;
  }
  const cd = 0.031 + flapDeg * flapDeg * 0.00007 + 0.06 * cl * cl;
  return { cl, cd, stalled, aS };
}

/** Тяга винта фиксированного шага, Н */
export function c172Thrust(rpm: number, vMs: number) {
  if (rpm < 500) return 0;
  const k = clamp((rpm - 580) / 1820, 0, 1.15);
  return 2350 * Math.pow(k, 1.6) * Math.max(0, 1 - vMs / 150) - (rpm < 900 ? 40 * (vMs / 30) : 0);
}

/** Органы управления: штурвал, педали, тормоза; блокировка рулей */
function controls(s: SimState, dt: number) {
  const ac = s.ac;
  const k = s.keys;
  if (!s.flags.stickMouse) {
    const pT = (k.pitchUp ? 1 : 0) - (k.pitchDn ? 1 : 0);
    const rT = (k.rollR ? 1 : 0) - (k.rollL ? 1 : 0);
    ac.stickP = approach(ac.stickP, pT, pT === 0 ? 3 : 1.6, dt);
    ac.stickR = approach(ac.stickR, rT, rT === 0 ? 4 : 2.6, dt);
  }
  if (s.c.pre.lock) {
    ac.stickP = 0;
    ac.stickR = 0;
  }
  ac.rudder = approach(ac.rudder, (k.rudR ? 1 : 0) - (k.rudL ? 1 : 0), 2.5, dt);
  ac.brakes = approach(ac.brakes, k.brake ? 1 : 0, 4, dt);
  // проверка рулей перед взлётом
  const fc = ac.fctlCheck;
  if (ac.stickP > 0.9) fc.up = true;
  if (ac.stickP < -0.9) fc.dn = true;
  if (ac.stickR < -0.9) fc.l = true;
  if (ac.stickR > 0.9) fc.r = true;
}

/** KAP 140: ROL/HDG по крену, VS/ALT по тангажу */
function autopilot(s: SimState, emit: Emit): { p: number; r: number } | null {
  const ac = s.ac;
  const c = s.c;
  if (!c.ap) return null;
  if (!av2(s) || ac.onGround || (s.flags.cStall as boolean)) {
    c.ap = false;
    emit({ type: 'apDisc', reason: 'fail' });
    return null;
  }
  if (Math.abs(ac.stickP) > 0.5 || Math.abs(ac.stickR) > 0.5) {
    c.ap = false;
    emit({ type: 'apDisc', reason: 'takeover' });
    return null;
  }
  const rollCmd = c.apHdg ? clamp(angDiff(c.hdgBug, ac.hdg) * 1.2, -20, 20) : 0;
  const vsCmd = c.apAlt ? clamp((c.apAltTgt - ac.alt) * 2.2, -700, 700) : ((s.flags.cApVs as number) ?? 0);
  return { r: clamp((rollCmd - ac.roll) * 0.9, -8, 8), p: clamp((vsCmd - ac.vs) * 0.0035, -2.5, 2.5) };
}

export function updC172Flight(s: SimState, dt: number, emit: Emit) {
  const ac = s.ac;
  const c = s.c;
  const gnd = s.gnd;
  const geo = s.geo;
  controls(s, dt);
  const m = MASS + (c.fuelL + c.fuelR) * 2.72;
  const W = m * G;
  const flapDeg = c.flaps;
  ac.flaps = flapDeg;
  ac.gw = m;

  if (ac.onGround) {
    const V = Math.max(0, ac.gs);
    const q = 0.5 * RHO * V * V;
    const { cl, cd } = c172Aero(ac.pitch, flapDeg);
    const L = q * S * cl;
    const D = q * S * cd;
    const T = c172Thrust(c.rpm, V);
    const N = Math.max(0, W - L);
    const park = s.sw.C_PARK === 1;
    const held = c.pre.chocks || c.pre.tiedowns;
    const brakeG = Math.max(ac.brakes * 0.42, park ? 0.6 : 0);
    const mu = V < 0.3 ? 0.02 : 0.014;
    let roll = mu * N + brakeG * N;
    if (held) roll = 1e9;
    const drive = T - D;
    if (V < 0.05) {
      if (drive <= roll) ac.gs = 0;
      else ac.gs += ((drive - roll) / m) * dt;
    } else ac.gs = Math.max(0, ac.gs + ((drive - roll) / m) * dt);
    ac.stopped = ac.gs < 0.05;
    ac.ias = ac.gs * KT;
    s.flags.cHeldPush = held && T > 900;
    if (!ac.landed) ac.maxGs = Math.max(ac.maxGs, ac.gs);
    // ---------- путь ----------
    const ds = ac.gs * dt;
    if (gnd.phase === 'gate' || gnd.phase === 'taxi' || gnd.phase === 'holding') {
      const taxiLen = polyLen(geo.taxi);
      if (gnd.phase === 'gate' && ac.gs > 0.3) {
        gnd.phase = 'taxi';
        emit({ type: 'taxiStart' });
      }
      ac.dist = Math.max(0, ac.dist + ds);
      if (ac.dist >= taxiLen) {
        gnd.phase = 'lineup';
        ac.dist -= taxiLen;
        emit({ type: 'crossHold' });
      } else {
        const p = samplePath(geo.taxi, ac.dist);
        ac.x = p.x;
        ac.y = p.y;
        ac.hdg = p.hdg;
        gnd.taxiPath = taxiLen - ac.dist;
        if (gnd.phase === 'taxi' && gnd.taxiPath < 25 && ac.stopped) {
          gnd.phase = 'holding';
          emit({ type: 'atHold' });
        } else if (gnd.phase === 'holding' && gnd.taxiPath >= 25) gnd.phase = 'taxi';
      }
    }
    if (gnd.phase === 'lineup') {
      const LL = polyLen(geo.lineup);
      ac.dist = Math.max(0, ac.dist + ds);
      if (ac.dist >= LL) {
        gnd.phase = 'runway';
        ac.dist -= LL;
        emit({ type: 'onRunway' });
      } else {
        const p = samplePath(geo.lineup, ac.dist);
        ac.x = p.x;
        ac.y = p.y;
        const f = clamp((ac.dist - LL * 0.4) / (LL * 0.6), 0, 1);
        ac.hdg = norm360(p.hdg + angDiff(s.rwyHdg, p.hdg) * smooth(f));
      }
    }
    if (gnd.phase === 'runway' || gnd.phase === 'airborne') {
      gnd.phase = 'runway';
      ac.dist += ds;
      const side = ac.landed && ac.td ? ac.td.side * Math.max(0, 1 - (ac.dist - ac.td.along) / 250) : 0;
      ac.x = geo.thr.x + geo.rwyDir.x * ac.dist + geo.side.x * side;
      ac.y = geo.thr.y + geo.rwyDir.y * ac.dist + geo.side.y * side;
      ac.hdg = s.rwyHdg;
      if (ac.dist > s.rwyLen + 40 && !ac.overrun) {
        ac.overrun = true;
        emit({ type: 'overrun', gs: ac.gs * KT });
      }
      // подъём носового колеса и отрыв
      const auth = clamp((ac.ias - 38) / 18, 0, 1);
      let rate = 0;
      if (ac.stickP > 0.05 && auth > 0) rate = ac.stickP * 5 * auth;
      else if (ac.pitch > 0) rate = -3;
      ac.pitch = clamp(ac.pitch + rate * dt, 0, 14);
      ac.maxPitchGround = Math.max(ac.maxPitchGround, ac.pitch);
      if (L > W && ac.ias > 45 && !ac.landed) {
        ac.onGround = false;
        ac.gamma = 0;
        ac.liftoffT = s.t;
        gnd.phase = 'airborne';
        emit({ type: 'liftoff', ias: ac.ias, pitch: ac.pitch });
      }
      if (ac.landed) {
        if (L > W * 1.02 && ac.ias > 50) {
          // «козёл» / касание с уходом
          ac.onGround = false;
          ac.landed = false;
          ac.gamma = 1;
          gnd.phase = 'airborne';
          s.flags.cTouchGo = true;
          emit({ type: 'liftoff', ias: ac.ias, pitch: ac.pitch, touchGo: true });
        }
        for (let i = 0; i < geo.exits.length; i++) {
          const ex = geo.exits[i];
          if (Math.abs(ac.dist - ex.along) < 18 && ac.gs * KT < 15 && ac.gs > 0.3) {
            gnd.phase = 'taxiin';
            ac.exit = i;
            ac.dist = 0;
            emit({ type: 'vacated', exit: i });
            break;
          }
        }
      }
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
        if (!s.flags.standOvershoot) {
          s.flags.standOvershoot = true;
          emit({ type: 'standOvershoot', gs: ac.gs * KT });
        }
        ac.gs = 0;
      }
      if (gnd.taxiPath < 8 && ac.stopped) {
        gnd.phase = 'parked';
        emit({ type: 'parked' });
      }
    }
    if (gnd.phase !== 'runway') ac.pitch = approach(ac.pitch, 0, 3, dt);
    c.stallHorn = gnd.phase === 'runway' && ac.ias > 35 && ac.pitch > 11;
    ac.vs = 0;
    ac.alt = s.elev;
    ac.roll = 0;
    ac.gamma = 0;
    return;
  }

  // ============================ в воздухе ============================
  const V = Math.max(15, ac.gs);
  const q = 0.5 * RHO * V * V;
  const T = c172Thrust(c.rpm, V);
  const ap = autopilot(s, emit);
  const alpha0 = ac.pitch - ac.gamma;
  const aero0 = c172Aero(alpha0, flapDeg);
  // балансировочный угол атаки: триммер, закрылки, мощность
  const power = clamp((c.rpm - 700) / 1700, 0, 1);
  const alphaT = 3.0 + c.trim * 7 - flapDeg * 0.05 + power * 1.8;
  const auth = clamp(q / 1000, 0.3, 1.4);
  // демпфирование фугоиды (упрощённо — через скорость изменения угла траектории)
  const gDot = (s.flags.cGammaDot as number) ?? 0;
  let pRate = auth * (1.3 * (alphaT - alpha0) + ac.stickP * 9) - 3 * gDot;
  if (ap) pRate = ap.p;
  if (aero0.stalled) pRate -= 6;
  ac.pitch = clamp(ac.pitch + pRate * dt, -25, 30);
  let rRate = ac.stickR * 26 * clamp(auth, 0.5, 1.1) - 0.06 * ac.roll;
  if (ap) rRate = ap.r;
  if (aero0.stalled) rRate += Math.sin(s.t * 1.3) * 6; // сваливание на крыло
  ac.roll = clamp(ac.roll + rRate * dt, -70, 70);

  const alpha = ac.pitch - ac.gamma;
  const { cl, cd, stalled, aS } = c172Aero(alpha, flapDeg);
  s.flags.cStall = stalled;
  c.stallHorn = alpha > aS - 2.6;
  const L = q * S * cl;
  const D = q * S * cd;
  const gr = ac.gamma * D2R;
  const ar = alpha * D2R;
  const dV = (T * Math.cos(ar) - D) / m - G * Math.sin(gr);
  const dGamma = (L * Math.cos(ac.roll * D2R) + T * Math.sin(ar) - m * G * Math.cos(gr)) / (m * V);
  s.flags.accel = dV * KT;
  ac.gs = Math.max(10, ac.gs + dV * dt);
  s.flags.cGammaDot = (dGamma * 180) / Math.PI;
  ac.gamma = clamp(ac.gamma + (dGamma * 180) / Math.PI * dt, -30, 25);
  ac.ias = ac.gs * KT;
  const vv = ac.gs * Math.sin(ac.gamma * D2R);
  ac.vs = vv * 196.85;
  ac.alt += vv * 3.28084 * dt;
  ac.hdg = norm360(ac.hdg + ((G * Math.tan(ac.roll * D2R)) / V) * (180 / Math.PI) * dt);
  const hr = ac.hdg * D2R;
  const gsH = ac.gs * Math.cos(gr);
  ac.x += Math.sin(hr) * gsH * dt;
  ac.y += Math.cos(hr) * gsH * dt;
  updPattern(s);

  // ---------- касание ----------
  if (ac.alt < s.elev) ac.alt = s.elev;
  if (ac.alt <= s.elev && (ac.vs < 0 || s.t - ac.liftoffT > 2)) {
    ac.alt = s.elev;
    const dx = ac.x - geo.thr.x;
    const dy = ac.y - geo.thr.y;
    const along = dx * geo.rwyDir.x + dy * geo.rwyDir.y;
    const side = dx * geo.side.x + dy * geo.side.y;
    const hdgErr = Math.abs(angDiff(ac.hdg, s.rwyHdg));
    ac.td = { vs: ac.vs, along, side, pitch: ac.pitch, ias: ac.ias };
    s.flags.tdT = s.t;
    ac.onGround = true;
    ac.gamma = 0;
    ac.roll = 0;
    c.ap = false;
    const onRwy = along > -15 && along < s.rwyLen && Math.abs(side) < geo.rwyWidth / 2 + 4 && hdgErr < 35;
    if (onRwy && s.t - ac.liftoffT < 4 && Math.abs(side) < 3) {
      // преждевременный отрыв — самолёт снова на разбеге
      ac.td = null;
      ac.dist = along;
      gnd.phase = 'runway';
      return;
    }
    if (!onRwy) {
      s.flags.cOffRwy = true;
      emit({ type: 'cCrash', along, side });
      ac.gs = 0;
      return;
    }
    ac.landed = true;
    ac.dist = along;
    gnd.phase = 'runway';
    emit({ type: 'landing', td: { ...ac.td } });
  }
}
