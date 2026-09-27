// The hunter: a stubby, bean-bodied, big-headed person in bright outdoor
// gear with a backpack far too large for them. Built from primitives; used
// for the local player's third-person view and for co-op friends.

import { THREE } from '../three.js';
import { G, paint, merge, xf, toonMat, addOutline } from '../render/toon.js';

export const JACKETS = [
  { id: 'blaze', hex: 0xff6b2c, name: 'Blaze orange' },
  { id: 'bubble', hex: 0xff7fbf, name: 'Bubblegum' },
  { id: 'sky', hex: 0x4fb4f0, name: 'Sky' },
  { id: 'lime', hex: 0x8fd14f, name: 'Lime' },
  { id: 'grape', hex: 0x9a6bff, name: 'Grape' },
  { id: 'sun', hex: 0xffc93a, name: 'Sunflower' },
  { id: 'camo', hex: 0x6b8a4a, name: 'Camo (it does not help)' },
];
export const HATS = ['beanie', 'cap', 'trapper', 'bucket'];
const SKINS = [0xf6cfa8, 0xe8b48a, 0xc98d62, 0x9a6444, 0x6e4630];

function darken(hex, k = 0.72) {
  const c = new THREE.Color(hex); c.multiplyScalar(k); return c.getHex();
}

function buildHat(kind, jacket) {
  const parts = [];
  const hy = 0.3;
  if (kind === 'beanie') {
    parts.push(paint(xf(G.sphere(0.31, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), [0, hy - 0.02, 0], [0, 0, 0], [1, 0.95, 1]), jacket));
    parts.push(paint(xf(G.torus(0.3, 0.06, 6, 16), [0, hy - 0.02, 0], [Math.PI / 2, 0, 0]), darken(jacket, 0.85)));
    parts.push(paint(xf(G.sphere(0.09, 8, 6), [0, hy + 0.3, 0]), 0xfff4de));
  } else if (kind === 'cap') {
    parts.push(paint(xf(G.sphere(0.305, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), [0, hy - 0.03, 0]), jacket));
    parts.push(paint(xf(G.cyl(0.2, 0.2, 0.03, 12, 1), [0, hy - 0.02, 0.28], [0.12, 0, 0], [1, 1, 1.25]), darken(jacket, 0.8)));
    parts.push(paint(xf(G.sphere(0.03, 6, 4), [0, hy + 0.28, 0]), darken(jacket, 0.8)));
  } else if (kind === 'trapper') {
    parts.push(paint(xf(G.sphere(0.32, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), [0, hy - 0.02, 0]), 0x7a4f35));
    parts.push(paint(xf(G.torus(0.3, 0.07, 6, 16), [0, hy - 0.01, 0], [Math.PI / 2, 0, 0]), 0xf4ead8));
    for (const s of [-1, 1]) parts.push(paint(xf(G.sphere(0.12, 8, 6), [s * 0.3, hy - 0.12, 0], [0, 0, 0], [0.5, 1.2, 0.9]), 0xf4ead8));
  } else {
    parts.push(paint(xf(G.cyl(0.22, 0.3, 0.2, 12), [0, hy + 0.08, 0]), jacket));
    parts.push(paint(xf(G.cyl(0.46, 0.46, 0.03, 16), [0, hy - 0.02, 0]), darken(jacket, 0.85)));
  }
  return merge(parts);
}

/** Build a hunter group. Returns { group, parts, setJacket } */
export function buildHunter({ jacket = 0xff6b2c, hat = 'beanie', skin = 0 } = {}) {
  const skinHex = SKINS[skin % SKINS.length];
  const pants = 0x3d4a66;
  const root = new THREE.Group();
  const body = new THREE.Group();   // pivots at the hips
  root.add(body);
  const mat = toonMat();

  // Torso: a bean with a hi-vis stripe and pockets
  const torsoGeo = merge([
    paint(xf(G.capsule(0.3, 0.32, 6, 12), [0, 0.42, 0], [0, 0, 0], [1, 1, 0.82]), jacket, { bottom: darken(jacket, 0.82) }),
    paint(xf(G.torus(0.285, 0.035, 5, 18), [0, 0.38, 0], [Math.PI / 2, 0, 0], [1, 0.84, 1]), 0xf4f740),
    paint(xf(G.box(0.02, 0.4, 0.02), [0, 0.46, 0.25]), darken(jacket, 0.6)),
    paint(xf(G.box(0.14, 0.1, 0.05), [-0.13, 0.28, 0.23]), darken(jacket, 0.78)),
    paint(xf(G.box(0.14, 0.1, 0.05), [0.13, 0.28, 0.23]), darken(jacket, 0.78)),
  ]);
  const torso = new THREE.Mesh(torsoGeo, mat);
  torso.castShadow = true;
  addOutline(torso, 0.022);
  body.add(torso);

  // Head
  const head = new THREE.Group();
  head.position.set(0, 0.98, 0.02);
  body.add(head);
  const face = merge([
    paint(G.sphere(0.3, 16, 12), skinHex),
    paint(xf(G.sphere(0.045, 8, 6), [0, -0.02, 0.29]), darken(skinHex, 0.88)),
    paint(xf(G.sphere(0.055, 8, 6), [-0.15, -0.07, 0.24], [0, 0, 0], [1, 0.6, 0.4]), 0xff9aa2),
    paint(xf(G.sphere(0.055, 8, 6), [0.15, -0.07, 0.24], [0, 0, 0], [1, 0.6, 0.4]), 0xff9aa2),
    paint(xf(G.torus(0.05, 0.012, 4, 10, Math.PI), [0, -0.1, 0.27], [0, 0, Math.PI]), 0x3a2230),
  ]);
  const headMesh = new THREE.Mesh(face, mat);
  headMesh.castShadow = true;
  addOutline(headMesh, 0.02);
  head.add(headMesh);
  const eyes = new THREE.Mesh(merge([
    paint(xf(G.sphere(0.075, 10, 8), [-0.1, 0.05, 0.25], [0, 0, 0], [1, 1.25, 0.5]), 0xffffff),
    paint(xf(G.sphere(0.075, 10, 8), [0.1, 0.05, 0.25], [0, 0, 0], [1, 1.25, 0.5]), 0xffffff),
    paint(xf(G.sphere(0.04, 8, 6), [-0.095, 0.045, 0.285], [0, 0, 0], [1, 1.3, 0.5]), 0x241a28),
    paint(xf(G.sphere(0.04, 8, 6), [0.095, 0.045, 0.285], [0, 0, 0], [1, 1.3, 0.5]), 0x241a28),
    paint(xf(G.sphere(0.014, 5, 4), [-0.083, 0.07, 0.305]), 0xffffff),
    paint(xf(G.sphere(0.014, 5, 4), [0.107, 0.07, 0.305]), 0xffffff),
  ]), mat);
  head.add(eyes);
  const deadEyes = new THREE.Mesh(merge([
    ...[-0.1, 0.1].flatMap(x => [
      paint(xf(G.box(0.11, 0.025, 0.02), [x, 0.05, 0.29], [0, 0, 0.78]), 0x241a28),
      paint(xf(G.box(0.11, 0.025, 0.02), [x, 0.05, 0.29], [0, 0, -0.78]), 0x241a28),
    ]),
  ]), mat);
  deadEyes.visible = false;
  head.add(deadEyes);
  const hatMesh = new THREE.Mesh(buildHat(hat, jacket), mat);
  hatMesh.castShadow = true;
  addOutline(hatMesh, 0.018);
  head.add(hatMesh);

  // Backpack (too big), bedroll, and a frying pan for no reason
  const pack = new THREE.Mesh(merge([
    paint(xf(G.capsule(0.22, 0.34, 4, 10), [0, 0.52, -0.3], [0, 0, 0], [1.25, 1, 0.8]), 0x5a7a3a, { bottom: 0x3f5a2a }),
    paint(xf(G.cyl(0.11, 0.11, 0.62, 10), [0, 0.95, -0.3], [0, 0, Math.PI / 2]), 0x3f8fc0),
    paint(xf(G.box(0.34, 0.16, 0.06), [0, 0.38, -0.5]), 0x4a6a30),
    paint(xf(G.cyl(0.11, 0.11, 0.025, 12), [0.27, 0.5, -0.47], [Math.PI / 2, 0, 0.3]), 0x3a3a44),
    paint(xf(G.box(0.03, 0.02, 0.18), [0.3, 0.42, -0.6], [0.3, 0, 0.3]), 0x3a3a44),
  ]), mat);
  pack.castShadow = true;
  addOutline(pack, 0.02);
  body.add(pack);

  // Arms with mittens (pivot at shoulders)
  const arms = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.32, 0.66, 0);
    const arm = new THREE.Mesh(merge([
      paint(xf(G.capsule(0.085, 0.24, 4, 8), [0, -0.17, 0]), jacket, { bottom: darken(jacket, 0.85) }),
      paint(xf(G.sphere(0.1, 10, 8), [0, -0.36, 0.01], [0, 0, 0], [1, 1.05, 1]), 0x3fb4a8),
    ]), mat);
    arm.castShadow = true;
    addOutline(arm, 0.018);
    shoulder.add(arm);
    body.add(shoulder);
    arms.push(shoulder);
  }

  // Stubby legs with round boots (pivot at hips, attached to root so the
  // body can bob/lean independently)
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.13, 0.3, 0);
    const leg = new THREE.Mesh(merge([
      paint(xf(G.capsule(0.1, 0.12, 4, 8), [0, -0.12, 0]), pants),
      paint(xf(G.sphere(0.12, 10, 8), [0, -0.26, 0.05], [0, 0, 0], [1, 0.7, 1.35]), 0x6b4a30),
    ]), mat);
    leg.castShadow = true;
    addOutline(leg, 0.018);
    hip.add(leg);
    root.add(hip);
    legs.push(hip);
  }
  body.position.y = 0.0;

  // Third-person rifle (hidden in first person)
  const rifle = new THREE.Mesh(merge([
    paint(xf(G.box(0.05, 0.08, 0.7), [0, 0, 0.1]), 0x7a5236),
    paint(xf(G.cyl(0.018, 0.018, 0.5, 6), [0, 0.03, 0.65], [Math.PI / 2, 0, 0]), 0x3a3a44),
    paint(xf(G.cyl(0.03, 0.03, 0.22, 8), [0, 0.09, 0.2], [Math.PI / 2, 0, 0]), 0x2a2a30),
  ]), mat);
  rifle.position.set(0.12, 0.55, 0.25);
  body.add(rifle);

  const api = {
    group: root, body, head, eyes, deadEyes, arms, legs, rifle, pack,
    phase: 0,
    /** Pose the rig. state: { speed, stance, pitch, dead, wave, aiming } */
    animate(dt, st) {
      const speed = st.speed || 0;
      this.phase += dt * (2.2 + speed * 2.4);
      const sw = Math.min(1, speed / 3) * 0.7;
      const s = Math.sin(this.phase);
      legs[0].rotation.x = s * sw; legs[1].rotation.x = -s * sw;
      let bob = Math.abs(Math.cos(this.phase)) * 0.06 * Math.min(1, speed / 2);
      let crouch = 0, lean = 0;
      if (st.stance === 'crouch') { crouch = 0.22; lean = 0.25; }
      if (st.stance === 'prone') { crouch = 0.5; lean = 1.35; }
      body.position.y = bob - crouch;
      body.rotation.x = lean + Math.min(0.2, speed * 0.03);
      body.rotation.z = Math.sin(this.phase * 0.5) * 0.04 * sw; // a little waddle
      for (const l of legs) l.position.y = 0.3 - crouch * 0.4;
      head.rotation.x = -(st.pitch || 0) * 0.6 - lean * 0.7;
      if (st.wave) {
        arms[1].rotation.x = -2.6 + Math.sin(this.phase * 3) * 0.3;
        arms[1].rotation.z = -0.3 + Math.sin(this.phase * 6) * 0.5;
        arms[0].rotation.x = -s * sw;
      } else if (st.aiming) {
        arms[0].rotation.x = -1.3 - (st.pitch || 0); arms[1].rotation.x = -1.5 - (st.pitch || 0);
        arms[0].rotation.z = 0.3; arms[1].rotation.z = -0.1;
      } else {
        arms[0].rotation.x = -s * sw * 0.8; arms[1].rotation.x = s * sw * 0.8;
        arms[0].rotation.z = 0.15; arms[1].rotation.z = -0.15;
      }
      if (st.seated) {
        // astride the quad: knees up, hands on the bars, leaning into turns
        legs[0].rotation.x = legs[1].rotation.x = -1.35;
        legs[0].rotation.z = 0.35; legs[1].rotation.z = -0.35;
        body.position.y = 0; body.rotation.x = 0.2; body.rotation.z = -(st.lean || 0) * 0.5;
        arms[0].rotation.x = arms[1].rotation.x = -1.25;
        arms[0].rotation.z = 0.35; arms[1].rotation.z = -0.35;
        for (const l of legs) l.position.y = 0.3;
      } else { legs[0].rotation.z = legs[1].rotation.z = 0; }
      eyes.visible = !st.dead; deadEyes.visible = !!st.dead;
      rifle.visible = !!st.showRifle;
    },
    setVisible(v) { root.visible = v; },
  };
  return api;
}
