import { setupArrival } from '../sim/arrival';
import { c172Rules } from '../sim/c172/rules';
import { KT, ilsDev } from '../sim/flight';
import { SCN } from '../sim/scenario';
import type { SimEvent } from '../sim/sim';
import type { AircraftType, L, SimState } from '../sim/types';
import type { Game } from './game';
import { checkStable } from './procedure_arr';

export interface Rules {
  onEvent(g: Game, e: SimEvent): void;
  flags(g: Game, dt: number): void;
  tick(g: Game, dt: number): { res: SimState['result']; reason: L } | null;
}

const r = (ru: string, en: string): L => ({ ru, en });

// ============================ A320 ============================

export const a320Rules: Rules = {
  onEvent(g, e) {
    const s = g.s;
    switch (e.type) {
      case 'engStart': {
        if (s.leg === 'arr') break;
        const n = e.eng as number;
        if (s.sw.BEACON !== 1) g.pen('eng_beacon', 40, r('Запуск двигателя при выключенном маяке (BEACON)', 'Engine start with beacon off'));
        if (s.gnd.doors.L1 || s.gnd.doors.FWD || s.gnd.doors.AFT) g.pen('eng_doors', 40, r('Запуск двигателя с открытыми дверями', 'Engine start with doors open'));
        if (!s.atc.pushApproved) g.pen('eng_noclr', 30, r('Запуск без разрешения диспетчера', 'Engine start without ATC approval'));
        if (s.gnd.gpu) g.pen('eng_gpu', 30, r('Запуск двигателя с подключённым GPU', 'Engine start with GPU connected'));
        if (n === 1 && !s.eng[1].running && !g.once.has('eng_order')) g.pen('eng_order', 10, r('По SOP первым запускают двигатель 2', 'SOP: start engine 2 first'));
        g.gate('start', ['power', 'apu', 'prep', 'fms', 'before']);
        break;
      }
      case 'pushStart':
        if (s.sw.BEACON !== 1) g.pen('push_beacon', 30, r('Буксировка при выключенном маяке', 'Pushback with beacon off'));
        break;
      case 'pushBrake':
        g.pen('push_brake', 30, r('Торможение во время буксировки (риск среза водила)', 'Braking during pushback (tow bar shear risk)'));
        break;
      case 'taxiStart':
        if (!s.atc.taxiClear) g.pen('taxi_noclr', 60, r('Руление без разрешения', 'Taxi without clearance'));
        if (!s.eng[0].running || !s.eng[1].running) g.pen('taxi_1eng', 20, r('Руление без запуска обоих двигателей', 'Taxi without both engines running'));
        g.gate('taxi', ['after']);
        break;
      case 'crossHold':
        if (!s.atc.lineupClear) g.pen('incursion', 150, r('Несанкционированный выезд на ВПП (runway incursion)!', 'Runway incursion — crossed the holding point without clearance!'));
        break;
      case 'powerLoss':
        if (s.leg === 'dep') g.pen('power_loss', 50, r('Обесточивание: отключили GPU без другого источника', 'Power loss: GPU removed with no other source'));
        break;
      case 'irAlignFault':
        g.pen('ir_move', 40, r('Самолёт двигался во время выставки ИНС', 'Aircraft moved during IRS alignment'));
        break;
      case 'idgDisc':
        g.pen(`idg${e.eng}`, 100, r(`Отключён IDG ${e.eng} без причины — генератор потерян`, `IDG ${e.eng} disconnected for no reason — generator lost`));
        break;
      case 'ratDeployed':
        g.pen('rat', 80, r('Выпущена RAT без необходимости', 'RAT deployed for no reason'));
        break;
      case 'masksDropped':
        g.pen('masks', 80, r('Выброшены кислородные маски в салоне', 'Passenger masks released'));
        break;
      case 'rainRepellent':
        g.pen('rain', 10, r('Водоотталкивающая жидкость на сухое стекло', 'Rain repellent on a dry windshield'));
        break;
      case 'egtOverlimit':
        g.pen(`egt${e.eng}`, 100, r(`Превышение EGT двигателя ${e.eng}`, `Engine ${e.eng} EGT overlimit`));
        break;
      case 'tailStrike':
        g.pen('tailstrike', 250, r(`Удар хвостом о ВПП (тангаж ${(+e.pitch).toFixed(1)}° на земле)`, `Tail strike (pitch ${(+e.pitch).toFixed(1)}° on ground)`));
        break;
      case 'ecam':
        if (e.level === 'warn' && String(e.id).startsWith('CFG') && s.flags.toPowerSet && s.ac.onGround) g.pen(`cfg_${e.id}`, 50, r(`Взлётная тяга с предупреждением ECAM ${e.id}`, `Take-off thrust with ECAM ${e.id}`));
        if (e.id === 'OVERSPEED') g.pen('overspeed_' + s.leg, 50, r('Превышение VFE', 'VFE exceeded'));
        if (e.id === 'LG_NOT_DOWN') g.pen('lg_not_down', 80, r('Предупреждение L/G GEAR NOT DOWN — шасси не выпущено вовремя', 'L/G GEAR NOT DOWN warning — gear not lowered in time'));
        break;
      case 'engStartFault':
        s.flags.startFaultT = s.t;
        break;
      case 'apuAutoShutdown':
        s.flags.apuFaultT = s.t;
        break;
      case 'liftoff':
        if (e.ias < SCN.vr - 3) g.pen('early_rot', 30, r(`Ранний подъём носа: отрыв на ${Math.round(e.ias)} уз`, `Early rotation: lift-off at ${Math.round(e.ias)} kt`));
        break;
      case 'rto': {
        const failIas = s.flags.engFailIas as number | undefined;
        if (failIas !== undefined && failIas < SCN.v1) g.bonus('rto_ok', 150, r('Отказ до V1 — взлёт прерван правильно', 'Failure before V1 — correct rejected take-off'));
        else if (failIas !== undefined) g.pen('rto_late', 150, r('Прерывание взлёта после V1 при отказе двигателя', 'Rejected after V1 with engine failure'));
        else if (!s.ecam.active.some((a) => a.level === 'warn')) g.pen('rto_noreason', 100, r('Прерванный взлёт без причины', 'Rejected take-off without reason'));
        s.flags.rtoT = s.t;
        break;
      }
      // ---------------- прилёт ----------------
      case 'landing': {
        const vs = e.vs as number;
        if (!s.atc.ldgClear) g.pen('ldg_noclr', 200, r('Посадка без разрешения диспетчера!', 'Landing without clearance!'));
        if (vs < -900) g.pen('hard2', 250, r(`Очень грубая посадка: ${Math.round(vs)} фт/мин`, `Very hard landing: ${Math.round(vs)} fpm`));
        else if (vs < -600) g.pen('hard1', 100, r(`Грубая посадка: ${Math.round(vs)} фт/мин`, `Hard landing: ${Math.round(vs)} fpm`));
        else if (vs > -240) g.bonus('soft', 50, r(`Мягкая посадка: ${Math.round(vs)} фт/мин`, `Smooth landing: ${Math.round(vs)} fpm`));
        if ((e.pitch as number) > 10) g.pen('tail_ldg', 250, r(`Удар хвостом при посадке (тангаж ${(+e.pitch).toFixed(1)}°)`, `Tail strike on landing (pitch ${(+e.pitch).toFixed(1)}°)`));
        const along = e.along as number;
        if (along > 900) g.pen('long_ldg', 50, r(`Длинная посадка: касание в ${Math.round(along)} м от торца`, `Long landing: touchdown ${Math.round(along)} m past the threshold`));
        else if (along >= 150) g.bonus('tdz', 30, r(`Касание в зоне приземления (${Math.round(along)} м)`, `Touchdown in the TDZ (${Math.round(along)} m)`));
        if (Math.abs(e.side as number) > 8) g.pen('offcl', 30, r(`Касание в ${Math.abs(+e.side).toFixed(0)} м от оси`, `Touchdown ${Math.abs(+e.side).toFixed(0)} m off centreline`));
        if (!s.ac.gndSplrsArmed) g.pen('splrs_ldg', 20, r('Интерцепторы не были взведены', 'Ground spoilers were not armed'));
        if (s.sw.TL1 > 0.5 || s.sw.TL2 > 0.5) g.pen('noretard', 30, r('Касание с РУД не в IDLE (RETARD)', 'Touchdown without retarding the levers'));
        g.gate('landing', ['appr', 'final']);
        break;
      }
      case 'goAround': {
        const unstable = s.flags.unstable1000;
        if (unstable) g.bonus('ga_ok_' + Math.floor(s.t), 50, r('Нестабилизированный заход — правильный уход на второй круг', 'Unstable approach — correct go-around'));
        break;
      }
      case 'standOvershoot':
        g.pen('stand_ovs', 20, r('Проскочили стоп-линию стоянки', 'Overshot the stand stop line'));
        break;
      case 'engShutdown':
        if (s.ac.landed && s.gnd.phase !== 'parked') g.pen('eng_off_taxi', 30, r('Двигатель выключен до заруливания на стоянку', 'Engine shut down before reaching the stand'));
        if (s.ac.landed && s.sw.PARK_BRK === 0 && !s.gnd.chocks) g.pen('eng_off_nopark', 30, r('Двигатели выключены без стояночного тормоза', 'Engines shut down without parking brake'));
        if (s.ac.landed && !s.apu.avail && !s.elec.ext && s.eng.filter((x) => x.running).length === 0) g.pen('eng_off_dark', 20, r('Двигатели выключены без ВСУ и GPU — самолёт обесточен', 'Engines shut down without APU or GPU — aircraft lost power'));
        break;
      case 'sw': {
        if (!s.ac.landed) break;
        if (e.id === 'BEACON' && e.v === 0 && s.eng.some((x) => x.n2 > 15)) g.pen('beacon_off_eng', 40, r('Маяк выключен при работающих двигателях', 'Beacon off with engines running'));
        if ((e.id === 'BAT1' || e.id === 'BAT2') && e.v === 0) {
          if (s.apu.n > 3 || s.apu.flap > 0.05) g.pen('bat_apu', 50, r('Аккумуляторы выключены до полной остановки ВСУ', 'Batteries off before the APU fully stopped'));
          if ([1, 2, 3].some((i) => s.sw[`IR${i}_MODE`] !== 0)) g.pen('bat_ir', 20, r('Аккумуляторы выключены при включённых ADIRS', 'Batteries off with ADIRS still on'));
        }
        if (e.id === 'APU_MASTER' && e.v === 0 && s.sw.ENG1_MASTER + s.sw.ENG2_MASTER === 0 && !s.gnd.gpu && s.sw.APU_BLEED === 1)
          g.pen('apu_bleed_on_off', 10, r('ВСУ выключена при включённом отборе воздуха', 'APU shut down with APU bleed still on'));
        break;
      }
    }
  },

  flags(g) {
    const s = g.s;
    if (s.leg !== 'arr') return;
    const agl = s.ac.alt - s.elev;
    if (!s.ac.onGround && agl < 1000 && !s.flags.chk1000 && !s.flags.ga) {
      s.flags.chk1000 = true;
      const why = checkStable(s);
      if (why.length) {
        s.flags.unstable1000 = true;
        g.pen('unstable_' + Math.floor(s.t), 50, { ru: `Нестабилизированный заход на 1000 фт: ${why.map((w) => w.ru).join(', ')}`, en: `Unstable approach at 1000 ft: ${why.map((w) => w.en).join(', ')}` }, true);
      } else s.flags.stab1000 = true;
    }
    if (s.gnd.phase === 'parked' && s.sw.APU_BLEED === 1) s.flags.apuBleedPark = true;
    if (s.ecam.sdManual === 'STS') s.flags.stsArr = true;
  },

  tick(g, dt) {
    const s = g.s;
    const ac = s.ac;
    const st = g.mem as { taxiFast?: boolean; endTimer: number; taxiInT: number };
    st.endTimer ??= 0;
    st.taxiInT ??= 0;
    // руление
    const gsKt = ac.gs * KT;
    if (['taxi', 'holding', 'lineup', 'taxiin'].includes(s.gnd.phase) && gsKt > 30) {
      if (!st.taxiFast) {
        st.taxiFast = true;
        g.pen('taxi_fast_' + Math.floor(s.t), 20, r(`Скорость руления ${Math.round(gsKt)} уз (> 30)`, `Taxi speed ${Math.round(gsKt)} kt (> 30)`), true);
      }
    } else if (gsKt < 25) st.taxiFast = false;
    if (s.flags.toPowerSet && !g.gates.has('to') && s.leg === 'dep') {
      if (!s.atc.toClear) g.pen('to_noclr', 200, r('Взлёт без разрешения диспетчера!', 'Take-off without clearance!'));
      if (s.sw.PARK_BRK === 1) g.pen('to_park', 30, r('Взлётная тяга на стояночном тормозе', 'Take-off thrust with parking brake on'));
      g.gate('to', ['taxi', 'lineup']);
    }
    if (s.gnd.phase === 'taxiin' && gsKt > 3 && !s.atc.taxiInClear) {
      st.taxiInT += dt;
      if (st.taxiInT > 25) g.pen('taxiin_noclr', 30, r('Руление на стоянку без разрешения Земли', 'Taxi to stand without Ground clearance'));
    }
    // отказы — бонусы
    for (let i = 0; i < 2; i++) {
      const e = s.eng[i];
      if (s.flags.startFaultT !== undefined && e.startFault && s.sw[`ENG${i + 1}_MASTER`] === 0) g.bonus(`sf_ok${i}`, 30, r('START FAULT: ENG MASTER выключен по ECAM', 'START FAULT: ENG MASTER off per ECAM'));
    }
    if (s.flags.apuFaultT !== undefined && s.sw.APU_MASTER === 0) g.bonus('apu_ok', 20, r('APU AUTO SHUT DOWN отработан', 'APU AUTO SHUT DOWN handled'));
    if (s.bleed.pack1Fault && s.sw.PACK1 === 0) g.bonus('pack_ok', 20, r('AIR PACK 1 FAULT отработан', 'AIR PACK 1 FAULT handled'));
    if (g.isDone('elac')) g.bonus('elac_ok', 20, r('Сброс ELAC 1 выполнен', 'ELAC 1 reset done'));
    if (s.flags.lgJam && ac.gear > 0.99 && !ac.onGround) g.bonus('grav_ok', 60, r('Шасси выпущено аварийно по QRH', 'Gear extended by gravity per QRH'));
    if (s.eng[0].failed && s.leg === 'arr' && s.sw.ENG1_MASTER === 0) g.bonus('efail_app_ok', 40, r('Отказавший двигатель выключен по ECAM', 'Failed engine shut down per ECAM'));

    // ---------------- окончание ----------------
    const agl = ac.alt - s.elev;
    if (s.leg === 'dep') {
      if (!ac.onGround && agl >= 3000 && (s.scn !== 'full' || ac.gear < 0.05)) {
        if (s.scn === 'full') {
          g.gate('dep_end', ['takeoff']);
          setupArrival(s, 'continue');
          g.sim.emit({ type: 'cruiseSkip' });
          return null;
        }
        return { res: 'success', reason: r('Набрано 3000 фт — сценарий выполнен!', 'Reached 3000 ft — scenario complete!') };
      }
      if (s.eng.some((e) => e.failed) && !ac.onGround && agl >= 1000 && (s.flags.engFailIas as number) >= SCN.v1) {
        g.bonus('efail_go', 150, r('Отказ после V1 — взлёт продолжен правильно', 'Failure after V1 — take-off correctly continued'));
        return { res: 'success', reason: r('Отказ двигателя после V1: взлёт продолжен, набрано 1000 фт.', 'Engine failure after V1: take-off continued to 1000 ft.') };
      }
      if (ac.overrun && ac.onGround && ac.gs > 2) return { res: 'fail', reason: r('Выкатывание за пределы ВПП.', 'Runway overrun.') };
      if (s.flags.touchdown) return { res: 'fail', reason: r('Самолёт снова коснулся земли после отрыва.', 'The aircraft touched down again after lift-off.') };
      if (s.flags.rtoT !== undefined && ac.onGround && ac.stopped) {
        st.endTimer += dt;
        if (st.endTimer > 3) return { res: 'rto', reason: r('Прерванный взлёт: самолёт остановлен на ВПП.', 'Rejected take-off: aircraft stopped on the runway.') };
      }
      if (s.eng.some((e) => e.fireOut) && s.eng.every((e) => !e.fire)) {
        const n = s.eng[0].fireOut ? 1 : 2;
        if (s.sw[`ENG${n}_MASTER`] === 0) {
          st.endTimer += dt;
          if (st.endTimer > 6) {
            const tOut = s.t - (s.flags.fireStartT as number);
            if (tOut < 60) g.bonus('fire_fast', 150, r(`Пожар ликвидирован за ${Math.round(tOut)} с`, `Fire handled in ${Math.round(tOut)} s`));
            else g.bonus('fire_slow', 60, r(`Пожар ликвидирован за ${Math.round(tOut)} с`, `Fire handled in ${Math.round(tOut)} s`));
            return { res: 'fire', reason: r('Пожар двигателя потушен. Вылет отменён, пассажиры в безопасности.', 'Engine fire extinguished. Flight cancelled, passengers safe.') };
          }
        }
      }
      return null;
    }
    // ----- прилёт -----
    if (s.flags.ga && !ac.onGround && agl > 1500 && !s.flags.gaDone) {
      s.flags.gaDone = true;
      setupArrival(s, 'again');
      g.sim.emit({ type: 'approachAgain' });
      return null;
    }
    if (ac.landed && ac.td) {
      if (ac.td.vs < -1200) return { res: 'fail', reason: r(`Разрушение при посадке: ${Math.round(ac.td.vs)} фт/мин.`, `Crash landing: ${Math.round(ac.td.vs)} fpm.`) };
      if (ac.td.along < -30) return { res: 'fail', reason: r('Касание до торца ВПП.', 'Touchdown short of the runway.') };
      if (Math.abs(ac.td.side) > 22) return { res: 'fail', reason: r('Выкатывание: касание за пределами ВПП.', 'Runway excursion: touchdown off the runway.') };
      if (ac.gear < 0.9 && !s.flags.gearUpLdg) {
        s.flags.gearUpLdg = true;
        return { res: 'fail', reason: r('Посадка с убранным шасси!', 'Gear-up landing!') };
      }
      if (ac.overrun && ac.gs > 2) return { res: 'fail', reason: r('Выкатывание за пределы ВПП после посадки.', 'Runway overrun after landing.') };
    }
    if (s.gnd.phase === 'parked' && s.sw.BAT1 === 0 && s.sw.BAT2 === 0) {
      const cold = s.eng.every((e) => e.n2 < 2) && s.apu.n < 2;
      if (cold) {
        g.gate('park', ['land', 'aland', 'park']);
        return { res: 'secured', reason: r('Самолёт на стоянке и обесточен: Cold & Dark. Рейс завершён!', 'Aircraft parked and secured: cold & dark. Flight complete!') };
      }
    }
    void ilsDev;
    return null;
  },
};

export function rulesFor(type: AircraftType): Rules {
  return type === 'c172' ? c172Rules : a320Rules;
}
