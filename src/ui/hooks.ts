import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { sim } from '../sim/sim';
import type { L, Lang, Settings, SimState } from '../sim/types';

// ============================ настройки ============================
const KEY = 'a320-cold-dark-settings';
// на сенсорных экранах пульт открыт сразу
const coarse = (() => {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
})();
const defaults: Settings = { lang: 'ru', sound: true, volume: 0.7, failures: 'light', fastAlign: true, checklists: true, pad: coarse };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    /* хранилище недоступно */
  }
  return { ...defaults };
}

let settings = load();
const setSubs = new Set<() => void>();
export function getSettings() {
  return settings;
}
export function setSettings(p: Partial<Settings>) {
  settings = { ...settings, ...p };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
  for (const f of setSubs) f();
}
export function useSettings(): Settings {
  return useSyncExternalStore(
    (f) => {
      setSubs.add(f);
      return () => setSubs.delete(f);
    },
    () => settings,
  );
}
export function useLang(): Lang {
  return useSettings().lang;
}
export function tr(l: L | string, lang: Lang): string {
  return typeof l === 'string' ? l : l[lang];
}
export function useT() {
  const lang = useLang();
  return (l: L | string) => tr(l, lang);
}

// ============================ симуляция ============================
export function useSim<T>(sel: (s: SimState) => T): T {
  return useSyncExternalStore(sim.subscribe, () => sel(sim.s));
}

/** Перерисовка с ограниченной частотой (для экранов) */
export function useSimFrame(hz = 20): SimState {
  const [, setN] = useState(0);
  useEffect(() => {
    let last = 0;
    return sim.subscribe(() => {
      const now = performance.now();
      if (now - last >= 1000 / hz) {
        last = now;
        setN((n) => (n + 1) % 1e9);
      }
    });
  }, [hz]);
  return sim.s;
}

// ============================ подсветка (обучение) ============================
export const HlCtx = createContext<Set<string>>(new Set());
export function useHl(id: string) {
  return useContext(HlCtx).has(id);
}
