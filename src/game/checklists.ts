import { fob, irOk } from '../sim/systems';
import { leftMemo, ldgMemoVisible } from '../sim/ecam';
import { SCN } from '../sim/scenario';
import type { L, SimState } from '../sim/types';
import { C172_CHECKLISTS } from '../sim/c172/checklists';

export interface ClItem {
  ch: string; // вызов
  resp: (s: SimState) => string; // ответ
  ok: (s: SimState) => boolean;
  why: L;
  line?: boolean; // черта перед пунктом
}
export interface Checklist {
  id: string;
  name: string;
  flag: string;
  items: ClItem[];
  leg?: 'dep' | 'arr';
  optional?: boolean;
}

const T = () => true;

export const CHECKLISTS: Checklist[] = [
  {
    id: 'BEFORE_START',
    name: 'BEFORE START',
    flag: 'cl_BEFORE_START',
    items: [
      { ch: 'COCKPIT PREP', resp: () => 'COMPLETED', ok: (s) => [1, 2, 3].every((i) => s.sw[`IR${i}_MODE`] === 1) && s.sw.OXY_CREW === 1, why: { ru: 'Подготовка кабины не закончена (ADIRS, кислород).', en: 'Cockpit preparation incomplete (ADIRS, oxygen).' } },
      { ch: 'GEAR PINS & COVERS', resp: () => 'REMOVED', ok: T, why: { ru: '', en: '' } },
      { ch: 'SIGNS', resp: () => 'ON/AUTO', ok: (s) => s.sw.SEAT_BELTS === 1 && s.sw.NO_SMOKING >= 1, why: { ru: 'Табло SEAT BELTS / NO SMOKING не включены.', en: 'Signs are not on.' } },
      { ch: 'ADIRS', resp: () => 'NAV', ok: (s) => [1, 2, 3].every((i) => s.sw[`IR${i}_MODE`] === 1), why: { ru: 'Не все IR в NAV.', en: 'Not all IRs in NAV.' } },
      { ch: 'FUEL QTY', resp: (s) => `${Math.round(fob(s) / 100) * 100} KG`, ok: (s) => Math.abs(fob(s) - SCN.block * 1000) < 400, why: { ru: 'Топливо не соответствует плану.', en: 'Fuel does not match the plan.' } },
      { ch: 'TO DATA', resp: () => 'SET', ok: (s) => s.fms.v1 != null && s.fms.vr != null && s.fms.v2 != null && s.fms.flex != null && s.fms.ths != null, why: { ru: 'Взлётные данные в PERF не введены.', en: 'PERF take-off data not entered.' } },
      { ch: 'BARO REF', resp: (s) => `${s.fcu.baro} SET`, ok: (s) => s.atc.atis && !s.fcu.baroStd && s.fcu.baro === s.atc.qnh, why: { ru: 'Давление не равно QNH из ATIS.', en: 'Baro is not the ATIS QNH.' } },
      { ch: 'WINDOWS/DOORS', resp: () => 'CLOSED', ok: (s) => !s.gnd.doors.L1 && !s.gnd.doors.FWD && !s.gnd.doors.AFT, why: { ru: 'Двери открыты (страница DOOR).', en: 'Doors open (DOOR page).' }, line: true },
      { ch: 'BEACON', resp: () => 'ON', ok: (s) => s.sw.BEACON === 1, why: { ru: 'Маяк выключен.', en: 'Beacon is off.' } },
      { ch: 'THR LEVERS', resp: () => 'IDLE', ok: (s) => s.sw.TL1 === 0 && s.sw.TL2 === 0, why: { ru: 'РУД не на малом газе.', en: 'Thrust levers not idle.' } },
      { ch: 'PARKING BRAKE', resp: (s) => (s.sw.PARK_BRK ? 'ON' : 'OFF'), ok: T, why: { ru: '', en: '' } },
    ],
  },
  {
    id: 'AFTER_START',
    name: 'AFTER START',
    flag: 'cl_AFTER_START',
    items: [
      { ch: 'ANTI ICE', resp: () => 'AS RQRD', ok: (s) => !s.sw.WING_AI && !s.sw.ENG1_AI && !s.sw.ENG2_AI, why: { ru: 'Обледенения нет — ПОС должна быть выключена.', en: 'No icing — anti-ice should be off.' } },
      { ch: 'ECAM STATUS', resp: () => 'CHECKED', ok: (s) => !!s.flags.stsAfter, why: { ru: 'Страница STATUS не просмотрена после запуска.', en: 'STATUS page not reviewed after start.' } },
      { ch: 'PITCH TRIM', resp: (s) => `${Math.abs(s.ac.pitchTrim).toFixed(1)} ${s.ac.pitchTrim >= 0 ? 'UP' : 'DN'}`, ok: (s) => Math.abs(s.ac.pitchTrim - SCN.ths) < 0.15, why: { ru: 'Триммер не соответствует THS UP 0.8.', en: 'Trim does not match THS UP 0.8.' } },
      { ch: 'RUDDER TRIM', resp: () => 'NEUTRAL', ok: (s) => Math.abs(s.ac.rudTrim) < 0.05, why: { ru: 'Триммер руля не на нуле.', en: 'Rudder trim not neutral.' } },
    ],
  },
  {
    id: 'BEFORE_TAKEOFF',
    name: 'BEFORE TAKEOFF',
    flag: 'cl_BEFORE_TAKEOFF',
    items: [
      { ch: 'FLIGHT CONTROLS', resp: () => 'CHECKED', ok: (s) => Object.values(s.ac.fctlCheck).every(Boolean), why: { ru: 'Проверка рулей не выполнена.', en: 'Flight control check not done.' } },
      { ch: 'FLT INST', resp: () => 'CHECKED', ok: (s) => irOk(s, 0) && s.adirs.adr[0], why: { ru: 'Приборы не работают (ИНС не выставлены?).', en: 'Instruments not available (IRS?).' } },
      { ch: 'BRIEFING', resp: () => 'CONFIRMED', ok: T, why: { ru: '', en: '' } },
      { ch: 'FLAP SETTING', resp: (s) => `CONF ${s.sw.FLAPS}`, ok: (s) => s.sw.FLAPS === SCN.toFlaps, why: { ru: 'Закрылки не в CONF 1.', en: 'Flaps not CONF 1.' } },
      { ch: 'V1, VR, V2 / FLX TEMP', resp: (s) => `${s.fms.v1 ?? '---'}, ${s.fms.vr ?? '---'}, ${s.fms.v2 ?? '---'} / ${s.fms.flex ?? '--'}`, ok: (s) => s.fms.v1 === SCN.v1 && s.fms.vr === SCN.vr && s.fms.v2 === SCN.v2 && s.fms.flex === SCN.flex, why: { ru: 'Скорости/FLEX не совпадают с расчётом.', en: 'Speeds/FLEX do not match the data.' } },
      { ch: 'ATC', resp: (s) => `${s.radio.xpdrCode} SET`, ok: (s) => s.radio.xpdrCode === s.atc.squawk, why: { ru: 'Код ответчика не из разрешения.', en: 'Wrong squawk.' } },
      { ch: 'ECAM MEMO', resp: () => 'TO NO BLUE', ok: (s) => { const m = leftMemo(s); return m.length > 0 && m.every((l) => l.c === 'green'); }, why: { ru: 'В T.O MEMO остались синие пункты.', en: 'Blue items remain in the T.O MEMO.' } },
    ],
  },
  {
    id: 'BELOW_LINE',
    name: 'BEFORE TAKEOFF (below the line)',
    flag: 'cl_BELOW_LINE',
    items: [
      { ch: 'TAKEOFF RWY', resp: (s) => s.fms.rwy || '---', ok: (s) => s.fms.rwy === SCN.rwy, why: { ru: 'ВПП в FMS не 32L.', en: 'FMS runway is not 32L.' } },
      { ch: 'CABIN CREW', resp: () => 'ADVISED', ok: (s) => !!s.flags.cabSeats, why: { ru: 'Бортпроводники не предупреждены (PA).', en: 'Cabin crew not advised (PA).' } },
      { ch: 'TCAS', resp: () => 'TA/RA', ok: (s) => s.sw.TCAS_MODE === 2, why: { ru: 'TCAS не в TA/RA.', en: 'TCAS not in TA/RA.' } },
      { ch: 'ENG MODE SEL', resp: (s) => ['CRANK', 'NORM', 'IGN/START'][s.sw.ENG_MODE], ok: (s) => s.sw.ENG_MODE !== 0, why: { ru: 'Селектор в CRANK.', en: 'Selector in CRANK.' } },
      { ch: 'PACKS', resp: () => 'AS RQRD', ok: T, why: { ru: '', en: '' } },
    ],
  },
  {
    id: 'AFTER_TAKEOFF',
    name: 'AFTER TAKEOFF / CLIMB',
    flag: 'cl_AFTER_TAKEOFF',
    optional: true,
    items: [
      { ch: 'LDG GEAR', resp: () => 'UP', ok: (s) => s.sw.GEAR === 0 && s.ac.gear < 0.01, why: { ru: 'Шасси не убрано.', en: 'Gear not up.' } },
      { ch: 'FLAPS', resp: () => 'RETRACTED', ok: (s) => s.sw.FLAPS === 0 && s.ac.slats < 0.5, why: { ru: 'Механизация не убрана (убирать на скоростях F и S).', en: 'Flaps not retracted (retract at F and S speeds).' } },
      { ch: 'PACKS', resp: () => 'ON', ok: (s) => s.sw.PACK1 === 1 && s.sw.PACK2 === 1, why: { ru: 'Кондиционеры выключены.', en: 'Packs off.' } },
      { ch: 'BARO REF', resp: () => 'STD SET', line: true, ok: (s) => s.fcu.baroStd || s.ac.alt < 5000, why: { ru: 'Выше высоты перехода — STD.', en: 'Above transition altitude set STD.' } },
    ],
  },
  // ============================ прилёт ============================
  {
    id: 'APPROACH',
    name: 'APPROACH',
    flag: 'cl_APPROACH',
    leg: 'arr',
    items: [
      { ch: 'BRIEFING', resp: () => 'CONFIRMED', ok: T, why: { ru: '', en: '' } },
      { ch: 'ECAM STATUS', resp: () => 'CHECKED', ok: (s) => !!s.flags.stsArr, why: { ru: 'Страница STATUS не просмотрена на прилёте.', en: 'STATUS page not reviewed.' } },
      { ch: 'SEAT BELTS', resp: () => 'ON', ok: (s) => s.sw.SEAT_BELTS === 1, why: { ru: 'Табло ремней выключено.', en: 'Seat belts sign off.' } },
      { ch: 'BARO REF', resp: (s) => `${s.fcu.baroStd ? 'STD' : s.fcu.baro} SET`, ok: (s) => s.atc.arrAtis && !s.fcu.baroStd && s.fcu.baro === s.atc.arrQnh, why: { ru: 'Давление не равно QNH Орли.', en: 'Baro is not the Orly QNH.' } },
      { ch: 'MINIMUM', resp: (s) => `${s.fms.mda ?? '---'} SET`, ok: (s) => s.fms.mda === 491, why: { ru: 'Минимум BARO 491 не введён в PERF APPR.', en: 'BARO 491 minimum not set in PERF APPR.' } },
      { ch: 'AUTO BRAKE', resp: (s) => ['OFF', 'LO', 'MED', 'MAX'][s.ac.autobrk], ok: (s) => s.ac.autobrk === 1 || s.ac.autobrk === 2, why: { ru: 'Автотормоз LO или MED.', en: 'Autobrake LO or MED.' } },
      { ch: 'ENG MODE SEL', resp: () => 'AS RQRD', ok: (s) => s.sw.ENG_MODE !== 0, why: { ru: '', en: '' } },
    ],
  },
  {
    id: 'LANDING',
    name: 'LANDING',
    flag: 'cl_LANDING',
    leg: 'arr',
    items: [
      { ch: 'CABIN CREW', resp: () => 'ADVISED', ok: (s) => !!s.flags.cabLand, why: { ru: 'Бортпроводники не предупреждены.', en: 'Cabin crew not advised.' } },
      { ch: 'A/THR', resp: (s) => (s.ac.athrActive ? 'SPEED' : 'OFF'), ok: T, why: { ru: '', en: '' } },
      { ch: 'AUTO BRAKE', resp: (s) => ['OFF', 'LO', 'MED', 'MAX'][s.ac.autobrk], ok: (s) => s.ac.autobrk === 1 || s.ac.autobrk === 2, why: { ru: 'Автотормоз не взведён.', en: 'Autobrake not armed.' } },
      { ch: 'ECAM MEMO', resp: () => 'LDG NO BLUE', ok: (s) => ldgMemoVisible(s) && leftMemo(s).every((l) => l.c === 'green'), why: { ru: 'В LDG MEMO синие пункты (или выше 2000 фт).', en: 'Blue items in the LDG MEMO (or above 2000 ft).' } },
    ],
  },
  {
    id: 'AFTER_LANDING',
    name: 'AFTER LANDING',
    flag: 'cl_AFTER_LANDING',
    leg: 'arr',
    items: [
      { ch: 'FLAPS', resp: () => 'RETRACTED', ok: (s) => s.ac.landed && s.sw.FLAPS === 0, why: { ru: 'Закрылки не убраны.', en: 'Flaps not retracted.' } },
      { ch: 'SPOILERS', resp: () => 'DISARMED', ok: (s) => s.ac.landed && s.sw.SPD_BRK === 1, why: { ru: 'Интерцепторы взведены.', en: 'Spoilers armed.' } },
      { ch: 'APU', resp: () => 'START', ok: (s) => s.apu.starting || s.apu.avail, why: { ru: 'ВСУ не запущена.', en: 'APU not started.' } },
      { ch: 'RADAR', resp: () => 'OFF', ok: (s) => s.sw.WX_SYS === 1, why: { ru: 'Метеорадар включён.', en: 'Radar on.' } },
      { ch: 'PRED W/S', resp: () => 'OFF', ok: (s) => s.sw.WX_PWS === 0, why: { ru: 'PWS включён.', en: 'PWS on.' } },
    ],
  },
  {
    id: 'PARKING',
    name: 'PARKING',
    flag: 'cl_PARKING',
    leg: 'arr',
    items: [
      { ch: 'APU BLEED', resp: () => 'ON', ok: (s) => s.sw.APU_BLEED === 1 && s.apu.avail, why: { ru: 'Отбор ВСУ выключен.', en: 'APU bleed off.' } },
      { ch: 'ENGINES', resp: () => 'OFF', ok: (s) => s.sw.ENG1_MASTER === 0 && s.sw.ENG2_MASTER === 0, why: { ru: 'Двигатели не выключены.', en: 'Engines not shut down.' } },
      { ch: 'SEAT BELTS', resp: () => 'OFF', ok: (s) => s.sw.SEAT_BELTS === 0, why: { ru: 'Табло ремней горит.', en: 'Seat belt sign on.' } },
      { ch: 'EXT LT', resp: () => 'AS RQRD', ok: (s) => s.sw.BEACON === 0 && s.sw.STROBE <= 1, why: { ru: 'Маяк или стробы (ON) включены.', en: 'Beacon or strobes (ON) still on.' } },
      { ch: 'FUEL PUMPS', resp: () => 'OFF', ok: (s) => ['L1', 'L2', 'C1', 'C2', 'R1', 'R2'].every((k) => s.sw[`FUEL_${k}`] === 0), why: { ru: 'Насосы включены.', en: 'Pumps on.' } },
      { ch: 'PARK BRK AND CHOCKS', resp: (s) => (s.sw.PARK_BRK ? 'ON' : 'OFF') + (s.gnd.chocks ? ' / IN' : ''), ok: (s) => s.sw.PARK_BRK === 1 || s.gnd.chocks, why: { ru: 'Ни тормоза, ни колодок!', en: 'Neither parking brake nor chocks!' } },
    ],
  },
  {
    id: 'SECURING',
    name: 'SECURING THE AIRCRAFT',
    flag: 'cl_SECURING',
    leg: 'arr',
    items: [
      { ch: 'OXYGEN', resp: () => 'OFF', ok: (s) => s.sw.OXY_CREW === 0, why: { ru: 'Кислород экипажа включён.', en: 'Crew oxygen on.' } },
      { ch: 'EMER EXIT LT', resp: () => 'OFF', ok: (s) => s.sw.EMER_EXIT_LT === 0, why: { ru: '', en: '' } },
      { ch: 'EFBs', resp: () => 'OFF', ok: T, why: { ru: '', en: '' } },
      { ch: 'SIGNS', resp: () => 'OFF', ok: (s) => s.sw.SEAT_BELTS === 0 && s.sw.NO_SMOKING === 0, why: { ru: 'Табло включены.', en: 'Signs on.' } },
      { ch: 'APU BLEED', resp: () => 'OFF', ok: (s) => s.sw.APU_BLEED === 0, why: { ru: '', en: '' } },
      { ch: 'APU AND BAT', resp: () => 'OFF', ok: (s) => s.sw.APU_MASTER === 0, why: { ru: 'Сначала выключите ВСУ, затем аккумуляторы.', en: 'APU off first, then batteries.' } },
    ],
  },
];

for (const c of CHECKLISTS) if (!c.leg) c.leg = 'dep';

export function checklistsFor(s: SimState): Checklist[] {
  if (s.type === 'c172') return C172_CHECKLISTS;
  if (s.scn === 'arr') return CHECKLISTS.filter((c) => c.leg === 'arr');
  if (s.scn === 'full') return CHECKLISTS;
  return CHECKLISTS.filter((c) => c.leg === 'dep');
}
