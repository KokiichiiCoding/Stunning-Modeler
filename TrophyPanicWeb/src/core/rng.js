// Seeded randomness. Every probabilistic system takes one of these (or a
// hash) explicitly, never Math.random(), so a hunt stays reproducible from
// its seed — the same rule as the C++ engine's tp::Rng.

export class Rng {
  constructor(seed = 1) {
    // sfc32 state seeded through splitmix32 so small/adjacent seeds diverge.
    let s = (seed >>> 0) || 0x9e3779b9;
    const next = () => {
      s = (s + 0x9e3779b9) >>> 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.a = next(); this.b = next(); this.c = next(); this.d = next();
    for (let i = 0; i < 12; i++) this.u32();
  }
  u32() {
    let { a, b, c, d } = this;
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return t;
  }
  /** [0, 1) */
  next() { return this.u32() / 4294967296; }
  range(lo, hi) { return hi <= lo ? lo : lo + this.next() * (hi - lo); }
  int(lo, hiInclusive) { return lo + Math.floor(this.next() * (hiInclusive - lo + 1)); }
  chance(p) { return p <= 0 ? false : p >= 1 ? true : this.next() < p; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  /** Weighted pick from [{w, v}] */
  weighted(items) {
    let total = 0;
    for (const it of items) total += it.w;
    let r = this.next() * total;
    for (const it of items) { if ((r -= it.w) <= 0) return it.v; }
    return items[items.length - 1].v;
  }
}

/** Order-independent hash -> [0,1) for (seed, x, y, salt). Terrain and
 *  scatter use this so the map depends only on coordinates, never on the
 *  order things were generated in. */
export function hash01(seed, x, y, salt = 0) {
  let h = (seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

function smooth(t) { return t * t * (3 - 2 * t); }

/** Smoothed value noise in [0,1). */
export function valueNoise(seed, x, y, salt = 0) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const tx = smooth(x - x0), ty = smooth(y - y0);
  const a = hash01(seed, x0, y0, salt), b = hash01(seed, x0 + 1, y0, salt);
  const c = hash01(seed, x0, y0 + 1, salt), d = hash01(seed, x0 + 1, y0 + 1, salt);
  const top = a + (b - a) * tx, bot = c + (d - c) * tx;
  return top + (bot - top) * ty;
}

/** Fractal (fBm) value noise in roughly [0,1). */
export function fbm(seed, x, y, octaves = 4, salt = 0) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(seed, x * freq, y * freq, salt + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}
