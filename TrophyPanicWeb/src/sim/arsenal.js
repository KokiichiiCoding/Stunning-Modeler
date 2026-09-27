// Ammunition (ported from TrophyPanicEngine/data/ammunition.json, plus web
// additions) and the weapons/gadgets that fire it. Absurd equipment uses the
// same physics as a rifle round: no comedy damage numbers anywhere.

import { ProjectileKind as K } from './ballistics.js';

export const AMMO = {
  // --- ported verbatim from the C++ data ---
  '308_soft_point': { name: '.308 Soft Point', kind: K.ExpandingBullet, massKg: 0.0097, muzzleVelocityMps: 840, energyHalfDistanceM: 150, basePenetrationM: 0.45, expansionFactor: 2.0, bluntShockScale: 1.0 },
  '3006_soft_point': { name: '.30-06 Soft Point', kind: K.ExpandingBullet, massKg: 0.0108, muzzleVelocityMps: 850, energyHalfDistanceM: 155, basePenetrationM: 0.48, expansionFactor: 1.9, bluntShockScale: 1.0 },
  '22lr_solid': { name: '.22LR', kind: K.ExpandingBullet, massKg: 0.0025, muzzleVelocityMps: 320, energyHalfDistanceM: 90, basePenetrationM: 0.08, expansionFactor: 1.0, bluntShockScale: 0.6 },
  '45acp_hollow_point': { name: '.45 ACP Hollow Point', kind: K.ExpandingBullet, massKg: 0.015, muzzleVelocityMps: 260, energyHalfDistanceM: 60, basePenetrationM: 0.22, expansionFactor: 1.6, bluntShockScale: 0.8 },
  '12ga_slug': { name: '12ga Slug', kind: K.ExpandingBullet, massKg: 0.028, muzzleVelocityMps: 460, energyHalfDistanceM: 90, basePenetrationM: 0.9, expansionFactor: 2.2, bluntShockScale: 1.3 },
  recurve_broadhead: { name: 'Recurve Broadhead', kind: K.Broadhead, massKg: 0.026, muzzleVelocityMps: 60, energyHalfDistanceM: 40, basePenetrationM: 0.55, expansionFactor: 1.0, bluntShockScale: 0.3 },
  throwing_boot: { name: 'Throwing Boot', kind: K.BluntObject, massKg: 0.8, muzzleVelocityMps: 15, energyHalfDistanceM: 20, basePenetrationM: 0.01, expansionFactor: 2.5, bluntShockScale: 1.0 },
  nail_gun: { name: 'Powder-Actuated Nail', kind: K.SteelNail, massKg: 0.006, muzzleVelocityMps: 150, energyHalfDistanceM: 15, basePenetrationM: 0.12, expansionFactor: 0.6, bluntShockScale: 0.4 },
  rubber_chicken: { name: 'Rubber Chicken', kind: K.BluntObject, massKg: 0.35, muzzleVelocityMps: 12, energyHalfDistanceM: 15, basePenetrationM: 0.005, expansionFactor: 1.0, bluntShockScale: 0.4 },
  leaf_blower: { name: 'Leaf Blower Gust', kind: K.AirImpulse, massKg: 0.001, muzzleVelocityMps: 45, energyHalfDistanceM: 3, basePenetrationM: 0, expansionFactor: 0, bluntShockScale: 0.15 },
  // --- web additions ---
  '243_soft_point': { name: '.243 Soft Point', kind: K.ExpandingBullet, massKg: 0.0065, muzzleVelocityMps: 910, energyHalfDistanceM: 135, basePenetrationM: 0.36, expansionFactor: 1.8, bluntShockScale: 0.9 },
  '4570_hard_cast': { name: '.45-70 Hard Cast', kind: K.ExpandingBullet, massKg: 0.0263, muzzleVelocityMps: 600, energyHalfDistanceM: 110, basePenetrationM: 0.95, expansionFactor: 1.5, bluntShockScale: 1.4 },
  '44mag_jsp': { name: '.44 Magnum JSP', kind: K.ExpandingBullet, massKg: 0.0156, muzzleVelocityMps: 440, energyHalfDistanceM: 70, basePenetrationM: 0.42, expansionFactor: 1.7, bluntShockScale: 1.1 },
  '12ga_buck': { name: '00 Buck pellet', kind: K.ExpandingBullet, massKg: 0.0035, muzzleVelocityMps: 400, energyHalfDistanceM: 35, basePenetrationM: 0.22, expansionFactor: 1.0, bluntShockScale: 0.7 },
  '12ga_bird': { name: '#6 Bird pellet', kind: K.ExpandingBullet, massKg: 0.00018, muzzleVelocityMps: 390, energyHalfDistanceM: 22, basePenetrationM: 0.04, expansionFactor: 1.0, bluntShockScale: 0.3 },
  compound_broadhead: { name: 'Compound Broadhead', kind: K.Broadhead, massKg: 0.028, muzzleVelocityMps: 90, energyHalfDistanceM: 55, basePenetrationM: 0.7, expansionFactor: 1.1, bluntShockScale: 0.3 },
};

// Drag coefficient for flight integration chosen so kinetic energy halves
// every energyHalfDistanceM, matching velocityAtDistance() exactly:
//   dv/ds = -k v, k = ln2 / (2 * halfDistance)
export function dragPerMeter(ammo) {
  return ammo.energyHalfDistanceM > 0 ? Math.LN2 / (2 * ammo.energyHalfDistanceM) : 0;
}

/** Equivalent range for a round that has lost energy mid-body, so the
 *  sim's distance-based formulas see the correct remaining energy. */
export function equivalentDistanceForEnergy(ammo, energyJ) {
  const e0 = 0.5 * ammo.massKg * ammo.muzzleVelocityMps ** 2;
  if (energyJ <= 0) return ammo.energyHalfDistanceM * 30;
  return Math.max(0, ammo.energyHalfDistanceM * Math.log2(e0 / energyJ));
}

// Weapon classes follow the familiar ethical-calibre ladder:
// 1 small game, 2 medium, 3 large, 4 dangerous/huge.
export const WEAPONS = {
  rifle_243: {
    id: 'rifle_243', name: '.243 Varminter', short: '.243', type: 'rifle', ammo: '243_soft_point', klass: 2,
    magazine: 4, reserve: 20, fireInterval: 1.1, reloadTime: 2.4, spread: 0.0008, sway: 1.0, recoil: 0.55,
    zoom: 4, loudness: 2.0e5, price: 0, color: 0x7a5236, desc: 'Light, flat-shooting starter rifle. Deer, boar, turkey, wolves.',
  },
  rifle_308: {
    id: 'rifle_308', name: '.308 Old Reliable', short: '.308', type: 'rifle', ammo: '308_soft_point', klass: 3,
    magazine: 4, reserve: 20, fireInterval: 1.2, reloadTime: 2.5, spread: 0.0007, sway: 1.05, recoil: 0.8,
    zoom: 5, loudness: 2.5e5, price: 650, color: 0x5c3f2b, desc: 'The workhorse. Elk, black bear, moose with good placement.',
  },
  rifle_3006: {
    id: 'rifle_3006', name: '.30-06 Ridgeline', short: '.30-06', type: 'rifle', ammo: '3006_soft_point', klass: 3,
    magazine: 4, reserve: 20, fireInterval: 1.2, reloadTime: 2.6, spread: 0.0006, sway: 1.1, recoil: 0.9,
    zoom: 6, loudness: 2.6e5, price: 900, color: 0x3b2a20, desc: 'Longer reach, deeper penetration, a proper scope.',
  },
  lever_4570: {
    id: 'lever_4570', name: '.45-70 Bearbuster', short: '.45-70', type: 'rifle', ammo: '4570_hard_cast', klass: 4,
    magazine: 5, reserve: 20, fireInterval: 0.75, reloadTime: 3.2, spread: 0.0011, sway: 1.0, recoil: 1.35,
    zoom: 2, loudness: 2.8e5, price: 1400, color: 0x6b3d24, desc: 'Lever gun for things with claws. Iron sights, huge penetration.',
  },
  shotgun_12: {
    id: 'shotgun_12', name: '12ga Pump', short: '12ga', type: 'shotgun', ammo: '12ga_bird', ammoAlt: ['12ga_bird', '12ga_buck', '12ga_slug'],
    klass: 1, klassByAmmo: { '12ga_bird': 1, '12ga_buck': 2, '12ga_slug': 3 }, pellets: { '12ga_bird': 60, '12ga_buck': 9, '12ga_slug': 1 },
    pelletSpread: { '12ga_bird': 0.035, '12ga_buck': 0.028, '12ga_slug': 0.002 },
    magazine: 5, reserve: 25, fireInterval: 0.8, reloadTime: 3.6, spread: 0.002, sway: 0.9, recoil: 1.1,
    zoom: 1.4, loudness: 2.2e5, price: 450, color: 0x333844, desc: 'Birdshot for turkey and rabbit, buck for close work, slug for surprises.',
  },
  revolver_44: {
    id: 'revolver_44', name: '.44 Hand Cannon', short: '.44', type: 'pistol', ammo: '44mag_jsp', klass: 3,
    magazine: 6, reserve: 24, fireInterval: 0.45, reloadTime: 2.8, spread: 0.004, sway: 1.6, recoil: 1.2,
    zoom: 1.3, loudness: 2.2e5, price: 700, color: 0x9aa0a8, desc: 'Close-range backup for when the bear is already here.',
  },
  bow_recurve: {
    id: 'bow_recurve', name: 'Recurve Bow', short: 'Bow', type: 'bow', ammo: 'recurve_broadhead', klass: 2,
    magazine: 1, reserve: 16, fireInterval: 1.2, reloadTime: 0.9, spread: 0.002, sway: 1.2, recoil: 0.2,
    zoom: 1.5, loudness: 12, price: 380, color: 0x8a5a33, drawTime: 0.9, desc: 'Silent. Arrows fly slow and drop hard — lead and hold over.',
  },
  bow_compound: {
    id: 'bow_compound', name: 'Compound Bow', short: 'Cmpd', type: 'bow', ammo: 'compound_broadhead', klass: 3,
    magazine: 1, reserve: 16, fireInterval: 1.0, reloadTime: 0.8, spread: 0.0012, sway: 1.0, recoil: 0.2,
    zoom: 1.8, loudness: 10, price: 980, color: 0x2d4a3a, drawTime: 0.7, desc: 'Faster arrows, flatter arc. Elk-capable.',
  },
  rimfire_22: {
    id: 'rimfire_22', name: '.22 Plinker', short: '.22', type: 'rifle', ammo: '22lr_solid', klass: 1,
    magazine: 10, reserve: 50, fireInterval: 0.35, reloadTime: 1.8, spread: 0.001, sway: 0.8, recoil: 0.15,
    zoom: 3, loudness: 4.0e3, price: 150, color: 0x8b6b4a, desc: 'Quiet little rifle for rabbits. Useless against anything with fur armour.',
  },
  // --- gadgets ---
  boot: {
    id: 'boot', name: 'Throwing Boot', short: 'Boot', type: 'thrown', ammo: 'throwing_boot', klass: 0,
    magazine: 1, reserve: 4, fireInterval: 0.9, reloadTime: 0.3, spread: 0.01, sway: 0.5, recoil: 0.1,
    zoom: 1, loudness: 150, price: 0, throwSpeed: 16, color: 0x6b4a30, desc: 'Bonk. Distracts, dazes small game, retrievable.',
  },
  chicken: {
    id: 'chicken', name: 'Rubber Chicken', short: 'Chkn', type: 'thrown', ammo: 'rubber_chicken', klass: 0,
    magazine: 1, reserve: 3, fireInterval: 0.9, reloadTime: 0.3, spread: 0.01, sway: 0.5, recoil: 0.1,
    zoom: 1, loudness: 900, price: 0, throwSpeed: 13, squeak: true, color: 0xffd23a, desc: 'SQUEAK. Curious animals come to look. So do bears.',
  },
  blower: {
    id: 'blower', name: 'Leaf Blower', short: 'Blow', type: 'blower', ammo: 'leaf_blower', klass: 0,
    magazine: 100, reserve: 0, fireInterval: 0.05, reloadTime: 0, spread: 0, sway: 0.3, recoil: 0.02,
    zoom: 1, loudness: 2500, price: 260, range: 9, force: 26, color: 0xe24a3b, desc: 'Pushes light things, scatters scent, annoys everything. Not a weapon. Mostly.',
  },
  camera: {
    id: 'camera', name: 'Snappy Camera', short: 'Cam', type: 'camera', ammo: null, ammoLabel: 'Endless film', klass: 0,
    magazine: 1, reserve: 0, fireInterval: 0.9, reloadTime: 0, spread: 0, sway: 0.6, recoil: 0,
    zoom: 3, loudness: 25, price: 0, color: 0x4fb4f0, desc: 'Shoot animals the nice way. New species and great shots pay; the album keeps your best.',
  },
};

export const GEAR = {
  binoculars: { id: 'binoculars', name: 'Binoculars', price: 0, desc: '8x. Rangefinder built in. Identifies the animal and its trophy estimate.' },
  bandage: { id: 'bandage', name: 'Bandage', price: 20, stack: true, desc: 'Stops your bleeding. Hold H.' },
  grunt_call: { id: 'grunt_call', name: 'Deer Grunt', price: 0, call: 'deer', desc: 'Curious deer come to investigate.' },
  bugle_call: { id: 'bugle_call', name: 'Elk Bugle', price: 160, call: 'elk', desc: 'Bulls answer, sometimes angrily.' },
  gobble_call: { id: 'gobble_call', name: 'Turkey Box Call', price: 60, call: 'turkey', desc: 'Toms strut toward you.' },
  predator_call: { id: 'predator_call', name: 'Predator Call', price: 240, call: 'predator', desc: 'A dying-rabbit squeal. Wolves, cougars and bears come. That is the point. And the problem.' },
  scent_spray: { id: 'scent_spray', name: 'Scent Killer', price: 35, stack: true, desc: '5 minutes of 70% less human smell.' },
  energy_drink: { id: 'energy_drink', name: 'Moss Cola', price: 15, stack: true, desc: 'Instant stamina. Mild jitters.' },
};

export const WEAPON_ORDER = ['rifle_243', 'rifle_308', 'rifle_3006', 'lever_4570', 'shotgun_12', 'revolver_44', 'bow_recurve', 'bow_compound', 'rimfire_22', 'camera', 'boot', 'chicken', 'blower'];
