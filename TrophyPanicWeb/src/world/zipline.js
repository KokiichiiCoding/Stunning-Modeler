// Ziplines: a few cables strung downhill across the reserve, found by a
// seeded search for long drops with clear air under them. E at the top
// platform clips you on; gravity does the rest. Let go early (E/Space) if
// you're brave, or ride it out and get flung off the end like a sack of
// potatoes. Loud, fast, and terrible for stealth.

import { THREE } from '../three.js';
import { G, paint, merge, xf, toonMat, addOutline } from '../render/toon.js';
import { WATER_LEVEL, POIS } from './terrainData.js';
import { Rng } from '../core/rng.js';

const SAG = 1.6, HANG = 1.95, START_H = 8, END_H = 2.6;

function cableAt(L, t, out) {
  out.x = L.a.x + (L.b.x - L.a.x) * t; out.z = L.a.z + (L.b.z - L.a.z) * t;
  out.y = L.a.y + (L.b.y - L.a.y) * t - SAG * 4 * t * (1 - t);
  return out;
}

function post(h, deck) {
  const parts = [
    paint(xf(G.cyl(0.13, 0.16, h, 7), [0, h / 2, 0]), 0x7a5236, { bottom: 0x5a3a22 }),
    paint(xf(G.box(1.1, 0.12, 0.14), [0, h - 0.3, 0]), 0x6b4a30),
    paint(xf(G.cyl(0.06, 0.06, 0.1, 8), [0, h - 0.15, 0.1], [Math.PI / 2, 0, 0]), 0x3a3a44),
  ];
  if (deck) {
    parts.push(paint(xf(G.box(2.2, 0.22, 2.2), [0, 0.11, 1.1]), 0x9a6a42, { bottom: 0x6b4a30 }));
    for (let i = 0; i < 5; i++) parts.push(paint(xf(G.box(0.08, 0.04, 2.2), [-0.88 + i * 0.44, 0.24, 1.1]), 0x7a5236));
    parts.push(paint(xf(G.box(0.9, 0.5, 0.06), [0.9, 1.5, 0.2], [0, 0, 0.06]), 0xff6b2c), paint(xf(G.cyl(0.04, 0.04, 1.4, 5), [0.9, 0.7, 0.2]), 0x6b4a30));
    // a few rungs up the post, for looks
    for (let i = 0; i < 6; i++) parts.push(paint(xf(G.cyl(0.025, 0.025, 0.5, 5), [0, 0.9 + i * 0.75, 0.16], [0, 0, Math.PI / 2]), 0x8a6040));
  }
  return parts;
}

export class Ziplines {
  constructor(game) {
    this.game = game;
    this.lines = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this._v = { x: 0, y: 0, z: 0 };
    this.place();
    this.build();
  }

  /** Seeded search for good drops near the action. */
  place() {
    const g = this.game, T = g.terrain, V = g.vegetation, rng = new Rng(0x21b11e);
    const lodge = POIS[0];
    const cands = [];
    for (let i = 0; i < 900; i++) {
      const ax = rng.range(-430, 430), az = rng.range(-430, 430);
      const ha = T.heightAt(ax, az);
      if (ha < WATER_LEVEL + 3) continue;
      const ang = rng.range(0, Math.PI * 2), len = rng.range(80, 150);
      const bx = ax + Math.cos(ang) * len, bz = az + Math.sin(ang) * len;
      if (Math.abs(bx) > 460 || Math.abs(bz) > 460) continue;
      const hb = T.heightAt(bx, bz);
      if (hb < WATER_LEVEL + 0.6) continue;
      const L = { a: { x: ax, y: ha + START_H, z: az, g: ha }, b: { x: bx, y: hb + END_H, z: bz, g: hb }, len };
      const drop = L.a.y - L.b.y;
      if (drop < len * 0.11 || drop > len * 0.3) continue;
      // clear air under the whole cable for a dangling hunter
      let ok = true;
      const p = { x: 0, y: 0, z: 0 };
      for (let k = 1; k < 24 && ok; k++) { cableAt(L, k / 24, p); if (p.y - HANG - 0.5 < T.heightAt(p.x, p.z)) ok = false; }
      if (!ok) continue;
      const m = { x: 0, y: 0, z: 0 }; cableAt(L, 0.5, m);
      if (V.segmentBlocked(ax, L.a.y - 1.2, az, m.x, m.y - 1.2, m.z) >= 0 || V.segmentBlocked(m.x, m.y - 1.2, m.z, bx, L.b.y - 1.2, bz) >= 0) continue;
      L.score = Math.hypot(ax - lodge.x, az - lodge.z) * 0.5 - drop * 10;
      cands.push(L);
    }
    cands.sort((p, q) => p.score - q.score);
    for (const c of cands) {
      if (this.lines.length >= 4) break;
      if (this.lines.some(l => Math.hypot(l.a.x - c.a.x, l.a.z - c.a.z) < 220)) continue;
      c.dir = { x: (c.b.x - c.a.x) / c.len, z: (c.b.z - c.a.z) / c.len };
      c.yaw = Math.atan2(c.dir.x, c.dir.z);
      // the deck sits behind the start post, opposite the cable
      c.mount = { x: c.a.x - c.dir.x * 1.2, z: c.a.z - c.dir.z * 1.2 };
      this.lines.push(c);
    }
    const vegClear = (x, z) => { V.addCollider(x, z, 0.25, 7, 'building'); };
    for (const l of this.lines) { vegClear(l.a.x, l.a.z); vegClear(l.b.x, l.b.z); }
  }

  build() {
    const mat = toonMat();
    for (const L of this.lines) {
      const a = new THREE.Mesh(merge(post(START_H + 0.2, true)), mat);
      a.position.set(L.a.x, L.a.g - 0.05, L.a.z); a.rotation.y = L.yaw + Math.PI;
      const b = new THREE.Mesh(merge(post(END_H + 0.2, false)), mat);
      b.position.set(L.b.x, L.b.g - 0.05, L.b.z); b.rotation.y = L.yaw;
      for (const m of [a, b]) { m.castShadow = true; addOutline(m, 0.02); this.group.add(m); }
      // the cable: a sagging run of thin segments
      const parts = [], p0 = { x: 0, y: 0, z: 0 }, p1 = { x: 0, y: 0, z: 0 };
      const N = 16;
      for (let i = 0; i < N; i++) {
        cableAt(L, i / N, p0); cableAt(L, (i + 1) / N, p1);
        const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z, len = Math.hypot(dx, dy, dz);
        const geo = G.cyl(0.025, 0.025, len, 4);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
        geo.applyQuaternion(q); geo.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
        parts.push(paint(geo, 0x2a2a30));
      }
      const cable = new THREE.Mesh(merge(parts), mat);
      this.group.add(cable);
      // the trolley: a little pulley with a T-bar to hang from
      const trolley = new THREE.Mesh(merge([
        paint(xf(G.box(0.18, 0.14, 0.32), [0, 0, 0]), 0xffd23f),
        paint(xf(G.cyl(0.07, 0.07, 0.05, 10), [0, 0.05, 0], [0, 0, Math.PI / 2]), 0x3a3a44),
        paint(xf(G.cyl(0.015, 0.015, 0.55, 5), [0, -0.32, 0]), 0x3a3a44),
        paint(xf(G.cyl(0.03, 0.03, 0.55, 6), [0, -0.6, 0], [0, 0, Math.PI / 2]), 0xe8384f),
      ]), mat);
      addOutline(trolley, 0.015);
      this.group.add(trolley);
      L.trolley = trolley; L.t = 0;
      this.placeTrolley(L, 0.01);
    }
  }

  placeTrolley(L, t) {
    const p = cableAt(L, t, this._v || { x: 0, y: 0, z: 0 });
    L.trolley.position.set(p.x, p.y - 0.05, p.z);
    L.trolley.rotation.y = L.yaw;
  }

  /** The start platform you're standing on, if any. */
  nearStart(pos, r = 2.6) { return this.lines.find(l => Math.hypot(pos.x - l.mount.x, pos.z - l.mount.z) < r || Math.hypot(pos.x - l.a.x, pos.z - l.a.z) < r) || null; }

  mount(p, L) {
    const g = this.game;
    if (L.busy) { g.ui.feed('Someone is already on this line. Wait your turn!', 'warn'); return; }
    p.zip = { L, t: 0.005, v: 3 };
    L.busy = true;
    g.weapons.aiming = false; if (g.weapons.binoculars) g.weapons.toggleBinoculars();
    g.audio.play('click', p.pos); g.say('yay');
    g.ui.toast('WHEEEEE!', 'hit', 1.2);
    g.jobs.onEvent('zip', {});
  }

  /** Sim step while hanging from the line. */
  ride(p, dt, cmd, letGo) {
    const g = this.game, Z = p.zip, L = Z.L;
    const p0 = cableAt(L, Z.t, { x: 0, y: 0, z: 0 }), p1 = cableAt(L, Math.min(1, Z.t + 0.01), { x: 0, y: 0, z: 0 });
    const ds = Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z) || 1e-3;
    const slope = (p1.y - p0.y) / ds; // sin of the cable angle
    Z.v += (-9.8 * slope - 0.005 * Z.v * Z.v - 0.08) * dt;
    Z.v = Math.max(1.2, Math.min(24, Z.v));
    Z.t = Math.min(1, Z.t + Z.v * dt / L.len);
    const c = cableAt(L, Z.t, { x: 0, y: 0, z: 0 });
    const sway = Math.sin(g.time * 2.2) * 0.12 * Math.min(1, Z.v / 10);
    p.pos.x = c.x - L.dir.z * sway; p.pos.z = c.z + L.dir.x * sway; p.pos.y = c.y - HANG;
    p.vel.x = L.dir.x * Z.v; p.vel.z = L.dir.z * Z.v; p.vel.y = 0;
    p.speed = Z.v;
    this.placeTrolley(L, Z.t);
    // it's LOUD
    Z.noiseT = (Z.noiseT || 0) - dt;
    if (Z.noiseT <= 0) { Z.noiseT = 0.5; g.sounds.emit('engine', p.pos.x, p.pos.y + 1.5, p.pos.z, 300 + Z.v * 40, g.time, 'player'); }
    if (letGo || Z.t >= 0.985) this.release(p, Z.t >= 0.985);
  }

  release(p, atEnd) {
    const g = this.game, Z = p.zip, L = Z.L;
    p.zip = null; L.busy = false;
    const v = Z.v;
    L.returning = true; // the trolley rolls itself back up for the next rider
    if (atEnd && v < 7) { p.vel.x = L.dir.x * v * 0.4; p.vel.z = L.dir.z * v * 0.4; p.vel.y = 1.5; g.ui.feed('Stuck the landing. Ten out of ten.', 'good'); return; }
    p.startTumble(L.dir.x * v * 0.35, 3 + v * 0.12, L.dir.z * v * 0.35);
    g.ui.feed(atEnd ? 'There were no brakes. There were never any brakes.' : 'You let go. Gravity has notes.', 'warn');
    g.say('scared');
  }

  render(dt) {
    for (const L of this.lines) {
      if (L.returning && !L.busy) {
        L.t = Math.max(0.01, (L.t || 1) - dt / 6);
        this.placeTrolley(L, L.t);
        if (L.t <= 0.011) L.returning = false;
      }
    }
    const p = this.game.player;
    if (p.zip) p.zip.L.t = p.zip.t;
    if (this.game.audio.setZip) this.game.audio.setZip(p.zip ? Math.min(1, p.zip.v / 18) : 0);
  }
}
