import { tlaDetent } from './engines';
import { vfe } from './flight';
import { alignMinutes, annPower, type Emit } from './systems';
import type { EcamLevel, SimState } from './types';

export interface EcamAction {
  t: string;
  done: boolean;
}
export interface EcamDef {
  id: string;
  level: EcamLevel;
  sys: string; // подчёркнутая часть заголовка
  title: string;
  sub?: (s: SimState) => string;
  cond: (s: SimState) => boolean;
  actions?: (s: SimState) => EcamAction[];
  page?: string;
  phases?: number[]; // в каких фазах FWC допускается
  inop?: string[];
}

const dots = (a: string, b: string) => a + '.'.repeat(Math.max(2, 22 - a.length - b.length)) + b;
const act = (a: string, b: string, done: boolean): EcamAction => ({ t: dots(a, b), done });

export const toPower = (s: SimState) => {
  const a = tlaDetent(s.sw.TL1);
  const b = tlaDetent(s.sw.TL2);
  return s.ac.onGround && (a === 'FLX' || a === 'TOGA' || b === 'FLX' || b === 'TOGA');
};
const toTest = (s: SimState) => s.t - s.ecam.toConfigPressed < 5;
const cfgCheck = (s: SimState) => toPower(s) || toTest(s);
const anyRunning = (s: SimState) => s.eng[0].running || s.eng[1].running;

function fireDef(n: 1 | 2): EcamDef {
  const i = n - 1;
  return {
    id: `ENG${n}_FIRE`,
    level: 'warn',
    sys: `ENG ${n}`,
    title: `ENG ${n} FIRE`,
    cond: (s) => s.eng[i].fire || s.ecam.test[`eng${n}` as 'eng1'],
    page: 'ENG',
    actions: (s) =>
      s.eng[i].fire
        ? [
            act('THR LEVERS', 'IDLE', s.sw.TL1 <= 0.5 && s.sw.TL2 <= 0.5),
            act('PARKING BRK', 'ON', s.sw.PARK_BRK === 1),
            act('ATC', 'NOTIFY', !!s.flags.atcNotified),
            act('CABIN CREW(PA)', 'ALERT', !!s.flags.cabinAlerted),
            act(`ENG MASTER ${n}`, 'OFF', s.sw[`ENG${n}_MASTER`] === 0),
            act(`ENG ${n} FIRE P/B`, 'PUSH', s.sw[`ENG${n}_FIRE`] === 1),
            act('AGENT 1+2', 'DISCH', s.eng[i].agent1 && s.eng[i].agent2),
            act('EMER EVAC PROC', 'APPLY', !!s.flags.evacApplied),
          ]
        : [],
  };
}

function startFault(n: 1 | 2): EcamDef {
  const i = n - 1;
  return {
    id: `ENG${n}_START_FAULT`,
    level: 'caut',
    sys: `ENG ${n}`,
    title: `ENG ${n} START FAULT`,
    sub: (s) => ({ EGT: 'EGT OVERLIMIT', IGN: 'IGN FAULT', STARTER: 'START VALVE FAULT', '': '' })[s.eng[i].startFault],
    cond: (s) => s.eng[i].startFault !== '',
    page: 'ENG',
    actions: (s) => {
      const a = [act(`ENG MASTER ${n}`, 'OFF', s.sw[`ENG${n}_MASTER`] === 0)];
      if (s.eng[i].manualStart) a.push(act(`MAN START ${n}`, 'OFF', s.sw[`ENG${n}_MAN_START`] === 0));
      return a;
    },
  };
}

function engFail(n: 1 | 2): EcamDef {
  const i = n - 1;
  return {
    id: `ENG${n}_FAIL`,
    level: 'caut',
    sys: `ENG ${n}`,
    title: `ENG ${n} FAIL`,
    cond: (s) => s.eng[i].failed,
    page: 'ENG',
    phases: [1, 2, 3, 6, 8, 9],
    actions: (s) => [
      act('ENG MODE SEL', 'IGN', s.sw.ENG_MODE === 2),
      act(`THR LEVER ${n}`, 'IDLE', s.sw[`TL${n}`] <= 0.5),
      act(`ENG MASTER ${n}`, 'OFF', s.sw[`ENG${n}_MASTER`] === 0),
    ],
    inop: [`ENG ${n}`],
  };
}

function door(id: string, name: string): EcamDef {
  return {
    id: `DOOR_${id}`,
    level: 'caut',
    sys: 'DOOR',
    title: `DOOR ${name}`,
    cond: (s) => s.gnd.doors[id as 'L1'] && (anyRunning(s) || cfgCheck(s)),
    page: 'DOOR',
    phases: [1, 2, 3],
  };
}

function pumps(side: 'L' | 'R'): EcamDef {
  const i = side === 'L' ? 0 : 1;
  return {
    id: `FUEL_${side}_LOPR`,
    level: 'caut',
    sys: 'FUEL',
    title: `FUEL ${side} TK PUMP 1+2 LO PR`,
    cond: (s) => {
      const f = s.fuel.press;
      const ctr = f.C1 || f.C2;
      return s.eng[i].running && !ctr && !(side === 'L' ? f.L1 || f.L2 : f.R1 || f.R2);
    },
    page: 'FUEL',
    phases: [2, 3, 6, 8, 9],
  };
}

function hydLo(sys: 'G' | 'B' | 'Y'): EcamDef {
  return {
    id: `HYD_${sys}_LO`,
    level: 'caut',
    sys: 'HYD',
    title: `HYD ${sys} SYS LO PR`,
    cond: (s) => {
      const p = sys === 'G' ? s.hyd.g : sys === 'B' ? s.hyd.b : s.hyd.y;
      const eng = sys === 'G' ? s.eng[0] : sys === 'Y' ? s.eng[1] : s.eng[0].running ? s.eng[0] : s.eng[1];
      return eng.running && eng.availTimer <= 0 && p < 1450;
    },
    page: 'HYD',
    phases: [2, 3, 6, 8, 9],
    inop: [`${sys} HYD`],
  };
}

export const ECAM_DEFS: EcamDef[] = [
  fireDef(1),
  fireDef(2),
  {
    id: 'APU_FIRE',
    level: 'warn',
    sys: 'APU',
    title: 'APU FIRE',
    cond: (s) => s.ecam.test.apu,
    page: 'APU',
  },
  {
    id: 'CFG_FLAPS',
    level: 'warn',
    sys: 'CONFIG',
    title: 'CONFIG',
    sub: () => 'FLAPS NOT IN T.O CONFIG',
    cond: (s) => cfgCheck(s) && (s.sw.FLAPS === 0 || s.sw.FLAPS === 4 || s.ac.slats < 17 || s.ac.flaps < 9),
    phases: [1, 2, 3],
  },
  {
    id: 'CFG_PITCH',
    level: 'warn',
    sys: 'CONFIG',
    title: 'CONFIG',
    sub: () => 'PITCH TRIM NOT IN T.O RANGE',
    cond: (s) => cfgCheck(s) && (s.ac.pitchTrim > 3.6 || s.ac.pitchTrim < -2.5),
    phases: [1, 2, 3],
  },
  {
    id: 'CFG_SPDBRK',
    level: 'warn',
    sys: 'CONFIG',
    title: 'CONFIG',
    sub: () => 'SPD BRK NOT RETRACTED',
    cond: (s) => cfgCheck(s) && s.sw.SPD_BRK >= 2,
    phases: [1, 2, 3],
  },
  {
    id: 'CFG_RUD',
    level: 'warn',
    sys: 'CONFIG',
    title: 'CONFIG',
    sub: () => 'RUD TRIM NOT IN T.O RANGE',
    cond: (s) => cfgCheck(s) && Math.abs(s.ac.rudTrim) > 3.6,
    phases: [1, 2, 3],
  },
  {
    id: 'CFG_PARK',
    level: 'warn',
    sys: 'CONFIG',
    title: 'CONFIG PARK BRK ON',
    cond: (s) => toPower(s) && s.sw.PARK_BRK === 1,
    phases: [2, 3, 4],
  },
  {
    id: 'OVERSPEED',
    level: 'warn',
    sys: 'OVER',
    title: 'OVERSPEED',
    sub: (s) => `VFE.................${vfe(s)}`,
    cond: (s) => !s.ac.onGround && s.ac.ias > vfe(s) + 4,
  },
  startFault(1),
  startFault(2),
  engFail(1),
  engFail(2),
  {
    id: 'APU_AUTO_SD',
    level: 'caut',
    sys: 'APU',
    title: 'APU AUTO SHUT DOWN',
    cond: (s) => s.apu.fault,
    page: 'APU',
    actions: (s) => [act('MASTER SW', 'OFF', s.sw.APU_MASTER === 0)],
    inop: ['APU'],
  },
  {
    id: 'PITCH_DISAGREE',
    level: 'caut',
    sys: 'F/CTL',
    title: 'F/CTL PITCH TRIM/MCDU/CG DISAGREE',
    cond: (s) => cfgCheck(s) && s.fms.ths != null && Math.abs(s.ac.pitchTrim - s.fms.ths) > 0.6,
    page: 'F/CTL',
    phases: [1, 2, 3],
  },
  {
    id: 'FLAP_DISAGREE',
    level: 'caut',
    sys: 'F/CTL',
    title: 'F/CTL FLAP/MCDU DISAGREE',
    cond: (s) => cfgCheck(s) && s.fms.toFlaps != null && s.sw.FLAPS !== s.fms.toFlaps && s.sw.FLAPS !== 0,
    phases: [1, 2, 3],
  },
  {
    id: 'TO_SPEEDS',
    level: 'caut',
    sys: 'T.O',
    title: 'T.O SPEEDS NOT INSERTED',
    cond: (s) => cfgCheck(s) && (s.fms.v1 == null || s.fms.vr == null || s.fms.v2 == null),
    phases: [1, 2, 3],
  },
  {
    id: 'FLEX_NOT_SET',
    level: 'caut',
    sys: 'ENG',
    title: 'ENG FLEX TEMP NOT SET',
    cond: (s) => s.ac.onGround && (tlaDetent(s.sw.TL1) === 'FLX' || tlaDetent(s.sw.TL2) === 'FLX') && s.fms.flex == null,
    phases: [2, 3],
  },
  door('L1', 'L FWD CABIN'),
  door('FWD', 'FWD CARGO'),
  door('AFT', 'AFT CARGO'),
  pumps('L'),
  pumps('R'),
  {
    id: 'PACK1_FAULT',
    level: 'caut',
    sys: 'AIR',
    title: 'AIR PACK 1 FAULT',
    cond: (s) => s.bleed.pack1Fault,
    page: 'BLEED',
    phases: [1, 2, 3, 6, 8, 9],
    actions: (s) => [act('PACK 1', 'OFF', s.sw.PACK1 === 0)],
    inop: ['PACK 1'],
  },
  hydLo('G'),
  hydLo('Y'),
  hydLo('B'),
  {
    id: 'ELAC1_FAULT',
    level: 'caut',
    sys: 'F/CTL',
    title: 'F/CTL ELAC 1 FAULT',
    cond: (s) => !!s.flags.elacFault && annPower(s) && s.t > ((s.flags.powerOnT as number) ?? 1e9) + 8,
    page: 'F/CTL',
    actions: (s) => [act('ELAC 1', 'OFF THEN ON', s.sw.ELAC1 === 1 && !!s.flags.elacCycled)],
    inop: ['ELAC 1'],
  },
  {
    id: 'GEN1_FAULT',
    level: 'caut',
    sys: 'ELEC',
    title: 'ELEC GEN 1 FAULT',
    cond: (s) => s.elec.idg1Disc && s.eng[0].running,
    page: 'ELEC',
    inop: ['GEN 1'],
  },
  {
    id: 'GEN2_FAULT',
    level: 'caut',
    sys: 'ELEC',
    title: 'ELEC GEN 2 FAULT',
    cond: (s) => s.elec.idg2Disc && s.eng[1].running,
    page: 'ELEC',
    inop: ['GEN 2'],
  },
];
export const ECAM_BY_ID: Record<string, EcamDef> = Object.fromEntries(ECAM_DEFS.map((d) => [d.id, d]));

// ============================ фазы FWC ============================
function fwcPhase(s: SimState): number {
  const ac = s.ac;
  if (!ac.onGround) return ac.alt - s.elev < 1500 && !s.flags.passed1500 ? 5 : 6;
  if (s.flags.toPowerSet && !toPower(s) && ac.liftoffT === 0) {
    return ac.ias > 80 ? 8 : s.ac.stopped ? 9 : 8;
  }
  if (toPower(s)) return ac.ias >= 80 ? 4 : 3;
  if (ac.ias >= 80 && s.flags.toPowerSet) return 4;
  if (anyRunning(s)) return 2;
  return 1;
}

export function updEcam(s: SimState, dt: number, emit: Emit) {
  const ec = s.ecam;
  const pwr = annPower(s);
  ec.phase = fwcPhase(s);
  if (!s.ac.onGround && s.ac.alt - s.elev >= 1500) s.flags.passed1500 = true;
  if (anyRunning(s) && ec.firstEngStartT < 0) ec.firstEngStartT = s.t;
  ec.test.apu = !!s.momentary.APU_FIRE_TEST && pwr;
  ec.test.eng1 = !!s.momentary.ENG1_FIRE_TEST && pwr;
  ec.test.eng2 = !!s.momentary.ENG2_FIRE_TEST && pwr;

  const now = new Set<string>();
  if (pwr) {
    for (const d of ECAM_DEFS) {
      if (d.phases && !d.phases.includes(ec.phase)) continue;
      // предупреждения ПОС и тестовые проверки не подавляются; остальные — в фазах 4/5
      if ((ec.phase === 4 || ec.phase === 5) && d.level === 'caut') continue;
      if (ec.emerCanc.has(d.id)) continue;
      if (d.cond(s)) now.add(d.id);
    }
  }
  // удалить исчезнувшие
  ec.active = ec.active.filter((a) => now.has(a.id));
  for (const id of now) {
    if (!ec.active.some((a) => a.id === id)) {
      const d = ECAM_BY_ID[id];
      ec.active.push({ id, level: d.level, since: s.t, cleared: false, acked: false });
      if (d.level === 'warn') ec.masterWarn = true;
      else ec.masterCaut = true;
      emit({ type: 'ecam', id, level: d.level });
    }
  }
  // сортировка: предупреждения выше
  ec.active.sort((a, b) => (a.level === b.level ? a.since - b.since : a.level === 'warn' ? -1 : 1));
  if (!ec.active.some((a) => a.level === 'warn' && !a.acked)) ec.masterWarn = false;
  s.flags.crc = ec.active.some((a) => a.level === 'warn' && !a.acked);
  if (!pwr) {
    ec.masterWarn = false;
    ec.masterCaut = false;
  }
  void dt;
}

export function pressMasterWarn(s: SimState) {
  s.ecam.masterWarn = false;
  for (const a of s.ecam.active) if (a.level === 'warn') a.acked = true;
}
export function pressMasterCaut(s: SimState) {
  s.ecam.masterCaut = false;
  for (const a of s.ecam.active) if (a.level === 'caut') a.acked = true;
}
export function pressClr(s: SimState) {
  if (s.ecam.sdManual === 'STS') {
    s.ecam.sdManual = '';
    return;
  }
  const top = s.ecam.active.find((a) => !a.cleared);
  if (top) {
    top.cleared = true;
    top.acked = true;
    if (!s.ecam.active.some((a) => !a.cleared) && s.ecam.active.some((a) => ECAM_BY_ID[a.id].inop)) s.ecam.sdManual = 'STS';
  } else if (s.ecam.sdManual) s.ecam.sdManual = '';
}
export function pressEmerCanc(s: SimState) {
  const top = s.ecam.active.find((a) => !a.cleared);
  if (!top) return;
  if (top.level === 'warn') {
    top.acked = true;
    s.ecam.masterWarn = false;
  } else {
    s.ecam.emerCanc.add(top.id);
  }
}

export const clrLit = (s: SimState) => s.ecam.active.some((a) => !a.cleared) || s.ecam.sdManual === 'STS';

// ============================ мемо ============================
export interface MemoLine {
  t: string;
  c: 'green' | 'blue' | 'amber' | 'white' | 'red' | 'magenta';
}

export function toMemoVisible(s: SimState) {
  const ec = s.ecam;
  if (ec.phase !== 2) return false;
  return (ec.firstEngStartT >= 0 && s.eng[0].running && s.eng[1].running && s.t - (s.flags.bothRunningT as number) > 120) || s.t - ec.toConfigPressed < 120 || !!s.flags.toMemoShown;
}

export function leftMemo(s: SimState): MemoLine[] {
  if (!toMemoVisible(s)) return [];
  s.flags.toMemoShown = true;
  const ab = s.ac.autobrk === 3;
  const signs = s.sw.SEAT_BELTS === 1 && s.sw.NO_SMOKING > 0;
  const splrs = s.ac.gndSplrsArmed;
  const flaps = s.sw.FLAPS >= 1 && s.sw.FLAPS <= 3 && s.ac.slats > 17;
  const L: MemoLine[] = [];
  L.push(ab ? { t: 'T.O AUTO BRK MAX', c: 'green' } : { t: 'T.O AUTO BRK.....MAX', c: 'blue' });
  L.push(signs ? { t: '    SIGNS ON', c: 'green' } : { t: '    SIGNS.........ON', c: 'blue' });
  L.push(s.gnd.cabinReady ? { t: '    CABIN READY', c: 'green' } : { t: '    CABIN......CHECK', c: 'blue' });
  L.push(splrs ? { t: '    SPLRS ARM', c: 'green' } : { t: '    SPLRS........ARM', c: 'blue' });
  L.push(flaps ? { t: '    FLAPS T.O', c: 'green' } : { t: '    FLAPS........T.O', c: 'blue' });
  L.push(s.ecam.toConfigOk ? { t: '    T.O CONFIG NORMAL', c: 'green' } : { t: '    T.O CONFIG..TEST', c: 'blue' });
  return L;
}

export function rightMemo(s: SimState): MemoLine[] {
  const R: MemoLine[] = [];
  const ph = s.ecam.phase;
  if (ph >= 3 && ph <= 5) R.push({ t: 'T.O INHIBIT', c: 'magenta' });
  const m = alignMinutes(s);
  const alignFault = s.adirs.ir.some((ir) => ir.fault);
  if (alignFault) R.push({ t: 'IRS ALIGN FAULT', c: 'amber' });
  else if (s.adirs.ir.some((ir) => ir.aligning)) {
    const waiting = s.adirs.ir.some((ir) => ir.aligning && ir.progress >= s.adirs.alignTime);
    R.push({ t: waiting ? 'IRS IN ALIGN' : `IRS IN ALIGN ${m} MN`, c: anyRunning(s) || waiting ? 'amber' : 'green' });
  }
  if (s.gnd.tow) R.push({ t: 'NW STRG DISC', c: anyRunning(s) ? 'amber' : 'green' });
  if (s.eng.some((e) => e.ign !== '') || s.sw.ENG_MODE === 2) R.push({ t: 'IGNITION', c: 'green' });
  if (s.sw.SEAT_BELTS === 1) R.push({ t: 'SEAT BELTS', c: 'green' });
  if (s.sw.NO_SMOKING > 0) R.push({ t: 'NO SMOKING', c: 'green' });
  if (s.ac.gndSplrsArmed && ph >= 2) R.push({ t: 'GND SPLRS ARMED', c: 'green' });
  if (s.apu.avail && s.ecam.phase <= 2) R.push({ t: 'APU AVAIL', c: 'green' });
  if (s.bleed.apuValve) R.push({ t: 'APU BLEED', c: 'green' });
  if (s.hyd.ptu) R.push({ t: 'HYD PTU', c: 'green' });
  if (s.sw.PARK_BRK === 1 && s.ac.onGround) R.push({ t: 'PARK BRK', c: anyRunning(s) && toPower(s) ? 'amber' : 'green' });
  if (s.sw.ENG1_AI || s.sw.ENG2_AI) R.push({ t: 'ENG A.ICE', c: 'green' });
  if (s.sw.WING_AI) R.push({ t: 'WING A.ICE', c: 'green' });
  if (s.fuel.xfeed > 0.5) R.push({ t: 'FUEL X FEED', c: 'green' });
  if (s.sw.HYD_RAT) R.push({ t: 'RAT OUT', c: 'green' });
  if (!s.ac.onGround && s.sw.STROBE === 0) R.push({ t: 'STROBE LT OFF', c: 'green' });
  if (s.sw.BRK_FAN) R.push({ t: 'BRK FAN', c: 'green' });
  return R.slice(0, 7);
}

export function ecamLines(s: SimState): { t: string; c: MemoLine['c']; u?: number }[] {
  const out: { t: string; c: MemoLine['c']; u?: number }[] = [];
  for (const a of s.ecam.active) {
    if (a.cleared) continue;
    const d = ECAM_BY_ID[a.id];
    const col = d.level === 'warn' ? 'red' : 'amber';
    out.push({ t: d.title, c: col, u: d.sys.length });
    const sub = d.sub?.(s);
    if (sub) out.push({ t: sub, c: col });
    const acts = d.actions?.(s) ?? [];
    for (const x of acts) if (!x.done) out.push({ t: ' -' + x.t, c: 'blue' });
    if (out.length > 7) break;
  }
  return out.slice(0, 7);
}

// ============================ страницы SD ============================
export function autoSdPage(s: SimState): string {
  const ec = s.ecam;
  const top = ec.active.find((a) => !a.cleared && ECAM_BY_ID[a.id].page);
  if (top) return ECAM_BY_ID[top.id].page!;
  const starting = s.eng.some((e) => ['crank', 'fuel', 'accel', 'abort'].includes(e.phase));
  if (starting || (s.sw.ENG_MODE === 2 && ec.phase <= 2)) return 'ENG';
  if (s.sw.APU_MASTER === 1 && (s.apu.starting || !s.apu.avail || s.t - ((s.flags.apuAvailT as number) ?? -99) < 10) && ec.phase <= 2) return 'APU';
  if (ec.phase === 1) return 'DOOR';
  if (ec.phase === 2) return s.t - ((s.flags.fctlMoveT as number) ?? -99) < 20 ? 'F/CTL' : 'WHEEL';
  if (ec.phase >= 3 && ec.phase <= 5) return 'ENG';
  if (ec.phase >= 8) return 'WHEEL';
  return 'CRUISE';
}

export function sdPage(s: SimState) {
  return s.ecam.sdManual || autoSdPage(s);
}

export function pressPage(s: SimState, page: string) {
  if (page === 'ALL') {
    const pages = ['ENG', 'BLEED', 'PRESS', 'ELEC', 'HYD', 'FUEL', 'APU', 'COND', 'DOOR', 'WHEEL', 'F/CTL'];
    const cur = sdPage(s);
    const i = pages.indexOf(cur);
    s.ecam.sdManual = pages[(i + 1) % pages.length];
    return;
  }
  s.ecam.sdManual = s.ecam.sdManual === page ? '' : page;
  if (page === 'STS') {
    s.flags.stsViewed = true;
    if (s.eng[0].running && s.eng[1].running) s.flags.stsAfter = true;
  }
}

export function pressToConfig(s: SimState, emit: Emit) {
  s.ecam.toConfigPressed = s.t;
  s.ecam.toConfigTested = true;
  const bad = ECAM_DEFS.filter(
    (d) => ['CFG_FLAPS', 'CFG_PITCH', 'CFG_SPDBRK', 'CFG_RUD', 'PITCH_DISAGREE', 'FLAP_DISAGREE', 'TO_SPEEDS', 'DOOR_L1', 'DOOR_FWD', 'DOOR_AFT'].includes(d.id) && d.cond(s),
  );
  s.ecam.toConfigOk = bad.length === 0;
  emit({ type: 'toConfig', ok: s.ecam.toConfigOk, bad: bad.map((b) => b.id) });
}

export function statusLines(s: SimState): { t: string; c: MemoLine['c'] }[] {
  const inop = new Set<string>();
  for (const a of s.ecam.active) for (const x of ECAM_BY_ID[a.id].inop ?? []) inop.add(x);
  const out: { t: string; c: MemoLine['c'] }[] = [];
  if (inop.size) {
    out.push({ t: 'INOP SYS', c: 'amber' });
    for (const x of inop) out.push({ t: x, c: 'amber' });
  }
  if (!out.length) out.push({ t: 'NORMAL', c: 'green' });
  return out;
}
