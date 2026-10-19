import { KT } from '../sim/flight';
import { SCN } from '../sim/scenario';
import { irOk } from '../sim/systems';
import type { L, SimState, ViewId } from '../sim/types';

export type PhaseId = 'emer' | 'power' | 'apu' | 'prep' | 'fms' | 'before' | 'start' | 'after' | 'taxi' | 'lineup' | 'takeoff';
export type StepKind = 'action' | 'check' | 'wait' | 'comm' | 'checklist';

export interface Step {
  id: string;
  phase: PhaseId;
  kind: StepKind;
  view?: ViewId | 'comms' | 'checklist' | 'mcdu';
  ctl?: string[];
  title: L;
  hint: L;
  done: (s: SimState) => boolean;
  show?: (s: SimState) => boolean;
  req?: string[];
  optional?: boolean;
  pen?: number;
}

export const PHASES: { id: PhaseId; name: L }[] = [
  { id: 'emer', name: { ru: 'Аварийная ситуация', en: 'Emergency' } },
  { id: 'power', name: { ru: '1. Подача питания', en: '1. Power up' } },
  { id: 'apu', name: { ru: '2. Запуск ВСУ', en: '2. APU start' } },
  { id: 'prep', name: { ru: '3. Подготовка кабины', en: '3. Cockpit preparation' } },
  { id: 'fms', name: { ru: '4. Программирование MCDU', en: '4. MCDU programming' } },
  { id: 'before', name: { ru: '5. Перед запуском', en: '5. Before start' } },
  { id: 'start', name: { ru: '6. Буксировка и запуск', en: '6. Pushback & engine start' } },
  { id: 'after', name: { ru: '7. После запуска', en: '7. After start' } },
  { id: 'taxi', name: { ru: '8. Руление', en: '8. Taxi' } },
  { id: 'lineup', name: { ru: '9. Исполнительный старт', en: '9. Line-up' } },
  { id: 'takeoff', name: { ru: '10. Взлёт', en: '10. Take-off' } },
];

const r = (ru: string, en: string): L => ({ ru, en });
const voc = (s: SimState, i: number) => 23.6 + 3.4 * s.elec.bat[i].charge;
const bothRun = (s: SimState) => s.eng[0].running && s.eng[1].running;
const anyFire = (s: SimState) => s.eng.some((e) => e.fire || e.fireOut);

export const STEPS: Step[] = [
  // ===================== АВАРИЯ: ПОЖАР =====================
  ...(['THR', 'PARK', 'ATC', 'CAB', 'MASTER', 'PB', 'AGENT', 'EVAC'] as const).map((k): Step => {
    const n = (s: SimState) => (s.eng[0].fire || s.eng[0].fireOut ? 1 : 2);
    const m: Record<string, Omit<Step, 'id' | 'phase' | 'show'>> = {
      THR: { kind: 'action', view: 'ped', ctl: ['TL1', 'TL2'], title: r('ПОЖАР: РУД — IDLE', 'FIRE: thrust levers IDLE'), hint: r('Клавиша F1 или перетащите РУД назад до упора.', 'Press F1 or drag levers to idle.'), done: (s) => s.sw.TL1 <= 0.5 && s.sw.TL2 <= 0.5 },
      PARK: { kind: 'action', view: 'ped', ctl: ['PARK_BRK'], title: r('ПОЖАР: стояночный тормоз — ON', 'FIRE: parking brake ON'), hint: r('Остановите самолёт и поставьте на стояночный тормоз.', 'Stop and set the parking brake.'), done: (s) => s.sw.PARK_BRK === 1 },
      ATC: { kind: 'comm', view: 'comms', title: r('ПОЖАР: сообщить диспетчеру (MAYDAY)', 'FIRE: notify ATC (MAYDAY)'), hint: r('Вкладка «Связь» → «Сообщить об аварии».', 'Comms tab → "Notify emergency".'), done: (s) => !!s.flags.atcNotified },
      CAB: { kind: 'comm', view: 'comms', title: r('ПОЖАР: PA — «Экипажу по местам»', 'FIRE: PA "Crew at stations"'), hint: r('Вкладка «Связь» → Салон → «Тревога».', 'Comms → Cabin → "Alert".'), done: (s) => !!s.flags.cabinAlerted },
      MASTER: { kind: 'action', view: 'ped', ctl: ['ENG1_MASTER', 'ENG2_MASTER'], title: r('ПОЖАР: ENG MASTER горящего двигателя — OFF', 'FIRE: affected ENG MASTER OFF'), hint: r('Красная лампа FIRE горит на панели ENG у нужного рычага.', 'The red FIRE light is lit next to the affected master.'), done: (s) => s.sw[`ENG${n(s)}_MASTER`] === 0 },
      PB: { kind: 'action', view: 'ovhd', ctl: ['ENG1_FIRE', 'ENG2_FIRE'], title: r('ПОЖАР: ENG FIRE P/B — PUSH', 'FIRE: ENG FIRE P/B PUSH'), hint: r('Откройте крышку (клик) и нажмите горящую красную кнопку.', 'Lift the guard (click) and push the lit red pushbutton.'), done: (s) => s.sw[`ENG${n(s)}_FIRE`] === 1 },
      AGENT: { kind: 'action', view: 'ovhd', ctl: ['ENG1_AGENT1', 'ENG1_AGENT2', 'ENG2_AGENT1', 'ENG2_AGENT2'], title: r('ПОЖАР: AGENT 1, затем AGENT 2 — DISCH', 'FIRE: AGENT 1 then AGENT 2 DISCH'), hint: r('Кнопки AGENT с надписью SQUIB. На земле разряжают оба баллона.', 'Press the AGENT buttons showing SQUIB. On ground discharge both.'), done: (s) => s.eng[n(s) - 1].agent1 && (s.eng[n(s) - 1].agent2 || s.eng[n(s) - 1].fireOut) },
      EVAC: { kind: 'comm', view: 'comms', title: r('ПОЖАР: эвакуация — по решению КВС', 'FIRE: evacuation as required'), hint: r('Если пожар не потушен — «Эвакуация». Если потушен — можно не эвакуировать.', 'If the fire persists — "Evacuate". If out — not required.'), done: (s) => !!s.flags.evacApplied || s.eng.every((e) => !e.fire), optional: true },
    };
    return { id: `fire_${k}`, phase: 'emer', show: anyFire, ...m[k] };
  }),
  {
    id: 'rto',
    phase: 'emer',
    kind: 'action',
    view: 'ped',
    ctl: ['TL1', 'TL2'],
    title: r('ОТКАЗ ДО V1: прервать взлёт — РУД IDLE, реверс', 'FAILURE BEFORE V1: reject — idle, reverse'),
    hint: r('F1 — малый газ, затем держите F2 для реверса. Автотормоз MAX затормозит сам. Остановитесь и сообщите диспетчеру.', 'F1 for idle, then hold F2 for reverse. Autobrake MAX stops you. Then notify ATC.'),
    show: (s) => s.eng.some((e) => e.failed) && (s.flags.engFailIas as number) < SCN.v1 && s.ac.liftoffT === 0,
    done: (s) => s.ac.stopped && s.ac.onGround,
  },
  {
    id: 'efail_go',
    phase: 'emer',
    kind: 'action',
    view: 'front',
    title: r('ОТКАЗ ПОСЛЕ V1: продолжить взлёт', 'FAILURE AFTER V1: continue'),
    hint: r('Не прерывайте! РУД — TOGA (F4), VR — подъём носа до ~12.5°, шасси убрать, следуйте директору (держит V2). Конец сценария — 1000 фт.', 'Do not reject! Levers TOGA (F4), rotate at VR to ~12.5°, gear up, follow the FD (holds V2). Scenario ends at 1000 ft.'),
    show: (s) => s.eng.some((e) => e.failed) && (s.flags.engFailIas as number) >= SCN.v1,
    done: (s) => !s.ac.onGround && s.ac.alt - s.elev > 1000,
  },

  // ===================== 1. ПИТАНИЕ =====================
  { id: 'chk_master', phase: 'power', kind: 'check', view: 'ped', ctl: ['ENG1_MASTER', 'ENG2_MASTER', 'ENG_MODE'], title: r('Проверить: ENG MASTER 1 и 2 — OFF, MODE — NORM', 'Check: ENG MASTER 1/2 OFF, MODE NORM'), hint: r('Перед подачей питания убедитесь, что двигатели не запустятся случайно.', 'Before power-up make sure engines cannot start inadvertently.'), done: (s) => s.sw.ENG1_MASTER === 0 && s.sw.ENG2_MASTER === 0 },
  { id: 'chk_gear', phase: 'power', kind: 'check', view: 'front', ctl: ['GEAR'], title: r('Проверить: рычаг шасси — DOWN', 'Check: gear lever DOWN'), hint: r('Рычаг шасси на центральной панели должен быть внизу.', 'The landing gear lever must be down.'), done: (s) => s.sw.GEAR === 1 },
  { id: 'chk_bat', phase: 'power', kind: 'check', view: 'ovhd', ctl: ['BAT1', 'BAT2'], title: r('Проверить напряжение BAT 1 и BAT 2: ≥ 25,5 В', 'Check BAT 1/2 voltage ≥ 25.5 V'), hint: r('Табло над кнопками BAT показывает напряжение даже при выключенных АКБ. Если меньше 25,5 В — нужна зарядка от наземного питания.', 'The displays above the BAT buttons work with batteries off. Below 25.5 V the batteries must be charged from ground power.'), done: () => true },
  { id: 'bat1', phase: 'power', kind: 'action', view: 'ovhd', ctl: ['BAT1'], title: r('BAT 1 — AUTO (нажать)', 'BAT 1 — AUTO'), hint: r('Кнопка в панели ELEC. Лампа OFF гаснет.', 'ELEC panel. The OFF light goes out.'), done: (s) => s.sw.BAT1 === 1 },
  { id: 'bat2', phase: 'power', kind: 'action', view: 'ovhd', ctl: ['BAT2'], title: r('BAT 2 — AUTO (нажать)', 'BAT 2 — AUTO'), hint: r('После этого оживают табло на верхнем пульте.', 'Overhead annunciators come alive.'), done: (s) => s.sw.BAT2 === 1 },
  { id: 'gpu', phase: 'power', kind: 'comm', view: 'comms', title: r('Попросить техника подключить GPU', 'Ask ground crew to connect GPU'), hint: r('Вкладка «Связь» → Техник → «Подключить наземное питание». Через ~15 с на EXT PWR загорится AVAIL.', 'Comms → Ground crew → "Connect ground power". AVAIL lights after ~15 s.'), done: (s) => s.gnd.gpu || !!s.flags.gpuUsed, optional: true },
  { id: 'extpwr', phase: 'power', kind: 'action', view: 'ovhd', ctl: ['EXT_PWR'], title: r('EXT PWR — ON (когда горит AVAIL)', 'EXT PWR — ON (when AVAIL)'), hint: r('Зелёный AVAIL → нажать → синий ON. Включатся экраны и вентиляция.', 'Green AVAIL → press → blue ON. Displays come on.'), done: (s) => s.elec.ext || !!s.flags.extUsed, optional: true },
  {
    id: 'charge',
    phase: 'power',
    kind: 'wait',
    view: 'ovhd',
    ctl: ['BAT1', 'BAT2'],
    title: r('Зарядить АКБ: питание GPU, BAT в AUTO, ждать > 25,5 В', 'Charge batteries on GPU until > 25.5 V'),
    hint: r('Низкое напряжение! ВСУ не запустится от слабых АКБ. Подключите GPU и подождите зарядку (можно ускорить время).', 'Low voltage! The APU will not start on weak batteries. Connect GPU and wait (time acceleration helps).'),
    show: (s) => s.failures.some((f) => f.id === 'lowBat'),
    done: (s) => voc(s, 0) >= 25.5 && voc(s, 1) >= 25.5,
  },
  // ===================== 2. ВСУ =====================
  { id: 'apu_test', phase: 'apu', kind: 'action', view: 'ovhd', ctl: ['APU_FIRE_TEST'], title: r('APU FIRE TEST — нажать и удерживать', 'APU FIRE TEST — press and hold'), hint: r('Кнопка TEST на панели APU FIRE. Загорятся FIRE/SQUIB/DISCH, прозвучит сигнал, на ECAM — APU FIRE. Затем отпустить и нажать MASTER WARN.', 'TEST on the APU FIRE panel. FIRE/SQUIB/DISCH light, CRC sounds, ECAM APU FIRE. Release, then MASTER WARN.'), done: (s) => !!s.flags.apuFireTested, req: ['bat1', 'bat2'] },
  { id: 'apu_master', phase: 'apu', kind: 'action', view: 'ovhd', ctl: ['APU_MASTER'], title: r('APU MASTER SW — ON', 'APU MASTER SW — ON'), hint: r('Открывается заслонка воздухозаборника (на ECAM APU — FLAP OPEN).', 'The air intake flap opens (ECAM APU page: FLAP OPEN).'), done: (s) => s.sw.APU_MASTER === 1 || s.apu.avail, req: ['bat1', 'bat2'] },
  { id: 'apu_start', phase: 'apu', kind: 'action', view: 'ovhd', ctl: ['APU_START'], title: r('APU START — нажать', 'APU START — press'), hint: r('Через 3–10 с после MASTER SW. Синий ON — запуск идёт. Следите за N и EGT на странице APU.', '3–10 s after MASTER SW. Blue ON: starting. Watch N and EGT on the APU page.'), done: (s) => s.apu.starting || s.apu.avail, req: ['apu_test', 'apu_master'] },
  {
    id: 'apu_restart',
    phase: 'apu',
    kind: 'action',
    view: 'ovhd',
    ctl: ['APU_MASTER', 'APU_START'],
    title: r('APU AUTO SHUT DOWN: MASTER SW — OFF, затем снова ON → START', 'APU AUTO SHUT DOWN: MASTER OFF, then ON → START'),
    hint: r('Автоматика остановила ВСУ. Выключите MASTER SW (FAULT погаснет), дождитесь остановки и повторите запуск. При слабых АКБ — сначала GPU.', 'The APU shut down. MASTER SW off (FAULT goes out), wait for spool down and restart. With weak batteries use GPU first.'),
    show: (s) => !!s.flags.apuFailedSeen,
    done: (s) => s.apu.avail,
  },
  { id: 'apu_avail', phase: 'apu', kind: 'wait', view: 'ovhd', ctl: ['APU_START'], title: r('Дождаться APU AVAIL', 'Wait for APU AVAIL'), hint: r('N ≥ 95% + 2 с. Зелёный AVAIL на кнопке START. Обычно ~45 с.', 'N ≥ 95% + 2 s. Green AVAIL on START. About 45 s.'), done: (s) => s.apu.avail },
  { id: 'apu_bleed', phase: 'apu', kind: 'action', view: 'ovhd', ctl: ['APU_BLEED'], title: r('APU BLEED — ON', 'APU BLEED — ON'), hint: r('Отбор воздуха ВСУ: питает кондиционеры и будет крутить стартеры двигателей. Давление ~35 psi на странице BLEED.', 'APU air feeds the packs and will drive the engine starters. ~35 psi on the BLEED page.'), done: (s) => s.sw.APU_BLEED === 1 && s.apu.avail, req: ['apu_avail'] },
  // ===================== 3. ПОДГОТОВКА =====================
  { id: 'adirs', phase: 'prep', kind: 'action', view: 'ovhd', ctl: ['IR1_MODE', 'IR2_MODE', 'IR3_MODE'], title: r('ADIRS: IR 1, IR 2, IR 3 — NAV', 'ADIRS: IR 1, 2, 3 — NAV'), hint: r('Выставка ~7 мин (или 90 с в быстром режиме). Пока идёт выставка — самолёт не двигать! Сделайте это как можно раньше.', 'Alignment ~7 min (90 s in fast mode). Do not move the aircraft! Do it as early as possible.'), done: (s) => [1, 2, 3].every((i) => s.sw[`IR${i}_MODE`] === 1) },
  { id: 'oxy', phase: 'prep', kind: 'action', view: 'ovhd', ctl: ['OXY_CREW'], title: r('OXYGEN CREW SUPPLY — ON', 'OXYGEN CREW SUPPLY — ON'), hint: r('Кнопка CREW SUPPLY: лампа OFF должна погаснуть.', 'CREW SUPPLY: the OFF light goes out.'), done: (s) => s.sw.OXY_CREW === 1 },
  { id: 'rcdr', phase: 'prep', kind: 'action', view: 'ovhd', ctl: ['RCDR_GND'], title: r('RCDR GND CTL — ON', 'RCDR GND CTL — ON'), hint: r('Включает речевой и параметрический регистраторы на земле.', 'Powers the CVR and DFDR on ground.'), done: (s) => s.sw.RCDR_GND === 1, optional: true },
  {
    id: 'elac',
    phase: 'prep',
    kind: 'action',
    view: 'ovhd',
    ctl: ['ELAC1'],
    title: r('F/CTL ELAC 1 FAULT: ELAC 1 — OFF, затем ON', 'F/CTL ELAC 1 FAULT: ELAC 1 OFF then ON'),
    hint: r('Сброс компьютера по ECAM: отжать кнопку, подождать секунду и нажать снова.', 'ECAM reset: release the pushbutton, then press it again.'),
    show: (s) => !!s.flags.elacSeen,
    done: (s) => !s.flags.elacFault,
  },
  { id: 'fltctl', phase: 'prep', kind: 'check', view: 'ovhd', ctl: ['ELAC1', 'SEC1', 'FAC1', 'ELAC2', 'SEC2', 'SEC3', 'FAC2'], title: r('Проверить: ELAC/SEC/FAC — включены, без FAULT', 'Check: ELAC/SEC/FAC on, no FAULT'), hint: r('Принцип «тёмной кабины»: всё нормально, когда лампы погашены.', '"Dark cockpit": normal when all lights are out.'), done: (s) => ['ELAC1', 'SEC1', 'FAC1', 'ELAC2', 'SEC2', 'SEC3', 'FAC2'].every((k) => s.sw[k] === 1) && !s.flags.elacFault },
  { id: 'fuel', phase: 'prep', kind: 'action', view: 'ovhd', ctl: ['FUEL_L1', 'FUEL_L2', 'FUEL_C1', 'FUEL_C2', 'FUEL_R1', 'FUEL_R2'], title: r('FUEL: все 6 насосов — ON', 'FUEL: all 6 pumps ON'), hint: r('L TK 1+2, CTR TK 1+2, R TK 1+2. Лампы OFF гаснут. Центральные в AUTO сами остановятся, если бак пуст.', 'L TK 1+2, CTR 1+2, R TK 1+2. OFF lights go out. Center pumps stop automatically when empty.'), done: (s) => ['L1', 'L2', 'C1', 'C2', 'R1', 'R2'].every((k) => s.sw[`FUEL_${k}`] === 1) },
  { id: 'fuelchk', phase: 'prep', kind: 'check', view: 'ovhd', ctl: ['FUEL_MODE', 'FUEL_XFEED'], title: r('Проверить: FUEL MODE SEL — AUTO, X FEED — OFF', 'Check: FUEL MODE SEL AUTO, X FEED off'), hint: r('Без белых ламп MAN и ON.', 'No white MAN / ON lights.'), done: (s) => s.sw.FUEL_MODE === 0 && s.sw.FUEL_XFEED === 0 },
  { id: 'elecchk', phase: 'prep', kind: 'check', view: 'ovhd', ctl: ['GEN1', 'GEN2', 'APU_GEN', 'BUS_TIE', 'GALY_CAB', 'AC_ESS_FEED'], title: r('Проверить: ELEC — GEN, APU GEN, BUS TIE, GALY & CAB нажаты', 'Check: ELEC — GEN, APU GEN, BUS TIE, GALY & CAB on'), hint: r('На странице ELEC видно, кто питает шины AC.', 'The ELEC page shows which source feeds the AC buses.'), done: (s) => ['GEN1', 'GEN2', 'APU_GEN', 'BUS_TIE', 'GALY_CAB', 'AC_ESS_FEED'].every((k) => s.sw[k] === 1) },
  { id: 'airchk', phase: 'prep', kind: 'check', view: 'ovhd', ctl: ['PACK1', 'PACK2', 'ENG1_BLEED', 'ENG2_BLEED', 'XBLEED'], title: r('Проверить: PACK 1/2 и ENG BLEED 1/2 — ON, X BLEED — AUTO', 'Check: PACK 1/2, ENG BLEED 1/2 ON, X BLEED AUTO'), hint: r('X BLEED AUTO нужен, чтобы воздух ВСУ дошёл до стартера двигателя 2!', 'X BLEED AUTO lets APU air reach engine 2 starter!'), done: (s) => s.sw.PACK1 === 1 && s.sw.PACK2 === 1 && s.sw.ENG1_BLEED === 1 && s.sw.ENG2_BLEED === 1 && s.sw.XBLEED === 1 },
  { id: 'aichk', phase: 'prep', kind: 'check', view: 'ovhd', ctl: ['WING_AI', 'ENG1_AI', 'ENG2_AI', 'PROBE_HEAT'], title: r('Проверить: ANTI ICE — OFF, PROBE/WINDOW HEAT — AUTO', 'Check: ANTI ICE OFF, PROBE/WINDOW HEAT AUTO'), hint: r('Обледенения нет (OAT > 10 °C, сухо).', 'No icing conditions today.'), done: (s) => !s.sw.WING_AI && !s.sw.ENG1_AI && !s.sw.ENG2_AI && !s.sw.PROBE_HEAT },
  { id: 'presschk', phase: 'prep', kind: 'check', view: 'ovhd', ctl: ['PRESS_MODE', 'LDG_ELEV'], title: r('Проверить: CABIN PRESS — MODE AUTO, LDG ELEV AUTO', 'Check: CABIN PRESS MODE AUTO, LDG ELEV AUTO'), hint: r('Высоту аэродрома посадки система возьмёт из FMS.', 'Landing elevation comes from the FMS.'), done: (s) => s.sw.PRESS_MODE === 0 && s.sw.LDG_ELEV === 0 },
  { id: 'navlt', phase: 'prep', kind: 'action', view: 'ovhd', ctl: ['NAV_LOGO'], title: r('EXT LT: NAV & LOGO — 1', 'EXT LT: NAV & LOGO — 1'), hint: r('Аэронавигационные огни включают при подаче питания.', 'Navigation lights on when the aircraft is powered.'), done: (s) => s.sw.NAV_LOGO >= 1 },
  { id: 'signs', phase: 'prep', kind: 'action', view: 'ovhd', ctl: ['SEAT_BELTS', 'NO_SMOKING', 'EMER_EXIT_LT'], title: r('SIGNS: SEAT BELTS ON, NO SMOKING AUTO, EMER EXIT LT ARM', 'SIGNS: SEAT BELTS ON, NO SMOKING AUTO, EMER EXIT ARM'), hint: r('Тумблеры на панели SIGNS.', 'Switches on the SIGNS panel.'), done: (s) => s.sw.SEAT_BELTS === 1 && s.sw.NO_SMOKING >= 1 && s.sw.EMER_EXIT_LT === 1 },
  {
    id: 'accu',
    phase: 'prep',
    kind: 'action',
    view: 'ovhd',
    ctl: ['HYD_Y_ELEC'],
    title: r('ACCU низкое: Y ELEC PUMP — ON до зелёной зоны, затем OFF', 'ACCU low: Y ELEC PUMP ON until green, then OFF'),
    hint: r('Указатель BRAKES/ACCU на центральной панели. Без давления стояночный тормоз не держит!', 'BRAKES/ACCU gauge on the main panel. Without pressure the parking brake will not hold!'),
    show: (s) => s.failures.some((f) => f.id === 'lowAccu'),
    done: (s) => s.hyd.accu > 2500 && s.sw.HYD_Y_ELEC === 0,
  },
  { id: 'engtest', phase: 'prep', kind: 'action', view: 'ovhd', ctl: ['ENG1_FIRE_TEST', 'ENG2_FIRE_TEST'], title: r('ENG 1 и ENG 2 FIRE TEST', 'ENG 1 and ENG 2 FIRE TEST'), hint: r('Удерживайте TEST на панелях ENG 1 FIRE и ENG 2 FIRE: красные FIRE на кнопках и на панели ENG пульта.', 'Hold TEST on both ENG FIRE panels: red FIRE lights here and on the pedestal ENG panel.'), done: (s) => !!s.flags.eng1FireTested && !!s.flags.eng2FireTested },
  { id: 'anntest', phase: 'prep', kind: 'action', view: 'ovhd', ctl: ['ANN_LT'], title: r('ANN LT — TEST, затем BRT', 'ANN LT — TEST, then BRT'), hint: r('Проверка всех ламп кабины.', 'Tests all cockpit lights.'), done: (s) => !!s.flags.annTested, optional: true },
  { id: 'rmp', phase: 'prep', kind: 'action', view: 'ped', ctl: ['RMP_ON'], title: r('RMP 1 — ON', 'RMP 1 — ON'), hint: r('Радиопульт на центральном пульте.', 'Radio panel on the pedestal.'), done: (s) => s.sw.RMP_ON === 1 },
  { id: 'atis', phase: 'prep', kind: 'comm', view: 'comms', ctl: ['RMP_KNOB', 'RMP_XFER'], title: r('Прослушать ATIS — 123.125', 'Listen to ATIS — 123.125'), hint: r('На RMP установите 123.125 в STBY (колесо мыши по ручке) и нажмите ⇄. Затем «Связь» → ATIS.', 'Set 123.125 in STBY (mouse wheel on knob), press ⇄, then Comms → ATIS.'), done: (s) => s.atc.atis },
  { id: 'baro', phase: 'prep', kind: 'action', view: 'front', ctl: ['BARO_STD'], title: r('BARO — QNH из ATIS', 'BARO — QNH from ATIS'), hint: r('Ручка BARO на EFIS: колесо мыши. Значение QNH — во вкладке «Документы».', 'BARO knob on the EFIS panel: mouse wheel. QNH is in the Documents tab.'), done: (s) => s.atc.atis && !s.fcu.baroStd && s.fcu.baro === s.atc.qnh },
  { id: 'fd', phase: 'prep', kind: 'action', view: 'front', ctl: ['FD'], title: r('FD — ON', 'FD — ON'), hint: r('Кнопка FD на панели EFIS. Зелёная полоска = включено.', 'FD on the EFIS panel. Green bar = on.'), done: (s) => s.fcu.fd },
  { id: 'nd', phase: 'prep', kind: 'action', view: 'front', ctl: ['ND_MODE', 'ND_RANGE'], title: r('ND: MODE ARC, RANGE 10', 'ND: MODE ARC, RANGE 10'), hint: r('Галетники MODE и RANGE на панели EFIS.', 'MODE and RANGE selectors on the EFIS panel.'), done: (s) => s.sw.ND_MODE === 3 && s.sw.ND_RANGE === 0, optional: true },
  { id: 'askid', phase: 'prep', kind: 'check', view: 'front', ctl: ['ASKID_NWS'], title: r('Проверить: A/SKID & N/W STRG — ON', 'Check: A/SKID & N/W STRG ON'), hint: r('Тумблер у рычага шасси.', 'Switch next to the gear lever.'), done: (s) => s.sw.ASKID_NWS === 1 },
  { id: 'parkchk', phase: 'prep', kind: 'check', view: 'ped', ctl: ['PARK_BRK'], title: r('Проверить: PARK BRK — ON, ACCU в зелёной зоне', 'Check: PARK BRK ON, ACCU in green'), hint: r('Указатель BRAKES на центральной панели: ACCU ≈ 3000 psi, тормоза ≈ 2000 psi.', 'BRAKES gauge: ACCU ≈ 3000 psi, brakes ≈ 2000 psi.'), done: (s) => s.sw.PARK_BRK === 1 && s.hyd.accu > 2000 },
  { id: 'pedchk', phase: 'prep', kind: 'check', view: 'ped', ctl: ['FLAPS', 'SPD_BRK', 'XPDR_MODE', 'TCAS_MODE'], title: r('Проверить: FLAPS 0, SPEED BRAKE RET, XPDR и TCAS — STBY', 'Check: FLAPS 0, SPD BRK RET, XPDR & TCAS STBY'), hint: r('Центральный пульт.', 'Pedestal.'), done: (s) => s.sw.FLAPS === 0 && s.sw.SPD_BRK === 1 && s.sw.XPDR_MODE === 0 && s.sw.TCAS_MODE === 0 },
  // ===================== 4. MCDU =====================
  { id: 'fms_fromto', phase: 'fms', kind: 'action', view: 'mcdu', title: r('MCDU INIT: FROM/TO — LFBO/LFPO (LSK 1R)', 'MCDU INIT: FROM/TO LFBO/LFPO (LSK 1R)'), hint: r('Кнопка INIT, наберите LFBO/LFPO (можно с клавиатуры) и нажмите правую кнопку строки 1.', 'Press INIT, type LFBO/LFPO and press the right key of line 1.'), done: (s) => s.fms.from === 'LFBO' && s.fms.to === 'LFPO' },
  { id: 'fms_align', phase: 'fms', kind: 'action', view: 'mcdu', title: r('INIT: ALIGN IRS → (LSK 3R)', 'INIT: ALIGN IRS → (LSK 3R)'), hint: r('Подтверждает координаты для выставки ИНС. Без этого выставка не закончится (ALIGN начнёт мигать).', 'Confirms the position for IRS alignment. Without it alignment never completes (ALIGN flashes).'), done: (s) => s.fms.posConfirmed, req: ['adirs', 'fms_fromto'] },
  { id: 'fms_flt', phase: 'fms', kind: 'action', view: 'mcdu', title: r('INIT: FLT NBR — EGM320 (LSK 3L)', 'INIT: FLT NBR — EGM320 (LSK 3L)'), hint: r('Номер рейса из документов.', 'Flight number from the documents.'), done: (s) => s.fms.fltNbr === SCN.callsign },
  { id: 'fms_ci', phase: 'fms', kind: 'action', view: 'mcdu', title: r('INIT: COST INDEX — 30 (LSK 5L)', 'INIT: COST INDEX — 30 (LSK 5L)'), hint: r('Индекс стоимости из OFP.', 'Cost index from the OFP.'), done: (s) => s.fms.ci === SCN.ci },
  { id: 'fms_crz', phase: 'fms', kind: 'action', view: 'mcdu', title: r('INIT: CRZ FL — 330 (LSK 6L)', 'INIT: CRZ FL — 330 (LSK 6L)'), hint: r('Эшелон крейсерского полёта.', 'Cruise flight level.'), done: (s) => s.fms.crzFl === SCN.crzFl },
  { id: 'fms_dep', phase: 'fms', kind: 'action', view: 'mcdu', title: r('F-PLN: DEPARTURE — ВПП 32L, SID BAXOS5B, INSERT', 'F-PLN: DEPARTURE — RWY 32L, SID BAXOS5B, INSERT'), hint: r('F-PLN → LSK 1L (LFBO) → <DEPARTURE → выберите 32L и BAXOS5B → INSERT* (LSK 6R).', 'F-PLN → LSK 1L (LFBO) → <DEPARTURE → pick 32L and BAXOS5B → INSERT* (LSK 6R).'), done: (s) => s.fms.rwy === SCN.rwy && s.fms.sid === SCN.sid },
  { id: 'fms_initb', phase: 'fms', kind: 'action', view: 'mcdu', title: r('INIT B: ZFW/ZFWCG 58.2/27.0, BLOCK 9.8', 'INIT B: ZFW/ZFWCG 58.2/27.0, BLOCK 9.8'), hint: r('INIT → стрелка → (следующая страница). ZFW/ZFWCG — LSK 1R, BLOCK — LSK 2R.', 'INIT → arrow → next page. ZFW/ZFWCG on LSK 1R, BLOCK on LSK 2R.'), done: (s) => s.fms.zfw === SCN.zfw && s.fms.zfwcg === SCN.zfwcg && s.fms.block === SCN.block },
  { id: 'fms_perf', phase: 'fms', kind: 'action', view: 'mcdu', title: r('PERF T.O: V1 142, VR 145, V2 149, 1/UP0.8, FLEX 54', 'PERF T.O: V1 142, VR 145, V2 149, 1/UP0.8, FLEX 54'), hint: r('Кнопка PERF. V1/VR/V2 — LSK 1L–3L, FLAPS/THS — 3R (1/UP0.8), FLEX TO TEMP — 4R.', 'PERF. V1/VR/V2 on LSK 1L–3L, FLAPS/THS 3R (1/UP0.8), FLEX TO TEMP 4R.'), done: (s) => s.fms.v1 === SCN.v1 && s.fms.vr === SCN.vr && s.fms.v2 === SCN.v2 && s.fms.toFlaps === SCN.toFlaps && s.fms.ths === SCN.ths && s.fms.flex === SCN.flex },
  // ===================== 5. ПЕРЕД ЗАПУСКОМ =====================
  { id: 'clr', phase: 'before', kind: 'comm', view: 'comms', title: r('Получить IFR-разрешение — Delivery 121.900', 'Get IFR clearance — Delivery 121.900'), hint: r('Настройте RMP на 121.900 и запросите разрешение. Запомните код ответчика и высоту.', 'Tune 121.900 and request clearance. Note the squawk and altitude.'), done: (s) => s.atc.clearance },
  { id: 'squawk', phase: 'before', kind: 'action', view: 'ped', ctl: ['XPDR_0', 'XPDR_1', 'XPDR_2', 'XPDR_3', 'XPDR_4', 'XPDR_5', 'XPDR_6', 'XPDR_7'], title: r('ATC XPDR — код из разрешения', 'ATC XPDR — set the cleared squawk'), hint: r('Наберите 4 цифры на панели ATC/TCAS.', 'Key in 4 digits on the ATC/TCAS panel.'), done: (s) => s.atc.clearance && s.radio.xpdrCode === s.atc.squawk, req: ['clr'] },
  { id: 'fcualt', phase: 'before', kind: 'action', view: 'front', ctl: ['ALT_KNOB'], title: r('FCU ALT — 6000 (из разрешения)', 'FCU ALT — 6000 (clearance)'), hint: r('Ручка ALT на FCU. Переключатель 100/1000 задаёт шаг.', 'ALT knob on the FCU. The 100/1000 switch sets the step.'), done: (s) => s.fcu.alt === s.atc.initAlt },
  { id: 'irs_ok', phase: 'before', kind: 'wait', view: 'front', title: r('Дождаться окончания выставки ИНС', 'Wait for IRS alignment'), hint: r('На PFD появится авиагоризонт, на ND — карта. Мемо IRS IN ALIGN исчезнет.', 'PFD attitude and ND map appear, IRS IN ALIGN memo disappears.'), done: (s) => s.adirs.ir.every((i) => i.aligned) },
  { id: 'doors', phase: 'before', kind: 'comm', view: 'comms', title: r('Бортпроводник: закрыть двери (после окончания посадки)', 'Purser: close doors (after boarding)'), hint: r('Двери видно на странице ECAM DOOR.', 'See the ECAM DOOR page.'), done: (s) => !s.gnd.doors.L1 && !s.gnd.doors.FWD && !s.gnd.doors.AFT },
  { id: 'slides', phase: 'before', kind: 'comm', view: 'comms', title: r('PA: двери на автомат (arm slides)', 'PA: arm doors and cross-check'), hint: r('После закрытия дверей.', 'After the doors are closed.'), done: (s) => s.gnd.slidesArmed, req: ['doors'] },
  { id: 'gpu_off', phase: 'before', kind: 'action', view: 'ovhd', ctl: ['EXT_PWR'], title: r('EXT PWR — OFF, попросить техника отключить GPU', 'EXT PWR — OFF, ask to remove GPU'), hint: r('Сеть переходит на генератор ВСУ. Нельзя отключать GPU, пока ВСУ не готова!', 'The network moves to the APU generator. Never remove GPU before APU AVAIL!'), show: (s) => !!s.flags.gpuUsed, done: (s) => !s.gnd.gpu, req: ['apu_avail'] },
  { id: 'beacon', phase: 'before', kind: 'action', view: 'ovhd', ctl: ['BEACON'], title: r('BEACON — ON', 'BEACON — ON'), hint: r('Перед буксировкой и запуском — предупреждение для наземного персонала.', 'Before push and start — warns the ground staff.'), done: (s) => s.sw.BEACON === 1 },
  { id: 'thridle', phase: 'before', kind: 'check', view: 'ped', ctl: ['TL1', 'TL2'], title: r('Проверить: РУД — IDLE', 'Check: thrust levers IDLE'), hint: r('Иначе при запуске двигатель выйдет на тягу.', 'Otherwise the engine would spool up after start.'), done: (s) => s.sw.TL1 === 0 && s.sw.TL2 === 0 },
  { id: 'cl_bs', phase: 'before', kind: 'checklist', view: 'checklist', title: r('Чек-лист BEFORE START', 'BEFORE START checklist'), hint: r('Вкладка «Чек-листы». Каждый пункт проверяется по реальному состоянию самолёта.', 'Checklists tab. Each item is verified against the real aircraft state.'), done: (s) => !!s.flags.cl_BEFORE_START },
  { id: 'pushclr', phase: 'before', kind: 'comm', view: 'comms', title: r('Ground 121.700: запросить буксировку и запуск', 'Ground 121.700: request push and start'), hint: r('Буксировка разрешается только после IFR-разрешения.', 'Push is approved only after the IFR clearance.'), done: (s) => s.atc.pushApproved, req: ['clr'] },
  // ===================== 6. БУКСИРОВКА / ЗАПУСК =====================
  { id: 'push', phase: 'start', kind: 'comm', view: 'comms', title: r('Технику: «Готовы к буксировке»', 'Ground crew: "ready for pushback"'), hint: r('Двери закрыты, GPU отключено, маяк включён.', 'Doors closed, GPU removed, beacon on.'), done: (s) => s.gnd.pushStage !== 'none', req: ['pushclr', 'beacon'] },
  { id: 'push_brk', phase: 'start', kind: 'action', view: 'ped', ctl: ['PARK_BRK'], title: r('По команде техника: PARK BRK — OFF', 'On ground crew request: PARK BRK OFF'), hint: r('Буксир начнёт толкать самолёт. Во время буксировки не тормозить!', 'The tug starts pushing. Never brake during the push!'), done: (s) => ['pushing', 'wait-park', 'connected-wait', 'done'].includes(s.gnd.pushStage), req: ['push'] },
  { id: 'mode_ign', phase: 'start', kind: 'action', view: 'ped', ctl: ['ENG_MODE'], title: r('ENG MODE SEL — IGN/START', 'ENG MODE SEL — IGN/START'), hint: r('Питание FADEC, на нижнем ECAM откроется страница ENG.', 'FADEC powered, ECAM ENG page appears.'), done: (s) => s.sw.ENG_MODE === 2 || bothRun(s), req: ['beacon', 'apu_bleed'] },
  { id: 'eng2_m', phase: 'start', kind: 'action', view: 'ped', ctl: ['ENG2_MASTER'], title: r('ENG MASTER 2 — ON', 'ENG MASTER 2 — ON'), hint: r('По SOP первым запускают двигатель 2 (он даёт давление в жёлтую систему — тормоза).', 'SOP: engine 2 first (it pressurises the yellow system — brakes).'), done: (s) => s.eng[1].phase !== 'off' || s.eng[1].running, req: ['mode_ign'] },
  { id: 'eng2_run', phase: 'start', kind: 'wait', view: 'front', title: r('Контроль запуска ДВ2: N2 → IGN → FUEL → EGT → AVAIL', 'Monitor ENG 2 start: N2 → IGN → FUEL → EGT → AVAIL'), hint: r('16% N2 — зажигание A или B, 22% — подача топлива, затем рост EGT (лимит 725 °C), 50% — стартер отключается, малый газ ~58% N2.', '16% N2 ignition A/B, 22% fuel, EGT rise (limit 725 °C), 50% starter cut-out, idle ~58% N2.'), done: (s) => s.eng[1].running },
  {
    id: 'startfault',
    phase: 'start',
    kind: 'action',
    view: 'ped',
    ctl: ['ENG1_MASTER', 'ENG2_MASTER'],
    title: r('ENG START FAULT: MASTER — OFF, сухая прокрутка 30 с, повтор', 'ENG START FAULT: MASTER OFF, 30 s dry crank, retry'),
    hint: r('FADEC сам прервал запуск. По ECAM: ENG MASTER — OFF. Дождитесь окончания прокрутки и повторите запуск.', 'FADEC aborted the start. ECAM: ENG MASTER OFF. Wait for the dry crank, then retry.'),
    show: (s) => !!s.flags.startFaultSeen,
    done: (s) => bothRun(s),
  },
  { id: 'push_park', phase: 'start', kind: 'action', view: 'ped', ctl: ['PARK_BRK'], title: r('Буксировка закончена: PARK BRK — ON', 'Push complete: PARK BRK ON'), hint: r('Техник попросит поставить на стояночный тормоз.', 'The ground crew will ask you to set the parking brake.'), done: (s) => s.gnd.pushStage === 'connected-wait' || s.gnd.pushStage === 'done', req: ['push_brk'] },
  { id: 'eng1_m', phase: 'start', kind: 'action', view: 'ped', ctl: ['ENG1_MASTER'], title: r('ENG MASTER 1 — ON', 'ENG MASTER 1 — ON'), hint: r('После стабилизации ДВ2. При запуске ДВ1 зарычит PTU («лающая собака») — это нормально.', 'After ENG 2 is stable. The PTU will "bark" — normal.'), done: (s) => s.eng[0].phase !== 'off' || s.eng[0].running, req: ['eng2_run'] },
  { id: 'eng1_run', phase: 'start', kind: 'wait', view: 'front', title: r('Контроль запуска ДВ1', 'Monitor ENG 1 start'), hint: r('Те же этапы. После запуска давление в зелёной системе поднимется.', 'Same sequence. Green hydraulic pressure builds afterwards.'), done: (s) => s.eng[0].running },
  // ===================== 7. ПОСЛЕ ЗАПУСКА =====================
  { id: 'mode_norm', phase: 'after', kind: 'action', view: 'ped', ctl: ['ENG_MODE'], title: r('ENG MODE SEL — NORM', 'ENG MODE SEL — NORM'), hint: r('Иначе останется постоянное зажигание (мемо IGNITION).', 'Otherwise continuous ignition remains (IGNITION memo).'), done: (s) => s.sw.ENG_MODE === 1 && bothRun(s), req: ['eng1_run'] },
  { id: 'apubleed_off', phase: 'after', kind: 'action', view: 'ovhd', ctl: ['APU_BLEED'], title: r('APU BLEED — OFF', 'APU BLEED — OFF'), hint: r('Теперь воздух дают двигатели.', 'Engines now supply bleed air.'), done: (s) => s.sw.APU_BLEED === 0 && bothRun(s), req: ['eng1_run'] },
  { id: 'apu_off', phase: 'after', kind: 'action', view: 'ovhd', ctl: ['APU_MASTER'], title: r('APU MASTER SW — OFF', 'APU MASTER SW — OFF'), hint: r('ВСУ поработает ещё ~60 с на охлаждение и остановится.', 'The APU runs ~60 s for cooling, then stops.'), done: (s) => s.sw.APU_MASTER === 0 && bothRun(s), req: ['apubleed_off'] },
  { id: 'splrs', phase: 'after', kind: 'action', view: 'ped', ctl: ['SPD_BRK'], title: r('GND SPLRS — ARM', 'GND SPLRS — ARM'), hint: r('Поднять рычаг SPEED BRAKE в положение ARM.', 'Pull the SPEED BRAKE lever up to ARM.'), done: (s) => s.sw.SPD_BRK === 0 },
  { id: 'rudtrim', phase: 'after', kind: 'check', view: 'ped', ctl: ['RUD_TRIM', 'RUD_TRIM_RESET'], title: r('Проверить: RUD TRIM — 0', 'Check: RUD TRIM zero'), hint: r('Кнопка RESET обнуляет триммер.', 'RESET zeroes the trim.'), done: (s) => Math.abs(s.ac.rudTrim) < 0.05 },
  { id: 'flaps', phase: 'after', kind: 'action', view: 'ped', ctl: ['FLAPS'], title: r('FLAPS — 1 (CONF 1+F)', 'FLAPS — 1 (CONF 1+F)'), hint: r('Закрылкам нужна гидравлика — только после запуска двигателей.', 'Flaps need hydraulics — only after engine start.'), done: (s) => s.sw.FLAPS === SCN.toFlaps && s.ac.slats > 17 },
  { id: 'trim', phase: 'after', kind: 'action', view: 'ped', ctl: ['PITCH_TRIM'], title: r('PITCH TRIM — UP 0.8', 'PITCH TRIM — UP 0.8'), hint: r('Колесо триммера: колесо мыши или клики. Значение — из PERF (THS).', 'Trim wheel: mouse wheel or clicks. Value from PERF (THS).'), done: (s) => Math.abs(s.ac.pitchTrim - SCN.ths) < 0.15 },
  { id: 'sts', phase: 'after', kind: 'action', view: 'ped', ctl: ['ECP_STS'], title: r('ECAM STATUS — проверить', 'ECAM STATUS — check'), hint: r('Кнопка STS на пульте ECAM, затем ещё раз (или CLR).', 'STS on the ECAM panel, then again (or CLR).'), done: (s) => !!s.flags.stsAfter },
  {
    id: 'pack1',
    phase: 'after',
    kind: 'action',
    view: 'ovhd',
    ctl: ['PACK1'],
    title: r('AIR PACK 1 FAULT: PACK 1 — OFF', 'AIR PACK 1 FAULT: PACK 1 OFF'),
    hint: r('Выполните ECAM-действие. С одним кондиционером лететь можно.', 'Follow ECAM. Dispatch with one pack is allowed.'),
    show: (s) => s.bleed.pack1Fault,
    done: (s) => s.sw.PACK1 === 0,
  },
  { id: 'disc', phase: 'after', kind: 'comm', view: 'comms', title: r('Технику: «Можно отключаться»', 'Ground crew: "cleared to disconnect"'), hint: r('После запуска обоих двигателей. Мемо NW STRG DISC исчезнет.', 'After both engines are running. NW STRG DISC memo goes away.'), done: (s) => !s.gnd.tow, req: ['push_park'] },
  { id: 'cl_as', phase: 'after', kind: 'checklist', view: 'checklist', title: r('Чек-лист AFTER START', 'AFTER START checklist'), hint: r('Вкладка «Чек-листы».', 'Checklists tab.'), done: (s) => !!s.flags.cl_AFTER_START },
  // ===================== 8. РУЛЕНИЕ =====================
  { id: 'taxiclr', phase: 'taxi', kind: 'comm', view: 'comms', title: r('Ground: запросить руление', 'Ground: request taxi'), hint: r('Частота Ground 121.700.', 'Ground frequency 121.700.'), done: (s) => s.atc.taxiClear, req: ['disc'] },
  { id: 'autobrk', phase: 'taxi', kind: 'action', view: 'front', ctl: ['AB_MAX'], title: r('AUTO BRK — MAX', 'AUTO BRK — MAX'), hint: r('Кнопка MAX у рычага шасси (нужна зелёная гидросистема).', 'MAX next to the gear lever (needs green hydraulics).'), done: (s) => s.ac.autobrk === 3 },
  { id: 'nosetaxi', phase: 'taxi', kind: 'action', view: 'ovhd', ctl: ['NOSE_LT'], title: r('NOSE light — TAXI', 'NOSE light — TAXI'), hint: r('Рулёжная фара.', 'Taxi light.'), done: (s) => s.sw.NOSE_LT >= 1 },
  { id: 'taxi_go', phase: 'taxi', kind: 'action', view: 'ped', ctl: ['PARK_BRK', 'TL1', 'TL2'], title: r('PARK BRK — OFF, немного тяги (F3) — начать руление', 'PARK BRK OFF, a little thrust (F3) — start taxi'), hint: r('Чтобы стронуться, нужно ~25–30% N1, затем малый газ. Скорость руления ≤ 30 уз (B — тормоз).', 'About 25–30% N1 to break away, then idle. Max 30 kt (B = brakes).'), done: (s) => ['taxi', 'holding', 'lineup', 'runway', 'airborne'].includes(s.gnd.phase), req: ['taxiclr'] },
  { id: 'brkchk', phase: 'taxi', kind: 'action', view: 'front', title: r('Проверка тормозов: на малой скорости нажать B', 'Brake check: press B at low speed'), hint: r('Сразу после начала движения — короткое торможение.', 'Right after starting to move — a short brake application.'), done: (s) => !!s.flags.brakeChecked },
  { id: 'fctl', phase: 'taxi', kind: 'action', view: 'front', title: r('Проверка рулей: ручка и педали до упора во все стороны', 'Flight control check: full stick and rudder travel'), hint: r('Стрелки (или W/A/S/D) — ручка, Z/X — педали. Смотрите страницу F/CTL на ECAM.', 'Arrows (or W/A/S/D) for the stick, Z/X for the rudder. Watch the F/CTL page.'), done: (s) => Object.values(s.ac.fctlCheck).every(Boolean) },
  { id: 'toconfig', phase: 'taxi', kind: 'action', view: 'ped', ctl: ['ECP_TOCONFIG'], title: r('T.O CONFIG — тест', 'T.O CONFIG — test'), hint: r('Кнопка T.O CONFIG на пульте ECAM. Ожидается «T.O CONFIG NORMAL» в мемо.', 'T.O CONFIG on the ECAM panel. Expect "T.O CONFIG NORMAL" in the memo.'), done: (s) => s.ecam.toConfigOk },
  { id: 'cl_bt', phase: 'taxi', kind: 'checklist', view: 'checklist', title: r('Чек-лист BEFORE TAKEOFF (до черты)', 'BEFORE TAKEOFF checklist (down to the line)'), hint: r('Вкладка «Чек-листы».', 'Checklists tab.'), done: (s) => !!s.flags.cl_BEFORE_TAKEOFF },
  { id: 'hold', phase: 'taxi', kind: 'action', view: 'front', title: r('Остановиться на предварительном старте ВПП 32L', 'Stop at holding point RWY 32L'), hint: r('Расстояние до линии видно в окне руления. Пересекать без разрешения нельзя!', 'Distance is shown in the taxi window. Do not cross without clearance!'), done: (s) => !!s.flags.atHold },
  { id: 'twr', phase: 'taxi', kind: 'comm', view: 'comms', title: r('Tower 118.100: «Готов к вылету»', 'Tower 118.100: "ready for departure"'), hint: r('Получите разрешение занять ВПП.', 'Get the line-up clearance.'), done: (s) => s.atc.lineupClear },
  // ===================== 9. ИСПОЛНИТЕЛЬНЫЙ =====================
  { id: 'seats', phase: 'lineup', kind: 'comm', view: 'comms', title: r('PA: «Бортпроводникам занять места» → CABIN READY', 'PA: "cabin crew seats" → CABIN READY'), hint: r('Салон доложит о готовности, в мемо появится CABIN READY.', 'Cabin reports ready; T.O memo shows CABIN READY.'), done: (s) => s.gnd.cabinReady },
  { id: 'tcas', phase: 'lineup', kind: 'action', view: 'ped', ctl: ['TCAS_MODE'], title: r('TCAS — TA/RA', 'TCAS — TA/RA'), hint: r('Панель ATC/TCAS.', 'ATC/TCAS panel.'), done: (s) => s.sw.TCAS_MODE === 2 },
  { id: 'xpdr', phase: 'lineup', kind: 'action', view: 'ped', ctl: ['XPDR_MODE'], title: r('XPDR — AUTO (или ON)', 'XPDR — AUTO (or ON)'), hint: r('Ответчик начнёт отвечать радару.', 'Transponder starts replying.'), done: (s) => s.sw.XPDR_MODE >= 1 },
  { id: 'lights', phase: 'lineup', kind: 'action', view: 'ovhd', ctl: ['STROBE', 'LAND_L', 'LAND_R', 'NOSE_LT', 'RWY_TURNOFF'], title: r('Свет: STROBE ON, LAND L/R ON, NOSE T.O, RWY TURN OFF ON', 'Lights: STROBE ON, LAND ON, NOSE T.O, RWY TURN OFF ON'), hint: r('Панель EXT LT.', 'EXT LT panel.'), done: (s) => s.sw.STROBE === 2 && s.sw.LAND_L === 2 && s.sw.LAND_R === 2 && s.sw.NOSE_LT === 2 && s.sw.RWY_TURNOFF === 1 },
  { id: 'lineup', phase: 'lineup', kind: 'action', view: 'front', title: r('Вырулить на ВПП 32L', 'Line up on RWY 32L'), hint: r('Немного тяги, после выхода на ось — остановиться (B).', 'A little thrust, stop on the centreline (B).'), done: (s) => s.gnd.phase === 'runway' || s.gnd.phase === 'airborne', req: ['twr'] },
  { id: 'cl_btb', phase: 'lineup', kind: 'checklist', view: 'checklist', title: r('Чек-лист BEFORE TAKEOFF (после черты)', 'BEFORE TAKEOFF checklist (below the line)'), hint: r('Вкладка «Чек-листы».', 'Checklists tab.'), done: (s) => !!s.flags.cl_BELOW_LINE },
  { id: 'toclr', phase: 'lineup', kind: 'wait', view: 'comms', title: r('Получить разрешение на взлёт', 'Receive take-off clearance'), hint: r('Вышка разрешит взлёт через несколько секунд после занятия ВПП.', 'Tower clears you a few seconds after lining up.'), done: (s) => s.atc.toClear },
  // ===================== 10. ВЗЛЁТ =====================
  { id: 'thr50', phase: 'takeoff', kind: 'action', view: 'ped', ctl: ['TL1', 'TL2'], title: r('РУД ~50% N1 — стабилизация', 'Thrust ~50% N1 — stabilise'), hint: r('Несколько нажатий F3 до N1 ≈ 50% на обоих двигателях, подождать 2–3 с.', 'Press F3 until N1 ≈ 50% on both, wait 2–3 s.'), done: (s) => !!s.flags.stab50, req: ['toclr'] },
  { id: 'thrflx', phase: 'takeoff', kind: 'action', view: 'ped', ctl: ['TL1', 'TL2'], title: r('РУД — FLX/MCT', 'Thrust levers — FLX/MCT'), hint: r('F3 до фиксатора FLX (35°). FMA: MAN FLX +54 | SRS | RWY.', 'F3 up to the FLX detent (35°). FMA: MAN FLX +54 | SRS | RWY.'), done: (s) => !!s.flags.toPowerSet, req: ['toclr', 'thr50'] },
  { id: 'rotate', phase: 'takeoff', kind: 'action', view: 'front', title: r('VR 145: плавно на себя (↓ / S) до ~15°', 'VR 145: rotate smoothly (↓ / S) to ~15°'), hint: r('Не раньше VR и не быстрее ~3°/с, иначе удар хвостом (> 11.7° на земле).', 'Not before VR and ~3°/s, or tail strike (> 11.7° on ground).'), done: (s) => s.ac.liftoffT > 0 },
  { id: 'gearup', phase: 'takeoff', kind: 'action', view: 'front', ctl: ['GEAR'], title: r('Positive climb — шасси убрать (G)', 'Positive climb — gear up (G)'), hint: r('При положительной вертикальной скорости.', 'With positive vertical speed.'), done: (s) => s.sw.GEAR === 0 && !s.ac.onGround },
  { id: 'clb', phase: 'takeoff', kind: 'action', view: 'ped', ctl: ['TL1', 'TL2'], title: r('LVR CLB: РУД — CL', 'LVR CLB: thrust levers CL'), hint: r('На высоте THR RED мигает LVR CLB — перевести РУД в CL (F2). Включится автомат тяги.', 'At THR RED, LVR CLB flashes — move levers to CL (F2). A/THR becomes active.'), done: (s) => s.ac.athrActive },
  { id: 'ap', phase: 'takeoff', kind: 'action', view: 'front', ctl: ['AP1'], title: r('AP 1 — ON (по желанию)', 'AP 1 — ON (optional)'), hint: r('Выше 100 фт. Автопилот будет следовать директору.', 'Above 100 ft. AP follows the flight director.'), done: (s) => s.ac.ap, optional: true },
  { id: 'reach', phase: 'takeoff', kind: 'wait', view: 'front', title: r('Набор 3000 фт над аэродромом', 'Climb to 3000 ft above field'), hint: r('Следуйте директору, держите скорость V2+10 → 250.', 'Follow the FD, keep V2+10 → 250 kt.'), done: (s) => !s.ac.onGround && s.ac.alt - s.elev >= 3000 },
];

export const STEP_BY_ID: Record<string, Step> = Object.fromEntries(STEPS.map((x) => [x.id, x]));

export function stepVisible(s: SimState, st: Step) {
  return !st.show || st.show(s);
}

/** Флаги, вычисляемые по ходу (стабилизация N1, проверка тормозов и т.п.) */
export function updProcFlags(s: SimState, dt: number) {
  const f = s.flags;
  if (s.sw.ANN_LT === 2) f.annTestSeen = true;
  if (f.annTestSeen && s.sw.ANN_LT === 1) f.annTested = true;
  if (s.gnd.gpu) f.gpuUsed = true;
  if (s.elec.ext) f.extUsed = true;
  if (s.flags.elacFault && s.elec.dcBat && s.t > ((s.flags.powerOnT as number) ?? 1e9) + 8) f.elacSeen = true;
  if (s.apu.fault) f.apuFailedSeen = true;
  if (s.eng.some((e) => e.startFault)) f.startFaultSeen = true;
  const gsKt = s.ac.gs * KT;
  if ((s.gnd.phase === 'taxi' || s.gnd.phase === 'holding') && gsKt > 1.5 && gsKt < 15 && s.ac.brakes > 0.4) f.brakeChecked = true;
  if (s.gnd.phase === 'holding') f.atHold = true;
  if (s.gnd.phase === 'runway' && s.ac.onGround) {
    const n1 = s.eng.map((e) => e.n1);
    if (n1.every((x) => x > 44 && x < 62)) f.stab50T = ((f.stab50T as number) ?? 0) + dt;
    else if (!f.stab50) f.stab50T = 0;
    if ((f.stab50T as number) > 1.8) f.stab50 = true;
  }
  if (s.ecam.sdManual === 'STS' && s.eng[0].running && s.eng[1].running) f.stsAfter = true;
  void irOk;
}
