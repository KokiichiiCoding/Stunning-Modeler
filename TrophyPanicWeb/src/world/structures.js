// The lodge, outposts, hunting towers, signposts and campfires.

import { THREE } from '../three.js';
import { G, paint, merge, xf, toonMat, addOutline } from '../render/toon.js';
import { POIS, TRAILS, TRAIL_POLYS } from './terrainData.js';

function signTexture(text, bg = '#f4d9a0', fg = '#4a2c1a') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#8a5a3b'; g.lineWidth = 12; g.strokeRect(6, 6, 500, 116);
  g.fillStyle = fg;
  g.font = '800 54px "Baloo 2", "Trebuchet MS", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = 54;
  while (g.measureText(text).width > 470 && size > 20) { size -= 2; g.font = `800 ${size}px "Baloo 2", "Trebuchet MS", sans-serif`; }
  g.fillText(text, 256, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function prism(w, h, d) {
  // Gable roof prism along x
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2, 0); shape.lineTo(d / 2, 0); shape.lineTo(0, h); shape.lineTo(-d / 2, 0);
  const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
  g.translate(0, 0, -w / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

function cabin({ w = 12, d = 9, h = 4.2, roof = 0xd9534f, wall = 0x9a6a44, trim = 0xf2e2c4 }) {
  const parts = [];
  // log walls: alternating stripes
  const logs = 7;
  for (let i = 0; i < logs; i++) {
    const y = (i + 0.5) * h / logs;
    parts.push(paint(xf(G.box(w, h / logs * 0.96, d), [0, y, 0]), i % 2 ? wall : 0x8a5c3a));
  }
  parts.push(paint(xf(prism(w + 1.4, 3.4, d + 1.6), [0, h, 0]), roof, { bottom: 0xa83b3b }));
  parts.push(paint(xf(G.box(w - 0.2, 3.1, 0.3), [0, h + 1.2, d / 2 - 0.05], [0, 0, 0], [0.98, 1, 1]), trim));
  // door + windows
  parts.push(paint(xf(G.box(1.6, 2.6, 0.2), [0, 1.3, d / 2 + 0.05]), 0x5a3a26));
  parts.push(paint(xf(G.sphere(0.1, 6, 4), [0.55, 1.3, d / 2 + 0.2]), 0xffd23f));
  for (const x of [-3.6, 3.6]) {
    parts.push(paint(xf(G.box(1.8, 1.4, 0.2), [x, 2.2, d / 2 + 0.05]), 0xffe7a3));
    parts.push(paint(xf(G.box(2.1, 0.2, 0.3), [x, 1.45, d / 2 + 0.1]), trim));
  }
  // porch + posts
  parts.push(paint(xf(G.box(w + 1, 0.3, 2.6), [0, 0.15, d / 2 + 1.3]), 0xb48a5a));
  for (const x of [-w / 2, w / 2]) parts.push(paint(xf(G.cyl(0.18, 0.18, h - 0.3, 6), [x, h / 2, d / 2 + 2.4]), 0x7a4f35));
  parts.push(paint(xf(G.box(w + 1.4, 0.25, 3), [0, h - 0.1, d / 2 + 1.4], [-0.18, 0, 0]), roof));
  // chimney
  parts.push(paint(xf(G.box(1.3, 4.5, 1.3), [w / 2 - 2.2, h + 1.6, -1.5]), 0xb7aca3, { jitter: 0.1 }));
  // antlers over door (the lodge's own trophy)
  for (const s of [-1, 1]) {
    parts.push(paint(xf(G.cyl(0.07, 0.09, 1.1, 5), [s * 0.45, h + 0.8, d / 2 + 0.25], [0, 0, s * 0.6]), 0xf0e2c0));
    parts.push(paint(xf(G.cyl(0.05, 0.07, 0.6, 5), [s * 0.8, h + 1.3, d / 2 + 0.25], [0, 0, -s * 0.3]), 0xf0e2c0));
  }
  return merge(parts);
}

function hut(roof = 0x4fa3c7) {
  const parts = [];
  parts.push(paint(xf(G.box(4, 2.6, 3.4), [0, 1.3, 0]), 0xa47650));
  parts.push(paint(xf(prism(4.8, 2.0, 4.2), [0, 2.6, 0]), roof, { bottom: 0x2f7a9a }));
  parts.push(paint(xf(G.box(1.1, 1.9, 0.15), [0, 0.95, 1.72]), 0x5a3a26));
  parts.push(paint(xf(G.box(0.9, 0.7, 0.15), [1.3, 1.6, 1.72]), 0xffe7a3));
  // flag pole
  parts.push(paint(xf(G.cyl(0.06, 0.06, 6, 5), [2.8, 3, 1.8]), 0xdddddd));
  parts.push(paint(xf(G.box(1.4, 0.8, 0.04), [3.5, 5.5, 1.8]), 0xff7a3d));
  // crates
  parts.push(paint(xf(G.box(0.9, 0.9, 0.9), [-2.6, 0.45, 1.6], [0, 0.4, 0]), 0xc79a5c));
  parts.push(paint(xf(G.box(0.7, 0.7, 0.7), [-2.5, 1.25, 1.5], [0, 0.9, 0]), 0xd8ab6a));
  return merge(parts);
}

function tower() {
  const parts = [];
  const h = 5;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) parts.push(paint(xf(G.cyl(0.12, 0.14, h, 5), [x, h / 2, z]), 0x7a4f35));
  parts.push(paint(xf(G.box(2.6, 0.2, 2.6), [0, h, 0]), 0xa47650));
  for (const [x, z, w, d] of [[0, -1.25, 2.6, 0.1], [0, 1.25, 2.6, 0.1], [-1.25, 0, 0.1, 2.6], [1.25, 0, 0.1, 2.6]]) {
    parts.push(paint(xf(G.box(w, 0.9, d), [x, h + 0.55, z]), 0x8a5c3a));
  }
  parts.push(paint(xf(prism(3, 1.2, 3), [0, h + 2.2, 0]), 0x6aa84f));
  for (const [x, z] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) parts.push(paint(xf(G.cyl(0.06, 0.06, 1.2, 4), [x, h + 1.6, z]), 0x7a4f35));
  // ladder
  for (let i = 0; i < 9; i++) parts.push(paint(xf(G.box(0.8, 0.06, 0.06), [0, 0.4 + i * 0.55, 1.45]), 0x9a6a44));
  parts.push(paint(xf(G.box(0.06, h, 0.06), [-0.4, h / 2, 1.45]), 0x7a4f35));
  parts.push(paint(xf(G.box(0.06, h, 0.06), [0.4, h / 2, 1.45]), 0x7a4f35));
  return merge(parts);
}

function campfire() {
  const parts = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * 6.28;
    parts.push(paint(xf(G.dodeca(0.28, 0), [Math.cos(a) * 1.0, 0.15, Math.sin(a) * 1.0]), 0x9d948c));
  }
  for (let i = 0; i < 3; i++) parts.push(paint(xf(G.cyl(0.1, 0.12, 1.3, 5), [0, 0.35, 0], [0.9, i * 2.1, 0]), 0x7a4f35));
  // log benches
  for (const a of [0.4, 2.4, 4.4]) parts.push(paint(xf(G.cyl(0.25, 0.25, 2, 7), [Math.cos(a) * 2.8, 0.25, Math.sin(a) * 2.8], [0, -a, Math.PI / 2]), 0x8a5a3b));
  return merge(parts);
}

function signpost(text) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(paint(xf(G.cyl(0.08, 0.1, 2.4, 5), [0, 1.2, 0]), 0x7a4f35), toonMat());
  g.add(post);
  // two single-sided boards back to back, so the text reads correctly from both sides
  const mat = new THREE.MeshBasicMaterial({ map: signTexture(text) });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), mat);
  board.position.set(0, 2.1, 0.1);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), mat);
  back.position.set(0, 2.1, 0.06); back.rotation.y = Math.PI;
  g.add(board); g.add(back);
  return g;
}

// Lantern on a short post: frame (toon) + glass (glows at night) + a soft glow sprite.
function lanternFrame() {
  return merge([
    paint(xf(G.cyl(0.05, 0.07, 1.5, 5), [0, 0.75, 0]), 0x6b4a30, { flat: true }),
    paint(xf(G.box(0.5, 0.06, 0.06), [0.2, 1.48, 0]), 0x6b4a30),
    paint(xf(G.cyl(0.01, 0.01, 0.12, 4), [0.4, 1.4, 0]), 0x2a2a30),
    paint(xf(G.cyl(0.11, 0.13, 0.05, 6), [0.4, 1.33, 0]), 0x2a2a30),
    paint(xf(G.cyl(0.13, 0.11, 0.05, 6), [0.4, 1.06, 0]), 0x2a2a30),
    ...[0, 1, 2, 3].map(i => paint(xf(G.box(0.02, 0.22, 0.02), [0.4 + Math.cos(i * 1.57 + 0.78) * 0.1, 1.2, Math.sin(i * 1.57 + 0.78) * 0.1]), 0x2a2a30)),
  ]);
}
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,214,140,1)'); grd.addColorStop(0.35, 'rgba(255,170,80,.45)'); grd.addColorStop(1, 'rgba(255,140,60,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Canvas A-frame tent, like every good camp has
function tent(color = 0xc9b48a) {
  const w = 1.4, h = 1.5, l = 2.2;
  const g = new THREE.BufferGeometry();
  const v = [
    -w, 0, -l / 2, 0, h, -l / 2, 0, h, l / 2, -w, 0, -l / 2, 0, h, l / 2, -w, 0, l / 2,
    w, 0, -l / 2, w, 0, l / 2, 0, h, l / 2, w, 0, -l / 2, 0, h, l / 2, 0, h, -l / 2,
    -w, 0, -l / 2, w, 0, -l / 2, 0, h, -l / 2,
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return merge([
    paint(g, color, { flat: true, bottom: 0x9c8660 }),
    paint(xf(G.cyl(0.03, 0.03, 1.7, 4), [0, 0.85, l / 2 + 0.05]), 0x6b4a30),
    paint(xf(G.cyl(0.03, 0.03, 1.7, 4), [0, 0.85, -l / 2 - 0.05]), 0x6b4a30),
    paint(xf(G.box(0.02, 0.02, l + 0.4), [0, h + 0.02, 0]), 0x6b4a30),
    paint(xf(G.box(0.7, 0.04, 0.6), [-0.6, 0.02, l / 2 + 0.4]), 0x8a5a3b), // crate-ish mat
    paint(xf(G.box(0.5, 0.35, 0.4), [0.9, 0.18, l / 2 + 0.3]), 0x8a5a3b, { flat: true }),
    paint(xf(G.box(0.3, 0.2, 0.05), [0.9, 0.3, l / 2 + 0.52]), 0xe8384f),       // first-aid kit
    paint(xf(G.box(0.18, 0.05, 0.06), [0.9, 0.3, l / 2 + 0.55]), 0xffffff),
    paint(xf(G.box(0.05, 0.18, 0.06), [0.9, 0.3, l / 2 + 0.55]), 0xffffff),
  ]);
}

export class Structures {
  constructor(scene, terrain, vegetation) {
    this.group = new THREE.Group();
    this.fires = [];
    this.windowMats = [];
    this.towers = [];
    scene.add(this.group);
    const mat = toonMat({ flat: true });
    for (const p of POIS) {
      const y = terrain.heightAt(p.x, p.z);
      const face = Math.atan2(-p.x, -p.z); // face roughly toward the reserve centre
      if (p.kind === 'lodge') {
        const lodge = new THREE.Mesh(cabin({}), mat);
        lodge.position.set(p.x, y - 0.1, p.z);
        lodge.rotation.y = face;
        lodge.castShadow = true; lodge.receiveShadow = true;
        this.group.add(lodge);
        this.addBoxCollider(vegetation, p.x, p.z, 6.5, 5, face, 5);
        const fire = new THREE.Mesh(campfire(), mat);
        const fx = p.x + Math.sin(face) * 14, fz = p.z + Math.cos(face) * 14;
        fire.position.set(fx, terrain.heightAt(fx, fz), fz);
        this.group.add(fire);
        this.fires.push({ x: fx, y: terrain.heightAt(fx, fz), z: fz });
        const sign = signpost(p.name);
        const sx = p.x + Math.sin(face + 0.5) * 11, sz = p.z + Math.cos(face + 0.5) * 11;
        sign.position.set(sx, terrain.heightAt(sx, sz), sz);
        sign.rotation.y = face;
        this.group.add(sign);
        p.spawn = { x: p.x + Math.sin(face) * 9, z: p.z + Math.cos(face) * 9, yaw: face + Math.PI };
      } else {
        const h = new THREE.Mesh(hut(p.id === 'outpost_ridge' ? 0xe0795a : p.id === 'outpost_bog' ? 0x8bbf5a : 0x4fa3c7), mat);
        h.position.set(p.x, y - 0.05, p.z);
        h.rotation.y = face;
        h.castShadow = true; h.receiveShadow = true;
        this.group.add(h);
        this.addBoxCollider(vegetation, p.x, p.z, 2.2, 1.9, face, 3);
        const sign = signpost(p.name);
        const sx = p.x + Math.sin(face + 0.7) * 5, sz = p.z + Math.cos(face + 0.7) * 5;
        sign.position.set(sx, terrain.heightAt(sx, sz), sz);
        sign.rotation.y = face;
        this.group.add(sign);
        p.spawn = { x: p.x + Math.sin(face) * 5, z: p.z + Math.cos(face) * 5, yaw: face + Math.PI };
      }
    }
    this.placeTowers(terrain, vegetation, mat);
    this.placeCamps(terrain, vegetation, mat);
    this.placeTrailSigns(terrain, mat);
  }

  /** Arrow signposts halfway along each trail, pointing at both ends. */
  placeTrailSigns(terrain, mat) {
    const byId = Object.fromEntries(POIS.map(p => [p.id, p]));
    TRAILS.forEach(([a, b], i) => {
      const pts = TRAIL_POLYS[i];
      const mid = pts[Math.floor(pts.length / 2)];
      const mx = mid[0] + 2.5, mz = mid[1] + 2.5;
      const y = terrain.heightAt(mx, mz);
      const post = new THREE.Mesh(paint(xf(G.cyl(0.07, 0.09, 2.3, 5), [0, 1.15, 0]), 0x7a4f35, { flat: true }), mat);
      post.position.set(mx, y, mz); post.castShadow = true; this.group.add(post);
      [[byId[a], 1.95], [byId[b], 1.55]].forEach(([poi, hgt]) => {
        const ang = Math.atan2(-(poi.z - mz), poi.x - mx); // turn the board's +x toward the destination
        const name = poi.name.replace(' Outpost', '').replace('Wobblewood ', '');
        const arm = new THREE.Group();
        arm.position.set(mx, y + hgt, mz); arm.rotation.y = ang;
        const front = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.36), new THREE.MeshBasicMaterial({ map: signTexture(`${name} ►`, '#e9c98c') }));
        front.position.set(0.7, 0, 0.03);
        const back = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.36), new THREE.MeshBasicMaterial({ map: signTexture(`◄ ${name}`, '#e9c98c') }));
        back.position.set(0.7, 0, -0.03); back.rotation.y = Math.PI;
        arm.add(front); arm.add(back);
        this.group.add(arm);
      });
    });
  }

  /** Lanterns and tents around every camp; they glow after sunset. */
  placeCamps(terrain, veg, mat) {
    this.lanterns = [];
    this.tents = [];
    const spots = [];
    const addLantern = (x, z, rot) => { spots.push({ x, z, rot, y: terrain.heightAt(x, z) }); };
    for (const p of POIS) {
      const face = Math.atan2(-p.x, -p.z);
      const at = (a, d) => [p.x + Math.sin(face + a) * d, p.z + Math.cos(face + a) * d];
      if (p.kind === 'lodge') {
        for (const [a, d] of [[0.35, 8], [-0.35, 8], [0.25, 15], [-0.25, 15], [0.6, 11.5]]) { const [x, z] = at(a, d); addLantern(x, z, face); }
        const [tx, tz] = at(-0.9, 15);
        const t = new THREE.Mesh(tent(), mat); t.position.set(tx, terrain.heightAt(tx, tz), tz); t.rotation.y = face + 0.6; t.castShadow = true; this.group.add(t);
        this.tents.push({ x: tx, z: tz, rot: face + 0.6, usedT: -1e9 });
        veg.addCollider(tx, tz, 1.3, 1.5, 'building');
      } else {
        for (const [a, d] of [[0.45, 4.2], [-0.5, 4.5]]) { const [x, z] = at(a, d); addLantern(x, z, face); }
        const [tx, tz] = at(-1.2, 7);
        const t = new THREE.Mesh(tent([0xc9b48a, 0x8fa36a, 0xb8826a][POIS.indexOf(p) % 3]), mat); t.position.set(tx, terrain.heightAt(tx, tz), tz); t.rotation.y = face - 0.4; t.castShadow = true; this.group.add(t);
        this.tents.push({ x: tx, z: tz, rot: face - 0.4, usedT: -1e9 });
        veg.addCollider(tx, tz, 1.3, 1.5, 'building');
      }
    }
    // all lanterns merged: one draw for the frames, one for the glass, one for the glows
    const frames = [], glasses = [], glowPos = [];
    for (const s of spots) {
      frames.push(xf(lanternFrame(), [s.x, s.y, s.z], [0, s.rot, 0]));
      const gx = s.x + Math.cos(s.rot) * 0.4, gz = s.z - Math.sin(s.rot) * 0.4;
      glasses.push(xf(G.cyl(0.09, 0.09, 0.2, 6), [gx, s.y + 1.2, gz]));
      glowPos.push(gx, s.y + 1.2, gz);
      this.lanterns.push({ x: gx, y: s.y + 1.2, z: gz });
    }
    const fm = new THREE.Mesh(merge(frames), mat); fm.castShadow = true; this.group.add(fm);
    this.glassMat = new THREE.MeshBasicMaterial({ color: 0x6a5a40 });
    this.group.add(new THREE.Mesh(merge(glasses.map(g0 => paint(g0, 0xffffff))), this.glassMat));
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(glowPos, 3));
    this.glowMat = new THREE.PointsMaterial({ map: glowTexture(), size: 2.4, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, color: 0xffffff });
    this.group.add(new THREE.Points(pg, this.glowMat));
    // two pooled warm lights follow the nearest lanterns (fixed light count: no shader recompiles)
    this.lights = [0, 1].map(() => { const l = new THREE.PointLight(0xffb066, 0, 16, 1.6); this.group.add(l); return l; });
  }

  /** Night glow: lanterns light up after sunset; the two nearest cast real light. */
  update(hour, cam) {
    const night = hour >= 20 || hour < 5 ? 1 : hour >= 18.3 ? (hour - 18.3) / 1.7 : hour < 6.2 ? (6.2 - hour) / 1.2 : 0;
    const k = Math.max(0, Math.min(1, night));
    this.glassMat.color.setRGB(0.42 + 0.58 * k, 0.35 + 0.48 * k, 0.25 + 0.2 * k);
    this.glowMat.opacity = k * 0.9;
    const near = this.lanterns.map(l => ({ l, d: Math.hypot(l.x - cam.x, l.z - cam.z) })).sort((a, b) => a.d - b.d);
    this.lights.forEach((L, i) => { const n = near[i]; if (!n) return; L.position.set(n.l.x, n.l.y, n.l.z); L.intensity = k * 3.2 * (n.d < 90 ? 1 : 0); });
  }

  addBoxCollider(veg, x, z, hw, hd, rot, h) {
    // approximate a box footprint with a row of circles
    const c = Math.cos(rot), s = Math.sin(rot);
    const r = Math.min(hw, hd) * 0.7;
    const nx = Math.max(1, Math.round(hw / r)), nz = Math.max(1, Math.round(hd / r));
    for (let i = -nx; i <= nx; i++) for (let j = -nz; j <= nz; j++) {
      const lx = i / nx * (hw - r * 0.5), lz = j / nz * (hd - r * 0.5);
      veg.addCollider(x + lx * c + lz * s, z - lx * s + lz * c, r, h, 'building');
    }
  }

  placeTowers(terrain, veg, mat) {
    // Hunting towers at meadow edges: climb for a better view (E at the ladder).
    const spots = [[120, 200], [-40, -140], [-250, 60], [230, -180], [-160, -380], [380, 120], [30, 380]];
    for (const [x, z] of spots) {
      const y = terrain.heightAt(x, z);
      if (y < 5) continue;
      const t = new THREE.Mesh(tower(), mat);
      t.position.set(x, y - 0.05, z);
      t.castShadow = true;
      this.group.add(t);
      this.towers.push({ x, z, y, top: y + 5.2 });
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) veg.addCollider(x + dx, z + dz, 0.2, 5, 'tower');
    }
  }
}
