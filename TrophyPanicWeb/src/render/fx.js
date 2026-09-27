// Cartoon effects: blob particles that splat into decals, dazed stars,
// little ghosts, tracers, flashlight, and the on-ground rendering of tracks
// and blood (evidence). All presentation — the simulation already decided
// what happened; this only shows it.

import { THREE } from '../three.js';
import { G, paint, merge, xf, toonMat, solidToon } from '../render/toon.js';
import { BIOME_NAMES } from '../world/terrainData.js';

const MAX_P = 700;
const MAX_DECAL = 900;

function surfaceName(b) {
  const n = BIOME_NAMES[b];
  return n === 'marsh' ? 'mud' : n === 'ridge' ? 'rock' : n === 'meadow' || n === 'brush' ? 'grass' : n === 'water' ? 'water' : n === 'snow' ? 'snow' : 'soil';
}

export class FX {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    this.shake = 0;
    this.senseT = 0;

    // --- particles --------------------------------------------------
    const blob = G.ico(1, 1);
    this.pMesh = new THREE.InstancedMesh(blob, solidToon(0xffffff), MAX_P);
    this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pMesh.frustumCulled = false;
    this.pMesh.count = 0;
    scene.add(this.pMesh);
    this.particles = [];

    // --- decals (splats, scorch, flattened grass) ----------------------
    const splatGeo = new THREE.CircleGeometry(1, 9);
    splatGeo.rotateX(-Math.PI / 2);
    this.dMesh = new THREE.InstancedMesh(splatGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), MAX_DECAL);
    this.dMesh.frustumCulled = false;
    this.dMesh.renderOrder = 3;
    this.dMesh.count = 0;
    scene.add(this.dMesh);
    this.decals = [];
    this.decalHead = 0;

    // --- evidence markers ---------------------------------------------
    const print = merge([
      paint(xf(G.circle(0.5, 7), [-0.28, 0, 0], [-Math.PI / 2, 0, 0], [0.5, 1, 1]), 0xffffff),
      paint(xf(G.circle(0.5, 7), [0.28, 0, 0], [-Math.PI / 2, 0, 0], [0.5, 1, 1]), 0xffffff),
    ]);
    this.printMesh = new THREE.InstancedMesh(print, new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x5a3a22, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }), 600);
    this.printMesh.frustumCulled = false; this.printMesh.count = 0; this.printMesh.renderOrder = 3;
    scene.add(this.printMesh);
    const drop = new THREE.CircleGeometry(1, 8); drop.rotateX(-Math.PI / 2);
    this.bloodMesh = new THREE.InstancedMesh(drop, new THREE.MeshBasicMaterial({ color: 0xd8203f, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), 700);
    this.bloodMesh.frustumCulled = false; this.bloodMesh.count = 0; this.bloodMesh.renderOrder = 4;
    scene.add(this.bloodMesh);
    const ring = new THREE.RingGeometry(0.55, 0.75, 16); ring.rotateX(-Math.PI / 2);
    this.senseMesh = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }), 500);
    this.senseMesh.frustumCulled = false; this.senseMesh.count = 0; this.senseMesh.renderOrder = 5;
    scene.add(this.senseMesh);
    this.evidenceT = 0;
    this.focusClue = null;

    // --- stars (dazed), ghosts, tracers ---------------------------------
    this.stars = [];
    this.ghosts = [];
    this.tracers = [];
    this.starGeo = merge([paint(xf(G.cone(0.08, 0.18, 4), [0, 0, 0], [0, 0, Math.PI / 2]), 0xffe066), paint(xf(G.cone(0.08, 0.18, 4), [0, 0, 0], [0, 0, -Math.PI / 2]), 0xffe066), paint(xf(G.cone(0.08, 0.18, 4), [0, 0, 0]), 0xffe066), paint(xf(G.cone(0.08, 0.18, 4), [0, 0, 0], [Math.PI, 0, 0]), 0xffe066)]);
    this.ghostGeo = merge([
      paint(xf(G.sphere(0.5, 14, 10), [0, 0.5, 0]), 0xffffff),
      paint(xf(G.cone(0.5, 0.6, 12), [0, -0.05, 0], [Math.PI, 0, 0]), 0xffffff),
      paint(xf(G.sphere(0.09, 8, 6), [-0.17, 0.62, 0.43], [0, 0, 0], [1, 1.3, 0.6]), 0x3a2a44),
      paint(xf(G.sphere(0.09, 8, 6), [0.17, 0.62, 0.43], [0, 0, 0], [1, 1.3, 0.6]), 0x3a2a44),
      paint(xf(G.torus(0.3, 0.04, 6, 18), [0, 1.18, 0], [Math.PI / 2, 0, 0]), 0xffe066),
    ]);
    this.ghostMat = new THREE.MeshToonMaterial({ vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false });

    // --- startled birds -------------------------------------------------
    const birdGeo = merge([
      paint(xf(G.sphere(0.09, 7, 5), [0, 0, 0], [0, 0, 0], [0.8, 0.8, 1.2]), 0xffffff),
      paint(xf(G.sphere(0.06, 6, 5), [0, 0.05, 0.09]), 0xffffff),
      paint(xf(G.cone(0.02, 0.05, 4), [0, 0.04, 0.16], [Math.PI / 2, 0, 0]), 0xffb03a),
      paint(xf(G.box(0.26, 0.015, 0.1), [0.15, 0.02, 0], [0, 0, 0.35]), 0xffffff),
      paint(xf(G.box(0.26, 0.015, 0.1), [-0.15, 0.02, 0], [0, 0, -0.35]), 0xffffff),
    ]);
    this.birdMesh = new THREE.InstancedMesh(birdGeo, toonMat(), 64);
    this.birdMesh.frustumCulled = false; this.birdMesh.count = 0;
    scene.add(this.birdMesh);
    this.birds = [];

    // --- chimney & campfire smoke ---------------------------------------
    this.smokeT = 0;

    // --- flashlight -------------------------------------------------------
    this.flash = new THREE.SpotLight(0xfff2c8, 0, 60, 0.42, 0.45, 1.2);
    this.flash.castShadow = false;
    game.camera.add(this.flash);
    this.flash.position.set(0.2, -0.1, 0);
    this.flash.target.position.set(0, 0, -5);
    game.camera.add(this.flash.target);
    game.scene.add(game.camera);
    this.flashOn = false;
  }

  goreMode() { return this.game.profile.settings.gore; }

  // ------------------------------------------------------------------ spawners
  burst(x, y, z, { count = 12, color = 0xe8384f, speed = 4, size = 0.08, up = 3, kind = 'blood', dir = null } = {}) {
    const mode = this.goreMode();
    if (kind === 'blood' && mode === 'confetti') kind = 'confetti';
    if (kind === 'blood' && mode === 'mild') count = Math.ceil(count * 0.35);
    const colors = kind === 'confetti' ? [0xff6b2c, 0xffd23f, 0x5bbf4a, 0x62c3f2, 0xff8fc7, 0x9a6bff] : null;
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_P) this.particles.shift();
      let vx = (Math.random() - 0.5) * speed, vy = Math.random() * up + 1, vz = (Math.random() - 0.5) * speed;
      if (dir) { vx += dir.x * speed * 0.8; vy += dir.y * speed * 0.3; vz += dir.z * speed * 0.8; }
      this.particles.push({
        x, y, z, vx, vy, vz, life: 1.4 + Math.random() * 0.8, age: 0,
        size: size * (0.6 + Math.random() * 0.9), color: colors ? colors[i % colors.length] : color, kind,
      });
    }
  }

  splat(x, z, r = 0.4, color = 0xd8203f, life = 160) {
    const T = this.game.terrain;
    const y = T.heightAt(x, z) + 0.03;
    if (y < 4.0) return; // lands in water: no splat
    const d = { x, y, z, r, color, life, age: 0, rot: Math.random() * 6.28 };
    if (this.decals.length < MAX_DECAL) this.decals.push(d);
    else { this.decals[this.decalHead] = d; this.decalHead = (this.decalHead + 1) % MAX_DECAL; }
  }

  impact(x, y, z, surface) {
    if (surface === 'water') { this.burst(x, y, z, { count: 10, color: 0xbff4ff, speed: 2.5, up: 4, kind: 'water' }); this.game.audio.play('splash', { x, y, z }); return; }
    if (surface === 'wood') { this.burst(x, y, z, { count: 8, color: 0xc79a5c, speed: 3, kind: 'chip', size: 0.05 }); this.game.audio.play('wood', { x, y, z }); return; }
    if (surface === 'rock') { this.burst(x, y, z, { count: 7, color: 0xcfc6be, speed: 3, kind: 'chip', size: 0.05 }); this.game.audio.play('ricochet', { x, y, z }); return; }
    this.burst(x, y, z, { count: 9, color: 0x9b7a55, speed: 2, up: 2.5, kind: 'dirt', size: 0.07 });
    this.game.audio.play('dirt', { x, y, z });
  }

  bloodHit(x, y, z, dir, severity = 1, small = false) {
    const n = Math.round((small ? 6 : 12) * Math.min(3, 0.6 + severity));
    this.burst(x, y, z, { count: n, color: 0xe8384f, speed: 2.5 + severity * 2, up: 2.5, dir, size: small ? 0.05 : 0.09 });
    if (this.goreMode() !== 'confetti') this.splat(x + dir.x * 0.6, z + dir.z * 0.6, 0.25 + severity * 0.25);
  }

  feathers(x, y, z) { this.burst(x, y, z, { count: 18, color: 0x7a5a44, speed: 3, up: 3, kind: 'feather', size: 0.07 }); }

  /** A gunshot flushes little birds out of the nearest trees. */
  flushBirds(x, z) {
    const g = this.game;
    const trees = g.vegetation.query(x, z, 45, []).filter(o => !o.soft && (o.h || 0) > 3);
    if (!trees.length) return;
    const cols = [0x62c3f2, 0xe8384f, 0xffd23f, 0xff8fc7, 0x5a4a6a];
    for (let k = 0; k < Math.min(3, trees.length); k++) {
      const t = trees[Math.floor(Math.random() * trees.length)];
      const ty = (t.y ?? g.terrain.heightAt(t.x, t.z)) + (t.h || 6) * 0.85;
      const away = Math.atan2(t.z - z, t.x - x);
      const n = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n && this.birds.length < 64; i++) {
        const a = away + (Math.random() - 0.5) * 1.4, sp = 5 + Math.random() * 4;
        this.birds.push({ x: t.x + (Math.random() - 0.5) * 2, y: ty + Math.random(), z: t.z + (Math.random() - 0.5) * 2, vx: Math.cos(a) * sp, vy: 3 + Math.random() * 3, vz: Math.sin(a) * sp, ph: Math.random() * 6, t: 0, col: cols[(k + i) % cols.length] });
      }
      g.audio.play('flutter', { x: t.x, y: ty, z: t.z });
    }
  }

  dazed(target, seconds = 3) { this.stars.push({ target, t: seconds, mesh: null }); }

  ghost(x, y, z, tint = 0xffffff, scale = 1) {
    const m = new THREE.Mesh(this.ghostGeo, this.ghostMat.clone());
    m.material.color.set(tint).lerp(new THREE.Color(0xffffff), 0.7);
    m.position.set(x, y, z);
    m.scale.setScalar(scale);
    this.game.scene.add(m);
    this.ghosts.push({ m, t: 0 });
  }

  tracer(ax, ay, az, bx, by, bz, color = 0xfff2a8) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ax, ay, az), new THREE.Vector3(bx, by, bz)]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 }));
    this.game.scene.add(line);
    this.tracers.push({ line, t: 0.12 });
  }

  playerHurt(dmg) {
    this.shake = Math.min(1.2, this.shake + dmg / 30);
    this.hurtFlash = Math.min(1, (this.hurtFlash || 0) + dmg / 35);
  }

  hunterSense(on) {
    this.senseT = on ? 8 : 0;
    this.game.audio.play('sense');
    this.evidenceT = 0;
  }

  toggleFlashlight() {
    this.flashOn = !this.flashOn;
    this.flash.intensity = this.flashOn ? 2.2 : 0;
    this.game.audio.play('click');
  }

  // ------------------------------------------------------------------ update
  step(dt) {
    const T = this.game.terrain;
    for (const p of this.particles) {
      p.age += dt;
      const drag = p.kind === 'feather' ? 3 : p.kind === 'confetti' ? 1.5 : 0.3;
      p.vx *= Math.exp(-drag * dt); p.vz *= Math.exp(-drag * dt);
      p.vy -= (p.kind === 'feather' ? 2 : p.kind === 'confetti' ? 4 : 14) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const g = T.heightAt(p.x, p.z);
      if (p.y < g + p.size * 0.5) {
        if (p.kind === 'blood' && !p.landed) { this.splat(p.x, p.z, p.size * 2.2, 0xd8203f, 120); }
        p.landed = true;
        p.y = g + p.size * 0.5; p.vy = Math.abs(p.vy) * 0.2; p.vx *= 0.5; p.vz *= 0.5;
        if (p.kind === 'blood') p.age = p.life;
      }
    }
    this.particles = this.particles.filter(p => p.age < p.life);
    for (const d of this.decals) d.age += dt;
    for (const s of this.stars) s.t -= dt;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.hurtFlash = Math.max(0, (this.hurtFlash || 0) - dt * 1.2);
    if (this.senseT > 0) this.senseT -= dt;
  }

  render(dt) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    // particles
    let n = 0;
    for (const pt of this.particles) {
      const k = pt.kind === 'blood' ? 1 : Math.min(1, (pt.life - pt.age) * 2);
      const sc = pt.size * k;
      m.compose(p.set(pt.x, pt.y, pt.z), q.identity(), s.set(sc, pt.kind === 'feather' ? sc * 0.3 : sc, sc));
      this.pMesh.setMatrixAt(n, m);
      this.pMesh.setColorAt(n, c.setHex(pt.color));
      n++;
    }
    this.pMesh.count = n;
    this.pMesh.instanceMatrix.needsUpdate = true;
    if (this.pMesh.instanceColor) this.pMesh.instanceColor.needsUpdate = true;

    // decals
    n = 0;
    for (const d of this.decals) {
      if (d.age > d.life) continue;
      const k = Math.min(1, (d.life - d.age) / 20) * Math.min(1, d.age * 8 + 0.3);
      q.setFromAxisAngle(up, d.rot);
      m.compose(p.set(d.x, d.y, d.z), q, s.set(d.r * k, 1, d.r * k * 0.85));
      this.dMesh.setMatrixAt(n, m);
      this.dMesh.setColorAt(n, c.setHex(d.color));
      n++;
    }
    this.dMesh.count = n;
    this.dMesh.instanceMatrix.needsUpdate = true;
    if (this.dMesh.instanceColor) this.dMesh.instanceColor.needsUpdate = true;

    this.renderEvidence(dt);

    // birds: flap (squash the wings), climb, then drift away and vanish
    n = 0;
    for (const b of this.birds) {
      b.t += dt; b.ph += dt * 22;
      b.vy = Math.max(-0.5, b.vy - dt * 1.5);
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      q.setFromAxisAngle(up, Math.atan2(b.vx, b.vz));
      const k = Math.min(1, (6 - b.t) * 2) * 1.3;
      m.compose(p.set(b.x, b.y, b.z), q, s.set(k, k * (0.35 + Math.abs(Math.sin(b.ph)) * 1.1), k));
      this.birdMesh.setMatrixAt(n, m);
      this.birdMesh.setColorAt(n, c.setHex(b.col));
      n++;
    }
    this.birds = this.birds.filter(b => b.t < 6);
    this.birdMesh.count = n;
    this.birdMesh.instanceMatrix.needsUpdate = true;
    if (this.birdMesh.instanceColor) this.birdMesh.instanceColor.needsUpdate = true;

    // stars circling dazed heads
    for (const st of this.stars) {
      if (!st.mesh) { st.mesh = new THREE.Group(); for (let i = 0; i < 3; i++) st.mesh.add(new THREE.Mesh(this.starGeo, toonMat())); this.game.scene.add(st.mesh); }
      const hp = st.target.headWorld ? st.target.headWorld() : st.target;
      st.mesh.position.set(hp.x, hp.y + 0.35, hp.z);
      st.mesh.rotation.y += dt * 5;
      st.mesh.children.forEach((ch, i) => { const a = i / 3 * 6.28; ch.position.set(Math.cos(a) * 0.35, Math.sin(this.game.visualTime * 6 + i) * 0.05, Math.sin(a) * 0.35); ch.rotation.z += dt * 6; });
      if (st.t <= 0) { this.game.scene.remove(st.mesh); st.mesh = null; }
    }
    this.stars = this.stars.filter(st => st.t > 0);

    for (const g of this.ghosts) {
      g.t += dt;
      g.m.position.y += dt * 0.9;
      g.m.position.x += Math.sin(g.t * 3) * dt * 0.4;
      g.m.rotation.y += dt * 0.8;
      g.m.material.opacity = Math.max(0, 0.8 - g.t * 0.2);
      if (g.t > 4) { this.game.scene.remove(g.m); g.m.material.dispose(); }
    }
    this.ghosts = this.ghosts.filter(g => g.t <= 4);

    for (const tr of this.tracers) { tr.t -= dt; tr.line.material.opacity = Math.max(0, tr.t / 0.12) * 0.7; if (tr.t <= 0) { this.game.scene.remove(tr.line); tr.line.geometry.dispose(); } }
    this.tracers = this.tracers.filter(t => t.t > 0);

    this.smokeT -= dt;
    if (this.smokeT <= 0) {
      this.smokeT = 0.35;
      for (const f of this.game.structures.fires) {
        if (Math.hypot(f.x - this.game.camera.position.x, f.z - this.game.camera.position.z) < 150) {
          this.burst(f.x, f.y + 0.6, f.z, { count: 1, color: 0xff9a3a, speed: 0.3, up: 1.5, kind: 'ember', size: 0.06 });
          this.burst(f.x, f.y + 1.0, f.z, { count: 1, color: 0xdad4cf, speed: 0.4, up: 0.8, kind: 'smoke', size: 0.35 });
        }
      }
    }
    // smoke floats up instead of falling
    for (const pt of this.particles) if (pt.kind === 'smoke' || pt.kind === 'ember') { pt.vy += (pt.kind === 'smoke' ? 15.5 : 14.8) * dt; pt.size *= 1 + dt * (pt.kind === 'smoke' ? 0.6 : -0.5); }
  }

  renderEvidence(dt) {
    this.evidenceT -= dt;
    if (this.evidenceT > 0) return;
    this.evidenceT = 0.25;
    const g = this.game, T = g.terrain;
    const pp = g.player.pos;
    const now = g.time;
    const sense = this.senseT > 0;
    const radius = sense ? 45 : 28;
    const near = g.evidence.nearby(pp.x, pp.z, radius, now, sense ? 0.04 : 0.12, (x, z) => surfaceName(T.biomeAt(x, z)));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    let np = 0, nb = 0, ns = 0;
    for (const cl of near) {
      const read = g.evidence.readability(cl, now, surfaceName(T.biomeAt(cl.x, cl.z)));
      const y = T.heightAt(cl.x, cl.z) + 0.04;
      if (cl.kind === 'Footprint' && np < 600) {
        const sc = (cl.printCm || 8) / 100 * 1.2;
        q.setFromAxisAngle(up, Math.atan2(cl.dirX, cl.dirZ));
        m.compose(p.set(cl.x, y, cl.z), q, s.set(sc, 1, sc * 1.4));
        this.printMesh.setMatrixAt(np, m);
        const k = 0.35 + read * 0.65;
        this.printMesh.setColorAt(np, c.setRGB(k, k, k));
        np++;
      } else if (cl.kind.startsWith('Blood') && nb < 700) {
        const sc = cl.kind === 'BloodPool' ? (cl.size || 0.8) : cl.heavy ? 0.13 : 0.08;
        m.compose(p.set(cl.x, y + 0.005, cl.z), q.identity(), s.set(sc * (0.4 + read * 0.6), 1, sc * (0.4 + read * 0.6)));
        this.bloodMesh.setMatrixAt(nb, m);
        nb++;
      }
      if (sense && ns < 500 && cl.species !== 'hunter') {
        const pulse = 0.8 + Math.sin(g.visualTime * 5 + cl.x) * 0.2;
        const sc = cl.kind === 'BloodPool' ? 1.4 : 0.5;
        m.compose(p.set(cl.x, y + 0.02, cl.z), q.identity(), s.set(sc * pulse, 1, sc * pulse));
        this.senseMesh.setMatrixAt(ns, m);
        ns++;
      }
    }
    this.printMesh.count = np; this.bloodMesh.count = nb; this.senseMesh.count = ns;
    for (const im of [this.printMesh, this.bloodMesh, this.senseMesh]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }

    // The clue under the crosshair gets a field note.
    let best = null, bestScore = 0.985;
    const cam = g.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    for (const cl of near) {
      const dx = cl.x - cam.position.x, dy = T.heightAt(cl.x, cl.z) - cam.position.y, dz = cl.z - cam.position.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 9) continue;
      const dot = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d;
      if (dot > bestScore) { bestScore = dot; best = cl; }
    }
    this.focusClue = best;
  }
}
