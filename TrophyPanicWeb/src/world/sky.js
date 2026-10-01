// Sky dome, sun/moon lighting, fog and a 24-hour day cycle. The cycle's
// "period" (dawn/day/dusk/night) drives animal activity and predator boldness.

import { THREE } from '../three.js';
import { G, paint, merge, xf, toonMat } from '../render/toon.js';
import { Rng } from '../core/rng.js';

const KEYS = [
  // hour, sky top, horizon, sun colour, sun intensity, hemi intensity, hemi sky, hemi ground
  // (golden hours lean warm; nights lean storybook purple)
  [0.0, 0x161436, 0x3c2f66, 0x9f9cff, 0.26, 0.5, 0x5a4c9a, 0x221c30],
  [4.8, 0x1c1a48, 0x4a3a78, 0x9f9cff, 0.24, 0.5, 0x5a4c9a, 0x221c30],
  [5.8, 0x4b4fa0, 0xf6a07c, 0xffb07a, 0.6, 0.62, 0xa49ad8, 0x4a4038],
  [7.0, 0x6fb6ee, 0xffd6a0, 0xffd096, 1.2, 0.78, 0xffe2b8, 0x6a6a4a],
  [9.5, 0x55b0f6, 0xe4f1fb, 0xfff0d8, 1.45, 0.82, 0xd8ecff, 0x6f7a4c],
  [15.5, 0x58b1f5, 0xe8f0f6, 0xfff0d8, 1.4, 0.8, 0xd8ecff, 0x6f7a4c],
  [17.6, 0x6a9be0, 0xffcf8f, 0xffbe7a, 1.15, 0.75, 0xffe0b0, 0x6a5a48],
  [19.2, 0x4a4ea8, 0xff8a6a, 0xff7a55, 0.62, 0.6, 0xd0a0d8, 0x4a3a40],
  [20.4, 0x2a2468, 0x6a4a8c, 0xa79cff, 0.3, 0.5, 0x6a5aa8, 0x2a2238],
  [24.0, 0x161436, 0x3c2f66, 0x9f9cff, 0.26, 0.5, 0x5a4c9a, 0x221c30],
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
      uFog: { value: 0 },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uMoon: { value: 0 },
      uFogColor: { value: new THREE.Color() },
    };
    const domeGeo = new THREE.SphereGeometry(1800, 32, 16);
    const domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.uniforms,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `
        uniform vec3 uTop, uHorizon, uSunDir, uSunColor, uFogColor, uMoonDir; uniform float uNight, uFog, uMoon; varying vec3 vDir;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
        void main(){
          float h = clamp(vDir.y, -0.2, 1.0);
          vec3 col = mix(uHorizon, uTop, pow(max(h, 0.0), 0.55));
          if (h < 0.0) col = mix(uHorizon, uHorizon * 0.8, clamp(-h * 4.0, 0.0, 1.0));
          float sd = dot(normalize(vDir), normalize(uSunDir));
          col += uSunColor * smoothstep(0.9930, 0.9950, sd) * 1.3;          // big storybook sun disc
          col += uSunColor * pow(max(sd, 0.0), 60.0) * 0.45;                // halo
          col += uSunColor * pow(max(sd, 0.0), 6.0) * 0.18;                 // warm haze around it
          // crescent moon: a disc minus a slightly offset disc
          vec3 md = normalize(uMoonDir);
          float mdisc = smoothstep(0.9982, 0.9988, dot(normalize(vDir), md));
          vec3 off = normalize(md + normalize(cross(md, vec3(0.0, 1.0, 0.0))) * 0.022 + vec3(0.0, 0.012, 0.0));
          float mcut = smoothstep(0.9982, 0.9988, dot(normalize(vDir), off));
          col = mix(col, vec3(1.0, 0.96, 0.82), clamp(mdisc - mcut, 0.0, 1.0) * uMoon);
          col += vec3(0.6, 0.6, 0.9) * pow(max(dot(normalize(vDir), md), 0.0), 300.0) * 0.25 * uMoon;
          // stars
          vec3 cell = floor(vDir * 180.0);
          float s = step(0.9975, hash(cell)) * uNight * smoothstep(0.05, 0.4, h);
          col += vec3(s);
          // mist swallows the horizon and greys the whole dome
          col = mix(col, uFogColor, uFog * (1.0 - smoothstep(-0.05, 0.55, h) * 0.55));
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
    this.buildMountains();
    this.light = 1;
    this.period = 'day';
  }

  /** A far ring of big faceted, snow-capped peaks: the postcard backdrop. */
  buildMountains() {
    const rng = new Rng(4242);
    const parts = [];
    const rock = [0x6f7d96, 0x7c88a0, 0x667089], snow = 0xf4f6ff;
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + rng.range(-0.05, 0.05);
      const r = rng.range(1250, 1650);
      const h = rng.range(260, 620) * (0.7 + 0.5 * Math.abs(Math.sin(a * 2.3)));
      const w = h * rng.range(0.9, 1.4);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const g = new THREE.ConeGeometry(w, h, 6 + (i % 3), 3);
      // jitter vertices for a hand-carved look (hashed by position so seam copies move together)
      const pos = g.attributes.position;
      for (let v = 0; v < pos.count; v++) {
        const y = pos.getY(v);
        if (y > h / 2 - 1) continue;
        const hx = Math.sin(Math.round(pos.getX(v)) * 12.9898 + Math.round(y) * 78.233 + Math.round(pos.getZ(v)) * 37.719 + i) * 43758.5453;
        const j = hx - Math.floor(hx);
        pos.setX(v, pos.getX(v) * (0.84 + j * 0.3)); pos.setZ(v, pos.getZ(v) * (0.84 + j * 0.3)); pos.setY(v, y + (j - 0.5) * h * 0.1);
      }
      parts.push(paint(xf(g, [x, h / 2 - 60, z], [0, rng.range(0, 6.28), 0]), rock[i % 3], { flat: true, bottom: 0x4c5670 }));
      // snow cap: a smaller cone hugging the summit
      parts.push(paint(xf(G.cone(w * 0.36, h * 0.34, 6 + (i % 3), 1), [x, h - 60 - h * 0.17 + 2, z], [0, rng.range(0, 6.28), 0]), snow, { flat: true, bottom: 0xd9e2f2 }));
    }
    this.mtnMat = toonMat({ flat: true }).clone();
    this.mtnMat.fog = false;
    this.mountains = new THREE.Mesh(merge(parts), this.mtnMat);
    this.mountains.frustumCulled = false;
    this.mountains.renderOrder = -5;
    this.scene.add(this.mountains);
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
    this.clouds = new THREE.InstancedMesh(geo, this.cloudMat, 60);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    this.cloudData = [];
    for (let i = 0; i < 60; i++) {
      const d = { x: rng.range(-900, 900), z: rng.range(-900, 900), y: rng.range(170, 260), s: rng.range(0.8, 1.8), rot: rng.range(0, 6.28) };
      this.cloudData.push(d);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.rot);
      m.compose(p.set(d.x, d.y, d.z), q, s.set(d.s, d.s, d.s));
      this.clouds.setMatrixAt(i, m);
    }
    this.clouds.frustumCulled = false;
    this.scene.add(this.clouds);
  }

  update(hour, center, dt, windVec, weather = null) {
    const k = sampleKeys(hour);
    const cloud = weather ? weather.cloud : 0.12, rain = weather ? weather.rain : 0, fog = weather ? weather.fog : 0;
    // Overcast: the sky greys out and the sun loses its punch (but stays storybook-soft).
    const bright = 0.3 + 0.7 * Math.min(1, k.hemiI * 1.25);
    const overcast = Math.max(0, cloud - 0.15) / 0.85;
    const greyTop = new THREE.Color(rain > 0.3 ? 0x6d7a8a : 0x8e9bab).lerp(new THREE.Color(0x6d7a8a), rain).multiplyScalar(bright);
    const greyHor = new THREE.Color(0xb4bfca).lerp(new THREE.Color(0x98a4b0), rain).multiplyScalar(bright);
    k.top.lerp(greyTop, overcast * 0.85); k.horizon.lerp(greyHor, overcast * 0.8);
    k.sunI *= 1 - 0.6 * Math.max(0, cloud - 0.1);
    k.hemiI *= 1 + 0.1 * cloud - 0.12 * rain;
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
    this.uniforms.uMoonDir.value.set(-Math.cos(ang) * 0.9, Math.max(0.28, -Math.sin(ang) * 0.6 + 0.35), -0.45).normalize();
    this.uniforms.uMoon.value = Math.min(1, Math.max(0, night)) * (1 - (weather ? weather.cloud : 0) * 0.8);

    this.sun.color.copy(k.sun);
    this.sun.intensity = k.sunI;
    this.sun.position.set(center.x + lightDir.x * 180, center.y + lightDir.y * 180, center.z + lightDir.z * 180);
    this.sun.target.position.set(center.x, center.y, center.z);
    this.hemi.color.copy(k.hemiSky);
    this.hemi.groundColor.copy(k.hemiGround);
    this.hemi.intensity = k.hemiI;

    this.scene.fog.color.copy(k.horizon).lerp(k.top, 0.25);
    const mist = new THREE.Color(0xe4ecef).multiplyScalar(0.3 + 0.7 * Math.min(1, k.hemiI * 1.3));
    this.scene.fog.color.lerp(mist, fog * 0.85);
    this.scene.fog.near = Math.max(3, 90 - 86 * fog - 45 * rain);
    this.scene.fog.far = Math.max(95, 520 - 425 * fog - 200 * rain);
    this.uniforms.uFog.value = Math.min(1, fog * 1.1 + rain * 0.35);
    this.uniforms.uFogColor.value.copy(this.scene.fog.color);
    this.uniforms.uNight.value *= 1 - cloud * 0.9; // no stars through clouds
    this.dome.position.set(center.x, 0, center.z);
    this.light = Math.min(1, 0.35 + k.sunI * 0.5);
    this.cloudMat.color.copy(k.horizon).lerp(new THREE.Color(0xffffff), 0.55 - rain * 0.2);
    // aerial perspective: distant peaks take on the horizon colour (and vanish into fog)
    this.mtnMat.color.set(0xffffff).lerp(k.horizon.clone().lerp(k.top, 0.55), 0.3 + fog * 0.6 + rain * 0.3);
    this.clouds.count = Math.round(18 + cloud * 42);
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
        const low = 1 - rain * 0.35, fat = 1 + cloud * 0.5;
        m.compose(p.set(d.x, d.y * low, d.z), q, s.set(d.s * fat, d.s * (1 + rain * 0.3), d.s * fat));
        this.clouds.setMatrixAt(i, m);
      }
      this.clouds.instanceMatrix.needsUpdate = true;
    }
  }
}
