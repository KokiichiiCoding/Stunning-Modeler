// The waterfall at the river's source: a curved sheet of scrolling water
// streaks, a churning foam ring at the bottom, drifting mist, and a roar
// that gets louder as you walk up. Presentation only.

import { THREE } from '../three.js';
import { G, paint, merge, xf, toonMat } from '../render/toon.js';
import { FALLS, WATER_LEVEL } from './terrainData.js';

const VERT = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = `
  uniform float uTime; uniform vec3 uDeep, uLight; uniform float uLight01;
  varying vec2 vUv;
  float h(float x) { return fract(sin(x * 91.7) * 43758.5); }
  void main() {
    float col = floor(vUv.x * 22.0);
    float speed = 0.9 + h(col) * 0.6;
    float s = fract(vUv.y * 5.0 + uTime * speed + h(col + 3.0));
    float streak = smoothstep(0.55, 0.62, s) * (1.0 - smoothstep(0.82, 0.95, s));
    vec3 c = mix(uDeep, uLight, 0.25 + 0.75 * streak);
    c = mix(c, vec3(1.0), smoothstep(0.75, 1.0, 1.0 - vUv.y) * 0.6);   // white-water near the bottom
    float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
    gl_FragColor = vec4(c * (0.45 + 0.55 * uLight01), 0.92 * edge);
  }`;

export class Waterfall {
  constructor(game) {
    this.game = game;
    const T = game.terrain;
    const F = FALLS;
    // the lip sits a few metres upstream of the falls line, the base just below it
    const lipX = F.x + F.dx * 5, lipZ = F.z + F.dz * 5;
    const top = T.heightAt(lipX, lipZ) + 0.3;
    const bottom = WATER_LEVEL - 0.2;
    this.base = { x: F.x - F.dx * 3, z: F.z - F.dz * 3, y: WATER_LEVEL };
    // curved sheet: rows from the lip, arcing outward as the water falls
    const W = 10, rows = 12, cols = 8;
    const pos = [], uv = [], idx = [];
    const sx = -F.dz, sz = F.dx; // across the river
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      const out = Math.sin(t * Math.PI * 0.5) * 7.5;       // overhang pushes out downstream
      const y = top + (bottom - top) * t;
      for (let c = 0; c <= cols; c++) {
        const u = c / cols - 0.5;
        const w = W * (1 + t * 0.35);
        pos.push(lipX - F.dx * out + sx * u * w, y, lipZ - F.dz * out + sz * u * w);
        uv.push(c / cols, 1 - t);
      }
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c, b = a + cols + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.uniforms = { uTime: { value: 0 }, uDeep: { value: new THREE.Color(0x3aa3d2) }, uLight: { value: new THREE.Color(0xdff7ff) }, uLight01: { value: 1 } };
    this.sheet = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    this.sheet.renderOrder = 2;
    game.scene.add(this.sheet);
    // foam ring of bobbing white blobs at the plunge pool
    const foam = [];
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * Math.PI * 2;
      foam.push(paint(xf(G.ico(0.9 + (i % 3) * 0.35, 1), [Math.cos(a) * 4.5, 0, Math.sin(a) * 3], [0, 0, 0], [1, 0.45, 1]), 0xffffff, { flat: true, bottom: 0xcfeefa }));
    }
    this.foam = new THREE.Mesh(merge(foam), toonMat({ flat: true }));
    this.foam.position.set(this.base.x, WATER_LEVEL + 0.05, this.base.z);
    this.foam.rotation.y = Math.atan2(F.dx, F.dz);
    game.scene.add(this.foam);
    this.mistT = 0;
  }

  update(dt) {
    const g = this.game;
    this.uniforms.uTime.value = g.visualTime;
    this.uniforms.uLight01.value = g.sky ? g.sky.light : 1;
    this.foam.scale.set(1 + Math.sin(g.visualTime * 3) * 0.05, 1 + Math.sin(g.visualTime * 5) * 0.2, 1 + Math.cos(g.visualTime * 3.4) * 0.05);
    const cam = g.camera.position;
    const d = Math.hypot(cam.x - this.base.x, cam.z - this.base.z);
    this.mistT -= dt;
    if (d < 260 && this.mistT <= 0) {
      this.mistT = 0.18;
      g.fx.burst(this.base.x + (Math.random() - 0.5) * 6, WATER_LEVEL + 0.6, this.base.z + (Math.random() - 0.5) * 6, { count: 1, color: 0xeef8ff, speed: 1.4, up: 1.2, kind: 'smoke', size: 0.9 });
      g.fx.burst(this.base.x, WATER_LEVEL + 0.4, this.base.z, { count: 2, color: 0xffffff, speed: 3, up: 4, kind: 'water', size: 0.12 });
    }
    if (g.audio.setFalls) g.audio.setFalls(g.state === 'play' ? Math.max(0, 1 - d / 140) : 0);
  }
}
