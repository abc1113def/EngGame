export type Lang = 'ru' | 'en';
/** Локализованная строка */
export interface L {
  ru: string;
  en: string;
}

export type ViewId = 'ovhd' | 'front' | 'ped' | 'out' | 'c172' | 'walk';
export type AircraftType = 'a320' | 'c172';
export type Scenario = 'dep' | 'arr' | 'full' | 'pattern';

export type FailureLevel = 'off' | 'light' | 'full';

export interface Settings {
  lang: Lang;
  sound: boolean;
  volume: number;
  failures: FailureLevel;
  fastAlign: boolean;
  guide?: boolean;
  /** чек-листы обязательны */
  checklists?: boolean;
  /** экранный пульт управления открыт */
  pad?: boolean;
}

export type IgnSel = '' | 'A' | 'B' | 'AB';

export type EngPhase =
  | 'off'
  | 'crank' // стартер крутит, топлива нет
  | 'fuel' // топливо подано, ждём воспламенения
  | 'accel' // горит, разгон до малого газа
  | 'run'
  | 'abort' // FADEC прервал запуск, сухая прокрутка
  | 'shutdown';

export interface EngineState {
  n1: number;
  n2: number;
  egt: number;
  ff: number; // кг/ч
  oilP: number;
  oilT: number;
  oilQ: number;
  vibN1: number;
  vibN2: number;
  startValve: boolean;
  ign: IgnSel;
  lastIgn: 'A' | 'B';
  hpValve: boolean;
  lpValve: boolean;
  phase: EngPhase;
  timer: number; // универсальный таймер фазы
  lightoff: number; // задержка воспламенения
  running: boolean;
  availTimer: number;
  peakEgt: number;
  startFault: '' | 'EGT' | 'IGN' | 'STARTER';
  failPending: '' | 'HOT' | 'NOLIGHT'; // отказ при следующем запуске
  failed: boolean; // срыв пламени / отказ
  fire: boolean;
  fireOut: boolean;
  agent1: boolean; // разряжен
  agent2: boolean;
  fuelUsed: number;
  rev: number; // 0..1 реверс
  manualStart: boolean;
}

export interface ApuState {
  n: number;
  egt: number;
  flap: number; // 0..1
  startReq: boolean;
  starting: boolean;
  avail: boolean;
  availTimer: number;
  bleedUsed: number; // время с момента использования отбора
  cooldown: number;
  fault: boolean;
  failPending: boolean;
  startTime: number;
  fuelUsed: number;
  shutdownReason: string;
}

export type AcSrc = '' | 'GEN1' | 'GEN2' | 'APU' | 'EXT';

export interface ElecState {
  bat: [BatState, BatState];
  ac1: AcSrc;
  ac2: AcSrc;
  acEss: boolean;
  dc1: boolean;
  dc2: boolean;
  dcBat: boolean;
  dcEss: boolean;
  tr1: boolean;
  tr2: boolean;
  gen1: boolean;
  gen2: boolean;
  apuGen: boolean;
  ext: boolean;
  idg1Disc: boolean;
  idg2Disc: boolean;
  loads: { gen1: number; gen2: number; apu: number; ext: number };
  lostPower: boolean;
}

export interface BatState {
  charge: number; // 0..1
  v: number;
  a: number; // + заряд, - разряд
}

export interface FuelState {
  left: number;
  center: number;
  right: number;
  press: { L1: boolean; L2: boolean; C1: boolean; C2: boolean; R1: boolean; R2: boolean };
  xfeed: number; // 0..1 положение крана
  ctrRun: number; // таймер работы центральных насосов
  used: number;
}

export interface BleedState {
  apuValve: boolean;
  xbleed: boolean;
  eng1Valve: boolean;
  eng2Valve: boolean;
  leftPsi: number;
  rightPsi: number;
  pack1: boolean;
  pack2: boolean;
  pack1Flow: number;
  pack2Flow: number;
  cabin: { ckpt: number; fwd: number; aft: number };
  pack1Fault: boolean;
}

export interface HydState {
  g: number;
  b: number;
  y: number;
  ptu: boolean;
  accu: number;
  brkL: number;
  brkR: number;
}

export interface IrState {
  powered: boolean;
  progress: number; // секунды выставки
  aligned: boolean;
  aligning: boolean;
  onBat: number; // таймер теста ON BAT
  fault: boolean; // сбой выставки (движение)
  att: boolean;
}

export interface AdirsState {
  ir: [IrState, IrState, IrState];
  adr: [boolean, boolean, boolean];
  alignTime: number;
}

export type GroundPhase =
  | 'gate'
  | 'push'
  | 'pushdone'
  | 'taxi'
  | 'holding'
  | 'lineup'
  | 'runway'
  | 'airborne'
  | 'taxiin'
  | 'parked';

export interface AircraftState {
  onGround: boolean;
  gs: number; // м/с, вдоль пути (отрицательная = назад)
  ias: number; // узлы
  alt: number; // фт MSL (истинная)
  vs: number; // фт/мин
  pitch: number; // град
  roll: number;
  gamma: number; // град, угол траектории
  hdg: number; // град
  dist: number; // м вдоль маршрута
  x: number; // м, восток
  y: number; // м, север
  gw: number; // кг
  gear: number; // 0..1 (1 = выпущено)
  flaps: number; // фактическая конфигурация 0..4 (дробно при движении)
  slats: number;
  pitchTrim: number; // + UP
  rudTrim: number; // + R
  brakes: number; // ручное торможение 0..1
  autobrk: 0 | 1 | 2 | 3;
  autobrkActive: boolean;
  stickP: number; // -1..1 (+ на себя)
  stickR: number;
  rudder: number;
  fctlCheck: { up: boolean; dn: boolean; l: boolean; r: boolean; rl: boolean; rr: boolean };
  tailStrike: boolean;
  maxPitchGround: number;
  liftoffT: number;
  ap: boolean;
  athr: boolean;
  athrActive: boolean;
  gndSplrsArmed: boolean;
  spoilers: number;
  maxGs: number;
  overrun: boolean;
  stopped: boolean;
  landed: boolean;
  td: { vs: number; along: number; side: number; pitch: number; ias: number } | null;
  exit: number; // индекс схода с ВПП
}

export interface FmsState {
  page: string;
  scratch: string;
  msg: string;
  from: string;
  to: string;
  altn: string;
  fltNbr: string;
  ci: number | null;
  crzFl: number | null;
  crzTemp: number | null;
  posConfirmed: boolean;
  rwy: string;
  sid: string;
  tmpRwy: string;
  tmpSid: string;
  zfw: number | null;
  zfwcg: number | null;
  block: number | null;
  v1: number | null;
  vr: number | null;
  v2: number | null;
  flex: number | null;
  toFlaps: number | null;
  ths: number | null; // + UP
  transAlt: number;
  thrRed: number;
  accAlt: number;
  depScroll: number;
  route: string[];
  arr: boolean; // активен заход на посадку
  appr: string;
  qnhAppr: number | null;
  tempAppr: number | null;
  windAppr: string;
  mda: number | null;
  dh: number | null;
  ldgConf: 3 | 4;
}

export interface FcuState {
  spd: number;
  spdManaged: boolean;
  hdg: number;
  hdgManaged: boolean;
  alt: number;
  vs: number;
  baro: number;
  baroStd: boolean;
  fd: boolean;
  ls: boolean;
  loc: boolean;
  appr: boolean;
  exped: boolean;
  efis: { cstr: boolean; wpt: boolean; vord: boolean; ndb: boolean; arpt: boolean };
}

export interface RadioState {
  active: number; // кГц*1000: 123125 = 123.125
  stby: number;
  xpdrCode: string;
  xpdrEntry: string;
  ident: number;
}

export interface Doors {
  L1: boolean;
  L2: boolean;
  R1: boolean;
  R2: boolean;
  FWD: boolean;
  AFT: boolean;
  BULK: boolean;
}

export interface GroundState {
  phase: GroundPhase;
  gpu: boolean;
  gpuTimer: number;
  gpuTarget: boolean | null;
  chocks: boolean;
  doors: Doors; // true = открыта
  doorTimer: number;
  slidesArmed: boolean;
  boarding: number; // 0..1
  tow: boolean;
  pushStage: 'none' | 'wait-brake' | 'pushing' | 'wait-park' | 'connected-wait' | 'done';
  pushDist: number;
  headset: boolean;
  cabinReady: boolean;
  cabinReadyTimer: number;
  taxiPath: number; // м до предварительного старта
}

export interface AtcState {
  atis: boolean;
  atisLetter: string;
  qnh: number;
  oat: number;
  windDir: number;
  windSpd: number;
  clearance: boolean;
  squawk: string;
  initAlt: number;
  pushApproved: boolean;
  taxiClear: boolean;
  lineupClear: boolean;
  toClear: boolean;
  contactTower: boolean;
  pending: { at: number; unit: string; msg: L; apply?: string }[];
  // прилёт
  appClear: boolean;
  ldgClear: boolean;
  taxiInClear: boolean;
  arrAtis: boolean;
  arrQnh: number;
  arrLetter: string;
  arrWindDir: number;
  arrWindSpd: number;
}

export type EcamLevel = 'warn' | 'caut';

export interface EcamActive {
  id: string;
  level: EcamLevel;
  since: number;
  cleared: boolean;
  acked: boolean;
}

export interface EcamState {
  active: EcamActive[];
  masterWarn: boolean;
  masterCaut: boolean;
  sdPage: string; // текущая автоматическая страница
  sdManual: string; // ручной выбор ('' = авто)
  toConfigPressed: number;
  toConfigOk: boolean;
  toConfigTested: boolean;
  phase: number; // фаза FWC 1..10
  firstEngStartT: number;
  stsPressed: boolean;
  recall: number;
  emerCanc: Set<string>;
  test: { apu: boolean; eng1: boolean; eng2: boolean };
}

export interface Flags {
  [k: string]: number | boolean | string | undefined;
}

export interface SimState {
  type: AircraftType;
  scn: Scenario;
  leg: 'dep' | 'arr';
  geo: import('./scenario').AirportGeo;
  c: import('./c172/types').C172State;
  t: number;
  sw: Record<string, number>;
  eng: [EngineState, EngineState];
  apu: ApuState;
  elec: ElecState;
  fuel: FuelState;
  bleed: BleedState;
  hyd: HydState;
  adirs: AdirsState;
  ac: AircraftState;
  fms: FmsState;
  fcu: FcuState;
  radio: RadioState;
  gnd: GroundState;
  atc: AtcState;
  ecam: EcamState;
  ann: Record<string, number>; // биты: 1 верхняя, 2 нижняя, 4 мигает
  flags: Flags;
  oat: number;
  elev: number;
  rwyLen: number;
  rwyHdg: number;
  result: '' | 'success' | 'rto' | 'fail' | 'fire' | 'secured';
  resultReason: string;
  momentary: Record<string, boolean>; // удерживаемые кнопки
  keys: Record<string, boolean>;
  seed: number;
  failures: { id: string; at?: number; done?: boolean }[];
  fma: { thr: string; vert: string; lat: string; col5: string; lvrClb: boolean; vArm: string; lArm: string; cat: string };
  fdPitch: number | null;
}
