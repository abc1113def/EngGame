import { CONTROLS } from './controls';
import { clrLit, sdPage } from './ecam';
import { annPower } from './systems';
import type { SimState } from './types';

export const U = 1; // верхняя половина
export const LO = 2; // нижняя половина
export const FL = 4; // мигает

const PAGE_PB: Record<string, string> = {
  ECP_ENG: 'ENG',
  ECP_BLEED: 'BLEED',
  ECP_PRESS: 'PRESS',
  ECP_ELEC: 'ELEC',
  ECP_HYD: 'HYD',
  ECP_FUEL: 'FUEL',
  ECP_APU: 'APU',
  ECP_COND: 'COND',
  ECP_DOOR: 'DOOR',
  ECP_WHEEL: 'WHEEL',
  ECP_FCTL: 'F/CTL',
  ECP_STS: 'STS',
};

/** Вычисление состояния всех ламп кнопок */
export function updAnn(s: SimState) {
  const a = s.ann;
  const sw = s.sw;
  const pwr = annPower(s);
  const test = pwr && sw.ANN_LT === 2;
  for (const id in CONTROLS) a[id] = 0;
  if (!pwr) {
    // горячая шина: только пожарная сигнализация
    fire(s);
    return;
  }
  // общее правило по надписям
  for (const id in CONTROLS) {
    const d = CONTROLS[id];
    if (!d.lo && !d.up) continue;
    let v = 0;
    if (d.lo && (d.kind === 'pb' || d.kind === 'guard')) {
      const t = d.lo.t;
      if ((t === 'OFF' || t === 'ALTN') && sw[id] === 0) v |= LO;
      if ((t === 'ON' || t === 'MAN' || t === 'OVRD') && sw[id] === 1) v |= LO;
    }
    a[id] = v;
  }
  const e = s.elec;
  // ELEC
  a.EXT_PWR = (s.gnd.gpu && !e.ext ? U : 0) | (e.ext ? LO : 0);
  a.GEN1 = (sw.GEN1 === 0 ? LO : 0) | (sw.GEN1 === 1 && s.eng[0].n2 > 52 && !e.gen1 ? U : 0);
  a.GEN2 = (sw.GEN2 === 0 ? LO : 0) | (sw.GEN2 === 1 && s.eng[1].n2 > 52 && !e.gen2 ? U : 0);
  a.IDG1 = e.idg1Disc && s.eng[0].n2 > 10 ? U : 0;
  a.IDG2 = e.idg2Disc && s.eng[1].n2 > 10 ? U : 0;
  // APU
  a.APU_MASTER = (sw.APU_MASTER === 1 ? LO : 0) | (s.apu.fault ? U : 0);
  a.APU_START = (s.apu.startReq || s.apu.starting ? U : 0) | (s.apu.avail ? LO : 0);
  // ADIRS
  for (let i = 0; i < 3; i++) {
    const ir = s.adirs.ir[i];
    const id = `IR${i + 1}`;
    let v = 0;
    if (ir.powered && ir.aligning) {
      const waiting = ir.progress >= s.adirs.alignTime && !s.fms.posConfirmed;
      v |= LO | (ir.fault || waiting ? FL : 0);
    }
    a[id] = v;
    a[`ADR${i + 1}`] = (sw[`ADR${i + 1}`] === 0 && ir.powered ? LO : 0);
  }
  a.ON_BAT = s.adirs.ir.some((ir) => ir.onBat > 0) ? U : 0;
  // FUEL
  for (const k of ['L1', 'L2', 'R1', 'R2'] as const) {
    const id = `FUEL_${k}`;
    a[id] = (sw[id] === 0 ? LO : 0) | (sw[id] === 1 && !s.fuel.press[k] && (s.elec.ac1 || s.elec.ac2) ? U : 0);
  }
  a.FUEL_XFEED = (sw.FUEL_XFEED === 1 ? LO : 0) | (s.fuel.xfeed > 0.95 ? U : 0);
  // HYD
  a.HYD_G_ENG1 = (sw.HYD_G_ENG1 === 0 ? LO : 0) | (sw.HYD_G_ENG1 === 1 && s.eng[0].running && s.hyd.g < 1450 ? U : 0);
  a.HYD_Y_ENG2 = (sw.HYD_Y_ENG2 === 0 ? LO : 0) | (sw.HYD_Y_ENG2 === 1 && s.eng[1].running && s.hyd.y < 1450 ? U : 0);
  a.HYD_B_ELEC = (sw.HYD_B_ELEC === 0 ? LO : 0) | (sw.HYD_B_ELEC === 1 && (s.eng[0].running || s.eng[1].running) && s.hyd.b < 1450 ? U : 0);
  // AIR
  a.PACK1 = (sw.PACK1 === 0 ? LO : 0) | (s.bleed.pack1Fault ? U : 0);
  // F/CTL
  a.ELAC1 = (sw.ELAC1 === 0 ? LO : 0) | (s.flags.elacFault && sw.ELAC1 === 1 ? U : 0);
  // EVAC
  a.EVAC_CMD = sw.EVAC_CMD === 1 ? U | LO | FL : 0;
  // FCU / EFIS
  a.FD = s.fcu.fd ? LO : 0;
  a.LS = s.fcu.ls ? LO : 0;
  a.EFIS_CSTR = s.fcu.efis.cstr ? LO : 0;
  a.EFIS_WPT = s.fcu.efis.wpt ? LO : 0;
  a.EFIS_VORD = s.fcu.efis.vord ? LO : 0;
  a.EFIS_NDB = s.fcu.efis.ndb ? LO : 0;
  a.EFIS_ARPT = s.fcu.efis.arpt ? LO : 0;
  a.AP1 = s.ac.ap ? LO : 0;
  a.AP2 = 0;
  a.ATHR = s.ac.athr ? LO : 0;
  a.LOC = s.fcu.loc ? LO : 0;
  a.APPR = s.fcu.appr ? LO : 0;
  a.EXPED = s.fcu.exped ? LO : 0;
  // автотормоз
  a.AB_LO = s.ac.autobrk === 1 ? LO : 0;
  a.AB_MED = s.ac.autobrk === 2 ? LO : 0;
  a.AB_MAX = (s.ac.autobrk === 3 ? LO : 0) | (s.ac.autobrkActive && s.ac.autobrk === 3 ? U : 0);
  a.BRK_FAN = sw.BRK_FAN === 1 ? LO : 0;
  // мастер-лампы
  const blink = Math.floor(s.t * 2) % 2 === 0;
  a.MASTER_WARN = s.ecam.masterWarn ? (blink ? U | LO : 0) : 0;
  a.MASTER_CAUT = s.ecam.masterCaut ? U | LO : 0;
  // ECP
  const page = sdPage(s);
  for (const id in PAGE_PB) a[id] = page === PAGE_PB[id] ? LO : 0;
  a.ECP_CLR = clrLit(s) ? LO : 0;
  // ENG panel lights
  for (const n of [1, 2]) {
    const e = s.eng[n - 1];
    a[`ENG${n}_MLT`] = (e.fire || s.ecam.test[`eng${n}` as 'eng1'] ? U : 0) | (e.startFault || s.ecam.test[`eng${n}` as 'eng1'] ? LO : 0);
  }
  fire(s);
  if (test) {
    for (const id in CONTROLS) {
      const d = CONTROLS[id];
      if (d.up || d.lo) a[id] = (d.up ? U : 0) | (d.lo ? LO : 0);
    }
    a.ON_BAT = U;
    a.ENG1_MLT = U | LO;
    a.ENG2_MLT = U | LO;
    a.ENG1_FIRE = U;
    a.ENG2_FIRE = U;
    a.APU_FIRE = U;
  }
}

function fire(s: SimState) {
  const a = s.ann;
  for (const e of ['ENG1', 'ENG2', 'APU'] as const) {
    const test = e === 'APU' ? s.ecam.test.apu : s.ecam.test[e === 'ENG1' ? 'eng1' : 'eng2'];
    const isFire = e === 'APU' ? false : s.eng[e === 'ENG1' ? 0 : 1].fire;
    a[`${e}_FIRE`] = isFire || test ? U : 0;
    const pushed = s.sw[`${e}_FIRE`] === 1;
    const eng = e === 'APU' ? null : s.eng[e === 'ENG1' ? 0 : 1];
    const d1 = e === 'APU' ? !!s.flags.apuAgent : !!eng?.agent1;
    const d2 = e === 'APU' ? false : !!eng?.agent2;
    a[`${e}_AGENT1`] = ((pushed && !d1) || test ? U : 0) | (d1 || test ? LO : 0);
    if (e !== 'APU') a[`${e}_AGENT2`] = ((pushed && !d2) || test ? U : 0) | (d2 || test ? LO : 0);
  }
}
