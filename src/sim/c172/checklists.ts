import type { Checklist } from '../../game/checklists';
import { inHg } from './comms';
import { tiesOff } from './walk';

const T = () => true;

/** Нормальные чек-листы Cessna 172S (формулировки свои, по смыслу РЛЭ) */
export const C172_CHECKLISTS: Checklist[] = [
  {
    id: 'C_BEFORE_START',
    name: 'BEFORE STARTING ENGINE',
    flag: 'cl_C_BEFORE_START',
    items: [
      { ch: 'PREFLIGHT INSPECTION', resp: () => 'COMPLETE', ok: (s) => !s.c.pre.lock && !s.c.pre.pitotCover && !s.c.pre.chocks && tiesOff(s) && s.c.pre.sumpDone && s.c.pre.oilChecked, why: { ru: 'Осмотр не закончен (струбцина, чехол ПВД, колодки, швартовка, отстой, масло).', en: 'Walk-around not complete (lock, pitot cover, chocks, tie-downs, sumps, oil).' } },
      { ch: 'PASSENGER BRIEFING', resp: () => 'COMPLETE', ok: (s) => !!s.flags.cBrief, why: { ru: 'Пассажир не проинструктирован.', en: 'Passenger not briefed.' } },
      { ch: 'SEATS, BELTS', resp: () => 'ADJUSTED & LOCKED', ok: T, why: { ru: '', en: '' } },
      { ch: 'DOORS', resp: (s) => (s.c.pre.doors ? 'CLOSED & LATCHED' : 'OPEN'), ok: (s) => s.c.pre.doors, why: { ru: 'Двери открыты.', en: 'Doors open.' } },
      { ch: 'BRAKES', resp: (s) => (s.sw.C_PARK ? 'SET' : 'OFF'), ok: (s) => s.sw.C_PARK === 1, why: { ru: 'Стояночный тормоз не установлен.', en: 'Parking brake not set.' } },
      { ch: 'AVIONICS', resp: (s) => (s.sw.C_AVIONICS1 || s.sw.C_AVIONICS2 ? 'ON' : 'OFF'), ok: (s) => s.sw.C_AVIONICS1 === 0 && s.sw.C_AVIONICS2 === 0, why: { ru: 'Авионика включена.', en: 'Avionics on.' } },
      { ch: 'ELECTRICAL EQUIPMENT', resp: () => 'OFF', ok: (s) => s.sw.C_LAND === 0 && s.sw.C_TAXI === 0 && s.sw.C_STROBE === 0 && s.sw.C_PITOT === 0, why: { ru: 'Фары/стробы/обогрев включены.', en: 'Lights/strobes/pitot heat on.' } },
      { ch: 'FUEL SELECTOR', resp: (s) => ['LEFT', 'BOTH', 'RIGHT'][s.sw.C_FUEL_SEL], ok: (s) => s.sw.C_FUEL_SEL === 1, why: { ru: 'Кран не на BOTH.', en: 'Selector not on BOTH.' } },
      { ch: 'FUEL SHUTOFF VALVE', resp: (s) => (s.sw.C_FUEL_SHUTOFF ? 'ON' : 'OFF'), ok: (s) => s.sw.C_FUEL_SHUTOFF === 1, why: { ru: 'Перекрывной кран закрыт!', en: 'Shutoff valve closed!' } },
    ],
  },
  {
    id: 'C_BEFORE_TO',
    name: 'BEFORE TAKEOFF',
    flag: 'cl_C_BEFORE_TO',
    items: [
      { ch: 'PARKING BRAKE', resp: (s) => (s.sw.C_PARK ? 'SET' : 'OFF'), ok: (s) => s.sw.C_PARK === 1, why: { ru: 'Тормоз не установлен.', en: 'Brake not set.' } },
      { ch: 'DOORS', resp: () => 'CLOSED & LATCHED', ok: (s) => s.c.pre.doors, why: { ru: 'Двери открыты.', en: 'Doors open.' } },
      { ch: 'FLIGHT CONTROLS', resp: () => 'FREE & CORRECT', ok: (s) => { const f = s.ac.fctlCheck; return !s.c.pre.lock && f.up && f.dn && f.l && f.r; }, why: { ru: 'Рули не проверены до упоров.', en: 'Controls not checked to the stops.' } },
      { ch: 'FLIGHT INSTRUMENTS', resp: () => 'SET', ok: (s) => Math.abs(s.c.baro - inHg(s.atc.qnh)) <= 0.015 && Math.abs(s.c.hiErr) < 5, why: { ru: 'Высотомер или курсовой гироскоп не выставлены.', en: 'Altimeter or heading indicator not set.' } },
      { ch: 'FUEL QUANTITY', resp: (s) => `${Math.round(s.c.fuelL + s.c.fuelR)} GAL`, ok: (s) => s.c.fuelL + s.c.fuelR > 20, why: { ru: 'Мало топлива.', en: 'Fuel low.' } },
      { ch: 'MIXTURE', resp: (s) => (s.sw.C_MIX > 0.85 ? 'RICH' : 'LEAN'), ok: (s) => s.sw.C_MIX > 0.85, why: { ru: 'Смесь не RICH.', en: 'Mixture not RICH.' } },
      { ch: 'FUEL SELECTOR', resp: (s) => ['LEFT', 'BOTH', 'RIGHT'][s.sw.C_FUEL_SEL], ok: (s) => s.sw.C_FUEL_SEL === 1, why: { ru: 'Кран не на BOTH.', en: 'Selector not on BOTH.' } },
      { ch: 'ELEVATOR TRIM', resp: () => 'TAKEOFF', ok: (s) => Math.abs(s.c.trim) <= 0.1, why: { ru: 'Триммер не на метке TAKEOFF.', en: 'Trim not at TAKEOFF.' } },
      { ch: 'MAGNETOS (1800 RPM)', resp: () => 'CHECKED', ok: (s) => !!s.flags.cMagL && !!s.flags.cMagR && !s.flags.cMagBad, why: { ru: 'Магнето не проверены или не в норме.', en: 'Magnetos not checked or out of limits.' } },
      { ch: 'SUCTION / ENGINE INSTR', resp: () => 'CHECKED', ok: (s) => s.c.running && !!s.flags.cRunupVac && s.c.oilP > 20, why: { ru: 'Вакуум и давление масла не проверены на 1800 об/мин.', en: 'Suction and oil pressure not checked at 1800 RPM.' } },
      { ch: 'ANNUNCIATORS', resp: () => 'TESTED / NONE', ok: (s) => !!s.flags.cAnnTested && s.c.altOnline && s.c.vac > 3.5, why: { ru: 'Табло не проверены или горит предупреждение.', en: 'Annunciators not tested or a warning is lit.' } },
      { ch: 'THROTTLE', resp: (s) => `${Math.round(s.c.rpm / 10) * 10} RPM`, ok: (s) => s.c.rpm < 1250, why: { ru: 'Обороты больше 1000–1200.', en: 'RPM above 1000–1200.' } },
      { ch: 'WING FLAPS', resp: (s) => ['UP', '10°', '20°', '30°'][s.sw.C_FLAPS], ok: (s) => s.sw.C_FLAPS <= 1, why: { ru: 'Закрылки больше 10°.', en: 'Flaps beyond 10°.' } },
      { ch: 'TRANSPONDER', resp: (s) => ['OFF', 'SBY', 'ON', 'ALT'][s.sw.C_XPDR], ok: (s) => s.sw.C_XPDR === 3, why: { ru: 'Ответчик не в ALT.', en: 'Transponder not ALT.' } },
      { ch: 'LIGHTS', resp: () => 'LAND / STROBE ON', ok: (s) => s.sw.C_LAND === 1 && s.sw.C_STROBE === 1, why: { ru: 'Фара или стробы выключены.', en: 'Landing light or strobes off.' } },
    ],
  },
  {
    id: 'C_BEFORE_LDG',
    name: 'BEFORE LANDING',
    flag: 'cl_C_BEFORE_LDG',
    items: [
      { ch: 'SEATS, BELTS', resp: () => 'SECURE', ok: T, why: { ru: '', en: '' } },
      { ch: 'FUEL SELECTOR', resp: (s) => ['LEFT', 'BOTH', 'RIGHT'][s.sw.C_FUEL_SEL], ok: (s) => s.sw.C_FUEL_SEL === 1, why: { ru: 'Кран не на BOTH.', en: 'Selector not on BOTH.' } },
      { ch: 'MIXTURE', resp: (s) => (s.sw.C_MIX > 0.85 ? 'RICH' : 'LEAN'), ok: (s) => s.sw.C_MIX > 0.85, why: { ru: 'Смесь не RICH.', en: 'Mixture not RICH.' } },
      { ch: 'LANDING LIGHT', resp: (s) => (s.sw.C_LAND ? 'ON' : 'OFF'), ok: (s) => s.sw.C_LAND === 1, why: { ru: 'Фара выключена.', en: 'Landing light off.' } },
      { ch: 'AUTOPILOT', resp: (s) => (s.c.ap ? 'ON' : 'OFF'), ok: (s) => !s.c.ap, why: { ru: 'Автопилот включён.', en: 'Autopilot engaged.' } },
    ],
  },
  {
    id: 'C_AFTER_LDG',
    name: 'AFTER LANDING',
    flag: 'cl_C_AFTER_LDG',
    items: [
      { ch: 'WING FLAPS', resp: (s) => ['UP', '10°', '20°', '30°'][s.sw.C_FLAPS], ok: (s) => s.sw.C_FLAPS === 0, why: { ru: 'Закрылки не убраны.', en: 'Flaps not up.' } },
      { ch: 'TRANSPONDER', resp: (s) => ['OFF', 'SBY', 'ON', 'ALT'][s.sw.C_XPDR], ok: (s) => s.sw.C_XPDR <= 1, why: { ru: 'Ответчик не в SBY.', en: 'Transponder not SBY.' } },
      { ch: 'LANDING LT / STROBES', resp: () => 'OFF', ok: (s) => s.sw.C_LAND === 0 && s.sw.C_STROBE === 0, why: { ru: 'Фара или стробы включены.', en: 'Landing light or strobes on.' } },
    ],
  },
  {
    id: 'C_SECURE',
    name: 'SECURING AIRPLANE',
    flag: 'cl_C_SECURE',
    items: [
      { ch: 'PARKING BRAKE', resp: (s) => (s.sw.C_PARK ? 'SET' : 'OFF'), ok: (s) => s.sw.C_PARK === 1, why: { ru: 'Тормоз не установлен.', en: 'Brake not set.' } },
      { ch: 'AVIONICS / ELECTRICAL', resp: () => 'OFF', ok: (s) => s.sw.C_AVIONICS1 === 0 && s.sw.C_AVIONICS2 === 0 && s.sw.C_LAND === 0 && s.sw.C_TAXI === 0 && s.sw.C_NAV === 0 && s.sw.C_STROBE === 0, why: { ru: 'Что-то осталось включённым.', en: 'Something is still on.' } },
      { ch: 'MIXTURE', resp: (s) => (s.sw.C_MIX < 0.05 ? 'IDLE CUTOFF' : 'OPEN'), ok: (s) => s.sw.C_MIX < 0.05, why: { ru: 'Смесь не в IDLE CUTOFF.', en: 'Mixture not at IDLE CUTOFF.' } },
      { ch: 'MAGNETOS', resp: (s) => ['OFF', 'R', 'L', 'BOTH', 'START'][s.sw.C_MAGS], ok: (s) => s.sw.C_MAGS === 0, why: { ru: 'Магнето не выключены — винт «живой»!', en: 'Mags not off — the propeller is live!' } },
      { ch: 'MASTER', resp: (s) => (s.sw.C_BAT || s.sw.C_ALT ? 'ON' : 'OFF'), ok: (s) => s.sw.C_BAT === 0 && s.sw.C_ALT === 0, why: { ru: 'MASTER включён — разрядится аккумулятор.', en: 'MASTER on — the battery will drain.' } },
      { ch: 'CONTROL LOCK', resp: (s) => (s.c.pre.lock ? 'INSTALLED' : 'OUT'), ok: (s) => s.c.pre.lock, why: { ru: 'Струбцина не установлена.', en: 'Control lock not installed.' } },
      { ch: 'FUEL SELECTOR', resp: (s) => ['LEFT', 'BOTH', 'RIGHT'][s.sw.C_FUEL_SEL], ok: (s) => s.sw.C_FUEL_SEL !== 1, why: { ru: 'Кран на BOTH — топливо перетекает между баками.', en: 'Selector on BOTH — fuel cross-feeds.' } },
    ],
  },
];
