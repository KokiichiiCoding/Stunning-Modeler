// Pop-up ground blind: a squat, leafy dome tent you pitch anywhere. Inside
// it you are mostly hidden from sight (not from smell, and not from your
// own footsteps). One per hunter; P pitches it in front of you, P next to
// it packs it up again.

import { THREE } from '../three.js';
import { G, paint, merge, xf, toonMat, addOutline } from '../render/toon.js';

export const BLIND_R = 1.25;

export function buildBlind() {
  const parts = [
    paint(xf(G.sphere(1.3, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0, 0], [0, 0, 0], [1, 1.05, 1]), 0x6f8f3a, { bottom: 0x4f6a28 }),
    // dark window slits
    paint(xf(G.box(0.9, 0.18, 0.1), [0, 0.85, 1.14], [-0.35, 0, 0]), 0x1d1622),
    paint(xf(G.box(0.1, 0.18, 0.7), [1.14, 0.85, 0], [0, 0, 0.35]), 0x1d1622),
    paint(xf(G.box(0.1, 0.18, 0.7), [-1.14, 0.85, 0], [0, 0, -0.35]), 0x1d1622),
    // door flap
    paint(xf(G.box(0.6, 0.8, 0.06), [0, 0.4, -1.28]), 0x3c5222),
  ];
  // stuck-on leaves and a little flag, because of course
  const leaf = [0x8fbf4a, 0x5a7a2a, 0xa9c85a, 0xc9a13a];
  for (let i = 0; i < 16; i++) {
    const a = i * 2.39, h = 0.25 + (i % 5) * 0.2;
    const r = Math.sqrt(Math.max(0.05, 1.3 * 1.3 - h * h)) + 0.02;
    parts.push(paint(xf(G.sphere(0.18, 5, 4), [Math.cos(a) * r, h, Math.sin(a) * r], [0, a, 0.5], [1, 0.35, 0.6]), leaf[i % 4]));
  }
  parts.push(paint(xf(G.cyl(0.015, 0.015, 0.7, 4), [0.4, 1.55, -0.3]), 0x6b4a30));
  parts.push(paint(xf(G.box(0.26, 0.16, 0.02), [0.53, 1.8, -0.3]), 0xff6b2c));
  const mesh = new THREE.Mesh(merge(parts), toonMat());
  mesh.castShadow = true; mesh.receiveShadow = true;
  addOutline(mesh, 0.025);
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

export class Blinds {
  constructor(game) {
    this.game = game;
    this.mine = null;       // {x, y, z, yaw, mesh}
  }

  get owned() { return !!this.game.profile.gear.blind; }

  toggle() {
    const g = this.game, p = g.player;
    if (!this.owned) { g.ui.feed('No ground blind. The lodge sells a nice leafy one (Gear tab).', 'warn'); return; }
    if (p.vehicle || p.swimming || p.onTower) { g.ui.feed('Find some solid ground first.', 'warn'); return; }
    if (this.mine && Math.hypot(this.mine.x - p.pos.x, this.mine.z - p.pos.z) < 4) {
      g.scene.remove(this.mine.mesh); this.mine = null;
      g.audio.play('reload', p.pos);
      g.ui.feed('Blind packed up.', 'info');
      return;
    }
    if (this.mine) g.scene.remove(this.mine.mesh);
    const f = p.forward();
    const l = Math.hypot(f.x, f.z) || 1;
    const x = p.pos.x + f.x / l * 1.6, z = p.pos.z + f.z / l * 1.6;
    const y = g.terrain.heightAt(x, z);
    const mesh = buildBlind();
    mesh.position.set(x, y - 0.05, z);
    const yaw = Math.atan2(-f.x, -f.z) + Math.PI; // window faces where you were looking
    mesh.rotation.y = yaw;
    g.scene.add(mesh);
    this.mine = { x, y, z, yaw, mesh };
    g.audio.play('boing', { x, y, z });
    g.sounds.emit('equipment', x, y + 0.5, z, 150, g.time, 'player');
    g.ui.feed('Pop! Blind pitched. Step inside and stay put: animals can barely see you in there (they can still smell you).', 'good');
  }

  /** Is this point inside a blind (mine or a friend's)? */
  inside(x, z) {
    if (this.mine && Math.hypot(this.mine.x - x, this.mine.z - z) < BLIND_R) return true;
    for (const r of this.game.coop.peers.values()) if (r.blind && Math.hypot(r.blind.x - x, r.blind.z - z) < BLIND_R) return true;
    return false;
  }

  /** Don't render a blind the camera is sitting inside (you'd only see its ink hull). */
  render(cam) {
    const hide = (b) => { if (b) b.mesh.visible = Math.hypot(cam.x - b.x, cam.z - b.z) > BLIND_R + 0.35; };
    hide(this.mine);
    for (const r of this.game.coop.peers.values()) hide(r.blind);
  }

  clear() { if (this.mine) { this.game.scene.remove(this.mine.mesh); this.mine = null; } }
}
