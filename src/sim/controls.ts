import type { L, ViewId } from './types';

export type CtlKind =
  | 'pb' // фиксируемая кнопка (нажата = 1)
  | 'pbm' // кнопка без фиксации
  | 'guard' // кнопка под защитной крышкой, фиксируемая
  | 'guardm' // кнопка под крышкой без фиксации
  | 'toggle' // тумблер (позиции снизу вверх)
  | 'rotary' // галетный переключатель
  | 'knob' // плавная ручка 0..1
  | 'lever';

export type LegColor = 'amber' | 'white' | 'blue' | 'green' | 'red' | 'cyan';
export interface Legend {
  t: string;
  c: LegColor;
}

export interface CtlDef {
  id: string;
  kind: CtlKind;
  view: ViewId;
  label: string;
  name: L;
  desc?: L;
  pos?: string[];
  def: number;
  up?: Legend;
  lo?: Legend;
}

const FAULT: Legend = { t: 'FAULT', c: 'amber' };
const OFF: Legend = { t: 'OFF', c: 'white' };
const ON: Legend = { t: 'ON', c: 'blue' };

const defs: CtlDef[] = [];

function add(d: CtlDef) {
  defs.push(d);
}
function pb(
  id: string,
  view: ViewId,
  label: string,
  ru: string,
  en: string,
  def: number,
  up?: Legend,
  lo?: Legend,
  desc?: L,
  kind: CtlKind = 'pb',
) {
  add({ id, kind, view, label, name: { ru, en }, def, up, lo, desc });
}
function sel(
  id: string,
  view: ViewId,
  kind: CtlKind,
  label: string,
  ru: string,
  en: string,
  pos: string[],
  def: number,
  desc?: L,
) {
  add({ id, kind, view, label, name: { ru, en }, pos, def, desc });
}

// ===================== OVERHEAD =====================
// ADIRS
for (const i of [1, 2, 3]) {
  pb(`ADR${i}`, 'ovhd', `ADR ${i}`, `Вычислитель воздушных данных ADR ${i}`, `Air data reference ${i}`, 1, FAULT, OFF);
  pb(`IR${i}`, 'ovhd', `IR ${i}`, `Инерциальная система IR ${i}`, `Inertial reference ${i}`, 1, FAULT, { t: 'ALIGN', c: 'white' });
  sel(`IR${i}_MODE`, 'ovhd', 'rotary', `IR ${i}`, `Режим IR ${i} (OFF/NAV/ATT)`, `IR ${i} mode selector`, ['OFF', 'NAV', 'ATT'], 0, {
    ru: 'NAV — нормальный режим. Выставка занимает несколько минут, самолёт нельзя двигать.',
    en: 'NAV is the normal mode. Alignment takes several minutes; do not move the aircraft.',
  });
}
// FLT CTL
for (const id of ['ELAC1', 'SEC1', 'FAC1', 'ELAC2', 'SEC2', 'SEC3', 'FAC2']) {
  const lbl = id.replace(/(\d)/, ' $1');
  pb(id, 'ovhd', lbl, `Компьютер управления ${lbl}`, `Flight control computer ${lbl}`, 1, FAULT, OFF, {
    ru: 'Нормально — нажата, лампы погашены. Сброс при отказе: OFF, затем ON.',
    en: 'Normal: pressed in, lights out. Reset on fault: OFF then ON.',
  });
}
// EVAC
pb('EVAC_CMD', 'ovhd', 'COMMAND', 'Команда эвакуации', 'Evacuation command', 0, { t: 'EVAC', c: 'red' }, ON, undefined, 'guard');
pb('EVAC_HORN', 'ovhd', 'HORN SHUT OFF', 'Отключение сирены эвакуации', 'Evac horn shut off', 0, undefined, undefined, undefined, 'pbm');
sel('EVAC_CAPT', 'ovhd', 'toggle', 'CAPT & PURS', 'Кто может дать команду эвакуации', 'Evac command authority', ['CAPT', 'CAPT & PURS'], 1);
// EMER ELEC
pb('EMER_GEN_TEST', 'ovhd', 'EMER GEN TEST', 'Тест аварийного генератора', 'Emergency generator test', 0, undefined, undefined, undefined, 'guardm');
pb('GEN1_LINE', 'ovhd', 'GEN 1 LINE', 'Линия генератора 1 (дым)', 'Gen 1 line', 1, { t: 'SMOKE', c: 'amber' }, OFF);
pb('RAT_EMER', 'ovhd', 'RAT & EMER GEN', 'Ручной выпуск RAT', 'RAT & emer gen manual on', 0, FAULT, undefined, undefined, 'guardm');
// GPWS
pb('GPWS_SYS', 'ovhd', 'SYS', 'GPWS — система', 'GPWS system', 1, FAULT, OFF);
pb('GPWS_GS', 'ovhd', 'G/S MODE', 'GPWS — режим глиссады', 'GPWS G/S mode', 1, undefined, OFF);
pb('GPWS_FLAP', 'ovhd', 'FLAP MODE', 'GPWS — режим закрылков', 'GPWS flap mode', 1, undefined, OFF);
pb('GPWS_LDG3', 'ovhd', 'LDG FLAP 3', 'GPWS — посадка с закрылками 3', 'GPWS landing flap 3', 0, undefined, ON);
pb('GPWS_TERR', 'ovhd', 'TERR', 'GPWS — рельеф', 'GPWS terrain', 1, FAULT, OFF);
// RCDR
pb('RCDR_GND', 'ovhd', 'GND CTL', 'Включение регистраторов на земле', 'Recorder ground control', 0, undefined, ON, {
  ru: 'Включает бортовые регистраторы (CVR/DFDR) на земле.',
  en: 'Powers CVR and DFDR on ground.',
});
pb('CVR_ERASE', 'ovhd', 'CVR ERASE', 'Стирание CVR', 'CVR erase', 0, undefined, undefined, undefined, 'pbm');
pb('CVR_TEST', 'ovhd', 'CVR TEST', 'Тест CVR', 'CVR test', 0, undefined, undefined, undefined, 'pbm');
// OXYGEN
pb('OXY_MASK', 'ovhd', 'MASK MAN ON', 'Выброс кислородных масок', 'Pax mask manual release', 0, undefined, undefined, undefined, 'guardm');
pb('OXY_CREW', 'ovhd', 'CREW SUPPLY', 'Подача кислорода экипажу', 'Crew oxygen supply', 0, undefined, OFF, {
  ru: 'Должна быть нажата (лампа OFF погашена) — открывает подачу кислорода к маскам экипажа.',
  en: 'Must be pressed in (OFF light out) to supply crew masks.',
});
// CALLS
for (const c of ['MECH', 'FWD', 'AFT', 'ALL']) {
  pb(`CALL_${c}`, 'ovhd', c, `Вызов ${c}`, `Call ${c}`, 0, undefined, undefined, undefined, 'pbm');
}
// WIPERS
sel('WIPER_L', 'ovhd', 'rotary', 'WIPER', 'Стеклоочиститель КВС', 'Capt wiper', ['OFF', 'SLOW', 'FAST'], 0);
sel('WIPER_R', 'ovhd', 'rotary', 'WIPER', 'Стеклоочиститель 2П', 'F/O wiper', ['OFF', 'SLOW', 'FAST'], 0);
pb('RAIN_L', 'ovhd', 'RAIN RPLNT', 'Водоотталкивающая жидкость', 'Rain repellent', 0, undefined, undefined, undefined, 'pbm');
pb('RAIN_R', 'ovhd', 'RAIN RPLNT', 'Водоотталкивающая жидкость', 'Rain repellent', 0, undefined, undefined, undefined, 'pbm');

// FIRE
for (const e of ['ENG1', 'ENG2', 'APU']) {
  const nm = e === 'APU' ? 'APU' : e.replace('ENG', 'ENG ');
  pb(`${e}_FIRE`, 'ovhd', `${nm} FIRE`, `Пожарная кнопка ${nm}`, `${nm} fire pushbutton`, 0, undefined, undefined, {
    ru: 'Под крышкой. Нажатие отключает топливо, отбор, генератор и взводит баллоны. Только при пожаре!',
    en: 'Guarded. Pushing cuts fuel, bleed, generator and arms the extinguishers. Fire only!',
  }, 'guard');
  pb(`${e}_AGENT1`, 'ovhd', e === 'APU' ? 'AGENT' : 'AGENT 1', `Огнетушитель ${e === 'APU' ? '' : '1 '}${nm}`, `${nm} agent ${e === 'APU' ? '' : '1'}`, 0,
    { t: 'SQUIB', c: 'white' }, { t: 'DISCH', c: 'amber' }, undefined, 'pbm');
  if (e !== 'APU')
    pb(`${e}_AGENT2`, 'ovhd', 'AGENT 2', `Огнетушитель 2 ${nm}`, `${nm} agent 2`, 0, { t: 'SQUIB', c: 'white' }, { t: 'DISCH', c: 'amber' }, undefined, 'pbm');
  pb(`${e}_FIRE_TEST`, 'ovhd', 'TEST', `Тест пожарной сигнализации ${nm}`, `${nm} fire test`, 0, undefined, undefined, {
    ru: 'Нажмите и удерживайте: загорятся FIRE, SQUIB, DISCH, прозвучит сигнал, на ECAM — сообщение FIRE.',
    en: 'Press and hold: FIRE, SQUIB and DISCH lights, CRC and ECAM FIRE warning.',
  }, 'pbm');
}

// HYD
pb('HYD_G_ENG1', 'ovhd', 'ENG 1 PUMP', 'Насос ДВ1 зелёной системы', 'Green ENG 1 pump', 1, FAULT, OFF);
pb('HYD_B_ELEC', 'ovhd', 'ELEC PUMP', 'Электронасос синей системы', 'Blue elec pump', 1, FAULT, OFF);
pb('HYD_PTU', 'ovhd', 'PTU', 'Блок перекачки PTU', 'Power transfer unit', 1, FAULT, OFF, {
  ru: 'PTU передаёт давление между зелёной и жёлтой системами без перекачки жидкости ("лай собаки").',
  en: 'PTU transfers pressure between green and yellow systems (the "barking dog").',
});
pb('HYD_Y_ENG2', 'ovhd', 'ENG 2 PUMP', 'Насос ДВ2 жёлтой системы', 'Yellow ENG 2 pump', 1, FAULT, OFF);
pb('HYD_Y_ELEC', 'ovhd', 'ELEC PUMP', 'Электронасос жёлтой системы', 'Yellow elec pump', 0, FAULT, ON, {
  ru: 'Используется на земле: подкачка аккумулятора тормозов, грузовые двери. Нормально выключен.',
  en: 'Used on ground to charge the brake accumulator and for cargo doors. Normally off.',
});
pb('HYD_RAT', 'ovhd', 'RAT MAN ON', 'Ручной выпуск RAT', 'RAT manual on', 0, undefined, undefined, undefined, 'guardm');

// FUEL
const pumpDesc: L = {
  ru: 'Подкачивающий насос. Включён = нажат, лампы погашены.',
  en: 'Booster pump. On = pressed in, lights out.',
};
pb('FUEL_L1', 'ovhd', 'L TK PUMP 1', 'Насос левого бака 1', 'Left tank pump 1', 0, FAULT, OFF, pumpDesc);
pb('FUEL_L2', 'ovhd', 'L TK PUMP 2', 'Насос левого бака 2', 'Left tank pump 2', 0, FAULT, OFF, pumpDesc);
pb('FUEL_C1', 'ovhd', 'CTR TK PUMP 1', 'Насос центрального бака 1', 'Center tank pump 1', 0, FAULT, OFF, pumpDesc);
pb('FUEL_C2', 'ovhd', 'CTR TK PUMP 2', 'Насос центрального бака 2', 'Center tank pump 2', 0, FAULT, OFF, pumpDesc);
pb('FUEL_R1', 'ovhd', 'R TK PUMP 1', 'Насос правого бака 1', 'Right tank pump 1', 0, FAULT, OFF, pumpDesc);
pb('FUEL_R2', 'ovhd', 'R TK PUMP 2', 'Насос правого бака 2', 'Right tank pump 2', 0, FAULT, OFF, pumpDesc);
pb('FUEL_MODE', 'ovhd', 'MODE SEL', 'Режим центральных насосов', 'Center pumps mode', 0, FAULT, { t: 'MAN', c: 'white' }, {
  ru: 'AUTO (отжата, лампы погашены) — центральные насосы управляются автоматически.',
  en: 'AUTO (lights out): center pumps are controlled automatically.',
});
pb('FUEL_XFEED', 'ovhd', 'X FEED', 'Кран кольцевания', 'Crossfeed valve', 0, { t: 'OPEN', c: 'green' }, { t: 'ON', c: 'white' });

// ELEC
pb('BAT1', 'ovhd', 'BAT 1', 'Аккумулятор 1', 'Battery 1', 0, FAULT, OFF, {
  ru: 'Перед включением проверьте напряжение: не ниже 25,5 В.',
  en: 'Check voltage before switching on: at least 25.5 V.',
});
pb('BAT2', 'ovhd', 'BAT 2', 'Аккумулятор 2', 'Battery 2', 0, FAULT, OFF, {
  ru: 'Перед включением проверьте напряжение: не ниже 25,5 В.',
  en: 'Check voltage before switching on: at least 25.5 V.',
});
pb('IDG1', 'ovhd', 'IDG 1', 'Отключение привода IDG 1', 'IDG 1 disconnect', 0, FAULT, undefined, {
  ru: 'Под крышкой! Отключение IDG необратимо в полёте. Не трогать без причины.',
  en: 'Guarded! IDG disconnection cannot be reset in flight. Do not touch.',
}, 'guardm');
pb('IDG2', 'ovhd', 'IDG 2', 'Отключение привода IDG 2', 'IDG 2 disconnect', 0, FAULT, undefined, {
  ru: 'Под крышкой! Отключение IDG необратимо в полёте. Не трогать без причины.',
  en: 'Guarded! IDG disconnection cannot be reset in flight. Do not touch.',
}, 'guardm');
pb('GEN1', 'ovhd', 'GEN 1', 'Генератор 1', 'Generator 1', 1, FAULT, OFF);
pb('GEN2', 'ovhd', 'GEN 2', 'Генератор 2', 'Generator 2', 1, FAULT, OFF);
pb('APU_GEN', 'ovhd', 'APU GEN', 'Генератор ВСУ', 'APU generator', 1, FAULT, OFF);
pb('BUS_TIE', 'ovhd', 'BUS TIE', 'Связь шин AC', 'Bus tie', 1, undefined, OFF);
pb('EXT_PWR', 'ovhd', 'EXT PWR', 'Наземное питание', 'External power', 0, { t: 'AVAIL', c: 'green' }, ON, {
  ru: 'AVAIL (зелёный) — питание аэродромного агрегата подано. Нажмите, чтобы подключить к сети.',
  en: 'AVAIL (green): GPU is connected. Press to connect it to the network.',
});
pb('AC_ESS_FEED', 'ovhd', 'AC ESS FEED', 'Питание шины AC ESS', 'AC ESS feed', 1, FAULT, { t: 'ALTN', c: 'white' });
pb('GALY_CAB', 'ovhd', 'GALY & CAB', 'Камбуз и салон', 'Galley & cabin', 1, FAULT, OFF);
pb('COMMERCIAL', 'ovhd', 'COMMERCIAL', 'Коммерческие потребители', 'Commercial', 1, undefined, OFF);

// AIR COND
for (const [id, lbl, ru] of [
  ['TEMP_CKPT', 'COCKPIT', 'кабины экипажа'],
  ['TEMP_FWD', 'FWD CABIN', 'переднего салона'],
  ['TEMP_AFT', 'AFT CABIN', 'заднего салона'],
] as const) {
  sel(id, 'ovhd', 'knob', lbl, `Температура ${ru}`, `${lbl} temperature`, ['COLD', 'HOT'], 0.5);
}
pb('HOT_AIR', 'ovhd', 'HOT AIR', 'Подмес горячего воздуха', 'Hot air', 1, FAULT, OFF);
sel('PACK_FLOW', 'ovhd', 'rotary', 'PACK FLOW', 'Расход кондиционеров', 'Pack flow', ['LO', 'NORM', 'HI'], 1);
pb('PACK1', 'ovhd', 'PACK 1', 'Кондиционер 1', 'Pack 1', 1, FAULT, OFF);
pb('PACK2', 'ovhd', 'PACK 2', 'Кондиционер 2', 'Pack 2', 1, FAULT, OFF);
pb('ENG1_BLEED', 'ovhd', 'ENG 1 BLEED', 'Отбор воздуха ДВ1', 'Engine 1 bleed', 1, FAULT, OFF);
pb('ENG2_BLEED', 'ovhd', 'ENG 2 BLEED', 'Отбор воздуха ДВ2', 'Engine 2 bleed', 1, FAULT, OFF);
pb('APU_BLEED', 'ovhd', 'APU BLEED', 'Отбор воздуха ВСУ', 'APU bleed', 0, FAULT, ON, {
  ru: 'Включайте, когда ВСУ готова (APU AVAIL). Воздух нужен для запуска двигателей и кондиционеров.',
  en: 'Switch on once APU AVAIL. Air is needed for engine start and packs.',
});
sel('XBLEED', 'ovhd', 'rotary', 'X BLEED', 'Кран перекрёстного отбора', 'Crossbleed selector', ['SHUT', 'AUTO', 'OPEN'], 1, {
  ru: 'AUTO: кран открыт, когда работает отбор от ВСУ — так воздух ВСУ доходит до двигателя 2.',
  en: 'AUTO: valve opens with APU bleed so APU air reaches engine 2.',
});
pb('RAM_AIR', 'ovhd', 'RAM AIR', 'Заслонка забортного воздуха', 'Ram air', 0, undefined, ON, undefined, 'guard');

// ANTI ICE
pb('WING_AI', 'ovhd', 'WING', 'ПОС крыла', 'Wing anti-ice', 0, FAULT, ON);
pb('ENG1_AI', 'ovhd', 'ENG 1', 'ПОС двигателя 1', 'Engine 1 anti-ice', 0, FAULT, ON);
pb('ENG2_AI', 'ovhd', 'ENG 2', 'ПОС двигателя 2', 'Engine 2 anti-ice', 0, FAULT, ON);
pb('PROBE_HEAT', 'ovhd', 'PROBE/WINDOW HEAT', 'Обогрев ПВД и стёкол', 'Probe/window heat', 0, undefined, ON, {
  ru: 'Отжата — AUTO (включается при работающем двигателе). ON — принудительно.',
  en: 'Released = AUTO (on when an engine runs). ON = manual.',
});
// CABIN PRESS
sel('MAN_VS', 'ovhd', 'toggle', 'MAN V/S CTL', 'Ручное управление клапаном', 'Manual V/S control', ['DN', '—', 'UP'], 1);
pb('PRESS_MODE', 'ovhd', 'MODE SEL', 'Режим САРД', 'Pressurisation mode', 0, FAULT, { t: 'MAN', c: 'white' });
sel('LDG_ELEV', 'ovhd', 'rotary', 'LDG ELEV', 'Высота аэродрома посадки', 'Landing elevation', ['AUTO', '-2', '0', '2', '4', '6', '8', '10', '12', '14'], 0);
pb('DITCHING', 'ovhd', 'DITCHING', 'Посадка на воду', 'Ditching', 0, undefined, ON, undefined, 'guard');

// EXT LT
sel('STROBE', 'ovhd', 'toggle', 'STROBE', 'Стробоскопы', 'Strobe lights', ['OFF', 'AUTO', 'ON'], 0);
sel('BEACON', 'ovhd', 'toggle', 'BEACON', 'Проблесковый маяк', 'Beacon', ['OFF', 'ON'], 0, {
  ru: 'Включается перед буксировкой/запуском двигателей — сигнал наземному персоналу.',
  en: 'On before pushback/engine start — warns ground staff.',
});
sel('WING_LT', 'ovhd', 'toggle', 'WING', 'Освещение крыла', 'Wing lights', ['OFF', 'ON'], 0);
sel('NAV_LOGO', 'ovhd', 'toggle', 'NAV & LOGO', 'Навигационные огни и логотип', 'Nav & logo lights', ['OFF', '1', '2'], 0);
sel('RWY_TURNOFF', 'ovhd', 'toggle', 'RWY TURN OFF', 'Боковые рулёжные фары', 'Runway turn-off lights', ['OFF', 'ON'], 0);
sel('LAND_L', 'ovhd', 'toggle', 'LAND L', 'Посадочная фара левая', 'Left landing light', ['RETRACT', 'OFF', 'ON'], 0);
sel('LAND_R', 'ovhd', 'toggle', 'LAND R', 'Посадочная фара правая', 'Right landing light', ['RETRACT', 'OFF', 'ON'], 0);
sel('NOSE_LT', 'ovhd', 'toggle', 'NOSE', 'Фара передней стойки', 'Nose light', ['OFF', 'TAXI', 'T.O'], 0);
// APU
pb('APU_MASTER', 'ovhd', 'MASTER SW', 'Главный выключатель ВСУ', 'APU master switch', 0, FAULT, ON, {
  ru: 'Включает питание ВСУ и открывает воздухозаборник. Через ~3 с можно жать START.',
  en: 'Powers the APU and opens the air intake flap. Press START a few seconds later.',
});
pb('APU_START', 'ovhd', 'START', 'Запуск ВСУ', 'APU start', 0, ON, { t: 'AVAIL', c: 'green' }, {
  ru: 'ON (синий) — идёт запуск. AVAIL (зелёный) — ВСУ готова, N ≥ 95 %.',
  en: 'ON (blue): starting. AVAIL (green): APU ready, N ≥ 95%.',
}, 'pbm');
// SIGNS
sel('SEAT_BELTS', 'ovhd', 'toggle', 'SEAT BELTS', 'Табло «Пристегнуть ремни»', 'Seat belts sign', ['OFF', 'ON'], 0);
sel('NO_SMOKING', 'ovhd', 'toggle', 'NO SMOKING', 'Табло «Не курить»', 'No smoking sign', ['OFF', 'AUTO', 'ON'], 0);
sel('EMER_EXIT_LT', 'ovhd', 'toggle', 'EMER EXIT LT', 'Аварийное освещение', 'Emergency exit lights', ['OFF', 'ARM', 'ON'], 0);
// INT LT
sel('OVHD_INTEG', 'ovhd', 'knob', 'OVHD INTEG LT', 'Подсветка верхнего пульта', 'Overhead integral light', ['OFF', 'BRT'], 0.7);
sel('ICE_IND', 'ovhd', 'toggle', 'ICE IND & STBY COMPASS', 'Индикатор обледенения и компас', 'Ice ind & stby compass', ['OFF', 'ON'], 0);
sel('DOME', 'ovhd', 'toggle', 'DOME', 'Плафон кабины', 'Dome light', ['OFF', 'DIM', 'BRT'], 0);
sel('ANN_LT', 'ovhd', 'toggle', 'ANN LT', 'Табло сигнализации', 'Annunciator lights', ['DIM', 'BRT', 'TEST'], 1, {
  ru: 'TEST — проверка всех ламп кабины.',
  en: 'TEST: all cockpit annunciators illuminate.',
});
// VENT
pb('BLOWER', 'ovhd', 'BLOWER', 'Вентилятор авионики', 'Avionics blower', 0, FAULT, { t: 'OVRD', c: 'white' });
pb('EXTRACT', 'ovhd', 'EXTRACT', 'Вытяжной вентилятор', 'Avionics extract', 0, FAULT, { t: 'OVRD', c: 'white' });
pb('CAB_FANS', 'ovhd', 'CAB FANS', 'Вентиляторы рециркуляции', 'Cabin fans', 1, undefined, OFF);
// ENG (overhead)
pb('ENG1_MAN_START', 'ovhd', 'MAN START 1', 'Ручной запуск ДВ1', 'Engine 1 manual start', 0, undefined, ON, {
  ru: 'Ручной запуск: открывает клапан стартера. Для обычного запуска не нужен.',
  en: 'Manual start: opens the start valve. Not used for a normal auto start.',
});
pb('ENG2_MAN_START', 'ovhd', 'MAN START 2', 'Ручной запуск ДВ2', 'Engine 2 manual start', 0, undefined, ON, {
  ru: 'Ручной запуск: открывает клапан стартера. Для обычного запуска не нужен.',
  en: 'Manual start: opens the start valve. Not used for a normal auto start.',
});
pb('N1_MODE1', 'ovhd', 'N1 MODE 1', 'Резервный режим N1 ДВ1', 'Engine 1 N1 mode', 0, FAULT, ON);
pb('N1_MODE2', 'ovhd', 'N1 MODE 2', 'Резервный режим N1 ДВ2', 'Engine 2 N1 mode', 0, FAULT, ON);
// CARGO
pb('CARGO_SMOKE_TEST', 'ovhd', 'TEST', 'Тест дымовой сигнализации', 'Cargo smoke test', 0, undefined, undefined, undefined, 'pbm');
pb('CARGO_ISOL', 'ovhd', 'AFT ISOL VALVE', 'Изоляционный клапан заднего отсека', 'Aft isol valve', 1, FAULT, OFF);
pb('CARGO_HOT_AIR', 'ovhd', 'HOT AIR', 'Обогрев грузового отсека', 'Cargo hot air', 1, FAULT, OFF);
sel('CARGO_TEMP', 'ovhd', 'knob', 'AFT', 'Температура грузового отсека', 'Cargo temperature', ['COLD', 'HOT'], 0.5);

// ===================== FRONT =====================
pb('MASTER_WARN', 'front', 'MASTER WARN', 'Главная аварийная сигнализация', 'Master warning', 0, { t: 'MASTER', c: 'red' }, { t: 'WARN', c: 'red' }, {
  ru: 'Нажмите, чтобы погасить и отключить звуковой сигнал.',
  en: 'Press to reset the light and silence the aural.',
}, 'pbm');
pb('MASTER_CAUT', 'front', 'MASTER CAUT', 'Главная предупреждающая сигнализация', 'Master caution', 0, { t: 'MASTER', c: 'amber' }, { t: 'CAUT', c: 'amber' }, undefined, 'pbm');
pb('CHRONO', 'front', 'CHRONO', 'Секундомер', 'Chrono', 0, undefined, undefined, undefined, 'pbm');
pb('FD', 'front', 'FD', 'Директорные стрелки', 'Flight director', 0, undefined, { t: '▬', c: 'green' }, {
  ru: 'Включите FD — на PFD появятся директорные планки и режимы FMA.',
  en: 'FD on: flight director bars and FMA modes on the PFD.',
});
pb('LS', 'front', 'LS', 'Курсоглиссадные шкалы', 'Landing system', 0, undefined, { t: '▬', c: 'green' });
for (const k of ['CSTR', 'WPT', 'VORD', 'NDB', 'ARPT']) {
  pb(`EFIS_${k}`, 'front', k === 'VORD' ? 'VOR.D' : k, `Отображение ${k} на ND`, `ND ${k} display`, 0, undefined, { t: '▬', c: 'green' });
}
sel('BARO_STD', 'front', 'pbm', 'BARO', 'Барометр: QNH / STD', 'Baro reference', ['QNH', 'STD'], 0, {
  ru: 'Колесо/клики — изменить давление. Кнопка PULL/PUSH — QNH ⇄ STD.',
  en: 'Wheel/click to change pressure. PULL/PUSH toggles QNH ⇄ STD.',
});
sel('BARO_UNIT', 'front', 'toggle', 'inHg | hPa', 'Единицы давления', 'Baro units', ['inHg', 'hPa'], 1);
sel('ND_MODE', 'front', 'rotary', 'MODE', 'Режим ND', 'ND mode', ['LS', 'VOR', 'NAV', 'ARC', 'PLAN'], 2);
sel('ND_RANGE', 'front', 'rotary', 'RANGE', 'Масштаб ND', 'ND range', ['10', '20', '40', '80', '160', '320'], 4);
sel('ADF_VOR1', 'front', 'toggle', '1', 'Стрелка 1 на ND', 'ND needle 1', ['ADF', 'OFF', 'VOR'], 1);
sel('ADF_VOR2', 'front', 'toggle', '2', 'Стрелка 2 на ND', 'ND needle 2', ['ADF', 'OFF', 'VOR'], 1);
pb('SPD_MACH', 'front', 'SPD MACH', 'Скорость / число М', 'Speed / Mach', 0, undefined, undefined, undefined, 'pbm');
pb('HDG_TRK', 'front', 'HDG-V/S TRK-FPA', 'Курс / путь', 'HDG / TRK', 0, undefined, undefined, undefined, 'pbm');
pb('LOC', 'front', 'LOC', 'Режим LOC', 'LOC mode', 0, undefined, { t: '▬', c: 'green' }, undefined, 'pbm');
pb('AP1', 'front', 'AP 1', 'Автопилот 1', 'Autopilot 1', 0, undefined, { t: '▬', c: 'green' }, {
  ru: 'Автопилот можно включить через 5 с после отрыва, выше 100 фт.',
  en: 'AP can be engaged 5 s after lift-off, above 100 ft.',
}, 'pbm');
pb('AP2', 'front', 'AP 2', 'Автопилот 2', 'Autopilot 2', 0, undefined, { t: '▬', c: 'green' }, undefined, 'pbm');
pb('ATHR', 'front', 'A/THR', 'Автомат тяги', 'Autothrust', 0, undefined, { t: '▬', c: 'green' }, undefined, 'pbm');
pb('EXPED', 'front', 'EXPED', 'Ускоренный набор', 'Expedite', 0, undefined, { t: '▬', c: 'green' }, undefined, 'pbm');
pb('APPR', 'front', 'APPR', 'Режим захода', 'Approach mode', 0, undefined, { t: '▬', c: 'green' }, undefined, 'pbm');
pb('METRIC', 'front', 'METRIC ALT', 'Высота в метрах', 'Metric altitude', 0, undefined, undefined, undefined, 'pb');
sel('SPD_KNOB', 'front', 'knob', 'SPD', 'Ручка скорости FCU', 'FCU speed knob', [], 0);
sel('HDG_KNOB', 'front', 'knob', 'HDG', 'Ручка курса FCU', 'FCU heading knob', [], 0);
sel('ALT_KNOB', 'front', 'knob', 'ALT', 'Ручка высоты FCU', 'FCU altitude knob', [], 0, {
  ru: 'Колесо мыши или клики слева/справа. Установите начальную высоту из разрешения ATC.',
  en: 'Mouse wheel or left/right clicks. Set the initial altitude from the ATC clearance.',
});
sel('ALT_INC', 'front', 'toggle', '100 | 1000', 'Шаг ручки высоты', 'Altitude increment', ['100', '1000'], 1);
sel('VS_KNOB', 'front', 'knob', 'V/S', 'Ручка вертикальной скорости', 'FCU V/S knob', [], 0);
sel('GEAR', 'front', 'lever', 'L/G', 'Рычаг шасси', 'Landing gear lever', ['UP', 'DOWN'], 1, {
  ru: 'Убирайте после «положительной скороподъёмности» (Positive climb).',
  en: 'Retract after "positive climb".',
});
pb('AB_LO', 'front', 'LO', 'Автоторможение LO', 'Autobrake LO', 0, { t: 'DECEL', c: 'green' }, ON, undefined, 'pbm');
pb('AB_MED', 'front', 'MED', 'Автоторможение MED', 'Autobrake MED', 0, { t: 'DECEL', c: 'green' }, ON, undefined, 'pbm');
pb('AB_MAX', 'front', 'MAX', 'Автоторможение MAX', 'Autobrake MAX', 0, { t: 'DECEL', c: 'green' }, ON, {
  ru: 'На взлёте — MAX: при прерванном взлёте торможение включится автоматически.',
  en: 'MAX for take-off: braking applies automatically in a rejected take-off.',
}, 'pbm');
sel('ASKID_NWS', 'front', 'toggle', 'A/SKID & N/W STRG', 'Антиюз и управление передней стойкой', 'Anti-skid & nosewheel steering', ['OFF', 'ON'], 1);
pb('BRK_FAN', 'front', 'BRK FAN', 'Вентилятор тормозов', 'Brake fans', 0, { t: 'HOT', c: 'amber' }, ON);
pb('TERR_ND', 'front', 'TERR ON ND', 'Рельеф на ND', 'Terrain on ND', 0, undefined, ON);

// ===================== PEDESTAL =====================
for (const p of ['ENG', 'BLEED', 'PRESS', 'ELEC', 'HYD', 'FUEL', 'APU', 'COND', 'DOOR', 'WHEEL', 'F/CTL', 'ALL', 'STS', 'RCL', 'CLR', 'EMER CANC', 'T.O CONFIG']) {
  const id = 'ECP_' + p.replace(/[^A-Z]/g, '');
  pb(id, 'ped', p, p === 'T.O CONFIG' ? 'Тест взлётной конфигурации' : `ECAM: ${p}`, `ECAM ${p}`, 0, undefined, p === 'CLR' ? { t: '', c: 'white' } : undefined,
    p === 'T.O CONFIG'
      ? { ru: 'Имитирует взлётную тягу: если конфигурация неверна — будет предупреждение.', en: 'Simulates take-off power: warns if configuration is wrong.' }
      : p === 'STS'
        ? { ru: 'Страница статуса систем (STATUS).', en: 'System status page.' }
        : undefined,
    'pbm');
}
sel('ENG1_MASTER', 'ped', 'lever', 'MASTER 1', 'ENG MASTER 1 (топливо/зажигание ДВ1)', 'Engine 1 master', ['OFF', 'ON'], 0, {
  ru: 'При MODE IGN/START — запускает автоматический запуск двигателя 1.',
  en: 'With MODE IGN/START it initiates the engine 1 auto start.',
});
sel('ENG2_MASTER', 'ped', 'lever', 'MASTER 2', 'ENG MASTER 2 (топливо/зажигание ДВ2)', 'Engine 2 master', ['OFF', 'ON'], 0, {
  ru: 'При MODE IGN/START — запускает автоматический запуск двигателя 2. По SOP первым запускают ДВ2.',
  en: 'With MODE IGN/START it initiates the engine 2 auto start. SOP: engine 2 first.',
});
sel('ENG_MODE', 'ped', 'rotary', 'MODE', 'Селектор режима двигателей', 'Engine mode selector', ['CRANK', 'NORM', 'IGN/START'], 1, {
  ru: 'IGN/START — включает FADEC и готовит запуск. После запуска вернуть в NORM.',
  en: 'IGN/START powers FADEC and arms start. Back to NORM after start.',
});
sel('TL1', 'ped', 'lever', 'THR 1', 'РУД двигателя 1', 'Thrust lever 1', [], 0, {
  ru: 'Перетаскивайте мышью или клавиши F1–F4 / PgUp / PgDn. Фиксаторы: IDLE, CL, FLX/MCT, TOGA.',
  en: 'Drag, or use F1–F4 / PgUp / PgDn. Detents: IDLE, CL, FLX/MCT, TOGA.',
});
sel('TL2', 'ped', 'lever', 'THR 2', 'РУД двигателя 2', 'Thrust lever 2', [], 0);
sel('SPD_BRK', 'ped', 'lever', 'SPEED BRAKE', 'Рычаг интерцепторов', 'Speed brake lever', ['ARM', 'RET', '1/2', 'FULL'], 1, {
  ru: 'ARM — взвести наземные интерцепторы перед взлётом.',
  en: 'ARM the ground spoilers before take-off.',
});
sel('FLAPS', 'ped', 'lever', 'FLAPS', 'Рычаг закрылков', 'Flaps lever', ['0', '1', '2', '3', 'FULL'], 0, {
  ru: 'Взлётная конфигурация по расчёту: CONF 1 (1+F).',
  en: 'Take-off configuration per data: CONF 1 (1+F).',
});
sel('PARK_BRK', 'ped', 'lever', 'PARK BRK', 'Стояночный тормоз', 'Parking brake', ['OFF', 'ON'], 1);
sel('PITCH_TRIM', 'ped', 'knob', 'PITCH TRIM', 'Колесо триммера стабилизатора', 'Pitch trim wheel', [], 0, {
  ru: 'Нужна гидравлика (G или Y). Установите значение THS из расчёта (например UP 0.8).',
  en: 'Needs hydraulics (G or Y). Set THS from take-off data (e.g. UP 0.8).',
});
sel('RUD_TRIM', 'ped', 'knob', 'RUD TRIM', 'Триммер руля направления', 'Rudder trim', [], 0);
pb('RUD_TRIM_RESET', 'ped', 'RESET', 'Сброс триммера руля', 'Rudder trim reset', 0, undefined, undefined, undefined, 'pbm');
pb('GRAVITY_CRANK', 'ped', 'GRVTY GEAR EXTN', 'Ручка аварийного выпуска шасси', 'Gravity gear extension crank', 0, undefined, undefined, {
  ru: 'Аварийный выпуск: рычаг шасси UP, затем 3 оборота ручки по часовой (3 нажатия), затем рычаг DOWN.',
  en: 'Gravity extension: gear lever UP, then 3 turns clockwise (3 presses), then lever DOWN.',
}, 'pbm');
sel('RMP_ON', 'ped', 'toggle', 'RMP 1', 'Радиопульт 1', 'Radio management panel 1', ['OFF', 'ON'], 0);
pb('RMP_XFER', 'ped', '⇄', 'Обмен частот', 'Transfer frequency', 0, undefined, undefined, undefined, 'pbm');
sel('RMP_KNOB', 'ped', 'knob', 'FREQ', 'Ручка частоты (внешняя — МГц, внутренняя — кГц)', 'Frequency knob', [], 0, {
  ru: 'Колесо мыши по внешнему кольцу — МГц, по центру — кГц.',
  en: 'Wheel on the outer ring: MHz, on the centre: kHz.',
});
sel('XPDR_MODE', 'ped', 'rotary', 'XPDR', 'Режим ответчика', 'Transponder mode', ['STBY', 'AUTO', 'ON'], 0);
sel('ALT_RPTG', 'ped', 'toggle', 'ALT RPTG', 'Передача высоты', 'Altitude reporting', ['OFF', 'ON'], 1);
sel('TCAS_MODE', 'ped', 'rotary', 'TCAS', 'Режим TCAS', 'TCAS mode', ['STBY', 'TA', 'TA/RA'], 0);
sel('TCAS_TRAFFIC', 'ped', 'rotary', 'TRAFFIC', 'Отображение трафика', 'Traffic display', ['THRT', 'ALL', 'ABV', 'BLW'], 1);
pb('XPDR_IDENT', 'ped', 'IDENT', 'Опознавание', 'Ident', 0, undefined, undefined, undefined, 'pbm');
pb('XPDR_CLR', 'ped', 'CLR', 'Сброс кода', 'Clear code', 0, undefined, undefined, undefined, 'pbm');
for (let i = 0; i <= 7; i++) pb(`XPDR_${i}`, 'ped', String(i), `Код ответчика: ${i}`, `Squawk digit ${i}`, 0, undefined, undefined, undefined, 'pbm');
sel('WX_SYS', 'ped', 'rotary', 'SYS', 'Метеорадар', 'Weather radar', ['1', 'OFF', '2'], 1);
sel('WX_PWS', 'ped', 'toggle', 'PWS', 'Сигнализация сдвига ветра', 'Predictive windshear', ['OFF', 'AUTO'], 0);
sel('WX_MODE', 'ped', 'rotary', 'MODE', 'Режим радара', 'Radar mode', ['WX', 'WX+T', 'TURB', 'MAP'], 0);

export const CONTROLS: Record<string, CtlDef> = Object.fromEntries(defs.map((d) => [d.id, d]));

export function defaultSwitches(): Record<string, number> {
  const sw: Record<string, number> = {};
  for (const d of defs) sw[d.id] = d.def;
  return sw;
}

export function ctl(id: string): CtlDef {
  const d = CONTROLS[id];
  if (!d) throw new Error('Unknown control ' + id);
  return d;
}
