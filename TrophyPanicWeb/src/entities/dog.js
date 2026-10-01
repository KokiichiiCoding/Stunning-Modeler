// Biscuit, the tracking dog. Follows you at heel, growls toward dangerous
// game (and the growl is a real sound animals can hear), and on "Find it!"
// works the blood trail to the animal you hit: pointing when a wounded one
// is close, barking when she finds one that's down. Seeded, fixed-step,
// and she never decides a hit or a kill.

import { THREE } from '../three.js';
import { G, paint, merge, xf, toonMat, addOutline } from '../render/toon.js';
import { Rng } from '../core/rng.js';
import { WATER_LEVEL } from '../world/terrainData.js';

const COAT = 0xe0a64e, BELLY = 0xfff0d6, EAR = 0x9a5a2a, COLLAR = 0xff6b2c;

export function buildDog() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mat = toonMat();
  const torso = new THREE.Mesh(merge([
    paint(xf(G.sphere(1, 12, 9), [0, 0.42, 0], [0, 0, 0], [0.19, 0.18, 0.34]), COAT, { bottom: BELLY }),
    paint(xf(G.torus(0.13, 0.03, 5, 12), [0, 0.52, 0.27], [Math.PI / 2 - 0.3, 0, 0]), COLLAR),
    paint(xf(G.sphere(0.035, 6, 5), [0, 0.43, 0.36]), 0xffd23f),
  ]), mat);
  torso.castShadow = true; addOutline(torso, 0.016);
  body.add(torso);
  const head = new THREE.Group();
  head.position.set(0, 0.66, 0.34);
  body.add(head);
  const headMesh = new THREE.Mesh(merge([
    paint(G.sphere(0.17, 12, 9), COAT, { bottom: 0xd0923e }),
    paint(xf(G.sphere(0.1, 10, 8), [0, -0.05, 0.13], [0, 0, 0], [1, 0.8, 1.1]), BELLY),
    paint(xf(G.sphere(0.035, 8, 6), [0, -0.01, 0.24], [0, 0, 0], [1.3, 1, 1]), 0x2a1f2e),
    paint(xf(G.sphere(0.07, 8, 6), [0.14, 0.02, 0.0], [0, 0, 0.4], [0.5, 1.4, 0.35]), EAR),
    paint(xf(G.sphere(0.07, 8, 6), [-0.14, 0.02, 0.0], [0, 0, -0.4], [0.5, 1.4, 0.35]), EAR),
    paint(xf(G.sphere(0.03, 6, 5), [0.08, -0.07, 0.12], [0, 0, 0], [1, 0.6, 0.4]), 0xff9aa9),
    paint(xf(G.sphere(0.03, 6, 5), [-0.08, -0.07, 0.12], [0, 0, 0], [1, 0.6, 0.4]), 0xff9aa9),
  ]), mat);
  headMesh.castShadow = true; addOutline(headMesh, 0.014);
  head.add(headMesh);
  const eyes = new THREE.Mesh(merge([0.065, -0.065].flatMap(x => [
    paint(xf(G.sphere(0.05, 8, 6), [x, 0.05, 0.12], [0, 0, 0], [1, 1.15, 0.6]), 0xffffff),
    paint(xf(G.sphere(0.034, 8, 6), [x * 0.97, 0.045, 0.145], [0, 0, 0], [1, 1.2, 0.5]), 0x1d1622),
    paint(xf(G.sphere(0.012, 5, 4), [x * 0.97 + 0.012, 0.065, 0.165]), 0xffffff),
  ])), mat);
  head.add(eyes);
  const tongue = new THREE.Mesh(paint(xf(G.capsule(0.022, 0.05, 3, 6), [0.02, -0.12, 0.2], [1.3, 0, 0], [1, 1, 0.5]), 0xff6f91), mat);
  head.add(tongue);
  const tail = new THREE.Group();
  tail.position.set(0, 0.52, -0.32);
  const tailMesh = new THREE.Mesh(paint(xf(G.capsule(0.035, 0.2, 3, 6), [0, 0.1, -0.03], [-0.5, 0, 0]), COAT), mat);
  addOutline(tailMesh, 0.012);
  tail.add(tailMesh);
  body.add(tail);
  const legs = [];
  for (const [x, z] of [[0.1, 0.2], [-0.1, 0.2], [0.1, -0.2], [-0.1, -0.2]]) {
    const hip = new THREE.Group();
    hip.position.set(x, 0.34, z);
    const leg = new THREE.Mesh(merge([
      paint(xf(G.capsule(0.045, 0.16, 3, 6), [0, -0.13, 0]), COAT),
      paint(xf(G.sphere(0.055, 7, 5), [0, -0.29, 0.02], [0, 0, 0], [1, 0.7, 1.3]), BELLY),
    ]), mat);
    leg.castShadow = true; addOutline(leg, 0.012);
    hip.add(leg); body.add(hip); legs.push(hip);
  }
  return { root, body, head, tail, legs, tongue };
}

export class Dog {
  constructor(game) {
    this.game = game;
    this.rng = new Rng(game.sessionSeed ^ 0xd06);
    this.rig = buildDog();
    this.rig.root.visible = false;
    game.scene.add(this.rig.root);
    this.pos = { x: 0, y: 0, z: 0 };
    this.yaw = 0; this.speed = 0; this.phase = 0;
    this.mode = 'heel';     // heel | find | point | found | sit
    this.target = null;     // animal being tracked
    this.active = false;
    this.growlT = 0; this.barkT = 0; this.say = 0;
  }

  get owned() { return !!this.game.profile.gear.dog; }

  spawnNear(p) {
    this.pos.x = p.x + 1.5; this.pos.z = p.z + 1.5;
    this.pos.y = this.game.terrain.heightAt(this.pos.x, this.pos.z);
    this.mode = 'heel'; this.target = null;
  }

  /** K: "Find it!" (or call her back). */
  command() {
    const g = this.game;
    if (!this.owned) { g.ui.feed('You don\'t have a dog yet. Adopt Biscuit at the lodge (Gear tab).', 'warn'); return; }
    if (this.mode !== 'heel' && this.mode !== 'sit') { this.mode = 'heel'; this.target = null; g.ui.feed('“Biscuit, heel!” She trots back, tail going.', 'info'); return; }
    const p = g.player.pos;
    let best = null, bd = 450;
    for (const a of g.animals.list) {
      if (a.harvested || !(a.firstHitTime >= 0)) continue;
      const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
      if (d < bd) { bd = d; best = a; }
    }
    if (!best) { g.ui.feed('Biscuit sniffs around… nothing wounded out here. (Hit something first.)', 'info'); this.wag = 2; return; }
    this.target = best; this.mode = 'find';
    g.ui.feed(`“Find it, Biscuit!” She puts her nose down on the ${best.species.displayName.split(' ').pop().toLowerCase()} trail.`, 'good');
    g.audio.play('yip', this.pos);
  }

  bark(loud = 1400) {
    const g = this.game;
    g.audio.play('woof', this.pos);
    g.sounds.emit('dog', this.pos.x, this.pos.y + 0.5, this.pos.z, loud, g.time, 'player');
    this.barkT = 0.35;
  }

  step(dt) {
    const g = this.game;
    this.active = this.owned && g.state !== 'title';
    if (!this.active) return;
    const T = g.terrain, P = g.player;
    const p = P.pos;
    if (!this.placed) { this.placed = true; this.spawnNear(p); }
    const dp = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
    // lost? (fast travel, respawn, left behind on the quad)
    if (dp > 90) this.spawnNear({ x: p.x - Math.sin(-P.yaw) * 3, z: p.z - Math.cos(-P.yaw) * 3 });

    let goal = null, run = 0;
    // Fetch! Thrown boots and chickens that land nearby get brought back.
    if ((this.mode === 'heel' || this.mode === 'sit') && !P.vehicle) {
      const pr = g.weapons.props.find(q => q.resting && !q.remote && !q.carried && (q.kind === 'boot' || q.kind === 'chicken') && Math.hypot(q.x - this.pos.x, q.z - this.pos.z) < 45);
      if (pr) { this.fetching = pr; this.mode = 'fetch'; g.audio.play('yip', this.pos); }
    }
    if (this.mode === 'fetch') {
      const pr = this.fetching;
      if (!pr || !g.weapons.props.includes(pr)) { this.mode = 'heel'; this.fetching = null; }
      else if (!pr.carried) {
        const d = Math.hypot(pr.x - this.pos.x, pr.z - this.pos.z);
        if (d > 0.7) { goal = { x: pr.x, z: pr.z }; run = 6.5; }
        else { pr.carried = true; pr.resting = true; }
      } else {
        // trot back with it, tail going, and drop it at your feet
        const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
        pr.x = this.pos.x + s * 0.48; pr.y = this.pos.y + 0.55; pr.z = this.pos.z + c * 0.48;
        if (dp > 1.6) { goal = { x: p.x, z: p.z }; run = Math.min(6.5, 1.5 + dp); }
        else {
          pr.carried = false; this.fetching = null; this.mode = 'heel';
          g.weapons.pickup(pr);
          g.ui.feed(`Biscuit brought your ${pr.kind === 'boot' ? 'boot' : 'rubber chicken'} back! Good girl.`, 'good');
          g.audio.play('woof', this.pos);
        }
      }
    }
    if (this.mode === 'heel' || this.mode === 'sit') {
      const off = P.vehicle ? 4 : 2.4;
      const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
      const hx = p.x - fx * off + fz * 1.2, hz = p.z - fz * off - fx * 1.2;
      const dh = Math.hypot(hx - this.pos.x, hz - this.pos.z);
      if (dh > 1.2) { goal = { x: hx, z: hz }; run = Math.min(P.vehicle ? 13 : 7, 1.2 + dh * 0.9); this.mode = 'heel'; }
      else if (P.speed < 0.2) this.mode = 'sit';
    } else if (this.mode === 'find' || this.mode === 'point') {
      const a = this.target;
      if (!a || a.harvested) { this.mode = 'heel'; this.target = null; }
      else {
        const da = Math.hypot(a.pos.x - this.pos.x, a.pos.z - this.pos.z);
        if (a.downed) {
          if (da > 2.2) { goal = { x: a.pos.x, z: a.pos.z }; run = dp > 22 ? 0.8 : 4.2; } // wait up for the hunter
          else { this.mode = 'found'; this.bark(900); g.ui.toast(`Biscuit found the ${a.species.displayName.split(' ').pop().toLowerCase()}!`, 'big', 2.2); g.social && g.social.addPing(a.pos.x, a.pos.y, a.pos.z, 'Found it!', 0xe0a64e, 'Biscuit'); }
        } else if (da < 32) {
          // a live wounded animal close by: freeze and point rather than bump it
          if (this.mode !== 'point') { this.mode = 'point'; g.ui.feed('Biscuit is pointing. It\'s close — and still alive. Get ready.', 'warn'); }
          this.yaw = Math.atan2(a.pos.x - this.pos.x, a.pos.z - this.pos.z);
          if (da > 40) this.mode = 'find';
        } else { this.mode = 'find'; goal = { x: a.pos.x, z: a.pos.z }; run = dp > 22 ? 0.8 : 3.6; }
      }
    } else if (this.mode === 'found') {
      const a = this.target;
      if (!a || a.harvested) { this.mode = 'heel'; this.target = null; }
      else { this.barkAcc = (this.barkAcc || 0) + dt; if (this.barkAcc > 3 && dp > 6) { this.barkAcc = 0; this.bark(900); } }
    }

    // move
    if (goal) {
      const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z;
      const want = Math.atan2(dx, dz);
      let d = want - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += Math.max(-8 * dt, Math.min(8 * dt, d));
      this.speed += (run - this.speed) * Math.min(1, dt * 5);
    } else this.speed *= Math.pow(0.02, dt);
    this.pos.x += Math.sin(this.yaw) * this.speed * dt;
    this.pos.z += Math.cos(this.yaw) * this.speed * dt;
    for (const o of g.vegetation.query(this.pos.x, this.pos.z, 2, this._q || (this._q = []))) {
      if (o.soft) continue;
      const dx = this.pos.x - o.x, dz = this.pos.z - o.z, dd = Math.hypot(dx, dz), m = o.r + 0.25;
      if (dd < m && dd > 1e-4) { this.pos.x += dx / dd * (m - dd); this.pos.z += dz / dd * (m - dd); }
    }
    const ground = T.heightAt(this.pos.x, this.pos.z);
    this.swimming = WATER_LEVEL - ground > 0.45;
    this.pos.y = this.swimming ? WATER_LEVEL - 0.42 : ground;

    // danger sense: growl toward big dangerous animals (it's audible!)
    this.growlT -= dt;
    if (this.growlT <= 0 && this.mode !== 'found') {
      for (const a of g.animals.list) {
        if (!a.alive || a.downed || !(a.species.danger >= 2)) continue;
        const d = Math.hypot(a.pos.x - this.pos.x, a.pos.z - this.pos.z);
        if (d < 55) {
          this.growlT = 35;
          g.audio.play('growl_small', this.pos);
          g.sounds.emit('dog', this.pos.x, this.pos.y + 0.5, this.pos.z, 500, g.time, 'player');
          g.ui.feed(`Biscuit growls toward a ${a.species.displayName.split(' ').pop().toLowerCase()} (${d.toFixed(0)} m)!`, 'warn');
          if (this.mode === 'heel' || this.mode === 'sit') this.yaw = Math.atan2(a.pos.x - this.pos.x, a.pos.z - this.pos.z);
          break;
        }
      }
    }
    if (this.barkT > 0) this.barkT -= dt;
  }

  render(dt) {
    const r = this.rig;
    r.root.visible = this.active;
    if (!this.active) return;
    r.root.position.set(this.pos.x, this.pos.y, this.pos.z);
    r.root.rotation.set(0, this.yaw, 0);
    const sp = this.speed;
    this.phase += dt * (3 + sp * 3.5);
    const amp = Math.min(0.9, sp * 0.22);
    r.legs.forEach((l, i) => { l.rotation.x = Math.sin(this.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * amp; });
    const sit = this.mode === 'sit' || this.mode === 'found';
    this.sitK = (this.sitK || 0) + ((sit ? 1 : 0) - (this.sitK || 0)) * Math.min(1, dt * 6);
    r.body.rotation.x = -0.45 * this.sitK + (this.mode === 'point' ? 0.12 : 0);
    r.body.position.y = -0.08 * this.sitK + Math.abs(Math.sin(this.phase)) * amp * 0.04;
    if (this.sitK > 0.05) { r.legs[2].rotation.x = r.legs[3].rotation.x = -1.1 * this.sitK; r.legs[0].rotation.x = r.legs[1].rotation.x = 0.45 * this.sitK; }
    const sniff = this.mode === 'find' ? 0.55 + Math.sin(this.phase * 1.7) * 0.12 : 0;
    r.head.rotation.x = sniff - (this.barkT > 0 ? 0.35 : 0) - this.sitK * 0.1;
    r.head.rotation.z = this.mode === 'sit' ? Math.sin(this.game.visualTime * 0.7) * 0.15 : 0; // head tilt
    const wagSpeed = this.mode === 'point' ? 0 : this.mode === 'found' ? 22 : sp > 0.3 ? 10 : 6;
    r.tail.rotation.y = Math.sin(this.game.visualTime * wagSpeed) * (this.mode === 'point' ? 0 : 0.6);
    r.tail.rotation.x = this.mode === 'point' ? 0.9 : 0;
    r.tongue.visible = sp > 2 || this.mode === 'found';
  }
}
