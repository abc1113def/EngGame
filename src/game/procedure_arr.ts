import { ilsDev, KT, speeds } from '../sim/flight';
import { SCN_ARR } from '../sim/scenario';
import type { L, SimState } from '../sim/types';
import type { Step } from './procedure';

const r = (ru: string, en: string): L => ({ ru, en });
const parked = (s: SimState) => s.gnd.phase === 'parked';
const engOff = (s: SimState) => s.eng.every((e) => e.n2 < 12);
const agl = (s: SimState) => s.ac.alt - s.elev;

/** Прилёт A320: заход ILS 06 в LFPO, посадка, заруливание и обесточивание */
export const STEPS_ARR: Step[] = [
  // ===================== подготовка к заходу =====================
  { id: 'a_atis', phase: 'appr', kind: 'comm', view: 'comms', title: r('ATIS Орли — 126.500', 'Orly ATIS — 126.500'), hint: r('На RMP 126.500 уже стоит в STBY: нажмите ⇄, прослушайте ATIS и верните частоту Подхода 118.850.', '126.500 is already in STBY: press ⇄, listen, then swap back to Approach 118.850.'), done: (s) => s.atc.arrAtis },
  { id: 'a_baro', phase: 'appr', kind: 'action', view: 'front', ctl: ['BARO_STD'], title: r('BARO — QNH Орли (ниже эшелона перехода)', 'BARO — Orly QNH (below transition level)'), hint: r('Сейчас стоит STD (мигает). Кнопка PUSH/PULL, затем колесом — QNH из ATIS.', 'STD is set (flashing). Push the knob, then dial the ATIS QNH.'), done: (s) => s.atc.arrAtis && !s.fcu.baroStd && s.fcu.baro === s.atc.arrQnh, req: ['a_atis'] },
  { id: 'a_perf', phase: 'appr', kind: 'action', view: 'mcdu', title: r('MCDU PERF APPR: QNH и BARO 491', 'MCDU PERF APPR: QNH and BARO 491'), hint: r('PERF → страница APPR: QNH (LSK 1L), минимум BARO 491 (LSK 2R). Минимум появится на PFD.', 'PERF → APPR page: QNH (LSK 1L), BARO minimum 491 (LSK 2R). Shown on the PFD.'), done: (s) => s.fms.qnhAppr === s.atc.arrQnh && s.fms.mda === SCN_ARR.da },
  { id: 'a_belts', phase: 'appr', kind: 'action', view: 'ovhd', ctl: ['SEAT_BELTS'], title: r('SEAT BELTS — ON', 'SEAT BELTS — ON'), hint: r('Табло «Пристегнуть ремни» перед заходом.', 'Seat belt sign for the approach.'), done: (s) => s.sw.SEAT_BELTS === 1 },
  { id: 'a_ldglt', phase: 'appr', kind: 'action', view: 'ovhd', ctl: ['LAND_L', 'LAND_R', 'NOSE_LT'], title: r('Свет: LAND L/R — ON, NOSE — T.O', 'Lights: LAND L/R ON, NOSE T.O'), hint: r('Посадочные фары включают ниже FL100.', 'Landing lights on below FL100.'), done: (s) => s.sw.LAND_L === 2 && s.sw.LAND_R === 2 && s.sw.NOSE_LT === 2 },
  { id: 'a_ls', phase: 'appr', kind: 'action', view: 'front', ctl: ['LS'], title: r('LS — ON (шкалы ILS на PFD)', 'LS — ON (ILS scales on the PFD)'), hint: r('Кнопка LS на панели EFIS.', 'LS on the EFIS panel.'), done: (s) => s.fcu.ls },
  { id: 'a_ab', phase: 'appr', kind: 'action', view: 'front', ctl: ['AB_LO', 'AB_MED'], title: r('AUTO BRK — LO или MED', 'AUTO BRK — LO or MED'), hint: r('Для ВПП 06 (3320 м) достаточно LO. MAX на посадке не используют.', 'LO is enough for runway 06 (3320 m). MAX is not used for landing.'), done: (s) => s.ac.autobrk === 1 || s.ac.autobrk === 2 },
  { id: 'a_cl_appr', phase: 'appr', kind: 'checklist', view: 'checklist', title: r('Чек-лист APPROACH', 'APPROACH checklist'), hint: r('Вкладка «Чек-листы».', 'Checklists tab.'), done: (s) => !!s.flags.cl_APPROACH },
  { id: 'a_appr', phase: 'appr', kind: 'action', view: 'front', ctl: ['APPR'], title: r('APPR — нажать (взвести LOC и G/S)', 'APPR — press (arm LOC and G/S)'), hint: r('На FMA появятся синие LOC и G/S. Глиссада захватится, когда подойдёт сверху.', 'Blue LOC and G/S appear on the FMA. The glideslope is captured as it comes down to you.'), done: (s) => s.fcu.appr || !!s.flags.gsCap },
  { id: 'a_est', phase: 'appr', kind: 'comm', view: 'comms', title: r('Подход: «На курсе ILS 06»', 'Approach: "established ILS 06"'), hint: r('После захвата LOC (зелёный LOC на FMA). Вас передадут Вышке 120.500.', 'After LOC capture (green LOC on the FMA). You will be handed to Tower 120.500.'), done: (s) => !!s.flags.estReported },
  { id: 'a_twr', phase: 'appr', kind: 'comm', view: 'comms', title: r('Вышка 120.500: получить разрешение на посадку', 'Tower 120.500: obtain landing clearance'), hint: r('Настройте 120.500 и доложите на заходе.', 'Tune 120.500 and report on final.'), done: (s) => s.atc.ldgClear },
  // ===================== заход =====================
  { id: 'a_f1', phase: 'final', kind: 'action', view: 'ped', ctl: ['FLAPS'], title: r('FLAPS 1 (ниже 230 уз)', 'FLAPS 1 (below 230 kt)'), hint: r('Скорость начнёт уменьшаться к S. Совет: выпускайте механизацию заранее — на глиссаде A320 тормозится плохо.', 'Speed reduces towards S. Tip: configure early — the A320 decelerates poorly on the glideslope.'), done: (s) => s.sw.FLAPS >= 1 },
  { id: 'a_f2', phase: 'final', kind: 'action', view: 'ped', ctl: ['FLAPS'], title: r('FLAPS 2 (ниже 200 уз)', 'FLAPS 2 (below 200 kt)'), hint: r('Целевая скорость — F.', 'Target speed becomes F.'), done: (s) => s.sw.FLAPS >= 2 },
  { id: 'a_gear', phase: 'final', kind: 'action', view: 'front', ctl: ['GEAR'], title: r('GEAR — DOWN', 'GEAR — DOWN'), hint: r('Клавиша G или рычаг шасси. Три зелёных треугольника.', 'G key or the gear lever. Three green triangles.'), done: (s) => s.sw.GEAR === 1 },
  {
    id: 'a_grav',
    phase: 'final',
    kind: 'action',
    view: 'ped',
    ctl: ['GRAVITY_CRANK', 'GEAR'],
    title: r('L/G NOT DOWNLOCKED: аварийный выпуск (рычаг UP, 3 оборота, рычаг DOWN)', 'L/G NOT DOWNLOCKED: gravity extension (lever UP, 3 turns, lever DOWN)'),
    hint: r('Шасси не встало на замки. По QRH: L/G LEVER UP, ручка GRVTY GEAR EXTN — 3 оборота, затем L/G LEVER DOWN.', 'Gear not locked. QRH: L/G LEVER UP, GRVTY GEAR EXTN crank 3 turns, then L/G LEVER DOWN.'),
    show: (s) => !!s.flags.lgJam,
    done: (s) => s.ac.gear > 0.99,
  },
  { id: 'a_splrs', phase: 'final', kind: 'action', view: 'ped', ctl: ['SPD_BRK'], title: r('GND SPLRS — ARM', 'GND SPLRS — ARM'), hint: r('Рычаг SPEED BRAKE в ARM.', 'SPEED BRAKE lever to ARM.'), done: (s) => s.sw.SPD_BRK === 0 },
  { id: 'a_f3', phase: 'final', kind: 'action', view: 'ped', ctl: ['FLAPS'], title: r('FLAPS 3 (ниже 185 уз)', 'FLAPS 3 (below 185 kt)'), hint: r('', ''), done: (s) => s.sw.FLAPS >= 3 },
  { id: 'a_ff', phase: 'final', kind: 'action', view: 'ped', ctl: ['FLAPS'], title: r('FLAPS FULL (ниже 177 уз)', 'FLAPS FULL (below 177 kt)'), hint: r('Скорость уменьшится до VAPP (см. PFD, PERF APPR).', 'Speed reduces to VAPP (PFD, PERF APPR).'), done: (s) => s.sw.FLAPS === 4 || (s.fms.ldgConf === 3 && s.sw.FLAPS === 3) },
  { id: 'a_cab', phase: 'final', kind: 'comm', view: 'comms', title: r('PA: «Бортпроводникам приготовиться к посадке»', 'PA: "cabin crew, prepare for landing"'), hint: r('Салон доложит CABIN READY.', 'Cabin reports CABIN READY.'), done: (s) => s.gnd.cabinReady },
  { id: 'a_cl_ldg', phase: 'final', kind: 'checklist', view: 'checklist', title: r('Чек-лист LANDING', 'LANDING checklist'), hint: r('LDG MEMO на ECAM без синих пунктов.', 'LDG MEMO on the ECAM without blue items.'), done: (s) => !!s.flags.cl_LANDING },
  { id: 'a_stab', phase: 'final', kind: 'wait', view: 'out', title: r('1000 фт: заход стабилизирован', '1000 ft: approach stabilised'), hint: r('К 1000 фт: шасси выпущено, закрылки посадочные, скорость VAPP (−5…+10), на глиссаде и курсе. Иначе — уход на второй круг (TOGA).', 'By 1000 ft: gear down, landing flaps, VAPP (−5…+10), on slope and localiser. Otherwise go around (TOGA).'), done: (s) => !!s.flags.stab1000 },
  { id: 'a_apoff', phase: 'final', kind: 'action', view: 'front', ctl: ['AP1'], title: r('Не ниже минимума: AP — OFF и посадка вручную (или автопосадка)', 'At minimum at the latest: AP OFF, land manually (or autoland)'), hint: r('Кнопка AP 1 (прозвучит сигнал отключения). Следуйте директору; можно оставить автопилот для автопосадки.', 'AP 1 button (cavalry charge). Follow the FD; or keep the AP for an autoland.'), done: (s) => !s.ac.ap || s.ac.landed, optional: true },
  { id: 'a_retard', phase: 'final', kind: 'action', view: 'ped', ctl: ['TL1', 'TL2'], title: r('«RETARD» (20 фт): РУД — IDLE', '"RETARD" (20 ft): thrust levers IDLE'), hint: r('F1. Плавно на себя для выравнивания примерно с 30 фт.', 'F1. Flare gently from about 30 ft.'), done: (s) => s.sw.TL1 <= 0.5 && s.sw.TL2 <= 0.5 && (s.ac.landed || agl(s) < 60) },
  { id: 'a_td', phase: 'final', kind: 'wait', view: 'out', title: r('Касание ВПП', 'Touchdown'), hint: r('Вертикальная скорость меньше 360 фт/мин, в зоне касания (300–900 м), по оси.', 'Below 360 fpm, in the touchdown zone (300–900 m), on the centreline.'), done: (s) => s.ac.landed },
  // ===================== пробег =====================
  { id: 'l_rev', phase: 'land', kind: 'action', view: 'ped', ctl: ['TL1', 'TL2'], title: r('Реверс — MAX (F2 держать)', 'Reversers — MAX (hold F2)'), hint: r('После касания: интерцепторы выпустятся сами, автотормоз включится.', 'After touchdown: spoilers extend automatically and the autobrake engages.'), done: (s) => s.ac.landed && s.eng.some((e) => e.rev > 0.9), optional: true },
  { id: 'l_70', phase: 'land', kind: 'action', view: 'ped', ctl: ['TL1', 'TL2'], title: r('70 уз: реверс — IDLE, к рулению — РУД IDLE', '70 kt: reverse IDLE, then levers IDLE by taxi speed'), hint: r('F1 — малый газ. Тормоза B отключают автотормоз.', 'F1 for idle. Pressing B disconnects the autobrake.'), done: (s) => s.ac.landed && s.ac.ias < 60 && s.sw.TL1 >= -0.5 && s.sw.TL2 >= -0.5 },
  { id: 'l_vac', phase: 'land', kind: 'action', view: 'out', title: r('Освободить ВПП (скорость < 35 уз на сходе)', 'Vacate the runway (< 35 kt at the exit)'), hint: r('Ближайший сход — на 2050 м, следующий — в конце ВПП.', 'First exit at 2050 m, the next one at the runway end.'), done: (s) => s.gnd.phase === 'taxiin' || parked(s) },
  // ===================== после посадки =====================
  { id: 'al_splrs', phase: 'aland', kind: 'action', view: 'ped', ctl: ['SPD_BRK'], title: r('GND SPLRS — DISARM', 'GND SPLRS — DISARM'), hint: r('Рычаг SPEED BRAKE в RET.', 'SPEED BRAKE lever to RET.'), done: (s) => s.ac.landed && s.sw.SPD_BRK === 1 },
  { id: 'al_flaps', phase: 'aland', kind: 'action', view: 'ped', ctl: ['FLAPS'], title: r('FLAPS — 0', 'FLAPS — 0'), hint: r('', ''), done: (s) => s.ac.landed && s.sw.FLAPS === 0 },
  { id: 'al_lt', phase: 'aland', kind: 'action', view: 'ovhd', ctl: ['STROBE', 'LAND_L', 'LAND_R', 'NOSE_LT'], title: r('STROBE — AUTO/OFF, LAND — OFF, NOSE — TAXI', 'STROBE AUTO/OFF, LAND OFF, NOSE TAXI'), hint: r('', ''), done: (s) => s.ac.landed && s.sw.STROBE <= 1 && s.sw.LAND_L <= 1 && s.sw.LAND_R <= 1 && s.sw.NOSE_LT === 1 },
  { id: 'al_wx', phase: 'aland', kind: 'action', view: 'ped', ctl: ['WX_SYS', 'WX_PWS', 'TCAS_MODE'], title: r('RADAR — OFF, PWS — OFF, TCAS — STBY', 'RADAR OFF, PWS OFF, TCAS STBY'), hint: r('', ''), done: (s) => s.ac.landed && s.sw.WX_SYS === 1 && s.sw.WX_PWS === 0 && s.sw.TCAS_MODE === 0 },
  { id: 'al_apu', phase: 'aland', kind: 'action', view: 'ovhd', ctl: ['APU_MASTER', 'APU_START'], title: r('APU — START (MASTER SW ON, START)', 'APU — START (MASTER SW ON, START)'), hint: r('ВСУ должна быть готова до выключения двигателей на стоянке.', 'The APU must be available before the engines are shut down at the stand.'), done: (s) => s.ac.landed && (s.apu.starting || s.apu.avail) },
  { id: 'al_gnd', phase: 'aland', kind: 'comm', view: 'comms', title: r('Земля 121.950: руление на стоянку', 'Ground 121.950: taxi to stand'), hint: r('Вышка передаст вас Земле после пробега.', 'Tower hands you over after the rollout.'), done: (s) => s.atc.taxiInClear },
  { id: 'al_cl', phase: 'aland', kind: 'checklist', view: 'checklist', title: r('Чек-лист AFTER LANDING', 'AFTER LANDING checklist'), hint: r('', ''), done: (s) => !!s.flags.cl_AFTER_LANDING },
  { id: 'al_stand', phase: 'aland', kind: 'action', view: 'out', title: r('Зарулить на стоянку K24 и остановиться у стоп-линии', 'Taxi to stand K24 and stop on the stop line'), hint: r('Скорость ≤ 30 уз, на подходе к стоянке ≤ 5 уз. Остановка в пределах 12 м от линии.', '≤ 30 kt, ≤ 5 kt approaching the stand. Stop within 12 m of the line.'), done: (s) => parked(s) },
  // ===================== стоянка =====================
  { id: 'p_pb', phase: 'park', kind: 'action', view: 'ped', ctl: ['PARK_BRK'], title: r('PARK BRK — ON', 'PARK BRK — ON'), hint: r('До выключения двигателей.', 'Before engine shutdown.'), done: (s) => parked(s) && s.sw.PARK_BRK === 1 },
  { id: 'p_apub', phase: 'park', kind: 'action', view: 'ovhd', ctl: ['APU_BLEED'], title: r('APU BLEED — ON', 'APU BLEED — ON'), hint: r('Когда APU AVAIL: кондиционирование салона от ВСУ.', 'Once APU AVAIL: cabin air from the APU.'), done: (s) => parked(s) && s.sw.APU_BLEED === 1 && s.apu.avail, req: ['al_apu'] },
  { id: 'p_eng', phase: 'park', kind: 'action', view: 'ped', ctl: ['ENG1_MASTER', 'ENG2_MASTER'], title: r('ENG MASTER 1 и 2 — OFF', 'ENG MASTER 1 and 2 — OFF'), hint: r('Питание перейдёт на генератор ВСУ.', 'Power transfers to the APU generator.'), done: (s) => parked(s) && s.sw.ENG1_MASTER === 0 && s.sw.ENG2_MASTER === 0, req: ['p_pb'] },
  { id: 'p_beacon', phase: 'park', kind: 'action', view: 'ovhd', ctl: ['BEACON'], title: r('BEACON — OFF (после остановки двигателей)', 'BEACON — OFF (after engines spool down)'), hint: r('Пока маяк горит, наземный персонал не подходит.', 'Ground staff stay away while the beacon is on.'), done: (s) => parked(s) && s.sw.BEACON === 0 && engOff(s), req: ['p_eng'] },
  { id: 'p_belts', phase: 'park', kind: 'action', view: 'ovhd', ctl: ['SEAT_BELTS'], title: r('SEAT BELTS — OFF', 'SEAT BELTS — OFF'), hint: r('', ''), done: (s) => parked(s) && s.sw.SEAT_BELTS === 0 && engOff(s) },
  { id: 'p_fuel', phase: 'park', kind: 'action', view: 'ovhd', ctl: ['FUEL_L1', 'FUEL_L2', 'FUEL_C1', 'FUEL_C2', 'FUEL_R1', 'FUEL_R2'], title: r('FUEL PUMPS — OFF (все 6)', 'FUEL PUMPS — OFF (all 6)'), hint: r('ВСУ получает топливо и без насосов.', 'The APU is fed without the pumps.'), done: (s) => parked(s) && ['L1', 'L2', 'C1', 'C2', 'R1', 'R2'].every((k) => s.sw[`FUEL_${k}`] === 0) },
  { id: 'p_xpdr', phase: 'park', kind: 'action', view: 'ped', ctl: ['XPDR_MODE'], title: r('XPDR — STBY', 'XPDR — STBY'), hint: r('', ''), done: (s) => parked(s) && s.sw.XPDR_MODE === 0 },
  { id: 'p_disarm', phase: 'park', kind: 'comm', view: 'comms', title: r('PA: двери на ручной режим (disarm)', 'PA: disarm doors and cross-check'), hint: r('Только после остановки двигателей и выключения маяка.', 'Only after engine shutdown and beacon off.'), done: (s) => parked(s) && !s.gnd.slidesArmed },
  { id: 'p_cl', phase: 'park', kind: 'checklist', view: 'checklist', title: r('Чек-лист PARKING', 'PARKING checklist'), hint: r('', ''), done: (s) => !!s.flags.cl_PARKING },
  // ===================== обесточивание =====================
  { id: 's_adirs', phase: 'secure', kind: 'action', view: 'ovhd', ctl: ['IR1_MODE', 'IR2_MODE', 'IR3_MODE'], title: r('ADIRS: IR 1, 2, 3 — OFF', 'ADIRS: IR 1, 2, 3 — OFF'), hint: r('До выключения аккумуляторов, иначе ИНС уйдут на питание от АКБ.', 'Before the batteries, otherwise the IRs run on battery.'), done: (s) => parked(s) && [1, 2, 3].every((i) => s.sw[`IR${i}_MODE`] === 0) },
  { id: 's_oxy', phase: 'secure', kind: 'action', view: 'ovhd', ctl: ['OXY_CREW'], title: r('OXYGEN CREW SUPPLY — OFF', 'OXYGEN CREW SUPPLY — OFF'), hint: r('', ''), done: (s) => parked(s) && s.sw.OXY_CREW === 0 },
  { id: 's_signs', phase: 'secure', kind: 'action', view: 'ovhd', ctl: ['EMER_EXIT_LT', 'NO_SMOKING'], title: r('EMER EXIT LT — OFF, NO SMOKING — OFF', 'EMER EXIT LT OFF, NO SMOKING OFF'), hint: r('', ''), done: (s) => parked(s) && s.sw.EMER_EXIT_LT === 0 && s.sw.NO_SMOKING === 0 },
  { id: 's_ext', phase: 'secure', kind: 'action', view: 'ovhd', ctl: ['NAV_LOGO', 'STROBE', 'NOSE_LT', 'RWY_TURNOFF'], title: r('Внешний свет — всё OFF', 'External lights — all OFF'), hint: r('', ''), done: (s) => parked(s) && s.sw.NAV_LOGO === 0 && s.sw.STROBE === 0 && s.sw.NOSE_LT === 0 && s.sw.RWY_TURNOFF === 0 },
  { id: 's_apub', phase: 'secure', kind: 'action', view: 'ovhd', ctl: ['APU_BLEED'], title: r('APU BLEED — OFF', 'APU BLEED — OFF'), hint: r('', ''), done: (s) => parked(s) && !!s.flags.apuBleedPark && s.sw.APU_BLEED === 0 },
  { id: 's_apu', phase: 'secure', kind: 'action', view: 'ovhd', ctl: ['APU_MASTER'], title: r('APU MASTER SW — OFF, дождаться полной остановки', 'APU MASTER SW — OFF, wait for full stop'), hint: r('После отбора воздуха ВСУ ~60 с охлаждается, затем заслонка закрывается (страница APU).', 'After bleed use the APU cools ~60 s, then the flap closes (APU page).'), done: (s) => parked(s) && s.sw.APU_MASTER === 0 && s.apu.n < 1 && s.apu.flap < 0.05 },
  { id: 's_cl', phase: 'secure', kind: 'checklist', view: 'checklist', title: r('Чек-лист SECURING THE AIRCRAFT', 'SECURING THE AIRCRAFT checklist'), hint: r('', ''), done: (s) => !!s.flags.cl_SECURING },
  { id: 's_bat', phase: 'secure', kind: 'action', view: 'ovhd', ctl: ['BAT1', 'BAT2'], title: r('BAT 1 и BAT 2 — OFF → Cold & Dark', 'BAT 1 and BAT 2 — OFF → cold & dark'), hint: r('Последний шаг: только когда ВСУ полностью остановилась.', 'The very last step: only after the APU has fully stopped.'), done: (s) => parked(s) && s.sw.BAT1 === 0 && s.sw.BAT2 === 0, req: ['s_apu', 's_adirs'] },
];

/** Стабилизированный заход на 1000 фт */
export function checkStable(s: SimState) {
  const d = ilsDev(s);
  const sp = speeds(s);
  const full = s.fms.ldgConf === 4 ? s.sw.FLAPS === 4 && s.ac.flaps > 35 : s.sw.FLAPS >= 3;
  const reasons: L[] = [];
  if (s.ac.gear < 0.99) reasons.push(r('шасси не выпущено', 'gear not down'));
  if (!full) reasons.push(r('закрылки не в посадочном положении', 'flaps not in landing configuration'));
  if (s.ac.ias > sp.vapp + 12 || s.ac.ias < sp.vapp - 6) reasons.push(r(`скорость ${Math.round(s.ac.ias)} (VAPP ${sp.vapp})`, `speed ${Math.round(s.ac.ias)} (VAPP ${sp.vapp})`));
  if (!d || Math.abs(d.gsDots) > 1 || Math.abs(d.locDots) > 1) reasons.push(r('не на глиссаде/курсе', 'off glideslope/localiser'));
  if (s.ac.vs < -1100) reasons.push(r('вертикальная > 1100 фт/мин', 'sink rate > 1100 fpm'));
  return reasons;
}

export const ARR_HELP = { KT };
