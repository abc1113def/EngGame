import type { L, SimState } from '../types';

type Emit = (e: { type: string; [k: string]: unknown }) => void;
const r = (ru: string, en: string): L => ({ ru, en });

export const WALK_IDS = ['docs', 'lock', 'door', 'tieL', 'pitot', 'stall', 'fuelL', 'sumpL', 'tieT', 'tail', 'tieR', 'fuelR', 'sumpR', 'strainer', 'oil', 'prop', 'chocks'] as const;
export type WalkId = (typeof WALK_IDS)[number] | 'oilAdd';

export function tiesOff(s: SimState) {
  return !!(s.flags.tieL_off && s.flags.tieR_off && s.flags.tieT_off);
}

/** Действие при осмотре снаружи. Возвращает текст находки. */
export function c172Walk(s: SimState, id: WalkId, emit: Emit): L {
  const c = s.c;
  const p = c.pre;
  const f = s.flags;
  const running = c.running || c.rpm > 50;
  const near = ['prop', 'oil', 'oilAdd', 'strainer', 'chocks', 'tieL', 'tieR', 'tieT', 'pitot', 'sumpL', 'sumpR', 'fuelL', 'fuelR', 'stall', 'tail'];
  if (running && near.includes(id)) {
    emit({ type: 'cWalkRunning', id });
    return r('Двигатель работает! К самолёту подходить нельзя.', 'The engine is running! Stay clear of the aircraft.');
  }
  if (!s.ac.onGround || s.gnd.phase === 'runway' || s.ac.gs > 0.3) return r('Сейчас не время для осмотра.', 'Not the time for a walk-around.');
  let msg: L;
  switch (id) {
    case 'docs':
      f.cDocs = true;
      msg = r('Документы на борту (ARROW): сертификат лётной годности, регистрация, радиолицензия, РЛЭ (POH), весовой лист.', 'Documents on board (ARROW): airworthiness, registration, radio licence, POH, weight & balance.');
      break;
    case 'lock':
      p.lock = !p.lock;
      msg = p.lock ? r('Струбцина рулей установлена на штурвал.', 'Control lock installed on the yoke.') : r('Струбцина рулей снята и убрана.', 'Control lock removed and stowed.');
      break;
    case 'door':
      p.doors = !p.doors;
      msg = p.doors ? r('Двери закрыты и заперты.', 'Doors closed and latched.') : r('Двери открыты.', 'Doors open.');
      break;
    case 'tieL':
    case 'tieR':
    case 'tieT': {
      const k = `${id}_off`;
      f[k] = !f[k];
      p.tiedowns = !tiesOff(s);
      const where = id === 'tieL' ? r('левого крыла', 'left wing') : id === 'tieR' ? r('правого крыла', 'right wing') : r('хвоста', 'tail');
      msg = f[k] ? r(`Швартовка ${where.ru} отсоединена.`, `${where.en[0].toUpperCase() + where.en.slice(1)} tie-down removed.`) : r(`Швартовка ${where.ru} закреплена.`, `${where.en[0].toUpperCase() + where.en.slice(1)} tie-down secured.`);
      break;
    }
    case 'pitot':
      p.pitotCover = !p.pitotCover;
      msg = p.pitotCover ? r('Чехол ПВД надет.', 'Pitot cover installed.') : r('Чехол ПВД снят, приёмник чистый.', 'Pitot cover removed, tube clear.');
      break;
    case 'stall':
      f.cStallChk = true;
      msg = r('Сигнализатор сваливания: отверстие чистое, при подсосе звучит.', 'Stall warning opening clear; it sounds when suction is applied.');
      break;
    case 'fuelL':
    case 'fuelR': {
      f[`${id}_chk`] = true;
      const q = id === 'fuelL' ? c.fuelL : c.fuelR;
      p.fuelChecked = !!(f.fuelL_chk && f.fuelR_chk);
      msg = r(`${id === 'fuelL' ? 'Левый' : 'Правый'} бак: визуально ≈ ${Math.round(q)} галлонов, крышка закрыта.`, `${id === 'fuelL' ? 'Left' : 'Right'} tank: visually ≈ ${Math.round(q)} gal, cap secure.`);
      break;
    }
    case 'sumpL':
    case 'sumpR':
    case 'strainer': {
      const water = id === 'sumpL' && p.sumpWater > 0;
      if (water) {
        p.sumpWater--;
        msg = r('Проба: на дне ВОДА (пузырьки)! Сливайте ещё, пока проба не станет чистой.', 'Sample: WATER at the bottom (bubbles)! Keep draining until the sample is clean.');
        emit({ type: 'cWater' });
      } else {
        f[`${id}_ok`] = true;
        msg = r('Проба: чистое голубое топливо 100LL, воды и грязи нет.', 'Sample: clean blue 100LL, no water or sediment.');
      }
      p.sumpDone = !!(f.sumpL_ok && f.sumpR_ok && f.strainer_ok) && p.sumpWater === 0;
      break;
    }
    case 'oil':
      p.oilChecked = true;
      msg =
        p.oilQt < 5
          ? r(`Щуп: ${p.oilQt.toFixed(1)} кварты — НИЖЕ МИНИМУМА 5! Долейте масло.`, `Dipstick: ${p.oilQt.toFixed(1)} qt — BELOW the 5 qt minimum! Add oil.`)
          : r(`Щуп: ${p.oilQt.toFixed(1)} кварты — в норме. Крышка закрыта.`, `Dipstick: ${p.oilQt.toFixed(1)} qt — OK. Cap secure.`);
      break;
    case 'oilAdd':
      p.oilQt = Math.min(8, p.oilQt + 1);
      f.cOilAdded = true;
      msg = r(`Долита 1 кварта: теперь ${p.oilQt.toFixed(1)} qt.`, `Added 1 qt: now ${p.oilQt.toFixed(1)} qt.`);
      break;
    case 'prop':
      f.cPropChk = true;
      msg = r('Винт без забоин, кок закреплён. Воздухозаборник чистый.', 'Propeller free of nicks, spinner secure. Air inlets clear.');
      break;
    case 'chocks':
      p.chocks = !p.chocks;
      msg = p.chocks ? r('Колодки установлены.', 'Chocks in place.') : r('Колодки убраны.', 'Chocks removed.');
      break;
    case 'tail':
      f.cTailChk = true;
      msg = r('Руль высоты и направления двигаются свободно, крепления в порядке.', 'Elevator and rudder move freely, hinges secure.');
      break;
    default:
      msg = r('', '');
  }
  emit({ type: 'walk', id, msg });
  return msg;
}
