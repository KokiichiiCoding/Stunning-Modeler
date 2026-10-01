// Shared look: soft cel shading, chunky ink outlines on characters, vertex
// coloured low-poly geometry. Original style — inspired by cosy outdoor
// comedy games, built entirely from primitives in code.

import { THREE } from '../three.js';

let gradientMap = null;
export function toonGradient() {
  if (gradientMap) return gradientMap;
  // Four soft steps; the darkest band stays warm and bright so shadows
  // never go muddy.
  const steps = [118, 176, 222, 255];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => { data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255; });
  gradientMap = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;
  return gradientMap;
}

const matCache = new Map();
/** Vertex-coloured toon material (shared). */
export function toonMat({ flat = false, transparent = false, opacity = 1, side = THREE.FrontSide, emissive = 0x000000 } = {}) {
  // (MeshToonMaterial has no flatShading in r159: faceting is baked into
  // geometry normals via paint(..., { flat: true }) instead.)
  const key = `${flat}|${transparent}|${opacity}|${side}|${emissive}`;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshToonMaterial({
    vertexColors: true, gradientMap: toonGradient(),
    transparent, opacity, side, emissive,
  });
  matCache.set(key, m);
  return m;
}

export function solidToon(color, opts = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...opts });
}

// --- ink outlines (inverted hull) --------------------------------------

const outlineMats = new Map();
export function outlineMaterial(thickness = 0.025, color = 0x2a1f2e) {
  // Quantise so a handful of materials cover every creature; all of them
  // share ONE shader program (thickness is a per-material uniform).
  thickness = Math.max(0.008, Math.round(thickness / 0.004) * 0.004);
  const key = `${thickness}|${color}`;
  if (outlineMats.has(key)) return outlineMats.get(key);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uThickness = { value: thickness };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uThickness;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * uThickness;');
  };
  m.customProgramCacheKey = () => 'tp-outline-v1';
  outlineMats.set(key, m);
  return m;
}

/** Adds an ink outline child to a mesh. */
export function addOutline(mesh, thickness = 0.025, color = 0x2a1f2e) {
  const o = new THREE.Mesh(mesh.geometry, outlineMaterial(thickness, color));
  o.name = 'outline';
  o.castShadow = false;
  o.receiveShadow = false;
  o.raycast = () => {};
  mesh.add(o);
  return o;
}

// --- geometry assembly -------------------------------------------------

const _c = new THREE.Color();
/** Paint a geometry with a single vertex colour (optionally a vertical
 *  gradient from `bottom` to `color`). Returns a non-indexed copy. */
export function paint(geo, color, { bottom = null, gradientAxis = 1, jitter = 0, seed = 1, flat = false } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (flat) g.computeVertexNormals(); // non-indexed -> per-face normals = faceted
  const pos = g.attributes.position;
  const n = pos.count;
  const col = new Float32Array(n * 3);
  let min = Infinity, max = -Infinity;
  if (bottom !== null) {
    for (let i = 0; i < n; i++) { const v = pos.getComponent(i, gradientAxis); min = Math.min(min, v); max = Math.max(max, v); }
  }
  const top = new THREE.Color(color);
  const bot = bottom !== null ? new THREE.Color(bottom) : null;
  let s = seed;
  for (let i = 0; i < n; i++) {
    _c.copy(top);
    if (bot) {
      const t = max > min ? (pos.getComponent(i, gradientAxis) - min) / (max - min) : 1;
      _c.lerpColors(bot, top, t);
    }
    if (jitter > 0) {
      // Per-face jitter (3 verts share it) for a hand-painted feel.
      if (i % 3 === 0) { s = (s * 16807) % 2147483647; }
      const j = ((s % 1000) / 1000 - 0.5) * jitter;
      _c.offsetHSL(0, 0, j);
    }
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

/** Merge non-indexed, painted geometries (after applying their matrices). */
export function merge(parts) {
  let total = 0;
  for (const p of parts) total += p.attributes.position.count;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  for (const p of parts) {
    const n = p.attributes.position.count;
    pos.set(p.attributes.position.array, o * 3);
    if (p.attributes.normal) nor.set(p.attributes.normal.array, o * 3);
    if (p.attributes.color) col.set(p.attributes.color.array, o * 3);
    else col.fill(1, o * 3, (o + n) * 3);
    o += n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
/** Transform a geometry in place: position, euler rotation, scale. */
export function xf(geo, [x = 0, y = 0, z = 0] = [], [rx = 0, ry = 0, rz = 0] = [], [sx = 1, sy = sx, sz = sx] = []) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _s.set(sx, sy, sz);
  _p.set(x, y, z);
  _m.compose(_p, _q, _s);
  geo.applyMatrix4(_m);
  return geo;
}

// Primitive shorthands (all return fresh geometries).
export const G = {
  sphere: (r = 1, w = 12, h = 9, ...rest) => new THREE.SphereGeometry(r, w, h, ...rest),
  ico: (r = 1, d = 1) => new THREE.IcosahedronGeometry(r, d),
  box: (x = 1, y = 1, z = 1) => new THREE.BoxGeometry(x, y, z),
  cyl: (rt = 0.5, rb = 0.5, h = 1, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg),
  cone: (r = 0.5, h = 1, seg = 8) => new THREE.ConeGeometry(r, h, seg),
  capsule: (r = 0.5, len = 1, cap = 4, seg = 8) => new THREE.CapsuleGeometry(r, len, cap, seg),
  torus: (r = 1, t = 0.2, rs = 6, ts = 12, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc),
  dodeca: (r = 1, d = 0) => new THREE.DodecahedronGeometry(r, d),
  circle: (r = 1, seg = 16) => new THREE.CircleGeometry(r, seg),
};

/** Paint + transform in one call: part(G.sphere(0.3), 0xffffff, [x,y,z], [rx,ry,rz], [sx,sy,sz]) */
export function part(geo, color, p, r, s, paintOpts) {
  return paint(xf(geo, p, r, s), color, paintOpts);
}

/** Wobbly noise deform (for rocks, canopies). Mutates and returns geo. */
export function wobble(geo, amount = 0.15, seed = 1) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const k = Math.sin(v.x * 3.1 + seed) * Math.cos(v.y * 2.7 + seed * 1.3) * Math.sin(v.z * 2.3 + seed * 0.7);
    v.multiplyScalar(1 + k * amount);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}
