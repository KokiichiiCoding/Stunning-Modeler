// The local hunter's body: movement, stance, stamina, swimming, sliding,
// falling, knockdowns ("ragdoll-lite" tumbles) and a small injury model.
// Clumsiness comes from forces — steep slopes, hard landings, a moose —
// never from random control sabotage.

import { WATER_LEVEL, HALF } from '../world/terrainData.js';
import { movementLoudness } from '../sim/worldsim.js';

const GRAV = 22;
export const EYE = { stand: 1.36, crouch: 0.95, prone: 0.42 };

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0; this.pitch = 0;
    this.stance = 'stand';
    this.stamina = 100;
    this.staminaDelay = 0;
    this.grounded = false;
    this.swimming = false;
    this.onTower = null;
    this.hp = 100;
    this.bleed = 0;           // hp per second
    this.bandaging = 0;
    this.tumble = null;       // {t, spin:{x,y,z}, rot:{x,y,z}, settle}
    this.getUp = 0;
    this.downed = false;
    this.noise = 0;
    this.visibility = 0;
    this.speed = 0;
    this.stepAcc = 0;
    this.scentAcc = 0;
    this.scentMult = 1;
    this.scentTimer = 0;
    this.lastFallSpeed = 0;
    this.jitter = 0;
    this.slide = 0;
    this.invuln = 0;
  }

  spawnAt(x, z, yaw = 0) {
    const t = this.game.terrain;
    this.pos.x = x; this.pos.z = z; this.pos.y = t.heightAt(x, z) + 0.05;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.yaw = yaw; this.pitch = 0;
    this.stance = 'stand';
    this.tumble = null; this.getUp = 0; this.downed = false;
    this.hp = 100; this.bleed = 0; this.stamina = 100;
    this.onTower = null;
  }

  eyeHeight() {
    if (this.swimming) return 0.55;
    const target = EYE[this.stance];
    this._eye = this._eye === undefined ? target : this._eye + (target - this._eye) * 0.18;
    return this._eye;
  }

  eyePos() {
    const e = this.tumble ? 0.5 : this.eyeHeight();
    return { x: this.pos.x, y: this.pos.y + e, z: this.pos.z };
  }

  forward() {
    const cp = Math.cos(this.pitch);
    return { x: -Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * cp };
  }

  /** Blunt/cut injuries with a knockback impulse (m/s). */
  hurt({ blunt = 0, cut = 0, knock = null, source = '' }) {
    if (this.downed || this.invuln > 0) return;
    const dmg = blunt * 0.55 + cut * 0.45;
    this.hp -= dmg;
    this.bleed = Math.min(6, this.bleed + cut * 0.035);
    this.game.fx && this.game.fx.playerHurt(dmg);
    this.lastHurtBy = source;
    if (knock) {
      const k = Math.hypot(knock.x, knock.z);
      if (k > 5.5 || blunt > 25) { this.startTumble(knock.x, Math.max(knock.y || 0, 3 + k * 0.25), knock.z); this.invuln = 2.2; }
      else { this.vel.x += knock.x * 0.5; this.vel.z += knock.z * 0.5; this.invuln = 0.6; }
    }
    if (this.hp <= 0) { this.hp = 0; this.downed = true; this.game.onPlayerDowned(source); }
  }

  startTumble(vx, vy, vz) {
    if (this.tumble) { this.tumble.vel.x += vx; this.tumble.vel.y += vy; this.tumble.vel.z += vz; return; }
    this.stance = 'stand';
    this.tumble = {
      t: 0,
      vel: { x: this.vel.x + vx, y: this.vel.y + vy, z: this.vel.z + vz },
      spin: { x: (Math.random() - 0.5) * 14, y: (Math.random() - 0.5) * 8, z: (Math.random() - 0.5) * 14 },
      rot: { x: 0, y: this.yaw, z: 0 },
    };
    this.game.audio && this.game.audio.play('oof', { x: this.pos.x, y: this.pos.y, z: this.pos.z });
    this.game.sounds.emit('bodyfall', this.pos.x, this.pos.y, this.pos.z, 60, this.game.time, 'player');
  }

  step(dt, cmd) {
    const g = this.game;
    const T = g.terrain;
    if (this.downed) return;
    if (this.invuln > 0) this.invuln -= dt;

    // --- injuries ------------------------------------------------------
    if (this.bleed > 0) {
      this.hp -= this.bleed * dt;
      this.bleedDropAcc = (this.bleedDropAcc || 0) + this.bleed * dt;
      if (this.bleedDropAcc > 1.2) {
        this.bleedDropAcc = 0;
        g.evidence.add({ kind: 'BloodDrop', x: this.pos.x, y: this.pos.y, z: this.pos.z, time: g.time, base: 0.7, species: 'hunter', who: 'player' });
      }
      if (this.hp <= 0) { this.hp = 0; this.downed = true; g.onPlayerDowned('blood loss'); return; }
    } else if (this.hp < 100) this.hp = Math.min(100, this.hp + 0.6 * dt);
    if (this.bandaging > 0) {
      this.bandaging -= dt;
      if (this.bandaging <= 0) { this.bleed = 0; g.ui.feed('Bandaged. Mostly.', 'good'); }
    }
    if (this.scentTimer > 0) { this.scentTimer -= dt; if (this.scentTimer <= 0) this.scentMult = 1; }

    if (this.tumble) { this.stepTumble(dt, cmd); this.emitSigns(dt); return; }
    if (this.getUp > 0) { this.getUp -= dt; }

    // --- stance --------------------------------------------------------
    if (cmd.crouch) this.stance = this.stance === 'crouch' ? 'stand' : 'crouch';
    if (cmd.prone) this.stance = this.stance === 'prone' ? 'stand' : 'prone';
    if (cmd.sprint && this.stance !== 'stand' && (cmd.moveX || cmd.moveZ)) this.stance = 'stand';

    const depth = WATER_LEVEL - T.heightAt(this.pos.x, this.pos.z);
    this.swimming = depth > 1.05 && !this.onTower;
    if (this.swimming) this.stance = 'stand';

    // --- desired velocity ---------------------------------------------
    let speed = this.stance === 'prone' ? 0.65 : this.stance === 'crouch' ? 1.6 : 3.1;
    const wantsSprint = cmd.sprint && this.stance === 'stand' && (cmd.moveZ > 0) && this.stamina > 1 && !cmd.aiming;
    if (wantsSprint) speed = 6.4;
    if (this.swimming) speed = 1.7;
    if (cmd.aiming && !this.swimming) speed *= 0.5;
    const biomeCost = this.onTower ? 1 : T.costAt(this.pos.x, this.pos.z);
    if (!this.swimming) speed /= Math.max(1, biomeCost * 0.8);
    if (this.hp < 35) speed *= 0.8;
    if (depth > 0.3 && !this.swimming) speed *= 0.7; // wading

    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let mx = cmd.moveX || 0, mz = cmd.moveZ || 0;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const wishX = (-sy * mz + cy * mx) * speed;
    const wishZ = (-cy * mz - sy * mx) * speed;
    const accel = this.grounded || this.swimming ? 16 : 3;
    this.vel.x += (wishX - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wishZ - this.vel.z) * Math.min(1, accel * dt);

    // --- stamina -------------------------------------------------------
    const moving = Math.hypot(this.vel.x, this.vel.z) > 0.3;
    if ((wantsSprint && moving) || this.swimming) { this.stamina -= (this.swimming ? 5 : 15) * dt; this.staminaDelay = 1.0; }
    else if (cmd.holdBreath) { this.stamina -= 12 * dt; this.staminaDelay = 0.8; }
    else if ((this.staminaDelay -= dt) <= 0) this.stamina += (this.stance === 'stand' ? 12 : 18) * dt;
    this.stamina = Math.min(100, Math.max(0, this.stamina));

    // --- jump ----------------------------------------------------------
    if (cmd.jump && this.grounded && this.stance === 'stand' && this.stamina > 6 && !this.swimming) {
      this.vel.y = 6.2; this.grounded = false; this.stamina -= 6;
      if (this.onTower) this.onTower = null;
    }

    // --- slopes: steep ground makes you slide; slide fast and you tumble --
    if (this.grounded && !this.swimming && !this.onTower) {
      const n = T.normalAt(this.pos.x, this.pos.z);
      if (n.y < 0.74) {
        const k = (0.74 - n.y) * 60;
        this.vel.x += n.x * k * dt;
        this.vel.z += n.z * k * dt;
        this.slide = Math.hypot(this.vel.x, this.vel.z);
        if (this.slide > 9.5) { this.startTumble(this.vel.x * 0.2, 2, this.vel.z * 0.2); g.ui.feed('Whoops — down the hill!', 'warn'); return; }
      } else this.slide = 0;
    }

    // --- integrate -----------------------------------------------------
    this.vel.y -= GRAV * dt;
    if (this.swimming) {
      const surface = WATER_LEVEL - 1.0;
      this.vel.y += (surface - this.pos.y) * 30 * dt;
      this.vel.y *= 0.85;
    }
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;
    this.collide(0.34);
    this.pos.x = Math.max(-HALF + 6, Math.min(HALF - 6, this.pos.x));
    this.pos.z = Math.max(-HALF + 6, Math.min(HALF - 6, this.pos.z));

    // ground & towers
    let ground = T.heightAt(this.pos.x, this.pos.z);
    this.onTower = null;
    for (const tw of g.structures.towers) {
      if (Math.abs(this.pos.x - tw.x) < 1.2 && Math.abs(this.pos.z - tw.z) < 1.2 && this.pos.y >= tw.top - 0.6) { ground = tw.top; this.onTower = tw; }
    }
    if (this.pos.y <= ground) {
      const impact = -this.vel.y;
      this.pos.y = ground;
      if (!this.grounded && impact > 12.5) {
        const dmg = (impact - 12.5) * 7;
        this.hurt({ blunt: dmg / 0.55, source: 'a hard landing' });
        this.startTumble(this.vel.x * 0.4, 2, this.vel.z * 0.4);
        g.ui.feed('SPLAT. That was a long way down.', 'warn');
      }
      this.vel.y = 0;
      this.grounded = true;
    } else if (this.pos.y > ground + 0.25) {
      this.grounded = false;
    } else if (this.vel.y <= 0) {
      this.pos.y = ground; this.vel.y = 0; this.grounded = true;
    }

    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.emitSigns(dt);
  }

  collide(radius) {
    const g = this.game;
    for (const o of g.vegetation.query(this.pos.x, this.pos.z, 3, this._q || (this._q = []))) {
      if (o.soft) continue;
      if (this.pos.y > o.y + o.h) continue;
      const dx = this.pos.x - o.x, dz = this.pos.z - o.z;
      const d = Math.hypot(dx, dz);
      const min = o.r + radius;
      if (d < min && d > 1e-5) {
        const push = (min - d);
        this.pos.x += dx / d * push; this.pos.z += dz / d * push;
        const vn = (this.vel.x * dx + this.vel.z * dz) / d;
        if (vn < 0) { this.vel.x -= vn * dx / d; this.vel.z -= vn * dz / d; }
      }
    }
    for (const a of g.animals.list) {
      if (!a.alive && !a.downed) continue;
      const dx = this.pos.x - a.pos.x, dz = this.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      const min = a.radius + radius;
      if (d < min && d > 1e-5) { this.pos.x += dx / d * (min - d); this.pos.z += dz / d * (min - d); }
    }
  }

  stepTumble(dt, cmd) {
    const g = this.game, T = g.terrain, tb = this.tumble;
    tb.t += dt;
    tb.vel.y -= GRAV * dt;
    this.pos.x += tb.vel.x * dt; this.pos.y += tb.vel.y * dt; this.pos.z += tb.vel.z * dt;
    this.collide(0.4);
    this.pos.x = Math.max(-HALF + 6, Math.min(HALF - 6, this.pos.x));
    this.pos.z = Math.max(-HALF + 6, Math.min(HALF - 6, this.pos.z));
    tb.rot.x += tb.spin.x * dt; tb.rot.y += tb.spin.y * dt; tb.rot.z += tb.spin.z * dt;
    const ground = Math.max(T.heightAt(this.pos.x, this.pos.z), this.swimming ? WATER_LEVEL - 1 : -99);
    if (this.pos.y <= ground) {
      this.pos.y = ground;
      if (tb.vel.y < -3) {
        g.audio && g.audio.play('bonk', this.pos);
        tb.spin.x *= -0.6; tb.spin.z *= -0.6;
      }
      tb.vel.y = Math.max(0, -tb.vel.y * 0.35);
      // Slopes keep you rolling downhill.
      const n = T.normalAt(this.pos.x, this.pos.z);
      tb.vel.x += n.x * 9 * dt; tb.vel.z += n.z * 9 * dt;
      tb.vel.x *= Math.pow(0.18, dt); tb.vel.z *= Math.pow(0.18, dt);
      tb.spin.x *= Math.pow(0.08, dt); tb.spin.y *= Math.pow(0.08, dt); tb.spin.z *= Math.pow(0.08, dt);
    }
    const slow = Math.hypot(tb.vel.x, tb.vel.z) < 0.9 && Math.abs(tb.vel.y) < 0.5;
    if (tb.t > 1.2 && slow && (cmd.anyKey || tb.t > 3.2)) {
      this.tumble = null;
      this.getUp = 0.5;
      this.vel.x = this.vel.y = this.vel.z = 0;
      this.grounded = true;
    }
  }

  emitSigns(dt) {
    const g = this.game, T = g.terrain;
    // Footsteps are physical world events: animals hear them.
    const veg = T.coverAt(this.pos.x, this.pos.z);
    const loud = this.tumble ? 3 : movementLoudness(this.stance, this.speed, veg);
    this.noise = Math.min(1, loud / 2.2);
    this.stepAcc += dt * Math.max(0.2, this.speed) * 0.55;
    if (this.speed > 0.3 && this.stepAcc > 1) {
      this.stepAcc = 0;
      if (loud > 0.02) g.sounds.emit('footstep', this.pos.x, this.pos.y, this.pos.z, loud, g.time, 'player');
      g.audio && g.audio.footstep(this.pos, this.speed, T.biomeAt(this.pos.x, this.pos.z), this.stance, this.swimming);
      // The hunter leaves tracks too (useful for co-op friends looking for you).
      if (!this.swimming && this.speed > 0.8 && Math.random() < 0.5) {
        const f = this.forward();
        g.evidence.add({ kind: 'Footprint', x: this.pos.x, y: this.pos.y, z: this.pos.z, dirX: f.x, dirZ: f.z, time: g.time, base: 0.6, species: 'hunter', who: 'player', gait: this.speed > 4 ? 'Run' : 'Walk', printCm: 26, stride: 0.7 });
      }
    }
    this.scentAcc += dt;
    if (this.scentAcc > 0.5) {
      this.scentAcc = 0;
      const s = (1 + this.bleed * 1.5) * this.scentMult;
      g.scent.emit(this.pos.x, this.pos.z, s, 'player', g.time);
    }
    const cover = this.onTower ? 0.6 : T.coverAt(this.pos.x, this.pos.z);
    const stanceF = this.stance === 'prone' ? 0.3 : this.stance === 'crouch' ? 0.55 : 1;
    this.visibility = Math.min(1, (0.15 + 0.85 * Math.min(1, this.speed / 4)) * stanceF * (1 - cover * 0.9) * 1.6);
  }
}
