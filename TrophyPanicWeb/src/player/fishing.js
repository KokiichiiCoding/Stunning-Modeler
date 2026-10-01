// Fishing: hold click to wind up a cast, let go to fling the bobber. Wait
// for a bite (little nibbles first), click when it plunges to set the hook,
// then hold click to reel. The fish fights in bursts: reel through a burst
// and the line snaps; let go and it swims off. Land it and you hold it up
// for the camera. Sometimes it's a boot.

import { THREE } from '../three.js';
import { G, paint, merge, xf, toonMat, addOutline } from '../render/toon.js';
import { WATER_LEVEL, LAKE } from '../world/terrainData.js';
import { Rng } from '../core/rng.js';

export const FISH = [
  { id: 'perch', name: 'Sunny Perch', kg: [0.15, 0.7], fight: 0.3, value: 14, where: ['lake', 'river'], w: 5, col: 0xf2c94c, belly: 0xfff1c0, stripe: 0x5a7a2a },
  { id: 'trout', name: 'Rainbow Trout', kg: [0.5, 3.5], fight: 0.55, value: 32, where: ['river', 'lake'], w: 4, col: 0x9fb8a0, belly: 0xf4efe6, stripe: 0xff7a9a },
  { id: 'bass', name: 'Bucketmouth Bass', kg: [0.6, 4.5], fight: 0.62, value: 36, where: ['lake'], w: 3, col: 0x6f8f3a, belly: 0xe8e4c0, stripe: 0x3a4a22, bigMouth: true },
  { id: 'pike', name: 'Grumpy Pike', kg: [2, 12], fight: 0.85, value: 75, where: ['lake', 'river'], w: 1.6, col: 0x7a9a5a, belly: 0xe8e0a0, stripe: 0xc8d890, teeth: true, long: true },
  { id: 'sturgeon', name: 'Old Man Sturgeon', kg: [15, 60], fight: 1.0, value: 190, where: ['lake', 'river'], w: 0.35, col: 0x6a6a74, belly: 0xb8b8c0, stripe: 0x4a4a50, long: true, whiskers: true },
  { id: 'koi', name: 'Golden Koi', kg: [2, 8], fight: 0.7, value: 420, where: ['lake'], w: 0.07, col: 0xffb020, belly: 0xffffff, stripe: 0xff5a2a, legendary: true },
  { id: 'boot', name: 'Soggy Boot', junk: true, kg: [0.6, 0.9], fight: 0.12, value: 0, where: ['lake', 'river'], w: 0.9 },
  { id: 'can', name: 'Tin Can', junk: true, kg: [0.05, 0.1], fight: 0.08, value: 1, where: ['lake', 'river'], w: 0.6 },
  { id: 'duck', name: 'Rubber Duck', junk: true, kg: [0.1, 0.1], fight: 0.1, value: 5, where: ['lake'], w: 0.3 },
];

/** A cartoon fish (or junk) mesh, roughly 1 unit long for a 1 kg fish. */
export function buildFish(f) {
  const parts = [];
  if (f.id === 'boot') {
    parts.push(paint(xf(G.box(0.12, 0.2, 0.12), [0, 0.06, -0.04]), 0x6b4a30), paint(xf(G.box(0.12, 0.08, 0.26), [0, -0.06, 0.03]), 0x6b4a30), paint(xf(G.box(0.13, 0.03, 0.27), [0, -0.105, 0.03]), 0x2a2220));
    parts.push(paint(xf(G.box(0.03, 0.05, 0.03), [0.03, 0.17, -0.04], [0, 0, 0.6]), 0x8fbf4a)); // pondweed
  } else if (f.id === 'can') {
    parts.push(paint(xf(G.cyl(0.05, 0.05, 0.14, 10), [0, 0, 0], [0, 0, Math.PI / 2]), 0xb8bcc4), paint(xf(G.cyl(0.051, 0.051, 0.07, 10), [0, 0, 0], [0, 0, Math.PI / 2]), 0xe8384f));
  } else if (f.id === 'duck') {
    parts.push(paint(xf(G.sphere(0.09, 10, 8), [0, 0, 0], [0, 0, 0], [1.2, 0.85, 1]), 0xffd23f), paint(xf(G.sphere(0.06, 10, 8), [0.07, 0.08, 0]), 0xffd23f),
      paint(xf(G.box(0.05, 0.015, 0.04), [0.13, 0.075, 0]), 0xff8a2a), paint(xf(G.sphere(0.012, 6, 5), [0.1, 0.1, 0.035]), 0x1d1622), paint(xf(G.sphere(0.012, 6, 5), [0.1, 0.1, -0.035]), 0x1d1622));
  } else {
    const L = f.long ? 0.5 : 0.36, Hh = f.long ? 0.1 : 0.14;
    parts.push(paint(xf(G.sphere(0.5, 14, 10), [0, 0, 0], [0, 0, 0], [L, Hh, Hh * 0.7]), f.col, { bottom: f.belly }));
    parts.push(paint(xf(G.sphere(0.5, 12, 6), [0, 0.005, 0], [0, 0, 0], [L * 0.75, Hh * 0.35, Hh * 0.72]), f.stripe)); // side stripe
    parts.push(paint(xf(G.cone(Hh * 0.55, L * 0.32, 4), [-L * 0.55, 0, 0], [0, 0, Math.PI / 2], [1, 1, 0.25]), f.col)); // tail
    parts.push(paint(xf(G.cone(Hh * 0.3, L * 0.22, 4), [-0.02, Hh * 0.5, 0], [0, 0, 0.5], [1, 1, 0.2]), f.stripe)); // dorsal
    for (const s of [-1, 1]) {
      parts.push(paint(xf(G.sphere(Hh * 0.2, 8, 6), [L * 0.33, Hh * 0.12, s * Hh * 0.3]), 0xffffff));
      parts.push(paint(xf(G.sphere(Hh * 0.11, 6, 5), [L * 0.36, Hh * 0.12, s * Hh * 0.38]), 0x1d1622));
    }
    if (f.bigMouth) parts.push(paint(xf(G.sphere(Hh * 0.3, 8, 6), [L * 0.48, -Hh * 0.1, 0], [0, 0, 0], [0.6, 0.8, 1.1]), 0x3a1a22));
    if (f.teeth) for (let i = 0; i < 4; i++) parts.push(paint(xf(G.cone(0.012, 0.035, 4), [L * 0.42 + i * 0.02, -Hh * 0.18, (i % 2 ? 1 : -1) * 0.02], [Math.PI, 0, 0]), 0xfffbef));
    if (f.whiskers) for (const s of [-1, 1]) parts.push(paint(xf(G.cyl(0.004, 0.004, 0.1, 4), [L * 0.5, -Hh * 0.35, s * 0.03], [0.6 * s, 0, 0.5]), 0x2a2a30));
    if (f.legendary) parts.push(paint(xf(G.torus(0.06, 0.012, 4, 10), [0, Hh * 0.75, 0], [Math.PI / 2, 0, 0]), 0xfff1a0)); // a tiny halo, obviously
  }
  const m = new THREE.Mesh(merge(parts), toonMat());
  addOutline(m, 0.01);
  return m;
}

function buildBobber() {
  const m = new THREE.Mesh(merge([
    paint(xf(G.sphere(0.07, 10, 6), [0, 0.02, 0]), 0xe8384f, { bottom: 0xffffff }),
    paint(xf(G.cyl(0.008, 0.008, 0.08, 5), [0, 0.1, 0]), 0x2a2a30),
  ]), toonMat());
  addOutline(m, 0.008);
  return m;
}

const SEG = 14;

export class Fishing {
  constructor(game) {
    this.game = game;
    this.state = 'idle';     // idle | flying | float | bite | fight | show | landed
    this.rng = new Rng(game.sessionSeed ^ 0xf154);
    this.draw = 0;
    this.bobber = buildBobber();
    this.bobber.visible = false;
    game.scene.add(this.bobber);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SEG * 3), 3));
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xf6f2e8 }));
    this.line.frustumCulled = false; this.line.visible = false;
    game.scene.add(this.line);
    this.b = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    this.tip = new THREE.Vector3();
    this.meter = document.createElement('div');
    this.meter.id = 'fish-meter';
    this.meter.innerHTML = '<b>LINE TENSION</b><div class="fm-bar"><i class="fm-fill"></i></div><div class="fm-dist"></div><em>Hold click: reel · let go when it pulls hard</em>';
    this.meter.style.display = 'none';
    document.getElementById('hud').appendChild(this.meter);
    this.fill = this.meter.querySelector('.fm-fill');
    this.distEl = this.meter.querySelector('.fm-dist');
  }

  get active() { return this.state !== 'idle'; }

  /** Lake, river or nothing at this spot. */
  waterAt(x, z) {
    const h = this.game.terrain.heightAt(x, z);
    if (h > WATER_LEVEL - 0.2) return null;
    return Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 25 ? 'lake' : 'river';
  }

  reset(msg) {
    this.state = 'idle'; this.draw = 0; this.fish = null;
    this.bobber.visible = false; this.line.visible = false; this.meter.style.display = 'none';
    if (this.held) { this.game.viewScene.remove(this.held); this.held = null; }
    if (msg) this.game.ui.feed(msg, 'info');
  }

  // -------------------------------------------------------------- sim
  step(dt, cmd) {
    const g = this.game, p = g.player, b = this.b;
    switch (this.state) {
      case 'idle':
        if (cmd.fire) this.draw = Math.min(1, this.draw + dt * 1.2);
        else if (this.draw > 0) { this.cast(Math.max(0.25, this.draw)); this.draw = 0; }
        break;
      case 'flying': {
        b.vy -= 9.8 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        const water = this.waterAt(b.x, b.z);
        const floor = water ? WATER_LEVEL : g.terrain.heightAt(b.x, b.z);
        if (b.y <= floor) {
          b.y = floor;
          if (water) {
            this.state = 'float'; this.water = water; this.t = 0;
            this.wait = this.rng.range(4, 13) * (g.period === 'dawn' || g.period === 'dusk' ? 0.6 : 1) * (g.weather.rain > 0.3 ? 0.75 : 1);
            this.nibbleT = this.rng.range(1, 3);
            g.audio.play('splash', b);
            g.fx.burst(b.x, b.y + 0.05, b.z, { count: 6, color: 0xcfeaff, speed: 1.5, up: 1.5, kind: 'smoke', size: 0.08 });
          } else { this.reset('Plonk. You caught… the ground.'); g.audio.play('dirt', b); }
        }
        if (cmd.firePressed) this.reset();
        break;
      }
      case 'float': {
        this.t += dt;
        this.wait -= dt; this.nibbleT -= dt;
        this.dip = Math.max(0, (this.dip || 0) - dt * 0.6);
        if (this.nibbleT <= 0) { this.nibbleT = this.rng.range(1.2, 3.5); this.dip = 0.05; g.audio.play('click', b); }
        if (this.wait <= 0) {
          this.state = 'bite'; this.biteT = 1.3; this.dip = 0.22;
          g.audio.play('splash', b); g.ui.toast('BITE! CLICK!', 'hit', 1.1);
          g.fx.burst(b.x, b.y + 0.05, b.z, { count: 10, color: 0xcfeaff, speed: 2, up: 2, kind: 'smoke', size: 0.1 });
        }
        if (cmd.firePressed) this.reset(this.t < 1.5 ? null : 'You reel in an empty hook.');
        if (Math.hypot(b.x - p.pos.x, b.z - p.pos.z) > 45) this.reset('Your line ran out. Reel in closer to the water.');
        break;
      }
      case 'bite':
        this.biteT -= dt;
        if (cmd.firePressed) this.hook();
        else if (this.biteT <= 0) { this.state = 'float'; this.wait = this.rng.range(3, 9); this.dip = 0; g.ui.feed('Too slow! Something nibbled the bait clean off. (New bait, free.)', 'info'); }
        break;
      case 'fight': this.fight(dt, cmd); break;
      case 'show':
        // admire it… or slap someone with it
        this.showT -= dt; this.slapT = Math.max(0, (this.slapT || 0) - dt);
        if (cmd.firePressed && this.slapT <= 0 && this.showT < 7.6) this.slap();
        if (this.showT <= 0) this.reset();
        break;
    }
    if (this.state !== 'idle' && this.state !== 'show' && Math.hypot(b.x - p.pos.x, b.z - p.pos.z) > 60) this.reset();
  }

  cast(power) {
    const g = this.game, b = this.b, p = g.player;
    const origin = p.eyePos(), dir = p.forward();
    const sp = 6 + power * 14;
    Object.assign(b, { x: origin.x + dir.x * 0.8, y: origin.y + 0.4, z: origin.z + dir.z * 0.8, vx: dir.x * sp, vy: dir.y * sp + 4, vz: dir.z * sp });
    this.state = 'flying';
    this.bobber.visible = true; this.line.visible = true;
    g.audio.play('throw'); g.sounds.emit('equipment', origin.x, origin.y, origin.z, 60, g.time, 'player');
  }

  hook() {
    const g = this.game, b = this.b, p = g.player;
    const pool = FISH.filter(f => f.where.includes(this.water));
    const f = this.rng.weighted(pool.map(x => ({ w: x.w * (x.id === 'pike' || x.id === 'sturgeon' ? (g.period === 'night' || g.period === 'dusk' ? 2 : 1) : 1), v: x })));
    const u = Math.pow(this.rng.next(), 1.8); // most are small, a few are whoppers
    const kg = f.kg[0] + (f.kg[1] - f.kg[0]) * u;
    this.fish = { f, kg, u, ph: this.rng.range(0, 6), f1: this.rng.range(1.2, 2.4), f2: this.rng.range(3, 6), side: 0 };
    this.dist0 = this.dist = Math.hypot(b.x - p.pos.x, b.z - p.pos.z);
    this.tension = 0.2; this.t = 0;
    this.state = 'fight';
    this.meter.style.display = '';
    g.audio.play('reload', p.pos);
    g.ui.toast(f.fight * (0.6 + u) > 0.9 ? 'FISH ON! A BIG ONE!' : 'FISH ON!', 'big', 1.2);
  }

  fight(dt, cmd) {
    const g = this.game, p = g.player, b = this.b, F = this.fish;
    this.t += dt;
    const burst = Math.max(0, Math.sin(this.t * F.f1 + F.ph)) ** 2;
    const pull = F.f.fight * (0.7 + F.u * 0.6) * (0.3 + 0.9 * burst + 0.1 * Math.sin(this.t * F.f2));
    this.pull = pull;
    if (cmd.fire) {
      this.tension += (pull * 1.5 - 0.3) * dt;
      this.dist -= Math.max(0.5, 2.6 - pull * 1.8) * dt;
      this.reelClick = (this.reelClick || 0) - dt;
      if (this.reelClick <= 0) { this.reelClick = 0.12; g.audio.play('click', p.pos); }
    } else {
      this.tension -= 0.8 * dt;
      this.dist += pull * 1.7 * dt;
    }
    this.tension = Math.max(0, this.tension);
    // the bobber darts about where the fish is
    F.side += (Math.sin(this.t * 0.9 + F.ph) * 1.2 - F.side) * Math.min(1, dt * 2);
    const ax = b.x - p.pos.x, az = b.z - p.pos.z, l = Math.hypot(ax, az) || 1;
    const nx = ax / l, nz = az / l;
    let tx = p.pos.x + nx * this.dist - nz * F.side * burst, tz = p.pos.z + nz * this.dist + nx * F.side * burst;
    if (this.waterAt(tx, tz)) { b.x = tx; b.z = tz; }
    else if (this.dist < l) { b.x = p.pos.x + nx * this.dist; b.z = p.pos.z + nz * this.dist; } // dragged up the bank
    b.y = Math.max(WATER_LEVEL, g.terrain.heightAt(b.x, b.z)) - burst * 0.12;
    if (burst > 0.8 && !this.splashed) { this.splashed = true; g.fx.burst(b.x, WATER_LEVEL + 0.05, b.z, { count: 5, color: 0xcfeaff, speed: 2, up: 2.5, kind: 'smoke', size: 0.08 }); g.audio.play('splash', b); }
    if (burst < 0.3) this.splashed = false;
    if (this.tension >= 1) { g.audio.play('ricochet', p.pos); g.ui.toast('SNAP!', 'hit', 1.2); this.reset(`The line snapped. Somewhere, a ${F.f.junk ? 'boot' : 'fish'} is laughing at you.`); return; }
    if (this.dist > this.dist0 + 14) { this.reset('It got away. It was probably huge.'); return; }
    if (this.dist <= 1.6) this.land();
  }

  land() {
    const g = this.game, pr = g.profile, F = this.fish, f = F.f;
    const kg = Math.round(F.kg * 100) / 100;
    this.meter.style.display = 'none'; this.line.visible = false; this.bobber.visible = false;
    pr.fish = pr.fish || {};
    const best = pr.fish[f.id] || 0;
    const pb = kg > best;
    if (pb) pr.fish[f.id] = kg;
    pr.stats.fish = (pr.stats.fish || 0) + 1;
    const cash = f.junk ? f.value : Math.round(f.value * (0.6 + F.u * 0.9));
    pr.cash += cash; pr.xp += f.junk ? 2 : Math.round(cash / 2);
    if (f.junk) {
      if (f.id === 'boot' && pr.owned.includes('boot')) pr.ammo.boot = (pr.ammo.boot || 0) + 1;
      g.ui.toast(`You caught a ${f.name}!`, 'big', 2);
      g.ui.feed(f.id === 'boot' ? 'A Soggy Boot. Your size, too. (+1 throwing boot)' : f.id === 'duck' ? 'A Rubber Duck! It squeaks. You keep it. (+$5)' : 'A Tin Can. The lake thanks you for the tidy-up.', 'info');
      if (f.id === 'duck') g.audio.play('squeak', g.player.pos, { pitch: 1.4 });
      g.say('huh');
    } else {
      g.ui.toast(`${f.legendary ? 'LEGENDARY! ' : ''}${f.name.toUpperCase()} · ${kg.toFixed(2)} KG`, 'big', 2.6);
      g.ui.feed(`Caught a ${kg.toFixed(2)} kg ${f.name}! (+$${cash})${pb && best > 0 ? ' New personal best!' : ''}`, 'good');
      g.audio.play(f.legendary || pb ? 'levelup' : 'cash', g.player.pos);
      g.say('yay');
      if (f.legendary) g.coop.broadcastEvent('chat', { t: `caught a Golden Koi (${kg.toFixed(2)} kg)!` });
    }
    g.jobs.onEvent('fish', { fish: f.id, kg, junk: !!f.junk });
    pr.save();
    // hold it up for everyone to admire
    const m = buildFish(f);
    const s = f.junk ? 1.2 : Math.max(0.55, Math.min(2.2, Math.cbrt(kg) * 0.75));
    m.scale.setScalar(s);
    this.held = m; this.heldScale = s;
    g.viewScene.add(m);
    this.state = 'show'; this.showT = 8;
  }

  /** FISH SLAP. Buddies fall over, friends get knocked about, animals see stars. */
  slap() {
    const g = this.game, p = g.player, F = this.fish;
    this.slapT = 0.45; this.slapAnim = 0.3; this.showT = Math.max(this.showT, 3);
    const fw = p.forward(), l = Math.hypot(fw.x, fw.z) || 1, fx = fw.x / l, fz = fw.z / l;
    const inFront = (x, z, r = 2.4) => { const dx = x - p.pos.x, dz = z - p.pos.z, d = Math.hypot(dx, dz); return d < r && (dx * fx + dz * fz) / (d || 1) > 0.25; };
    const what = F ? F.f.name.split(' ').pop().toLowerCase() : 'fish';
    let hit = null;
    for (const b of g.buddies.list) {
      if (b.tumble || !inFront(b.pos.x, b.pos.z)) continue;
      b.tumble = { t: 0, vx: fx * 5, vz: fz * 5, vy: 4.5, rx: 0, rz: 0, sx: (this.rng.next() - 0.5) * 14, sz: (this.rng.next() - 0.5) * 14 };
      b.sitting = false;
      g.audio.babble(b.pos, 'scared', b.voice);
      hit = hit || `${b.name} got slapped with a ${what}!`;
    }
    for (const r of g.coop.peers.values()) {
      if (!r.target || !inFront(r.target.x, r.target.z)) continue;
      g.coop.sendTo(r.peer, 'bonk', { b: 3, c: 0, kx: fx * 7, ky: 3, kz: fz * 7, what });
      hit = hit || `You slapped ${r.name} with a ${what}!`;
    }
    for (const a of g.animals.list) {
      if (!a.alive || a.downed || !inFront(a.pos.x, a.pos.z, 2.2 + (a.radius || 0.5))) continue;
      a.daze = 2.5; a.alertness = 100; a.setThreat(p.pos.x, p.pos.z, 'player');
      g.fx.dazed(a, 2.5);
      g.jobs.onEvent('bonk', { sp: a.species.id, prop: 'fish' });
      hit = hit || `You slapped a ${a.species.displayName.split(' ').pop().toLowerCase()} with a ${what}. It is reconsidering everything.`;
    }
    g.audio.play('throw', p.pos);
    if (hit) {
      const e = p.eyePos();
      g.audio.play('splat', p.pos); g.audio.play('boing', p.pos);
      g.fx.burst(e.x + fx * 1.2, e.y - 0.3, e.z + fz * 1.2, { count: 10, color: 0xcfeaff, speed: 3, up: 2, kind: 'confetti', size: 0.05 });
      g.ui.toast('FISH SLAP!', 'hit', 1.2);
      g.ui.feed(hit, 'good');
      g.profile.stats.slaps = (g.profile.stats.slaps || 0) + 1;
    }
  }

  // -------------------------------------------------------------- render
  render(dt) {
    const g = this.game, b = this.b;
    const holding = g.weapons.current && g.weapons.current.type === 'rod';
    if (!holding && this.state !== 'idle' && this.state !== 'show') this.reset();
    this.meter.style.display = this.state === 'fight' ? '' : 'none';
    if (this.state === 'fight') {
      const t = Math.min(1, this.tension);
      this.fill.style.width = (t * 100).toFixed(1) + '%';
      this.meter.classList.toggle('danger', t > 0.75);
      this.distEl.textContent = `${Math.max(0, this.dist - 1.6).toFixed(1)} m`;
    }
    if (this.bobber.visible) {
      const bob = this.state === 'float' || this.state === 'bite' ? Math.sin(g.visualTime * 3) * 0.015 - (this.dip || 0) : 0;
      this.bobber.position.set(b.x, b.y + bob, b.z);
    }
    if (this.line.visible) {
      this.rodTip(this.tip);
      const a = this.line.geometry.attributes.position.array;
      const taut = this.state === 'fight' ? Math.min(1, this.tension * 1.3) : this.state === 'flying' ? 0.6 : 0.2;
      const d = Math.hypot(b.x - this.tip.x, b.z - this.tip.z);
      for (let i = 0; i < SEG; i++) {
        const u = i / (SEG - 1);
        a[i * 3] = this.tip.x + (b.x - this.tip.x) * u;
        a[i * 3 + 1] = this.tip.y + (b.y + 0.1 - this.tip.y) * u - Math.sin(u * Math.PI) * d * 0.08 * (1 - taut);
        a[i * 3 + 2] = this.tip.z + (b.z - this.tip.z) * u;
      }
      this.line.geometry.attributes.position.needsUpdate = true;
    }
    if (this.held) {
      // flop flop
      const t = g.visualTime, k = Math.min(1, (8 - this.showT) * 4);
      this.held.position.set(0.02, -0.12 + k * 0.08, -0.55);
      this.held.rotation.set(0.15, Math.PI / 2 + 0.3, Math.sin(t * 14) * 0.35 * (this.fish && this.fish.f.junk ? 0.2 : 1));
      if (this.slapAnim > 0) {
        // a big right-to-left swipe
        this.slapAnim = Math.max(0, this.slapAnim - dt);
        const u = 1 - this.slapAnim / 0.3, sw = Math.sin(u * Math.PI);
        this.held.position.x = 0.35 - u * 0.7; this.held.position.z = -0.55 - sw * 0.25;
        this.held.rotation.y += -sw * 1.2; this.held.rotation.z += sw * 0.6;
      }
    }
    const vm = g.weapons.vm;
    vm.rodBend = this.state === 'fight' ? Math.min(1, this.tension) : this.state === 'bite' ? 0.3 : 0;
    vm.rodDraw = this.state === 'idle' ? this.draw : 0;
    vm.hideHeld = !!this.held;
  }

  /** The rod tip in world space: project it from the viewmodel camera onto the main view. */
  rodTip(out) {
    const g = this.game, vm = g.weapons.vm;
    const cam = g.camera;
    if (!vm.tip || g.thirdPerson) {
      out.set(0.25, 0.3, -1.4).applyQuaternion(cam.quaternion).add(cam.position);
      return out;
    }
    vm.root.updateMatrixWorld(true);
    vm.tip.getWorldPosition(out);
    out.project(g.viewCamera);
    out.z = 0.5;
    out.unproject(cam).sub(cam.position).normalize().multiplyScalar(1.4).add(cam.position);
    return out;
  }
}
