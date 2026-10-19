/** Состояние систем Cessna 172S (Lycoming IO-360, «классические» приборы) */
export interface C172State {
  // двигатель
  rpm: number;
  running: boolean;
  starter: boolean;
  crankT: number; // непрерывная прокрутка, с
  starterHot: number; // перегрев стартера 0..1
  prime: number; // топливо во впуске (0 — сухо, ~1 — норма, >1.6 — перелив)
  fired: number; // таймер «схватывания»
  oilP: number; // psi
  oilT: number; // °F
  cht: number; // °F
  egt: number; // °F
  ff: number; // gph
  magDrop: number; // текущий спад оборотов от магнето
  // электрика
  battV: number;
  battCharge: number; // 0..1
  busV: number;
  amps: number;
  altOnline: boolean;
  // топливо (галлоны)
  fuelL: number;
  fuelR: number;
  // вакуум и гироскопы
  vac: number;
  aiSpin: number; // 0..1
  hiSpin: number;
  hiErr: number; // ошибка курсовой системы относительно компаса, °
  hdgBug: number;
  baro: number; // inHg
  obs: number;
  // механизация
  flaps: number; // градусы фактические
  trim: number; // -1..1 (+ нос вверх)
  stallHorn: boolean;
  // радио
  com: number; // кГц*1000
  comStby: number;
  xpdrCode: string;
  // автопилот (KAP 140, упрощённо)
  ap: boolean;
  apHdg: boolean;
  apAlt: boolean;
  apAltTgt: number;
  // предполётный осмотр
  pre: {
    lock: boolean; // струбцина рулей установлена
    pitotCover: boolean;
    tiedowns: boolean;
    chocks: boolean;
    fuelChecked: boolean;
    sumpWater: number; // сколько раз ещё нужно слить отстой
    sumpDone: boolean;
    oilQt: number;
    oilChecked: boolean;
    doors: boolean; // закрыты
    walk: boolean;
  };
  // разное
  annTest: boolean;
  failMag: '' | 'L' | 'R';
  failOil: boolean;
  failAlt: boolean;
  flooded: boolean;
  hobbs: number;
}
