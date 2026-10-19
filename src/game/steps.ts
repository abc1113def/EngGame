import { STEPS_C172 } from '../sim/c172/procedure';
import type { AircraftType, Scenario } from '../sim/types';
import { STEPS_DEP, type Step } from './procedure';
import { STEPS_ARR } from './procedure_arr';

export const ALL_STEPS: Step[] = [...STEPS_DEP, ...STEPS_ARR, ...STEPS_C172];
export const STEP_BY_ID: Record<string, Step> = Object.fromEntries(ALL_STEPS.map((x) => [x.id, x]));

export function stepsFor(type: AircraftType, scn: Scenario): Step[] {
  if (type === 'c172') return STEPS_C172;
  if (scn === 'arr') return STEPS_ARR;
  if (scn === 'full') return [...STEPS_DEP, ...STEPS_ARR];
  return STEPS_DEP;
}
