import { useSyncExternalStore } from 'react';
import type { L } from '../sim/types';

export interface Msg {
  id: number;
  t: number;
  unit: string;
  text: L;
  me?: boolean;
}
export interface LogItem {
  id: number;
  t: number;
  kind: 'pen' | 'bonus' | 'ecam' | 'fail' | 'info';
  text: L;
}
export interface Toast {
  id: number;
  text: L;
  kind: string;
  until: number;
}

let nid = 1;
const state = {
  msgs: [] as Msg[],
  log: [] as LogItem[],
  toasts: [] as Toast[],
  v: 0,
};
const subs = new Set<() => void>();
const bump = () => {
  state.v++;
  for (const f of subs) f();
};

export const uiStore = {
  reset() {
    state.msgs = [];
    state.log = [];
    state.toasts = [];
    bump();
  },
  msg(t: number, unit: string, text: L, me?: boolean) {
    state.msgs = [...state.msgs.slice(-80), { id: nid++, t, unit, text, me }];
    bump();
  },
  log(t: number, kind: LogItem['kind'], text: L) {
    state.log = [...state.log.slice(-200), { id: nid++, t, kind, text }];
    bump();
  },
  toast(text: L, kind = 'info', ms = 6000) {
    const now = performance.now();
    state.toasts = [...state.toasts.filter((x) => x.until > now).slice(-2), { id: nid++, text, kind, until: now + ms }];
    bump();
    setTimeout(() => {
      state.toasts = state.toasts.filter((x) => x.until > performance.now());
      bump();
    }, ms + 50);
  },
};

export function useUiStore() {
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => state.v,
  );
  return state;
}
