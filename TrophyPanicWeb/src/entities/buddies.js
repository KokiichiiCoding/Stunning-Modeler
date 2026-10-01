// Solo-play buddies: a couple of chibi trekkers who tag along like the
// concept-art squad. They keep formation behind you, copy your stance,
// point out animals they spot, panic (loudly) when something charges, and
// join your victory dance. They never shoot and wildlife ignores them, so
// they're company, not a cheat. Presentation + light logic only.

import { buildHunter, JACKETS, SKINS } from './hunter.js';
import { Rng } from '../core/rng.js';
import { THREE } from '../three.js';
import { G, paint, merge, xf, toonMat } from '../render/toon.js';

// a buddy's roasting stick: a twig with a marshmallow, angled at the flames
function buildBuddyStick() {
  const g = new THREE.Group(), pivot = new THREE.Group();
  pivot.add(new THREE.Mesh(merge([
    paint(xf(G.cyl(0.012, 0.016, 1.3, 5), [0, 0, 0.65], [Math.PI / 2, 0, 0]), 0x8a5a36),
    paint(xf(G.cyl(0.045, 0.045, 0.07, 8), [0, 0, 1.28], [Math.PI / 2, 0, 0]), 0xf2c27a),
  ]), toonMat()));
  g.add(pivot);
  return g;
}

const NAMES = ['Bean', 'Pickle', 'Toast', 'Moss', 'Nugget', 'Waffle', 'Sprout', 'Dumpling'];
const HATS = ['beanie', 'beanie', 'cap', 'trapper', 'bucket'];

export class Buddies {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.rng = new Rng(game.sessionSeed ^ 0xb0dd);
  }

  get want() { return this.game.coop.inParty() ? 0 : (this.game.profile.settings.buddies | 0); }

  sync() {
    const g = this.game;
    while (this.list.length > this.want) { const b = this.list.pop(); g.scene.remove(b.model.group); if (b.stick) g.scene.remove(b.stick); }
    while (this.list.length < this.want) {
      const i = this.list.length;
      const look = { jacket: i === 0 ? 0x5f6e34 : this.rng.pick(JACKETS).hex, hat: this.rng.pick(HATS), skin: this.rng.int(0, SKINS.length - 1) };
      const model = buildHunter(look);
      g.scene.add(model.group);
      const p = g.player.pos;
      this.list.push({ model, name: this.rng.pick(NAMES), voice: 0.8 + this.rng.next() * 0.5, slot: i, pos: { x: p.x + 2 + i, y: p.y, z: p.z + 2 }, yaw: 0, speed: 0, pointT: 0, scared: 0, chatT: this.rng.range(20, 50), seen: new Set() });
    }
  }

  step(dt) {
    const g = this.game;
    if (g.state === 'title') { for (const b of this.list) b.model.setVisible(false); return; }
    this.sync();
    const P = g.player, T = g.terrain;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    for (const b of this.list) {
      // bowled over: fly, flail, bounce, then scramble back up
      if (b.tumble) {
        const t = b.tumble;
        t.t += dt; t.vy -= 20 * dt;
        b.pos.x += t.vx * dt; b.pos.z += t.vz * dt; b.pos.y += t.vy * dt;
        t.rx += t.sx * dt; t.rz += t.sz * dt;
        const gy = T.heightAt(b.pos.x, b.pos.z);
        if (b.pos.y < gy) { b.pos.y = gy; t.vy = Math.abs(t.vy) * 0.3; t.vx *= 0.5; t.vz *= 0.5; t.sx *= 0.5; t.sz *= 0.5; if (t.vy > 1.5) g.audio.play('bonk', b.pos); }
        if (t.t > 2.2) b.tumble = null;
        continue;
      }
      for (const a of g.animals.list) {
        if (!a.alive || !(a.speed > 4)) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, dd = Math.hypot(dx, dz);
        if (dd < a.radius + 0.5) {
          const k = Math.min(12, a.speed * 0.9) * Math.min(1.5, a.identity.bodyMassKg / 80);
          b.tumble = { t: 0, vx: dx / (dd || 1) * k, vz: dz / (dd || 1) * k, vy: 4 + k * 0.3, rx: 0, rz: 0, sx: (this.rng.next() - 0.5) * 16, sz: (this.rng.next() - 0.5) * 16 };
          g.audio.babble(b.pos, 'scared', b.voice); g.audio.play('oof', b.pos);
          g.fx.dazed({ headWorld: () => ({ x: b.pos.x, y: b.pos.y + 0.7, z: b.pos.z }) }, 2.5);
          if (Math.hypot(P.pos.x - b.pos.x, P.pos.z - b.pos.z) < 60) g.ui.toast(`${b.name} got bowled over by a ${a.species.displayName.split(' ').pop().toLowerCase()}!`, 'hit');
          break;
        }
      }
      if (b.tumble) continue;
      // formation: behind and to either side, or a log by your campfire
      const side = b.slot === 0 ? 1 : -1;
      const back = P.vehicle ? 6 : 3 + b.slot * 1.2;
      const fire = g.campfires.mine;
      const seat = fire && b.scared <= 0 && Math.hypot(P.pos.x - fire.x, P.pos.z - fire.z) < 9 ? g.campfires.seatFor(b.slot) : null;
      const tx = seat ? seat.x : P.pos.x - fx * back + fz * side * 1.8, tz = seat ? seat.z : P.pos.z - fz * back - fx * side * 1.8;
      const d = Math.hypot(tx - b.pos.x, tz - b.pos.z);
      if (Math.hypot(P.pos.x - b.pos.x, P.pos.z - b.pos.z) > 80) { b.pos.x = tx; b.pos.z = tz; }
      b.sitting = !!seat && d < 0.7;
      if (b.sitting) {
        b.speed = 0; b.pos.x += (tx - b.pos.x) * Math.min(1, dt * 6); b.pos.z += (tz - b.pos.z) * Math.min(1, dt * 6);
        b.yaw = seat.yaw; b.pos.y = T.heightAt(b.pos.x, b.pos.z);
        b.chatT -= dt;
        if (b.chatT <= 0) { b.chatT = this.rng.range(14, 30); g.audio.babble(b.pos, this.rng.chance(0.5) ? 'happy' : 'huh', b.voice); }
        continue;
      }
      const run = b.scared > 0 ? 6 : P.vehicle ? Math.min(14, 2 + d * 1.2) : Math.min(6.4, d * 1.4);
      if (d > 0.6) {
        const want = Math.atan2(tx - b.pos.x, tz - b.pos.z);
        let dy = want - b.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
        b.yaw += Math.max(-7 * dt, Math.min(7 * dt, dy));
        b.speed += (run - b.speed) * Math.min(1, dt * 5);
      } else {
        b.speed *= Math.pow(0.02, dt);
        // idle: face where you face
        const want = Math.atan2(fx, fz);
        let dy = want - b.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
        b.yaw += Math.max(-3 * dt, Math.min(3 * dt, dy));
      }
      b.pos.x += Math.sin(b.yaw) * b.speed * dt; b.pos.z += Math.cos(b.yaw) * b.speed * dt;
      for (const o of g.vegetation.query(b.pos.x, b.pos.z, 2, b._q || (b._q = []))) {
        if (o.soft) continue;
        const dx = b.pos.x - o.x, dz = b.pos.z - o.z, dd = Math.hypot(dx, dz), m = o.r + 0.3;
        if (dd < m && dd > 1e-4) { b.pos.x += dx / dd * (m - dd); b.pos.z += dz / dd * (m - dd); }
      }
      b.pos.y = Math.max(T.heightAt(b.pos.x, b.pos.z), 4 - 1.0);
      if (b.pointT > 0) b.pointT -= dt;
      if (b.scared > 0) b.scared -= dt;
      // spot animals: point and call it out (once per animal)
      b.lookAcc = (b.lookAcc || 0) + dt;
      if (b.lookAcc > 1.2) {
        b.lookAcc = 0;
        for (const a of g.animals.list) {
          if (!a.alive || b.seen.has(a.id)) continue;
          const da = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
          if (da > 70) continue;
          if (g.vegetation.segmentBlocked(b.pos.x, b.pos.y + 1.2, b.pos.z, a.pos.x, a.pos.y + 1, a.pos.z) >= 0) continue;
          b.seen.add(a.id);
          b.pointT = 1.8; b.yaw = Math.atan2(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
          const nm = a.species.displayName.split(' ').pop();
          const danger = a.species.danger >= 2;
          g.social.addPing(a.pos.x, a.pos.y + 0.5, a.pos.z, danger ? `${nm}! Uh oh!` : `${nm}!`, 0x8fd14f, b.name);
          g.audio.babble(b.pos, danger ? 'scared' : 'huh', b.voice);
          break;
        }
      }
      // panic when something charges anyone
      if (b.scared <= 0 && g.animals.list.some(a => a.goal === 'Charge' && !a.bluff && Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) < 30)) {
        b.scared = 4; g.audio.babble(b.pos, 'scared', b.voice);
      }
      // the odd bit of chatter
      b.chatT -= dt;
      if (b.chatT <= 0) { b.chatT = this.rng.range(35, 80); if (P.stance === 'stand' && !P.vehicle) g.audio.babble(b.pos, 'happy', b.voice); }
    }
  }

  render(dt) {
    const g = this.game, P = g.player;
    for (const b of this.list) {
      const m = b.model;
      m.setVisible(g.state !== 'title');
      m.group.rotation.order = 'XYZ';
      m.group.position.set(b.pos.x, b.pos.y - (b.sitting ? 0.02 : 0), b.pos.z);
      if (b.sitting) {
        m.group.rotation.set(0, b.yaw, 0);
        m.animate(dt, { seated: true, speed: 0, stance: 'stand', pitch: -0.2, dance: g.danceT > 0, showRifle: false });
        if (!b.stick) { b.stick = buildBuddyStick(); g.scene.add(b.stick); }
        b.stick.visible = true;
        b.stick.position.set(b.pos.x + Math.sin(b.yaw) * 0.45, b.pos.y + 0.62, b.pos.z + Math.cos(b.yaw) * 0.45);
        b.stick.rotation.set(0, b.yaw, 0);
        b.stick.children[0].rotation.x = 0.35 + Math.sin(g.visualTime * 1.3 + b.slot) * 0.05;
        continue;
      }
      if (b.stick) b.stick.visible = false;
      m.group.rotation.set(b.tumble ? b.tumble.rx : 0, b.yaw, b.tumble ? b.tumble.rz : 0);
      m.animate(dt, {
        flail: !!b.tumble, speed: b.tumble ? 3 : b.speed, stance: b.scared > 0 ? 'stand' : P.stance, pitch: 0,
        point: b.pointT > 0, scared: b.scared > 0, dance: g.danceT > 0, wave: g.waveT > 0, showRifle: !(b.pointT > 0),
      });
    }
  }

  clear() { for (const b of this.list) { this.game.scene.remove(b.model.group); if (b.stick) this.game.scene.remove(b.stick); } this.list = []; }
}
