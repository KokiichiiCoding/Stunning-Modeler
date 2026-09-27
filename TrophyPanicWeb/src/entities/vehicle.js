// ATV quad bikes: arcade terrain-following physics with real consequences.
// Crests launch you, steep side-slopes roll you, trees stop you (and throw
// you), and the engine is a world sound every animal can hear.

import { THREE } from '../three.js';
import { G, paint, merge, xf, toonMat, addOutline } from '../render/toon.js';
import { POIS, WATER_LEVEL, HALF } from '../world/terrainData.js';
import { applyBluntImpulse } from '../sim/creature.js';
import { Rng } from '../core/rng.js';

const GRAV = 18;
const WHEELS = [[0.62, 0.9], [-0.62, 0.9], [0.62, -0.78], [-0.62, -0.78]]; // x (left), z (fwd)
const RIDE = 0.48;
const MAX_FWD = 17, MAX_REV = 5;

function atvGeometry(color) {
  const dark = 0x2a2a30;
  return merge([
    paint(xf(G.box(1.0, 0.36, 1.5), [0, 0.62, 0.05]), color, { bottom: 0xb8401e }),
    paint(xf(G.box(1.25, 0.12, 0.62), [0, 0.86, 0.72]), color),       // front fender
    paint(xf(G.box(1.25, 0.12, 0.62), [0, 0.86, -0.66]), color),      // rear fender
    paint(xf(G.box(0.5, 0.2, 0.7), [0, 0.9, -0.05]), 0x3a2f2a),        // seat
    paint(xf(G.box(0.9, 0.08, 0.5), [0, 0.98, -0.74]), 0x5a5f6a),      // rear rack
    paint(xf(G.cyl(0.05, 0.05, 0.4, 6), [0, 1.05, 0.62], [0.35, 0, 0]), dark),
    paint(xf(G.cyl(0.035, 0.035, 0.9, 6), [0, 1.22, 0.7], [0, 0, Math.PI / 2]), dark), // handlebar
    paint(xf(G.sphere(0.07, 8, 6), [0.45, 1.22, 0.7]), 0x222222),
    paint(xf(G.sphere(0.07, 8, 6), [-0.45, 1.22, 0.7]), 0x222222),
    paint(xf(G.sphere(0.1, 10, 8), [0, 0.8, 0.86], [0, 0, 0], [1.4, 1, 0.6]), 0xfff4b0), // headlight
    paint(xf(G.box(0.3, 0.14, 0.05), [0, 0.6, -0.72]), 0xe8384f),     // tail light
    paint(xf(G.box(0.3, 0.12, 0.02), [0, 0.7, 0.82]), 0xffffff),      // number plate sticker
  ]);
}

function wheelGeometry() {
  return merge([
    paint(xf(G.cyl(0.36, 0.36, 0.32, 14), [0, 0, 0], [0, 0, Math.PI / 2]), 0x2a2a30),
    paint(xf(G.cyl(0.18, 0.18, 0.34, 10), [0, 0, 0], [0, 0, Math.PI / 2]), 0xd9d4c8),
    paint(xf(G.box(0.34, 0.08, 0.5), [0, 0, 0]), 0x3a3a42),
  ]);
}

export class Vehicle {
  constructor(game, x, z, yaw, color, id) {
    this.game = game;
    this.id = id;
    this.pos = { x, y: game.terrain.heightAt(x, z) + RIDE, z };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = yaw; this.pitch = 0; this.roll = 0;
    this.spin = { p: 0, r: 0, y: 0 };
    this.steer = 0;
    this.wheelSpin = 0;
    this.airborne = false;
    this.crashed = false;
    this.driver = null;
    this.home = { x, z, yaw };
    this.rng = new Rng(game.sessionSeed ^ (x * 131 + z * 7919) | 0);
    this.group = new THREE.Group();
    const body = new THREE.Mesh(atvGeometry(color), toonMat());
    body.castShadow = true;
    addOutline(body, 0.02);
    this.group.add(body);
    this.wheels = [];
    const wg = wheelGeometry();
    for (const [x0, z0] of WHEELS) {
      const pivot = new THREE.Group();
      pivot.position.set(x0 * 1.05, 0.36, z0);
      const w = new THREE.Mesh(wg, toonMat());
      w.castShadow = true;
      addOutline(w, 0.016);
      pivot.add(w);
      this.group.add(pivot);
      this.wheels.push({ pivot, mesh: w, front: z0 > 0 });
    }
    game.scene.add(this.group);
  }

  forward() { return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) }; }
  speed() { return Math.hypot(this.vel.x, this.vel.z); }

  wheelWorld(x0, z0) {
    const f = this.forward();
    return { x: this.pos.x + f.x * z0 + f.z * x0, z: this.pos.z + f.z * z0 - f.x * x0 };
  }

  step(dt, cmd) {
    const T = this.game.terrain;
    const f = this.forward();
    const hs = WHEELS.map(([x0, z0]) => { const w = this.wheelWorld(x0 * 1.05, z0); return Math.max(T.heightAt(w.x, w.z), WATER_LEVEL - 0.6); });
    const groundY = (hs[0] + hs[1] + hs[2] + hs[3]) / 4 + RIDE;
    const gPitch = Math.atan2((hs[0] + hs[1]) / 2 - (hs[2] + hs[3]) / 2, 1.68);
    const gRoll = Math.atan2((hs[0] + hs[2]) / 2 - (hs[1] + hs[3]) / 2, 1.3);

    if (this.crashed) {
      // Tumbling wreck: spin, bounce, settle on its side.
      this.vel.y -= GRAV * dt;
      this.pos.x += this.vel.x * dt; this.pos.y += this.vel.y * dt; this.pos.z += this.vel.z * dt;
      this.pitch += this.spin.p * dt; this.roll += this.spin.r * dt; this.yaw += this.spin.y * dt;
      if (this.pos.y < groundY - 0.1) {
        this.pos.y = groundY - 0.1;
        this.vel.y = Math.abs(this.vel.y) * 0.25;
        this.vel.x *= 0.6; this.vel.z *= 0.6;
        this.spin.p *= 0.6; this.spin.r *= 0.6; this.spin.y *= 0.6;
        if (Math.abs(this.vel.y) < 0.5 && this.speed() < 0.5) {
          this.spin.p = this.spin.r = this.spin.y = 0;
          this.vel.x = this.vel.z = this.vel.y = 0;
        }
      }
      this.collide(dt);
      return;
    }

    const driving = !!this.driver;
    const throttle = driving ? cmd.throttle || 0 : 0;
    const steerIn = driving ? cmd.steer || 0 : 0;
    this.steer += (steerIn - this.steer) * Math.min(1, dt * 6);
    let vf = this.vel.x * f.x + this.vel.z * f.z;
    const side = { x: f.z, z: -f.x };
    let vs = this.vel.x * side.x + this.vel.z * side.z;

    if (!this.airborne) {
      if (throttle > 0) vf += (vf < 0 ? 16 : 9.5 * (1 - Math.max(0, vf) / MAX_FWD)) * dt;
      else if (throttle < 0) vf -= (vf > 0 ? 16 : 6 * (1 + vf / MAX_REV)) * dt;
      else vf *= Math.pow(0.55, dt);
      if (cmd && cmd.handbrake && driving) { vf *= Math.pow(0.08, dt); vs *= Math.pow(0.6, dt); }
      else vs *= Math.pow(0.004, dt); // tyres grip sideways (a little drift survives)
      // gravity along the slope
      const n = T.normalAt(this.pos.x, this.pos.z);
      vf += (n.x * f.x + n.z * f.z) * GRAV * 0.55 * dt;
      vs += (n.x * side.x + n.z * side.z) * GRAV * 0.35 * dt;
      // the biome matters: marsh and brush drag, trails are fast
      const cost = T.costAt(this.pos.x, this.pos.z);
      vf *= Math.pow(1 / Math.max(1, cost), dt * 0.9);
      // deep water: it wades, slowly and resentfully
      const depth = WATER_LEVEL - T.heightAt(this.pos.x, this.pos.z);
      if (depth > 0.4) {
        vf *= Math.pow(0.15, dt * Math.min(2.5, depth));
        this.splashT = (this.splashT || 0) - dt;
        if (this.splashT <= 0 && Math.abs(vf) > 1) { this.splashT = 0.4; this.game.audio.play('splash', this.pos); }
      }
      this.yaw -= this.steer * 1.9 * dt * Math.max(-0.6, Math.min(1, vf / 6));
      const nf = this.forward();
      const nsd = { x: nf.z, z: -nf.x };
      this.vel.x = nf.x * vf + nsd.x * vs;
      this.vel.z = nf.z * vf + nsd.z * vs;
      // follow the ground; leaving it fast over a crest means air time
      const prevY = this.pos.y;
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
      const hs2 = WHEELS.map(([x0, z0]) => { const w = this.wheelWorld(x0 * 1.05, z0); return Math.max(T.heightAt(w.x, w.z), WATER_LEVEL - 0.6); });
      const gy2 = (hs2[0] + hs2[1] + hs2[2] + hs2[3]) / 4 + RIDE;
      const climb = (gy2 - prevY) / dt;
      // Leave the ground when it drops away faster than gravity can pull us
      // down after it (a crest taken fast), not just for going downhill.
      const lastClimb = this.lastClimb ?? climb;
      if ((climb - lastClimb) / dt < -GRAV * 2.2 && Math.abs(vf) > 6 && lastClimb > -2) {
        this.airborne = true;
        this.airT = 0;
        this.vel.y = lastClimb;
        this.spin.p = -0.25; this.spin.r = this.rng.range(-0.2, 0.2);
      } else {
        this.pos.y = gy2;
        this.vel.y = climb;
        this.lastClimb = climb;
        this.pitch += (gPitch - this.pitch) * Math.min(1, dt * 10);
        this.roll += (gRoll - this.roll) * Math.min(1, dt * 10);
      }
      // Too steep sideways at speed: over it goes.
      if (Math.abs(gRoll) > 0.72 && this.speed() > 3) this.crash('It rolled over!');
      if (Math.abs(gPitch) > 0.95) this.crash('Too steep! Everybody off!');
    } else {
      this.vel.y -= GRAV * dt;
      this.pos.x += this.vel.x * dt; this.pos.y += this.vel.y * dt; this.pos.z += this.vel.z * dt;
      this.pitch += this.spin.p * dt; this.roll += this.spin.r * dt;
      this.airT += dt;
      if (driving) { this.spin.p += -throttle * 1.2 * dt; this.spin.r += steerIn * 0.8 * dt; } // mid-air tricks
      if (this.pos.y <= groundY) {
        this.pos.y = groundY;
        const bad = Math.abs(this.pitch - gPitch) > 0.9 || Math.abs(this.roll - gRoll) > 0.8 || this.vel.y < -13;
        this.airborne = false;
        this.lastClimb = undefined;
        if (this.airT > 0.25) this.game.audio.play('bonk', this.pos);
        if (bad) this.crash('Stuck the landing! (with your face)');
        else {
          this.vel.y = 0; this.spin.p = this.spin.r = 0;
          if (driving) this.game.jobs.onEvent('air', { t: this.airT });
          if (driving && this.airT > 0.6) this.game.ui.toast(this.airT > 1.4 ? `HUGE air! ${this.airT.toFixed(1)} s` : 'Nice air!', 'hit');
        }
      }
    }
    this.pos.x = Math.max(-HALF + 8, Math.min(HALF - 8, this.pos.x));
    this.pos.z = Math.max(-HALF + 8, Math.min(HALF - 8, this.pos.z));
    this.collide(dt);
    this.wheelSpin += vf * dt / 0.36;

    // The engine is loud — every animal nearby hears it.
    if (driving) {
      this.noiseAcc = (this.noiseAcc || 0) + dt;
      if (this.noiseAcc > 0.5) {
        this.noiseAcc = 0;
        this.game.sounds.emit('engine', this.pos.x, this.pos.y, this.pos.z, 1200 + this.speed() * 120, this.game.time, 'player');
      }
    }
  }

  collide(dt) {
    const g = this.game;
    const sp = this.speed();
    for (const o of g.vegetation.query(this.pos.x, this.pos.z, 4, this._q || (this._q = []))) {
      if (o.soft) continue;
      const dx = this.pos.x - o.x, dz = this.pos.z - o.z;
      const d = Math.hypot(dx, dz), min = o.r + 0.95;
      if (d < min && d > 1e-4) {
        this.pos.x += dx / d * (min - d); this.pos.z += dz / d * (min - d);
        const vn = (this.vel.x * dx + this.vel.z * dz) / d;
        if (vn < 0) {
          this.vel.x -= vn * dx / d * 1.4; this.vel.z -= vn * dz / d * 1.4;
          if (-vn > 2) g.audio.play('wood', this.pos);
          if (-vn > 7.5 && !this.crashed) this.crash('Tree 1, ATV 0.');
        }
      }
    }
    // Bonk animals: a blunt impulse through the same anatomy pipeline.
    for (const a of g.animals.list) {
      if (a.harvested) continue;
      const dx = a.pos.x - this.pos.x, dz = a.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz), min = a.radius + 0.9;
      if (d >= min || d < 1e-4) continue;
      const rel = sp;
      if (rel > 3.5 && !(a.lastBonk > g.time - 1)) {
        a.lastBonk = g.time;
        const energy = 0.5 * 300 * rel * rel * 0.05; // a glancing share of a 300 kg machine's energy
        applyBluntImpulse(a.creature, energy, a.species.regions.legFL[0]);
        a.push.x += dx / d * rel * 0.8 * Math.min(1, 150 / a.identity.bodyMassKg);
        a.push.z += dz / d * rel * 0.8 * Math.min(1, 150 / a.identity.bodyMassKg);
        a.alertness = 100; a.setThreat(this.pos.x, this.pos.z, 'player');
        if (a.identity.bodyMassKg < 30) { a.daze = 3; g.fx.dazed(a, 3); }
        g.audio.play('bonk', a.pos);
        if (this.driver) g.ui.toast(`BONK! You hit a ${a.species.displayName.split(' ').pop().toLowerCase()} with a quad bike.`, 'hit');
        this.vel.x *= 0.6; this.vel.z *= 0.6;
        if (a.identity.bodyMassKg > 250 && rel > 6 && !this.crashed) this.crash('The moose did not move. You did.');
      }
      this.pos.x -= dx / d * (min - d) * 0.5; this.pos.z -= dz / d * (min - d) * 0.5;
    }
  }

  crash(msg) {
    if (this.crashed) return;
    this.crashed = true;
    this.lastCrash = msg;
    this.airborne = false;
    const g = this.game;
    const R = this.rng;
    this.spin = { p: R.range(-3, 3), r: (R.chance(0.5) ? -1 : 1) * R.range(3, 7), y: R.range(-1.5, 1.5) };
    this.vel.y = Math.max(this.vel.y, 3);
    g.audio.play('bonk', this.pos); g.audio.play('wood', this.pos);
    g.fx.burst(this.pos.x, this.pos.y, this.pos.z, { count: 14, kind: 'dirt', color: 0x9b7a55, speed: 4, up: 4, size: 0.1 });
    g.sounds.emit('bodyfall', this.pos.x, this.pos.y, this.pos.z, 600, g.time, 'player');
    if (this.driver) {
      const d = this.driver;
      this.exit(true);
      d.startTumble(this.vel.x * 0.9, 4 + this.speed() * 0.2, this.vel.z * 0.9);
      const dmg = Math.max(0, this.speed() - 5) * 2.2;
      if (dmg > 0) d.hurt({ blunt: dmg, source: 'a quad bike accident' });
      g.ui.toast(msg, 'big', 2.4);
    }
  }

  unflip() {
    this.crashed = false;
    this.pitch = 0; this.roll = 0;
    this.spin = { p: 0, r: 0, y: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.pos.y = this.game.terrain.heightAt(this.pos.x, this.pos.z) + RIDE + 0.2;
    this.game.audio.play('boing', this.pos);
  }

  enter(player) {
    if (this.crashed) { this.unflip(); this.game.ui.feed('You heave the quad back onto its wheels.', 'info'); return false; }
    this.driver = player;
    player.vehicle = this;
    player.yaw = this.yaw + Math.PI; player.pitch = -0.08; player._vYaw = this.yaw;
    this.mountedAt = this.game.time;
    player.stance = 'stand';
    this.game.ui.feed('Vroom. (Animals can hear that engine a long way off.)', 'info');
    this.game.audio.startEngine && this.game.audio.startEngine();
    return true;
  }

  exit(ejected = false) {
    const p = this.driver;
    if (!p) return;
    this.driver = null;
    p.vehicle = null;
    p._vYaw = undefined;
    const f = this.forward();
    if (!ejected) {
      // step off to the left, keeping injuries (spawnAt would heal you)
      p.pos.x = this.pos.x + f.z * 1.4; p.pos.z = this.pos.z - f.x * 1.4;
      p.pos.y = this.game.terrain.heightAt(p.pos.x, p.pos.z) + 0.05;
      p.vel.x = p.vel.y = p.vel.z = 0;
    } else {
      p.pos.x = this.pos.x; p.pos.y = this.pos.y + 1; p.pos.z = this.pos.z;
    }
    this.game.audio.stopEngine && this.game.audio.stopEngine();
  }

  seat() {
    // rider sits slightly behind centre, above the seat
    const f = this.forward();
    return { x: this.pos.x - f.x * 0.1, y: this.pos.y + 0.55, z: this.pos.z - f.z * 0.1 };
  }

  render() {
    const g = this.group;
    g.position.set(this.pos.x, this.pos.y - RIDE, this.pos.z);
    g.rotation.order = 'YXZ';
    g.rotation.set(-this.pitch, this.yaw, this.roll);
    for (const w of this.wheels) {
      w.mesh.rotation.x = this.wheelSpin;
      w.pivot.rotation.y = w.front ? this.steer * 0.45 : 0;
    }
  }
}

export class Vehicles {
  constructor(game) {
    this.game = game;
    this.list = [];
    const colors = [0xff6b2c, 0x4fb4f0, 0x8fd14f, 0xff7fbf, 0xffc93a];
    POIS.forEach((p, i) => {
      const s = p.spawn || { x: p.x, z: p.z + p.r * 0.5, yaw: 0 };
      const f = { x: Math.sin(s.yaw), z: Math.cos(s.yaw) };
      const x = s.x + f.z * 4, z = s.z - f.x * 4;
      this.list.push(new Vehicle(game, x, z, s.yaw + Math.PI, colors[i % colors.length], 'atv_' + p.id));
    });
  }
  nearest(pos, r) {
    let best = null, bd = r;
    const t = this.game.time;
    for (const v of this.list) {
      if (v.remoteT && t - v.remoteT < 1) continue; // a friend is riding it
      const d = Math.hypot(v.pos.x - pos.x, v.pos.z - pos.z); if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  step(dt, cmd) {
    const g = this.game;
    for (const v of this.list) {
      if (!v.driver && v.remoteT && g.time - v.remoteT < 1) {
        // a party member is riding it: coop poses it; wildlife still hears it
        v.noiseAcc = (v.noiseAcc || 0) + dt;
        if (v.noiseAcc > 0.5) { v.noiseAcc = 0; g.sounds.emit('engine', v.pos.x, v.pos.y, v.pos.z, 1200 + 8 * 120, g.time, 'remote'); }
        continue;
      }
      v.step(dt, v.driver ? cmd : null);
    }
  }
  render() {
    const cam = this.game.camera.position;
    for (const v of this.list) {
      v.group.visible = Math.hypot(v.pos.x - cam.x, v.pos.z - cam.z) < 400;
      if (v.group.visible) v.render();
    }
  }
}
