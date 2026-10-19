import { IDLE_N1, IDLE_N2 } from './engines';
import { GEO_LFPO, SCN, SCN_ARR } from './scenario';
import type { SimState } from './types';

/**
 * Перевод самолёта на конечный этап захода в LFPO (ILS 06, 16 NM, 5000 ft).
 * mode: 'start' — сценарий «Прилёт» с нуля; 'continue' — продолжение полного рейса;
 * 'again' — повторный заход после ухода на второй круг.
 */
export function setupArrival(s: SimState, mode: 'start' | 'continue' | 'again') {
  const g = GEO_LFPO;
  s.geo = g;
  s.leg = 'arr';
  s.elev = g.elev;
  s.rwyHdg = g.rwyHdg;
  s.rwyLen = g.rwyLen;
  const sw = s.sw;
  const ac = s.ac;

  if (mode === 'start' || mode === 'continue') {
    // ---- системы в полётной конфигурации ----
    Object.assign(sw, {
      BAT1: 1,
      BAT2: 1,
      EXT_PWR: 0,
      APU_MASTER: 0,
      APU_BLEED: 0,
      FUEL_L1: 1,
      FUEL_L2: 1,
      FUEL_C1: 1,
      FUEL_C2: 1,
      FUEL_R1: 1,
      FUEL_R2: 1,
      IR1_MODE: 1,
      IR2_MODE: 1,
      IR3_MODE: 1,
      OXY_CREW: 1,
      RCDR_GND: 1,
      SEAT_BELTS: 0,
      NO_SMOKING: 1,
      EMER_EXIT_LT: 1,
      NAV_LOGO: 1,
      BEACON: 1,
      STROBE: 2,
      LAND_L: 1,
      LAND_R: 1,
      NOSE_LT: 0,
      RWY_TURNOFF: 0,
      ENG_MODE: 1,
      ENG1_MASTER: 1,
      ENG2_MASTER: 1,
      TL1: 25,
      TL2: 25,
      FLAPS: 0,
      SPD_BRK: 1,
      GEAR: 0,
      PARK_BRK: 0,
      ASKID_NWS: 1,
      FD: 1,
      LS: 0,
      ND_MODE: 3,
      ND_RANGE: 1,
      XPDR_MODE: 1,
      TCAS_MODE: 2,
      RMP_ON: 1,
      WX_SYS: 0,
      WX_PWS: 1,
      ANN_LT: 1,
    });
    for (let i = 0; i < 2; i++) {
      const e = s.eng[i];
      Object.assign(e, {
        phase: 'run',
        running: true,
        n1: 52,
        n2: IDLE_N2 + (52 - IDLE_N1) * 0.53,
        egt: 560,
        ff: 950,
        oilP: 30,
        oilT: 85,
        hpValve: true,
        lpValve: true,
        startValve: false,
        ign: '',
        startFault: '',
        failPending: '',
        availTimer: 0,
        fuelUsed: mode === 'start' ? 2100 : e.fuelUsed + 2000,
      });
    }
    Object.assign(s.apu, { n: 0, avail: false, starting: false, startReq: false, flap: 0, cooldown: 0, egt: s.oat, fault: false });
    s.hyd.g = 3000;
    s.hyd.b = 3000;
    s.hyd.y = 3000;
    s.hyd.accu = 3000;
    for (const ir of s.adirs.ir) Object.assign(ir, { powered: true, aligned: true, aligning: false, fault: false, progress: 999, onBat: 0 });
    s.adirs.adr = [true, true, true];
    s.fuel.left = 2700;
    s.fuel.right = 2700;
    s.fuel.center = 0;
    s.fuel.used = 4200;
    s.gnd.doors = { L1: false, L2: false, R1: false, R2: false, FWD: false, AFT: false, BULK: false };
    s.gnd.slidesArmed = true;
    s.gnd.boarding = 1;
    s.gnd.tow = false;
    s.gnd.chocks = false;
    s.gnd.headset = false;
    s.gnd.gpu = false;
    s.gnd.pushStage = 'done';
    s.gnd.cabinReady = false;
    s.flags.powerOnT = s.t - 600;
    s.flags.acEssT = s.t - 600;
    s.flags.ac2T = s.t - 600;
    s.flags.bothRunningT = s.t - 600;
    s.flags.passed1500 = true;
    s.ecam.firstEngStartT = s.t - 600;
    s.ecam.active = [];
    s.ecam.masterCaut = false;
    s.ecam.masterWarn = false;
    s.ecam.sdManual = '';
    // FMS
    Object.assign(s.fms, {
      from: SCN.from,
      to: SCN.to,
      fltNbr: SCN.callsign,
      ci: SCN.ci,
      crzFl: SCN.crzFl,
      posConfirmed: true,
      zfw: SCN.zfw,
      zfwcg: SCN.zfwcg,
      block: SCN.block,
      rwy: SCN.rwy,
      sid: SCN.sid,
      arr: true,
      appr: SCN_ARR.appr,
      page: 'PERFAPPR',
      qnhAppr: null,
      tempAppr: null,
      windAppr: '',
      mda: null,
      dh: null,
      ldgConf: 4,
      route: ['CI06', 'FF06', 'LFPO'],
    });
    if (mode === 'start') {
      s.fms.v1 = SCN.v1;
      s.fms.vr = SCN.vr;
      s.fms.v2 = SCN.v2;
      s.fms.flex = SCN.flex;
    }
    s.radio.active = SCN_ARR.freqs.APP;
    s.radio.stby = SCN_ARR.freqs.ATIS;
    s.radio.xpdrCode = s.atc.squawk;
    s.fcu.baroStd = true;
    s.fcu.fd = true;
    s.atc.appClear = false;
    s.atc.ldgClear = false;
    s.atc.taxiInClear = false;
    s.atc.arrAtis = false;
    s.atc.pending = [];
    s.atc.pending.push({
      at: s.t + 4,
      unit: 'APP',
      apply: 'appClear',
      msg: {
        en: `${SCN.callsign}, Orly Approach, maintain 5000 feet, cleared ILS approach runway 06, report established.`,
        ru: `${SCN.callsign}, Орли-Подход, сохраняйте 5000 фт, заход по ILS ВПП 06 разрешаю, доложите на курсе.`,
      },
    });
  } else {
    s.atc.pending.push({
      at: s.t + 4,
      unit: 'APP',
      apply: 'appClear',
      msg: {
        en: `${SCN.callsign}, radar vectors completed, 5000 feet, cleared ILS runway 06 again, report established.`,
        ru: `${SCN.callsign}, векторение закончено, 5000 фт, повторный заход ILS ВПП 06 разрешаю, доложите на курсе.`,
      },
    });
    s.radio.active = SCN_ARR.freqs.APP;
    s.sw.TL1 = 25;
    s.sw.TL2 = 25;
    s.sw.FLAPS = Math.min(s.sw.FLAPS, 1);
    s.sw.GEAR = 0;
  }

  // ---- положение: 16 NM на продолжении оси, 5000 ft ----
  const along = -16 * 1852;
  ac.x = g.thr.x + g.rwyDir.x * along;
  ac.y = g.thr.y + g.rwyDir.y * along;
  ac.hdg = g.rwyHdg;
  ac.alt = 5000;
  ac.onGround = false;
  ac.ias = mode === 'again' ? 190 : 220;
  ac.gs = ac.ias / 1.943844;
  ac.gamma = 0;
  ac.pitch = mode === 'again' ? 5 : 3.5;
  ac.roll = 0;
  ac.vs = 0;
  ac.gear = 0;
  if (mode !== 'again') {
    ac.flaps = 0;
    ac.slats = 0;
  } else {
    ac.slats = s.sw.FLAPS === 1 ? 18 : 0;
    ac.flaps = 0;
  }
  ac.landed = false;
  ac.td = null;
  ac.exit = -1;
  ac.ap = true;
  ac.athr = true;
  ac.athrActive = true;
  ac.autobrkActive = false;
  ac.spoilers = 0;
  ac.dist = 0;
  ac.stopped = false;
  ac.liftoffT = s.t - 900;
  s.gnd.phase = 'airborne';
  s.fcu.alt = 5000;
  s.fcu.appr = false;
  s.fcu.loc = false;
  s.flags.athrN1 = 52;
  for (const k of ['ga', 'locCap', 'gsCap', 'land', 'flare', 'retard', 'abUsed', 'abDisc', 'nlgDown', 'touchdown', 'standOvershoot', 'gaDone'])
    s.flags[k] = undefined;
  s.fdPitch = ac.pitch;
  s.ecam.phase = 6;
  if (s.failures.some((f) => f.id === 'lgGravity')) s.flags.lgJam = true;
  if (s.failures.some((f) => f.id === 'engFailApp')) s.flags.engFailAppPending = true;
}
