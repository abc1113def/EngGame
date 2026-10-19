import type { SimState } from '../types';

type Emit = (e: { type: string; [k: string]: unknown }) => void;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lag = (cur: number, tgt: number, tau: number, dt: number) => cur + (tgt - cur) * Math.min(1, dt / tau);

export const FLAP_DEG = [0, 10, 20, 30];
export const C172_RPM_RED = 2700;

/** Доступно ли топливо из баков к двигателю */
export function fuelAvail(s: SimState) {
  const c = s.c;
  if (s.sw.C_FUEL_SHUTOFF !== 1) return false;
  const sel = s.sw.C_FUEL_SEL;
  return sel === 0 ? c.fuelL > 0.2 : sel === 2 ? c.fuelR > 0.2 : c.fuelL + c.fuelR > 0.2;
}

/** Электрическая нагрузка, А */
function loadAmps(s: SimState, crank: boolean) {
  const sw = s.sw;
  let a = 2.2; // приборы, указатель поворота, реле
  if (sw.C_BEACON) a += 1.5;
  if (sw.C_LAND) a += 6;
  if (sw.C_TAXI) a += 5;
  if (sw.C_NAV) a += 2.5;
  if (sw.C_STROBE) a += 2;
  if (sw.C_PITOT) a += 6;
  if (sw.C_FUEL_PUMP) a += 2.5;
  if (sw.C_AVIONICS1) a += 4;
  if (sw.C_AVIONICS2) a += 3;
  if (Math.abs(s.c.flaps - FLAP_DEG[sw.C_FLAPS]) > 0.2) a += 9;
  if (crank) a += 105;
  return a;
}

export function busOk(s: SimState) {
  return s.c.busV > 20;
}
export function av1(s: SimState) {
  return busOk(s) && s.sw.C_AVIONICS1 === 1;
}
export function av2(s: SimState) {
  return busOk(s) && s.sw.C_AVIONICS2 === 1;
}

export function updC172Systems(s: SimState, dt: number, emit: Emit) {
  const c = s.c;
  const sw = s.sw;
  const f = s.flags;
  // ---------------- электрика ----------------
  const batOn = sw.C_BAT === 1;
  const crankReq = sw.C_MAGS === 4;
  // сброс отказа генератора: ALT OFF → ON при работающем двигателе
  if (c.failAlt && c.running && sw.C_ALT === 0) f.cAltReset = true;
  if (c.failAlt && f.cAltReset && sw.C_ALT === 1) {
    c.failAlt = false;
    emit({ type: 'cAltReset' });
  }
  const ocv = 22.7 + 2.6 * c.battCharge;
  const rInt = 0.022 + (1 - c.battCharge) * 0.035;
  c.altOnline = batOn && sw.C_ALT === 1 && c.rpm > 650 && !c.failAlt;
  const crankable = batOn && crankReq;
  const I = batOn ? loadAmps(s, crankable) : 0;
  if (!batOn) {
    c.busV = 0;
    c.amps = 0;
  } else if (c.altOnline) {
    c.busV = lag(c.busV, 28.4, 0.6, dt);
    const chg = clamp((27.6 - ocv) * 9, 0.3, 28);
    c.amps = lag(c.amps, chg, 1.5, dt);
    c.battCharge = clamp(c.battCharge + (c.amps * dt) / (24 * 3600), 0, 1);
  } else {
    c.busV = lag(c.busV, Math.max(0, ocv - I * rInt), 0.15, dt);
    c.amps = lag(c.amps, -I, 0.3, dt);
    c.battCharge = clamp(c.battCharge - (I * dt) / (24 * 3600), 0, 1);
  }
  c.battV = ocv;

  // ---------------- стартер ----------------
  c.starter = crankable && c.busV > 12;
  if (c.starter) {
    c.crankT += dt;
    c.starterHot = clamp(c.starterHot + dt / 40, 0, 1.5);
  } else {
    c.crankT = 0;
    c.starterHot = Math.max(0, c.starterHot - dt / 150);
  }
  const crankRpm = c.starter ? clamp((c.busV - 14.5) * 36, 0, 260) : 0;

  // ---------------- двигатель ----------------
  const fuel = fuelAvail(s);
  const mix = sw.C_MIX ?? 0;
  const thr = sw.C_THR ?? 0;
  const pumpOn = sw.C_FUEL_PUMP === 1 && c.busV > 16;
  const mags = sw.C_MAGS; // 0 OFF 1 R 2 L 3 BOTH 4 START
  const magsOn = mags >= 1;
  // заливка (прайминг): насос + смесь
  if (!c.running && pumpOn && fuel && mix > 0.3) c.prime += 0.22 * mix * dt;
  // испарение и «продувка» при прокрутке
  c.prime = Math.max(0, c.prime - 0.004 * dt);
  if (!c.running && c.rpm > 40) {
    const purge = 0.025 + (mix < 0.1 ? 0.28 * thr : 0); // залитый двигатель: газ полностью, смесь CUTOFF
    c.prime = Math.max(0, c.prime - purge * dt * (c.rpm / 200));
    // механический насос подаёт топливо при открытой смеси
    if (fuel && mix > 0.3) c.prime += 0.12 * mix * dt * (c.rpm / 200);
  }
  c.flooded = c.prime > 2.3;

  if (!c.running) {
    c.rpm = c.starter ? lag(c.rpm, crankRpm, 0.6, dt) : Math.max(0, c.rpm - 260 * dt);
    const canFire = c.starter && magsOn && c.rpm > 90 && c.prime > 0.45 && c.prime < 2.3;
    // залитый двигатель схватывает только при продувке (газ открыт)
    const floodFire = c.starter && magsOn && c.rpm > 90 && c.prime >= 2.3 && c.prime < 2.6 && thr > 0.6;
    if (canFire || floodFire) {
      c.fired += dt;
      if (c.fired > 1.1) {
        c.running = true;
        c.fired = 0;
        c.rpm = Math.max(c.rpm, 900);
        f.cStartT = s.t;
        emit({ type: 'cEngStart', flooded: floodFire });
      }
    } else c.fired = Math.max(0, c.fired - dt * 0.5);
  } else {
    // топливо в цилиндрах: из системы (смесь) или остаток заливки
    const feeding = fuel && mix > 0.12;
    if (!feeding) c.prime = Math.max(0, c.prime - 0.18 * dt);
    const fuelOk = feeding || c.prime > 0.12;
    let pm = feeding ? clamp((mix - 0.12) / 0.28, 0, 1) * (1 - 0.03 * Math.max(0, mix - 0.86) / 0.14) : 0.55;
    if (!feeding && c.prime < 0.5) pm *= c.prime / 0.5;
    let magK = 1;
    c.magDrop = 0;
    if (mags === 1 || mags === 2) {
      const bad = (mags === 2 && c.failMag === 'L') || (mags === 1 && c.failMag === 'R');
      magK = bad ? 0.79 + 0.04 * Math.sin(s.t * 23) : 0.955;
    } else if (c.failMag) magK = 0.985 + 0.01 * Math.sin(s.t * 17);
    let tgt = (640 + 1760 * Math.pow(thr, 1.1)) * pm * magK * (1 + s.ac.ias / 900);
    // вода в топливе: перебои на высокой мощности
    if (c.pre.sumpWater > 0) {
      const rough = 0.86 + 0.09 * Math.sin(s.t * 6.1) * Math.sin(s.t * 2.3);
      tgt = Math.min(tgt * rough, 1950);
    }
    if (!magsOn || !fuelOk) tgt = 0;
    c.rpm = lag(c.rpm, tgt, tgt < c.rpm ? 1.1 : 0.7, dt);
    c.magDrop = magK < 1 ? Math.round(tgt / magK - tgt) : 0;
    if ((c.rpm < 330 && !c.starter) || !magsOn) {
      c.running = false;
      emit({ type: 'cEngStop', reason: !magsOn ? 'mags' : !feeding ? 'mixture' : 'stall' });
    }
  }

  // ---------------- масло и температуры ----------------
  const ambF = s.oat * 1.8 + 32;
  if (c.running) {
    const cold = clamp((140 - c.oilT) / 80, 0, 1) * 18;
    const lowQ = c.pre.oilQt < 5 ? (5 - c.pre.oilQt) * 14 + 6 * Math.sin(s.t * 1.7) : 0;
    const tgtP = c.failOil ? 2 : clamp(22 + (c.rpm / 2700) * 58 + cold - lowQ, 0, 100);
    c.oilP = lag(c.oilP, tgtP, 4, dt);
    c.oilT = lag(c.oilT, 105 + (c.rpm / 2700) * 95 + (c.pre.oilQt < 5 ? 30 : 0), 200, dt);
    c.cht = lag(c.cht, 180 + (c.rpm / 2700) * 230, 140, dt);
    c.egt = lag(c.egt, 1050 + 380 * clamp(1.05 - Math.abs(mix - 0.7) * 1.4, 0.4, 1) * (c.rpm / 2700), 4, dt);
  } else {
    c.oilP = lag(c.oilP, 0, 1.5, dt);
    c.oilT = lag(c.oilT, ambF, 600, dt);
    c.cht = lag(c.cht, ambF, 400, dt);
    c.egt = lag(c.egt, ambF, 30, dt);
  }
  c.ff = c.running ? (1.6 + 9.4 * Math.pow(clamp((c.rpm - 600) / 2100, 0, 1), 1.5)) * clamp(0.55 + mix * 0.5, 0, 1.05) : pumpOn && mix > 0.3 ? 0.5 : 0;
  const burn = (c.ff * dt) / 3600;
  if (c.running) {
    const sel = sw.C_FUEL_SEL;
    if (sel === 0) c.fuelL = Math.max(0, c.fuelL - burn);
    else if (sel === 2) c.fuelR = Math.max(0, c.fuelR - burn);
    else {
      c.fuelL = Math.max(0, c.fuelL - burn / 2);
      c.fuelR = Math.max(0, c.fuelR - burn / 2);
    }
  }
  if (c.oilP > 10) c.hobbs += dt / 3600;

  // ---------------- вакуум и гироскопы ----------------
  c.vac = lag(c.vac, c.rpm > 400 ? clamp((c.rpm / 900) * 4.6, 0, 5.3) : 0, 1, dt);
  const spinT = c.vac > 3.8 ? 1 : c.vac / 3.8;
  c.aiSpin = lag(c.aiSpin, spinT, spinT > c.aiSpin ? 35 : 120, dt);
  c.hiSpin = lag(c.hiSpin, spinT, spinT > c.hiSpin ? 35 : 120, dt);
  // при раскрутке гироскоп курса «уплывает»
  if (c.hiSpin < 0.6) c.hiErr += dt * 0.6 * (1 - c.hiSpin);

  if (av2(s) && f.cApPwrT === undefined) f.cApPwrT = s.t;
  if (!av2(s)) f.cApPwrT = undefined;
  // ---------------- закрылки (электрические) ----------------
  const ft = FLAP_DEG[sw.C_FLAPS] ?? 0;
  if (c.busV > 18) c.flaps = c.flaps + clamp(ft - c.flaps, -3.4 * dt, 3.4 * dt);
}
