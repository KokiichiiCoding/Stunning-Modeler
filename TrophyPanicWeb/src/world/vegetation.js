// Vegetation and props: chunked InstancedMeshes (one per type per chunk),
// wind-swayed in the vertex shader, plus a spatial hash of trunks and
// rocks for collision, bullet stops and line-of-sight.

import { THREE } from '../three.js';
import { G, paint, merge, xf, wobble, toonGradient } from '../render/toon.js';
import { Rng, hash01 } from '../core/rng.js';
import { Biome, HALF, WORLD_SIZE, WORLD_SEED, WATER_LEVEL, POIS } from './terrainData.js';

// ---------------------------------------------------------------- shared material
export const vegUniforms = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2(1, 0) }, uGust: { value: 0.5 } };

function swayMaterial({ flat = true, sway = 1, side = THREE.FrontSide } = {}) {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), side });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = vegUniforms.uTime;
    shader.uniforms.uWind = vegUniforms.uWind;
    shader.uniforms.uGust = vegUniforms.uGust;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec2 uWind; uniform float uGust;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
        #else
          vec3 ip = vec3(0.0);
        #endif
        float bend = max(0.0, transformed.y) * ${(0.018 * sway).toFixed(4)};
        float ph = uTime * 1.7 + ip.x * 0.13 + ip.z * 0.11;
        float s = sin(ph) * 0.6 + sin(ph * 2.3) * 0.25;
        transformed.x += (uWind.x * (0.6 + uGust) + s * 0.4) * bend;
        transformed.z += (uWind.y * (0.6 + uGust) + s * 0.4) * bend;`);
  };
  m.customProgramCacheKey = () => `sway-${flat}-${sway}-${side}`;
  return m;
}

// ---------------------------------------------------------------- geometries
function trunk(h, r, color = 0x8a5a3b) {
  return paint(xf(G.cyl(r * 0.8, r, h, 6), [0, h / 2, 0]), color, { bottom: 0x5e3b27 });
}

function puffTree(seed, canopy = 0x6cbf4a, canopyShade = 0x3f8a3a) {
  const rng = new Rng(seed);
  const parts = [trunk(3.2, 0.32)];
  const n = 4 + rng.int(0, 2);
  for (let i = 0; i < n; i++) {
    const r = rng.range(1.5, 2.3);
    const a = (i / n) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const d = i === 0 ? 0 : rng.range(0.9, 1.6);
    const y = 4.1 + rng.range(-0.3, 1.2) + (i === 0 ? 0.9 : 0);
    parts.push(paint(wobble(xf(G.ico(r, 1), [Math.cos(a) * d, y, Math.sin(a) * d]), 0.08, seed + i), canopy, { bottom: canopyShade, jitter: 0.06, seed: seed + i, flat: true }));
  }
  return merge(parts);
}

function pineTree(seed, color = 0x3f8f6a, shade = 0x245a45) {
  const rng = new Rng(seed);
  const parts = [trunk(2.2, 0.28, 0x7a4f35)];
  const tiers = 3 + rng.int(0, 1);
  let y = 1.6, r = 2.4;
  for (let i = 0; i < tiers; i++) {
    const h = 2.6 - i * 0.25;
    parts.push(paint(xf(G.cone(r, h, 7), [0, y + h / 2, 0], [0, rng.range(0, 1), 0]), color, { bottom: shade, jitter: 0.05, seed: seed + i, flat: true }));
    y += h * 0.55; r *= 0.74;
  }
  return merge(parts);
}

function birchTree(seed) {
  const rng = new Rng(seed);
  const parts = [paint(xf(G.cyl(0.18, 0.24, 4.2, 6), [0, 2.1, 0]), 0xf2eee6, { bottom: 0xd8d0c4 })];
  for (let i = 0; i < 4; i++) parts.push(paint(xf(G.cyl(0.25, 0.25, 0.12, 6), [0, 0.8 + i * 0.9 + rng.range(-0.2, 0.2), 0]), 0x3a3230));
  for (let i = 0; i < 3; i++) {
    const a = rng.range(0, 6.28);
    parts.push(paint(wobble(xf(G.ico(rng.range(1.0, 1.4), 1), [Math.cos(a) * 0.7, 4.6 + rng.range(-0.3, 0.6), Math.sin(a) * 0.7]), 0.08, seed + i), 0xd9d65a, { bottom: 0x9fb042, jitter: 0.05, seed, flat: true }));
  }
  return merge(parts);
}

function bush(seed, color = 0x5fae45, berries = false) {
  const rng = new Rng(seed);
  const parts = [];
  const n = 3 + rng.int(0, 2);
  for (let i = 0; i < n; i++) {
    const r = rng.range(0.6, 1.0);
    parts.push(paint(wobble(xf(G.ico(r, 1), [rng.range(-0.7, 0.7), r * 0.7, rng.range(-0.7, 0.7)]), 0.1, seed + i), color, { bottom: 0x3a7a36, jitter: 0.06, seed: seed + i, flat: true }));
  }
  if (berries) for (let i = 0; i < 7; i++) {
    const a = rng.range(0, 6.28);
    parts.push(paint(xf(G.sphere(0.09, 6, 4), [Math.cos(a) * rng.range(0.6, 0.95), rng.range(0.5, 1.2), Math.sin(a) * rng.range(0.6, 0.95)]), 0xe8384f));
  }
  return merge(parts);
}

function rock(seed) {
  const g = wobble(G.dodeca(1, 1), 0.22, seed);
  xf(g, [0, 0.35, 0], [0, 0, 0], [1.2, 0.75, 1.0]);
  return paint(g, 0xb9aea6, { bottom: 0x8d8390, jitter: 0.08, seed, flat: true });
}

function grassTuft(seed) {
  const rng = new Rng(seed);
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const a = rng.range(0, Math.PI);
    const h = rng.range(0.35, 0.7);
    const blade = new THREE.BufferGeometry();
    const w = 0.07;
    blade.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-w, 0, 0, w, 0, 0, 0, h, 0]), 3));
    blade.computeVertexNormals();
    xf(blade, [rng.range(-0.18, 0.18), 0, rng.range(-0.18, 0.18)], [rng.range(-0.25, 0.25), a, 0]);
    // normals point up-ish so toon lighting stays bright on both sides
    const nrm = blade.attributes.normal;
    for (let k = 0; k < 3; k++) nrm.setXYZ(k, 0, 1, 0);
    parts.push(paint(blade, 0xb5e36a, { bottom: 0x6ea83e }));
  }
  return merge(parts);
}

function flowerPatch(seed, color) {
  const rng = new Rng(seed);
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const x = rng.range(-0.4, 0.4), z = rng.range(-0.4, 0.4), h = rng.range(0.2, 0.42);
    parts.push(paint(xf(G.cyl(0.015, 0.015, h, 3), [x, h / 2, z]), 0x5f9e3a));
    for (let p = 0; p < 5; p++) {
      const a = p / 5 * 6.28;
      parts.push(paint(xf(G.sphere(0.055, 5, 3), [x + Math.cos(a) * 0.06, h, z + Math.sin(a) * 0.06], [0, 0, 0], [1, 0.5, 1]), color));
    }
    parts.push(paint(xf(G.sphere(0.04, 5, 3), [x, h + 0.02, z]), 0xffe066));
  }
  return merge(parts);
}

function reeds(seed) {
  const rng = new Rng(seed);
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const x = rng.range(-0.5, 0.5), z = rng.range(-0.5, 0.5), h = rng.range(1.1, 1.8);
    parts.push(paint(xf(G.cyl(0.025, 0.035, h, 4), [x, h / 2, z]), 0x8fbf4f, { bottom: 0x5a8a3a }));
    if (rng.chance(0.6)) parts.push(paint(xf(G.capsule(0.06, 0.22, 2, 5), [x, h + 0.05, z]), 0x7a4a2a));
  }
  return merge(parts);
}

function mushrooms(seed) {
  const rng = new Rng(seed);
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const x = rng.range(-0.3, 0.3), z = rng.range(-0.3, 0.3), s = rng.range(0.6, 1.2);
    parts.push(paint(xf(G.cyl(0.05 * s, 0.07 * s, 0.22 * s, 6), [x, 0.11 * s, z]), 0xf6efe0));
    parts.push(paint(xf(G.sphere(0.16 * s, 8, 5, 0, 6.28, 0, 1.6), [x, 0.2 * s, z], [0, 0, 0], [1, 0.75, 1]), 0xe83b3b));
    for (let d = 0; d < 3; d++) {
      const a = rng.range(0, 6.28);
      parts.push(paint(xf(G.sphere(0.03 * s, 4, 3), [x + Math.cos(a) * 0.09 * s, 0.3 * s, z + Math.sin(a) * 0.09 * s]), 0xffffff));
    }
  }
  return merge(parts);
}

function fallenLog(seed) {
  const rng = new Rng(seed);
  const l = rng.range(3, 5);
  const parts = [
    paint(xf(G.cyl(0.35, 0.4, l, 7), [0, 0.35, 0], [0, 0, Math.PI / 2]), 0x8a5a3b, { jitter: 0.05, seed }),
    paint(xf(G.cyl(0.3, 0.3, 0.02, 7), [l / 2 + 0.01, 0.35, 0], [0, 0, Math.PI / 2]), 0xe8c996),
    paint(xf(G.cyl(0.3, 0.3, 0.02, 7), [-l / 2 - 0.01, 0.35, 0], [0, 0, Math.PI / 2]), 0xe8c996),
  ];
  for (let i = 0; i < 3; i++) parts.push(paint(xf(G.ico(0.18, 0), [rng.range(-l / 2, l / 2), 0.7, rng.range(-0.1, 0.1)]), 0x6fae4a));
  return merge(parts);
}

// ---------------------------------------------------------------- far LOD templates
// Tiny indexed stand-ins (~14 verts) merged per chunk: one draw call for a
// whole distant 128 m chunk of forest.
function loTemplate(type) {
  const parts = [];
  const add = (geo, color, pos, scl) => {
    xf(geo, pos, [0, 0, 0], scl);
    parts.push({ geo, color });
  };
  const trunkGeo = () => new THREE.CylinderGeometry(0.25, 0.3, 1, 4, 1, true);
  switch (type) {
    case 'puff': add(trunkGeo(), 0x7a4f35, [0, 1.6, 0], [1, 3.2, 1]); add(new THREE.IcosahedronGeometry(2.6, 0), 0x5fae45, [0, 4.9, 0], [1, 0.85, 1]); break;
    case 'autumn': add(trunkGeo(), 0x7a4f35, [0, 1.6, 0], [1, 3.2, 1]); add(new THREE.IcosahedronGeometry(2.6, 0), 0xe8923a, [0, 4.9, 0], [1, 0.85, 1]); break;
    case 'pine': add(trunkGeo(), 0x6a4430, [0, 1.1, 0], [1, 2.2, 1]); add(new THREE.ConeGeometry(2.3, 5.6, 6, 1, true), 0x3f8a64, [0, 4.4, 0], [1, 1, 1]); break;
    case 'birch': add(trunkGeo(), 0xeeeae2, [0, 2.1, 0], [0.8, 4.2, 0.8]); add(new THREE.IcosahedronGeometry(1.5, 0), 0xcfcf55, [0, 4.8, 0], [1, 0.9, 1]); break;
    case 'bush': add(new THREE.IcosahedronGeometry(1.0, 0), 0x5aa545, [0, 0.7, 0], [1.3, 0.8, 1.3]); break;
    case 'rock': add(new THREE.OctahedronGeometry(0.9, 0), 0xaea39c, [0, 0.35, 0], [1.2, 0.7, 1]); break;
    default: return null;
  }
  // flatten to one indexed geometry with vertex colours
  let pos = [], nor = [], col = [], idx = [];
  const c = new THREE.Color();
  for (const { geo, color } of parts) {
    const g = geo;
    const base = pos.length / 3;
    c.setHex(color);
    const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i));
      nor.push(N.getX(i), N.getY(i), N.getZ(i));
      col.push(c.r, c.g, c.b);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
    else for (let i = 0; i < P.count; i++) idx.push(base + i);
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), col: new Float32Array(col), idx };
}

// ---------------------------------------------------------------- the system
const CHUNK = 128;
const NCH = WORLD_SIZE / CHUNK;
const SMALL_CHUNK = 64;
const NSMALL = WORLD_SIZE / SMALL_CHUNK;

export class Vegetation {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.colliders = new Map(); // spatial hash: key -> [{x,z,r,h,kind}]
    this.hashCell = 16;
    this.bigMat = swayMaterial({ flat: true, sway: 0.6 });
    this.rockMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
    this.smallMat = swayMaterial({ flat: false, sway: 3.0, side: THREE.DoubleSide });

    const t0 = performance.now();
    this.types = {
      puff: { geos: [puffTree(1), puffTree(3)], mat: this.bigMat, collide: 0.45, height: 6, shadow: true },
      autumn: { geos: [puffTree(4, 0xf2a43a, 0xc9622f), puffTree(5, 0xf06f5a, 0xb8443f)], mat: this.bigMat, collide: 0.45, height: 6, shadow: true },
      pine: { geos: [pineTree(6), pineTree(8, 0x4f9f78, 0x2f6a50)], mat: this.bigMat, collide: 0.4, height: 7, shadow: true },
      birch: { geos: [birchTree(9), birchTree(10)], mat: this.bigMat, collide: 0.3, height: 5.5, shadow: true },
      bush: { geos: [bush(11), bush(12, 0x72b84a, true)], mat: this.bigMat, collide: 0, height: 1.3, shadow: true, cover: true },
      rock: { geos: [rock(14), rock(16)], mat: this.rockMat, collide: 0.9, height: 1.2, shadow: true, sway: false },
      log: { geos: [fallenLog(17), fallenLog(18)], mat: this.rockMat, collide: 0, height: 0.7, shadow: true },
      reeds: { geos: [reeds(19), reeds(20)], mat: this.smallMat, collide: 0, height: 1.5, small: true },
      mush: { geos: [mushrooms(21)], mat: this.rockMat, collide: 0, height: 0.3, small: true },
      grass: { geos: [grassTuft(22), grassTuft(23), grassTuft(24)], mat: this.smallMat, collide: 0, height: 0.5, small: true, near: 70 },
      flowerW: { geos: [flowerPatch(25, 0xffffff)], mat: this.smallMat, small: true, near: 90 },
      flowerY: { geos: [flowerPatch(26, 0xffd23f)], mat: this.smallMat, small: true, near: 90 },
      flowerP: { geos: [flowerPatch(27, 0xff8fc7)], mat: this.smallMat, small: true, near: 90 },
      flowerV: { geos: [flowerPatch(28, 0xa98bff)], mat: this.smallMat, small: true, near: 90 },
    };
    this.chunks = new Map(); // `${type}|${variant}|${cx}|${cz}` -> {mesh, matrices, colors, cx, cz, small}
    this.populate();
    this.buildMeshes();
    this.buildTime = performance.now() - t0;
  }

  near(x, z, r = 0) {
    const t = this.terrain;
    for (const p of POIS) if (Math.hypot(x - p.x, z - p.z) < p.r + 6 + r) return true;
    return !t.inBounds(x, z, 8) || t.heightAt(x, z) < WATER_LEVEL + 0.25;
  }

  add(type, variant, x, z, scale, rotY, tint = 1) {
    const small = !!this.types[type].small;
    variant = variant % this.types[type].geos.length;
    const size = small ? SMALL_CHUNK : CHUNK;
    const cx = Math.floor((x + HALF) / size), cz = Math.floor((z + HALF) / size);
    const key = `${type}|${variant}|${cx}|${cz}`;
    let ch = this.chunks.get(key);
    if (!ch) { ch = { type, variant, cx, cz, small, items: [], mesh: null }; this.chunks.set(key, ch); }
    const y = this.terrain.heightAt(x, z);
    ch.items.push({ x, y, z, s: scale, r: rotY, tint: 0.9 + hash01(WORLD_SEED, Math.floor(x * 3), Math.floor(z * 3), 11) * 0.2 });
    const def = this.types[type];
    if (def.collide > 0) this.addCollider(x, z, def.collide * scale, def.height * scale, type);
    else if (def.cover) this.addCollider(x, z, 0.9 * scale, def.height * scale, type, true);
  }

  addCollider(x, z, r, h, kind, soft = false) {
    const k = `${Math.floor(x / this.hashCell)},${Math.floor(z / this.hashCell)}`;
    let arr = this.colliders.get(k);
    if (!arr) { arr = []; this.colliders.set(k, arr); }
    arr.push({ x, z, r, h, kind, soft, y: this.terrain.heightAt(x, z) });
  }

  /** Colliders within radius of (x,z). */
  query(x, z, radius, out = []) {
    out.length = 0;
    const c = this.hashCell;
    const x0 = Math.floor((x - radius) / c), x1 = Math.floor((x + radius) / c);
    const z0 = Math.floor((z - radius) / c), z1 = Math.floor((z + radius) / c);
    for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
      const arr = this.colliders.get(`${gx},${gz}`);
      if (arr) for (const o of arr) out.push(o);
    }
    return out;
  }

  populate() {
    const T = this.terrain;
    // Trees
    T.scatter(8.5, 1000, (b, x, z, r) => {
      if (this.near(x, z, 2)) return false;
      const h1 = hash01(WORLD_SEED, Math.floor(x), Math.floor(z), 5);
      const v = Math.floor(h1 * 3);
      const s = 0.8 + hash01(WORLD_SEED, Math.floor(x), Math.floor(z), 6) * 0.55;
      const rot = h1 * 6.28;
      if (b === Biome.Forest && r < 0.62) {
        if (h1 < 0.14) this.add('birch', v % 2, x, z, s, rot);
        else if (h1 < 0.27) this.add('autumn', v % 2, x, z, s, rot);
        else this.add('puff', v, x, z, s, rot);
      } else if (b === Biome.Pine && r < 0.66) {
        this.add('pine', v, x, z, s * 1.1, rot);
      } else if (b === Biome.Brush && r < 0.16) {
        this.add(h1 < 0.5 ? 'puff' : 'autumn', v % 2, x, z, s * 0.85, rot);
      } else if (b === Biome.Meadow && r < 0.035) {
        this.add(h1 < 0.3 ? 'autumn' : 'puff', v % 2, x, z, s, rot);
      } else if ((b === Biome.Ridge || b === Biome.Snow) && r < 0.1) {
        this.add('pine', v, x, z, s * 0.9, rot);
      } else if (b === Biome.Marsh && r < 0.05) {
        this.add('birch', v % 2, x, z, s * 0.9, rot);
      }
      return false;
    });
    // Bushes
    T.scatter(6, 2000, (b, x, z, r) => {
      if (this.near(x, z)) return false;
      const h1 = hash01(WORLD_SEED, Math.floor(x), Math.floor(z), 7);
      const s = 0.8 + h1 * 0.7;
      if ((b === Biome.Brush && r < 0.55) || (b === Biome.Forest && r < 0.16) || (b === Biome.Meadow && r < 0.03) || (b === Biome.Pine && r < 0.08)) {
        this.add('bush', Math.floor(h1 * 3), x, z, s, h1 * 6.28);
      }
      return false;
    });
    // Rocks
    T.scatter(18, 3000, (b, x, z, r) => {
      if (this.near(x, z, 1)) return false;
      const h1 = hash01(WORLD_SEED, Math.floor(x), Math.floor(z), 8);
      const p = b === Biome.Ridge || b === Biome.Snow ? 0.5 : b === Biome.Water ? 0 : 0.1;
      if (r < p) this.add('rock', Math.floor(h1 * 3), x, z, 0.6 + h1 * 1.8, h1 * 6.28);
      return false;
    });
    // Logs and mushrooms
    T.scatter(26, 4000, (b, x, z, r) => {
      if (this.near(x, z, 3)) return false;
      const h1 = hash01(WORLD_SEED, Math.floor(x), Math.floor(z), 9);
      if ((b === Biome.Forest || b === Biome.Pine) && r < 0.3) this.add('log', Math.floor(h1 * 2), x, z, 1, h1 * 6.28);
      return false;
    });
    T.scatter(7, 5000, (b, x, z, r) => {
      if (this.near(x, z)) return false;
      if ((b === Biome.Forest || b === Biome.Pine) && r < 0.12) this.add('mush', 0, x, z, 0.8 + r * 3, r * 50);
      return false;
    });
    // Marsh reeds
    T.scatter(3.2, 6000, (b, x, z, r) => {
      const h = T.heightAt(x, z);
      if (h < WATER_LEVEL - 0.6 || !T.inBounds(x, z, 8)) return false;
      if ((b === Biome.Marsh && r < 0.5) || (h < WATER_LEVEL + 0.8 && h > WATER_LEVEL - 0.5 && r < 0.3)) this.add('reeds', Math.floor(r * 2) % 2, x, z, 0.8 + r * 0.6, r * 30);
      return false;
    });
    // Grass tufts and wildflowers
    T.scatter(2.3, 7000, (b, x, z, r) => {
      if (this.near(x, z)) return false;
      const dens = b === Biome.Meadow ? 0.75 : b === Biome.Brush ? 0.6 : b === Biome.Forest ? 0.4 : b === Biome.Marsh ? 0.5 : b === Biome.Pine ? 0.2 : 0;
      if (r < dens) this.add('grass', Math.floor(r * 30) % 3, x, z, 0.8 + (r * 7 % 1) * 0.7, r * 40);
      return false;
    });
    T.scatter(4.5, 8000, (b, x, z, r) => {
      if (this.near(x, z)) return false;
      if (b === Biome.Meadow && r < 0.22) {
        const k = ['flowerW', 'flowerY', 'flowerP', 'flowerV'][Math.floor(r * 100) % 4];
        this.add(k, 0, x, z, 0.9 + r, r * 60);
      } else if (b === Biome.Forest && r < 0.05) this.add('flowerW', 0, x, z, 1, r * 60);
      return false;
    });
  }

  buildMeshes() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    this.instanceCount = 0;
    for (const ch of this.chunks.values()) {
      const def = this.types[ch.type];
      const geo = def.geos[ch.variant % def.geos.length];
      const mesh = new THREE.InstancedMesh(geo, def.mat, ch.items.length);
      ch.items.forEach((it, i) => {
        q.setFromAxisAngle(up, it.r);
        m.compose(p.set(it.x, it.y - 0.05, it.z), q, s.set(it.s, it.s, it.s));
        mesh.setMatrixAt(i, m);
        const k = 0.9 + hash01(WORLD_SEED, Math.floor(it.x * 3), Math.floor(it.z * 3), 11) * 0.2;
        mesh.setColorAt(i, col.setRGB(k, k, k));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = !!def.shadow;
      mesh.receiveShadow = !def.small;
      mesh.computeBoundingSphere();
      mesh.frustumCulled = true;
      const size = ch.small ? SMALL_CHUNK : CHUNK;
      ch.center = new THREE.Vector3(-HALF + (ch.cx + 0.5) * size, 0, -HALF + (ch.cz + 0.5) * size);
      ch.near = def.near || (ch.small ? 110 : 560);
      ch.mesh = mesh;
      this.instanceCount += ch.items.length;
      this.scene.add(mesh);
    }
    this.buildFarChunks();
  }

  buildFarChunks() {
    const templates = {};
    const byChunk = new Map();
    for (const ch of this.chunks.values()) {
      if (ch.small) continue;
      const t = templates[ch.type] !== undefined ? templates[ch.type] : (templates[ch.type] = loTemplate(ch.type));
      if (!t) continue;
      const key = `${ch.cx}|${ch.cz}`;
      let list = byChunk.get(key);
      if (!list) { list = { cx: ch.cx, cz: ch.cz, items: [] }; byChunk.set(key, list); }
      for (const it of ch.items) list.items.push({ t, it });
    }
    this.far = [];
    const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
    const v = new THREE.Vector3(), n = new THREE.Vector3();
    for (const fc of byChunk.values()) {
      let vc = 0, ic = 0;
      for (const { t } of fc.items) { vc += t.pos.length / 3; ic += t.idx.length; }
      const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), col = new Float32Array(vc * 3);
      const idx = new Uint32Array(ic);
      let vo = 0, io = 0;
      for (const { t, it } of fc.items) {
        const cs = Math.cos(it.r), sn = Math.sin(it.r);
        const k = it.tint || 1;
        const nv = t.pos.length / 3;
        for (let i = 0; i < nv; i++) {
          const x = t.pos[i * 3] * it.s, y = t.pos[i * 3 + 1] * it.s, z = t.pos[i * 3 + 2] * it.s;
          pos[(vo + i) * 3] = it.x + x * cs + z * sn;
          pos[(vo + i) * 3 + 1] = it.y - 0.05 + y;
          pos[(vo + i) * 3 + 2] = it.z - x * sn + z * cs;
          const nx = t.nor[i * 3], ny = t.nor[i * 3 + 1], nz = t.nor[i * 3 + 2];
          nor[(vo + i) * 3] = nx * cs + nz * sn; nor[(vo + i) * 3 + 1] = ny; nor[(vo + i) * 3 + 2] = -nx * sn + nz * cs;
          col[(vo + i) * 3] = t.col[i * 3] * k; col[(vo + i) * 3 + 1] = t.col[i * 3 + 1] * k; col[(vo + i) * 3 + 2] = t.col[i * 3 + 2] * k;
        }
        for (let i = 0; i < t.idx.length; i++) idx[io + i] = vo + t.idx[i];
        vo += nv; io += t.idx.length;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = false; mesh.castShadow = false;
      mesh.visible = false;
      this.scene.add(mesh);
      this.far.push({ mesh, center: new THREE.Vector3(-HALF + (fc.cx + 0.5) * CHUNK, 0, -HALF + (fc.cz + 0.5) * CHUNK) });
    }
  }

  /** Distance culling around the camera; call a few times per second. */
  cull(cam, fogFar) {
    const LOD = this.lodDistance || 170;
    for (const ch of this.chunks.values()) {
      const dx = ch.center.x - cam.x, dz = ch.center.z - cam.z;
      const dc = Math.hypot(dx, dz);
      if (ch.small) ch.mesh.visible = dc - SMALL_CHUNK * 0.72 < ch.near;
      else ch.mesh.visible = dc < LOD;   // full detail near the hunter
    }
    for (const f of this.far) {
      const dc = Math.hypot(f.center.x - cam.x, f.center.z - cam.z);
      f.mesh.visible = dc >= LOD && dc - CHUNK * 0.72 < fogFar + 40;
    }
  }

  /** Does a straight segment at height pass through a trunk/rock? Returns t in [0,1] or -1. */
  segmentBlocked(ax, ay, az, bx, by, bz, ignoreSoft = true) {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    let best = -1;
    for (const o of this.query(mx, mz, len / 2 + 2, this._tmp || (this._tmp = []))) {
      if (ignoreSoft && o.soft) continue;
      // closest approach of segment to circle centre
      const t = len > 0 ? Math.max(0, Math.min(1, ((o.x - ax) * dx + (o.z - az) * dz) / (len * len))) : 0;
      const px = ax + dx * t, pz = az + dz * t;
      if (Math.hypot(px - o.x, pz - o.z) < o.r) {
        const py = ay + (by - ay) * t;
        if (py < o.y + o.h && py > o.y - 0.5 && (best < 0 || t < best)) best = t;
      }
    }
    return best;
  }
}
