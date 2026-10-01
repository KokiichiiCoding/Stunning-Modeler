// Cute, chubby, big-eyed animal rigs built from primitives, plus the
// internal hit volumes that map a bullet's path onto the real anatomy
// regions in species.js. Local space: +z forward, +y up, +x = animal's LEFT.

import { THREE } from '../three.js';
import { G, paint, merge, xf, toonMat, addOutline } from '../render/toon.js';

function tint(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return c.getHex(); }

function buildEyes(look, H, dead) {
  const size = (look.eye === 'big' ? 0.27 : look.eye === 'sly' ? 0.2 : 0.19) * 1.12;
  const r = H * size;
  const ex = H * 0.3, ey = H * 0.12, ez = H * 0.36;
  const parts = [];
  for (const s of [-1, 1]) {
    if (!dead) {
      parts.push(paint(xf(G.sphere(r, 10, 8), [s * ex, ey, ez], [0, 0, 0], [1, 1.15, 0.6]), 0xffffff));
      parts.push(paint(xf(G.sphere(r * 0.68, 10, 8), [s * ex * 0.97, ey - r * 0.05, ez + r * 0.33], [0, 0, 0], [1, 1.2, 0.5]), 0x1d1622));
      parts.push(paint(xf(G.sphere(r * 0.24, 6, 5), [s * ex * 0.97 + r * 0.22, ey + r * 0.3, ez + r * 0.6]), 0xffffff));
      parts.push(paint(xf(G.sphere(r * 0.1, 5, 4), [s * ex * 0.97 - r * 0.2, ey - r * 0.28, ez + r * 0.6]), 0xffffff));
      if (look.eye === 'sly') parts.push(paint(xf(G.sphere(r * 1.05, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.4), [s * ex, ey + r * 0.05, ez], [0.25, 0, 0], [1, 1.1, 0.62]), look.coat));
    } else {
      for (const a of [0.78, -0.78]) parts.push(paint(xf(G.box(r * 1.6, r * 0.35, r * 0.3), [s * ex, ey, ez + r * 0.45], [0, s * 0.35, a]), 0x1d1622));
    }
  }
  return merge(parts);
}

/** Angry cartoon eyebrows (shown when the animal means business). */
function buildBrows(look, H) {
  const size = (look.eye === 'big' ? 0.27 : look.eye === 'sly' ? 0.2 : 0.19) * 1.12;
  const r = H * size, ex = H * 0.3, ey = H * 0.12, ez = H * 0.36;
  const parts = [];
  for (const s of [-1, 1]) parts.push(paint(xf(G.capsule(r * 0.2, r * 1.3, 3, 6), [s * ex * 0.92, ey + r * 1.25, ez + r * 0.35], [0, 0, Math.PI / 2 + s * 0.5]), 0x1d1622));
  return merge(parts);
}

function buildEars(look, H) {
  const parts = [];
  const c = look.coat, inner = 0xffb3c1;
  for (const s of [-1, 1]) {
    if (look.ears === 'deer') {
      parts.push(paint(xf(G.sphere(H * 0.22, 8, 6), [s * H * 0.42, H * 0.34, -H * 0.02], [0, 0, s * -0.9], [0.45, 1, 0.22]), c));
      parts.push(paint(xf(G.sphere(H * 0.15, 8, 6), [s * H * 0.44, H * 0.34, H * 0.03], [0, 0, s * -0.9], [0.35, 0.85, 0.12]), inner));
    } else if (look.ears === 'pointy') {
      parts.push(paint(xf(G.cone(H * 0.15, H * 0.36, 6), [s * H * 0.24, H * 0.5, -H * 0.02], [0, 0, s * -0.25]), c));
      parts.push(paint(xf(G.cone(H * 0.09, H * 0.24, 6), [s * H * 0.24, H * 0.48, H * 0.03], [0, 0, s * -0.25]), inner));
    } else if (look.ears === 'round') {
      parts.push(paint(xf(G.sphere(H * 0.15, 8, 6), [s * H * 0.33, H * 0.38, -H * 0.05], [0, 0, 0], [1, 1, 0.5]), c));
      parts.push(paint(xf(G.sphere(H * 0.09, 8, 6), [s * H * 0.33, H * 0.38, -H * 0.0], [0, 0, 0], [1, 1, 0.4]), inner));
    } else if (look.ears === 'pig') {
      parts.push(paint(xf(G.cone(H * 0.16, H * 0.3, 4), [s * H * 0.3, H * 0.38, H * 0.02], [0.7, 0, s * -0.6]), c));
    } else if (look.ears === 'bunny') {
      parts.push(paint(xf(G.capsule(H * 0.1, H * 0.7, 4, 6), [s * H * 0.16, H * 0.8, -H * 0.1], [-0.25, 0, s * -0.18], [1, 1, 0.45]), c));
      parts.push(paint(xf(G.capsule(H * 0.06, H * 0.55, 4, 6), [s * H * 0.16, H * 0.8, -H * 0.06], [-0.25, 0, s * -0.18], [1, 1, 0.3]), inner));
    }
  }
  return parts;
}

function buildAntlers(look, H, size01, palms, gold = false) {
  const parts = [];
  const bone = gold ? 0xffd24a : 0xf1e3c2;
  const k = (look.antlerSize || 1) * (0.45 + size01 * 0.9);
  for (const s of [-1, 1]) {
    const bx = s * H * 0.2, by = H * 0.42;
    if (palms) {
      parts.push(paint(xf(G.cyl(0.04 * k, 0.05 * k, 0.3 * k, 5), [bx + s * 0.12 * k, by + 0.1 * k, 0], [0, 0, s * -1.1]), bone));
      parts.push(paint(xf(G.sphere(0.34 * k, 8, 6), [bx + s * 0.42 * k, by + 0.22 * k, -0.02], [0, 0, s * -0.35], [1.1, 0.45, 0.16]), bone));
      for (let i = 0; i < 4; i++) parts.push(paint(xf(G.cone(0.04 * k, 0.14 * k, 4), [bx + s * (0.3 + i * 0.1) * k, by + (0.38 + (i % 2) * 0.04) * k, 0], [0, 0, s * -0.2]), bone));
    } else {
      const main = 0.55 * k;
      parts.push(paint(xf(G.cyl(0.025 * k, 0.045 * k, main, 5), [bx + s * 0.12 * k, by + main * 0.45, -0.05 * k], [-0.35, 0, s * -0.45]), bone));
      const tines = Math.max(1, Math.round(1 + size01 * 4));
      for (let i = 0; i < tines; i++) {
        const t = (i + 1) / (tines + 1);
        const tx = bx + s * (0.12 + t * 0.2) * k, ty = by + (0.12 + t * 0.4) * k, tz = -0.05 * k - t * 0.14 * k;
        parts.push(paint(xf(G.cyl(0.015 * k, 0.03 * k, 0.22 * k, 4), [tx, ty + 0.09 * k, tz + 0.06 * k], [0.5, 0, s * 0.2]), bone));
        parts.push(paint(xf(G.sphere(0.028 * k, 5, 4), [tx, ty + 0.2 * k, tz + 0.12 * k]), 0xfff8ea));
      }
    }
  }
  return parts;
}

function buildHorns(H, size01, gold = false) {
  const parts = [];
  const k = 0.7 + size01 * 0.6;
  for (const s of [-1, 1]) {
    // out sideways, then hooking up and in: three shrinking segments
    parts.push(paint(xf(G.cyl(H * 0.07 * k, H * 0.09 * k, H * 0.26 * k, 6), [s * H * 0.42, H * 0.22, H * 0.02], [0, 0, s * 1.35]), 0x3a2f28));
    parts.push(paint(xf(G.cyl(H * 0.05 * k, H * 0.07 * k, H * 0.2 * k, 6), [s * H * (0.42 + 0.22 * k), H * (0.3 + 0.06 * k), H * 0.02], [0, 0, s * 0.45]), 0x4a3d33));
    parts.push(paint(xf(G.cone(H * 0.05 * k, H * 0.16 * k, 6), [s * H * (0.5 + 0.24 * k), H * (0.42 + 0.14 * k), H * 0.02], [0, 0, s * -0.35]), gold ? 0xffd24a : 0xe9dcc2));
  }
  return parts;
}

function buildTail(look, sp) {
  const B = sp.body;
  const parts = [];
  const z = -B.len * 0.52, y = B.leg + B.h * 0.7;
  switch (look.tail) {
    case 'puff': parts.push(paint(xf(G.sphere(B.h * 0.14, 8, 6), [0, y, z]), look.belly)); break;
    case 'curl': parts.push(paint(xf(G.torus(B.h * 0.08, B.h * 0.025, 5, 10, Math.PI * 1.5), [0, y, z - 0.03], [0, Math.PI / 2, 0]), look.coat)); break;
    case 'bushy': parts.push(paint(xf(G.capsule(B.h * 0.14, B.len * 0.28, 4, 8), [0, y - B.h * 0.2, z - B.len * 0.16], [-0.9, 0, 0]), look.coat, { bottom: look.accent })); break;
    case 'long': for (let i = 0; i < 3; i++) parts.push(paint(xf(G.capsule(0.045, 0.28, 3, 6), [0, y - 0.1 - i * 0.12, z - 0.12 - i * 0.2], [-0.9 + i * 0.35, 0, 0]), i === 2 ? look.accent : look.coat)); break;
    case 'ringed': for (let i = 0; i < 6; i++) parts.push(paint(xf(G.sphere(B.h * (0.15 - i * 0.008), 8, 6), [0, y - B.h * 0.05 - i * B.h * 0.07, z - 0.04 - i * B.len * 0.085], [0, 0, 0], [1, 1, 1.1]), i % 2 ? look.accent : look.coat)); break;
    case 'stub': parts.push(paint(xf(G.sphere(B.h * 0.09, 6, 5), [0, y, z]), look.coat)); break;
    case 'fan': for (let i = 0; i < 9; i++) {
      const a = -1.2 + i * 0.3;
      parts.push(paint(xf(G.capsule(0.05, 0.34, 3, 6), [Math.sin(a) * 0.2, y + 0.12 + Math.cos(a) * 0.2, z - 0.02], [-0.25, 0, -a], [1, 1, 0.3]), i % 2 ? 0xa0724a : 0xe8c890, { bottom: 0x6a4a34 }));
      parts.push(paint(xf(G.sphere(0.045, 6, 4), [Math.sin(a) * 0.37, y + 0.12 + Math.cos(a) * 0.37, z - 0.04], [0, 0, 0], [1, 1, 0.4]), 0xf4ead8));
    } break;
  }
  return parts;
}

/** Build a rig for a species + generated individual. */
export function buildAnimalRig(sp, animal) {
  const look = sp.look;
  const B = sp.body;
  const s = animal.scale;
  const root = new THREE.Group();
  const body = new THREE.Group();  // tilts/rolls on death
  root.add(body);
  const mat = toonMat();
  // Individual coat variation (coatVariation01) and rare traits recolour the rig.
  let coat = look.coat, belly = look.belly;
  const v = animal.coatVariation01 - 0.5;
  coat = new THREE.Color(coat).offsetHSL(v * 0.03, v * 0.1, v * 0.08).getHex();
  if (animal.rareTrait) {
    if (animal.rareTraitName === 'Melanistic') { coat = 0x2a2530; belly = 0x3a3440; }
    else if (animal.rareTraitName === 'Ghost Gray') { coat = 0xc9ccd6; belly = 0xeef0f5; }
    else { coat = 0xf5efe6; } // piebald: mostly white with patches below
  }
  const L2 = { ...look, coat, belly };

  // --- torso
  const torsoParts = [
    paint(xf(G.sphere(1, 14, 10), [0, B.leg + B.h / 2, 0], [0, 0, 0], [B.w * 0.56, B.h * 0.58, B.len * 0.55]), coat, { bottom: belly }),
  ];
  if (B.hump) torsoParts.push(paint(xf(G.sphere(1, 10, 8), [0, B.leg + B.h * 0.88, B.len * 0.2], [0, 0, 0], [B.w * 0.4, B.hump, B.len * 0.22]), tint(coat, 0.9)));
  if (animal.rareTrait && animal.rareTraitName === 'Piebald') {
    torsoParts.push(paint(xf(G.sphere(1, 8, 6), [B.w * 0.2, B.leg + B.h * 0.7, -B.len * 0.1], [0, 0, 0], [B.w * 0.3, B.h * 0.3, B.len * 0.2]), 0x8a5a3b));
  }
  if (look.bristle) torsoParts.push(paint(xf(G.box(B.w * 0.12, B.h * 0.16, B.len * 0.7), [0, B.leg + B.h * 1.02, 0.05]), look.bristle));
  if (look.mane) torsoParts.push(paint(xf(G.sphere(1, 10, 8), [0, B.leg + B.h * 0.75, B.len * 0.42], [0.4, 0, 0], [B.w * 0.45, B.h * 0.45, B.len * 0.2]), look.mane));
  const torso = new THREE.Mesh(merge(torsoParts), mat);
  torso.castShadow = true;
  addOutline(torso, 0.022 + B.h * 0.01);
  body.add(torso);

  // --- neck + head (head group rotates to look around)
  const H = B.head * 1.45; // big cute head
  const neckBase = new THREE.Vector3(0, B.leg + B.h * 0.72, B.len * 0.42);
  const headPos = new THREE.Vector3(0, B.leg + B.h * 0.72 + B.neck * 0.75, B.len * 0.42 + B.headFwd + B.neck * 0.35);
  if (B.neck > 0.1) {
    const nl = neckBase.distanceTo(headPos);
    const neck = new THREE.Mesh(paint(xf(G.capsule(B.w * 0.2, nl, 4, 8), [0, nl / 2, 0]), coat, { bottom: belly }), mat);
    neck.position.copy(neckBase);
    // Capsule runs along +y; tip it forward so it spans torso -> head.
    neck.rotation.set(Math.atan2(headPos.z - neckBase.z, headPos.y - neckBase.y), 0, 0);
    neck.castShadow = true;
    addOutline(neck, 0.02);
    body.add(neck);
  }
  const head = new THREE.Group();
  head.position.copy(headPos);
  body.add(head);
  const headParts = [paint(G.sphere(H * 0.5, 14, 10), look.headColor || coat, { bottom: tint(look.headColor || coat, 0.9) })];
  const snoutLen = look.ears === 'bunny' ? 0.12 : look.ears === 'none' ? 0.2 : look.trophy === 'tusks' ? 0.42 : look.ears === 'round' ? 0.34 : 0.36;
  const snoutCol = look.muzzle || (look.trophy === 'tusks' ? tint(coat, 1.08) : belly);
  headParts.push(paint(xf(G.sphere(H * snoutLen, 10, 8), [0, -H * 0.12, H * 0.38], [0, 0, 0], [0.85, 0.72, 1.05]), snoutCol));
  if (look.trophy === 'tusks') headParts.push(paint(xf(G.cyl(H * 0.17, H * 0.19, H * 0.08, 10), [0, -H * 0.12, H * 0.8], [Math.PI / 2, 0, 0]), look.nose));
  else headParts.push(paint(xf(G.sphere(H * 0.09, 8, 6), [0, -H * 0.06, H * (0.38 + snoutLen * 0.95)], [0, 0, 0], [1.3, 0.9, 0.8]), look.nose));
  // cheeks
  for (const s2 of [-1, 1]) headParts.push(paint(xf(G.sphere(H * 0.09, 8, 6), [s2 * H * 0.3, -H * 0.1, H * 0.3], [0, 0, 0], [1, 0.6, 0.4]), 0xff9aa9));
  headParts.push(...buildEars(L2, H));
  // bandit mask: a dark band wrapped across the eyes
  if (look.mask) headParts.push(paint(G.sphere(H * 0.515, 16, 6, 0.35, Math.PI - 0.7, 1.08, 0.5), look.mask));
  if (look.wattle) headParts.push(paint(xf(G.capsule(H * 0.12, H * 0.5, 3, 6), [0, -H * 0.45, H * 0.4]), look.wattle));
  if (look.dewlap) headParts.push(paint(xf(G.capsule(H * 0.08, H * 0.4, 3, 6), [0, -H * 0.55, H * 0.25]), tint(coat, 0.8)));
  const headMesh = new THREE.Mesh(merge(headParts), mat);
  headMesh.castShadow = true;
  addOutline(headMesh, 0.02);
  head.add(headMesh);
  const eyes = new THREE.Mesh(buildEyes(L2, H, false), mat);
  const deadEyes = new THREE.Mesh(buildEyes(L2, H, true), mat);
  deadEyes.visible = false;
  const brows = new THREE.Mesh(buildBrows(L2, H), mat);
  brows.visible = false;
  head.add(eyes); head.add(deadEyes); head.add(brows);
  // Snarl: an open mouth full of cartoon teeth, shown while charging
  const sn = H * snoutLen, mz = H * 0.38 + sn * 0.92, my = -H * 0.14 - sn * 0.5;
  const snarlParts = [
    paint(xf(G.sphere(sn * 0.78, 10, 8), [0, my, mz], [0.35, 0, 0], [1, 0.78, 0.42]), 0x4a0f1e),
    paint(xf(G.sphere(sn * 0.42, 8, 6), [0, my - sn * 0.24, mz + sn * 0.08], [0, 0, 0], [1, 0.45, 0.45]), 0xff6f91),
  ];
  for (let i = 0; i < 4; i++) {
    const tx = (i - 1.5) * sn * 0.32, big = i === 0 || i === 3;
    snarlParts.push(paint(xf(G.cone(sn * (big ? 0.11 : 0.08), sn * (big ? 0.36 : 0.22), 4), [tx, my + sn * 0.36, mz + sn * 0.16], [Math.PI, 0, 0]), 0xfffbef));
  }
  for (const tx of [-0.42, 0.42]) snarlParts.push(paint(xf(G.cone(sn * 0.09, sn * 0.26, 4), [tx * sn, my - sn * 0.38, mz + sn * 0.14]), 0xfffbef));
  const snarl = new THREE.Mesh(merge(snarlParts), mat);
  snarl.visible = false;
  head.add(snarl);
  const tongue = new THREE.Mesh(paint(xf(G.capsule(H * 0.06, H * 0.18, 3, 6), [H * 0.08, -H * 0.3, H * (0.45 + snoutLen)], [1.2, 0, 0.3], [1, 1, 0.5]), 0xff6f91), mat);
  tongue.visible = false;
  head.add(tongue);

  // trophy headgear (its own mesh so it can pop off when shot)
  let trophyMesh = null;
  const trophyParts = [];
  if ((look.trophy === 'antlers' || look.trophy === 'palms') && (animal.trophySize01 > 0.02 || animal.legendary)) trophyParts.push(...buildAntlers(L2, H, animal.legendary ? 1 : animal.trophySize01, look.trophy === 'palms', animal.legendary));
  if (look.trophy === 'horns') trophyParts.push(...buildHorns(H, animal.legendary ? 1 : animal.trophySize01, animal.legendary));
  if (look.trophy === 'tusks' && animal.trophySize01 > 0.02) {
    const tk = 0.6 + animal.trophySize01 * 0.8;
    for (const s2 of [-1, 1]) trophyParts.push(paint(xf(G.cone(H * 0.05 * tk, H * 0.3 * tk, 5), [s2 * H * 0.18, -H * 0.1, H * 0.72], [-0.6, 0, s2 * 0.5]), animal.legendary ? 0xffd24a : 0xfff8ea));
  }
  if (trophyParts.length) {
    trophyMesh = new THREE.Mesh(merge(trophyParts), mat);
    trophyMesh.castShadow = true;
    addOutline(trophyMesh, 0.012);
    head.add(trophyMesh);
  }

  // tail
  const tailParts = buildTail(L2, sp);
  let tail = null;
  if (tailParts.length) {
    tail = new THREE.Mesh(merge(tailParts), mat);
    tail.castShadow = true;
    addOutline(tail, 0.015);
    body.add(tail);
  }

  // legs (pivot at hip)
  const legs = [];
  const legR = Math.max(0.03, B.w * (sp.biped ? 0.08 : 0.13));
  const hoof = sp.look.ears === 'round' || sp.look.eye === 'sly' ? 0xf0e6dc : 0x3a2a22;
  const hipsXZ = sp.biped ? [[B.w * 0.18, 0], [-B.w * 0.18, 0]]
    : [[B.w * 0.3, B.len * 0.3], [-B.w * 0.3, B.len * 0.3], [B.w * 0.3, -B.len * 0.3], [-B.w * 0.3, -B.len * 0.3]];
  for (const [x, z] of hipsXZ) {
    const hip = new THREE.Group();
    hip.position.set(x, B.leg + B.h * 0.25, z);
    const legLen = B.leg + B.h * 0.25;
    const legGeo = merge([
      paint(xf(G.capsule(legR, Math.max(0.01, legLen - legR * 2), 3, 7), [0, -legLen / 2, 0]), coat, { bottom: tint(coat, 0.75) }),
      paint(xf(G.sphere(legR * 1.25, 7, 5), [0, -legLen + legR * 0.6, legR * 0.3], [0, 0, 0], [1, 0.7, 1.3]), sp.biped ? 0xe8a33a : hoof),
    ]);
    const leg = new THREE.Mesh(legGeo, mat);
    leg.castShadow = true;
    addOutline(leg, 0.014);
    hip.add(leg);
    body.add(hip);
    legs.push(hip);
  }

  root.scale.setScalar(s);
  const outlines = [], casters = [];
  root.traverse(o => { if (o.name === 'outline') outlines.push(o); else if (o.isMesh) casters.push(o); });
  return {
    outlines, casters, detail: true,
    setDetail(near) {
      if (this.detail === near) return;
      this.detail = near;
      for (const o of outlines) o.visible = near;
      for (const c of casters) c.castShadow = near;
    },
    root, body, head, headMesh, eyes, deadEyes, brows, snarl, tongue, trophyMesh, tail, legs, torso,
    H, headPos, scale: s,
  };
}

/** Hit volumes in the rig's unscaled local space: {region, c:[x,y,z], r}. */
export function buildHitVolumes(sp, animal) {
  const B = sp.body, H = B.head * 1.45;
  const v = [];
  const torsoY = B.leg + B.h / 2;
  const headPos = [0, B.leg + B.h * 0.72 + B.neck * 0.75, B.len * 0.42 + B.headFwd + B.neck * 0.35];
  // head: brain core (skull shell for bears is handled as trophyAlso)
  v.push({ region: 'brain', c: [headPos[0], headPos[1], headPos[2]], r: H * 0.42 });
  // trophy headgear
  const tsize = animal.legendary ? 1 : animal.trophySize01; // legendary racks are drawn full-size
  if ((sp.look.trophy === 'antlers' || sp.look.trophy === 'palms') && tsize > 0.02) {
    const k = (sp.look.antlerSize || 1) * (0.45 + tsize * 0.9);
    v.push({ region: 'trophy', c: [0, headPos[1] + H * 0.42 + 0.3 * k, headPos[2] - 0.05], r: 0.34 * k });
  }
  if (sp.look.trophy === 'tusks' && animal.trophySize01 > 0.02) v.push({ region: 'trophy', c: [0, headPos[1] - H * 0.1, headPos[2] + H * 0.72], r: H * 0.18 });
  if (sp.look.trophy === 'horns') for (const s of [-1, 1]) v.push({ region: 'trophy', c: [s * H * 0.62, headPos[1] + H * 0.35, headPos[2]], r: H * 0.17 });
  if (sp.look.trophy === 'fan') v.push({ region: 'trophy', c: [0, B.leg + B.h * 0.95, -B.len * 0.55], r: B.h * 0.35 });
  // neck
  if (B.neck > 0.1) {
    for (let i = 1; i <= 2; i++) {
      const t = i / 3;
      v.push({ region: 'neck', c: [0, B.leg + B.h * 0.72 + B.neck * 0.75 * t, B.len * 0.42 + (B.headFwd + B.neck * 0.35) * t], r: B.w * 0.22 });
    }
  } else v.push({ region: 'neck', c: [0, B.leg + B.h * 0.75, B.len * 0.46], r: B.w * 0.25 });
  // vitals (heart listed first: a ray that reaches it rarely skipped the lungs)
  v.push({ region: 'heart', c: [0, B.leg + B.h * 0.3, B.len * 0.2], r: B.h * 0.18 });
  v.push({ region: 'lung', c: [0, B.leg + B.h * 0.56, B.len * 0.14], r: B.h * 0.36 });
  v.push({ region: 'spine', c: [0, B.leg + B.h * 0.94, 0], r: B.h * 0.13 });
  v.push({ region: 'spine', c: [0, B.leg + B.h * 0.92, -B.len * 0.28], r: B.h * 0.13 });
  v.push({ region: 'gut', c: [0, torsoY - B.h * 0.05, -B.len * 0.22], r: B.h * 0.42 });
  // legs: two spheres each
  const legs = sp.biped ? [['legFL', B.w * 0.18, 0], ['legFR', -B.w * 0.18, 0]]
    : [['legFL', B.w * 0.3, B.len * 0.3], ['legFR', -B.w * 0.3, B.len * 0.3], ['legRL', B.w * 0.3, -B.len * 0.3], ['legRR', -B.w * 0.3, -B.len * 0.3]];
  const legR = Math.max(0.04, B.w * (sp.biped ? 0.1 : 0.15));
  for (const [region, x, z] of legs) {
    v.push({ region, c: [x, B.leg * 0.75, z], r: legR });
    v.push({ region, c: [x, B.leg * 0.3, z], r: legR * 0.85 });
  }
  return v;
}
