// Weapons: aim, sway, fire, reload, and real projectile flight (gravity +
// energy-matched drag + wind on slow projectiles) into the anatomy
// simulation. Absurd gadgets are physical props or air impulses — no damage
// numbers. Also binoculars with a rangefinder.

import { evaluatePhoto } from '../game/photo.js';
import { THREE } from '../three.js';
import { WEAPONS, AMMO, dragPerMeter } from '../sim/arsenal.js';
import { Viewmodel } from './viewmodel.js';
import { G, paint, merge, xf, toonMat, addOutline } from '../render/toon.js';
import { WATER_LEVEL } from '../world/terrainData.js';
import { findPart } from '../sim/creature.js';
import { Rng } from '../core/rng.js';

const GRAV = 9.81;

function propGeo(kind) {
  if (kind === 'boot') return merge([
    paint(xf(G.box(0.14, 0.2, 0.15), [0, 0.1, 0.04]), 0x6b4a30),
    paint(xf(G.box(0.15, 0.09, 0.3), [0, 0.045, -0.04]), 0x6b4a30),
    paint(xf(G.box(0.16, 0.035, 0.31), [0, 0.0, -0.04]), 0x2a1f1a),
  ]);
  if (kind === 'honey') return merge([
    paint(xf(G.cyl(0.09, 0.08, 0.16, 10), [0, 0.08, 0]), 0xf2a72e, { bottom: 0xc97a12 }),
    paint(xf(G.cyl(0.095, 0.095, 0.04, 10), [0, 0.18, 0]), 0xe8384f),
    paint(xf(G.sphere(0.04, 6, 5), [0, 0.215, 0]), 0xe8384f),
    paint(xf(G.box(0.1, 0.06, 0.005), [0, 0.09, 0.085]), 0xfff4de),
  ]);
  if (kind === 'chicken') return merge([
    paint(xf(G.capsule(0.07, 0.24, 4, 8), [0, 0.07, 0], [Math.PI / 2, 0, 0]), 0xffd23a),
    paint(xf(G.sphere(0.06, 8, 6), [0, 0.12, -0.2]), 0xffd23a),
    paint(xf(G.cone(0.025, 0.07, 5), [0, 0.11, -0.28], [-Math.PI / 2, 0, 0]), 0xff8a2a),
    paint(xf(G.box(0.012, 0.05, 0.05), [0, 0.19, -0.2]), 0xe8384f),
    paint(xf(G.cyl(0.008, 0.008, 0.16, 4), [0.03, 0.03, 0.2], [0.6, 0, 0]), 0xff8a2a),
    paint(xf(G.cyl(0.008, 0.008, 0.16, 4), [-0.03, 0.03, 0.2], [0.6, 0, 0]), 0xff8a2a),
  ]);
  // arrow
  return merge([
    paint(xf(G.cyl(0.007, 0.007, 0.75, 5), [0, 0, 0], [Math.PI / 2, 0, 0]), 0xd9b48a),
    paint(xf(G.cone(0.018, 0.06, 4), [0, 0, -0.4], [-Math.PI / 2, 0, 0]), 0x9aa0a8),
    paint(xf(G.box(0.002, 0.04, 0.09), [0, 0.018, 0.33]), 0xff6b2c),
    paint(xf(G.box(0.04, 0.002, 0.09), [0, 0, 0.33]), 0x5bbf4a),
  ]);
}

export class Weapons {
  constructor(game) {
    this.game = game;
    this.vm = new Viewmodel(game);
    this.state = {};
    this.projectiles = [];
    this.props = [];
    this.blowers = [];
    this.aimZoom = 1;
    this.aiming = false;
    this.binoculars = false;
    this.cooldown = 0;
    this.reloading = 0;
    this.swayT = 0;
    this.sway = { x: 0, y: 0 };
    this.draw = 0;
    this.blowing = false;
    this.geos = { boot: propGeo('boot'), chicken: propGeo('chicken'), honey: propGeo('honey'), arrow: propGeo('arrow') };
    this.rng = new Rng(game.sessionSeed ^ 0x5eed);
    this.onInventoryChanged();
    this.select(game.profile.ownedWeapons()[0]);
  }

  get current() { return WEAPONS[this.currentId]; }

  onInventoryChanged() {
    for (const id of this.game.profile.ownedWeapons()) {
      if (!this.state[id]) this.state[id] = { mag: WEAPONS[id].type === 'blower' ? 1 : Math.min(WEAPONS[id].magazine, 1 + (WEAPONS[id].magazine - 1)) };
    }
  }

  select(id) {
    if (!id || !WEAPONS[id]) return;
    this.currentId = id;
    this.reloading = 0;
    this.draw = 0;
    this.vm.setWeapon(WEAPONS[id]);
    if (this.binoculars) this.binoculars = false;
    this.game.audio && this.game.audio.play('click');
  }
  selectSlot(i) { const ids = this.game.profile.ownedWeapons(); if (ids[i]) this.select(ids[i]); }
  cycle(dir) {
    const ids = this.game.profile.ownedWeapons();
    const i = ids.indexOf(this.currentId);
    this.select(ids[(i + dir + ids.length) % ids.length]);
  }

  shellType() { return this.game.profile.shells || '12ga_bird'; }

  reload() {
    const w = this.current, st = this.state[w.id], prof = this.game.profile;
    if (!w || w.type === 'blower' || w.type === 'camera' || w.type === 'spray' || this.reloading > 0) return;
    if (w.type === 'shotgun' && st.mag >= w.magazine) {
      // Full tube: R cycles the shell type instead.
      const order = w.ammoAlt;
      prof.shells = order[(order.indexOf(this.shellType()) + 1) % order.length];
      this.game.ui.feed(`Loading ${AMMO[prof.shells].name.replace(' pellet', '')} shells`, 'info');
      st.mag = 0;
    }
    if (st.mag >= w.magazine) return;
    if ((prof.ammo[w.id] || 0) <= 0) { this.game.ui.feed(`Out of ammo for the ${w.name}. Buy more at the lodge.`, 'warn'); return; }
    this.reloading = w.reloadTime;
    this.vm.reloadT = w.reloadTime;
    this.game.audio.play('reload');
  }

  finishReload() {
    const w = this.current, st = this.state[w.id], prof = this.game.profile;
    const need = w.magazine - st.mag;
    const take = Math.min(need, prof.ammo[w.id] || 0);
    st.mag += take; prof.ammo[w.id] -= take;
    prof.save();
  }

  toggleBinoculars() {
    this.binoculars = !this.binoculars;
    this.game.audio.play('click');
  }

  swayOffset() { return this.aiming || this.binoculars ? this.sway : { x: 0, y: 0 }; }

  // ------------------------------------------------------------------ tick
  step(dt, cmd) {
    const g = this.game, p = g.player, w = this.current;
    if (!w) return;
    const st = this.state[w.id];
    this.cooldown = Math.max(0, this.cooldown - dt);
    const busy = p.tumble || p.swimming || p.downed || p.getUp > 0 || p.vehicle || (g.campfires && g.campfires.roast);
    this.aiming = !!cmd.aiming && !busy && !this.binoculars;
    const zoom = this.binoculars ? 8 : this.aiming ? (w.zoom || 1) : 1;
    this.aimZoom += (zoom - this.aimZoom) * Math.min(1, dt * 12);
    if (Math.abs(this.aimZoom - zoom) < 0.01) this.aimZoom = zoom;

    // Sway grows with stance, exhaustion, injury; holding breath steadies it.
    this.swayT += dt;
    const stanceK = p.stance === 'prone' ? 0.25 : p.stance === 'crouch' ? 0.55 : 1;
    const tired = 1 + (1 - p.stamina / 100) * 1.6 + (p.hp < 50 ? 0.8 : 0);
    const breath = cmd.holdBreath && p.stamina > 5 ? 0.25 : 1;
    const moving = Math.min(1, p.speed / 2);
    const amp = 0.0045 * (w.sway || 1) * stanceK * tired * breath * (1 + moving * 2) * (this.binoculars ? 0.7 : 1) * (p.jitter > 0 ? 2.2 : 1); // Moss Cola shakes
    this.sway.x = (Math.sin(this.swayT * 0.9) + Math.sin(this.swayT * 2.3 + 1) * 0.4) * amp;
    this.sway.y = (Math.cos(this.swayT * 1.3) * 0.8 + Math.sin(this.swayT * 3.1) * 0.3) * amp * 0.8;

    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this.finishReload();
    }

    this.blowing = false;
    this.blowers.length = 0;
    if (!busy && !this.binoculars && this.reloading <= 0) {
      if (w.type === 'spray') {
        if (cmd.firePressed && this.cooldown <= 0) this.spray();
      } else if (w.type === 'camera') {
        if (cmd.firePressed && this.cooldown <= 0) this.snap();
      } else if (w.type === 'blower') {
        if (cmd.fire) this.blow(dt);
      } else if (w.type === 'bow') {
        if (cmd.fire && st.mag > 0) this.draw = Math.min(1, this.draw + dt / (w.drawTime || 0.8));
        else if (this.draw > 0) {
          if (this.draw > 0.25 && st.mag > 0 && this.cooldown <= 0) this.fire(this.draw);
          this.draw = 0;
        }
      } else if (w.type === 'thrown') {
        if (cmd.fire) this.draw = Math.min(1, this.draw + dt * 1.6);
        else if (this.draw > 0) { if (this.cooldown <= 0) this.throwProp(Math.max(0.35, this.draw)); this.draw = 0; }
      } else if (cmd.firePressed && this.cooldown <= 0) {
        if (st.mag > 0) this.fire(1);
        else { this.game.audio.play('click'); this.reload(); }
      }
    }
    this.stepProjectiles(dt);
    this.stepProps(dt);
  }

  aimRay() {
    const g = this.game;
    const cam = g.camera;
    const origin = cam.position.clone();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    return { origin, dir };
  }

  fire(power = 1) {
    const g = this.game, p = g.player, w = this.current, st = this.state[w.id];
    const ammoId = w.type === 'shotgun' ? this.shellType() : w.ammo;
    const ammo = AMMO[ammoId];
    st.mag--;
    this.cooldown = w.fireInterval;
    g.profile.stats.shots++;
    const { origin, dir } = this.aimRay();
    const pellets = w.pellets ? w.pellets[ammoId] : 1;
    const spread = w.pellets ? w.pelletSpread[ammoId] : w.spread * (this.aiming ? 1 : 3.5);
    const klass = w.klassByAmmo ? w.klassByAmmo[ammoId] : w.klass;
    const speedMul = w.type === 'bow' ? 0.55 + 0.45 * power : 1;
    for (let i = 0; i < pellets; i++) {
      const d = dir.clone();
      d.x += this.rng.range(-spread, spread); d.y += this.rng.range(-spread, spread); d.z += this.rng.range(-spread, spread);
      d.normalize();
      this.spawnProjectile({ origin, dir: d, ammoId, weaponId: w.id, klass, speed: ammo.muzzleVelocityMps * speedMul, owner: g.coop.myId(), arrow: w.type === 'bow', tracer: i === 0 && w.type !== 'bow' });
    }
    // Recoil: physical kick into the view.
    p.pitch += w.recoil * 0.035 * (p.stance === 'prone' ? 0.5 : 1);
    p.yaw += this.rng.range(-0.5, 0.5) * w.recoil * 0.01;
    this.vm.fired(w.recoil);
    if (w.type === 'rifle' && w.id !== 'lever_4570' && w.id !== 'rimfire_22') { this.vm.cycleT = 1; setTimeout(() => g.audio.play('bolt'), 350); }
    g.fx.shake = Math.max(g.fx.shake, w.recoil * 0.15);
    const sound = w.type === 'shotgun' ? 'shotgun' : w.type === 'bow' ? 'bow' : w.id === 'rimfire_22' ? 'rimfire' : 'rifle';
    g.audio.play(sound, null, { gain: w.klass >= 4 ? 1.2 : 1 });
    // The shot is a world event every animal can hear.
    if (w.type === 'bow') g.sounds.emit('equipment', p.pos.x, p.pos.y + 1.3, p.pos.z, w.loudness, g.time, 'player');
    else { g.sounds.emit('gunshot', p.pos.x, p.pos.y + 1.3, p.pos.z, w.loudness, g.time, 'player'); g.fx.flushBirds(p.pos.x, p.pos.z); }
    g.coop.broadcastEvent('shot', { x: p.pos.x, y: p.pos.y + 1.3, z: p.pos.z, w: w.id, dx: dir.x, dy: dir.y, dz: dir.z, a: ammoId });
    if (st.mag <= 0 && (g.profile.ammo[w.id] || 0) > 0 && w.type !== 'bow') setTimeout(() => this.currentId === w.id && this.reload(), 450);
    if (w.type === 'bow' && st.mag <= 0) this.reload();
  }

  spawnProjectile({ origin, dir, ammoId, weaponId, klass, speed, owner, arrow = false, tracer = false, remote = false }) {
    const pr = {
      x: origin.x + dir.x * 0.4, y: origin.y + dir.y * 0.4, z: origin.z + dir.z * 0.4,
      vx: dir.x * speed, vy: dir.y * speed, vz: dir.z * speed, speed,
      ammoId, weaponId, klass, owner, traveled: 0, life: 4, ox: origin.x, oz: origin.z, remote,
      tracer, arrow,
    };
    if (arrow) {
      pr.mesh = new THREE.Mesh(this.geos.arrow, toonMat());
      this.game.scene.add(pr.mesh);
    }
    this.projectiles.push(pr);
    return pr;
  }

  stepProjectiles(dt) {
    const g = this.game, T = g.terrain;
    const wind = g.wind.vec();
    const keep = [];
    for (const pr of this.projectiles) {
      const ammo = AMMO[pr.ammoId];
      const k = dragPerMeter(ammo);
      const sub = pr.speed > 300 ? 1 : 2;
      let done = false;
      for (let s = 0; s < sub && !done; s++) {
        const h = dt / sub;
        const ax = pr.x, ay = pr.y, az = pr.z;
        // drag: dv/dt = -k v^2 (matches energy half-distance); wind nudges light, slow things
        const decay = Math.exp(-k * pr.speed * h);
        pr.vx *= decay; pr.vy *= decay; pr.vz *= decay;
        pr.vy -= GRAV * h;
        const windK = pr.speed < 150 ? 0.06 : 0.004;
        pr.vx += wind.x * g.wind.speed * windK * h * 10; pr.vz += wind.z * g.wind.speed * windK * h * 10;
        pr.speed = Math.hypot(pr.vx, pr.vy, pr.vz);
        pr.x += pr.vx * h; pr.y += pr.vy * h; pr.z += pr.vz * h;
        const segLen = Math.hypot(pr.x - ax, pr.y - ay, pr.z - az);
        pr.traveled += segLen;
        pr.x0 = ax; pr.y0 = ay; pr.z0 = az;
        if (pr.tracer && !pr.tracerShown) { pr.tracerShown = true; g.fx.tracer(ax, ay - 0.05, az, pr.x, pr.y, pr.z); }

        // 1) animals (host resolves anatomy; guests forward the shot)
        const guest = g.coop.isGuest();
        const hit = pr.remote && guest ? null : g.animals.resolveProjectile(pr, ax, ay, az, pr.x, pr.y, pr.z);
        // 2) other hunters (friendly fire -> cartoon tumble)
        const hh = g.coop.resolveHunterHit(pr, ax, ay, az, pr.x, pr.y, pr.z);
        // 3) trees & rocks
        const tb = g.vegetation.segmentBlocked(ax, ay, az, pr.x, pr.y, pr.z);
        // 4) terrain / water
        let tg = -1, surf = 'dirt';
        const steps = Math.max(1, Math.ceil(segLen / 1.5));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const x = ax + (pr.x - ax) * t, y = ay + (pr.y - ay) * t, z = az + (pr.z - az) * t;
          const gh = T.heightAt(x, z);
          if (y < Math.max(gh, WATER_LEVEL) ) { tg = t; surf = gh < WATER_LEVEL ? 'water' : T.biomeAt(x, z) === 5 ? 'rock' : 'dirt'; break; }
        }
        const tHit = hit ? hit.t / Math.max(1e-6, segLen) : 2;
        const tHunter = hh ? hh.t : 2;
        const tTree = tb >= 0 ? tb : 2;
        const tGround = tg >= 0 ? tg : 2;
        const first = Math.min(tHit, tHunter, tTree, tGround);
        if (first > 1) continue;
        const ix = ax + (pr.x - ax) * first, iy = ay + (pr.y - ay) * first, iz = az + (pr.z - az) * first;
        if (first === tHit && guest) {
          // Guests only show the splash; the host simulates the real hit.
          g.fx.bloodHit(ix, iy, iz, { x: pr.vx / pr.speed, y: 0, z: pr.vz / pr.speed }, 0.6, false);
          if (pr.mesh) this.game.scene.remove(pr.mesh);
          done = true;
        } else if (first === tHit) {
          pr.traveled -= segLen * (1 - first);
          const report = g.animals.applyHit(hit, pr);
          const msg = this.shotMessage(hit.animal, report);
          if (pr.remote) g.coop.sendTo(pr.owner, 'report', { msg });
          else g.ui.toast(msg, 'hit');
          if (report.exit && report.exitEnergy > 40 && !report.blunt) {
            // Overpenetration: the round keeps going with what's left.
            const scale = Math.sqrt(report.exitEnergy / (0.5 * ammo.massKg * pr.speed * pr.speed));
            pr.vx *= scale; pr.vy *= scale; pr.vz *= scale; pr.speed *= scale;
            pr.x = ix + pr.vx / pr.speed * 1.5; pr.y = iy + pr.vy / pr.speed * 1.5; pr.z = iz + pr.vz / pr.speed * 1.5;
            pr.tracer = false;
            continue;
          }
          if (pr.mesh) this.stickArrow(pr, ix, iy, iz, hit.animal);
          done = true;
        } else if (first === tHunter) {
          g.coop.applyHunterHit(hh, pr);
          done = true;
        } else {
          g.fx.impact(ix, iy, iz, first === tTree ? 'wood' : surf);
          if (pr.mesh) { this.stickArrow(pr, ix, iy, iz, null); }
          done = true;
        }
      }
      pr.life -= dt;
      if (!done && pr.life > 0 && pr.y > -50) {
        keep.push(pr);
        if (pr.mesh) { pr.mesh.position.set(pr.x, pr.y, pr.z); pr.mesh.lookAt(pr.x - pr.vx, pr.y - pr.vy, pr.z - pr.vz); }
      } else if (!done && pr.mesh) this.game.scene.remove(pr.mesh);
    }
    this.projectiles = keep;
  }

  stickArrow(pr, x, y, z, animal) {
    const m = pr.mesh;
    m.position.set(x, y, z);
    m.lookAt(x - pr.vx, y - pr.vy, z - pr.vz);
    if (animal) {
      m.updateMatrix();
      animal.rig.body.updateWorldMatrix(true, false);
      const inv = new THREE.Matrix4().copy(animal.rig.body.matrixWorld).invert();
      m.applyMatrix4(inv);
      animal.rig.body.add(m);
    } else {
      // Arrows that miss are pickups (retrieve your arrows!).
      this.props.push({ kind: 'arrow', mesh: m, x, y, z, vx: 0, vy: 0, vz: 0, resting: true, label: 'arrow', weaponId: pr.weaponId });
    }
  }

  // ------------------------------------------------------------------ thrown props
  throwProp(power) {
    const g = this.game, p = g.player, w = this.current, st = this.state[w.id];
    if (st.mag <= 0) {
      if ((g.profile.ammo[w.id] || 0) > 0) { g.profile.ammo[w.id]--; st.mag = 1; }
      else { g.ui.feed(`No more ${w.name}s. Go find the ones you threw!`, 'warn'); return; }
    }
    st.mag--;
    this.cooldown = w.fireInterval;
    const { origin, dir } = this.aimRay();
    const speed = w.throwSpeed * (0.45 + power * 0.55);
    const kind = w.id === 'boot' ? 'boot' : w.id === 'honey' ? 'honey' : 'chicken';
    const mesh = new THREE.Mesh(this.geos[kind], toonMat());
    mesh.castShadow = true;
    addOutline(mesh, 0.012);
    g.scene.add(mesh);
    this.props.push({ kind, mesh, x: origin.x + dir.x * 0.5, y: origin.y + dir.y * 0.5 - 0.1, z: origin.z + dir.z * 0.5, vx: dir.x * speed + p.vel.x, vy: dir.y * speed + 2.5, vz: dir.z * speed + p.vel.z, spin: 8 + Math.random() * 6, resting: false, label: w.name, weaponId: w.id, age: 0, owner: g.coop.myId() });
    g.audio.play('throw');
    if (kind === 'chicken') { g.audio.play('squeak', null, { pitch: 1.2 }); }
    g.coop.broadcastEvent('throw', { k: kind, x: origin.x, y: origin.y, z: origin.z, vx: dir.x * speed, vy: dir.y * speed + 2.5, vz: dir.z * speed });
    if (st.mag <= 0 && (g.profile.ammo[w.id] || 0) > 0) { g.profile.ammo[w.id]--; st.mag = 1; }
  }

  spawnRemoteProp(kind, x, y, z, vx, vy, vz) {
    const mesh = new THREE.Mesh(this.geos[kind], toonMat());
    this.game.scene.add(mesh);
    this.props.push({ kind, mesh, x, y, z, vx, vy, vz, spin: 9, resting: false, label: kind, remote: true, age: 0 });
  }

  stepProps(dt) {
    const g = this.game, T = g.terrain;
    for (const pr of this.props) {
      pr.age = (pr.age || 0) + dt;
      if (pr.resting) continue;
      pr.vy -= GRAV * dt;
      const ax = pr.x, ay = pr.y, az = pr.z;
      pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.z += pr.vz * dt;
      // hit an animal? (blunt event through the same anatomy pipeline)
      if (!pr.hitAnimal && !pr.remote && pr.kind !== 'hat' && !pr.noHit) {
        const fake = { ammoId: pr.kind === 'boot' ? 'throwing_boot' : 'rubber_chicken', // (a honey jar bonks like a chicken)
          weaponId: pr.weaponId, klass: 0, owner: pr.owner, traveled: Math.hypot(pr.x - g.player.pos.x, pr.z - g.player.pos.z), speed: Math.hypot(pr.vx, pr.vy, pr.vz), ox: g.player.pos.x, oz: g.player.pos.z, x0: ax, y0: ay, z0: az };
        const hit = g.animals.resolveProjectile(fake, ax, ay, az, pr.x, pr.y, pr.z);
        if (hit) {
          pr.hitAnimal = true;
          g.animals.applyHit(hit, fake);
          g.jobs.onEvent('bonk', { sp: hit.animal.species.id, prop: pr.kind });
          pr.vx *= -0.3; pr.vz *= -0.3; pr.vy = 2;
          g.ui.toast(pr.kind === 'boot' ? 'BONK!' : 'SQUEAK!', 'hit');
        }
      }
      const gh = Math.max(T.heightAt(pr.x, pr.z), pr.kind === 'chicken' ? WATER_LEVEL - 0.05 : -99);
      if (pr.y < gh + 0.05) {
        pr.y = gh + 0.05;
        const impact = -pr.vy;
        if (pr.kind === 'honey' && !pr.lured) {
          pr.lured = true; pr.noPickup = true;
          g.animals.addLure(pr.x, pr.z);
          g.fx.splat(pr.x, pr.z, 0.7, 0xf2a72e, 200);
          g.audio.play('splat', pr);
        }
        if (impact > 1.5 && pr.kind !== 'hat' && pr.kind !== 'honey') {
          if (pr.kind === 'chicken') {
            g.audio.play('squeak', pr, { pitch: 0.8 + Math.random() * 0.5 });
            g.sounds.emit('squeak', pr.x, pr.y, pr.z, 900, g.time, pr.owner || 'player');
          } else {
            g.audio.play('bonk', pr);
            g.sounds.emit('equipment', pr.x, pr.y, pr.z, 150, g.time, pr.owner || 'player');
          }
        }
        pr.vy = impact * (pr.kind === 'chicken' ? 0.55 : 0.25);
        pr.vx *= 0.6; pr.vz *= 0.6; pr.spin *= 0.6;
        if (Math.hypot(pr.vx, pr.vz) < 0.3 && pr.vy < 0.8) { pr.resting = true; pr.vy = 0; }
      }
    }
  }

  nearestPickup(pos, r) {
    let best = null, bd = r;
    for (const pr of this.props) {
      if (!pr.resting || pr.remote || pr.noPickup || pr.carried) continue;
      const d = Math.hypot(pr.x - pos.x, pr.z - pos.z);
      if (d < bd) { bd = d; best = pr; }
    }
    return best;
  }

  pickup(pr) {
    const g = this.game;
    g.scene.remove(pr.mesh);
    this.props = this.props.filter(x => x !== pr);
    if (pr.kind === 'hat') { g.restoreHat(); return; }
    if (pr.kind === 'loot') { g.animals.returnLoot(pr.loot); return; }
    const id = pr.kind === 'arrow' ? pr.weaponId : pr.weaponId || (pr.kind === 'boot' ? 'boot' : 'chicken');
    if (g.profile.owned.includes(id)) g.profile.ammo[id] = (g.profile.ammo[id] || 0) + 1;
    g.audio.play('click');
    g.ui.feed(`Picked up the ${pr.label}.`, 'info');
  }

  // ------------------------------------------------------------------ bear spray
  spray() {
    const g = this.game, p = g.player, w = this.current, st = this.state[w.id];
    if (st.mag <= 0) {
      if ((g.profile.ammo[w.id] || 0) > 0) { g.profile.ammo[w.id]--; st.mag = 1; }
      else { g.audio.play('click'); g.ui.feed('Out of bear spray. The lodge sells more.', 'warn'); this.cooldown = 0.4; return; }
    }
    st.mag--;
    this.cooldown = w.fireInterval;
    const { origin, dir } = this.aimRay();
    g.audio.play('spray', p.pos);
    g.sounds.emit('equipment', p.pos.x, p.pos.y + 1, p.pos.z, w.loudness, g.time, 'player');
    // a fat orange cloud rolling out along the aim
    for (let i = 1; i <= 6; i++) {
      const d = i * 1.15;
      g.fx.burst(origin.x + dir.x * d, origin.y + dir.y * d - 0.2, origin.z + dir.z * d, { count: 3, color: i % 2 ? 0xffa040 : 0xffc070, speed: 0.6 + i * 0.15, up: 0.6, kind: 'smoke', size: 0.35 + i * 0.12 });
    }
    let hits = 0;
    for (const a of g.animals.list) {
      if (!a.alive || a.downed) continue;
      const dx = a.pos.x - p.pos.x, dz = a.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > w.range + a.radius || d < 0.1 || (dx * dir.x + dz * dir.z) / d < 0.7) continue;
      hits++;
      a.daze = 2.2; g.fx.dazed(a, 2.2);
      a.setThreat(p.pos.x, p.pos.z, 'player');
      a.sprayedUntil = g.time + 30; a.retreatUntil = g.time + 60;
      setTimeout(() => g.audio.play('sneeze', a.pos), 250 + hits * 120);
      g.jobs.onEvent('spray', { sp: a.species.id });
    }
    if (hits) g.ui.toast(hits > 1 ? `${hits} faces full of pepper!` : 'Right in the snoot!', 'hit');
    // friends in the cloud cough and stagger
    for (const r of g.coop.peers.values()) {
      if (!r.target) continue;
      const dx = r.target.x - p.pos.x, dz = r.target.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d < w.range && d > 0.1 && (dx * dir.x + dz * dir.z) / d > 0.7) { g.coop.sendTo(r.peer, 'sprayed', { n: g.profile.name }); g.ui.toast(`You pepper-sprayed ${r.name}. Oops.`, 'big'); }
    }
    if (st.mag <= 0 && (g.profile.ammo[w.id] || 0) > 0) { g.profile.ammo[w.id]--; st.mag = 1; }
  }

  // ------------------------------------------------------------------ camera
  snap() {
    const g = this.game, p = g.player;
    this.cooldown = this.current.fireInterval;
    g.audio.play('shutter');
    const dark = g.light < 0.55;
    // The shutter (and the flash, in the dark) is a small world event.
    g.sounds.emit('equipment', p.pos.x, p.pos.y + 1.3, p.pos.z, dark ? 90 : 25, g.time, 'player');
    g.pendingPhoto = { res: evaluatePhoto(g), dark };
    g.ui.photoFlash(dark);
  }

  // ------------------------------------------------------------------ leaf blower
  blow(dt) {
    const g = this.game, p = g.player;
    this.blowing = true;
    const { origin, dir } = this.aimRay();
    const range = this.current.range, force = this.current.force;
    this.blowers.push({ x: p.pos.x, z: p.pos.z, dx: dir.x, dz: dir.z, range });
    this.blowAcc = (this.blowAcc || 0) + dt;
    if (this.blowAcc > 0.4) { this.blowAcc = 0; g.sounds.emit('blower', p.pos.x, p.pos.y + 1, p.pos.z, 2500, g.time, 'player'); }
    // leaves & dust
    if (Math.random() < 0.6) g.fx.burst(origin.x + dir.x * 1.2, origin.y + dir.y * 1.2 - 0.3, origin.z + dir.z * 1.2, { count: 1, color: Math.random() < 0.5 ? 0x9bc95a : 0xe0a040, speed: 1, up: 1, kind: 'feather', size: 0.08, dir: { x: dir.x * 3, y: dir.y, z: dir.z * 3 } });
    // Push anything light in the cone. Force scales inversely with mass.
    for (const a of g.animals.list) {
      if (a.harvested) continue;
      const dx = a.pos.x - p.pos.x, dz = a.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > range || d < 0.1) continue;
      if ((dx * dir.x + dz * dir.z) / d < 0.8) continue;
      const mass = a.identity.bodyMassKg;
      const f = force * (1 - d / range) / Math.max(1, mass / 8);
      a.push.x += dir.x * f * dt * 8; a.push.z += dir.z * f * dt * 8;
      if (a.alive) { a.alertness = Math.min(100, a.alertness + 40 * dt); a.setThreat(p.pos.x, p.pos.z, 'player'); }
    }
    for (const pr of this.props) {
      const dx = pr.x - p.pos.x, dz = pr.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > range || d < 0.1 || (dx * dir.x + dz * dir.z) / d < 0.75) continue;
      pr.resting = false;
      const f = force * (1 - d / range);
      pr.vx += dir.x * f * dt; pr.vz += dir.z * f * dt; pr.vy += f * 0.3 * dt;
    }
    g.coop.blowAt(p.pos, dir, range, force, dt);
    // Newton says the blower shoves you back a little, too.
    p.vel.x -= dir.x * 1.5 * dt; p.vel.z -= dir.z * 1.5 * dt;
  }

  // ------------------------------------------------------------------ feedback
  shotMessage(animal, report) {
    const parts = report.regions;
    const set = new Set(parts);
    let msg = 'Hit';
    if (report.blunt) msg = parts.includes('brain') ? 'Bonk on the noggin!' : 'Bonk!';
    else if (set.has('heart')) msg = 'Heart shot!';
    else if (set.has('brain')) msg = 'Brain shot — lights out.';
    else if (set.has('lungL') && set.has('lungR')) msg = 'Double lung!';
    else if (set.has('lungL') || set.has('lungR')) msg = report.organs.includes('lung') ? 'Lung hit!' : 'Stopped in the shoulder.';
    else if (set.has('neck')) msg = 'Neck — major vessel!';
    else if (set.has('trophy')) msg = `Hit the ${animal.species.trophy.label}!`;
    else if (set.has('spine')) msg = 'Spine hit!';
    else if (set.has('gut')) msg = 'Gut shot… it will run.';
    else if ([...set].some(r => r.startsWith('leg'))) msg = 'Leg hit — it is limping!';
    if (report.exit && !report.blunt) msg += ' (pass-through)';
    if (!report.blunt && !report.organs.length && !report.killedOutright && !msg.includes('Leg') && !msg.includes('Hit the')) msg += ' — no organs reached';
    return msg;
  }

  rangeReadout() {
    const g = this.game;
    const { origin, dir } = this.aimRay();
    const far = origin.clone().addScaledVector(dir, 600);
    const fake = { ammoId: '308_soft_point' };
    const hit = g.animals.resolveProjectile(fake, origin.x, origin.y, origin.z, far.x, far.y, far.z);
    let dist = null;
    for (let d = 2; d < 600; d += 2) {
      const x = origin.x + dir.x * d, y = origin.y + dir.y * d, z = origin.z + dir.z * d;
      if (y < g.terrain.heightAt(x, z)) { dist = d; break; }
    }
    if (hit && (dist === null || hit.t < dist)) {
      const a = hit.animal;
      const q = a.identity.biologicalQuality;
      const est = q > 85 ? 'Potential Platinum' : q > 70 ? 'Looks like Gold' : q > 50 ? 'Silver-ish' : 'Modest';
      const wounded = a.creature.wounds.length ? ' · WOUNDED' : '';
      const state = a.downed ? ' · DOWN' : a.state === 'Calm' ? '' : ` · ${a.state.toLowerCase()}`;
      return { dist: hit.t, text: `${hit.t.toFixed(0)} m\n${a.species.displayName} · ${a.identity.sex} · ${a.identity.ageClass}\n${est} (${Math.round(a.identity.trophySize01 * 100)}/100 ${a.species.trophy.label})${state}${wounded}` };
    }
    return { dist, text: dist ? `${dist.toFixed(0)} m` : '— m' };
  }

  viewmodelVisible() {
    const w = this.current;
    if (this.game.campfires && this.game.campfires.roast) return !this.game.player.swimming;
    if (!w) return false;
    const scoped = this.aiming && (w.zoom >= 3 || w.type === 'camera');
    return !scoped && !this.game.player.swimming;
  }

  render(dt) {
    const w = this.current;
    this.vm.update(dt, { aiming: this.aiming, binoculars: this.binoculars, draw: this.draw, throwWind: w && w.type === 'thrown' ? this.draw : 0, hideThrown: w && w.type === 'thrown' && this.state[w.id] && this.state[w.id].mag <= 0 && !(this.game.profile.ammo[w.id] > 0) });
    for (const pr of this.props) {
      if (pr.kind === 'arrow' && pr.resting) continue;
      if (pr.carried) { pr.mesh.position.set(pr.x, pr.y, pr.z); continue; }
      pr.mesh.position.set(pr.x, pr.y, pr.z);
      if (!pr.resting) { pr.mesh.rotation.x += pr.spin * dt; pr.mesh.rotation.z += pr.spin * 0.5 * dt; }
    }
  }
}
