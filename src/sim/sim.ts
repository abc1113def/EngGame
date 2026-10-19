import { updAnn } from './ann';
import { CONTROLS } from './controls';
import { pressClr, pressEmerCanc, pressMasterCaut, pressMasterWarn, pressPage, pressToConfig, updEcam } from './ecam';
import { updEngines, TLA } from './engines';
import { updAfs, updControls, updFlight } from './flight';
import { mcduKey, mcduLsk } from './fms';
import { comms, updFailures, updGround } from './ground';
import { createState } from './state';
import { annPower, clamp, updAdirs, updApu, updBleed, updElec, updFuel, updHyd } from './systems';
import type { AircraftType, FailureLevel, Scenario, SimState } from './types';

export type SimEvent = { type: string; [k: string]: any };

const PAGE_OF: Record<string, string> = {
  ECP_ENG: 'ENG',
  ECP_BLEED: 'BLEED',
  ECP_PRESS: 'PRESS',
  ECP_ELEC: 'ELEC',
  ECP_HYD: 'HYD',
  ECP_FUEL: 'FUEL',
  ECP_APU: 'APU',
  ECP_COND: 'COND',
  ECP_DOOR: 'DOOR',
  ECP_WHEEL: 'WHEEL',
  ECP_FCTL: 'F/CTL',
  ECP_ALL: 'ALL',
  ECP_STS: 'STS',
};

export const DETENTS = [TLA.REV, TLA.IDLE, TLA.CL, TLA.FLX, TLA.TOGA];

export class Sim {
  s: SimState;
  rate = 1;
  paused = true;
  version = 0;
  private subs = new Set<() => void>();
  private evSubs = new Set<(e: SimEvent) => void>();
  private tickSubs = new Set<(dt: number) => void>();

  constructor() {
    this.s = createState(1, 'off', true);
  }

  reset(seed: number, failures: FailureLevel, fastAlign: boolean, type: AircraftType = 'a320', scn: Scenario = 'dep') {
    this.s = createState(seed, failures, fastAlign, type, scn);
    this.emit({ type: 'reset' });
    updAnn(this.s);
    this.notify();
  }

  emit = (e: SimEvent) => {
    for (const f of this.evSubs) f(e);
  };
  on(fn: (e: SimEvent) => void) {
    this.evSubs.add(fn);
    return () => {
      this.evSubs.delete(fn);
    };
  }
  onTick(fn: (dt: number) => void) {
    this.tickSubs.add(fn);
    return () => {
      this.tickSubs.delete(fn);
    };
  }
  subscribe = (fn: () => void) => {
    this.subs.add(fn);
    return () => {
      this.subs.delete(fn);
    };
  };
  notify() {
    this.version++;
    for (const f of this.subs) f();
  }

  step(dt: number) {
    const s = this.s;
    const emit = this.emit;
    s.t += dt;
    // синхронизация простых кнопок
    s.fcu.fd = s.sw.FD === 1;
    s.fcu.ls = s.sw.LS === 1;
    s.fcu.efis.cstr = s.sw.EFIS_CSTR === 1;
    s.fcu.efis.wpt = s.sw.EFIS_WPT === 1;
    s.fcu.efis.vord = s.sw.EFIS_VORD === 1;
    s.fcu.efis.ndb = s.sw.EFIS_NDB === 1;
    s.fcu.efis.arpt = s.sw.EFIS_ARPT === 1;
    if (s.radio.ident > 0) s.radio.ident -= dt;

    updControls(s, dt);
    updElec(s, dt, emit);
    if (annPower(s) && s.flags.powerOnT === undefined) s.flags.powerOnT = s.t;
    // моменты подачи питания на экраны (для самотестирования)
    if (s.elec.acEss && s.flags.acEssT === undefined) s.flags.acEssT = s.t;
    if (!s.elec.acEss) s.flags.acEssT = undefined;
    if (s.elec.ac2 && s.flags.ac2T === undefined) s.flags.ac2T = s.t;
    if (!s.elec.ac2) s.flags.ac2T = undefined;
    updApu(s, dt, emit);
    updBleed(s, dt, emit);
    updFuel(s, dt);
    updEngines(s, dt, emit);
    updHyd(s, dt);
    updAdirs(s, dt, emit);
    updGround(s, dt, emit);
    updFailures(s, dt, emit);
    updFlight(s, dt, emit);
    updAfs(s, dt, emit);
    updEcam(s, dt, emit);
    updAnn(s);
    for (const f of this.tickSubs) f(dt);
  }

  frame(realDt: number) {
    if (this.paused || this.s.result) return;
    let left = Math.min(realDt, 0.25) * this.rate;
    while (left > 1e-6) {
      const h = Math.min(0.05, left);
      this.step(h);
      left -= h;
    }
    this.notify();
  }

  // ============================ действия игрока ============================
  ui(snd: string) {
    this.emit({ type: 'ui', snd });
  }

  /** Фиксируемая кнопка / тумблер / галетник: установить положение */
  setSw(id: string, v: number) {
    const s = this.s;
    const d = CONTROLS[id];
    if (!d) return;
    const max = d.pos ? d.pos.length - 1 : 1;
    v = clamp(Math.round(v), 0, max);
    const old = s.sw[id];
    if (old === v) return;
    if (id === 'EXT_PWR' && !s.gnd.gpu) {
      this.ui('pb');
      return;
    }
    s.sw[id] = v;
    this.ui(d.kind === 'pb' || d.kind === 'guard' ? 'pb' : d.kind === 'rotary' ? 'knob' : d.kind === 'lever' ? 'lever' : 'toggle');
    // особые эффекты
    if (id === 'APU_MASTER' && v === 0) s.apu.startReq = false;
    if (id === 'GEAR' && v === 1) s.flags.gearDownT = s.t;
    if (id === 'ELAC1') {
      if (v === 0) s.flags.elacOff = true;
      else if (s.flags.elacOff) {
        s.flags.elacCycled = true;
        s.flags.elacFault = false;
      }
    }
    if (id === 'SPD_BRK' && v === 0 && old !== 1) {
      s.sw[id] = old; // ARM — только из RET
      return;
    }
    if (id.endsWith('_MODE') && id.startsWith('IR') && [1, 2, 3].every((n) => s.sw[`IR${n}_MODE`] === 0)) s.fms.posConfirmed = false;
    this.emit({ type: 'sw', id, v, old });
  }

  toggle(id: string) {
    this.setSw(id, this.s.sw[id] ? 0 : 1);
  }

  guard(id: string) {
    const k = `guard_${id}`;
    this.s.flags[k] = !this.s.flags[k];
    this.ui('guard');
  }

  press(id: string) {
    const s = this.s;
    const d = CONTROLS[id];
    if (d && (d.kind === 'guard' || d.kind === 'guardm') && !s.flags[`guard_${id}`]) {
      this.guard(id);
      return;
    }
    if (d && (d.kind === 'pb' || d.kind === 'guard')) {
      this.toggle(id);
      return;
    }
    s.momentary[id] = true;
    this.ui('pb');
    this.emit({ type: 'press', id });
    const pwr = annPower(s);
    switch (id) {
      case 'APU_START':
        if (s.sw.APU_MASTER === 1 && pwr && !s.apu.avail && !s.apu.fault) s.apu.startReq = true;
        break;
      case 'MASTER_WARN':
        pressMasterWarn(s);
        break;
      case 'MASTER_CAUT':
        pressMasterCaut(s);
        break;
      case 'ECP_CLR':
        if (s.elec.ac2) pressClr(s);
        break;
      case 'ECP_EMERCANC':
        pressEmerCanc(s);
        break;
      case 'ECP_RCL':
        for (const a of s.ecam.active) a.cleared = false;
        s.ecam.recall = s.t;
        break;
      case 'ECP_TOCONFIG':
        if (pwr) pressToConfig(s, this.emit);
        break;
      case 'AB_LO':
      case 'AB_MED':
      case 'AB_MAX': {
        const lvl = id === 'AB_LO' ? 1 : id === 'AB_MED' ? 2 : 3;
        if (s.ac.autobrk === lvl) {
          s.ac.autobrk = 0;
          s.ac.autobrkActive = false;
        } else if (s.sw.ASKID_NWS === 1 && s.hyd.g > 1500 && pwr) s.ac.autobrk = lvl as 1 | 2 | 3;
        else this.emit({ type: 'hint', key: 'autobrkNoArm' });
        break;
      }
      case 'AP1':
      case 'AP2': {
        const ac = s.ac;
        if (ac.ap) {
          ac.ap = false;
          this.emit({ type: 'apDisc', reason: 'pb' });
        } else if (!ac.onGround && s.t - ac.liftoffT > 5 && ac.alt - s.elev > 100 && s.fcu.fd) {
          ac.ap = true;
          this.emit({ type: 'apOn' });
        } else this.emit({ type: 'hint', key: 'apNoEngage' });
        break;
      }
      case 'ATHR':
        s.ac.athr = !s.ac.athr;
        if (!s.ac.athr) s.ac.athrActive = false;
        break;
      case 'LOC':
        s.fcu.loc = !s.fcu.loc;
        break;
      case 'APPR':
        s.fcu.appr = !s.fcu.appr;
        break;
      case 'EXPED':
        s.fcu.exped = !s.fcu.exped;
        break;
      case 'BARO_STD':
        s.fcu.baroStd = !s.fcu.baroStd;
        break;
      case 'RUD_TRIM_RESET':
        if (pwr) s.flags.rudReset = true;
        break;
      case 'RMP_XFER':
        if (s.sw.RMP_ON) [s.radio.active, s.radio.stby] = [s.radio.stby, s.radio.active];
        break;
      case 'XPDR_CLR':
        s.radio.xpdrEntry = '';
        break;
      case 'XPDR_IDENT':
        if (s.sw.XPDR_MODE > 0) s.radio.ident = 18;
        break;
      case 'IDG1':
      case 'IDG2': {
        const i = id === 'IDG1' ? 0 : 1;
        if (s.eng[i].n2 > 10) {
          if (i === 0) s.elec.idg1Disc = true;
          else s.elec.idg2Disc = true;
          this.emit({ type: 'idgDisc', eng: i + 1 });
        }
        break;
      }
      case 'HYD_RAT':
      case 'RAT_EMER':
        if (!s.sw.HYD_RAT) {
          s.sw.HYD_RAT = 1;
          this.emit({ type: 'ratDeployed' });
        }
        break;
      case 'OXY_MASK':
        if (!s.flags.masksDropped) {
          s.flags.masksDropped = true;
          this.emit({ type: 'masksDropped' });
        }
        break;
      case 'RAIN_L':
      case 'RAIN_R':
        this.emit({ type: 'rainRepellent' });
        break;
      case 'APU_FIRE_TEST':
        if (pwr) s.flags.apuFireTested = true;
        break;
      case 'ENG1_FIRE_TEST':
        if (pwr) s.flags.eng1FireTested = true;
        break;
      case 'ENG2_FIRE_TEST':
        if (pwr) s.flags.eng2FireTested = true;
        break;
      case 'ENG1_AGENT1':
      case 'ENG1_AGENT2':
      case 'ENG2_AGENT1':
      case 'ENG2_AGENT2': {
        const n = +id[3];
        const e = s.eng[n - 1];
        if (s.sw[`ENG${n}_FIRE`] === 1 && s.elec.dcBat) {
          if (id.endsWith('1') && !e.agent1) e.agent1 = true;
          if (id.endsWith('2') && !e.agent2) e.agent2 = true;
          this.emit({ type: 'agent', eng: n, agent: +id[id.length - 1] });
        }
        break;
      }
      case 'GRAVITY_CRANK':
        s.flags.gravityCrank = ((s.flags.gravityCrank as number) ?? 0) + 1;
        break;
      case 'APU_AGENT1':
        if (s.sw.APU_FIRE === 1) s.flags.apuAgent = true;
        break;
      default:
        if (PAGE_OF[id]) {
          if (s.elec.ac2) pressPage(s, PAGE_OF[id]);
        } else if (id.startsWith('XPDR_')) {
          const dgt = id.slice(5);
          if (/^[0-7]$/.test(dgt)) {
            s.radio.xpdrEntry += dgt;
            if (s.radio.xpdrEntry.length >= 4) {
              s.radio.xpdrCode = s.radio.xpdrEntry.slice(0, 4);
              s.radio.xpdrEntry = '';
              this.emit({ type: 'squawk', code: s.radio.xpdrCode });
            }
          }
        }
    }
  }

  release(id: string) {
    if (this.s.momentary[id]) {
      this.s.momentary[id] = false;
      this.emit({ type: 'release', id });
    }
  }

  /** Плавные ручки и колёса */
  knob(id: string, delta: number, ring: 'outer' | 'inner' = 'outer') {
    const s = this.s;
    const f = s.fcu;
    const dcPwr = s.elec.dcBat;
    switch (id) {
      case 'BARO_KNOB':
        if (!dcPwr) return;
        if (f.baroStd) return;
        f.baro = clamp(f.baro + delta, 945, 1050);
        break;
      case 'SPD_KNOB':
        if (!dcPwr) return;
        f.spd = clamp(f.spd + delta, 100, 399);
        break;
      case 'HDG_KNOB':
        if (!dcPwr) return;
        f.hdg = ((f.hdg + delta) % 360 + 360) % 360;
        break;
      case 'ALT_KNOB':
        if (!dcPwr) return;
        // в режиме 1000 значение округляется до целых тысяч, как на настоящем FCU
        f.alt = s.sw.ALT_INC === 1 ? clamp(Math.round((f.alt + delta * 1000) / 1000) * 1000, 100, 49000) : clamp(f.alt + delta * 100, 100, 49000);
        break;
      case 'VS_KNOB':
        if (!dcPwr) return;
        f.vs = clamp(f.vs + delta * 100, -6000, 6000);
        break;
      case 'RMP_KNOB': {
        if (s.sw.RMP_ON !== 1 || !s.elec.dcEss) return;
        let v = s.radio.stby;
        if (ring === 'outer') v += delta * 1000;
        else v += delta * 25;
        if (v < 118000) v = 136975;
        if (v > 136975) v = 118000;
        s.radio.stby = v;
        break;
      }
      case 'PITCH_TRIM':
        if ((s.hyd.g > 1500 || s.hyd.y > 1500) && dcPwr) s.ac.pitchTrim = clamp(Math.round((s.ac.pitchTrim + delta * 0.1) * 10) / 10, -4, 13.5);
        else {
          this.emit({ type: 'hint', key: 'trimNoHyd' });
          return;
        }
        break;
      case 'RUD_TRIM':
        if (!dcPwr) return;
        s.flags.rudReset = false;
        s.ac.rudTrim = clamp(Math.round((s.ac.rudTrim + delta * 0.1) * 10) / 10, -20, 20);
        break;
      default: {
        const d = CONTROLS[id];
        if (d?.kind === 'knob') s.sw[id] = clamp(s.sw[id] + delta * 0.05, 0, 1);
      }
    }
    this.ui('knob');
    this.emit({ type: 'knob', id, delta });
  }

  /** Плавный рычаг 0..1 (РУД и смесь Cessna) */
  setLever(id: string, v: number) {
    const s = this.s;
    const nv = clamp(v, 0, 1);
    if (Math.abs((s.sw[id] ?? 0) - nv) < 1e-4) return;
    s.sw[id] = nv;
    this.emit({ type: 'lever', id, v: nv });
  }

  /** Рычаги РУД */
  setThrust(v: number, which: 0 | 1 | 2 = 0) {
    const s = this.s;
    v = clamp(v, s.ac.onGround ? TLA.REV : TLA.IDLE, TLA.TOGA);
    // прилипание к фиксаторам
    for (const d of DETENTS) if (Math.abs(v - d) < 1.2) v = d;
    if (which === 0 || which === 1) s.sw.TL1 = v;
    if (which === 0 || which === 2) s.sw.TL2 = v;
    this.emit({ type: 'thrust', v });
  }

  /** Шаг РУД с клавиатуры (останов на фиксаторах) */
  stepThrust(dir: number) {
    const s = this.s;
    const cur = Math.max(s.sw.TL1, s.sw.TL2);
    let v = cur + dir;
    for (const d of DETENTS) {
      if ((cur < d && v > d) || (cur > d && v < d)) v = d;
    }
    if (!s.ac.onGround && v < 0) v = 0;
    const old = cur;
    this.setThrust(v);
    if (DETENTS.includes(this.s.sw.TL1) && this.s.sw.TL1 !== old) this.ui('detent');
  }

  mcduKey(k: string) {
    mcduKey(this.s, k, this.emit);
    this.ui('key');
  }
  mcduLsk(side: 'L' | 'R', i: number) {
    mcduLsk(this.s, side, i, this.emit);
    this.ui('key');
  }
  comms(id: string) {
    return comms(this.s, id, this.emit);
  }
}

export const sim = new Sim();
