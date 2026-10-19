import { freqStr, me, radioUnit, say, type Unit } from '../ground';
import { SCN_C172 } from '../scenario';
import type { SimState } from '../types';
import { patternLeg } from './pattern';
import { av1 } from './systems';

type Emit = (e: { type: string; [k: string]: unknown }) => void;

export const inHg = (hpa: number) => hpa / 33.8639;

/** Связь Cessna 172: вышка Ласборд, ATIS, пассажир */
export function c172Comms(s: SimState, id: string, emit: Emit): boolean {
  const a = s.atc;
  const cs = SCN_C172.callsign;
  const csShort = 'F-LD';
  const unit = radioUnit(s);
  const wind = `${String(a.windDir).padStart(3, '0')}/${String(a.windSpd).padStart(2, '0')}`;
  const qnhIn = inHg(a.qnh).toFixed(2);
  const noRadio = (need: Unit) => {
    if (!av1(s)) {
      emit({ type: 'radio', unit: 'SYS', msg: { ru: 'Радио молчит: нужны MASTER (BAT) и AVIONICS BUS 1.', en: 'Radio dead: needs MASTER (BAT) and AVIONICS BUS 1.' } });
      return true;
    }
    if (unit !== need) {
      emit({
        type: 'radio',
        unit: 'SYS',
        msg: {
          ru: `Нет ответа. Активная частота ${freqStr(s.c.com)}, а ${need === 'ATIS' ? 'ATIS' : 'Вышка'} — ${freqStr(SCN_C172.freqs[need])}.`,
          en: `No reply. Active frequency is ${freqStr(s.c.com)}; ${need === 'ATIS' ? 'ATIS' : 'Tower'} is ${freqStr(SCN_C172.freqs[need])}.`,
        },
      });
      return true;
    }
    return false;
  };
  switch (id) {
    case 'c_atis': {
      if (noRadio('ATIS')) return false;
      a.atis = true;
      say(s, emit, 'ATIS', {
        en: `Lasbordes information ${a.atisLetter}. Runway 33 in use, left-hand circuit, 1500 feet QNH. Wind ${wind} knots, CAVOK. Temperature ${a.oat}. QNH ${a.qnh}, ${qnhIn} inches.`,
        ru: `Ласборд, информация ${a.atisLetter}. Рабочая ВПП 33, левый круг, 1500 фт по QNH. Ветер ${wind} уз, CAVOK. Температура ${a.oat}. QNH ${a.qnh} гПа (${qnhIn} дюйма).`,
      });
      return true;
    }
    case 'c_taxi': {
      if (noRadio('TWR')) return false;
      me(s, emit, 'TWR', { en: `Lasbordes Tower, ${cs}, Cessna 172 at the apron, information ${a.atis ? a.atisLetter : '—'}, request taxi for circuits.`, ru: `Ласборд-Вышка, ${cs}, Cessna 172 на перроне, информация ${a.atis ? a.atisLetter : '—'}, прошу руление для полётов по кругу.` });
      say(s, emit, 'TWR', { en: `${csShort}, taxi holding point runway 33, QNH ${a.qnh}.`, ru: `${csShort}, рулите к предварительному ВПП 33, QNH ${a.qnh}.` }, 2.5, 'taxi');
      return true;
    }
    case 'c_ready': {
      if (noRadio('TWR')) return false;
      me(s, emit, 'TWR', { en: `${csShort}, holding point runway 33, ready for departure.`, ru: `${csShort}, на предварительном ВПП 33, к взлёту готов.` });
      if (s.gnd.phase !== 'holding' && s.gnd.phase !== 'taxi') {
        say(s, emit, 'TWR', { en: `${csShort}, report at the holding point.`, ru: `${csShort}, доложите на предварительном.` }, 2.5);
        return true;
      }
      say(s, emit, 'TWR', { en: `${csShort}, runway 33, wind ${wind} knots, cleared for take-off, report downwind.`, ru: `${csShort}, ВПП 33, ветер ${wind} уз, взлёт разрешаю, доложите на подветренной.` }, 2.5, 'cleared');
      return true;
    }
    case 'c_dw': {
      if (noRadio('TWR')) return false;
      me(s, emit, 'TWR', { en: `${csShort}, downwind runway 33, full stop.`, ru: `${csShort}, на подветренной ВПП 33, посадка до полной остановки.` });
      if (patternLeg(s) !== 'downwind' && patternLeg(s) !== 'crosswind') {
        say(s, emit, 'TWR', { en: `${csShort}, I don't have you downwind yet, report when established.`, ru: `${csShort}, не вижу вас на подветренной, доложите, когда будете на ней.` }, 2.5);
        return true;
      }
      s.flags.cDwRep = true;
      say(s, emit, 'TWR', { en: `${csShort}, number one, report final.`, ru: `${csShort}, вы первый, доложите на прямой.` }, 2.5);
      return true;
    }
    case 'c_final': {
      if (noRadio('TWR')) return false;
      me(s, emit, 'TWR', { en: `${csShort}, final runway 33.`, ru: `${csShort}, на прямой ВПП 33.` });
      const leg = patternLeg(s);
      if (leg !== 'final' && leg !== 'base') {
        say(s, emit, 'TWR', { en: `${csShort}, report final.`, ru: `${csShort}, доложите на прямой.` }, 2.5);
        return true;
      }
      say(s, emit, 'TWR', { en: `${csShort}, runway 33, wind ${wind} knots, cleared to land.`, ru: `${csShort}, ВПП 33, ветер ${wind} уз, посадку разрешаю.` }, 2.5, 'ldgClear');
      return true;
    }
    case 'c_vacated': {
      if (noRadio('TWR')) return false;
      me(s, emit, 'TWR', { en: `${csShort}, runway vacated.`, ru: `${csShort}, ВПП освободил.` });
      if (!s.ac.landed) return true;
      say(s, emit, 'TWR', { en: `${csShort}, taxi to the apron, good day.`, ru: `${csShort}, рулите на перрон, всего доброго.` }, 2.5, 'taxiIn');
      return true;
    }
    case 'atc_notify': {
      if (noRadio('TWR')) return false;
      s.flags.atcNotified = true;
      me(s, emit, 'TWR', { en: `MAYDAY MAYDAY MAYDAY, ${cs}, engine problem, ${s.ac.onGround ? 'stopping' : 'returning for immediate landing'}.`, ru: `MAYDAY MAYDAY MAYDAY, ${cs}, проблема с двигателем, ${s.ac.onGround ? 'останавливаюсь' : 'возвращаюсь на немедленную посадку'}.` });
      say(s, emit, 'TWR', { en: `${csShort}, roger MAYDAY, runway 33 is yours, wind ${wind}.`, ru: `${csShort}, понял MAYDAY, ВПП 33 ваша, ветер ${wind}.` }, 2.5, s.ac.onGround ? undefined : 'ldgClear');
      return true;
    }
    case 'c_brief': {
      s.flags.cBrief = true;
      me(s, emit, 'PA', { en: 'Briefing: seat belt fastened, door handle here, no smoking, headset on. In an emergency I will tell you; keep clear of the controls.', ru: 'Инструктаж: пристегнитесь, ручка двери здесь, не курить, гарнитуру наденьте. В аварийной ситуации я скажу, что делать; не трогайте органы управления.' });
      say(s, emit, 'PAX', { en: 'Got it, all set!', ru: 'Понял, всё готово!' }, 2);
      return true;
    }
    case 'c_clear': {
      s.flags.cClearT = s.t;
      me(s, emit, 'PA', { en: '"CLEAR PROP!"', ru: '«ОТ ВИНТА!»' });
      return true;
    }
  }
  return false;
}
