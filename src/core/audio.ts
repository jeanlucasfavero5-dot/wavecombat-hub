// All sound is synthesized with WebAudio: no audio files. One shared context, created on the first user gesture.
import type { WeaponKind } from "../sim/weapons.ts";

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  volume = 0.7;

  /** call from a click / key press */
  resume(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp); comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    if (this.master) this.master.gain.value = this.volume;
  }

  setVolume(v: number): void { this.volume = v; if (this.master) this.master.gain.value = v; }

  private burst(opts: { dur: number; gain: number; freq: number; q?: number; type?: BiquadFilterType; sweepTo?: number; delay?: number; pan?: number }): void {
    const c = this.ctx; if (!c || !this.master || !this.noise) return;
    const t0 = c.currentTime + (opts.delay ?? 0);
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = opts.type ?? "bandpass"; f.frequency.setValueAtTime(opts.freq, t0); f.Q.value = opts.q ?? 0.8;
    if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, opts.sweepTo), t0 + opts.dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(opts.gain, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    src.connect(f); f.connect(g);
    if (opts.pan !== undefined && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = opts.pan; g.connect(p); p.connect(this.master); } else g.connect(this.master);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + opts.dur + 0.05);
  }

  private tone(freq: number, dur: number, gain: number, type: OscillatorType = "sine", sweepTo?: number, delay = 0): void {
    const c = this.ctx; if (!c || !this.master) return;
    const t0 = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (sweepTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t0 + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master); o.start(t0); o.stop(t0 + dur + 0.05);
  }

  shot(kind: WeaponKind): void {
    switch (kind) {
      case "pistol": this.burst({ dur: 0.16, gain: 0.55, freq: 2400, sweepTo: 600, q: 0.6 }); this.tone(170, 0.12, 0.5, "triangle", 60); break;
      case "smg": this.burst({ dur: 0.12, gain: 0.45, freq: 3000, sweepTo: 800, q: 0.7 }); this.tone(190, 0.09, 0.4, "triangle", 70); break;
      case "rifle": this.burst({ dur: 0.2, gain: 0.6, freq: 1800, sweepTo: 400, q: 0.5 }); this.tone(120, 0.16, 0.6, "triangle", 45); break;
      case "shotgun": this.burst({ dur: 0.32, gain: 0.85, freq: 1200, sweepTo: 200, q: 0.4 }); this.tone(80, 0.28, 0.8, "sawtooth", 35); break;
      case "sniper": this.burst({ dur: 0.55, gain: 0.9, freq: 1400, sweepTo: 150, q: 0.4 }); this.tone(70, 0.45, 0.9, "triangle", 28); this.burst({ dur: 0.7, gain: 0.25, freq: 600, sweepTo: 200, delay: 0.12 }); break;
      case "knife": this.burst({ dur: 0.14, gain: 0.35, freq: 1500, sweepTo: 5000, q: 1.2, type: "highpass" }); break;
    }
  }
  empty(): void { this.tone(900, 0.04, 0.25, "square"); }
  reload(): void { this.burst({ dur: 0.05, gain: 0.3, freq: 2500, q: 3 }); this.burst({ dur: 0.06, gain: 0.35, freq: 1800, q: 3, delay: 0.55 }); this.burst({ dur: 0.05, gain: 0.3, freq: 3000, q: 3, delay: 1.0 }); }
  shell(): void { this.burst({ dur: 0.05, gain: 0.3, freq: 2200, q: 3 }); }
  swap(): void { this.burst({ dur: 0.07, gain: 0.25, freq: 1200, q: 2 }); this.burst({ dur: 0.05, gain: 0.25, freq: 2400, q: 2, delay: 0.12 }); }
  step(sprint: boolean): void { this.burst({ dur: 0.07, gain: sprint ? 0.22 : 0.15, freq: 400, q: 1, type: "lowpass" }); }
  land(hard: boolean): void { this.burst({ dur: hard ? 0.18 : 0.1, gain: hard ? 0.5 : 0.25, freq: 300, q: 0.7, type: "lowpass" }); }
  hit(head: boolean): void { head ? (this.tone(1800, 0.09, 0.35, "sine"), this.tone(2600, 0.12, 0.25, "sine", undefined, 0.03)) : this.tone(1100, 0.06, 0.3, "sine"); }
  kill(): void { this.tone(700, 0.07, 0.3, "triangle"); this.tone(1000, 0.1, 0.3, "triangle", undefined, 0.06); this.tone(1400, 0.16, 0.3, "triangle", undefined, 0.12); }
  scope(): void { this.burst({ dur: 0.06, gain: 0.2, freq: 3500, q: 2 }); }
  ui(): void { this.tone(520, 0.05, 0.18, "square"); }
  impact(): void { this.burst({ dur: 0.08, gain: 0.15, freq: 1500, q: 1.5 }); }
}
