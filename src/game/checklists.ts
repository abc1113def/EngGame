import { fob, irOk } from '../sim/systems';
import { leftMemo } from '../sim/ecam';
import { SCN } from '../sim/scenario';
import type { L, SimState } from '../sim/types';

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
];
