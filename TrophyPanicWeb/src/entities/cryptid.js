// The Hairy Hiker: the reserve's local legend. Some nights a tall, furry
// figure in a tiny beanie strolls across a distant clearing. Get close, or
// shine a light on it, and it does a double-take, gives a polite wave and
// legs it, arms flailing. Bullets go straight through it (of course they
// do). A photo is worth a small fortune and is always a bit blurry.
// Local to each player; seeded; presentation + a little economy.

import { THREE } from '../three.js';
import { G, paint, merge, xf, toonMat, addOutline } from '../render/toon.js';
import { buildHat } from './hunter.js';
import { WATER_LEVEL } from '../world/terrainData.js';
import { Rng } from '../core/rng.js';

const FUR = 0x6b4a34, FUR2 = 0x553826, FACE = 0xc9a27a;

export function buildHiker() {
  const root = new THREE.Group();
  const mat = toonMat();
  const mk = (parts, parent = root, outline = 0.03) => { const m = new THREE.Mesh(merge(parts), mat); m.castShadow = true; addOutline(m, outline); parent.add(m); return m; };
  // big shaggy body
  const body = new THREE.Group(); body.position.y = 1.15; root.add(body);
  mk([
    paint(xf(G.sphere(0.62, 12, 9), [0, 0.35, 0], [0, 0, 0], [1, 1.25, 0.85]), FUR, { bottom: FUR2 }),
    paint(xf(G.sphere(0.4, 10, 8), [0, 0.25, 0.32], [0, 0, 0], [1, 1.2, 0.5]), 0x8a6446),
    ...[0, 1, 2, 3, 4, 5].map(i => paint(xf(G.cone(0.12, 0.3, 4), [Math.cos(i) * 0.5, -0.35, Math.sin(i) * 0.4], [Math.PI, i, 0]), FUR2)), // shaggy hem
    // a tiny camera on a strap: it's a hiker
    paint(xf(G.box(0.16, 0.11, 0.07), [0.12, 0.45, 0.55]), 0x4fb4f0),
    paint(xf(G.cyl(0.035, 0.035, 0.05, 8), [0.12, 0.45, 0.6], [Math.PI / 2, 0, 0]), 0x2a2a30),
  ], body);
  // head with a face patch, tiny eyes and a big friendly nose
  const head = new THREE.Group(); head.position.set(0, 1.12, 0.05); body.add(head);
  mk([
    paint(xf(G.sphere(0.42, 12, 9), [0, 0, 0]), FUR, { bottom: FUR2 }),
    paint(xf(G.sphere(0.3, 10, 8), [0, -0.04, 0.22], [0, 0, 0], [1, 0.9, 0.6]), FACE),
    paint(xf(G.sphere(0.075, 8, 6), [-0.12, 0.06, 0.38]), 0xffffff), paint(xf(G.sphere(0.075, 8, 6), [0.12, 0.06, 0.38]), 0xffffff),
    paint(xf(G.sphere(0.045, 6, 5), [-0.12, 0.06, 0.43]), 0x1d1622), paint(xf(G.sphere(0.045, 6, 5), [0.12, 0.06, 0.43]), 0x1d1622),
    paint(xf(G.sphere(0.08, 8, 6), [0, -0.06, 0.45], [0, 0, 0], [1.3, 0.9, 1]), 0x3a2620),
    paint(xf(G.box(0.16, 0.035, 0.03), [0, -0.17, 0.42], [0, 0, 0]), 0x3a1a22),
    paint(xf(G.box(0.14, 0.03, 0.04), [-0.12, 0.17, 0.39], [0, 0, 0.25]), FUR2), paint(xf(G.box(0.14, 0.03, 0.04), [0.12, 0.17, 0.39], [0, 0, -0.25]), FUR2),
  ], head, 0.025);
  const hat = new THREE.Mesh(buildHat('beanie', 0xe8384f), mat);
  hat.scale.setScalar(1.05); hat.position.set(0, 0.16, -0.02); head.add(hat);
  // long arms and stumpy legs with big feet
  const limb = (x, y, len, r, foot) => {
    const g = new THREE.Group(); g.position.set(x, y, 0);
    mk([paint(xf(G.capsule(r, len, 4, 8), [0, -len / 2 - r * 0.5, 0]), FUR, { bottom: FUR2 }), ...(foot ? [paint(xf(G.sphere(0.2, 8, 6), [0, -len - r, 0.12], [0, 0, 0], [1, 0.45, 1.5]), FUR2)] : [paint(xf(G.sphere(r * 1.25, 8, 6), [0, -len - r, 0.02]), FACE)])], g, 0.025);
    return g;
  };
  const arms = [limb(-0.62, 0.62, 0.85, 0.13, false), limb(0.62, 0.62, 0.85, 0.13, false)];
  const legs = [limb(-0.26, 0, 0.75, 0.17, true), limb(0.26, 0, 0.75, 0.17, true)];
  for (const a of arms) body.add(a);
  for (const l of legs) { l.position.y += 1.15; root.add(l); }
  root.scale.setScalar(1.3); // "very tall"
  return { root, body, head, arms, legs };
}

export class Cryptid {
  constructor(game) {
    this.game = game;
    this.rng = new Rng(game.sessionSeed ^ 0xb16f007);
    this.h = null;              // the current sighting
    this.checkedDay = -1;
  }

  get night() { const p = this.game.period; return p === 'night' || p === 'dusk'; }

  step(dt) {
    const g = this.game;
    if (g.state !== 'play') return;
    const day = Math.floor((g.time + g.daySeconds * 0.5) / g.daySeconds);
    if (!this.h && this.night && this.checkedDay !== day) {
      this.checkedDay = day;
      if (this.rng.chance(this.forceNext ? 1 : 0.45)) this.spawn();
      this.forceNext = false;
    }
    const h = this.h;
    if (!h) return;
    const P = g.player.pos, T = g.terrain;
    const dx = P.x - h.x, dz = P.z - h.z, d = Math.hypot(dx, dz);
    h.t += dt;
    if (h.mode === 'stroll') {
      h.x += Math.sin(h.yaw) * 1.1 * dt; h.z += Math.cos(h.yaw) * 1.1 * dt;
      const lit = g.fx.flashOn && d < 90 && Math.abs(angleDiff(Math.atan2(-dx, -dz), g.player.yaw + Math.PI)) < 0.35;
      if (d < 55 || lit) { h.mode = 'wave'; h.mt = 0; h.yaw = Math.atan2(dx, dz); g.audio.play('boing', h); }
      else if (h.t > 75 || !this.okGround(h.x, h.z)) { h.mode = 'flee'; h.mt = 0; }
    } else if (h.mode === 'wave') {
      h.mt += dt;
      if (h.mt > 1.8) { h.mode = 'flee'; h.mt = 0; h.yaw = Math.atan2(-dx, -dz); this.whoop(h); }
    } else if (h.mode === 'flee') {
      h.mt += dt;
      h.x += Math.sin(h.yaw) * 9 * dt; h.z += Math.cos(h.yaw) * 9 * dt;
      if (h.mt > 6 || d > 320) { this.despawn(); return; }
    }
    h.y = Math.max(T.heightAt(h.x, h.z), WATER_LEVEL - 0.6);
    // big footprints so you can prove it to your friends later
    h.printT = (h.printT || 0) - dt;
    if (h.printT <= 0 && h.mode !== 'wave') { h.printT = h.mode === 'flee' ? 0.25 : 0.7; g.fx.splat(h.x + Math.cos(h.yaw) * (h.side = -(h.side || 0.25)), h.z - Math.sin(h.yaw) * h.side, 0.28, 0x3a2a1e, 400); }
  }

  okGround(x, z) { const y = this.game.terrain.heightAt(x, z); return y > WATER_LEVEL + 0.4 && Math.abs(x) < 470 && Math.abs(z) < 470; }

  spawn(force = null) {
    const g = this.game, P = g.player.pos;
    // somewhere on dry land, ideally out in the open where you can actually see it
    let x, z, best = null;
    const eye = g.player.eyePos();
    for (let tries = 0; tries < 40; tries++) {
      const a = this.rng.range(0, Math.PI * 2), r = force ? force.r : this.rng.range(110, 170);
      const cx = P.x + Math.cos(a) * r, cz = P.z + Math.sin(a) * r;
      if (!this.okGround(cx, cz)) continue;
      const clear = g.vegetation.segmentBlocked(eye.x, eye.y, eye.z, cx, g.terrain.heightAt(cx, cz) + 1.6, cz) < 0;
      if (clear) { best = { x: cx, z: cz }; break; }
      if (!best) best = { x: cx, z: cz };
    }
    if (!best) return false;
    x = best.x; z = best.z;
    // stroll across your view, not toward you
    const toMe = Math.atan2(P.x - x, P.z - z);
    const m = buildHiker();
    g.scene.add(m.root);
    this.h = { x, z, y: g.terrain.heightAt(x, z), yaw: toMe + (this.rng.chance(0.5) ? 1 : -1) * Math.PI / 2, mode: 'stroll', t: 0, mt: 0, m, phase: 0 };
    const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
    const dir = dirs[Math.round((((Math.atan2(x - P.x, -(z - P.z)) * 180 / Math.PI) + 360) % 360) / 45) % 8];
    if (!force) g.ui.feed(`RANGER RADIO: campers report a "very tall, very hairy hiker" to your ${dir}. Probably a bear in a coat. Probably.`, 'warn');
    this.whoop(this.h, 0.6);
    return true;
  }

  whoop(h, k = 1) {
    const A = this.game.audio;
    if (!A.ctx) return;
    const t = A.ctx.currentTime + 0.02;
    const { g } = A.out(h, 1.1 * k, 900);
    A.tone(g, t, 0.9, { type: 'sine', curve: [300, 520, 610, 560], gain: 0.35, vibrato: 6, vibRate: 5 });
    A.tone(g, t + 1.0, 1.2, { type: 'sine', curve: [280, 540, 420], gain: 0.3, vibrato: 8, vibRate: 5 });
  }

  despawn() { if (this.h) { this.game.scene.remove(this.h.m.root); this.h = null; } }

  /** Is the Hiker in this photo? Returns a photo result or null. */
  photo(cam) {
    const h = this.h, g = this.game;
    if (!h) return null;
    const c = new THREE.Vector3(h.x, h.y + 1.6, h.z);
    const d = c.distanceTo(cam.position);
    if (d > 170) return null;
    const ndc = c.clone().project(cam);
    if (ndc.z > 1 || Math.abs(ndc.x) > 0.9 || Math.abs(ndc.y) > 0.9) return null;
    const o = cam.position;
    if (g.vegetation.segmentBlocked(o.x, o.y, o.z, c.x, c.y, c.z) >= 0) return null;
    const stars = Math.max(1, Math.min(5, Math.round(5 - d / 40 - Math.hypot(ndc.x, ndc.y) * 1.5)));
    return { cryptid: true, sp: 'hiker', name: 'Hairy Hiker', nickname: 'Probably', stars, action: h.mode === 'wave' ? 'waving' : h.mode === 'flee' ? 'running away' : 'out for a stroll', dist: d, rare: true };
  }

  render(dt) {
    const h = this.h;
    if (!h) return;
    const m = h.m, t = this.game.visualTime;
    m.root.position.set(h.x, h.y, h.z);
    m.root.rotation.y = h.yaw;
    const spd = h.mode === 'flee' ? 9 : h.mode === 'stroll' ? 1.1 : 0;
    h.phase += dt * (spd > 3 ? 11 : 3.2);
    const sw = spd > 0 ? Math.sin(h.phase) : 0;
    m.legs[0].rotation.x = sw * (spd > 3 ? 1.1 : 0.45); m.legs[1].rotation.x = -sw * (spd > 3 ? 1.1 : 0.45);
    m.body.position.y = 1.15 + Math.abs(Math.cos(h.phase)) * (spd > 3 ? 0.18 : 0.05);
    m.body.rotation.x = spd > 3 ? 0.25 : 0;
    if (h.mode === 'wave') {
      m.arms[0].rotation.set(0, 0, 0.1); m.arms[1].rotation.set(0, 0, -2.6 + Math.sin(t * 12) * 0.35);
      m.head.rotation.z = Math.sin(t * 3) * 0.12;
    } else if (h.mode === 'flee') {
      // full panic windmill
      m.arms[0].rotation.set(Math.sin(t * 16) * 2.2, 0, 0.6); m.arms[1].rotation.set(Math.cos(t * 16) * 2.2, 0, -0.6);
      m.head.rotation.z = Math.sin(t * 9) * 0.25;
    } else {
      m.arms[0].rotation.set(-sw * 0.5, 0, 0.12); m.arms[1].rotation.set(sw * 0.5, 0, -0.12);
      m.head.rotation.z = 0;
    }
  }

  clear() { this.despawn(); }
}

function angleDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
