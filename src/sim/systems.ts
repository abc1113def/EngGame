import type { SimState } from './types';

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const approach = (v: number, target: number, rate: number, dt: number) => {
  const d = target - v;
  const m = rate * dt;
  return Math.abs(d) <= m ? target : v + Math.sign(d) * m;
};
export const lag = (v: number, target: number, k: number, dt: number) => v + (target - v) * Math.min(1, k * dt);

const BAT_CAP = 12 * 3600; // А·с (условная ёмкость для игрового темпа)
const BAT_R = 0.015;

export type Emit = (ev: { type: string; [k: string]: unknown }) => void;

// ============================ ЭЛЕКТРИКА ============================
export function updElec(s: SimState, dt: number, emit: Emit) {
  const sw = s.sw;
  const e = s.elec;
  if (!s.gnd.gpu) sw.EXT_PWR = 0;

  const wasAc = !!(e.ac1 || e.ac2);
  e.gen1 = sw.GEN1 === 1 && !e.idg1Disc && s.eng[0].n2 > 52 && sw.ENG1_FIRE === 0;
  e.gen2 = sw.GEN2 === 1 && !e.idg2Disc && s.eng[1].n2 > 52 && sw.ENG2_FIRE === 0;
  e.apuGen = sw.APU_GEN === 1 && s.apu.n >= 95 && (s.apu.avail || s.apu.cooldown > 0);
  e.ext = s.gnd.gpu && sw.EXT_PWR === 1;
  const tie = sw.BUS_TIE === 1;
  const other = e.ext ? 'EXT' : e.apuGen ? 'APU' : '';
  e.ac1 = e.gen1 ? 'GEN1' : tie ? (other || (e.gen2 ? 'GEN2' : '')) as typeof e.ac1 : '';
  e.ac2 = e.gen2 ? 'GEN2' : tie ? (other || (e.gen1 ? 'GEN1' : '')) as typeof e.ac2 : '';
  e.acEss = sw.AC_ESS_FEED === 1 ? !!e.ac1 : !!e.ac2;
  e.tr1 = !!e.ac1;
  e.tr2 = !!e.ac2;
  const tr = e.tr1 || e.tr2;
  e.dc1 = tr;
  e.dc2 = tr;

  const on = [sw.BAT1 === 1, sw.BAT2 === 1];
  let batSupplying = false;
  // нагрузка на аккумуляторы
  const apuStartLoad = s.apu.starting && s.apu.n < 55 ? 360 : 0;
  const nOn = (on[0] && e.bat[0].charge > 0.01 ? 1 : 0) + (on[1] && e.bat[1].charge > 0.01 ? 1 : 0);
  for (let i = 0; i < 2; i++) {
    const b = e.bat[i];
    const voc = 23.6 + 3.4 * b.charge;
    if (!on[i] || b.charge <= 0.01) {
      b.a = 0;
      b.v = b.charge <= 0.01 ? 0 : voc;
      continue;
    }
    if (tr) {
      // заряд от TR
      if (b.charge < 0.995) b.a = clamp(70 * (1 - b.charge) + 3, 0, 60);
      else b.a = 2;
      b.charge = clamp(b.charge + (b.a * dt) / BAT_CAP, 0, 1);
      b.v = clamp(27.6 + b.a * 0.012, 26, 28.5);
    } else {
      const load = 22 + (nOn ? apuStartLoad / nOn : 0);
      b.a = -load;
      b.charge = clamp(b.charge - (load * dt) / BAT_CAP, 0, 1);
      b.v = Math.max(0, voc - BAT_R * load);
      batSupplying = true;
    }
  }
  e.dcBat = tr || batSupplying;
  e.dcEss = e.dcBat;

  const busLoad = 18 + (sw.GALY_CAB ? 14 : 0) + (s.bleed.pack1 ? 6 : 0) + (s.bleed.pack2 ? 6 : 0) + (sw.HYD_Y_ELEC && s.hyd.y > 100 ? 8 : 0);
  e.loads.gen1 = e.gen1 ? Math.round(busLoad / (e.gen2 ? 2 : 1)) : 0;
  e.loads.gen2 = e.gen2 ? Math.round(busLoad / (e.gen1 ? 2 : 1)) : 0;
  const tieLoad = (e.ac1 === 'APU' || e.ac1 === 'EXT' ? busLoad / 2 : 0) + (e.ac2 === 'APU' || e.ac2 === 'EXT' ? busLoad / 2 : 0);
  e.loads.apu = e.ac1 === 'APU' || e.ac2 === 'APU' ? Math.round(tieLoad) : 0;
  e.loads.ext = e.ac1 === 'EXT' || e.ac2 === 'EXT' ? Math.round(tieLoad) : 0;

  const isAc = !!(e.ac1 || e.ac2);
  if (wasAc && !isAc && !s.eng[0].running && !s.eng[1].running) {
    e.lostPower = true;
    emit({ type: 'powerLoss' });
  }
}

/** Есть ли питание у сигнальных ламп */
export const annPower = (s: SimState) => s.elec.dcBat;
export const dispPower = (s: SimState) => s.elec.acEss;
export const sdPower = (s: SimState) => !!s.elec.ac2;

// ============================ ВСУ ============================
export function updApu(s: SimState, dt: number, emit: Emit) {
  const a = s.apu;
  const sw = s.sw;
  const pwr = s.elec.dcBat;
  const firePb = sw.APU_FIRE === 1;
  const master = sw.APU_MASTER === 1 && pwr && !firePb;

  if (sw.APU_MASTER === 0 && a.fault) {
    a.fault = false;
  }
  // заслонка воздухозаборника
  if (master) a.flap = approach(a.flap, 1, 1 / 12, dt);
  else if (a.n < 7) a.flap = approach(a.flap, 0, 1 / 12, dt);

  if (!master) {
    a.startReq = false;
    if (a.starting) {
      a.starting = false;
    }
    if (a.avail) {
      a.avail = false;
      a.cooldown = a.bleedUsed < 60 ? 60 : 0;
      a.shutdownReason = 'master';
    }
  } else if (a.cooldown > 0 && !a.fault) {
    // MASTER снова включён во время охлаждения — ВСУ продолжает работу
    a.cooldown = 0;
    a.avail = true;
  }

  if (a.startReq && master && a.flap >= 1 && !a.starting && !a.avail && !a.fault && a.n < 5) {
    a.starting = true;
    a.startTime = s.t;
    a.availTimer = 0;
    emit({ type: 'apuStart' });
  }

  const autoShutdown = (why: string) => {
    a.starting = false;
    a.startReq = false;
    a.avail = false;
    a.fault = true;
    a.failPending = false;
    a.shutdownReason = why;
    emit({ type: 'apuAutoShutdown', why });
  };

  if (a.starting) {
    const acOk = s.elec.tr1 || s.elec.tr2;
    const v = Math.min(...s.elec.bat.filter((_, i) => sw[`BAT${i + 1}`] === 1).map((b) => b.v), 99);
    const weak = !acOk && v < 22;
    const target = weak ? 24 : 100;
    const rate = a.n < 10 ? 3 : weak ? 0.6 : 2.3;
    a.n = approach(a.n, target, rate, dt);
    if (a.failPending && a.n > 42) autoShutdown('START');
    else if (weak && s.t - a.startTime > 50) autoShutdown('START');
    else if (a.n >= 95) {
      a.availTimer += dt;
      if (a.availTimer >= 2) {
        a.avail = true;
        a.starting = false;
        a.startReq = false;
        emit({ type: 'apuAvail' });
      }
    }
  } else if (a.avail) {
    a.n = lag(a.n, s.bleed.apuValve ? 99.6 : 100, 1, dt);
  } else if (a.cooldown > 0) {
    a.cooldown -= dt;
    a.n = lag(a.n, 100, 1, dt);
  } else {
    a.n = Math.max(0, a.n - Math.max(1.5, a.n * 0.09) * dt);
  }

  // EGT
  let egtT = s.oat;
  if (a.starting) {
    if (a.n < 7) egtT = s.oat;
    else if (a.n < 38) egtT = s.oat + ((a.n - 7) / 31) * (820 - s.oat);
    else egtT = 820 - ((a.n - 38) / 62) * 380;
  } else if (a.avail || a.cooldown > 0) {
    egtT = 430 + (s.bleed.apuValve ? 120 : 0) + s.elec.loads.apu * 0.6;
  }
  a.egt = lag(a.egt, egtT, a.starting ? 0.8 : 0.08, dt);
  if (s.bleed.apuValve) a.bleedUsed = 0;
  else a.bleedUsed += dt;
  if (a.n > 10) {
    const ff = (110 + (s.bleed.apuValve ? 40 : 0)) / 3600;
    a.fuelUsed += ff * dt;
    s.fuel.left = Math.max(0, s.fuel.left - ff * dt);
  }
}

// ============================ ПНЕВМАТИКА ============================
const engPsi = (n2: number) => (n2 > 45 ? 26 + (n2 - 58) * 0.42 : n2 * 0.25);

export function updBleed(s: SimState, dt: number, emit: Emit) {
  const sw = s.sw;
  const b = s.bleed;
  const [e1, e2] = s.eng;
  b.apuValve = sw.APU_BLEED === 1 && s.apu.avail && s.apu.n >= 95 && sw.APU_FIRE === 0;
  b.xbleed = sw.XBLEED === 2 || (sw.XBLEED === 1 && b.apuValve);
  b.eng1Valve = sw.ENG1_BLEED === 1 && e1.n2 > 45 && !b.apuValve && sw.ENG1_FIRE === 0;
  b.eng2Valve = sw.ENG2_BLEED === 1 && e2.n2 > 45 && !b.apuValve && sw.ENG2_FIRE === 0;
  const p1 = b.eng1Valve ? engPsi(e1.n2) : 0;
  const p2 = b.eng2Valve ? engPsi(e2.n2) : 0;
  const pa = b.apuValve ? 37 : 0;
  let L = Math.max(p1, pa, b.xbleed ? p2 : 0);
  let R = Math.max(p2, b.xbleed ? Math.max(pa, p1) : 0);
  const starting = e1.startValve || e2.startValve || ['crank', 'fuel', 'accel'].includes(e1.phase) || ['crank', 'fuel', 'accel'].includes(e2.phase);
  // отказ PACK 1 после запуска
  if (s.flags.pack1FaultPending && e1.running && e2.running && s.flags.bothRunningT !== undefined && s.t - (s.flags.bothRunningT as number) > 40) {
    s.flags.pack1FaultPending = false;
    b.pack1Fault = true;
    emit({ type: 'failure', id: 'pack1' });
  }
  b.pack1 = sw.PACK1 === 1 && L > 8 && !starting && sw.ENG1_FIRE === 0 && !b.pack1Fault && !sw.DITCHING;
  b.pack2 = sw.PACK2 === 1 && R > 8 && !starting && sw.ENG2_FIRE === 0 && !sw.DITCHING;
  const flow = [0.8, 1, 1.2][sw.PACK_FLOW] ?? 1;
  b.pack1Flow = lag(b.pack1Flow, b.pack1 ? flow : 0, 0.5, dt);
  b.pack2Flow = lag(b.pack2Flow, b.pack2 ? flow : 0, 0.5, dt);
  if (b.pack1) L -= 3;
  if (b.pack2) R -= 3;
  if (e1.startValve) L -= 6;
  if (e2.startValve) R -= 6;
  b.leftPsi = lag(b.leftPsi, Math.max(0, L), 1.2, dt);
  b.rightPsi = lag(b.rightPsi, Math.max(0, R), 1.2, dt);

  // температура в кабине
  const packs = b.pack1Flow + b.pack2Flow;
  const tgt = (k: number) => 18 + 12 * k;
  const amb = s.oat + 6;
  const k = packs > 0.1 ? 0.006 * packs : 0.0015;
  b.cabin.ckpt = lag(b.cabin.ckpt, packs > 0.1 ? tgt(sw.TEMP_CKPT) : amb, k, dt);
  b.cabin.fwd = lag(b.cabin.fwd, packs > 0.1 ? tgt(sw.TEMP_FWD) : amb, k, dt);
  b.cabin.aft = lag(b.cabin.aft, packs > 0.1 ? tgt(sw.TEMP_AFT) : amb, k, dt);
}

// ============================ ТОПЛИВО ============================
export function updFuel(s: SimState, dt: number) {
  const sw = s.sw;
  const f = s.fuel;
  const ac1 = !!s.elec.ac1;
  const ac2 = !!s.elec.ac2;
  f.press.L1 = sw.FUEL_L1 === 1 && ac1 && f.left > 0;
  f.press.L2 = sw.FUEL_L2 === 1 && ac2 && f.left > 0;
  f.press.R1 = sw.FUEL_R1 === 1 && ac1 && f.right > 0;
  f.press.R2 = sw.FUEL_R2 === 1 && ac2 && f.right > 0;
  if (f.ctrRun > 0) f.ctrRun -= dt;
  const auto = sw.FUEL_MODE === 0;
  const ctrWant = f.center > 0 && (!auto || f.ctrRun > 0 || (!s.ac.onGround && s.ac.slats < 1));
  f.press.C1 = sw.FUEL_C1 === 1 && ac1 && ctrWant;
  f.press.C2 = sw.FUEL_C2 === 1 && ac2 && ctrWant;
  f.xfeed = approach(f.xfeed, sw.FUEL_XFEED === 1 && (ac1 || s.elec.dcBat) ? 1 : 0, 0.5, dt);

  const b1 = (s.eng[0].ff * dt) / 3600;
  const b2 = (s.eng[1].ff * dt) / 3600;
  if ((f.press.C1 || f.press.C2) && f.center > 0) {
    f.center = Math.max(0, f.center - b1 - b2);
  } else {
    const lp = f.press.L1 || f.press.L2;
    const rp = f.press.R1 || f.press.R2;
    const x = f.xfeed > 0.9;
    if (!lp && rp && x) f.right -= b1;
    else f.left -= b1;
    if (!rp && lp && x) f.left -= b2;
    else f.right -= b2;
    f.left = Math.max(0, f.left);
    f.right = Math.max(0, f.right);
  }
  f.used += b1 + b2;
}

export const fob = (s: SimState) => s.fuel.left + s.fuel.center + s.fuel.right;

// ============================ ГИДРАВЛИКА ============================
export function updHyd(s: SimState, dt: number) {
  const sw = s.sw;
  const h = s.hyd;
  const [e1, e2] = s.eng;
  const anyAc = !!(s.elec.ac1 || s.elec.ac2);
  const gEng = sw.HYD_G_ENG1 === 1 && e1.n2 > 45 && sw.ENG1_FIRE === 0;
  const yEng = sw.HYD_Y_ENG2 === 1 && e2.n2 > 45 && sw.ENG2_FIRE === 0;
  const yElec = sw.HYD_Y_ELEC === 1 && !!s.elec.ac2;
  const bElec = sw.HYD_B_ELEC === 1 && anyAc && (e1.n2 > 45 || e2.n2 > 45);
  let gT = gEng ? 3000 : 0;
  let yT = yEng || yElec ? 3000 : 0;
  const bT = bElec ? 3000 : 0;

  const m1 = sw.ENG1_MASTER === 1;
  const m2 = sw.ENG2_MASTER === 1;
  const inhibit = m1 !== m2 && sw.PARK_BRK === 1;
  const diff = Math.abs(h.g - h.y);
  if (sw.HYD_PTU === 1 && !inhibit && Math.max(gT, yT) >= 2500 && Math.min(gT, yT) < 2500) {
    if (!h.ptu && diff > 500) h.ptu = true;
  } else h.ptu = false;
  if (h.ptu) {
    if (gT < yT) gT = 2950;
    else yT = 2950;
    if (diff < 150 && Math.min(gT, yT) >= 2900 && Math.min(h.g, h.y) > 2800) {
      // давление выровнено: PTU работает прерывисто
      h.ptu = (s.t % 2.2) < 0.4;
    }
  }
  const up = 1400;
  const dn = 500;
  h.g = h.g < gT ? approach(h.g, gT, up, dt) : approach(h.g, gT, dn, dt);
  h.y = h.y < yT ? approach(h.y, yT, up, dt) : approach(h.y, yT, dn, dt);
  h.b = h.b < bT ? approach(h.b, bT, up, dt) : approach(h.b, bT, dn, dt);
  if (h.y > 2000) h.accu = approach(h.accu, Math.min(3000, h.y), 250, dt);

  const pk = sw.PARK_BRK === 1;
  const altn = h.g < 1500 || sw.ASKID_NWS === 0;
  const pedal = s.ac.brakes;
  let alt = 0;
  if (pk) alt = Math.min(h.accu * 0.72, 2100);
  else if (altn && pedal > 0) alt = Math.min(Math.max(h.accu, h.y) * 0.9, 2700 * pedal);
  h.brkL = lag(h.brkL, alt, 4, dt);
  h.brkR = lag(h.brkR, alt, 4, dt);
}

// ============================ ADIRS ============================
export function updAdirs(s: SimState, dt: number, emit: Emit) {
  const ad = s.adirs;
  const anyPwr = s.elec.dcBat || s.elec.acEss;
  const moving = Math.abs(s.ac.gs) > 0.3 || s.gnd.pushStage === 'pushing';
  for (let i = 0; i < 3; i++) {
    const ir = ad.ir[i];
    const mode = s.sw[`IR${i + 1}_MODE`];
    const was = ir.powered;
    ir.powered = mode > 0 && anyPwr;
    ad.adr[i] = ir.powered && s.sw[`ADR${i + 1}`] === 1;
    if (!ir.powered) {
      ir.progress = 0;
      ir.aligned = false;
      ir.aligning = false;
      ir.fault = false;
      ir.att = false;
      ir.onBat = 0;
      continue;
    }
    if (!was) {
      ir.onBat = 6;
      ir.aligning = mode === 1;
      ir.progress = 0;
      ir.att = false;
    }
    if (ir.onBat > 0) ir.onBat -= dt;
    if (mode === 2) {
      ir.aligning = false;
      ir.aligned = false;
      ir.progress += dt;
      ir.att = ir.progress > 20;
      continue;
    }
    ir.att = false;
    if (!ir.aligned && !ir.aligning) {
      ir.aligning = true;
      ir.progress = 0;
    }
    if (ir.aligning) {
      if (moving && !ir.fault && s.sw[`IR${i + 1}`] === 1) {
        ir.fault = true;
        emit({ type: 'irAlignFault', ir: i + 1 });
      }
      if (!ir.fault) ir.progress += dt;
      if (ir.progress >= ad.alignTime && s.fms.posConfirmed && !ir.fault) {
        ir.aligning = false;
        ir.aligned = true;
        emit({ type: 'irAligned', ir: i + 1 });
      }
    }
  }
}

export const irOk = (s: SimState, i = 0) => s.adirs.ir[i].aligned && s.sw[`IR${i + 1}`] === 1;
export const attOk = (s: SimState, i = 0) => (irOk(s, i) || s.adirs.ir[i].att) && s.sw[`IR${i + 1}`] === 1;
export const alignMinutes = (s: SimState) => {
  let m = 0;
  for (const ir of s.adirs.ir) if (ir.aligning && !ir.fault) m = Math.max(m, Math.ceil((s.adirs.alignTime - ir.progress) / 60));
  return m;
};
