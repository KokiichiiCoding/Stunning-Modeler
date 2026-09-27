// Weather: a seeded, headless state machine the simulation owns. Rendering
// only displays it. It matters to the hunt: rain washes tracks and blood,
// thins scent and masks your footsteps; fog shortens every animal's (and
// your) sight lines; overcast skies dim the light animals see by.

import { Rng } from '../core/rng.js';

export const WEATHER_KINDS = ['clear', 'cloudy', 'rain', 'fog'];

const TARGETS = {
  clear: { cloud: 0.12, rain: 0, fog: 0 },
  cloudy: { cloud: 0.65, rain: 0, fog: 0.08 },
  rain: { cloud: 1, rain: 1, fog: 0.3 },
  fog: { cloud: 0.35, rain: 0, fog: 1 },
};

export const WEATHER_LABEL = { clear: 'Clear', cloudy: 'Overcast', rain: 'Rain', fog: 'Fog' };
export const WEATHER_ICON = { clear: '☀', cloudy: '☁', rain: '☂', fog: '≋' };

// Sun intensity through the day (mirrors the sky keys, numbers only).
const SUN = [[0, 0.22], [4.8, 0.2], [5.8, 0.55], [7, 1.15], [9.5, 1.45], [15.5, 1.4], [18, 1.05], [19.2, 0.6], [20.4, 0.28], [24, 0.22]];
export function sunIntensity(hour) {
  for (let i = 0; i < SUN.length - 1; i++) {
    const [h0, a] = SUN[i], [h1, b] = SUN[i + 1];
    if (hour >= h0 && hour <= h1) return a + (b - a) * (hour - h0) / Math.max(1e-6, h1 - h0);
  }
  return SUN[0][1];
}

export class Weather {
  constructor(seed, hour = 12) {
    this.rng = new Rng(seed);
    // Mornings in the reserve are often misty.
    const dawn = hour >= 4.5 && hour < 8.5;
    this.kind = dawn && this.rng.chance(0.35) ? 'fog' : this.rng.chance(0.65) ? 'clear' : 'cloudy';
    this.cloud = TARGETS[this.kind].cloud; this.rain = TARGETS[this.kind].rain; this.fog = TARGETS[this.kind].fog;
    this.timer = this.rng.range(160, 360);
    this.rainAccum = 0; // integral of rain intensity (s): how much washing has happened
    this.changed = null;
  }

  pickNext(hour) {
    const dawn = hour >= 4.5 && hour < 8.5;
    const night = hour >= 21 || hour < 4.5;
    const w = {
      clear: this.kind === 'clear' ? 2 : 4,
      cloudy: 3,
      rain: this.kind === 'cloudy' ? 3 : this.kind === 'rain' ? 1 : 0.8,
      fog: dawn ? 4 : night ? 1.2 : 0.3,
    };
    if (this.kind === 'rain') w.cloudy += 2; // storms usually clear via overcast
    return this.rng.weighted(WEATHER_KINDS.map(k => ({ w: k === this.kind ? w[k] * 0.3 : w[k], v: k })));
  }

  step(dt, hour) {
    this.timer -= dt;
    if (this.timer <= 0) {
      const next = this.pickNext(hour);
      this.timer = next === 'rain' ? this.rng.range(120, 260) : this.rng.range(180, 420);
      if (next !== this.kind) { this.kind = next; this.changed = next; }
    }
    // Fog burns off as the day warms up.
    if (this.kind === 'fog' && hour > 10.5 && hour < 18) { this.kind = 'cloudy'; this.changed = 'cloudy'; }
    const t = TARGETS[this.kind];
    const k = Math.min(1, dt / 30);
    this.cloud += (t.cloud - this.cloud) * k;
    this.rain += (t.rain - this.rain) * Math.min(1, dt / (t.rain > this.rain ? 40 : 25));
    this.fog += (t.fog - this.fog) * k;
    this.rainAccum += this.rain * dt;
  }

  set(kind, instant = false) {
    if (!TARGETS[kind]) return;
    this.kind = kind; this.timer = this.rng.range(180, 420);
    if (instant) { const t = TARGETS[kind]; this.cloud = t.cloud; this.rain = t.rain; this.fog = t.fog; }
  }

  /** Rain patter masks sound; animals hear less. */
  hearingMult() { return 1 - 0.45 * this.rain; }
  /** Fog and heavy rain shorten sight lines. */
  visibilityMult() { return Math.max(0.3, 1 - 0.62 * this.fog - 0.2 * this.rain); }
  /** Extra scent decay per second while raining. */
  scentWash() { return 0.07 * this.rain; }
  /** Ambient light animals see by (0.2–1). */
  light(hour) { return Math.max(0.2, Math.min(1, 0.35 + sunIntensity(hour) * 0.5 * (1 - 0.35 * this.cloud))); }
  /** Pack for co-op presence. */
  pack() { return [WEATHER_KINDS.indexOf(this.kind), +this.cloud.toFixed(2), +this.rain.toFixed(2), +this.fog.toFixed(2)]; }
  unpack(a, dt) {
    if (!Array.isArray(a)) return;
    const kind = WEATHER_KINDS[a[0]];
    if (kind && kind !== this.kind) { this.kind = kind; this.changed = kind; }
    const k = Math.min(1, dt * 0.5);
    this.cloud += (a[1] - this.cloud) * k; this.rain += (a[2] - this.rain) * k; this.fog += (a[3] - this.fog) * k;
  }
}
