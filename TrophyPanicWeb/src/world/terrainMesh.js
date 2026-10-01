// Renders the reserve's heightfield as one soft, vertex-coloured toon mesh.

import { THREE } from '../three.js';
import { toonGradient } from '../render/toon.js';
import { GRID, CELL, HALF, Biome, WORLD_SEED, WATER_LEVEL } from './terrainData.js';
import { hash01, valueNoise } from '../core/rng.js';

// Palette: saturated, sunny, slightly warm — original to Trophy Panic.
export const BIOME_COLORS = {
  [Biome.Meadow]: 0x9ccf5c,
  [Biome.Forest]: 0x6fae4a,
  [Biome.Pine]: 0x4f9163,
  [Biome.Marsh]: 0x86a454,
  [Biome.Brush]: 0x8fb046,
  [Biome.Ridge]: 0xb5a79a,
  [Biome.Water]: 0x8fb89a,
  [Biome.Sand]: 0xe9d49a,
  [Biome.Snow]: 0xf3f6ff,
  [Biome.Trail]: 0xcfa66c,
};

export function buildTerrainMesh(data) {
  const N = GRID;
  const pos = new Float32Array(N * N * 3);
  const col = new Float32Array(N * N * 3);
  const base = {};
  for (const k in BIOME_COLORS) base[k] = new THREE.Color(BIOME_COLORS[k]);
  const c = new THREE.Color();
  const tmp = new THREE.Color();

  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const i = iz * N + ix;
      const x = -HALF + ix * CELL, z = -HALF + iz * CELL;
      const h = data.heights[i];
      pos[i * 3] = x; pos[i * 3 + 1] = h; pos[i * 3 + 2] = z;

      // Soft biome blend: average the 3x3 neighbourhood.
      c.setRGB(0, 0, 0);
      let n = 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const jx = Math.min(N - 1, Math.max(0, ix + dx)), jz = Math.min(N - 1, Math.max(0, iz + dz));
          const b = data.biomes[jz * N + jx];
          tmp.copy(base[b]);
          c.r += tmp.r; c.g += tmp.g; c.b += tmp.b; n++;
        }
      }
      c.multiplyScalar(1 / n);
      // Painterly variation: large soft patches + per-vertex speckle.
      const patch = valueNoise(WORLD_SEED, x / 38, z / 38, 401) - 0.5;
      const speck = hash01(WORLD_SEED, ix, iz, 402) - 0.5;
      c.offsetHSL(patch * 0.03, patch * 0.08, patch * 0.07 + speck * 0.03);
      // Underwater: sink toward a cool teal so shallows read through the water.
      if (h < WATER_LEVEL) {
        const d = Math.min(1, (WATER_LEVEL - h) / 4);
        c.lerp(tmp.setHex(0x3f8f95), d * 0.7);
      }
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
  }

  // Triangulation must match TerrainData.heightAt(): diagonal from (x1,z0) to (x0,z1).
  const idx = new Uint32Array((N - 1) * (N - 1) * 6);
  let k = 0;
  for (let iz = 0; iz < N - 1; iz++) {
    for (let ix = 0; ix < N - 1; ix++) {
      const a = iz * N + ix, b = a + 1, d = a + N, e = d + 1;
      idx[k++] = a; idx[k++] = d; idx[k++] = b;
      idx[k++] = d; idx[k++] = e; idx[k++] = b;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

/** Height texture for the water shader's shoreline foam. */
export function buildHeightTexture(data) {
  const tex = new THREE.DataTexture(data.heights, GRID, GRID, THREE.RedFormat, THREE.FloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
