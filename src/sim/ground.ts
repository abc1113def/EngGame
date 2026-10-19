import { ilsDev } from './flight';
import { c172Comms } from './c172/comms';
import { SCN, SCN_ARR, SCN_C172 } from './scenario';
import type { Emit } from './systems';
import type { L, SimState } from './types';

export type Unit = 'ATIS' | 'DEL' | 'GND' | 'TWR' | 'APP' | 'CREW' | 'CAB' | 'PA' | 'PAX' | 'SYS';

const fq = (f: number) => (f / 1000).toFixed(3);
export const freqStr = fq;

export function freqTable(s: SimState): Record<string, number> {
  if (s.type === 'c172') return SCN_C172.freqs;
  return s.leg === 'arr' ? SCN_ARR.freqs : SCN.freqs;
}

export function radioUnit(s: SimState): Unit | '' {
  if (s.type === 'c172') {
    if (s.c.busV < 20 || s.sw.C_AVIONICS1 !== 1) return '';
    for (const [k, v] of Object.entries(SCN_C172.freqs)) if (v === s.c.com) return k as Unit;
    return '';
  }
  if (s.sw.RMP_ON !== 1 || !s.elec.dcEss) return '';
  for (const [k, v] of Object.entries(freqTable(s))) if (v === s.radio.active) return k as Unit;
  return '';
}

export function say(s: SimState, emit: Emit, unit: Unit, msg: L, delay = 0, apply?: string) {
  if (delay > 0) s.atc.pending.push({ at: s.t + delay, unit, msg, apply });
  else {
    emit({ type: 'radio', unit, msg });
    if (apply) applyCode(s, apply, emit);
  }
}

export function me(s: SimState, emit: Emit, unit: Unit, msg: L) {
  emit({ type: 'radio', unit, msg, me: true });
}

function applyCode(s: SimState, code: string, emit: Emit) {
  const a = s.atc;
  const g = s.gnd;
  switch (code) {
    case 'clearance':
      a.clearance = true;
      break;
    case 'push':
      a.pushApproved = true;
      break;
    case 'taxi':
      a.taxiClear = true;
      break;
    case 'lineup':
      a.lineupClear = true;
      break;
    case 'takeoff':
      a.toClear = true;
      break;
    case 'cleared':
      a.lineupClear = true;
      a.toClear = true;
      break;
    case 'gpuOn':
      g.gpu = true;
      break;
    case 'gpuOff':
      g.gpu = false;
      break;
    case 'doors':
      g.doors.L1 = false;
      g.doors.FWD = false;
      g.doors.AFT = false;
      break;
    case 'slides':
      g.slidesArmed = true;
      break;
    case 'disc':
      g.tow = false;
      g.headset = false;
      g.pushStage = 'done';
      break;
    case 'cabinReady':
      g.cabinReady = true;
      break;
    case 'appClear':
      a.appClear = true;
      break;
    case 'ldgClear':
      a.ldgClear = true;
      break;
    case 'taxiIn':
      a.taxiInClear = true;
      break;
    case 'disarm':
      g.slidesArmed = false;
      break;
    case 'chocks':
      g.chocks = true;
      g.headset = true;
      break;
    case 'doorOpen':
      g.doors.L1 = true;
      break;
  }
  emit({ type: 'atcApply', code });
}

const C = (s: SimState) => SCN.callsign;

/** Все действия связи. Возвращает false, если действие невозможно. */
export function comms(s: SimState, id: string, emit: Emit): boolean {
  if (s.type === 'c172') return c172Comms(s, id, emit);
  const a = s.atc;
  const g = s.gnd;
  const unit = radioUnit(s);
  const cs = C(s);
  const noRadio = (need: Unit) => {
    if (s.type === 'c172' ? s.c.busV < 20 || s.sw.C_AVIONICS1 !== 1 : s.sw.RMP_ON !== 1 || !s.elec.dcEss) {
      emit({
        type: 'radio',
        unit: 'SYS',
        msg: s.type === 'c172' ? { ru: 'Радио молчит: нужны MASTER и AVIONICS BUS 1.', en: 'Radio dead: needs MASTER and AVIONICS BUS 1.' } : { ru: 'Радиостанция не работает: включите RMP 1 (нужно питание).', en: 'Radio dead: switch RMP 1 on (needs power).' },
      });
      return true;
    }
    if (unit !== need) {
      emit({
        type: 'radio',
        unit: 'SYS',
        msg: {
          ru: `Нет ответа. Активная частота ${fq(s.type === 'c172' ? s.c.com : s.radio.active)}, а ${need} — ${fq(freqTable(s)[need])}.`,
          en: `No reply. Active frequency is ${fq(s.type === 'c172' ? s.c.com : s.radio.active)}; ${need} is ${fq(freqTable(s)[need])}.`,
        },
      });
      return true;
    }
    return false;
  };
  const intercom = () => {
    if (!s.elec.dcEss) {
      emit({ type: 'radio', unit: 'SYS', msg: { ru: 'Нет питания — интерфон не работает.', en: 'No power — interphone dead.' } });
      return false;
    }
    return true;
  };
  const crew = () => {
    if (!g.headset) {
      emit({ type: 'radio', unit: 'SYS', msg: { ru: 'Техник уже отключил гарнитуру.', en: 'Ground crew headset is disconnected.' } });
      return false;
    }
    return intercom();
  };

  switch (id) {
    // ------------------------- ATC -------------------------
    case 'atis': {
      if (noRadio('ATIS')) return false;
      a.atis = true;
      const dew = a.oat - 5;
      say(s, emit, 'ATIS', {
        en: `Toulouse Blagnac information ${a.atisLetter}. Runway in use 32L. Wind ${a.windDir} degrees ${a.windSpd} knots. CAVOK. Temperature ${a.oat}, dewpoint ${dew}. QNH ${a.qnh}. Transition level 60. Acknowledge information ${a.atisLetter} on first contact.`,
        ru: `Тулуза-Бланьяк, информация ${a.atisLetter}. ВПП 32L. Ветер ${a.windDir}° ${a.windSpd} уз. CAVOK. Температура ${a.oat}, точка росы ${dew}. QNH ${a.qnh}. Эшелон перехода 60. Сообщите о получении информации ${a.atisLetter}.`,
      });
      return true;
    }
    case 'del_clr': {
      if (noRadio('DEL')) return false;
      me(s, emit, 'DEL', { en: `Blagnac Delivery, ${cs}, stand 12, information ${a.atis ? a.atisLetter : '?'}, request IFR clearance to Paris Orly.`, ru: `Бланьяк-Деливери, ${cs}, стоянка 12, информация ${a.atis ? a.atisLetter : '?'}, прошу IFR-разрешение на Париж-Орли.` });
      if (!a.atis) {
        say(s, emit, 'DEL', { en: `${cs}, information ${a.atisLetter} is current, check ATIS and call back.`, ru: `${cs}, действует информация ${a.atisLetter}. Прослушайте ATIS и вызовите снова.` }, 2.5);
        return true;
      }
      say(
        s,
        emit,
        'DEL',
        {
          en: `${cs}, cleared to Paris Orly via ${SCN.sid} departure, runway 32L, climb ${a.initAlt} feet, squawk ${a.squawk}.`,
          ru: `${cs}, разрешено до Париж-Орли по схеме ${SCN.sid}, ВПП 32L, набор ${a.initAlt} фт, ответчик ${a.squawk}.`,
        },
        3,
        'clearance',
      );
      return true;
    }
    case 'gnd_pushreq': {
      if (noRadio('GND')) return false;
      me(s, emit, 'GND', { en: `Blagnac Ground, ${cs}, stand 12, request push and start.`, ru: `Бланьяк-Земля, ${cs}, стоянка 12, прошу буксировку и запуск.` });
      if (!a.clearance) {
        say(s, emit, 'GND', { en: `${cs}, no clearance on file, contact Delivery ${fq(SCN.freqs.DEL)}.`, ru: `${cs}, у вас нет разрешения, свяжитесь с Деливери ${fq(SCN.freqs.DEL)}.` }, 2.5);
        return true;
      }
      say(s, emit, 'GND', { en: `${cs}, push and start approved, facing south-east.`, ru: `${cs}, буксировка и запуск разрешены, носом на юго-восток.` }, 2.5, 'push');
      return true;
    }
    case 'gnd_taxi': {
      if (noRadio('GND')) return false;
      me(s, emit, 'GND', { en: `Blagnac Ground, ${cs}, request taxi.`, ru: `Бланьяк-Земля, ${cs}, прошу руление.` });
      if (!a.pushApproved || g.pushStage !== 'done') {
        say(s, emit, 'GND', { en: `${cs}, report ready for taxi when ground crew is clear.`, ru: `${cs}, доложите готовность к рулению, когда отключится наземный персонал.` }, 2.5);
        return true;
      }
      say(s, emit, 'GND', { en: `${cs}, taxi to holding point runway 32L via Bravo, QNH ${a.qnh}.`, ru: `${cs}, руление к предварительному старту ВПП 32L по рулёжке Браво, QNH ${a.qnh}.` }, 2.5, 'taxi');
      return true;
    }
    case 'twr_ready': {
      if (noRadio('TWR')) return false;
      me(s, emit, 'TWR', { en: `Blagnac Tower, ${cs}, holding point runway 32L, ready for departure.`, ru: `Бланьяк-Вышка, ${cs}, предварительный ВПП 32L, к взлёту готов.` });
      if (!a.taxiClear || (g.phase !== 'holding' && g.phase !== 'taxi') || g.taxiPath > 250) {
        say(s, emit, 'TWR', { en: `${cs}, report holding point.`, ru: `${cs}, доложите на предварительном.` }, 2.5);
        return true;
      }
      say(s, emit, 'TWR', { en: `${cs}, runway 32L, line up and wait.`, ru: `${cs}, ВПП 32L, занимайте исполнительный и ждите.` }, 2.5, 'lineup');
      return true;
    }
    case 'atc_notify': {
      const u: Unit = unit === 'TWR' ? 'TWR' : 'GND';
      if (unit !== 'TWR' && unit !== 'GND') {
        if (noRadio('TWR')) return false;
      }
      a.pending = a.pending.filter((p) => p.apply !== 'takeoff');
      s.flags.atcNotified = true;
      const fire = s.eng.some((e) => e.fire);
      me(s, emit, u, fire ? { en: `MAYDAY MAYDAY MAYDAY, ${cs}, engine fire, stopping.`, ru: `MAYDAY MAYDAY MAYDAY, ${cs}, пожар двигателя, останавливаемся.` } : { en: `${cs}, stopping.`, ru: `${cs}, прекращаем взлёт / останавливаемся.` });
      say(s, emit, u, fire ? { en: `${cs}, roger, fire services on the way.`, ru: `${cs}, понял, пожарные выехали.` } : { en: `${cs}, roger, report intentions.`, ru: `${cs}, понял, сообщите намерения.` }, 2.5);
      return true;
    }
    // ------------------------- наземный техник -------------------------
    case 'crew_gpu_on': {
      if (!crew()) return false;
      if (g.gpu) {
        say(s, emit, 'CREW', { en: 'Ground power is already connected.', ru: 'Наземное питание уже подключено.' });
        return true;
      }
      me(s, emit, 'CREW', { en: 'Ground, cockpit, please connect ground power.', ru: 'Земля, кабина, подключите, пожалуйста, наземное питание.' });
      say(s, emit, 'CREW', { en: 'Connecting GPU... Ground power connected, you can switch it on.', ru: 'Подключаю GPU... Наземное питание подключено, можно включать.' }, 15, 'gpuOn');
      return true;
    }
    case 'crew_gpu_off': {
      if (!crew()) return false;
      me(s, emit, 'CREW', { en: 'Ground, cockpit, disconnect ground power.', ru: 'Земля, кабина, отключайте наземное питание.' });
      say(s, emit, 'CREW', { en: 'Ground power disconnected.', ru: 'Наземное питание отключено.' }, 8, 'gpuOff');
      return true;
    }
    case 'crew_push': {
      if (!crew()) return false;
      me(s, emit, 'CREW', { en: 'Ground, cockpit, ready for pushback.', ru: 'Земля, кабина, готовы к буксировке.' });
      if (!a.pushApproved) {
        say(s, emit, 'CREW', { en: 'Do we have pushback approval from ATC?', ru: 'А разрешение на буксировку от диспетчера есть?' }, 1.5);
        return true;
      }
      if (g.gpu) {
        say(s, emit, 'CREW', { en: 'Ground power is still connected — disconnect it first.', ru: 'Наземное питание ещё подключено — сначала отключите его.' }, 1.5);
        return true;
      }
      if (g.doors.L1 || g.doors.FWD || g.doors.AFT) {
        say(s, emit, 'CREW', { en: 'Doors are still open, I can\'t push.', ru: 'Двери ещё открыты, буксировать не могу.' }, 1.5);
        return true;
      }
      if (g.pushStage !== 'none') return true;
      g.chocks = false;
      g.pushStage = 'wait-brake';
      s.flags.pushBeacon = s.sw.BEACON === 1;
      say(s, emit, 'CREW', { en: 'Chocks removed, tow bar connected. Release parking brake.', ru: 'Колодки убраны, водило подсоединено. Снимайте со стояночного тормоза.' }, 2);
      return true;
    }
    case 'crew_start': {
      if (!crew()) return false;
      me(s, emit, 'CREW', { en: 'Ground, cockpit, starting engines.', ru: 'Земля, кабина, запускаем двигатели.' });
      s.flags.startCleared = true;
      say(s, emit, 'CREW', { en: 'Area clear, cleared to start.', ru: 'Зона свободна, запуск разрешаю.' }, 1.5);
      return true;
    }
    case 'crew_disc': {
      if (!crew()) return false;
      if (g.pushStage !== 'connected-wait') {
        say(s, emit, 'CREW', { en: 'Pushback is not complete yet.', ru: 'Буксировка ещё не закончена.' });
        return true;
      }
      me(s, emit, 'CREW', { en: 'Ground, cockpit, cleared to disconnect.', ru: 'Земля, кабина, можно отключаться.' });
      say(s, emit, 'CREW', { en: 'Disconnecting. Bypass pin removed, watch for my signal on your left. Bye!', ru: 'Отключаюсь. Штырь снят, смотрите на мой сигнал слева. Хорошего полёта!' }, 12, 'disc');
      return true;
    }
    // ------------------------- кабина -------------------------
    case 'cab_doors': {
      if (!intercom()) return false;
      me(s, emit, 'CAB', { en: 'Purser, cockpit: close doors please.', ru: 'Старший бортпроводник, закрывайте двери.' });
      if (g.boarding < 1) {
        say(s, emit, 'CAB', { en: `Boarding is not complete yet (${Math.round(g.boarding * 100)}%).`, ru: `Посадка ещё не закончена (${Math.round(g.boarding * 100)}%).` }, 2);
        return true;
      }
      say(s, emit, 'CAB', { en: 'All doors closed, cargo doors closed.', ru: 'Все двери закрыты, грузовые люки закрыты.' }, 20, 'doors');
      return true;
    }
    case 'cab_arm': {
      if (!intercom()) return false;
      if (g.doors.L1) {
        say(s, emit, 'CAB', { en: 'Doors are still open.', ru: 'Двери ещё открыты.' });
        return true;
      }
      me(s, emit, 'PA', { en: 'Cabin crew, arm doors and cross-check.', ru: 'Бортпроводникам: двери на автомат и перекрёстная проверка.' });
      say(s, emit, 'CAB', { en: 'Doors armed and cross-checked.', ru: 'Двери на автомате, проверено.' }, 10, 'slides');
      return true;
    }
    case 'cab_seats': {
      if (!intercom()) return false;
      me(s, emit, 'PA', { en: 'Cabin crew, seats for take-off.', ru: 'Бортпроводникам: занять места для взлёта.' });
      s.flags.cabSeats = true;
      if (!g.cabinReady) say(s, emit, 'CAB', { en: 'Cockpit, cabin is ready for take-off.', ru: 'Кабина, салон к взлёту готов.' }, 30, 'cabinReady');
      return true;
    }
    case 'cab_alert': {
      if (!intercom()) return false;
      s.flags.cabinAlerted = true;
      me(s, emit, 'PA', { en: 'Attention, crew at stations! Attention, crew at stations!', ru: 'Внимание, экипажу по местам! Внимание, экипажу по местам!' });
      return true;
    }
    // ------------------------- прилёт -------------------------
    case 'arr_atis': {
      if (noRadio('ATIS')) return false;
      a.arrAtis = true;
      say(s, emit, 'ATIS', {
        en: `Orly information ${a.arrLetter}. ILS approach runway 06. Wind ${String(a.arrWindDir).padStart(3, '0')} degrees ${a.arrWindSpd} knots. Visibility 10 kilometres, broken 1800 feet. Temperature 9, dewpoint 5. QNH ${a.arrQnh}. Transition level 60.`,
        ru: `Орли, информация ${a.arrLetter}. Заход ILS ВПП 06. Ветер ${String(a.arrWindDir).padStart(3, '0')}° ${a.arrWindSpd} уз. Видимость 10 км, облачность 1800 фт. Температура 9, точка росы 5. QNH ${a.arrQnh}. Эшелон перехода 60.`,
      });
      return true;
    }
    case 'app_est': {
      if (noRadio('APP')) return false;
      me(s, emit, 'APP', { en: `Orly Approach, ${cs}, established ILS 06.`, ru: `Орли-Подход, ${cs}, на курсе ILS 06.` });
      if (!s.flags.locCap) {
        say(s, emit, 'APP', { en: `${cs}, I don't see you on the localiser yet, report established.`, ru: `${cs}, вы ещё не на курсе, доложите на курсе.` }, 2.5);
        return true;
      }
      s.flags.estReported = true;
      say(s, emit, 'APP', { en: `${cs}, contact Orly Tower ${fq(SCN_ARR.freqs.TWR)}, good day.`, ru: `${cs}, работайте с Вышкой Орли ${fq(SCN_ARR.freqs.TWR)}, до свидания.` }, 2.5);
      return true;
    }
    case 'twr_land': {
      if (noRadio('TWR')) return false;
      const d = ilsDev(s);
      const nm = d ? Math.max(1, Math.round(d.dist / 1852)) : 5;
      me(s, emit, 'TWR', { en: `Orly Tower, ${cs}, ILS 06, ${nm} miles.`, ru: `Орли-Вышка, ${cs}, ILS 06, ${nm} миль.` });
      say(s, emit, 'TWR', { en: `${cs}, wind ${String(a.arrWindDir).padStart(3, '0')} degrees ${a.arrWindSpd} knots, runway 06 cleared to land.`, ru: `${cs}, ветер ${String(a.arrWindDir).padStart(3, '0')}° ${a.arrWindSpd} уз, ВПП 06, посадку разрешаю.` }, 2.5, 'ldgClear');
      return true;
    }
    case 'gnd_taxiin': {
      if (noRadio('GND')) return false;
      me(s, emit, 'GND', { en: `Orly Ground, ${cs}, runway 06 vacated, request taxi to stand.`, ru: `Орли-Земля, ${cs}, ВПП 06 освободил, прошу руление на стоянку.` });
      if (!s.ac.landed) return true;
      say(s, emit, 'GND', { en: `${cs}, taxi to stand ${SCN_ARR.stand} via Whiskey and Mike.`, ru: `${cs}, руление на стоянку ${SCN_ARR.stand} по Виски и Майк.` }, 2.5, 'taxiIn');
      return true;
    }
    case 'cab_land': {
      if (!intercom()) return false;
      me(s, emit, 'PA', { en: 'Cabin crew, prepare for landing.', ru: 'Бортпроводникам: приготовиться к посадке.' });
      s.flags.cabLand = true;
      if (!g.cabinReady) say(s, emit, 'CAB', { en: 'Cockpit, cabin is ready for landing.', ru: 'Кабина, салон к посадке готов.' }, 25, 'cabinReady');
      return true;
    }
    case 'cab_disarm': {
      if (!intercom()) return false;
      me(s, emit, 'PA', { en: 'Cabin crew, disarm doors and cross-check.', ru: 'Бортпроводникам: двери на ручной режим, перекрёстная проверка.' });
      say(s, emit, 'CAB', { en: 'Doors disarmed and cross-checked.', ru: 'Двери в ручном режиме, проверено.' }, 8, 'disarm');
      if (s.sw.BEACON === 0) say(s, emit, 'CAB', { en: 'Opening door L1, passengers disembarking.', ru: 'Открываем дверь L1, пассажиры выходят.' }, 25, 'doorOpen');
      return true;
    }
    case 'cab_evac': {
      if (!intercom()) return false;
      s.flags.evacApplied = true;
      s.sw.EVAC_CMD = 1;
      me(s, emit, 'PA', { en: 'Evacuate, evacuate, evacuate!', ru: 'Эвакуация! Эвакуация! Эвакуация!' });
      return true;
    }
  }
  return false;
}

// ============================ наземные процессы ============================
export function updGround(s: SimState, dt: number, emit: Emit) {
  const g = s.gnd;
  const a = s.atc;
  if (g.boarding < 1) {
    g.boarding = Math.min(1, g.boarding + dt / 240);
    if (g.boarding >= 1) say(s, emit, 'CAB', { en: 'Cockpit, boarding complete, 174 passengers. Ready to close doors.', ru: 'Кабина, посадка закончена, 174 пассажира. Готовы закрывать двери.' });
  }
  if (g.pushStage === 'wait-brake' && s.sw.PARK_BRK === 0) {
    g.pushStage = 'pushing';
    g.phase = 'push';
    say(s, emit, 'CREW', { en: 'Brakes released, pushback commencing.', ru: 'Тормоз снят, начинаем буксировку.' });
    emit({ type: 'pushStart' });
  }
  if (g.pushStage === 'pushing' && s.sw.PARK_BRK === 1) {
    g.pushStage = 'wait-brake';
    s.flags.pushBraked = true;
    say(s, emit, 'CREW', { en: 'Stop! Brakes set during push — release the brakes!', ru: 'Стоп! Вы затормозили во время буксировки — снимите тормоз!' });
    emit({ type: 'pushBrake' });
  }
  if (g.pushStage === 'wait-park') {
    g.phase = 'pushdone';
    s.ac.dist = 0;
    if (!s.flags.pushParkMsg) {
      s.flags.pushParkMsg = true;
      say(s, emit, 'CREW', { en: 'Pushback complete, set parking brake.', ru: 'Буксировка закончена, ставьте на стояночный тормоз.' });
    }
    if (s.sw.PARK_BRK === 1) {
      g.pushStage = 'connected-wait';
      say(s, emit, 'CREW', { en: 'Parking brake set. Ready to disconnect when you are.', ru: 'Стояночный тормоз установлен. Отключусь по вашей команде.' }, 1);
    }
  }
  // салон готов
  if (!g.cabinReady && (g.phase === 'taxi' || g.phase === 'holding') && !s.flags.cabSeats) {
    g.cabinReadyTimer += dt;
    if (g.cabinReadyTimer > 80) {
      s.flags.cabSeats = true;
      say(s, emit, 'CAB', { en: 'Cockpit, cabin is ready for take-off.', ru: 'Кабина, салон к взлёту готов.' }, 0, 'cabinReady');
    }
  }
  // переход на вышку
  if (a.taxiClear && !a.contactTower && g.phase === 'taxi' && g.taxiPath < 450) {
    a.contactTower = true;
    say(s, emit, 'GND', { en: `${SCN.callsign}, contact Tower ${fq(SCN.freqs.TWR)}.`, ru: `${SCN.callsign}, работайте с Вышкой ${fq(SCN.freqs.TWR)}.` });
  }
  // разрешение на взлёт после занятия ВПП
  if (a.lineupClear && !a.toClear && g.phase === 'runway' && !a.pending.some((p) => p.apply === 'takeoff') && !s.flags.toClrScheduled) {
    s.flags.toClrScheduled = true;
    say(s, emit, 'TWR', { en: `${SCN.callsign}, wind ${a.windDir} degrees ${a.windSpd} knots, runway 32L cleared for take-off.`, ru: `${SCN.callsign}, ветер ${a.windDir}° ${a.windSpd} уз, ВПП 32L, взлёт разрешаю.` }, 7, 'takeoff');
  }
  // ---------- прилёт ----------
  if (s.type === 'a320' && s.ac.landed) {
    if (!s.flags.vacateMsg && s.ac.ias < 60) {
      s.flags.vacateMsg = true;
      say(s, emit, 'TWR', { en: `${SCN.callsign}, vacate via first right when able, contact Ground ${fq(SCN_ARR.freqs.GND)}.`, ru: `${SCN.callsign}, освобождайте по первой направо, работайте с Землёй ${fq(SCN_ARR.freqs.GND)}.` }, 1);
    }
    if (g.phase === 'parked' && !g.chocks && s.eng.every((e) => e.n2 < 12) && s.sw.BEACON === 0 && !s.flags.chocksMsg) {
      s.flags.chocksMsg = true;
      say(s, emit, 'CREW', { en: 'Cockpit, ground: chocks in place, ground power is available if you need it.', ru: 'Кабина, земля: колодки установлены, наземное питание есть по запросу.' }, 6, 'chocks');
    }
  }
  deliverPending(s, emit);
}

/** Отложенные сообщения */
export function deliverPending(s: SimState, emit: Emit) {
  const a = s.atc;
  if (a.pending.length) {
    const due = a.pending.filter((p) => p.at <= s.t);
    if (due.length) {
      a.pending = a.pending.filter((p) => p.at > s.t);
      for (const p of due) say(s, emit, p.unit as Unit, p.msg, 0, p.apply);
    }
  }
}

// ============================ отказы ============================
export function updFailures(s: SimState, dt: number, emit: Emit) {
  const fp = s.flags.engFirePending as number | undefined;
  if (fp) {
    const e = s.eng[fp - 1];
    if (e.phase === 'accel' && e.n2 > 40) {
      e.fire = true;
      s.flags.engFirePending = undefined;
      s.flags.fireStartT = s.t;
      s.flags.fireNeedsTwo = s.seed % 5 < 2;
      emit({ type: 'failure', id: 'engFire', eng: fp });
    }
  }
  for (let i = 0; i < 2; i++) {
    const e = s.eng[i];
    if (!e.fire) continue;
    const k = `fireAgentT${i}`;
    if (e.agent1 || e.agent2) {
      s.flags[k] = ((s.flags[k] as number) ?? 0) + dt;
      if (s.flags[k] as number > 5 && (e.agent2 || !s.flags.fireNeedsTwo)) {
        e.fire = false;
        e.fireOut = true;
        emit({ type: 'fireOut', eng: i + 1 });
      }
    }
  }
  if (s.flags.engFailAppPending && s.leg === 'arr' && !s.ac.onGround) {
    const d = ilsDev(s);
    if (d && d.dist < 10 * 1852) {
      s.flags.engFailAppPending = false;
      s.eng[0].failed = true;
      emit({ type: 'failure', id: 'engFailApp', eng: 1 });
    }
  }
  const spd = s.flags.toEngFailSpd as number | undefined;
  if (spd && s.ac.onGround && s.gnd.phase === 'runway' && s.flags.toPowerSet && s.ac.ias >= spd) {
    const n = s.flags.toEngFailEng as number;
    s.eng[n - 1].failed = true;
    s.flags.toEngFailSpd = undefined;
    s.flags.engFailIas = s.ac.ias;
    emit({ type: 'failure', id: 'toEngFail', eng: n, ias: s.ac.ias });
  }
}
