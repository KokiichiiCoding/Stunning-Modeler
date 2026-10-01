// All sound is synthesised with WebAudio at runtime — no sample files, no
// licensing questions. Positional sounds pan and attenuate relative to the
// listener. (What animals *hear* is the simulation's SoundLog, not this.)

export class Audio {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.volume = 0.7;
    this.blowerNode = null;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.noiseBuf = this.makeNoise(2);
    } catch { this.ctx = null; }
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < len; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
    return b;
  }

  /** Output chain for a positioned sound: gain + stereo pan by listener yaw. */
  out(pos, base = 1, maxDist = 400) {
    const c = this.ctx;
    const g = c.createGain();
    let vol = base;
    let pan = 0;
    if (pos) {
      const p = this.game.player;
      const dx = pos.x - p.pos.x, dz = pos.z - p.pos.z;
      const d = Math.hypot(dx, dz, (pos.y || 0) - p.pos.y);
      vol *= Math.max(0, 1 - d / maxDist) / (1 + d / 18);
      const ang = Math.atan2(dx, -dz) + p.yaw; // relative bearing
      pan = Math.max(-1, Math.min(1, Math.sin(ang) * Math.min(1, d / 4)));
    }
    g.gain.value = vol;
    if (c.createStereoPanner) {
      const pn = c.createStereoPanner();
      pn.pan.value = pan;
      g.connect(pn); pn.connect(this.master);
    } else g.connect(this.master);
    return { g, vol };
  }

  noise(dest, t0, dur, { type = 'lowpass', f0 = 1200, f1 = null, q = 0.7, gain = 1, attack = 0.002 } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
  }

  tone(dest, t0, dur, { type = 'sine', f0 = 440, f1 = null, gain = 0.5, attack = 0.005, vibrato = 0, vibRate = 6, curve = null } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    if (curve) {
      o.frequency.setValueAtTime(curve[0], t0);
      for (let i = 1; i < curve.length; i++) o.frequency.linearRampToValueAtTime(curve[i], t0 + dur * i / (curve.length - 1));
    } else {
      o.frequency.setValueAtTime(f0, t0);
      if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    }
    if (vibrato) {
      const l = c.createOscillator(); const lg = c.createGain();
      l.frequency.value = vibRate; lg.gain.value = vibrato;
      l.connect(lg); lg.connect(o.frequency); l.start(t0); l.stop(t0 + dur + 0.05);
    }
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.setValueAtTime(gain, t0 + Math.max(attack, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  play(name, pos = null, opts = {}) {
    if (!this.ctx || this.volume <= 0) return;
    const t = this.ctx.currentTime + 0.01;
    const S = (base, maxDist) => this.out(pos, base, maxDist);
    switch (name) {
      case 'rifle': case 'shot': {
        const { g } = S(opts.gain || 1, 3000);
        this.noise(g, t, 0.09, { type: 'lowpass', f0: 6000, f1: 800, gain: 1.4 });
        this.tone(g, t, 0.25, { type: 'sine', f0: 110, f1: 40, gain: 1.1 });
        this.noise(g, t + 0.05, 1.3, { type: 'lowpass', f0: 900, f1: 150, gain: 0.35, attack: 0.05 });
        break;
      }
      case 'shotgun': {
        const { g } = S(1, 2500);
        this.noise(g, t, 0.14, { type: 'lowpass', f0: 4000, f1: 500, gain: 1.5 });
        this.tone(g, t, 0.3, { type: 'sine', f0: 90, f1: 35, gain: 1.2 });
        this.noise(g, t + 0.06, 1.0, { type: 'lowpass', f0: 700, f1: 120, gain: 0.3, attack: 0.05 });
        break;
      }
      case 'rimfire': { const { g } = S(0.5, 600); this.noise(g, t, 0.05, { type: 'highpass', f0: 1500, gain: 0.8 }); break; }
      case 'bow': {
        const { g } = S(0.6, 80);
        this.tone(g, t, 0.18, { type: 'triangle', f0: 220, f1: 110, gain: 0.5 });
        this.noise(g, t, 0.25, { type: 'bandpass', f0: 2500, f1: 600, gain: 0.25, q: 2 });
        break;
      }
      case 'throw': { const { g } = S(0.4, 40); this.noise(g, t, 0.18, { type: 'bandpass', f0: 800, f1: 2000, gain: 0.3, q: 1.5 }); break; }
      case 'squeak': {
        const { g } = S(0.8, 300);
        const p = opts.pitch || 1;
        this.tone(g, t, 0.28, { type: 'square', curve: [900 * p, 1500 * p, 1300 * p, 700 * p], gain: 0.18, vibrato: 60, vibRate: 30 });
        this.tone(g, t, 0.28, { type: 'sine', curve: [900 * p, 1500 * p, 1300 * p, 700 * p], gain: 0.3 });
        break;
      }
      case 'bonk': { const { g } = S(0.7, 60); this.tone(g, t, 0.12, { type: 'sine', f0: 320, f1: 120, gain: 0.7 }); this.noise(g, t, 0.05, { f0: 2000, gain: 0.4 }); break; }
      case 'boing': { const { g } = S(0.6, 60); this.tone(g, t, 0.35, { type: 'sine', curve: [180, 520, 260, 400], gain: 0.5, vibrato: 30, vibRate: 14 }); break; }
      case 'thwack': { const { g } = S(0.8, 200); this.noise(g, t, 0.08, { type: 'lowpass', f0: 1800, f1: 300, gain: 0.9 }); this.tone(g, t, 0.1, { f0: 160, f1: 70, gain: 0.6 }); break; }
      case 'splat': { const { g } = S(0.8, 120); this.noise(g, t, 0.22, { type: 'lowpass', f0: 1400, f1: 200, gain: 0.8, attack: 0.01 }); this.tone(g, t, 0.15, { f0: 240, f1: 60, gain: 0.5 }); break; }
      case 'ricochet': { const { g } = S(0.6, 300); this.tone(g, t, 0.35, { type: 'sine', f0: 2600, f1: 900, gain: 0.25 }); break; }
      case 'dirt': { const { g } = S(0.4, 200); this.noise(g, t, 0.12, { type: 'lowpass', f0: 900, gain: 0.5 }); break; }
      case 'wood': { const { g } = S(0.5, 200); this.tone(g, t, 0.08, { type: 'triangle', f0: 520, f1: 300, gain: 0.5 }); break; }
      case 'splash': { const { g } = S(0.6, 150); this.noise(g, t, 0.4, { type: 'bandpass', f0: 1200, f1: 400, gain: 0.6, q: 0.8 }); break; }
      case 'reload': { const { g } = S(0.35); this.noise(g, t, 0.05, { type: 'highpass', f0: 2500, gain: 0.5 }); this.noise(g, t + 0.18, 0.05, { type: 'highpass', f0: 3000, gain: 0.5 }); break; }
      case 'bolt': { const { g } = S(0.3); this.noise(g, t, 0.04, { type: 'highpass', f0: 3000, gain: 0.4 }); this.noise(g, t + 0.12, 0.04, { type: 'highpass', f0: 2200, gain: 0.4 }); break; }
      case 'flutter': { const { g } = S(0.5, 250); for (let i = 0; i < 6; i++) this.noise(g, t + i * 0.05, 0.05, { type: 'bandpass', f0: 1800 + i * 90, gain: 0.35, q: 2 }); for (let i = 0; i < 3; i++) this.tone(g, t + 0.1 + i * 0.12, 0.08, { type: 'sine', curve: [3200, 4200, 3000], gain: 0.12 }); break; }
      case 'spray': { const { g } = S(0.6, 80); this.noise(g, t, 0.9, { type: 'highpass', f0: 2600, f1: 1200, gain: 0.7, attack: 0.02 }); break; }
      case 'sneeze': { const { g } = S(0.9, 160); this.tone(g, t, 0.35, { type: 'sine', curve: [300, 520, 700], gain: 0.25 }); this.noise(g, t + 0.38, 0.22, { type: 'bandpass', f0: 2200, f1: 600, gain: 1.0, q: 0.8, attack: 0.005 }); this.tone(g, t + 0.38, 0.18, { type: 'sawtooth', curve: [500, 260], gain: 0.15 }); break; }
      case 'woof': { const { g } = S(0.8, 400); for (let i = 0; i < 2; i++) { this.tone(g, t + i * 0.2, 0.12, { type: 'sawtooth', curve: [420, 520, 300], gain: 0.22 }); this.noise(g, t + i * 0.2, 0.1, { type: 'bandpass', f0: 900, gain: 0.35, q: 1.5 }); } break; }
      case 'growl_small': { const { g } = S(0.5, 120); this.noise(g, t, 0.7, { type: 'lowpass', f0: 500, gain: 0.5, attack: 0.08 }); this.tone(g, t, 0.7, { type: 'sawtooth', curve: [110, 130, 100], gain: 0.12, vibrato: 10, vibRate: 22 }); break; }
      case 'shutter': { const { g } = S(0.5); this.noise(g, t, 0.03, { type: 'highpass', f0: 3500, gain: 0.7 }); this.tone(g, t, 0.05, { type: 'square', f0: 1800, f1: 900, gain: 0.08 }); this.noise(g, t + 0.07, 0.04, { type: 'highpass', f0: 2500, gain: 0.5 }); break; }
      case 'fwoosh': { const { g } = S(0.8, 80); this.noise(g, t, 0.6, { type: 'bandpass', f0: 300, f1: 1800, gain: 0.9, q: 0.7, attack: 0.04 }); this.noise(g, t + 0.05, 0.5, { type: 'lowpass', f0: 600, f1: 200, gain: 0.6 }); break; }
      case 'nom': { const { g } = S(0.45); [0, 0.16].forEach(o => { this.tone(g, t + o, 0.09, { type: 'triangle', curve: [330, 240], gain: 0.35 }); this.noise(g, t + o, 0.06, { type: 'bandpass', f0: 1200, gain: 0.25, q: 2 }); }); break; }
      case 'click': { const { g } = S(0.3); this.tone(g, t, 0.04, { type: 'square', f0: 1200, gain: 0.15 }); break; }
      case 'oof': { const { g } = S(0.7); this.tone(g, t, 0.28, { type: 'triangle', f0: 260, f1: 140, gain: 0.5 }); this.tone(g, t, 0.28, { type: 'sine', f0: 520, f1: 280, gain: 0.2 }); break; }
      case 'cash': { const { g } = S(0.5); this.tone(g, t, 0.12, { type: 'square', f0: 988, gain: 0.12 }); this.tone(g, t + 0.1, 0.35, { type: 'square', f0: 1319, gain: 0.12 }); break; }
      case 'levelup': { const { g } = S(0.5); [523, 659, 784, 1047].forEach((f, i) => this.tone(g, t + i * 0.09, 0.25, { type: 'triangle', f0: f, gain: 0.25 })); break; }
      case 'sense': { const { g } = S(0.25); this.tone(g, t, 0.4, { type: 'sine', f0: 660, f1: 990, gain: 0.15 }); break; }
      case 'heartbeat': { const { g } = S(0.4); this.tone(g, t, 0.1, { f0: 60, gain: 0.8 }); this.tone(g, t + 0.18, 0.1, { f0: 55, gain: 0.6 }); break; }
      // animal voices
      case 'deer': { const { g } = S(0.6, 350); this.tone(g, t, 0.35, { type: 'sawtooth', curve: [620, 760, 520], gain: 0.12, vibrato: 25, vibRate: 11 }); break; }
      case 'elk': { const { g } = S(0.9, 900); this.tone(g, t, 1.6, { type: 'sine', curve: [500, 900, 1700, 1800, 1500, 700], gain: 0.3, vibrato: 18, vibRate: 7 }); this.tone(g, t, 1.6, { type: 'sawtooth', curve: [250, 450, 850, 900, 750, 350], gain: 0.05 }); break; }
      case 'boar': { const { g } = S(0.6, 250); this.noise(g, t, 0.3, { type: 'bandpass', f0: 350, gain: 0.6, q: 4 }); this.tone(g, t, 0.3, { type: 'sawtooth', curve: [140, 110, 150], gain: 0.15 }); break; }
      case 'squeal': { const { g } = S(0.8, 300); this.tone(g, t, 0.5, { type: 'sawtooth', curve: [900, 1500, 1200, 700], gain: 0.15, vibrato: 40, vibRate: 20 }); break; }
      case 'growl': { const { g } = S(0.9, 300); this.noise(g, t, 0.9, { type: 'lowpass', f0: 400, gain: 0.8, attack: 0.08 }); this.tone(g, t, 0.9, { type: 'sawtooth', curve: [70, 90, 60], gain: 0.25, vibrato: 12, vibRate: 18 }); break; }
      case 'roar': { const { g } = S(1.2, 700); this.noise(g, t, 1.3, { type: 'lowpass', f0: 900, f1: 250, gain: 1.0, attack: 0.1 }); this.tone(g, t, 1.3, { type: 'sawtooth', curve: [90, 150, 110, 60], gain: 0.4, vibrato: 20, vibRate: 22 }); break; }
      case 'moose': { const { g } = S(0.9, 500); this.tone(g, t, 0.7, { type: 'sawtooth', curve: [95, 80, 70], gain: 0.35 }); this.noise(g, t, 0.7, { type: 'lowpass', f0: 300, gain: 0.3 }); break; }
      case 'howl': { const { g } = S(0.9, 1200); this.tone(g, t, 2.4, { type: 'sine', curve: [380, 620, 700, 680, 520], gain: 0.3, vibrato: 8, vibRate: 5 }); break; }
      case 'yip': { const { g } = S(0.6, 400); this.tone(g, t, 0.15, { type: 'sine', curve: [700, 1100, 800], gain: 0.25 }); break; }
      case 'cougar': { const { g } = S(1.0, 700); this.noise(g, t, 0.9, { type: 'bandpass', f0: 1800, f1: 900, gain: 0.7, q: 1.5 }); this.tone(g, t, 0.9, { type: 'sawtooth', curve: [700, 1100, 800], gain: 0.15 }); break; }
      case 'gobble': { const { g } = S(0.8, 450); for (let i = 0; i < 7; i++) this.tone(g, t + i * 0.06, 0.07, { type: 'sawtooth', f0: 420 + (i % 2) * 120, gain: 0.18 }); break; }
      case 'rabbit': { const { g } = S(0.5, 150); this.tone(g, t, 0.12, { f0: 1400, f1: 1900, gain: 0.2 }); break; }
      case 'call_deer': this.play('deer', pos); break;
      case 'call_elk': this.play('elk', pos); break;
      case 'call_turkey': this.play('gobble', pos); break;
      case 'call_predator': { const { g } = S(0.8); this.tone(g, t, 1.2, { type: 'sawtooth', curve: [1600, 2200, 1400, 2000, 1200], gain: 0.12, vibrato: 90, vibRate: 13 }); break; }
    }
  }

  footstep(pos, speed, biome, stance, swimming) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.01;
    const quiet = stance === 'prone' ? 0.25 : stance === 'crouch' ? 0.45 : 1;
    const { g } = this.out(null, 0.14 * quiet * Math.min(1.4, 0.5 + speed / 4));
    if (swimming || biome === 6) { this.noise(g, t, 0.25, { type: 'bandpass', f0: 900, gain: 0.8, q: 0.6 }); return; }
    const f = { 0: 2200, 1: 1500, 2: 1300, 3: 700, 4: 2600, 5: 3200, 7: 1800, 8: 4200, 9: 1100 }[biome] || 1600;
    this.noise(g, t, biome === 8 ? 0.12 : 0.08, { type: 'bandpass', f0: f, f1: f * 0.6, gain: 0.9, q: 0.9 });
  }

  startAmbience() {
    if (!this.ctx || this.ambience) return;
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.makeNoise(4); src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const g = c.createGain(); g.gain.value = 0.05;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
    this.ambience = { src, f, g };
    this.birdT = 0;
  }

  /** Chibi gibberish: a few squeaky syllables. mood: happy | yay | scared | hurt | huh. */
  babble(pos, mood = 'happy', voice = 1) {
    if (!this.ctx || this.volume <= 0) return;
    const t0 = this.ctx.currentTime + 0.01;
    const { g } = this.out(pos, 0.55, 150);
    const n = mood === 'yay' ? 2 : mood === 'hurt' ? 1 : mood === 'scared' ? 4 : 3;
    const base = 380 * voice * (mood === 'scared' ? 1.4 : 1);
    let t = t0;
    for (let i = 0; i < n; i++) {
      const len = mood === 'scared' ? 0.07 : 0.1 + Math.random() * 0.05;
      const up = mood === 'yay' || mood === 'huh' ? 1 + i * 0.25 : mood === 'hurt' ? 0.6 : 1 + (Math.random() - 0.5) * 0.5;
      const f = base * up;
      this.tone(g, t, len, { type: 'square', curve: [f, f * 1.25, f * 0.95], gain: 0.07, vibrato: 25, vibRate: 30 });
      this.tone(g, t, len, { type: 'sine', curve: [f * 2, f * 2.4, f * 1.9], gain: 0.12 });
      t += len + 0.03;
    }
  }

  /** Waterfall roar: low rumbling noise, louder as you approach. */
  setFalls(level) {
    if (!this.ctx) return;
    if (!this.fallsNode && level > 0.01) {
      const c = this.ctx;
      const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true; src.playbackRate.value = 0.7;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(lp); lp.connect(g); g.connect(this.master); src.start(0, 0.7);
      this.fallsNode = { g };
    }
    if (this.fallsNode) this.fallsNode.g.gain.setTargetAtTime(level * level * 0.35, this.ctx.currentTime, 0.4);
  }

  /** Campfire crackle: low roar + random pops, by distance to the nearest fire. */
  setFire(level) {
    if (!this.ctx) return;
    if (!this.fireNode && level > 0.01) {
      const c = this.ctx;
      const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true; src.playbackRate.value = 0.45;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(lp); lp.connect(g); g.connect(this.master); src.start(0, 0.2);
      this.fireNode = { g, popT: 0 };
    }
    if (!this.fireNode) return;
    this.fireNode.g.gain.setTargetAtTime(level * level * 0.22, this.ctx.currentTime, 0.3);
    this.fireNode.popT -= 1 / 60;
    if (level > 0.05 && this.fireNode.popT <= 0) {
      this.fireNode.popT = 0.08 + Math.random() * 0.5;
      const t = this.ctx.currentTime;
      const g = this.ctx.createGain(); g.gain.value = level * 0.5; g.connect(this.master);
      this.noise(g, t, 0.02 + Math.random() * 0.03, { type: 'highpass', f0: 1500 + Math.random() * 3000, gain: 0.6 });
    }
  }

  /** Zipline whine: a bandpassed hiss that climbs with speed. */
  setZip(level) {
    if (!this.ctx) return;
    if (!this.zipNode && level > 0.01) {
      const c = this.ctx;
      const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 6; bp.frequency.value = 600;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(bp); bp.connect(g); g.connect(this.master); src.start(0, 0.5);
      this.zipNode = { g, bp };
    }
    if (!this.zipNode) return;
    this.zipNode.g.gain.setTargetAtTime(level * 0.3, this.ctx.currentTime, 0.1);
    this.zipNode.bp.frequency.setTargetAtTime(500 + level * 2600, this.ctx.currentTime, 0.1);
  }

  /** Rain hiss (two filtered noise layers) scaled by rain intensity. */
  setRain(level) {
    if (!this.ctx) return;
    if (!this.rainNode && level > 0.02) {
      const c = this.ctx;
      const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
      const src2 = c.createBufferSource(); src2.buffer = this.noiseBuf; src2.loop = true; src2.playbackRate.value = 0.5;
      const lo = c.createBiquadFilter(); lo.type = 'lowpass'; lo.frequency.value = 420;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(hp); hp.connect(lp); lp.connect(g); src2.connect(lo); lo.connect(g); g.connect(this.master);
      src.start(0, 0.3); src2.start(0, 1.1);
      this.rainNode = { src, src2, g };
    }
    if (this.rainNode) this.rainNode.g.gain.setTargetAtTime(level * 0.16, this.ctx.currentTime, 0.5);
  }
  thunder(strength = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.01;
    const { g } = this.out(null, 0.9 * Math.max(0.3, strength));
    this.noise(g, t, 0.35, { type: 'lowpass', f0: 2400, f1: 300, gain: 0.9 * strength });
    this.noise(g, t + 0.1, 3.2, { type: 'lowpass', f0: 260, f1: 60, gain: 1.2, attack: 0.3 });
    this.tone(g, t + 0.1, 2.4, { type: 'sine', curve: [48, 40, 52, 36, 30], gain: 0.5 });
  }

  /** Quad bike engine: two detuned oscillators + chuggy noise, pitched by speed. */
  startEngine() {
    if (!this.ctx || this.engine) return;
    const c = this.ctx;
    const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 42;
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 43.5;
    const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 320;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; f.Q.value = 3;
    const g = c.createGain(); g.gain.value = 0.0001;
    const chug = c.createGain(); chug.gain.value = 0.5;
    const lfo = c.createOscillator(); lfo.frequency.value = 9; const lg = c.createGain(); lg.gain.value = 0.35;
    lfo.connect(lg); lg.connect(chug.gain);
    o1.connect(f); o2.connect(f); n.connect(nf); nf.connect(f); f.connect(chug); chug.connect(g); g.connect(this.master);
    [o1, o2, n, lfo].forEach(x => x.start());
    g.gain.exponentialRampToValueAtTime(0.09, c.currentTime + 0.3);
    this.engine = { o1, o2, n, lfo, f, g };
    this.play('boing'); // the starter motor is, somehow, a spring
  }
  stopEngine() {
    if (!this.engine) return;
    const e = this.engine, t = this.ctx.currentTime;
    this.engine = null;
    e.g.gain.cancelScheduledValues(t);
    e.g.gain.setValueAtTime(e.g.gain.value, t);
    e.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    [e.o1, e.o2, e.n, e.lfo].forEach(x => x.stop(t + 0.55));
  }

  update(dt) {
    if (this.engine) {
      const v = this.game.player.vehicle;
      const sp = v ? v.speed() : 0;
      const rev = v && v.airborne ? 1.5 : 1;
      const hz = (42 + sp * 5.5) * rev;
      const t = this.ctx.currentTime;
      this.engine.o1.frequency.setTargetAtTime(hz, t, 0.08);
      this.engine.o2.frequency.setTargetAtTime(hz * 1.03, t, 0.08);
      this.engine.lfo.frequency.setTargetAtTime(9 + sp * 1.4, t, 0.1);
      this.engine.f.frequency.setTargetAtTime(600 + sp * 90, t, 0.1);
    }
    if (!this.ctx || !this.ambience) return;
    const G = this.game;
    const w = G.wind.speed;
    this.ambience.g.gain.value = 0.02 + w * 0.012;
    this.ambience.f.frequency.value = 300 + w * 90 + G.wind.gust * 200;
    this.birdT -= dt;
    if (this.birdT <= 0) {
      this.birdT = 1.5 + Math.random() * 5;
      const t = this.ctx.currentTime + 0.01;
      const period = G.period || G.sky.period;
      const { g } = this.out(null, 0.06);
      if (period === 'night') {
        for (let i = 0; i < 3; i++) this.tone(g, t + i * 0.09, 0.05, { type: 'sine', f0: 4200, gain: 0.25 }); // crickets
      } else {
        const base = 2200 + Math.random() * 1600;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.tone(g, t + i * 0.13, 0.1, { type: 'sine', curve: [base, base * 1.3, base * 0.9], gain: 0.2 });
      }
    }
    // Leaf blower drone
    const blowing = G.weapons && G.weapons.blowing;
    if (blowing && !this.blowerNode) {
      const c = this.ctx;
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 110;
      const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.5;
      const g = c.createGain(); g.gain.value = 0.12;
      o.connect(g); n.connect(f); f.connect(g); g.connect(this.master);
      o.start(); n.start();
      this.blowerNode = { o, n, g };
    } else if (!blowing && this.blowerNode) {
      const b = this.blowerNode; this.blowerNode = null;
      b.g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.2);
      b.o.stop(this.ctx.currentTime + 0.25); b.n.stop(this.ctx.currentTime + 0.25);
    }
  }
}
