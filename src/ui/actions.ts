import { TLA } from '../sim/engines';
import { sim } from '../sim/sim';

/**
 * Общие действия органов управления: их вызывают и клавиатура, и экранный пульт.
 * Так оба способа управления всегда ведут себя одинаково.
 */
export type HoldKey = 'pitchUp' | 'pitchDn' | 'rollL' | 'rollR' | 'rudL' | 'rudR' | 'brake';

export type ActionId =
  | 'thrIdle'
  | 'thrDec'
  | 'thrInc'
  | 'thrMax'
  | 'mixDec'
  | 'mixInc'
  | 'trimDn'
  | 'trimUp'
  | 'park'
  | 'gear'
  | 'flapsExt'
  | 'flapsRet';

export function doAction(a: ActionId) {
  const s = sim.s;
  const c172 = s.type === 'c172';
  switch (a) {
    case 'thrIdle':
      if (c172) sim.setLever('C_THR', 0);
      else sim.setThrust(TLA.IDLE);
      break;
    case 'thrDec':
      if (c172) sim.setLever('C_THR', s.sw.C_THR - 0.05);
      else sim.stepThrust(-1);
      break;
    case 'thrInc':
      if (c172) sim.setLever('C_THR', s.sw.C_THR + 0.05);
      else sim.stepThrust(1);
      break;
    case 'thrMax':
      if (c172) sim.setLever('C_THR', 1);
      else sim.setThrust(TLA.TOGA);
      break;
    case 'mixDec':
      if (c172) sim.setLever('C_MIX', s.sw.C_MIX - 0.05);
      break;
    case 'mixInc':
      if (c172) sim.setLever('C_MIX', s.sw.C_MIX + 0.05);
      break;
    case 'trimDn':
      if (c172) sim.knob('C_TRIM', -1);
      else sim.knob('PITCH_TRIM', -1);
      break;
    case 'trimUp':
      if (c172) sim.knob('C_TRIM', 1);
      else sim.knob('PITCH_TRIM', 1);
      break;
    case 'park':
      sim.toggle(c172 ? 'C_PARK' : 'PARK_BRK');
      break;
    case 'gear':
      if (!c172) sim.toggle('GEAR');
      break;
    case 'flapsExt':
      if (c172) sim.setSw('C_FLAPS', s.sw.C_FLAPS + 1);
      else sim.setSw('FLAPS', s.sw.FLAPS + 1);
      break;
    case 'flapsRet':
      if (c172) sim.setSw('C_FLAPS', s.sw.C_FLAPS - 1);
      else sim.setSw('FLAPS', s.sw.FLAPS - 1);
      break;
  }
}

export function hold(k: HoldKey, on: boolean) {
  sim.s.keys[k] = on;
}

export function releaseAll() {
  for (const k in sim.s.keys) sim.s.keys[k] = false;
  if (sim.s.flags.stickPad) {
    sim.s.flags.stickPad = false;
    sim.s.flags.stickMouse = false;
  }
}

/**
 * Имя клавиши по её физическому положению (KeyboardEvent.code), а не по символу.
 * Поэтому W/S/A/D, B, P, G, F, R, Q и прочие работают и в русской раскладке, и при Caps Lock.
 */
export function keyName(e: KeyboardEvent): string {
  const c = e.code || '';
  if (/^Key[A-Z]$/.test(c)) return c.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(c)) return c.slice(5);
  if (/^Numpad[0-9]$/.test(c)) return c.slice(6);
  switch (c) {
    case 'BracketLeft':
      return '[';
    case 'BracketRight':
      return ']';
    case 'Minus':
    case 'NumpadSubtract':
      return '-';
    case 'Equal':
    case 'NumpadAdd':
      return '=';
    case 'Period':
    case 'NumpadDecimal':
      return '.';
    case 'Slash':
    case 'NumpadDivide':
      return '/';
    case 'Space':
      return ' ';
  }
  return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}

/** Символ для MCDU: латиница и цифры по физическим клавишам */
export function mcduChar(e: KeyboardEvent): string | null {
  const k = keyName(e);
  if (/^[a-z0-9./]$/.test(k)) return k.toUpperCase();
  return null;
}
