// Campfires: L lights one in front of you (one per hunter), L next to it
// stomps it out. Sitting by a fire warms you back to health, wolves and
// cougars won't step into the firelight, and E starts the marshmallow
// minigame: pull it out golden for a sugar rush, leave it too long and it
// goes up in flames. At night the smell drifts into the woods and bears
// come looking for the bag. Presentation + light gameplay; all randomness
// is seeded.

import { THREE } from '../three.js';
import { G, paint, merge, xf, toonMat, solidToon, addOutline } from '../render/toon.js';
import { glowTexture } from '../world/structures.js';
import { WATER_LEVEL } from '../world/terrainData.js';
import { Rng } from '../core/rng.js';

export const WARM_R = 4.5;     // heal radius
export const FEAR_R = 22;      // wolves and cougars keep this far from a lit fire
const FUEL = 300;              // seconds of burn
const GOLD = [0.55, 0.72];     // the perfect window
const IGNITE = 0.86;
const EMBERS = 28;

const flameMat = (() => { const m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }); m.color.setScalar(2.4); return m; })();
const emberTex = { t: null };

/** Stone ring, crossed logs, flames, log benches and a bag of marshmallows. */
export function buildCampfire(seed = 1) {
  const rng = new Rng(seed);
  const g = new THREE.Group();
  const parts = [];
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + rng.range(-0.1, 0.1);
    parts.push(paint(xf(G.dodeca(0.17, 0), [Math.cos(a) * 0.62, 0.07, Math.sin(a) * 0.62], [rng.next() * 3, rng.next() * 3, 0], [1.1, 0.7, 1]), rng.pick([0x6d7480, 0x7d8590, 0x5e6470]), { flat: true }));
  }
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + 0.4;
    parts.push(paint(xf(G.cyl(0.07, 0.08, 0.95, 6), [Math.cos(a) * 0.12, 0.2, Math.sin(a) * 0.12], [0, -a, 1.15]), 0x6b4a30, { bottom: 0x2a1a12 }));
  }
  parts.push(paint(xf(G.cyl(0.42, 0.45, 0.04, 10), [0, 0.02, 0]), 0x2a2220));
  // three log benches, a gap left where you were standing
  const seats = [];
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 3 + i * Math.PI * 2 / 3;
    const x = Math.sin(a) * 2.05, z = Math.cos(a) * 2.05;
    parts.push(paint(xf(G.cyl(0.19, 0.19, 1.3, 8), [x, 0.19, z], [0, a, Math.PI / 2]), 0x8a5a36, { bottom: 0x5a3a22 }));
    parts.push(paint(xf(G.cyl(0.15, 0.15, 0.02, 8), [x + Math.cos(a) * 0.66, 0.19, z - Math.sin(a) * 0.66], [0, a, Math.PI / 2]), 0xd9b27a));
    seats.push({ a, x, z });
  }
  // the bag of marshmallows (very important)
  parts.push(paint(xf(G.box(0.24, 0.3, 0.14), [1.15, 0.15, -0.55], [0, 0.4, 0.08]), 0xf6f1ff));
  parts.push(paint(xf(G.box(0.25, 0.08, 0.15), [1.15, 0.24, -0.55], [0, 0.4, 0.08]), 0xff8fb8));
  parts.push(paint(xf(G.cyl(0.05, 0.05, 0.05, 6), [1.35, 0.03, -0.33], [Math.PI / 2, 0, 0.3]), 0xffffff));
  const base = new THREE.Mesh(merge(parts), toonMat());
  base.castShadow = true; base.receiveShadow = true;
  addOutline(base, 0.02);
  g.add(base);
  // flames: three nested low-poly tongues, HDR-bright so they bloom
  const flames = [];
  const tongue = (r, h, col, tip) => new THREE.Mesh(merge([paint(xf(G.cone(r, h, 6), [0, h / 2, 0]), tip, { bottom: col })]), flameMat);
  for (const [r, h, c, t, ox, oz] of [[0.36, 1.0, 0xff4a12, 0xff9a2a, 0, 0], [0.2, 0.75, 0xff8a1a, 0xffd34a, 0.12, 0.05], [0.18, 0.6, 0xff8a1a, 0xffe27a, -0.1, -0.08], [0.12, 0.45, 0xffd060, 0xfff6c0, 0, 0]]) {
    const m = tongue(r, h, c, t); m.position.set(ox, 0.12, oz); m.rotation.y = rng.next() * 6; g.add(m); flames.push(m);
  }
  // embers: a handful of sparks looping upward
  if (!emberTex.t) emberTex.t = glowTexture();
  const ep = new Float32Array(EMBERS * 3);
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(ep, 3));
  const emat = new THREE.PointsMaterial({ map: emberTex.t, size: 0.16, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(3, 1.4, 0.4), toneMapped: false });
  const embers = new THREE.Points(eg, emat); embers.frustumCulled = false;
  g.add(embers);
  const seeds = Array.from({ length: EMBERS }, () => ({ a: rng.next() * 6.28, r: rng.range(0.05, 0.35), s: rng.range(0.5, 1.4), o: rng.next() }));
  const glow = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0.5, 0]), 3)),
    new THREE.PointsMaterial({ map: emberTex.t, size: 3.2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.3, toneMapped: false }));
  glow.frustumCulled = false; g.add(glow);
  return { group: g, flames, embers, seeds, glow, seats, clock: rng.next() * 10, lit: 1 };
}

/** Animate flames + embers. k = 0..1 how lit it is. */
export function animateFire(f, dt, k = 1) {
  f.clock += dt;
  const t = f.clock;
  f.flames.forEach((m, i) => {
    const s = k * (0.85 + Math.sin(t * (9 + i * 2.3) + i) * 0.12 + Math.sin(t * 23 + i * 4) * 0.06);
    m.scale.set(s * (1 + Math.sin(t * 7 + i) * 0.08), s * (1 + Math.sin(t * 11 + i * 2) * 0.15), s);
    m.rotation.y += dt * (0.6 + i * 0.3);
    m.visible = k > 0.03;
  });
  const p = f.embers.geometry.attributes.position.array;
  f.seeds.forEach((e, i) => {
    const u = (t * e.s * 0.45 + e.o) % 1;
    p[i * 3] = Math.cos(e.a + u * 3) * (e.r + u * 0.4); p[i * 3 + 1] = 0.3 + u * 2.6; p[i * 3 + 2] = Math.sin(e.a + u * 3) * (e.r + u * 0.4);
  });
  f.embers.geometry.attributes.position.needsUpdate = true;
  f.embers.visible = k > 0.2;
  f.glow.material.opacity = 0.28 * k * (0.9 + Math.sin(t * 13) * 0.1);
}

// the roasting stick held in first person
function buildStick() {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(merge([paint(xf(G.cyl(0.008, 0.012, 1.1, 5), [0, 0, -0.55], [Math.PI / 2, 0, 0]), 0x8a5a36, { bottom: 0x5a3a22 })]), toonMat());
  g.add(stick);
  const mallow = new THREE.Mesh(G.cyl(0.035, 0.035, 0.055, 8), solidToon(0xfff8f0));
  mallow.rotation.x = Math.PI / 2; mallow.position.z = -1.08;
  g.add(mallow);
  const fire = new THREE.Mesh(merge([paint(xf(G.cone(0.05, 0.16, 5), [0, 0.08, 0]), 0xffd34a, { bottom: 0xff4a12 })]), flameMat);
  fire.position.set(0, 0.02, -1.08); fire.visible = false;
  g.add(fire);
  g.visible = false;
  return { group: g, mallow, fire };
}

const C_RAW = new THREE.Color(0xfff8f0), C_GOLD = new THREE.Color(0xf2b24a), C_BROWN = new THREE.Color(0x8a4a1c), C_CHAR = new THREE.Color(0x1e1410);
export function toastColor(t, out) {
  if (t < 0.62) return out.lerpColors(C_RAW, C_GOLD, Math.max(0, t / 0.62));
  if (t < 0.85) return out.lerpColors(C_GOLD, C_BROWN, (t - 0.62) / 0.23);
  return out.lerpColors(C_BROWN, C_CHAR, Math.min(1, (t - 0.85) / 0.25));
}

export class Campfires {
  constructor(game) {
    this.game = game;
    this.mine = null;      // {x, y, z, fuel, model, snacks, out}
    this.roast = null;     // {toast, burning}
    this.rng = new Rng(game.sessionSeed ^ 0xf17e);
    // one light, created up front so lighting a fire never forces a shader recompile
    this.light = new THREE.PointLight(0xff9a48, 0, 18, 1.5);
    game.scene.add(this.light);
    this.stick = buildStick();
    game.viewScene.add(this.stick.group);
    this.meter = document.createElement('div');
    this.meter.id = 'roast-meter';
    this.meter.innerHTML = '<b>TOASTINESS</b><div class="rm-bar"><i class="rm-gold"></i><i class="rm-fire"></i><span class="rm-needle"></span></div><em>E: pull it out</em>';
    this.meter.style.display = 'none';
    document.getElementById('hud').appendChild(this.meter);
    this.needle = this.meter.querySelector('.rm-needle');
    this.meter.querySelector('.rm-gold').style.cssText = `left:${GOLD[0] * 100 / 1.15}%;width:${(GOLD[1] - GOLD[0]) * 100 / 1.15}%`;
    this.meter.querySelector('.rm-fire').style.cssText = `left:${IGNITE * 100 / 1.15}%;right:0`;
    this.smokeT = 0;
  }

  /** Every lit fire: mine and friends'. */
  *all() {
    if (this.mine && !this.mine.out) yield this.mine;
    for (const r of this.game.coop.peers.values()) if (r.fire) yield r.fire;
  }

  /** Nearest lit fire within r of (x, z), or null. */
  near(x, z, r) {
    let best = null, bd = r;
    for (const f of this.all()) { const d = Math.hypot(f.x - x, f.z - z); if (d < bd) { bd = d; best = f; } }
    return best;
  }

  toggle() {
    const g = this.game, p = g.player;
    if (p.vehicle || p.swimming || p.onTower || p.tumble || p.downed) { g.ui.feed('Find some solid ground first.', 'warn'); return; }
    if (this.mine && Math.hypot(this.mine.x - p.pos.x, this.mine.z - p.pos.z) < 4) { this.douse('You stomp the fire out. Very responsible.'); return; }
    const f = p.forward(), l = Math.hypot(f.x, f.z) || 1;
    const x = p.pos.x + f.x / l * 2.2, z = p.pos.z + f.z / l * 2.2;
    const y = g.terrain.heightAt(x, z);
    if (y < WATER_LEVEL + 0.2) { g.ui.feed('Too soggy here for a fire.', 'warn'); return; }
    if (g.weather.rain > 0.65) { g.ui.feed('You strike match after match. The rain wins.', 'warn'); g.audio.play('click', p.pos); return; }
    if (this.mine) this.remove();
    const model = buildCampfire(this.rng.int(1, 1e6));
    // leave the bench gap facing you
    model.group.position.set(x, y - 0.02, z);
    model.group.rotation.y = Math.atan2(p.pos.x - x, p.pos.z - z);
    g.scene.add(model.group);
    model.group.updateMatrixWorld(true);
    const bag = new THREE.Vector3(1.15, 0, -0.55).applyMatrix4(model.group.matrixWorld);
    this.mine = { x, y, z, fuel: FUEL, model, snacks: 12, out: 0, bag: { x: bag.x, z: bag.z }, lured: false };
    g.audio.play('fwoosh', { x, y, z });
    g.sounds.emit('equipment', x, y + 0.5, z, 120, g.time, 'player');
    g.ui.feed(g.period === 'night' || g.period === 'dusk'
      ? 'Fwoomp! A cosy campfire. Wolves hate it. Bears… love marshmallows.'
      : 'Fwoomp! Campfire lit. Stand close to warm up, E to roast a marshmallow.', 'good');
  }

  remove() { if (this.mine) { this.game.scene.remove(this.mine.model.group); this.mine = null; } this.stopRoast(); }

  douse(msg) {
    const g = this.game, m = this.mine;
    if (!m) return;
    g.fx.burst(m.x, m.y + 0.6, m.z, { count: 14, color: 0x9a9aa0, speed: 1.2, up: 2.2, kind: 'smoke', size: 0.45 });
    g.audio.play('spray', m);
    if (msg) g.ui.feed(msg, 'info');
    this.remove();
  }

  // ------------------------------------------------------------ roasting
  canRoast() {
    const g = this.game, p = g.player, f = this.near(p.pos.x, p.pos.z, 3.2);
    return !this.roast && f && !p.vehicle && !p.tumble && !p.downed && !p.swimming ? f : null;
  }

  startRoast() {
    const g = this.game, f = this.canRoast();
    if (!f) return false;
    if (f === this.mine && this.mine.snacks <= 0) { g.ui.feed('The marshmallow bag is empty. (A bear may have been involved.)', 'warn'); return true; }
    this.roast = { toast: 0, burning: false, fire: f, t: 0 };
    if (f === this.mine) this.mine.snacks--;
    g.weapons.aiming = false; if (g.weapons.binoculars) g.weapons.toggleBinoculars();
    g.ui.feed('Marshmallow on a stick. Golden is perfect. On fire is… also an outcome.', 'info');
    g.audio.play('wood', g.player.pos);
    // the smell carries at night
    const m = this.mine;
    if (m && f === m && (g.period === 'night' || g.period === 'dusk')) {
      g.animals.addLure(m.bag.x, m.bag.z, { kind: 'marsh', dur: 90, quiet: true, fire: m });
      if (!m.lured) { m.lured = true; g.ui.feed('The sweet smell of toasting marshmallow drifts into the dark woods…', 'warn'); }
    }
    return true;
  }

  stopRoast() { this.roast = null; this.stick.group.visible = false; this.meter.style.display = 'none'; if (this.game.weapons) this.game.weapons.vm.root.visible = true; }

  /** E while roasting: pull it out and eat it. */
  eat() {
    const g = this.game, p = g.player, r = this.roast;
    if (!r) return;
    const t = r.toast;
    this.stopRoast();
    let msg, kind = 'info';
    if (r.burning) {
      p.hp = Math.max(1, p.hp - 3); g.waveT = 1.6; g.say('scared');
      g.fx.burst(p.pos.x, p.pos.y + 1.4, p.pos.z, { count: 10, color: 0x3a3030, speed: 1, up: 1.5, kind: 'smoke', size: 0.3 });
      g.audio.play('fwoosh', p.pos);
      msg = 'You wave the flaming marshmallow around screaming until it goes out. Crunchy.'; kind = 'warn';
      g.profile.stats.charcoal = (g.profile.stats.charcoal || 0) + 1;
    } else if (t >= GOLD[0] && t <= GOLD[1]) {
      p.hp = Math.min(100, p.hp + 25); p.stamina = 100; p.sugar = 90;
      g.say('yay'); g.audio.play('levelup', p.pos);
      g.fx.burst(p.pos.x, p.pos.y + 1.5, p.pos.z, { count: 16, color: 0xffd34a, speed: 2, up: 2.5, kind: 'ember', size: 0.07 });
      g.ui.toast('PERFECT GOLDEN MARSHMALLOW!', 'big', 2);
      msg = 'Sugar rush! Full stamina and a spring in your step.'; kind = 'good';
      g.profile.stats.smores = (g.profile.stats.smores || 0) + 1;
      g.jobs.onEvent('marsh', {});
      g.coop.broadcastEvent('smore', { n: g.profile.name });
      for (const b of g.buddies.list) g.audio.babble(b.pos, 'yay', b.voice);
    } else if (t < 0.3) { p.hp = Math.min(100, p.hp + 5); msg = 'Raw. Squishy. Disappointing.'; }
    else if (t < GOLD[0]) { p.hp = Math.min(100, p.hp + 10); msg = 'Lightly toasted. Respectable.'; g.say('happy'); }
    else { p.hp = Math.min(100, p.hp + 15); msg = 'Crispy outside, molten inside. Ow. Worth it.'; g.say('happy'); }
    g.audio.play('nom', p.pos);
    g.ui.feed(msg, kind);
  }

  // ------------------------------------------------------------ sim
  step(dt) {
    const g = this.game, p = g.player, m = this.mine;
    if (m) {
      m.fuel -= dt * (1 + g.weather.rain * 4);
      if (m.fuel <= 0) { this.douse('Your campfire fizzles out to a sad little smoulder.'); }
      else if (Math.hypot(m.x - p.pos.x, m.z - p.pos.z) > 400) this.remove(); // forgotten fires go out
    }
    // warmth
    if (this.near(p.pos.x, p.pos.z, WARM_R) && !p.downed) {
      if (p.bleed <= 0) p.hp = Math.min(100, p.hp + 2.5 * dt);
      p.warm = 1;
    } else p.warm = 0;
    if (p.sugar > 0) p.sugar -= dt;
    const r = this.roast;
    if (r) {
      r.t += dt;
      const fd = Math.hypot(r.fire.x - p.pos.x, r.fire.z - p.pos.z);
      if (fd > 3.6 || p.tumble || p.vehicle || p.downed || p.swimming) {
        this.stopRoast(); g.ui.feed('You wander off and the marshmallow drops into the fire. A moment of silence.', 'info'); return;
      }
      r.toast += dt * (r.burning ? 0.3 : 0.16);
      if (!r.burning && r.toast >= IGNITE) { r.burning = true; g.audio.play('fwoosh', p.pos); g.ui.toast('IT\'S ON FIRE!', 'hit', 1.4); g.say('scared'); }
      if (r.toast > 1.25) { r.burning = true; this.eat(); }
    }
  }

  // ------------------------------------------------------------ render
  render(dt) {
    const g = this.game, cam = g.camera.position;
    const m = this.mine;
    let best = null, bd = 1e9;
    for (const f of this.all()) {
      const lit = f === m ? Math.min(1, m.fuel / 30) * (1 - g.weather.rain * 0.3) : 1;
      if (f.model) animateFire(f.model, dt, lit);
      const d = Math.hypot(f.x - cam.x, f.z - cam.z);
      if (d < bd) { bd = d; best = f; }
    }
    if (best && bd < 80) {
      const fl = 0.85 + Math.sin(g.visualTime * 17) * 0.08 + Math.sin(g.visualTime * 5.3) * 0.07;
      this.light.position.set(best.x, best.y + 1.0, best.z);
      this.light.intensity = 5.5 * fl;
    } else this.light.intensity = 0;
    // smoke curls
    this.smokeT -= dt;
    if (best && bd > 3.5 && bd < 60 && this.smokeT <= 0) {
      this.smokeT = 0.55;
      g.fx.burst(best.x + (Math.sin(g.visualTime * 3) * 0.1), best.y + 1.2, best.z, { count: 1, color: 0xb8b4bc, speed: 0.2, up: 1.2, kind: 'smoke', size: 0.14 });
    }
    if (g.audio.setFire) g.audio.setFire(best && g.state === 'play' ? Math.max(0, 1 - bd / 22) : 0);
    // first-person roasting stick
    const r = this.roast;
    const show = !!r && !g.thirdPerson;
    this.stick.group.visible = show;
    g.weapons.vm.root.visible = !r;
    if (r) {
      this.meter.style.display = '';
      const pct = Math.min(1, r.toast / 1.15) * 100;
      this.needle.style.left = pct + '%';
      this.meter.classList.toggle('burning', r.burning);
      this.meter.classList.toggle('golden', r.toast >= GOLD[0] && r.toast <= GOLD[1]);
      toastColor(r.toast, this.stick.mallow.material.color);
      this.stick.fire.visible = r.burning;
      if (r.burning) { const s = 0.8 + Math.sin(g.visualTime * 30) * 0.25; this.stick.fire.scale.set(s, s * 1.3, s); }
      // point the stick at the flames
      const S = this.stick.group;
      S.position.set(0.2, -0.17 + Math.sin(g.visualTime * 2) * 0.008, -0.15);
      S.rotation.set(-0.12 + (r.burning ? Math.sin(g.visualTime * 25) * 0.08 : 0), 0.16, 0);
    }
  }

  /** Presence payload for friends. */
  presence() { const m = this.mine; return m ? [Math.round(m.x * 100) / 100, Math.round(m.z * 100) / 100] : null; }

  /** A friend's fire appeared, moved or went out. */
  syncRemote(r, cf) {
    const g = this.game;
    if (cf && (!r.fire || r.fire.x !== cf[0] || r.fire.z !== cf[1])) {
      if (r.fire) g.scene.remove(r.fire.model.group);
      const y = g.terrain.heightAt(cf[0], cf[1]);
      const model = buildCampfire((cf[0] * 13 + cf[1] * 7) | 0);
      model.group.position.set(cf[0], y - 0.02, cf[1]);
      g.scene.add(model.group);
      r.fire = { x: cf[0], y, z: cf[1], model };
    } else if (!cf && r.fire) { g.scene.remove(r.fire.model.group); r.fire = null; }
  }

  /** A log seat for a buddy (world coords, facing the fire), or null. */
  seatFor(i) {
    const m = this.mine;
    if (!m) return null;
    const s = m.model.seats[i % 3];
    const ry = m.model.group.rotation.y, c = Math.cos(ry), sn = Math.sin(ry);
    const x = m.x + s.x * c + s.z * sn, z = m.z - s.x * sn + s.z * c;
    return { x, z, y: m.y, yaw: Math.atan2(m.x - x, m.z - z) };
  }

  clear() { this.remove(); }
}
