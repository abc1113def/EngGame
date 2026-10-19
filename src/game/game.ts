import type { Sim, SimEvent } from '../sim/sim';
import type { L, SimState } from '../sim/types';
import { checklistsFor } from './checklists';
import { ARR_PHASES, PHASES, stepVisible, updProcFlags, type PhaseId, type Step } from './procedure';
import { rulesFor, type Rules } from './rules';
import { STEP_BY_ID, stepsFor } from './steps';

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
  once = new Set<string>();
  clMarks: Record<string, Record<number, 'ok' | 'bad'>> = {};
  ended = false;
  report: Report | null = null;
  version = 0;
  steps: Step[];
  rules: Rules;
  /** память правил на одну игру */
  mem: Record<string, unknown> = {};
  gates = new Set<string>();
  /** проверки, условие которых выполнялось в своей фазе (для экзамена) */
  checkOk = new Set<string>();
  private unsub: (() => void)[] = [];
  private listeners = new Set<(r: Report) => void>();

  constructor(
    public sim: Sim,
    public mode: Mode,
  ) {
    this.steps = stepsFor(sim.s.type, sim.s.scn);
    this.rules = rulesFor(sim.s.type);
  }

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
    return this.steps.filter((st) => stepVisible(this.s, st) || this.isDone(st.id));
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
  /** Шаг прилёта засчитывается только на участке прилёта */
  stepDone(st: Step) {
    if (ARR_PHASES.includes(st.phase) && this.s.leg !== 'arr') return false;
    return st.done(this.s);
  }

  /** В экзамене проверки фазы оцениваются, когда начинается следующая фаза */
  private evalChecks(upTo: PhaseId) {
    if (this.mode !== 'exam') return;
    const order = PHASES.map((p) => p.id);
    const lim = order.indexOf(upTo);
    for (const st of this.steps) {
      if (st.kind !== 'check' || this.isDone(st.id) || this.once.has(`chk_${st.id}`)) continue;
      if (order.indexOf(st.phase) >= lim || st.phase === 'emer') continue;
      this.once.add(`chk_${st.id}`);
      if (this.stepDone(st) || this.checkOk.has(st.id)) this.doneAt[st.id] = this.s.t;
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
      const miss = st.req.filter((x) => !this.isDone(x) && !this.checkOk.has(x) && STEP_BY_ID[x] && this.steps.includes(STEP_BY_ID[x]) && stepVisible(this.s, STEP_BY_ID[x]) && !(STEP_BY_ID[x].kind === 'check' && this.stepDone(STEP_BY_ID[x])));
      if (miss.length)
        this.pen(`order_${st.id}`, 20, {
          ru: `Нарушен порядок: «${st.title.ru}» до «${STEP_BY_ID[miss[0]].title.ru}»`,
          en: `Wrong order: "${st.title.en}" before "${STEP_BY_ID[miss[0]].title.en}"`,
        });
    }
  }

  gate(name: string, phases: PhaseId[]) {
    if (this.gates.has(name)) return;
    this.gates.add(name);
    if (this.mode !== 'exam') return;
    for (const st of this.steps) {
      if (!phases.includes(st.phase) || st.optional || this.isDone(st.id) || !stepVisible(this.s, st)) continue;
      if (st.kind === 'check') continue; // оцениваются в evalChecks
      if (this.stepDone(st)) {
        this.markDone(st);
        continue;
      }
      this.pen(`miss_${st.id}`, st.pen ?? 15, { ru: `Пропущено: ${st.title.ru}`, en: `Missed: ${st.title.en}` });
    }
  }

  // ---------------- чек-листы ----------------
  checklists() {
    return checklistsFor(this.s);
  }
  checkItem(clId: string, idx: number): boolean {
    const cl = this.checklists().find((c) => c.id === clId)!;
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

  // ---------------- события и такт ----------------
  private onEvent(e: SimEvent) {
    this.rules.onEvent(this, e);
  }

  private tick(dt: number) {
    const s = this.s;
    if (this.ended) return;
    if (s.type === 'a320') updProcFlags(s, dt);
    this.rules.flags(this, dt);
    for (const st of this.steps) {
      if (this.isDone(st.id)) continue;
      if (!stepVisible(s, st)) continue;
      if (st.kind === 'check' && this.mode === 'tutorial') {
        if (this.acked.has(st.id) && this.stepDone(st)) this.markDone(st);
        continue;
      }
      if (st.kind === 'check') {
        // в экзамене засчитывается на «воротах», если условие выполнялось
        if (this.stepDone(st)) this.checkOk.add(st.id);
        continue;
      }
      if (this.stepDone(st)) this.markDone(st);
    }
    const end = this.rules.tick(this, dt);
    if (end) {
      s.result = end.res;
      s.resultReason = end.reason.en;
      this.finish(end.res, end.reason, end.partial);
    }
  }

  finish(res: SimState['result'] = this.s.result, reason: L = r('Сессия завершена.', 'Session finished.'), partial = false): Report {
    if (this.report) return this.report;
    const s = this.s;
    if ((res === 'success' || res === 'secured') && !partial) {
      this.evalChecks('c_shut');
      this.gate('end', PHASES.map((p) => p.id).filter((p) => p !== 'emer'));
    }
    if (res === 'fail') this.items.push({ t: s.t, pts: -400, text: r('Полёт не выполнен', 'Flight failed') });
    this.ended = true;
    const vis = this.visibleSteps().filter((x) => !(ARR_PHASES.includes(x.phase) && s.leg !== 'arr'));
    const done = vis.filter((x) => !x.optional && this.isDone(x.id)).length;
    const total = partial ? done : vis.filter((x) => !x.optional).length;
    const missed = partial ? [] : vis.filter((x) => !x.optional && !this.isDone(x.id) && x.phase !== 'emer' && !(x.kind === 'check' && this.mode === 'tutorial' && x.done(s))).map((x) => x.id);
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
