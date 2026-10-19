import { setupArrival } from './arrival';
import { c172Initial } from './c172/init';
import { defaultSwitches } from './controls';
import { SCN_C172, GEO, GEO_LFCL, GEO_LFPO, SCN } from './scenario';
import type { AircraftType, EngineState, FailureLevel, Scenario, SimState } from './types';

/** Простой детерминированный ГПСЧ (mulberry32) */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function engine(oat: number): EngineState {
  return {
    n1: 0,
    n2: 0,
    egt: oat,
    ff: 0,
    oilP: 0,
    oilT: oat,
    oilQ: 17 + Math.round(Math.random() * 10) / 10,
    vibN1: 0,
    vibN2: 0,
    startValve: false,
    ign: '',
    lastIgn: 'B',
    hpValve: false,
    lpValve: false,
    phase: 'off',
    timer: 0,
    lightoff: 0,
    running: false,
    availTimer: 0,
    peakEgt: oat,
    startFault: '',
    failPending: '',
    failed: false,
    fire: false,
    fireOut: false,
    agent1: false,
    agent2: false,
    fuelUsed: 0,
    rev: 0,
    manualStart: false,
  };
}

const FAILS_LIGHT = ['lowBat', 'apuStart', 'lowAccu', 'elacFault', 'pack1'];
const FAILS_HARD = ['hotStart', 'noLight', 'engFire', 'toEngFail'];

const FAILS_ARR_LIGHT = ['pack1', 'lgGravity'];
const FAILS_ARR_HARD = ['engFailApp', 'lgGravity'];

export function pickC172Failures(level: FailureLevel, r: () => number): { id: string; at?: number }[] {
  if (level === 'off') return [];
  // устранимые на земле: вода (слить отстой), масло (долить), слабый аккумулятор, генератор (сброс)
  const pool = ['c_water', 'c_lowOil', 'c_lowBatt', 'c_alt'];
  const n = level === 'light' ? 1 : 2;
  const out: { id: string }[] = [];
  while (out.length < n && pool.length) out.push({ id: pool.splice(Math.floor(r() * pool.length), 1)[0] });
  // «не-лётные» неисправности — только в полном режиме и не всегда
  if (level === 'full' && r() < 0.35) out.push({ id: r() < 0.5 ? 'c_mag' : 'c_oilP' });
  return out;
}

export function pickFailures(level: FailureLevel, r: () => number, scn: Scenario = 'dep'): { id: string; at?: number }[] {
  if (level === 'off') return [];
  if (scn === 'arr') {
    const pool = level === 'light' ? [...FAILS_ARR_LIGHT] : [...FAILS_ARR_LIGHT, ...FAILS_ARR_HARD];
    const id = pool[Math.floor(r() * pool.length)];
    return [{ id }];
  }
  if (scn === 'full') {
    const dep = pickFailures(level, r, 'dep').filter((f) => f.id !== 'pack1');
    if (level === 'full') dep.push({ id: FAILS_ARR_HARD[Math.floor(r() * FAILS_ARR_HARD.length)] });
    return dep;
  }
  const pool = level === 'light' ? [...FAILS_LIGHT] : [...FAILS_LIGHT, ...FAILS_HARD, ...FAILS_HARD];
  const n = level === 'light' ? 1 + Math.floor(r() * 2) : 2 + Math.floor(r() * 2);
  const out: { id: string; at?: number }[] = [];
  while (out.length < n && pool.length) {
    const i = Math.floor(r() * pool.length);
    const id = pool.splice(i, 1)[0];
    if (out.some((f) => f.id === id)) continue;
    // взаимоисключающие отказы запуска двигателя
    if ((id === 'hotStart' || id === 'noLight' || id === 'engFire') && out.some((f) => ['hotStart', 'noLight', 'engFire'].includes(f.id))) continue;
    if (id === 'toEngFail' && out.some((f) => f.id === 'engFire')) continue;
    if (id === 'engFire' && out.some((f) => f.id === 'toEngFail')) continue;
    out.push({ id, at: id === 'toEngFail' ? 95 + Math.floor(r() * 60) : undefined });
  }
  return out;
}

export function createState(seed: number, failures: FailureLevel, fastAlign: boolean, type: AircraftType = 'a320', scn: Scenario = 'dep'): SimState {
  const r = rng(seed);
  const oat = 8 + Math.round(r() * 14);
  const qnh = 1004 + Math.round(r() * 22);
  let squawk = '';
  squawk += String(1 + Math.floor(r() * 6));
  for (let i = 0; i < 3; i++) squawk += String(Math.floor(r() * 8));
  const windDir = 300 + Math.round(r() * 4) * 10;
  const windSpd = 4 + Math.round(r() * 8);
  const letters = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';
  const fails = type === 'c172' ? pickC172Failures(failures, r) : pickFailures(failures, r, scn);
  const has = (id: string) => fails.some((f) => f.id === id);

  const sw = defaultSwitches();
  const batCharge = has('lowBat') ? 0.18 : 0.62 + r() * 0.25;

  const geo = type === 'c172' ? GEO_LFCL : scn === 'arr' ? GEO_LFPO : GEO;
  const st: SimState = {
    type,
    scn,
    leg: scn === 'arr' ? 'arr' : 'dep',
    geo,
    c: c172Initial(r, fails.map((f) => f.id)),
    t: 0,
    sw,
    eng: [engine(oat), engine(oat)],
    apu: {
      n: 0,
      egt: oat,
      flap: 0,
      startReq: false,
      starting: false,
      avail: false,
      availTimer: 0,
      bleedUsed: 999,
      cooldown: 0,
      fault: false,
      failPending: has('apuStart'),
      startTime: 0,
      fuelUsed: 0,
      shutdownReason: '',
    },
    elec: {
      bat: [
        { charge: batCharge, v: 0, a: 0 },
        { charge: has('lowBat') ? 0.22 : batCharge - 0.02, v: 0, a: 0 },
      ],
      ac1: '',
      ac2: '',
      acEss: false,
      dc1: false,
      dc2: false,
      dcBat: false,
      dcEss: false,
      tr1: false,
      tr2: false,
      gen1: false,
      gen2: false,
      apuGen: false,
      ext: false,
      idg1Disc: false,
      idg2Disc: false,
      loads: { gen1: 0, gen2: 0, apu: 0, ext: 0 },
      lostPower: false,
    },
    fuel: {
      left: SCN.block * 500,
      center: 0,
      right: SCN.block * 500,
      press: { L1: false, L2: false, C1: false, C2: false, R1: false, R2: false },
      xfeed: 0,
      ctrRun: 0,
      used: 0,
    },
    bleed: {
      apuValve: false,
      xbleed: false,
      eng1Valve: false,
      eng2Valve: false,
      leftPsi: 0,
      rightPsi: 0,
      pack1: false,
      pack2: false,
      pack1Flow: 0,
      pack2Flow: 0,
      cabin: { ckpt: oat + 6, fwd: oat + 7, aft: oat + 7 },
      pack1Fault: false,
    },
    hyd: { g: 0, b: 0, y: 0, ptu: false, accu: has('lowAccu') ? 900 : 2950, brkL: 0, brkR: 0 },
    adirs: {
      ir: [0, 1, 2].map(() => ({ powered: false, progress: 0, aligned: false, aligning: false, onBat: 0, fault: false, att: false })) as SimState['adirs']['ir'],
      adr: [false, false, false],
      alignTime: fastAlign ? 90 : 420,
    },
    ac: {
      onGround: true,
      gs: 0,
      ias: 0,
      alt: geo.elev,
      vs: 0,
      pitch: 0,
      roll: 0,
      gamma: 0,
      hdg: geo.standHdg,
      dist: 0,
      x: geo.stand.x,
      y: geo.stand.y,
      gw: (SCN.zfw + SCN.block) * 1000,
      gear: 1,
      flaps: 0,
      slats: 0,
      pitchTrim: 0,
      rudTrim: 0,
      brakes: 0,
      autobrk: 0,
      autobrkActive: false,
      stickP: 0,
      stickR: 0,
      rudder: 0,
      fctlCheck: { up: false, dn: false, l: false, r: false, rl: false, rr: false },
      tailStrike: false,
      maxPitchGround: 0,
      liftoffT: 0,
      ap: false,
      athr: false,
      athrActive: false,
      gndSplrsArmed: false,
      spoilers: 0,
      maxGs: 0,
      overrun: false,
      stopped: true,
      landed: false,
      td: null,
      exit: -1,
    },
    fms: {
      page: 'STATUS',
      scratch: '',
      msg: '',
      from: '',
      to: '',
      altn: '',
      fltNbr: '',
      ci: null,
      crzFl: null,
      crzTemp: null,
      posConfirmed: false,
      rwy: '',
      sid: '',
      tmpRwy: '',
      tmpSid: '',
      zfw: null,
      zfwcg: null,
      block: null,
      v1: null,
      vr: null,
      v2: null,
      flex: null,
      toFlaps: null,
      ths: null,
      transAlt: SCN.transAlt,
      thrRed: Math.round((SCN.elev + 1500) / 10) * 10,
      accAlt: Math.round((SCN.elev + 1500) / 10) * 10,
      depScroll: 0,
      route: [],
      arr: false,
      appr: '',
      qnhAppr: null,
      tempAppr: null,
      windAppr: '',
      mda: null,
      dh: null,
      ldgConf: 4,
    },
    fcu: {
      spd: 100,
      spdManaged: false,
      hdg: GEO.standHdg,
      hdgManaged: false,
      alt: 100,
      vs: 0,
      baro: 1013,
      baroStd: false,
      fd: false,
      ls: false,
      loc: false,
      appr: false,
      exped: false,
      efis: { cstr: false, wpt: false, vord: false, ndb: false, arpt: false },
    },
    radio: { active: 122800, stby: 121500, xpdrCode: '2000', xpdrEntry: '', ident: 0 },
    gnd: {
      phase: 'gate',
      gpu: false,
      gpuTimer: 0,
      gpuTarget: null,
      chocks: true,
      doors: { L1: true, L2: false, R1: false, R2: false, FWD: true, AFT: true, BULK: false },
      doorTimer: 0,
      slidesArmed: false,
      boarding: 0.15,
      tow: true,
      pushStage: 'none',
      pushDist: 0,
      headset: true,
      cabinReady: false,
      cabinReadyTimer: 0,
      taxiPath: 0,
    },
    atc: {
      atis: false,
      atisLetter: letters[Math.floor(r() * letters.length)],
      qnh,
      oat,
      windDir,
      windSpd,
      clearance: false,
      squawk,
      initAlt: SCN.initAlt,
      pushApproved: false,
      taxiClear: false,
      lineupClear: false,
      toClear: false,
      contactTower: false,
      pending: [],
      appClear: false,
      ldgClear: false,
      taxiInClear: false,
      arrAtis: false,
      arrQnh: 1002 + Math.round(r() * 24),
      arrLetter: letters[Math.floor(r() * letters.length)],
      arrWindDir: 40 + Math.round(r() * 5) * 10,
      arrWindSpd: 3 + Math.round(r() * 9),
    },
    ecam: {
      active: [],
      masterWarn: false,
      masterCaut: false,
      sdPage: 'DOOR',
      sdManual: '',
      toConfigPressed: -100,
      toConfigOk: false,
      toConfigTested: false,
      phase: 1,
      firstEngStartT: -1,
      stsPressed: false,
      recall: -100,
      emerCanc: new Set(),
      test: { apu: false, eng1: false, eng2: false },
    },
    ann: {},
    flags: {},
    oat,
    elev: geo.elev,
    rwyLen: geo.rwyLen,
    rwyHdg: geo.rwyHdg,
    result: '',
    resultReason: '',
    momentary: {},
    keys: {},
    seed,
    failures: fails,
    fma: { thr: '', vert: '', lat: '', col5: '', lvrClb: false, vArm: '', lArm: '', cat: '' },
    fdPitch: null,
  };
  if (has('hotStart')) st.eng[r() < 0.5 ? 0 : 1].failPending = 'HOT';
  if (has('noLight')) st.eng[r() < 0.5 ? 0 : 1].failPending = 'NOLIGHT';
  if (has('elacFault')) st.flags.elacFault = true;
  if (has('pack1')) st.flags.pack1FaultPending = true;
  if (has('engFire')) st.flags.engFirePending = r() < 0.5 ? 1 : 2;
  const ef = fails.find((f) => f.id === 'toEngFail');
  if (ef) {
    st.flags.toEngFailSpd = ef.at;
    st.flags.toEngFailEng = r() < 0.5 ? 1 : 2;
  }
  if (scn === 'arr') setupArrival(st, 'start');
  if (type === 'c172') {
    st.c.com = 122500;
    st.c.comStby = SCN_C172.freqs.ATIS;
    st.c.hdgBug = geo.rwyHdg;
    st.gnd.headset = false;
    st.gnd.chocks = false;
    st.gnd.tow = false;
    st.gnd.boarding = 1;
    st.ac.gw = 1100;
    st.fms.thrRed = geo.elev;
  }
  return st;
}
