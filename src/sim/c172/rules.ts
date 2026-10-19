import type { Rules } from '../../game/rules';
import { angDiff } from '../scenario';
import type { L } from '../types';
import { C172_SPEEDS } from './flight';
import { patternLeg } from './pattern';

const r = (ru: string, en: string): L => ({ ru, en });
const KT = 1.943844;

interface Mem {
  taxiFast?: boolean;
  taxiHdg?: number;
  runupBase?: number;
  magT?: number;
  roughT?: number;
  stallT?: number;
  weakT?: number;
  oilLateT?: number;
  endT?: number;
}

/** Правила оценки Cessna 172 */
export const c172Rules: Rules = {
  onEvent(g, e) {
    const s = g.s;
    const c = s.c;
    switch (e.type) {
      case 'cEngStart': {
        const clr = s.flags.cClearT as number | undefined;
        if (clr === undefined || s.t - clr > 90) g.pen('c_noclear', 30, r('Запуск без команды «ОТ ВИНТА!»', 'Engine start without "CLEAR PROP!"'));
        if (s.sw.C_BEACON !== 1) g.pen('c_beacon', 20, r('Запуск при выключенном маяке', 'Engine start with the beacon off'));
        if (s.sw.C_AVIONICS1 || s.sw.C_AVIONICS2) g.pen('c_avstart', 20, r('Запуск с включённой авионикой', 'Engine start with avionics on'));
        if (!c.pre.doors) g.pen('c_doors', 15, r('Запуск с открытыми дверями', 'Engine start with doors open'));
        if (s.sw.C_PARK !== 1 && !c.pre.chocks) g.pen('c_nopark', 20, r('Запуск без стояночного тормоза', 'Engine start without parking brake'));
        if (s.sw.C_THR > 0.35 && !e.flooded) g.pen('c_thrstart', 20, r('Запуск с широко открытым РУД — бросок оборотов', 'Start with the throttle wide open — RPM surge'));
        g.gate('c_pre', ['c_pre']);
        break;
      }
      case 'cEngStop':
        if (s.flags.cAirborne && !s.ac.onGround) break;
        if (s.gnd.phase !== 'parked' && e.reason === 'stall' && !s.flags.cMagBad && !s.flags.cRough) g.pen('c_stall_eng', 10, r('Двигатель заглох (обороты слишком малы / смесь)', 'Engine died (RPM too low / mixture)'));
        if (e.reason === 'mags' && s.gnd.phase === 'parked') g.pen('c_magstop', 15, r('Двигатель остановлен магнето, а не смесью', 'Engine stopped with the mags instead of the mixture'));
        break;
      case 'taxiStart':
        if (!s.atc.taxiClear) g.pen('c_taxi_noclr', 40, r('Руление без разрешения Вышки', 'Taxi without Tower clearance'));
        if (s.c.pre.lock) g.pen('c_taxi_lock', 20, r('Руление с установленной струбциной', 'Taxiing with the control lock in'));
        g.gate('c_start', ['c_start']);
        (g.mem as Mem).taxiHdg = s.ac.hdg;
        break;
      case 'crossHold':
        if (!s.atc.lineupClear) g.pen('c_incursion', 120, r('Выезд на ВПП без разрешения (runway incursion)!', 'Runway incursion — entered without clearance!'));
        break;
      case 'liftoff': {
        if (e.touchGo) break;
        s.flags.cAirborne = true;
        if (!s.atc.toClear) g.pen('c_to_noclr', 150, r('Взлёт без разрешения!', 'Take-off without clearance!'));
        if (c.pre.pitotCover) g.pen('c_pitot', 150, r('Взлёт с чехлом на ПВД — нет скорости!', 'Take-off with the pitot cover on — no airspeed!'));
        if (s.flags.cMagBad) g.pen('c_magfly', 250, r('Взлёт с неисправным магнето', 'Take-off with a faulty magneto'));
        if (c.pre.sumpWater > 0) g.pen('c_waterfly', 250, r('Взлёт с водой в топливе', 'Take-off with water in the fuel'));
        if (c.pre.oilQt < 5) g.pen('c_oilfly', 120, r('Взлёт с уровнем масла ниже минимума', 'Take-off with oil below minimum'));
        if (s.sw.C_FLAPS > 1) g.pen('c_toflaps', 30, r('Взлёт с закрылками больше 10°', 'Take-off with more than 10° flaps'));
        if (e.ias < 50) g.pen('c_earlyrot', 20, r(`Ранний отрыв на ${Math.round(e.ias)} уз`, `Early lift-off at ${Math.round(e.ias)} kt`));
        g.gate('c_runup', ['c_taxi', 'c_runup']);
        break;
      }
      case 'landing': {
        const td = e.td as { vs: number; along: number; side: number; pitch: number; ias: number };
        if (!s.atc.ldgClear) g.pen('c_ldg_noclr', 120, r('Посадка без разрешения!', 'Landing without clearance!'));
        if (td.vs < -700) g.pen('c_hard', 100, r(`Грубая посадка: ${Math.round(td.vs)} фт/мин`, `Hard landing: ${Math.round(td.vs)} fpm`));
        else if (td.vs > -250) g.bonus('c_soft', 40, r(`Мягкая посадка: ${Math.round(td.vs)} фт/мин`, `Smooth landing: ${Math.round(td.vs)} fpm`));
        if (td.pitch < 0.5) g.pen('c_nosefirst', 40, r('Касание на переднее колесо («тачка»)', 'Nose-wheel-first touchdown (wheelbarrowing)'));
        if (td.along > 450) g.pen('c_long', 30, r(`Длинная посадка: ${Math.round(td.along)} м от торца`, `Long landing: ${Math.round(td.along)} m past the threshold`));
        else if (td.along > 30) g.bonus('c_tdz', 20, r(`Касание в зоне приземления (${Math.round(td.along)} м)`, `Touchdown in the TDZ (${Math.round(td.along)} m)`));
        if (Math.abs(td.side) > 5) g.pen('c_offcl', 20, r(`Касание в ${Math.abs(td.side).toFixed(0)} м от оси`, `Touchdown ${Math.abs(td.side).toFixed(0)} m off centreline`));
        if (td.ias > 70) g.pen('c_fastldg', 20, r(`Посадка на большой скорости (${Math.round(td.ias)} уз)`, `Landed fast (${Math.round(td.ias)} kt)`));
        g.gate('c_land', ['c_to', 'c_pattern']);
        break;
      }
      case 'standOvershoot':
        g.pen('c_ovs', 10, r('Проскочили место стоянки', 'Overshot the parking spot'));
        break;
      case 'cWalkRunning':
        g.pen('c_walk_run', 60, r('Подход к самолёту с работающим двигателем!', 'Approached the aircraft with the engine running!'));
        break;
      case 'sw':
        if (e.id === 'C_BAT' && e.v === 0 && c.running) g.pen('c_masteroff', 20, r('MASTER выключен при работающем двигателе', 'MASTER off with the engine running'));
        if ((e.id === 'C_AVIONICS1' || e.id === 'C_AVIONICS2') && e.v === 1 && !c.running && s.flags.cStartT === undefined && s.sw.C_BAT === 1) g.pen('c_av_early', 10, r('Авионика включена до запуска двигателя', 'Avionics on before engine start'));
        break;
    }
  },

  flags(g, dt) {
    const s = g.s;
    const c = s.c;
    const f = s.flags;
    const m = g.mem as Mem;
    // предполётная проверка топливомеров
    if (!c.running && f.cStartT === undefined && s.sw.C_BAT === 1 && c.busV > 20) f.cPreMasterOn = true;
    if (f.cPreMasterOn && s.sw.C_BAT === 0 && f.cStartT === undefined) f.cPreMasterDone = true;
    // слабая прокрутка
    if (c.starter && c.rpm < 120 && c.crankT > 1.5) {
      m.weakT = (m.weakT ?? 0) + dt;
      if (m.weakT > 1) f.cWeakCrank = true;
    }
    if (c.crankT > 10) g.pen('c_starter10', 20, r('Стартер включён дольше 10 с', 'Starter engaged for more than 10 s'));
    // руление: тормоза и приборы
    const gsKt = s.ac.gs * KT;
    if (s.ac.onGround && ['taxi', 'holding', 'lineup', 'taxiin'].includes(s.gnd.phase)) {
      if (s.ac.gs > 0.8 && s.ac.brakes > 0.4) f.cBrakeTest = true;
      if (m.taxiHdg !== undefined && Math.abs(angDiff(s.ac.hdg, m.taxiHdg)) > 40 && c.hiSpin > 0.6) f.cTaxiTurn = true;
      if (gsKt > 15) {
        if (!m.taxiFast) {
          m.taxiFast = true;
          g.pen('c_taxifast_' + Math.floor(s.t), 15, r(`Скорость руления ${Math.round(gsKt)} уз (> 15)`, `Taxi speed ${Math.round(gsKt)} kt (> 15)`), true);
        }
      } else if (gsKt < 10) m.taxiFast = false;
    }
    // опробование на предварительном
    if (s.gnd.phase === 'holding' && s.sw.C_PARK === 1 && c.running) {
      if (s.sw.C_MAGS === 3 && c.rpm > 1650 && c.rpm < 1950) {
        f.cRunup = true;
        m.runupBase = c.rpm;
        m.magT = 0;
      }
      if ((s.sw.C_MAGS === 1 || s.sw.C_MAGS === 2) && m.runupBase) {
        m.magT = (m.magT ?? 0) + dt;
        if (m.magT > 1.5) {
          const drop = Math.max(0, m.runupBase - c.rpm);
          if (s.sw.C_MAGS === 2) f.cMagL = Math.round(drop) || 1;
          else f.cMagR = Math.round(drop) || 1;
          if (drop > 175) f.cMagBad = true;
          if (f.cMagL && f.cMagR && Math.abs((f.cMagL as number) - (f.cMagR as number)) > 60) f.cMagBad = true;
        }
      }
      if (f.cMagL && f.cMagR && c.rpm < 800 && s.sw.C_MAGS === 3) f.cIdleChk = true;
      if (c.rpm > 1600 && c.vac > 4.4 && c.oilP > 40) f.cRunupVac = true;
    }
    // перебои (вода)
    if (c.running && c.pre.sumpWater > 0 && s.sw.C_THR > 0.5 && s.ac.onGround) {
      m.roughT = (m.roughT ?? 0) + dt;
      if (m.roughT > 4) f.cRough = true;
    }
    // набор после взлёта
    const agl = s.ac.alt - s.elev;
    if (!s.ac.onGround && agl > 400 && s.ac.ias > 64 && s.ac.ias < 86 && s.ac.vs > 200) f.cClimbOk = true;
    // ограничения
    if (!s.ac.onGround) {
      if (c.flaps > 12 && s.ac.ias > C172_SPEEDS.vfe + 3) g.pen('c_vfe', 30, r('Превышение VFE (закрылки > 10° выше 85 уз)', 'VFE exceeded (flaps > 10° above 85 kt)'));
      if (c.flaps > 2 && s.ac.ias > C172_SPEEDS.vfe10 + 3) g.pen('c_vfe10', 30, r('Превышение VFE 10° (110 уз)', 'VFE 10° exceeded (110 kt)'));
      if (s.ac.ias > C172_SPEEDS.vne) g.pen('c_vne', 80, r('Превышение VNE 163 уз!', 'VNE 163 kt exceeded!'));
      if (Math.abs(s.ac.roll) > 45) g.pen('c_bank', 20, r('Крен больше 45° в круге', 'Bank above 45° in the circuit'));
      if (f.cStall) {
        m.stallT = (m.stallT ?? 0) + dt;
        if (m.stallT > 0.8) g.pen('c_stall', 60, r('Сваливание!', 'Stall!'));
      } else m.stallT = 0;
      if (patternLeg(s) === 'downwind' && f.cDwLevel && Math.abs(agl - 1000) > 200) g.pen('c_dwalt', 15, r('Отклонение от высоты круга больше 200 фт', 'Circuit altitude deviation over 200 ft'));
      if (patternLeg(s) === 'downwind' && Math.abs(agl - 1000) < 100) f.cDwLevel = true;
      if (c.rpm > 2750) g.pen('c_overrev', 30, r('Обороты выше красной черты 2700', 'RPM above the 2700 red line'));
    }
    // поздняя реакция на отсутствие давления масла
    if (c.running && f.cStartT !== undefined && s.t - (f.cStartT as number) > 30 && c.oilP < 20) {
      m.oilLateT = (m.oilLateT ?? 0) + dt;
      if (m.oilLateT > 20) g.pen('c_oil_late', 80, r('Двигатель без давления масла работал больше 50 с', 'Engine ran without oil pressure for over 50 s'));
    }
  },

  tick(g, dt) {
    const s = g.s;
    const c = s.c;
    const f = s.flags;
    const m = g.mem as Mem;
    if (f.cOffRwy) return { res: 'fail', reason: r('Касание за пределами ВПП — авария.', 'Touched down off the runway — crash.') };
    if (s.ac.landed && s.ac.td && s.ac.td.vs < -1100) return { res: 'fail', reason: r(`Разрушение при посадке: ${Math.round(s.ac.td.vs)} фт/мин.`, `Crash landing: ${Math.round(s.ac.td.vs)} fpm.`) };
    if (s.ac.overrun && s.ac.gs > 4) return { res: 'fail', reason: r('Выкатывание за пределы ВПП.', 'Runway overrun.') };
    const coldOk = !c.running && c.rpm < 5 && s.sw.C_MAGS === 0 && s.sw.C_BAT === 0;
    // отмена полёта по технической причине до взлёта
    if (!f.cAirborne && coldOk && (f.cMagBad || f.cRough || (c.failOil && f.cStartT !== undefined))) {
      m.endT = (m.endT ?? 0) + dt;
      if (m.endT > 2) {
        g.bonus('c_nogo', 150, r('Правильное решение: полёт отменён из-за неисправности', 'Correct decision: flight cancelled for a defect'));
        return { res: 'secured', partial: true, reason: r('Полёт отменён до взлёта по технической причине. Хорошее решение, командир!', 'Flight cancelled before take-off for a technical reason. Good call, captain!') };
      }
    }
    if (s.gnd.phase === 'parked' && coldOk && c.pre.lock && c.pre.chocks) {
      m.endT = (m.endT ?? 0) + dt;
      if (m.endT > 1.5) {
        g.gate('c_end', ['c_land', 'c_shut']);
        return { res: 'secured', reason: r('Полёт по кругу выполнен, самолёт закреплён на стоянке.', 'Circuit flown, aircraft secured on the apron.') };
      }
    }
    return null;
  },
};
