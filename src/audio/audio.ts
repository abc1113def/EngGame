import type { SimState } from '../sim/types';

/** Процедурный звук: всё синтезируется в Web Audio, без файлов */
class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  noise!: AudioBuffer;
  enabled = true;
  volume = 0.7;
  private loops: Record<string, { gain: GainNode; set: (s: SimState, g: GainNode) => void }> = {};
  private lastCrc = 0;
  private lastPtu = 0;
  private voice: SpeechSynthesisVoice | null = null;

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? this.volume : 0;
    this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b = 0.97 * b + 0.03 * w; // слегка «розовый»
      d[i] = w * 0.5 + b * 2.5;
    }
    this.buildLoops();
    this.pickVoice();
    try {
      speechSynthesis.onvoiceschanged = () => this.pickVoice();
    } catch {
      /* ignore */
    }
  }

  private pickVoice() {
    try {
      const vs = speechSynthesis.getVoices();
      this.voice = vs.find((v) => /en[-_]US/i.test(v.lang) && /male|david|alex|guy/i.test(v.name)) ?? vs.find((v) => /^en/i.test(v.lang)) ?? null;
    } catch {
      this.voice = null;
    }
  }

  setEnabled(on: boolean, vol = this.volume) {
    this.enabled = on;
    this.volume = vol;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? vol : 0, this.ctx.currentTime, 0.05);
    if (!on) {
      try {
        speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }
  }

  private noiseSrc() {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.start();
    return s;
  }

  private buildLoops() {
    const ctx = this.ctx!;
    const mk = (name: string, build: (g: GainNode) => (s: SimState, g: GainNode) => void) => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.master);
      this.loops[name] = { gain: g, set: build(g) };
    };
    // ВСУ: свист + шум
    mk('apu', (g) => {
      const n = this.noiseSrc();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 2;
      n.connect(bp).connect(g);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2500;
      const og = ctx.createGain();
      og.gain.value = 0.05;
      o.connect(lp).connect(og).connect(g);
      o.start();
      return (s, gg) => {
        const N = s.apu.n / 100;
        bp.frequency.setTargetAtTime(300 + N * 1800, ctx.currentTime, 0.1);
        o.frequency.setTargetAtTime(200 + N * 2400, ctx.currentTime, 0.1);
        gg.gain.setTargetAtTime(N > 0.01 ? 0.05 + N * 0.13 : 0, ctx.currentTime, 0.15);
      };
    });
    // двигатели
    for (const i of [0, 1]) {
      mk('eng' + i, (g) => {
        const n = this.noiseSrc();
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.Q.value = 0.8;
        n.connect(lp).connect(g);
        const whine = ctx.createOscillator();
        whine.type = 'triangle';
        const wg = ctx.createGain();
        whine.connect(wg).connect(g);
        whine.start();
        const fan = ctx.createOscillator();
        fan.type = 'sawtooth';
        const fl = ctx.createBiquadFilter();
        fl.type = 'lowpass';
        fl.frequency.value = 900;
        const fg = ctx.createGain();
        fan.connect(fl).connect(fg).connect(g);
        fan.start();
        return (s, gg) => {
          const e = s.eng[i];
          const n2 = e.n2 / 100;
          const n1 = e.n1 / 100;
          const burn = e.phase === 'accel' || e.phase === 'run' ? 1 : 0;
          lp.frequency.setTargetAtTime(200 + n1 * 1800 + burn * 300, ctx.currentTime, 0.2);
          whine.frequency.setTargetAtTime(400 + n2 * 3200, ctx.currentTime, 0.2);
          wg.gain.setTargetAtTime(0.02 + n2 * 0.05, ctx.currentTime, 0.2);
          fan.frequency.setTargetAtTime(30 + n1 * 160, ctx.currentTime, 0.2);
          fg.gain.setTargetAtTime(n1 * 0.08, ctx.currentTime, 0.2);
          gg.gain.setTargetAtTime(n2 > 0.02 ? Math.min(0.55, 0.06 + n2 * 0.2 + n1 * 0.35) : 0, ctx.currentTime, 0.25);
        };
      });
    }
    // вентиляция / кондиционеры
    mk('packs', (g) => {
      const n = this.noiseSrc();
      const hp = ctx.createBiquadFilter();
      hp.type = 'bandpass';
      hp.frequency.value = 900;
      hp.Q.value = 0.6;
      n.connect(hp).connect(g);
      return (s, gg) => {
        const flow = s.bleed.pack1Flow + s.bleed.pack2Flow;
        const avio = s.elec.acEss ? 0.012 : 0;
        gg.gain.setTargetAtTime(avio + flow * 0.025, ctx.currentTime, 0.4);
      };
    });
    // гул ВПП и ветер
    mk('roll', (g) => {
      const n = this.noiseSrc();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 160;
      n.connect(lp).connect(g);
      return (s, gg) => {
        const v = Math.abs(s.ac.gs);
        const k = s.ac.onGround ? Math.min(1, v / 60) : 0;
        lp.frequency.setTargetAtTime(90 + v * 3, ctx.currentTime, 0.2);
        gg.gain.setTargetAtTime(k * 0.35 + (s.ac.onGround ? 0 : Math.min(0.2, s.ac.ias / 900)), ctx.currentTime, 0.2);
      };
    });
    // ===== Cessna 172 =====
    // поршневой двигатель: частота вспышек = об/мин / 60 × 2 (4 цилиндра)
    mk('piston', (g) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const o2 = ctx.createOscillator();
      o2.type = 'square';
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 1.4;
      const og = ctx.createGain();
      og.gain.value = 0.6;
      const o2g = ctx.createGain();
      o2g.gain.value = 0.25;
      o.connect(og).connect(lp);
      o2.connect(o2g).connect(lp);
      const n = this.noiseSrc();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 0.8;
      const ng = ctx.createGain();
      n.connect(bp).connect(ng).connect(g);
      lp.connect(g);
      o.start();
      o2.start();
      return (s, gg) => {
        if (s.type !== 'c172') {
          gg.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
          return;
        }
        const rpm = s.c.rpm;
        const fire = Math.max(1, (rpm / 60) * 2);
        o.frequency.setTargetAtTime(fire, ctx.currentTime, 0.05);
        o2.frequency.setTargetAtTime(fire / 2, ctx.currentTime, 0.05);
        lp.frequency.setTargetAtTime(180 + rpm * 0.35, ctx.currentTime, 0.1);
        bp.frequency.setTargetAtTime(300 + rpm * 0.6, ctx.currentTime, 0.1);
        ng.gain.setTargetAtTime(s.c.running ? 0.05 + (rpm / 2700) * 0.12 : 0.01, ctx.currentTime, 0.1);
        const k = s.c.running ? 0.18 + (rpm / 2700) * 0.32 : rpm > 30 ? 0.12 : 0;
        gg.gain.setTargetAtTime(k, ctx.currentTime, 0.08);
      };
    });
    // стартер
    mk('starter', (g) => {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 180;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      const am = ctx.createGain();
      o.connect(lp).connect(am).connect(g);
      o.start();
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 6;
      const lfoG = ctx.createGain();
      lfoG.gain.value = 0.5;
      lfo.connect(lfoG).connect(am.gain);
      lfo.start();
      return (s, gg) => {
        const on = s.type === 'c172' && s.c.starter;
        o.frequency.setTargetAtTime(120 + s.c.busV * 4, ctx.currentTime, 0.1);
        lfo.frequency.setTargetAtTime(Math.max(1, (s.c.rpm / 60) * 2), ctx.currentTime, 0.1);
        gg.gain.setTargetAtTime(on ? 0.09 : 0, ctx.currentTime, 0.05);
      };
    });
    // сигнализатор сваливания
    mk('stallhorn', (g) => {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 1580;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1600;
      bp.Q.value = 3;
      o.connect(bp).connect(g);
      o.start();
      return (s, gg) => gg.gain.setTargetAtTime(s.type === 'c172' && s.c.stallHorn && s.c.busV > 0 ? 0.12 : 0, ctx.currentTime, 0.03);
    });
    // гироскопы и вентилятор авионики
    mk('gyro', (g) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      const og = ctx.createGain();
      og.gain.value = 0.5;
      o.connect(og).connect(g);
      o.start();
      return (s, gg) => {
        const on = s.type === 'c172' ? Math.max(s.c.aiSpin, s.c.busV > 18 ? 0.4 : 0) : 0;
        o.frequency.setTargetAtTime(600 + on * 1800, ctx.currentTime, 0.5);
        gg.gain.setTargetAtTime(on * 0.006, ctx.currentTime, 0.4);
      };
    });
    // электронасос жёлтой системы
    mk('ypump', (g) => {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 390;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      o.connect(lp).connect(g);
      o.start();
      return (s, gg) => gg.gain.setTargetAtTime(s.sw.HYD_Y_ELEC === 1 && s.elec.ac2 ? 0.02 : 0, ctx.currentTime, 0.2);
    });
  }

  private env(freq: number, dur: number, type: OscillatorType, vol: number, at = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime + at;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(dur: number, freq: number, vol: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 1.5;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(bp).connect(g).connect(this.master);
    n.start(t, Math.random());
    n.stop(t + dur + 0.02);
  }

  ui(kind: string) {
    if (!this.ctx || !this.enabled) return;
    switch (kind) {
      case 'pb':
        this.burst(0.04, 2400, 0.35);
        this.env(180, 0.05, 'square', 0.03);
        break;
      case 'toggle':
        this.burst(0.05, 1500, 0.5);
        break;
      case 'knob':
        this.burst(0.025, 3200, 0.25);
        break;
      case 'guard':
        this.burst(0.06, 900, 0.4);
        break;
      case 'lever':
      case 'detent':
        this.burst(0.08, 600, 0.5);
        this.env(90, 0.08, 'sine', 0.08);
        break;
      case 'key':
        this.burst(0.02, 2800, 0.2);
        break;
    }
  }

  singleChime() {
    this.env(1320, 1.4, 'sine', 0.25);
    this.env(2640, 0.9, 'sine', 0.06);
  }
  crcDing() {
    this.env(1000, 0.35, 'sine', 0.22);
    this.env(2000, 0.2, 'sine', 0.05);
  }
  cabinChime() {
    this.env(1050, 0.9, 'sine', 0.18);
    this.env(820, 1.2, 'sine', 0.18, 0.45);
  }
  cavalry() {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.env(f, 0.18, 'square', 0.06, i * 0.12));
  }
  ptuBark() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 55;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.3, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(lp).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.3);
  }

  say(text: string) {
    if (!this.enabled) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.lang = 'en-US';
      u.rate = 1.05;
      u.volume = Math.min(1, this.volume + 0.2);
      speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  }

  /** Короткий выкрик без очереди (радиовысотомер) */
  sayNow(text: string) {
    if (!this.enabled) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.lang = 'en-US';
      u.rate = 1.35;
      u.pitch = 0.8;
      u.volume = Math.min(1, this.volume + 0.2);
      speechSynthesis.speak(u);
    } catch {
      /* ignore */
    }
  }

  /** Обновление непрерывных звуков (вызывается каждый кадр) */
  update(s: SimState, paused: boolean) {
    if (!this.ctx) return;
    for (const k in this.loops) {
      const L = this.loops[k];
      if (paused) L.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      else L.set(s, L.gain);
    }
    if (paused || !this.enabled) return;
    const now = this.ctx.currentTime;
    if (s.flags.crc && now - this.lastCrc > 0.45) {
      this.lastCrc = now;
      this.crcDing();
    }
    if (s.hyd.ptu && now - this.lastPtu > 0.16) {
      this.lastPtu = now;
      this.ptuBark();
    }
  }
}

export const audio = new AudioEngine();
