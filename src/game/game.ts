import { KT } from '../sim/flight';
import { SCN } from '../sim/scenario';
import type { Sim, SimEvent } from '../sim/sim';
import type { L, SimState } from '../sim/types';
import { CHECKLISTS } from './checklists';
import { PHASES, STEPS, STEP_BY_ID, stepVisible, updProcFlags, type PhaseId, type Step } from './procedure';

export type Mode = 'tutorial' | 'exam';
export interface ScoreItem {
  t: number;
  pts: number;
  text: L;
}
export interface Report {
  result: SimState['result'];
  reason: L;
  score: number;
  max: number;
  grade: L;
  items: ScoreItem[];
  time: number;
  done: number;
  total: number;
  missed: string[];
}

const r = (ru: string, en: string): L => ({ ru, en });

export class Game {
  doneAt: Record<string, number> = {};
  acked = new Set<string>();
  items: ScoreItem[] = [];
  private once = new Set<string>();
  clMarks: Record<string, Record<number, 'ok' | 'bad'>> = {};
  ended = false;
  report: Report | null = null;
  version = 0;
  private unsub: (() => void)[] = [];
  private gates = new Set<string>();
  private taxiFast = false;
  private endTimer = 0;
  private listeners = new Set<(r: Report) => void>();

  constructor(
    public sim: Sim,
    public mode: Mode,
  ) {}

  get s() {
    return this.sim.s;
  }

  start() {
    this.unsub.push(this.sim.on((e) => this.onEvent(e)));
    this.unsub.push(this.sim.onTick((dt) => this.tick(dt)));
  }
  stop() {
    for (const u of this.unsub) u();
    this.unsub = [];
  }
  onEnd(fn: (r: Report) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ---------------- очки ----------------
  pen(key: string, pts: number, text: L, repeat = false) {
    if (!repeat && this.once.has(key)) return;
    this.once.add(key);
    this.items.push({ t: this.s.t, pts: -Math.abs(pts), text });
    this.version++;
    this.sim.emit({ type: 'score', pts: -Math.abs(pts), text });
  }
  bonus(key: string, pts: number, text: L) {
    if (this.once.has(key)) return;
    this.once.add(key);
    this.items.push({ t: this.s.t, pts: Math.abs(pts), text });
    this.version++;
    this.sim.emit({ type: 'score', pts: Math.abs(pts), text });
  }
  get score() {
    return Math.max(0, 1000 + this.items.reduce((a, b) => a + b.pts, 0));
  }

  // ---------------- шаги ----------------
  isDone(id: string) {
    return this.doneAt[id] !== undefined;
  }
  visibleSteps(): Step[] {
    return STEPS.filter((st) => stepVisible(this.s, st) || this.isDone(st.id));
  }
  currentStep(): Step | null {
    const vis = this.visibleSteps();
    const emer = vis.find((st) => st.phase === 'emer' && !this.isDone(st.id));
    if (emer) return emer;
    return vis.find((st) => st.phase !== 'emer' && !this.isDone(st.id) && !st.optional) ?? null;
  }
  ack(id: string) {
    const st = STEP_BY_ID[id];
    if (st && st.kind === 'check' && st.done(this.s)) {
      this.acked.add(id);
      this.version++;
    }
  }

  /** В экзамене проверки фазы оцениваются, когда начинается следующая фаза */
  private evalChecks(upTo: PhaseId) {
    if (this.mode !== 'exam') return;
    const order = PHASES.map((p) => p.id);
    const lim = order.indexOf(upTo);
    for (const st of STEPS) {
      if (st.kind !== 'check' || this.isDone(st.id) || this.once.has(`chk_${st.id}`)) continue;
      if (order.indexOf(st.phase) >= lim || st.phase === 'emer') continue;
      this.once.add(`chk_${st.id}`);
      if (st.done(this.s)) this.doneAt[st.id] = this.s.t;
      else this.pen(`chkfail_${st.id}`, 15, { ru: `Проверка не выполнена: ${st.title.ru}`, en: `Check failed: ${st.title.en}` });
    }
  }

  private markDone(st: Step) {
    if (this.isDone(st.id)) return;
    this.doneAt[st.id] = this.s.t;
    this.version++;
    this.sim.emit({ type: 'stepDone', id: st.id });
    if (st.kind !== 'check' && st.phase !== 'emer' && !st.optional) this.evalChecks(st.phase);
    if (this.mode === 'exam' && st.req) {
      const miss = st.req.filter((x) => !this.isDone(x) && stepVisible(this.s, STEP_BY_ID[x]));
      if (miss.length)
        this.pen(`order_${st.id}`, 20, {
          ru: `Нарушен порядок: «${st.title.ru}» до «${STEP_BY_ID[miss[0]].title.ru}»`,
          en: `Wrong order: "${st.title.en}" before "${STEP_BY_ID[miss[0]].title.en}"`,
        });
    }
  }

  private gate(name: string, phases: PhaseId[]) {
    if (this.gates.has(name)) return;
    this.gates.add(name);
    if (this.mode !== 'exam') return;
    for (const st of STEPS) {
      if (!phases.includes(st.phase) || st.optional || this.isDone(st.id) || !stepVisible(this.s, st)) continue;
      if (st.kind === 'check') continue; // оцениваются в evalChecks
      this.pen(`miss_${st.id}`, st.pen ?? 15, { ru: `Пропущено: ${st.title.ru}`, en: `Missed: ${st.title.en}` });
    }
  }

  // ---------------- чек-листы ----------------
  checkItem(clId: string, idx: number): boolean {
    const cl = CHECKLISTS.find((c) => c.id === clId)!;
    const it = cl.items[idx];
    const ok = it.ok(this.s);
    this.clMarks[clId] = this.clMarks[clId] ?? {};
    this.clMarks[clId][idx] = ok ? 'ok' : 'bad';
    if (!ok && this.mode === 'exam') this.pen(`cl_${clId}_${idx}`, 10, { ru: `Чек-лист ${cl.name}: «${it.ch}» — ${it.why.ru}`, en: `${cl.name} checklist: "${it.ch}" — ${it.why.en}` });
    if (cl.items.every((_, i) => this.clMarks[clId][i] === 'ok')) {
      this.s.flags[cl.flag] = true;
      this.sim.emit({ type: 'checklistDone', id: clId });
    }
    this.version++;
    return ok;
  }

  // ---------------- события ----------------
  private onEvent(e: SimEvent) {
    const s = this.s;
    switch (e.type) {
      case 'engStart': {
        const n = e.eng as number;
        if (s.sw.BEACON !== 1) this.pen('eng_beacon', 40, r('Запуск двигателя при выключенном маяке (BEACON)', 'Engine start with beacon off'));
        if (s.gnd.doors.L1 || s.gnd.doors.FWD || s.gnd.doors.AFT) this.pen('eng_doors', 40, r('Запуск двигателя с открытыми дверями', 'Engine start with doors open'));
        if (!s.atc.pushApproved) this.pen('eng_noclr', 30, r('Запуск без разрешения диспетчера', 'Engine start without ATC approval'));
        if (s.gnd.gpu) this.pen('eng_gpu', 30, r('Запуск двигателя с подключённым GPU', 'Engine start with GPU connected'));
        if (n === 1 && !s.eng[1].running && !this.once.has('eng_order')) this.pen('eng_order', 10, r('По SOP первым запускают двигатель 2', 'SOP: start engine 2 first'));
        this.gate('start', ['power', 'apu', 'prep', 'fms', 'before']);
        break;
      }
      case 'pushStart':
        if (s.sw.BEACON !== 1) this.pen('push_beacon', 30, r('Буксировка при выключенном маяке', 'Pushback with beacon off'));
        break;
      case 'pushBrake':
        this.pen('push_brake', 30, r('Торможение во время буксировки (риск среза водила)', 'Braking during pushback (tow bar shear risk)'));
        break;
      case 'taxiStart':
        if (!s.atc.taxiClear) this.pen('taxi_noclr', 60, r('Руление без разрешения', 'Taxi without clearance'));
        if (!s.eng[0].running || !s.eng[1].running) this.pen('taxi_1eng', 20, r('Руление без запуска обоих двигателей', 'Taxi without both engines running'));
        this.gate('taxi', ['after']);
        break;
      case 'crossHold':
        if (!s.atc.lineupClear) this.pen('incursion', 150, r('Несанкционированный выезд на ВПП (runway incursion)!', 'Runway incursion — crossed the holding point without clearance!'));
        break;
      case 'powerLoss':
        this.pen('power_loss', 50, r('Обесточивание: отключили GPU без другого источника', 'Power loss: GPU removed with no other source'));
        break;
      case 'irAlignFault':
        this.pen('ir_move', 40, r('Самолёт двигался во время выставки ИНС', 'Aircraft moved during IRS alignment'));
        break;
      case 'idgDisc':
        this.pen(`idg${e.eng}`, 100, r(`Отключён IDG ${e.eng} без причины — генератор потерян`, `IDG ${e.eng} disconnected for no reason — generator lost`));
        break;
      case 'ratDeployed':
        this.pen('rat', 80, r('Выпущена RAT на земле', 'RAT deployed on ground'));
        break;
      case 'masksDropped':
        this.pen('masks', 80, r('Выброшены кислородные маски в салоне', 'Passenger masks released'));
        break;
      case 'rainRepellent':
        this.pen('rain', 10, r('Водоотталкивающая жидкость на сухое стекло', 'Rain repellent on a dry windshield'));
        break;
      case 'egtOverlimit':
        this.pen(`egt${e.eng}`, 100, r(`Превышение EGT двигателя ${e.eng}`, `Engine ${e.eng} EGT overlimit`));
        break;
      case 'tailStrike':
        this.pen('tailstrike', 250, r(`Удар хвостом о ВПП (тангаж ${(+e.pitch).toFixed(1)}° на земле)`, `Tail strike (pitch ${(+e.pitch).toFixed(1)}° on ground)`));
        break;
      case 'ecam':
        if (e.level === 'warn' && String(e.id).startsWith('CFG') && s.flags.toPowerSet && s.ac.onGround) this.pen(`cfg_${e.id}`, 50, r(`Взлётная тяга с предупреждением ECAM ${e.id}`, `Take-off thrust with ECAM ${e.id}`));
        if (e.id === 'OVERSPEED') this.pen('overspeed', 50, r('Превышение VFE', 'VFE exceeded'));
        break;
      case 'engStartFault':
        s.flags.startFaultT = s.t;
        break;
      case 'apuAutoShutdown':
        s.flags.apuFaultT = s.t;
        break;
      case 'liftoff':
        if (e.ias < SCN.vr - 3) this.pen('early_rot', 30, r(`Ранний подъём носа: отрыв на ${Math.round(e.ias)} уз`, `Early rotation: lift-off at ${Math.round(e.ias)} kt`));
        break;
      case 'rto': {
        const failIas = s.flags.engFailIas as number | undefined;
        if (failIas !== undefined && failIas < SCN.v1) this.bonus('rto_ok', 150, r('Отказ до V1 — взлёт прерван правильно', 'Failure before V1 — correct rejected take-off'));
        else if (failIas !== undefined) this.pen('rto_late', 150, r('Прерывание взлёта после V1 при отказе двигателя', 'Rejected after V1 with engine failure'));
        else if (!s.ecam.active.some((a) => a.level === 'warn')) this.pen('rto_noreason', 100, r('Прерванный взлёт без причины', 'Rejected take-off without reason'));
        s.flags.rtoT = s.t;
        break;
      }
      case 'apOn':
        this.bonus('ap', 0, r('Автопилот включён', 'Autopilot engaged'));
        break;
    }
    if (e.type === 'thrust' || e.type === 'sw') {
      // взлётная тяга без разрешения — проверяется в tick
    }
  }

  private tick(dt: number) {
    const s = this.s;
    if (this.ended) return;
    updProcFlags(s, dt);
    // шаги
    for (const st of STEPS) {
      if (this.isDone(st.id)) continue;
      if (!stepVisible(s, st)) continue;
      if (st.kind === 'check' && this.mode === 'tutorial') {
        if (this.acked.has(st.id) && st.done(s)) this.markDone(st);
        continue;
      }
      if (st.kind === 'check') continue; // в экзамене засчитывается на «воротах»
      if (st.done(s)) this.markDone(st);
    }
    // правила
    const gsKt = s.ac.gs * KT;
    if ((s.gnd.phase === 'taxi' || s.gnd.phase === 'holding' || s.gnd.phase === 'lineup') && gsKt > 30) {
      if (!this.taxiFast) {
        this.taxiFast = true;
        this.pen('taxi_fast_' + Math.floor(s.t), 20, r(`Скорость руления ${Math.round(gsKt)} уз (> 30)`, `Taxi speed ${Math.round(gsKt)} kt (> 30)`), true);
      }
    } else if (gsKt < 25) this.taxiFast = false;
    if (s.flags.toPowerSet && !this.gates.has('to')) {
      if (!s.atc.toClear) this.pen('to_noclr', 200, r('Взлёт без разрешения диспетчера!', 'Take-off without clearance!'));
      if (s.sw.PARK_BRK === 1) this.pen('to_park', 30, r('Взлётная тяга на стояночном тормозе', 'Take-off thrust with parking brake on'));
      this.gate('to', ['taxi', 'lineup']);
    }
    // обработка отказов — бонусы
    for (let i = 0; i < 2; i++) {
      const e = s.eng[i];
      if (s.flags.startFaultT !== undefined && e.startFault && s.sw[`ENG${i + 1}_MASTER`] === 0) this.bonus(`sf_ok${i}`, 30, r('START FAULT: ENG MASTER выключен по ECAM', 'START FAULT: ENG MASTER off per ECAM'));
    }
    if (s.flags.apuFaultT !== undefined && s.sw.APU_MASTER === 0) this.bonus('apu_ok', 20, r('APU AUTO SHUT DOWN отработан', 'APU AUTO SHUT DOWN handled'));
    if (s.bleed.pack1Fault && s.sw.PACK1 === 0) this.bonus('pack_ok', 20, r('AIR PACK 1 FAULT отработан', 'AIR PACK 1 FAULT handled'));
    if (this.isDone('elac')) this.bonus('elac_ok', 20, r('Сброс ELAC 1 выполнен', 'ELAC 1 reset done'));

    // ---------------- окончание ----------------
    const ac = s.ac;
    let res: SimState['result'] = '';
    let reason: L = r('', '');
    if (!ac.onGround && ac.alt - s.elev >= 3000) {
      res = 'success';
      reason = r('Набрано 3000 фт — сценарий выполнен!', 'Reached 3000 ft — scenario complete!');
    } else if (s.eng.some((e) => e.failed) && !ac.onGround && ac.alt - s.elev >= 1000 && (s.flags.engFailIas as number) >= SCN.v1) {
      res = 'success';
      reason = r('Отказ двигателя после V1: взлёт продолжен, набрано 1000 фт.', 'Engine failure after V1: take-off continued to 1000 ft.');
      this.bonus('efail_go', 150, r('Отказ после V1 — взлёт продолжен правильно', 'Failure after V1 — take-off correctly continued'));
    } else if (ac.overrun && ac.onGround && ac.gs > 2) {
      res = 'fail';
      reason = r('Выкатывание за пределы ВПП.', 'Runway overrun.');
    } else if (s.flags.touchdown) {
      res = 'fail';
      reason = r('Самолёт снова коснулся земли после отрыва.', 'The aircraft touched down again after lift-off.');
    } else if (s.flags.rtoT !== undefined && ac.onGround && ac.stopped) {
      this.endTimer += dt;
      if (this.endTimer > 3) {
        res = 'rto';
        reason = r('Прерванный взлёт: самолёт остановлен на ВПП.', 'Rejected take-off: aircraft stopped on the runway.');
      }
    } else if (s.eng.some((e) => e.fireOut) && s.eng.every((e) => !e.fire)) {
      const n = s.eng[0].fireOut ? 1 : 2;
      if (s.sw[`ENG${n}_MASTER`] === 0) {
        this.endTimer += dt;
        if (this.endTimer > 6) {
          res = 'fire';
          reason = r('Пожар двигателя потушен. Вылет отменён, пассажиры в безопасности.', 'Engine fire extinguished. Flight cancelled, passengers safe.');
          const ft = s.flags.fireStartT as number;
          const tOut = s.t - ft;
          if (tOut < 60) this.bonus('fire_fast', 150, r(`Пожар ликвидирован за ${Math.round(tOut)} с`, `Fire handled in ${Math.round(tOut)} s`));
          else this.bonus('fire_slow', 60, r(`Пожар ликвидирован за ${Math.round(tOut)} с`, `Fire handled in ${Math.round(tOut)} s`));
        }
      }
    }
    if (res) {
      s.result = res;
      s.resultReason = reason.en;
      this.finish(res, reason);
    }
  }

  finish(res: SimState['result'] = this.s.result, reason: L = r('Сессия завершена.', 'Session finished.')): Report {
    if (this.report) return this.report;
    const s = this.s;
    if (res === 'success') {
      this.evalChecks('takeoff');
      this.gate('end', ['takeoff']);
    }
    if (res === 'fail') this.items.push({ t: s.t, pts: -400, text: r('Полёт не выполнен', 'Flight failed') });
    this.ended = true;
    const total = this.visibleSteps().filter((x) => !x.optional).length;
    const done = this.visibleSteps().filter((x) => !x.optional && this.isDone(x.id)).length;
    const missed = this.visibleSteps()
      .filter((x) => !x.optional && !this.isDone(x.id) && x.phase !== 'emer' && !(x.kind === 'check' && this.mode === 'tutorial' && x.done(s)))
      .map((x) => x.id);
    const score = this.score;
    const grade = res === 'fail' ? r('2 — неудовлетворительно', 'F — fail') : score >= 950 ? r('5 — отлично', 'A — excellent') : score >= 850 ? r('4 — хорошо', 'B — good') : score >= 700 ? r('3 — удовлетворительно', 'C — satisfactory') : r('2 — неудовлетворительно', 'F — fail');
    this.report = { result: res, reason, score, max: 1000, grade, items: this.items, time: s.t, done, total, missed };
    for (const f of this.listeners) f(this.report);
    this.version++;
    return this.report;
  }

  phaseProgress() {
    return PHASES.map((p) => {
      const st = this.visibleSteps().filter((x) => x.phase === p.id && !x.optional);
      return { ...p, total: st.length, done: st.filter((x) => this.isDone(x.id)).length };
    });
  }
}
