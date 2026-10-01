// Weather presentation: rain streaks around the camera, wet ground, rain
// hiss, and the odd lightning flash + thunder in a downpour. Purely visual;
// what weather *does* to the hunt lives in sim/weather.js.

import { THREE } from '../three.js';
import { Rng } from '../core/rng.js';

const DROPS = 2400;
const BOX = 26;   // half-width of the rain volume around the camera
const TOP = 20;

// Every drop is a camera-facing streak animated entirely on the GPU: the CPU
// only sets a few uniforms per frame, and the draw range scales with rain.
const VERT = `
  attribute vec4 aDrop;   // xyz in [0,1) of the rain box, w = fall speed
  attribute vec2 aCorner; // x: -1|1 across, y: 0 (bottom) | 1 (top)
  uniform vec3 uCam; uniform float uTime; uniform vec2 uWind; uniform float uLen;
  varying float vT;
  void main() {
    vec3 box = vec3(${(BOX * 2).toFixed(1)}, ${TOP.toFixed(1)}, ${(BOX * 2).toFixed(1)});
    vec3 p = aDrop.xyz * box;
    p.y -= uTime * aDrop.w;
    p.xz += uWind * uTime;
    vec3 base = uCam - vec3(${BOX.toFixed(1)}, 6.0, ${BOX.toFixed(1)});
    vec3 w = base + mod(p - base, box);
    vec3 dir = normalize(vec3(uWind.x, -aDrop.w, uWind.y));
    vec3 toCam = normalize(cameraPosition - w);
    vec3 side = normalize(cross(dir, toCam));
    float dist = length(cameraPosition - w);
    float width = 0.012 + dist * 0.0022;       // stays at least ~1.5 px wide far away
    w += -dir * uLen * aCorner.y + side * width * aCorner.x;
    vT = aCorner.y;
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  }`;
const FRAG = `
  uniform vec3 uColor; uniform float uOpacity;
  varying float vT;
  void main() { gl_FragColor = vec4(uColor, uOpacity * (0.25 + 0.75 * vT)); }`;

export class WeatherFX {
  constructor(game) {
    this.game = game;
    this.rng = new Rng(0x7a1);
    const drop = new Float32Array(DROPS * 4 * 4), corner = new Float32Array(DROPS * 4 * 2);
    const index = new Uint32Array(DROPS * 6);
    for (let i = 0; i < DROPS; i++) {
      const d = [this.rng.next(), this.rng.next(), this.rng.next(), this.rng.range(14, 20)];
      const cs = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
      for (let v = 0; v < 4; v++) {
        drop.set(d, (i * 4 + v) * 4);
        corner.set(cs[v], (i * 4 + v) * 2);
      }
      index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DROPS * 4 * 3), 3));
    geo.setAttribute('aDrop', new THREE.BufferAttribute(drop, 4));
    geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    this.uniforms = {
      uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uWind: { value: new THREE.Vector2() },
      uLen: { value: 0.7 }, uColor: { value: new THREE.Color(0xdbe7f5) }, uOpacity: { value: 0.5 },
    };
    this.mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 5;
    game.scene.add(this.mesh);
    this.wet = 0;
    this.flash = 0;
    this.nextBolt = 25;
    this.t = 0;
    this.dry = new THREE.Color(0xffffff);
    this.wetTint = new THREE.Color(0xa9b7c2);
  }

  update(dt, center) {
    const g = this.game, W = g.weather;
    const rain = W.rain;
    // Ground darkens as it gets wet, dries slowly afterwards.
    this.wet += ((rain > 0.2 ? 1 : 0) - this.wet) * Math.min(1, dt / (rain > 0.2 ? 20 : 90));
    if (g.terrainMesh) g.terrainMesh.material.color.copy(this.dry).lerp(this.wetTint, this.wet * 0.55);

    const active = Math.round(DROPS * Math.min(1, rain * 1.15));
    this.mesh.visible = active > 20 && g.state !== 'title';
    if (this.mesh.visible) {
      this.t = (this.t + dt) % 400;
      const U = this.uniforms;
      U.uTime.value = this.t;
      U.uCam.value.copy(g.camera.position);
      const wv = g.wind.vec(), ws = g.wind.speed * 0.7;
      U.uWind.value.set(wv.x * ws, wv.z * ws);
      U.uOpacity.value = 0.28 + 0.3 * rain;
      U.uColor.value.setRGB(0.86, 0.9, 0.96).multiplyScalar(0.45 + 0.55 * g.sky.light);
      this.mesh.geometry.setDrawRange(0, active * 6);
    }

    // Downpour: lightning somewhere nearby, thunder a moment later.
    if (rain > 0.85 && g.state === 'play') {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = this.rng.range(18, 50);
        this.flash = 1;
        const delay = this.rng.range(0.6, 3.2);
        setTimeout(() => g.audio.thunder && g.audio.thunder(1 - delay / 4), delay * 1000);
      }
    }
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 4.5);
      const f = this.flash > 0.6 || (this.flash > 0.25 && this.flash < 0.4) ? this.flash : 0;
      g.sky.hemi.intensity += f * 1.6;
    }
    if (g.audio.setRain) g.audio.setRain(g.state === 'title' ? 0 : rain);
  }
}
