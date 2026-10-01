// Lightning strikes in a downpour. Every so often (seeded, sim-side) a bolt
// hits the tallest thing near a hunter: usually a big tree, but if you're
// up a hunting tower in a thunderstorm… that's on you. Hunters close to a
// strike get blasted into a smoking tumble (hat gone, hair singed), animals
// bolt, and the tree smoulders for a bit. The bolt itself is drawn by
// WeatherFX; this file only decides where and what happens.

import { THREE } from '../three.js';
import { G, paint, merge, xf } from '../render/toon.js';
import { Rng } from '../core/rng.js';

const boltMat = (() => { const m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: true, depthWrite: false }); m.color.setRGB(4, 4.4, 6); return m; })();

export class Storms {
  constructor(game) {
    this.game = game;
    this.rng = new Rng(game.sessionSeed ^ 0x57021);
    this.next = this.rng.range(20, 45);
    this.smoulder = [];
    this.bolts = [];
  }

  step(dt) {
    const g = this.game, p = g.player;
    for (const s of this.smoulder) {
      s.t -= dt; s.acc = (s.acc || 0) - dt;
      if (s.acc <= 0) { s.acc = 0.3; g.fx.burst(s.x, s.y, s.z, { count: 1, color: s.t > 8 ? 0xff8a2a : 0x6a6670, speed: 0.4, up: 1.2, kind: s.t > 8 ? 'ember' : 'smoke', size: s.t > 8 ? 0.1 : 0.4 }); }
    }
    this.smoulder = this.smoulder.filter(s => s.t > 0);
    if (p.soot > 0) {
      p.soot -= dt; p.sootAcc = (p.sootAcc || 0) - dt;
      if (p.sootAcc <= 0) { p.sootAcc = 0.35; g.fx.burst(p.pos.x, p.pos.y + 1.7, p.pos.z, { count: 1, color: 0x3a3438, speed: 0.3, up: 1, kind: 'smoke', size: 0.25 }); }
    }
    if (g.state !== 'play' || g.coop.isGuest() || g.weather.rain < 0.85) return;
    this.next -= dt;
    if (this.next > 0) return;
    this.next = this.rng.range(35, 80);
    const t = this.pickTarget();
    if (t) this.strike(t.x, t.y, t.z, t.what);
  }

  /** The tallest thing near the player, or the player if they're asking for it. */
  pickTarget() {
    const g = this.game, p = g.player, T = g.terrain;
    if (p.onTower && this.rng.chance(0.5)) return { x: p.pos.x, y: p.pos.y + 1.8, z: p.pos.z, what: 'tower' };
    let best = null, bh = 0;
    for (const o of g.vegetation.query(p.pos.x, p.pos.z, 70, this._q || (this._q = []))) {
      if (o.soft || !(o.h > 5)) continue;
      const d = Math.hypot(o.x - p.pos.x, o.z - p.pos.z);
      if (d < 9 || d > 70) continue;
      const h = T.heightAt(o.x, o.z) + o.h + this.rng.range(0, 3); // a bit of luck in it
      if (h > bh) { bh = h; best = { x: o.x, y: h, z: o.z, what: 'tree' }; }
    }
    return best;
  }

  strike(x, y, z, what = 'tree') {
    const g = this.game, p = g.player;
    this.drawBolt(x, y, z);
    g.weatherFx.flash = 1.2;
    g.audio.thunder && g.audio.thunder(1.3);
    g.audio.play('fwoosh', { x, y, z });
    g.fx.burst(x, y, z, { count: 18, color: 0xffe28a, speed: 5, up: 4, kind: 'ember', size: 0.12 });
    g.sounds.emit('thunder', x, y, z, 2000, g.time, 'storm');
    if (what === 'tree') this.smoulder.push({ x, y: y - 0.5, z, t: 14 });
    // anything nearby gets a nasty surprise
    const d = Math.hypot(p.pos.x - x, p.pos.z - z);
    if (d < 7 && !p.downed && !p.vehicle) {
      const k = Math.max(0.3, 1 - d / 7);
      const ax = (p.pos.x - x) / (d || 1), az = (p.pos.z - z) / (d || 1);
      p.hurt({ blunt: 8 + k * 14, cut: 0, knock: { x: ax * 9 * k + 0.1, y: 6 * k + 2, z: az * 9 * k }, source: 'lightning' });
      if (!p.tumble) p.startTumble(ax * 7 * k, 5, az * 7 * k);
      g.knockHat({ x: ax, z: az });
      p.soot = 22;
      g.ui.toast('ZAPPED!', 'big', 1.8);
      g.ui.feed(what === 'tower' ? 'Lightning hit your tower. Lesson learned: towers are tall, and so are you.' : 'Lightning hit a tree right next to you. Your hair is now a different shape.', 'warn');
      g.say('scared');
      g.profile.stats.zapped = (g.profile.stats.zapped || 0) + 1;
    } else if (d < 25) g.ui.feed('KRAK! Lightning, very close. Maybe not under the tallest tree, eh?', 'warn');
    for (const a of g.animals.list) {
      if (!a.alive || Math.hypot(a.pos.x - x, a.pos.z - z) > 30) continue;
      a.alertness = 100; a.setThreat(x, z, 'storm');
    }
    for (const b of g.buddies.list) {
      const bd = Math.hypot(b.pos.x - x, b.pos.z - z);
      if (bd < 7 && !b.tumble) { b.sitting = false; b.tumble = { t: 0, vx: (b.pos.x - x) / (bd || 1) * 6, vz: (b.pos.z - z) / (bd || 1) * 6, vy: 6, rx: 0, rz: 0, sx: 12, sz: -10 }; g.audio.babble(b.pos, 'scared', b.voice); }
    }
  }

  /** A jagged HDR bolt from the clouds down to the strike point; it flickers out. */
  drawBolt(x, y, z) {
    const g = this.game, parts = [];
    let px = x + this.rng.range(-8, 8), py = y + 90, pz = z + this.rng.range(-8, 8);
    const N = 10;
    for (let i = 1; i <= N; i++) {
      const u = i / N;
      const nx = i === N ? x : x + (px - x) * 0.5 + this.rng.range(-4, 4) * (1 - u), ny = y + 90 * (1 - u), nz = i === N ? z : z + (pz - z) * 0.5 + this.rng.range(-4, 4) * (1 - u);
      const dx = nx - px, dy = ny - py, dz = nz - pz, len = Math.hypot(dx, dy, dz);
      const geo = G.cyl(0.22 * (1 - u * 0.5), 0.22 * (1 - u * 0.5), len, 4);
      geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len)));
      geo.translate((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2);
      parts.push(paint(geo, 0xffffff));
      px = nx; py = ny; pz = nz;
    }
    const m = new THREE.Mesh(merge(parts), boltMat.clone());
    m.frustumCulled = false;
    g.scene.add(m);
    this.bolts.push({ m, t: 0.35 });
  }

  render(dt) {
    for (const b of this.bolts) {
      b.t -= dt;
      b.m.material.opacity = b.t > 0.2 || (b.t > 0.08 && b.t < 0.14) ? 1 : 0.15;
      if (b.t <= 0) { this.game.scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); }
    }
    this.bolts = this.bolts.filter(b => b.t > 0);
  }
}
