// The reserve: a fixed, seeded 1 km² map ("Wobblewood Reserve"). Pure
// data (no three.js) so the simulation, AI and tests can query it headless.
// Coordinates: x east, z south (-z is north), y up, meters.

import { fbm, valueNoise, hash01 } from '../core/rng.js';

export const WORLD_SEED = 20260927;
export const WORLD_SIZE = 1024;
export const HALF = WORLD_SIZE / 2;
export const GRID = 257;               // vertices per side
export const CELL = WORLD_SIZE / (GRID - 1); // 4 m
export const WATER_LEVEL = 4.0;

export const Biome = { Meadow: 0, Forest: 1, Pine: 2, Marsh: 3, Brush: 4, Ridge: 5, Water: 6, Sand: 7, Snow: 8, Trail: 9 };
export const BIOME_NAMES = ['meadow', 'forest', 'pine', 'marsh', 'brush', 'ridge', 'water', 'sand', 'snow', 'trail'];
// Concealment offered to a hunter standing in each biome (perception input).
export const BIOME_COVER = [0.15, 0.5, 0.55, 0.45, 0.75, 0.1, 0.0, 0.05, 0.05, 0.05];
// Movement cost multipliers.
export const BIOME_COST = [1.0, 1.15, 1.2, 1.5, 1.45, 1.3, 2.8, 1.1, 1.4, 0.9];

export const LAKE = { x: -170, z: 150, r: 110 };
export const RIVER = [
  [390, -505], [330, -420], [360, -330], [280, -250], [210, -200], [220, -110],
  [140, -40], [60, -10], [0, 40], [-60, 70], [-110, 110],
];

// The river pours off a cliff step near its source (see the waterfall in world/waterfall.js).
export const FALLS = (() => {
  const [a, b] = [RIVER[0], RIVER[1]];
  const l = Math.hypot(a[0] - b[0], a[1] - b[1]);
  return { x: a[0] + (b[0] - a[0]) * 0.3, z: a[1] + (b[1] - a[1]) * 0.3, dx: (a[0] - b[0]) / l, dz: (a[1] - b[1]) / l, drop: 16 };
})();

export const POIS = [
  { id: 'lodge', name: 'Wobblewood Lodge', x: 330, z: 330, r: 34, kind: 'lodge' },
  { id: 'outpost_moss', name: 'Mossbottom Outpost', x: -360, z: -260, r: 18, kind: 'outpost' },
  { id: 'outpost_lake', name: 'Lakeside Outpost', x: -330, z: 330, r: 18, kind: 'outpost' },
  { id: 'outpost_ridge', name: 'Ridge Hut', x: 60, z: -330, r: 18, kind: 'outpost' },
  { id: 'outpost_bog', name: 'Bog Stand', x: 300, z: -40, r: 16, kind: 'outpost' },
];

export const TRAILS = [
  ['lodge', 'outpost_bog'], ['lodge', 'outpost_lake'], ['outpost_bog', 'outpost_ridge'],
  ['outpost_ridge', 'outpost_moss'], ['outpost_moss', 'outpost_lake'],
];

const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = Math.min(1, Math.max(0, t));
  const cx = ax + dx * t - px, cz = az + dz * t - pz;
  return { d: Math.sqrt(cx * cx + cz * cz), t };
}

function polyDist(px, pz, pts) {
  let best = Infinity, prog = 0;
  let acc = 0, total = 0;
  const lens = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    lens.push(l); total += l;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const r = segDist(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
    if (r.d < best) { best = r.d; prog = (acc + r.t * lens[i]) / total; }
    acc += lens[i];
  }
  return { d: best, progress: prog };
}

const poiById = Object.fromEntries(POIS.map(p => [p.id, p]));

function trailPoints(a, b) {
  // A gently wiggling path between two POIs (deterministic).
  const A = poiById[a], B = poiById[b];
  const pts = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = lerp(A.x, B.x, t), z = lerp(A.z, B.z, t);
    const nx = -(B.z - A.z), nz = B.x - A.x;
    const nl = Math.hypot(nx, nz) || 1;
    const w = (i === 0 || i === n) ? 0 : (valueNoise(WORLD_SEED, t * 3, a.length + b.length, 91) - 0.5) * 70;
    pts.push([x + nx / nl * w, z + nz / nl * w]);
  }
  return pts;
}
export const TRAIL_POLYS = TRAILS.map(([a, b]) => trailPoints(a, b));

/** Raw analytic height (before gridding). */
export function rawHeight(x, z) {
  const s = WORLD_SEED;
  let h = 7 + fbm(s, x / 250 + 40, z / 250 + 40, 5, 1) * 30 - 8;
  // gentle high-frequency lumps
  h += (fbm(s, x / 45, z / 45, 3, 7) - 0.5) * 3.2;

  // Northern ridges: ridged noise that rises toward the north edge.
  const north = smoothstep(-120, -460, z);
  if (north > 0) {
    const rn = 1 - Math.abs(2 * fbm(s, x / 140, z / 140, 4, 13) - 1);
    h += north * (18 + rn * rn * 52);
  }
  // Western hills
  h += smoothstep(-200, -480, x) * 14 * fbm(s, x / 90, z / 90, 3, 21);

  // Lake basin (wobbly shoreline).
  const lx = x - LAKE.x, lz = z - LAKE.z;
  const ld = Math.hypot(lx, lz);
  const ang = Math.atan2(lz, lx);
  const R = LAKE.r * (0.82 + 0.36 * valueNoise(s, Math.cos(ang) * 2 + 5, Math.sin(ang) * 2 + 5, 31));
  if (ld < R + 90) {
    const bowl = WATER_LEVEL - 5 + Math.pow(ld / R, 1.6) * 5.6;
    h = lerp(h, Math.min(h, bowl), smoothstep(R + 90, R - 5, ld));
  }

  // River canyon from the northern ridge into the lake.
  const rd = polyDist(x, z, RIVER);
  const w = 6 + rd.progress * 7;
  if (rd.d < w + 55) {
    const bank = WATER_LEVEL + 0.8 + Math.max(0, rd.d - w) * 0.35;
    const bed = WATER_LEVEL - 2.2 + rd.d / w * 1.4;
    const target = rd.d < w ? bed : bank;
    h = lerp(h, Math.min(h, target), smoothstep(w + 55, w, rd.d) * 0.98);
  }

  // Waterfall cliff: everything upstream of the falls is lifted onto a ledge.
  {
    const fx = x - FALLS.x, fz = z - FALLS.z;
    const along = fx * FALLS.dx + fz * FALLS.dz;
    const across = Math.abs(-fx * FALLS.dz + fz * FALLS.dx);
    if (along > -4 && across < 75) h += FALLS.drop * smoothstep(-1, 6, along) * smoothstep(75, 40, across);
  }

  // Flatten pads for the lodge and outposts.
  for (const p of POIS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r + 30) h = lerp(h, poiBase(p), smoothstep(p.r + 30, p.r, d));
  }

  // Raised rim so the reserve reads as a valley with a natural edge.
  const edge = Math.max(Math.abs(x), Math.abs(z));
  if (edge > 440) h += Math.pow((edge - 440) / 72, 2) * 38;
  return h;
}

const poiBaseCache = {};
function poiBase(p) {
  if (poiBaseCache[p.id] !== undefined) return poiBaseCache[p.id];
  // Sample the un-flattened landscape around the pad centre.
  const s = WORLD_SEED;
  let h = 7 + fbm(s, p.x / 250 + 40, p.z / 250 + 40, 5, 1) * 30 - 8;
  const north = smoothstep(-120, -460, p.z);
  if (north > 0) {
    const rn = 1 - Math.abs(2 * fbm(s, p.x / 140, p.z / 140, 4, 13) - 1);
    h += north * (18 + rn * rn * 52);
  }
  poiBaseCache[p.id] = Math.max(WATER_LEVEL + 2.5, h);
  return poiBaseCache[p.id];
}

export class TerrainData {
  constructor() {
    const N = GRID;
    this.heights = new Float32Array(N * N);
    this.biomes = new Uint8Array(N * N);
    this.moisture = new Float32Array(N * N);
    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        const x = -HALF + ix * CELL, z = -HALF + iz * CELL;
        this.heights[iz * N + ix] = rawHeight(x, z);
      }
    }
    // Biomes need slope, so assign after heights exist.
    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        const x = -HALF + ix * CELL, z = -HALF + iz * CELL;
        const i = iz * N + ix;
        this.biomes[i] = this.classify(x, z, ix, iz);
      }
    }
  }

  slopeAt(ix, iz) {
    const N = GRID;
    const c = (a, b) => this.heights[Math.min(N - 1, Math.max(0, b)) * N + Math.min(N - 1, Math.max(0, a))];
    const dx = (c(ix + 1, iz) - c(ix - 1, iz)) / (2 * CELL);
    const dz = (c(ix, iz + 1) - c(ix, iz - 1)) / (2 * CELL);
    return Math.hypot(dx, dz);
  }

  classify(x, z, ix, iz) {
    const s = WORLD_SEED;
    const h = this.heights[iz * GRID + ix];
    if (h < WATER_LEVEL - 0.15) return Biome.Water;
    const slope = this.slopeAt(ix, iz);
    const m = fbm(s, x / 170 + 9, z / 170 + 9, 4, 5);
    this.moisture[iz * GRID + ix] = m;
    for (const poly of TRAIL_POLYS) {
      if (polyDist(x, z, poly).d < 2.6) return Biome.Trail;
    }
    for (const p of POIS) if (Math.hypot(x - p.x, z - p.z) < p.r * 0.8) return Biome.Trail;
    if (h < WATER_LEVEL + 0.9) return m > 0.52 ? Biome.Marsh : Biome.Sand;
    if (h > 96) return Biome.Snow;
    if (slope > 0.85 || h > 70) return Biome.Ridge;
    const lakeD = Math.hypot(x - LAKE.x, z - LAKE.z);
    if (lakeD < LAKE.r + 70 && m > 0.45 && h < WATER_LEVEL + 6) return Biome.Marsh;
    if (h > 34 || (z < -180 && m > 0.45)) return Biome.Pine;
    if (m > 0.56) return Biome.Forest;
    if (m > 0.47 && valueNoise(s, x / 60, z / 60, 77) > 0.55) return Biome.Brush;
    if (m < 0.36 && valueNoise(s, x / 80, z / 80, 78) > 0.6) return Biome.Brush;
    return Biome.Meadow;
  }

  /** Triangle-exact height matching the rendered mesh triangulation. */
  heightAt(x, z) {
    const N = GRID;
    let fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
    fx = Math.min(N - 1.0001, Math.max(0, fx));
    fz = Math.min(N - 1.0001, Math.max(0, fz));
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const H = this.heights;
    const h00 = H[iz * N + ix], h10 = H[iz * N + ix + 1];
    const h01 = H[(iz + 1) * N + ix], h11 = H[(iz + 1) * N + ix + 1];
    if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz;
    return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
  }

  normalAt(x, z, out = { x: 0, y: 1, z: 0 }) {
    const e = 1.0;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    let nx = hl - hr, ny = 2 * e, nz = hd - hu;
    const l = Math.hypot(nx, ny, nz);
    out.x = nx / l; out.y = ny / l; out.z = nz / l;
    return out;
  }

  biomeAt(x, z) {
    const ix = Math.round((x + HALF) / CELL), iz = Math.round((z + HALF) / CELL);
    if (ix < 0 || iz < 0 || ix >= GRID || iz >= GRID) return Biome.Ridge;
    return this.biomes[iz * GRID + ix];
  }

  moistureAt(x, z) {
    const ix = Math.round((x + HALF) / CELL), iz = Math.round((z + HALF) / CELL);
    if (ix < 0 || iz < 0 || ix >= GRID || iz >= GRID) return 0.5;
    return this.moisture[iz * GRID + ix];
  }

  isWater(x, z) { return this.heightAt(x, z) < WATER_LEVEL - 0.1; }
  waterDepth(x, z) { return Math.max(0, WATER_LEVEL - this.heightAt(x, z)); }
  coverAt(x, z) { return BIOME_COVER[this.biomeAt(x, z)]; }
  costAt(x, z) { return BIOME_COST[this.biomeAt(x, z)]; }
  inBounds(x, z, margin = 20) { return Math.abs(x) < HALF - margin && Math.abs(z) < HALF - margin; }

  /** Seeded scatter helper: points on a jittered grid whose biome passes `accept`. */
  scatter(cellSize, salt, accept) {
    const out = [];
    const n = Math.floor(WORLD_SIZE / cellSize);
    for (let gz = 0; gz < n; gz++) {
      for (let gx = 0; gx < n; gx++) {
        const x = -HALF + (gx + hash01(WORLD_SEED, gx, gz, salt)) * cellSize;
        const z = -HALF + (gz + hash01(WORLD_SEED, gx, gz, salt + 1)) * cellSize;
        const r = hash01(WORLD_SEED, gx, gz, salt + 2);
        const b = this.biomeAt(x, z);
        const res = accept(b, x, z, r);
        if (res) out.push({ x, z, r, b, kind: res === true ? null : res });
      }
    }
    return out;
  }
}
