// Sky dome, sun/moon lighting, fog and a 24-hour day cycle. The cycle's
// "period" (dawn/day/dusk/night) drives animal activity and predator boldness.

import { THREE } from '../three.js';
import { G, paint, merge, xf, toonMat } from '../render/toon.js';
import { Rng } from '../core/rng.js';

const KEYS = [
  // hour, sky top, horizon, sun colour, sun intensity, hemi intensity, hemi sky, hemi ground
  [0.0, 0x0c1638, 0x23305e, 0x8fa8ff, 0.22, 0.42, 0x3a4c8a, 0x1b2230],
  [4.8, 0x14204a, 0x3a3f72, 0x8fa8ff, 0.2, 0.42, 0x3a4c8a, 0x1b2230],
  [5.8, 0x3b4f98, 0xf2a08c, 0xffb38a, 0.55, 0.6, 0x9aa6d8, 0x4a4038],
  [7.0, 0x69b8f5, 0xffd6a6, 0xffd9a8, 1.15, 0.75, 0xbfe0ff, 0x6a6a4a],
  [9.5, 0x55b3fa, 0xd6f1ff, 0xfff4e0, 1.45, 0.82, 0xcfeaff, 0x6f7a4c],
  [15.5, 0x58b1f5, 0xdff2ff, 0xfff1dc, 1.4, 0.8, 0xcfeaff, 0x6f7a4c],
  [18.0, 0x5d98e0, 0xffd4a0, 0xffc28a, 1.05, 0.72, 0xe8d8ff, 0x6a5a48],
  [19.2, 0x4a5fb0, 0xff8f78, 0xff8a66, 0.6, 0.6, 0xd0a8e0, 0x4a3a40],
  [20.4, 0x1d2a66, 0x5d4c8c, 0x9aa8ff, 0.28, 0.46, 0x5a5a9a, 0x252538],
  [24.0, 0x0c1638, 0x23305e, 0x8fa8ff, 0.22, 0.42, 0x3a4c8a, 0x1b2230],
];

function sampleKeys(hour) {
  let a = KEYS[0], b = KEYS[1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (hour >= KEYS[i][0] && hour <= KEYS[i + 1][0]) { a = KEYS[i]; b = KEYS[i + 1]; break; }
  }
  const t = (hour - a[0]) / Math.max(1e-6, b[0] - a[0]);
  const c = (i) => new THREE.Color(a[i]).lerp(new THREE.Color(b[i]), t);
  const n = (i) => a[i] + (b[i] - a[i]) * t;
  return { top: c(1), horizon: c(2), sun: c(3), sunI: n(4), hemiI: n(5), hemiSky: c(6), hemiGround: c(7) };
}

export function periodFor(hour) {
  if (hour >= 5.2 && hour < 8.5) return 'dawn';
  if (hour >= 8.5 && hour < 17.5) return 'day';
  if (hour >= 17.5 && hour < 20.8) return 'dusk';
  return 'night';
}

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = {
      uTop: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color() },
      uNight: { value: 0 },
    };
    const domeGeo = new THREE.SphereGeometry(1800, 32, 16);
    const domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.uniforms,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `
        uniform vec3 uTop, uHorizon, uSunDir, uSunColor; uniform float uNight; varying vec3 vDir;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
        void main(){
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 col = mix(uHorizon, uTop, pow(max(h, 0.0), 0.55));
          if (h < 0.0) col = mix(uHorizon, uHorizon * 0.8, clamp(-h * 4.0, 0.0, 1.0));
          float sd = dot(normalize(vDir), normalize(uSunDir));
          col += uSunColor * smoothstep(0.9965, 0.9985, sd) * 1.2;          // crisp toon sun disc
          col += uSunColor * pow(max(sd, 0.0), 24.0) * 0.25;                // soft glow
          // stars
          vec3 cell = floor(vDir * 180.0);
          float s = step(0.9975, hash(cell)) * uNight * smoothstep(0.05, 0.4, h);
          col += vec3(s);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.dome = new THREE.Mesh(domeGeo, domeMat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    this.sun = new THREE.DirectionalLight(0xffffff, 1.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xcfeaff, 0x6f7a4c, 0.8);
    scene.add(this.hemi);

    scene.fog = new THREE.Fog(0xd6f1ff, 90, 520);
    this.buildClouds();
    this.light = 1;
    this.period = 'day';
  }

  buildClouds() {
    const rng = new Rng(77);
    const puffs = [];
    for (let i = 0; i < 6; i++) {
      const r = rng.range(6, 12);
      puffs.push(paint(xf(G.ico(r, 1), [rng.range(-16, 16), rng.range(-2, 3), rng.range(-6, 6)], [0, 0, 0], [1, 0.62, 1]), 0xffffff, { bottom: 0xdfe8f5, flat: true }));
    }
    const geo = merge(puffs);
    this.cloudMat = toonMat({ flat: true }).clone();
    this.cloudMat.fog = false;
    this.clouds = new THREE.InstancedMesh(geo, this.cloudMat, 26);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    this.cloudData = [];
    for (let i = 0; i < 26; i++) {
      const d = { x: rng.range(-900, 900), z: rng.range(-900, 900), y: rng.range(170, 260), s: rng.range(0.8, 1.8), rot: rng.range(0, 6.28) };
      this.cloudData.push(d);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.rot);
      m.compose(p.set(d.x, d.y, d.z), q, s.set(d.s, d.s, d.s));
      this.clouds.setMatrixAt(i, m);
    }
    this.clouds.frustumCulled = false;
    this.scene.add(this.clouds);
  }

  update(hour, center, dt, windVec) {
    const k = sampleKeys(hour);
    this.uniforms.uTop.value.copy(k.top);
    this.uniforms.uHorizon.value.copy(k.horizon);

    // Sun path: rises east (+x) ~6:00, sets west ~19:00.
    const ang = ((hour - 6) / 13) * Math.PI;
    const sunDir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0.35).normalize();
    const isDay = sunDir.y > -0.05;
    const lightDir = isDay ? sunDir.clone() : new THREE.Vector3(-Math.cos(ang), -Math.sin(ang) * 0.8 + 0.3, -0.3).normalize(); // moon
    if (lightDir.y < 0.12) lightDir.y = 0.12;
    this.uniforms.uSunDir.value.copy(sunDir);
    this.uniforms.uSunColor.value.copy(isDay ? k.sun : new THREE.Color(0xcfd8ff));
    const night = hour < 5.5 || hour > 20.2 ? 1 : hour < 6.5 ? 1 - (hour - 5.5) : hour > 19.2 ? (hour - 19.2) : 0;
    this.uniforms.uNight.value = Math.min(1, Math.max(0, night));

    this.sun.color.copy(k.sun);
    this.sun.intensity = k.sunI;
    this.sun.position.set(center.x + lightDir.x * 180, center.y + lightDir.y * 180, center.z + lightDir.z * 180);
    this.sun.target.position.set(center.x, center.y, center.z);
    this.hemi.color.copy(k.hemiSky);
    this.hemi.groundColor.copy(k.hemiGround);
    this.hemi.intensity = k.hemiI;

    this.scene.fog.color.copy(k.horizon).lerp(k.top, 0.25);
    this.dome.position.set(center.x, 0, center.z);
    this.light = Math.min(1, 0.35 + k.sunI * 0.5);
    this.cloudMat.color.copy(k.horizon).lerp(new THREE.Color(0xffffff), 0.55);
    this.period = periodFor(hour);

    // Drift clouds with the wind.
    if (windVec) {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      for (let i = 0; i < this.cloudData.length; i++) {
        const d = this.cloudData[i];
        d.x += windVec.x * dt * 2.5; d.z += windVec.z * dt * 2.5;
        if (d.x > 1000) d.x -= 2000; if (d.x < -1000) d.x += 2000;
        if (d.z > 1000) d.z -= 2000; if (d.z < -1000) d.z += 2000;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.rot);
        m.compose(p.set(d.x, d.y, d.z), q, s.set(d.s, d.s, d.s));
        this.clouds.setMatrixAt(i, m);
      }
      this.clouds.instanceMatrix.needsUpdate = true;
    }
  }
}
