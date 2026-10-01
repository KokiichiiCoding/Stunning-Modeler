// First-person viewmodels: chunky low-poly gear held in big mittens.
// Rendered in a separate scene after a depth clear so they never clip.

import { THREE } from '../three.js';
import { G, paint, merge, xf, toonMat } from '../render/toon.js';

// Hands match your hunter: bare skin (any colour) and your jacket sleeve.
let MITTEN = 0xf2c4a0, SLEEVE = 0x5f6e34;
const CUFF = 0x4a3a28;
export function setHandColors(skin, jacket) { MITTEN = skin; SLEEVE = jacket; }
const WOOD = 0x8a5a36, DARKWOOD = 0x5c3a22, STEEL = 0x3b3f4a, BRASS = 0xd9b04a;

function mitten(x, y, z, rx = 0, ry = 0, rz = 0) {
  return [
    paint(xf(G.sphere(0.055, 10, 8), [x, y, z], [rx, ry, rz], [1, 0.85, 1.2]), MITTEN),
    paint(xf(G.sphere(0.024, 6, 5), [x + 0.045, y + 0.02, z - 0.02], [rx, ry, rz]), MITTEN),
    paint(xf(G.cyl(0.045, 0.05, 0.05, 10), [x, y - 0.01, z + 0.07], [Math.PI / 2 + rx, ry, rz]), CUFF),
    paint(xf(G.cyl(0.05, 0.05, 0.2, 8), [x, y - 0.02, z + 0.19], [Math.PI / 2 + rx, ry, rz]), SLEEVE),
  ];
}

function rifleGeo(w) {
  const wood = w.color || WOOD;
  const p = [
    // chunky toy-like stock and fore-end
    paint(xf(G.box(0.07, 0.09, 0.6), [0, -0.035, 0.0]), wood, { bottom: tint(wood, 0.8) }),
    paint(xf(G.box(0.075, 0.14, 0.24), [0, -0.08, 0.3], [0.22, 0, 0]), wood, { bottom: tint(wood, 0.8) }),
    paint(xf(G.box(0.08, 0.05, 0.03), [0, -0.1, 0.42], [0.22, 0, 0]), 0x2a1f1a),
    paint(xf(G.cyl(0.018, 0.022, 0.6, 8), [0, 0.02, -0.56], [Math.PI / 2, 0, 0]), 0x58606e),
    paint(xf(G.box(0.055, 0.055, 0.22), [0, 0.02, -0.04]), 0x58606e),
    paint(xf(G.cyl(0.008, 0.008, 0.06, 5), [0.035, 0.03, 0.02], [0, 0, Math.PI / 2]), STEEL),
    paint(xf(G.sphere(0.015, 6, 5), [0.07, 0.03, 0.02]), STEEL),
  ];
  if (w.zoom >= 3) {
    p.push(paint(xf(G.cyl(0.026, 0.026, 0.26, 10), [0, 0.095, -0.04], [Math.PI / 2, 0, 0]), 0x3a4150));
    p.push(paint(xf(G.cyl(0.036, 0.028, 0.06, 10), [0, 0.095, -0.2], [Math.PI / 2, 0, 0]), 0x3a4150));
    p.push(paint(xf(G.cyl(0.032, 0.026, 0.05, 10), [0, 0.095, 0.11], [Math.PI / 2, 0, 0]), 0x3a4150));
    p.push(paint(xf(G.cyl(0.03, 0.03, 0.005, 10), [0, 0.095, -0.232], [Math.PI / 2, 0, 0]), 0x7fd0ff));
    p.push(paint(xf(G.box(0.016, 0.04, 0.03), [0, 0.06, -0.06]), 0x3a4150));
  } else {
    p.push(paint(xf(G.box(0.01, 0.025, 0.01), [0, 0.045, -0.84]), BRASS));
  }
  return p;
}

function tint(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return c.getHex(); }

function build(w) {
  const parts = [];
  switch (w.type) {
    case 'rifle': {
      parts.push(...rifleGeo(w));
      if (w.id === 'lever_4570') parts.push(paint(xf(G.torus(0.035, 0.01, 5, 10, Math.PI * 1.3), [0, -0.1, 0.12], [0, Math.PI / 2, 0.3]), STEEL));
      parts.push(...mitten(0.02, -0.09, 0.26, 0.2), ...mitten(-0.01, -0.06, -0.22, 0.1, 0.2));
      break;
    }
    case 'shotgun': {
      parts.push(
        paint(xf(G.box(0.05, 0.08, 0.34), [0, -0.05, 0.22], [0.12, 0, 0]), 0x3a3f4a),
        paint(xf(G.cyl(0.02, 0.02, 0.72, 8), [0, 0.02, -0.4], [Math.PI / 2, 0, 0]), STEEL),
        paint(xf(G.cyl(0.018, 0.018, 0.55, 8), [0, -0.025, -0.33], [Math.PI / 2, 0, 0]), STEEL),
        paint(xf(G.box(0.06, 0.06, 0.16), [0, -0.03, -0.3]), 0x9a5a3a),
        paint(xf(G.box(0.05, 0.07, 0.2), [0, -0.0, 0.0]), STEEL),
      );
      parts.push(...mitten(0.02, -0.1, 0.24, 0.2), ...mitten(-0.01, -0.07, -0.3, 0.1, 0.2));
      break;
    }
    case 'pistol': {
      parts.push(
        paint(xf(G.box(0.04, 0.12, 0.07), [0, -0.08, 0.06], [0.3, 0, 0]), DARKWOOD),
        paint(xf(G.cyl(0.038, 0.038, 0.07, 6), [0, 0.0, 0.0], [Math.PI / 2, 0, 0]), 0x9aa0a8),
        paint(xf(G.cyl(0.015, 0.015, 0.22, 8), [0, 0.015, -0.13], [Math.PI / 2, 0, 0]), 0x9aa0a8),
        paint(xf(G.box(0.02, 0.05, 0.05), [0, -0.03, -0.03]), 0x9aa0a8),
      );
      parts.push(...mitten(0.0, -0.12, 0.08, 0.3), ...mitten(-0.03, -0.1, 0.03, 0.3, 0.3));
      break;
    }
    case 'bow': {
      const compound = w.id === 'bow_compound';
      const limb = compound ? 0x2d4a3a : 0x8a5a33;
      for (const s of [-1, 1]) {
        parts.push(paint(xf(G.torus(0.34, 0.014, 5, 12, 0.9), [0.02, s * 0.02, -0.02], [0, Math.PI / 2, s > 0 ? -0.45 : Math.PI + 0.45 - 0.9 + 0.9]), limb));
      }
      parts.push(paint(xf(G.box(0.035, 0.18, 0.04), [0, 0, 0]), compound ? 0x1f2a24 : 0x5c3a22));
      if (compound) for (const s of [-1, 1]) parts.push(paint(xf(G.cyl(0.03, 0.03, 0.02, 10), [0, s * 0.36, 0.05], [0, 0, Math.PI / 2]), 0x9aa0a8));
      parts.push(...mitten(0.0, -0.02, 0.02, 0, 0, Math.PI / 2));
      break;
    }
    case 'thrown': {
      if (w.id === 'honey') {
        parts.push(
          paint(xf(G.cyl(0.09, 0.08, 0.16, 10), [0, 0.08, 0]), 0xf2a72e, { bottom: 0xc97a12 }),
          paint(xf(G.cyl(0.095, 0.095, 0.04, 10), [0, 0.18, 0]), 0xe8384f),
          paint(xf(G.sphere(0.04, 6, 5), [0, 0.215, 0]), 0xe8384f),
          paint(xf(G.box(0.1, 0.06, 0.005), [0, 0.09, 0.085]), 0xfff4de),
);
      } else if (w.id === 'boot') {
        parts.push(
          paint(xf(G.box(0.1, 0.16, 0.12), [0, 0.02, 0]), 0x6b4a30),
          paint(xf(G.box(0.11, 0.07, 0.24), [0, -0.07, -0.06]), 0x6b4a30),
          paint(xf(G.box(0.12, 0.03, 0.25), [0, -0.115, -0.06]), 0x2a1f1a),
          paint(xf(G.torus(0.05, 0.008, 4, 8), [0, 0.1, 0], [Math.PI / 2, 0, 0]), 0xf4d9a0),
        );
      } else {
        // rubber chicken
        parts.push(
          paint(xf(G.capsule(0.05, 0.16, 4, 8), [0, 0, 0], [Math.PI / 2, 0, 0]), 0xffd23a),
          paint(xf(G.sphere(0.045, 8, 6), [0, 0.04, -0.14]), 0xffd23a),
          paint(xf(G.cone(0.02, 0.05, 5), [0, 0.03, -0.2], [-Math.PI / 2, 0, 0]), 0xff8a2a),
          paint(xf(G.box(0.01, 0.04, 0.04), [0, 0.09, -0.14]), 0xe8384f),
          paint(xf(G.sphere(0.01, 5, 4), [0.03, 0.055, -0.17]), 0x1d1622),
          paint(xf(G.sphere(0.01, 5, 4), [-0.03, 0.055, -0.17]), 0x1d1622),
          paint(xf(G.cyl(0.006, 0.006, 0.12, 4), [0.02, -0.02, 0.14], [0.4, 0, 0]), 0xff8a2a),
        );
      }
      parts.push(...mitten(0.02, -0.06, 0.05, 0.3));
      break;
    }
    case 'spray': {
      parts.push(
        paint(xf(G.cyl(0.05, 0.05, 0.24, 12), [0, -0.02, -0.02]), 0xff8a2a, { bottom: 0xd9481a }),
        paint(xf(G.cyl(0.052, 0.052, 0.05, 12), [0, -0.08, -0.02]), 0xfff4de),
        paint(xf(G.box(0.05, 0.04, 0.06), [0, 0.12, -0.04]), 0x2a2a30),
        paint(xf(G.cyl(0.008, 0.008, 0.04, 6), [0, 0.12, -0.08], [Math.PI / 2, 0, 0]), 0x2a2a30),
        paint(xf(G.box(0.07, 0.05, 0.002), [0, 0.0, 0.031]), 0x1d1622),
      );
      parts.push(...mitten(0.0, -0.04, 0.06, 0.25));
      break;
    }
    case 'rod': {
      // cork handle, reel, a long bendy pole angled up and out
      parts.push(
        paint(xf(G.cyl(0.022, 0.026, 0.22, 8), [0, -0.02, 0.06], [0.5 - Math.PI / 2, 0, 0]), 0xc9a26a, { bottom: 0xa8824a }),
        paint(xf(G.cyl(0.04, 0.04, 0.03, 12), [0.035, -0.04, -0.02], [0, 0, Math.PI / 2]), 0xe8384f),
        paint(xf(G.cyl(0.012, 0.012, 0.035, 6), [0.06, -0.04, -0.02], [0, 0, Math.PI / 2]), 0x2a2a30),
        paint(xf(G.cyl(0.006, 0.014, 1.15, 6), [0, 0.27, -0.5], [0.5 - Math.PI / 2, 0, 0]), 0x2f6fb0, { bottom: 0x1f4f80 }),
        paint(xf(G.torus(0.012, 0.003, 4, 8), [0, 0.12, -0.23], [0.5 - Math.PI / 2, 0, 0]), 0xd8d8e0),
        paint(xf(G.torus(0.009, 0.003, 4, 8), [0, 0.33, -0.62], [0.5 - Math.PI / 2, 0, 0]), 0xd8d8e0),
      );
      parts.push(...mitten(0.0, -0.04, 0.08, 0.3));
      break;
    }
    case 'camera': {
      parts.push(
        paint(xf(G.box(0.2, 0.12, 0.08), [0, 0, 0]), 0x4fb4f0, { bottom: 0x2f7fb0 }),
        paint(xf(G.cyl(0.045, 0.05, 0.07, 14), [0, -0.005, -0.07], [Math.PI / 2, 0, 0]), 0x2a2a30),
        paint(xf(G.cyl(0.032, 0.032, 0.012, 14), [0, -0.005, -0.106], [Math.PI / 2, 0, 0]), 0x8fd3ff),
        paint(xf(G.box(0.05, 0.03, 0.03), [0.06, 0.075, 0]), 0xfff4de),
        paint(xf(G.sphere(0.018, 8, 6), [-0.07, 0.07, 0.0]), 0xe8384f),
        paint(xf(G.box(0.04, 0.025, 0.012), [0.065, 0.02, -0.043]), 0xffffff),
      );
      parts.push(...mitten(-0.12, -0.03, 0.02, 0.2), ...mitten(0.12, -0.03, 0.02, 0.2));
      break;
    }
    case 'blower': {
      parts.push(
        paint(xf(G.sphere(0.12, 10, 8), [0, -0.02, 0.1], [0, 0, 0], [1, 0.9, 1.1]), 0xe24a3b),
        paint(xf(G.cyl(0.04, 0.05, 0.62, 10), [0, -0.05, -0.28], [Math.PI / 2 + 0.08, 0, 0]), 0xf2f2f2),
        paint(xf(G.cyl(0.058, 0.045, 0.06, 10), [0, -0.075, -0.6], [Math.PI / 2 + 0.08, 0, 0]), 0xffd23f),
        paint(xf(G.box(0.03, 0.08, 0.1), [0, 0.1, 0.12]), 0x2a2a30),
      );
      parts.push(...mitten(0.0, 0.08, 0.12, 0.2), ...mitten(-0.03, -0.1, -0.2, 0.2, 0.3));
      break;
    }
  }
  return merge(parts);
}

function binocularsGeo() {
  return merge([
    paint(xf(G.cyl(0.045, 0.05, 0.14, 10), [-0.055, 0, 0], [Math.PI / 2, 0, 0]), 0x3a4a3a),
    paint(xf(G.cyl(0.045, 0.05, 0.14, 10), [0.055, 0, 0], [Math.PI / 2, 0, 0]), 0x3a4a3a),
    paint(xf(G.box(0.05, 0.03, 0.06), [0, 0.02, 0.01]), 0x2a2a2a),
    ...mitten(-0.09, -0.04, 0.05), ...mitten(0.09, -0.04, 0.05),
  ]);
}

export class Viewmodel {
  constructor(game) {
    this.game = game;
    const vs = game.viewScene;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x6f7a4c, 1.0);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.2);
    this.sun.position.set(0.5, 1, 0.3);
    vs.add(this.hemi); vs.add(this.sun);
    this.root = new THREE.Group();
    this.root.scale.setScalar(0.85);
    vs.add(this.root);
    this.meshes = {};
    this.binos = new THREE.Mesh(binocularsGeo(), toonMat());
    this.binos.visible = false;
    this.root.add(this.binos);
    this.flash = new THREE.Mesh(merge([
      paint(xf(G.cone(0.05, 0.14, 6), [0, 0, -0.07], [-Math.PI / 2, 0, 0]), 0xffe066),
      paint(xf(G.sphere(0.05, 6, 5), [0, 0, 0]), 0xfff4b0),
    ]), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }));
    this.flash.visible = false;
    this.root.add(this.flash);
    this.kick = 0; this.bob = 0; this.aim = 0; this.reloadT = 0; this.switchT = 0; this.cycleT = 0;
    this.current = null;
  }

  meshFor(w) {
    if (!this.meshes[w.id]) {
      const m = new THREE.Mesh(build(w), toonMat());
      m.visible = false;
      if (w.type === 'rod') { this.tip = new THREE.Object3D(); this.tip.position.set(0, 0.53, -1.0); m.add(this.tip); }
      this.root.add(m);
      this.meshes[w.id] = m;
    }
    return this.meshes[w.id];
  }

  /** Rebuild every held mesh (after the hunter's look changes). */
  rebuildHands() {
    for (const id in this.meshes) { this.root.remove(this.meshes[id]); this.meshes[id].geometry.dispose(); }
    this.meshes = {};
    this.root.remove(this.binos); this.binos = new THREE.Mesh(binocularsGeo(), toonMat()); this.binos.visible = false; this.root.add(this.binos);
    const w = this.current; this.current = null; if (w) this.setWeapon(w);
  }

  setWeapon(w) {
    if (this.current) this.meshFor(this.current).visible = false;
    this.current = w;
    if (w) this.meshFor(w).visible = true;
    this.switchT = 0.35;
  }

  fired(strength) { this.kick = Math.min(1.5, this.kick + strength); this.flashT = 0.05; }

  update(dt, st) {
    const g = this.game;
    // light the viewmodel like the world
    // (with a floor, so your own gun never turns into a black silhouette at night; the flashlight adds warm fill)
    this.hemi.color.copy(g.sky.hemi.color); this.hemi.groundColor.copy(g.sky.hemi.groundColor);
    this.hemi.intensity = Math.max(0.75, g.sky.hemi.intensity * 1.1) + (g.fx.flashOn ? 0.5 : 0);
    this.sun.color.copy(g.sky.sun.color); this.sun.intensity = Math.max(0.45, g.sky.sun.intensity * 0.9);

    this.aim += ((st.aiming ? 1 : 0) - this.aim) * Math.min(1, dt * 12);
    this.kick = Math.max(0, this.kick - dt * 6);
    this.switchT = Math.max(0, this.switchT - dt);
    const p = g.player;
    this.bob += dt * (p.speed > 0.3 ? 2 + p.speed * 1.6 : 1.2);
    const moveAmt = Math.min(1, p.speed / 4) * (1 - this.aim * 0.8);
    const bx = Math.sin(this.bob) * 0.012 * (moveAmt + 0.15), by = Math.abs(Math.cos(this.bob)) * 0.014 * (moveAmt + 0.1);
    const w = this.current;
    const hip = w && w.type === 'bow' ? [0.14, -0.14, -0.5] : w && (w.type === 'thrown') ? [0.2, -0.2, -0.45] : w && w.type === 'pistol' ? [0.14, -0.16, -0.42] : [0.24, -0.2, -0.56];
    const ads = w && w.type === 'bow' ? [0.03, -0.07, -0.48] : w && w.type === 'pistol' ? [0.0, -0.07, -0.4] : [0.0, -0.088, -0.46];
    const x = hip[0] + (ads[0] - hip[0]) * this.aim + bx;
    const y = hip[1] + (ads[1] - hip[1]) * this.aim - by - this.switchT * 0.6 - (this.reloadT > 0 ? Math.sin(Math.min(1, this.reloadT) * Math.PI) * 0.12 : 0);
    const z = hip[2] + (ads[2] - hip[2]) * this.aim + this.kick * 0.06;
    this.root.position.set(x, y, z);
    const yawIn = w && (w.type === 'rifle' || w.type === 'shotgun') ? 0.06 * (1 - this.aim) : 0;
    this.root.rotation.set(this.kick * 0.18 + (this.reloadT > 0 ? 0.5 : 0) + (st.throwWind || 0) * -0.6, yawIn, w && w.type === 'bow' ? -0.12 + this.aim * 0.1 : (st.throwWind || 0) * 0.3);
    if (w && this.meshes[w.id]) {
      const m = this.meshes[w.id];
      m.visible = !st.binoculars && !(st.hideThrown);
      if (w.type === 'bow') m.position.z = -(st.draw || 0) * 0.02;
      if (w.type === 'rifle' && this.cycleT > 0) m.rotation.z = Math.sin(this.cycleT * Math.PI) * 0.15; else m.rotation.z = 0;
      if (w.type === 'rod') {
        // wind back for the cast, bow and shake while a fish fights
        const bend = this.rodBend || 0;
        m.rotation.x = -(this.rodDraw || 0) * 0.9 + bend * 0.35 + Math.sin(g.visualTime * 31) * bend * 0.04;
        m.rotation.z = Math.sin(g.visualTime * 23) * bend * 0.05;
      } else m.rotation.x = 0;
    }
    this.binos.visible = !!st.binoculars;
    if (st.binoculars) this.root.position.set(0, -0.06, -0.18);
    this.flashT = (this.flashT || 0) - dt;
    this.flash.visible = this.flashT > 0 && w && w.type !== 'bow' && w.type !== 'thrown' && w.type !== 'blower';
    if (this.flash.visible) this.flash.position.set(0, 0.02, w.type === 'pistol' ? -0.26 : -0.9);
    if (this.reloadT > 0) this.reloadT -= dt;
    if (this.cycleT > 0) this.cycleT -= dt * 2.5;
  }
}
