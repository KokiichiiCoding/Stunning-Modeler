// The hunter: a chibi trekker — huge head, pom-pom beanie, stubby limbs and
// a backpack with a bedroll far too large for them (any skin colour goes). Built from primitives; used
// for the local player's third-person view and for co-op friends.

import { THREE } from '../three.js';
import { G, paint, merge, xf, toonMat, addOutline } from '../render/toon.js';

export const JACKETS = [
  { id: 'olive', hex: 0x5f6e34, name: 'Field olive' },
  { id: 'blaze', hex: 0xff6b2c, name: 'Blaze orange' },
  { id: 'bubble', hex: 0xff7fbf, name: 'Bubblegum' },
  { id: 'sky', hex: 0x4fb4f0, name: 'Sky' },
  { id: 'lime', hex: 0x8fd14f, name: 'Lime' },
  { id: 'grape', hex: 0x9a6bff, name: 'Grape' },
  { id: 'sun', hex: 0xffc93a, name: 'Sunflower' },
  { id: 'camo', hex: 0x6b8a4a, name: 'Camo (it does not help)' },
];
export const HATS = ['beanie', 'cap', 'trapper', 'bucket'];
// Skin is any colour you like: people, goblins, smurfs, it's a free country.
export const SKINS = [
  { hex: 0xf2c4a0, name: 'Peach' }, { hex: 0xd99a6c, name: 'Tan' }, { hex: 0x8d5a3b, name: 'Cocoa' },
  { hex: 0x86c06a, name: 'Moss' }, { hex: 0x6cc6c8, name: 'Lagoon' }, { hex: 0xa99be0, name: 'Lilac' },
];
const HAIR = [0x5a3a24, 0x2a1d18, 0xb5652e, 0x7a4a2a];

function darken(hex, k = 0.72) {
  const c = new THREE.Color(hex); c.multiplyScalar(k); return c.getHex();
}

// Head-relative hat pieces. The head is a big ball (r = HR) centred at 0.
const HR = 0.37;
export function buildHat(kind, color) {
  const parts = [];
  const hy = HR * 0.5;
  const F = { flat: true };
  if (kind === 'beanie') {
    parts.push(paint(xf(G.sphere(HR * 0.93, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0, hy - 0.04, -0.02], [-0.12, 0, 0], [1, 1.2, 1]), color, { ...F, bottom: darken(color, 0.85) }));
    parts.push(paint(xf(G.torus(HR * 0.88, 0.07, 5, 14), [0, hy - 0.03, -0.01], [Math.PI / 2 - 0.12, 0, 0]), darken(color, 0.82), F));
    parts.push(paint(xf(G.ico(0.1, 1), [0, hy + HR * 1.05, -0.07]), darken(color, 1.08), F)); // pom-pom
  } else if (kind === 'cap') {
    parts.push(paint(xf(G.sphere(HR * 1.04, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0, hy - 0.02, 0]), color, F));
    parts.push(paint(xf(G.cyl(0.24, 0.24, 0.035, 12, 1), [0, hy, HR * 0.95], [0.12, 0, 0], [1, 1, 1.25]), darken(color, 0.8)));
  } else if (kind === 'trapper') {
    parts.push(paint(xf(G.sphere(HR * 1.08, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0, hy, 0]), 0x7a4f35, F));
    parts.push(paint(xf(G.torus(HR * 1.02, 0.08, 6, 16), [0, hy + 0.01, 0], [Math.PI / 2, 0, 0]), 0xf4ead8));
    for (const s of [-1, 1]) parts.push(paint(xf(G.sphere(0.14, 8, 6), [s * HR * 0.98, hy - 0.16, 0], [0, 0, 0], [0.5, 1.3, 0.9]), 0xf4ead8));
  } else {
    parts.push(paint(xf(G.cyl(0.27, 0.36, 0.24, 10), [0, hy + 0.1, 0]), color, F));
    parts.push(paint(xf(G.cyl(0.56, 0.56, 0.035, 14), [0, hy - 0.02, 0]), darken(color, 0.85)));
  }
  return merge(parts);
}

/** Build a hunter group: a chibi trekker with a huge head and a bedroll. */
export function buildHunter({ jacket = 0x5f6e34, hat = 'beanie', skin = 0 } = {}) {
  const skinHex = SKINS[skin % SKINS.length].hex;
  const hair = HAIR[skin % HAIR.length];
  const pants = darken(jacket === 0x5f6e34 ? 0x4c5a2a : jacket, 0.62);
  const root = new THREE.Group();
  const body = new THREE.Group();   // pivots at the hips
  root.add(body);
  const mat = toonMat();
  const F = { flat: true };

  // Torso: a short, padded jacket with a belt and chunky pockets
  const torsoGeo = merge([
    paint(xf(G.capsule(0.27, 0.2, 5, 10), [0, 0.47, 0], [0, 0, 0], [1.05, 1, 0.85]), jacket, { ...F, bottom: darken(jacket, 0.8) }),
    paint(xf(G.torus(0.27, 0.045, 5, 14), [0, 0.3, 0], [Math.PI / 2, 0, 0], [1.05, 0.86, 1]), 0x4a3524),          // belt
    paint(xf(G.box(0.08, 0.06, 0.03), [0, 0.3, 0.24]), 0xc9a13a),                                                    // buckle
    paint(xf(G.box(0.12, 0.11, 0.06), [-0.15, 0.48, 0.21]), darken(jacket, 0.78), F),
    paint(xf(G.box(0.12, 0.11, 0.06), [0.15, 0.48, 0.21]), darken(jacket, 0.78), F),
    paint(xf(G.box(0.1, 0.09, 0.08), [0.25, 0.3, 0.12]), 0x6b5236, F),                                                 // pouch
    paint(xf(G.torus(0.2, 0.06, 5, 12), [0, 0.68, 0], [Math.PI / 2, 0, 0], [1, 0.9, 1]), darken(jacket, 0.88), F),     // collar
  ]);
  const torso = new THREE.Mesh(torsoGeo, mat);
  torso.castShadow = true;
  addOutline(torso, 0.022);
  body.add(torso);

  // Head: the star of the show
  const head = new THREE.Group();
  head.position.set(0, 1.06, 0.03);
  body.add(head);
  const face = merge([
    paint(G.sphere(HR, 18, 14), skinHex, { bottom: darken(skinHex, 0.9) }),
    paint(xf(G.sphere(0.05, 8, 6), [0, -0.05, HR * 0.97], [0, 0, 0], [1.2, 0.9, 0.8]), darken(skinHex, 0.85)),         // button nose
    paint(xf(G.sphere(0.065, 8, 6), [-0.19, -0.1, HR * 0.8], [0, 0, 0], [1, 0.55, 0.4]), 0xff9aa2),
    paint(xf(G.sphere(0.065, 8, 6), [0.19, -0.1, HR * 0.8], [0, 0, 0], [1, 0.55, 0.4]), 0xff9aa2),
    // hair: a fringe and side tufts peeking out under the hat
    paint(xf(G.sphere(HR * 1.02, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.36), [0, 0.02, -0.02], [0.45, 0, 0]), hair, F),
    paint(xf(G.sphere(0.1, 6, 5), [-0.3, 0.02, 0.12], [0, 0, 0.3], [0.6, 1.2, 0.8]), hair, F),
    paint(xf(G.sphere(0.1, 6, 5), [0.3, 0.02, 0.12], [0, 0, -0.3], [0.6, 1.2, 0.8]), hair, F),
    // ears
    paint(xf(G.sphere(0.07, 8, 6), [-HR * 0.98, -0.04, 0], [0, 0, 0], [0.5, 1, 0.8]), skinHex),
    paint(xf(G.sphere(0.07, 8, 6), [HR * 0.98, -0.04, 0], [0, 0, 0], [0.5, 1, 0.8]), skinHex),
  ]);
  const headMesh = new THREE.Mesh(face, mat);
  headMesh.castShadow = true;
  addOutline(headMesh, 0.022);
  head.add(headMesh);
  const ez = HR * 0.86;
  const eyes = new THREE.Mesh(merge([
    paint(xf(G.sphere(0.085, 10, 8), [-0.13, 0.03, ez], [0, 0, 0], [1, 1.25, 0.5]), 0xffffff),
    paint(xf(G.sphere(0.085, 10, 8), [0.13, 0.03, ez], [0, 0, 0], [1, 1.25, 0.5]), 0xffffff),
    paint(xf(G.sphere(0.058, 8, 6), [-0.125, 0.02, ez + 0.035], [0, 0, 0], [1, 1.3, 0.5]), 0x241a28),
    paint(xf(G.sphere(0.058, 8, 6), [0.125, 0.02, ez + 0.035], [0, 0, 0], [1, 1.3, 0.5]), 0x241a28),
    paint(xf(G.sphere(0.02, 5, 4), [-0.105, 0.06, ez + 0.07]), 0xffffff),
    paint(xf(G.sphere(0.02, 5, 4), [0.145, 0.06, ez + 0.07]), 0xffffff),
  ]), mat);
  head.add(eyes);
  const deadEyes = new THREE.Mesh(merge([
    ...[-0.13, 0.13].flatMap(x => [
      paint(xf(G.box(0.13, 0.028, 0.02), [x, 0.03, ez + 0.06], [0, 0, 0.78]), 0x241a28),
      paint(xf(G.box(0.13, 0.028, 0.02), [x, 0.03, ez + 0.06], [0, 0, -0.78]), 0x241a28),
    ]),
  ]), mat);
  deadEyes.visible = false;
  head.add(deadEyes);
  // Eyebrows (posed per mood) and two mouths: a smile and a panicked "O"
  const brows = [-1, 1].map(s => {
    const b = new THREE.Mesh(paint(xf(G.box(0.12, 0.03, 0.03), [0, 0, 0]), darken(hair, 0.8)), mat);
    b.position.set(s * 0.13, 0.12, ez + 0.03);
    head.add(b);
    return b;
  });
  const smile = new THREE.Mesh(paint(xf(G.torus(0.055, 0.014, 4, 10, Math.PI), [0, -0.14, HR * 0.94], [0, 0, Math.PI]), 0x3a2230), mat);
  const oMouth = new THREE.Mesh(merge([
    paint(xf(G.sphere(0.055, 8, 6), [0, -0.16, HR * 0.92], [0, 0, 0], [1, 1.25, 0.4]), 0x3a2230),
    paint(xf(G.sphere(0.03, 6, 5), [0, -0.19, HR * 0.95], [0, 0, 0], [1.2, 0.6, 0.4]), 0xff6f91),
  ]), mat);
  oMouth.visible = false;
  head.add(smile); head.add(oMouth);
  const hatMesh = new THREE.Mesh(buildHat(hat, jacket), mat);
  hatMesh.castShadow = true;
  addOutline(hatMesh, 0.02);
  head.add(hatMesh);

  // Backpack (too big) with a rolled bedroll strapped on top
  const roll = 0xc77a3a;
  const pack = new THREE.Mesh(merge([
    paint(xf(G.box(0.46, 0.5, 0.26), [0, 0.5, -0.33]), 0x5a4630, { ...F, bottom: 0x3e3022 }),
    paint(xf(G.box(0.3, 0.2, 0.08), [0, 0.42, -0.49]), 0x4a3a28, F),                                         // front pocket
    paint(xf(G.box(0.09, 0.09, 0.02), [0, 0.44, -0.535], [0, 0, Math.PI / 4]), 0xc9a13a),                     // diamond badge
    paint(xf(G.box(0.48, 0.07, 0.2), [0, 0.77, -0.33]), 0x4a3a28, F),                                        // flap
    paint(xf(G.cyl(0.13, 0.13, 0.6, 10), [0, 0.92, -0.33], [0, 0, Math.PI / 2]), roll, { ...F, bottom: darken(roll, 0.8) }),
    paint(xf(G.torus(0.07, 0.025, 4, 10), [0.301, 0.92, -0.33], [0, Math.PI / 2, 0]), darken(roll, 0.7)),     // the rolled ends
    paint(xf(G.torus(0.07, 0.025, 4, 10), [-0.301, 0.92, -0.33], [0, Math.PI / 2, 0]), darken(roll, 0.7)),
    paint(xf(G.box(0.04, 0.29, 0.02), [0.14, 0.92, -0.33], [Math.PI / 2, 0, 0]), 0x3a2a1e),                  // straps
    paint(xf(G.box(0.04, 0.29, 0.02), [-0.14, 0.92, -0.33], [Math.PI / 2, 0, 0]), 0x3a2a1e),
  ]), mat);
  pack.castShadow = true;
  addOutline(pack, 0.02);
  body.add(pack);

  // Stubby arms with bare (any colour) hands, pivot at shoulders
  const arms = [];
  for (const s of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.3, 0.62, 0);
    const arm = new THREE.Mesh(merge([
      paint(xf(G.capsule(0.085, 0.18, 4, 8), [0, -0.14, 0]), jacket, { bottom: darken(jacket, 0.85) }),
      paint(xf(G.torus(0.075, 0.025, 4, 10), [0, -0.27, 0], [Math.PI / 2, 0, 0]), darken(jacket, 0.75)),       // cuff
      paint(xf(G.sphere(0.085, 10, 8), [0, -0.33, 0.01], [0, 0, 0], [1, 1.05, 1]), skinHex),
    ]), mat);
    arm.castShadow = true;
    addOutline(arm, 0.018);
    shoulder.add(arm);
    body.add(shoulder);
    arms.push(shoulder);
  }

  // Short legs with big round boots (attached to root so the body can lean)
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.13, 0.3, 0);
    const leg = new THREE.Mesh(merge([
      paint(xf(G.capsule(0.1, 0.1, 4, 8), [0, -0.1, 0]), pants),
      paint(xf(G.cyl(0.1, 0.11, 0.08, 10), [0, -0.19, 0.02]), 0x8a6a48),                                         // sock roll
      paint(xf(G.sphere(0.13, 10, 8), [0, -0.27, 0.05], [0, 0, 0], [1, 0.72, 1.4]), 0x6b4a30, F),
      paint(xf(G.box(0.2, 0.04, 0.3), [0, -0.34, 0.06]), 0x3a2a1e),                                               // sole
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
  rifle.position.set(0.12, 0.5, 0.25);
  body.add(rifle);

  const api = {
    group: root, body, head, eyes, deadEyes, brows, arms, legs, rifle, pack, hat: hatMesh,
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
      if (st.flail && !st.dead) {
        // ragdoll-ish panic: everything windmills
        const f = this.phase * 3.2;
        arms[0].rotation.x = Math.sin(f) * 2.2; arms[1].rotation.x = Math.sin(f + 2) * 2.2;
        arms[0].rotation.z = 0.9 + Math.sin(f * 1.3) * 0.6; arms[1].rotation.z = -0.9 - Math.sin(f * 1.1) * 0.6;
        legs[0].rotation.x = Math.sin(f + 1) * 1.4; legs[1].rotation.x = Math.sin(f + 3) * 1.4;
        head.rotation.z = Math.sin(f * 0.7) * 0.4;
      } else head.rotation.z = 0;
      if (st.dance && !st.dead) {
        // the victory jig: bounce, sway, windmill one arm, kick the legs
        this.danceClock = (this.danceClock || 0) + dt;
        const t = this.danceClock * 7;
        body.position.y = Math.abs(Math.sin(t)) * 0.14;
        body.rotation.z = Math.sin(t) * 0.22; body.rotation.x = 0;
        arms[0].rotation.x = -2.5 + Math.sin(t) * 0.5; arms[0].rotation.z = 0.5;
        arms[1].rotation.x = -1.2 + Math.sin(t * 2) * 1.6; arms[1].rotation.z = -0.4;
        legs[0].rotation.x = Math.max(0, Math.sin(t)) * 0.9; legs[1].rotation.x = Math.max(0, -Math.sin(t)) * 0.9;
        head.rotation.z = Math.sin(t * 0.5) * 0.3;
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
      // Faces: scared when flailing or hurt, determined when aiming, cheerful otherwise
      const mood = st.dead ? 'dead' : st.flail || st.scared ? 'scared' : st.aiming ? 'focus' : 'happy';
      const by = mood === 'scared' ? 0.15 : mood === 'focus' ? 0.1 : 0.12;
      const tilt = mood === 'scared' ? -0.35 : mood === 'focus' ? 0.35 : 0;
      brows[0].position.y = brows[1].position.y = by;
      brows[0].rotation.z = -tilt; brows[1].rotation.z = tilt;
      brows[0].visible = brows[1].visible = mood !== 'dead';
      smile.visible = mood === 'happy' || mood === 'focus';
      smile.scale.set(mood === 'focus' ? 0.7 : 1, mood === 'focus' ? 0.3 : 1, 1);
      oMouth.visible = mood === 'scared' || mood === 'dead';
      this.blinkT = (this.blinkT || 0) + dt;
      eyes.scale.y = (this.blinkT % 3.7) < 0.1 && mood !== 'scared' ? 0.12 : mood === 'scared' ? 1.15 : 1;
    },
    setVisible(v) { root.visible = v; },
  };
  return api;
}
