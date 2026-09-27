// Ports of the C++ world layer: Wind.cpp, Scent.cpp, SoundEvents.cpp,
// Evidence.cpp and Perception.cpp. Headless, deterministic, no three.js.

import { Rng } from '../core/rng.js';
import { totalBleedRate } from './creature.js';

// ------------------------------------------------------------------ wind
export class Wind {
  constructor(seed, dir = 0.6, speed = 3) {
    this.rng = new Rng(seed);
    this.dir = dir; this.speed = speed; this.gustTimer = 0; this.gust = 0;
  }
  update(dt) {
    this.gustTimer -= dt;
    while (this.gustTimer <= 0) {
      this.gustTimer += 2;
      this.dir += this.rng.range(-0.15, 0.15);
      this.speed = Math.min(9, Math.max(0.4, this.speed + this.rng.range(-0.5, 0.5)));
      this.gustTarget = this.rng.range(0, 1);
    }
    this.gust += ((this.gustTarget || 0) - this.gust) * Math.min(1, dt);
    const tp = Math.PI * 2;
    this.dir = ((this.dir % tp) + tp) % tp;
  }
  /** Horizontal unit vector the wind blows TOWARD (x, z). */
  vec() { return { x: Math.cos(this.dir), z: Math.sin(this.dir) }; }
}

// ------------------------------------------------------------------ scent
export const SCENT_PLAYER = 1.0;
export const SCENT_CARCASS = 3.0;
export function scentForBleeding(bleedMlPerS) { return 1 + bleedMlPerS / 25; }

export class ScentField {
  constructor() { this.puffs = []; }
  emit(x, z, strength, tag, now) {
    if (strength <= 0) return;
    this.puffs.push({ x, z, s: strength, r: 2, born: now, tag });
    if (this.puffs.length > 1500) this.puffs.splice(0, this.puffs.length - 1500);
  }
  update(dt, wind, blowers = null, wash = 0) {
    const w = wind.vec();
    const decay = Math.exp(-(0.045 + wash) * dt);
    for (const p of this.puffs) {
      p.x += w.x * wind.speed * dt; p.z += w.z * wind.speed * dt;
      p.r += 0.6 * dt;
      p.s *= decay;
    }
    if (blowers) for (const b of blowers) {
      // A leaf blower physically shoves nearby scent downrange (cheap approximation).
      for (const p of this.puffs) {
        const dx = p.x - b.x, dz = p.z - b.z;
        const d = Math.hypot(dx, dz);
        if (d < b.range && (dx * b.dx + dz * b.dz) > 0) { p.x += b.dx * 8 * dt; p.z += b.dz * 8 * dt; p.s *= 0.97; }
      }
    }
    this.puffs = this.puffs.filter(p => p.s >= 0.01);
  }
  sample(x, z, tag = '') {
    let total = 0;
    for (const p of this.puffs) {
      if (tag && p.tag !== tag && !(tag === 'player' && p.tag.startsWith('player'))) continue;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d >= p.r) continue;
      total += p.s * (2 / Math.max(2, p.r)) * (1 - d / p.r);
    }
    return total;
  }
}

// ------------------------------------------------------------------ sound
export const LOUD = { gunshot: 2.5e5, chicken: 900, blower: 2500, equipment: 150, call: 400, roar: 3000, footstep: 0.5 };

export class SoundLog {
  constructor() { this.events = []; }
  emit(category, x, y, z, loudness, now, tag) {
    this.events.push({ category, x, y, z, loudness, time: now, tag });
  }
  since(t) { return this.events.filter(e => e.time > t); }
  static perceived(e, x, y, z) {
    const d = Math.max(1, Math.hypot(e.x - x, e.y - y, e.z - z));
    return e.loudness / (d * d);
  }
  expire(now, horizon = 30) { this.events = this.events.filter(e => now - e.time <= horizon); }
}

// ------------------------------------------------------------------ perception
export function visualDetection(species, ax, az, facing, tx, tz, targetSpeed, stance, cover, alert, light = 1, visibility = 1) {
  const dx = tx - ax, dz = tz - az;
  const dist = Math.hypot(dx, dz);
  const range = species.senses.visionRange * (0.45 + 0.55 * light) * visibility;
  if (dist > range) return 0;
  if (dist < 1e-6) return 1;
  let off = Math.abs(Math.atan2(dz, dx) - facing);
  off = off % (Math.PI * 2);
  if (off > Math.PI) off = Math.PI * 2 - off;
  if (off > species.senses.fov * 0.5 * Math.PI / 180) return 0;
  const proximity = 1 - dist / range;
  const motion = 0.15 + 0.85 * Math.min(1, targetSpeed / 4);
  const stanceF = stance === 'prone' ? 0.3 : stance === 'crouch' ? 0.55 : 1;
  const concealment = 1 - Math.min(0.95, Math.max(0, cover));
  return Math.min(1, proximity * motion * stanceF * concealment * (alert ? 1.6 : 1));
}

export function movementLoudness(stance, speed, veg) {
  const base = stance === 'prone' ? 0.1 : stance === 'crouch' ? 0.18 : 0.5;
  return base * Math.min(4, Math.max(0, speed / 1.6)) * (1 + veg * 1.5);
}

// ------------------------------------------------------------------ evidence
export const Clue = { Footprint: 'Footprint', BloodDrop: 'BloodDrop', BloodSmear: 'BloodSmear', BloodPool: 'BloodPool', Hair: 'Hair', Bedding: 'Bedding', Carcass: 'Carcass', Scat: 'Scat' };

/** `washed`: seconds of full-intensity rain that have fallen on the clue since it was left. */
export function clueReadability(clue, now, surface = 'soil', rain = 0, washed = 0) {
  const age = Math.max(0, now - clue.time);
  let half = 600;
  switch (clue.kind) {
    case Clue.Footprint:
      half = { mud: 1800, soil: 900, grass: 420, rock: 90, water: 5, snow: 2400 }[surface] ?? 600; break;
    case Clue.BloodDrop: case Clue.BloodSmear: half = surface === 'water' ? 8 : 1200; break;
    case Clue.BloodPool: half = 3600; break;
    case Clue.Bedding: case Clue.Scat: half = 7200; break;
    case Clue.Hair: half = 2400; break;
    case Clue.Carcass: half = 1e5; break;
  }
  if (rain > 0) {
    const blood = clue.kind.startsWith('Blood');
    half /= 1 + rain * (blood ? 8 : 3);
  }
  let read = clue.base * Math.pow(0.5, age / half);
  if (washed > 0) read *= Math.exp(-washed / (clue.kind.startsWith('Blood') ? 70 : clue.kind === Clue.Footprint ? 160 : 600));
  return Math.min(1, Math.max(0, read));
}

export function gaitFor(creature, speed, sp) {
  if (creature.mobility === 'Crawling' || creature.mobility === 'Immobile') return 'Crawl';
  if (creature.mobility === 'Limping') return 'Limp';
  if (speed > (sp.movement.trot + sp.movement.run) * 0.5) return 'Run';
  if (speed > (sp.movement.walk + sp.movement.trot) * 0.5) return 'Trot';
  return 'Walk';
}

export class Evidence {
  constructor() { this.clues = []; this.onAdd = null; this.rainAccum = 0; }
  add(c) {
    c.rainAt = this.rainAccum;
    this.clues.push(c);
    if (this.clues.length > 4000) this.clues.splice(0, 400);
    if (this.onAdd) this.onAdd(c);
  }
  nearby(x, z, r, now, minRead = 0.05, surfaceFn = null) {
    const out = [];
    const r2 = r * r;
    for (const c of this.clues) {
      const dx = c.x - x, dz = c.z - z;
      if (dx * dx + dz * dz > r2) continue;
      if (this.readability(c, now, surfaceFn ? surfaceFn(c.x, c.z) : 'soil') >= minRead) out.push(c);
    }
    return out;
  }
  readability(c, now, surface = 'soil') { return clueReadability(c, now, surface, 0, this.rainAccum - (c.rainAt || 0)); }
}

/** Per-animal emitter: footprints from real stride/gait, blood from the live wound state. */
export class SignEmitter {
  constructor(species, seed = 1) { this.sp = species; this.dist = 0; this.last = null; this.bloodAcc = 0; this.rng = new Rng(seed ^ 0x51ed); }
  update(ev, creature, x, y, z, now, dt, moving, individualId) {
    if (this.last) {
      const dx = x - this.last.x, dz = z - this.last.z;
      const moved = Math.hypot(dx, dz);
      if (moved > 1e-6 && dt > 0) {
        const speed = moved / dt;
        const gait = gaitFor(creature, speed, this.sp);
        let stride = this.sp.tracks.stride * ({ Run: 1.8, Trot: 1.3, Walk: 1, Limp: 0.6, Crawl: 0.35 })[gait];
        this.dist += moved;
        let side = this.side || 1;
        while (this.dist >= stride) {
          this.dist -= stride;
          side = -side;
          const nx = -dz / moved, nz = dx / moved;
          ev.add({ kind: Clue.Footprint, x: x + nx * 0.12 * side, y, z: z + nz * 0.12 * side, dirX: dx / moved, dirZ: dz / moved,
            time: now, base: gait === 'Run' ? 1 : 0.8, species: this.sp.id, who: individualId, gait,
            injured: gait === 'Limp' || gait === 'Crawl', printCm: this.sp.tracks.printCm, stride });
        }
        this.side = side;
      }
    }
    this.last = { x, z };

    const bleed = totalBleedRate(creature);
    if (bleed <= 0 || dt <= 0) return;
    const exit = creature.wounds.some(w => w.active && w.exitWound);
    this.bloodAcc += bleed * (exit ? 0.3 : 0.15) * dt;
    if (!moving) {
      if (this.bloodAcc >= 30) {
        ev.add({ kind: Clue.BloodPool, x, y, z, time: now, base: 1, species: this.sp.id, who: individualId, size: Math.min(1.6, 0.5 + bleed / 80) });
        this.bloodAcc = 0;
      }
      return;
    }
    // Scale ml-per-drop with animal size so a rabbit still leaves a readable trail.
    const mlPerDrop = Math.max(0.6, Math.min(4, this.sp.maxBloodVolumeMl / 1250));
    let guard = 0;
    while (this.bloodAcc >= mlPerDrop && guard++ < 6) {
      this.bloodAcc -= mlPerDrop;
      ev.add({ kind: bleed > 60 ? Clue.BloodSmear : Clue.BloodDrop, x: x + this.rng.range(-0.15, 0.15), y, z: z + this.rng.range(-0.15, 0.15),
        time: now, base: Math.min(1, 0.45 + bleed / 100), species: this.sp.id, who: individualId, heavy: bleed > 60 });
    }
  }
}
