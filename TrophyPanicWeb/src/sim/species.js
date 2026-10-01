// Species definitions. The first four keep their anatomy byte-for-byte
// identical to TrophyPanicEngine/data/species/*.json (parity tests depend
// on it); the web build adds a brain part to each and six new species.
//
// Units: meters, kilograms, ml of blood, cm for tissue layers.

const L = (tissueName, thicknessCm, resistance, flags = {}) => ({
  tissueName, thicknessCm, resistance,
  isOrganLayer: !!flags.organ, isBoneLayer: !!flags.bone,
});

// Standard broadside thorax stack scaled per species.
function thorax(hide, fat, muscle, rib, organ, organName = 'lung') {
  const layers = [L('hide', hide, 0.5)];
  if (fat > 0) layers.push(L('fat', fat, 0.7));
  layers.push(L('muscle', muscle, 1.0));
  if (rib > 0) layers.push(L('rib_bone', rib, 4.2, { bone: true }));
  layers.push(L(organName, organ, organName === 'heart' ? 0.9 : 0.7, { organ: true }));
  return layers;
}

function skull(hide, bone, brain) {
  return [L('hide', hide, 0.5), L('skull', bone, 5.0, { bone: true }), L('brain', brain, 0.6, { organ: true })];
}

function legs(front, rear, count = 4) {
  if (count === 2) {
    return [
      { id: 'leg_left', tissue: 'dense_bone', boneIntegrity: front, loadBearing: true },
      { id: 'leg_right', tissue: 'dense_bone', boneIntegrity: front, loadBearing: true },
    ];
  }
  return [
    { id: 'gait_column_front_left', tissue: 'dense_bone', boneIntegrity: front, loadBearing: true },
    { id: 'gait_column_front_right', tissue: 'dense_bone', boneIntegrity: front, loadBearing: true },
    { id: 'gait_column_rear_left', tissue: 'dense_bone', boneIntegrity: rear, loadBearing: true },
    { id: 'gait_column_rear_right', tissue: 'dense_bone', boneIntegrity: rear, loadBearing: true },
  ];
}

const QUAD_LEGS = {
  legFL: ['gait_column_front_left'], legFR: ['gait_column_front_right'],
  legRL: ['gait_column_rear_left'], legRR: ['gait_column_rear_right'],
};

// region -> ordered body-part ids a projectile traverses when it enters
// that hit volume. `alsoDamage` names a trophy bone chipped by the same hit.
export const SPECIES = {
  deer: {
    id: 'deer', displayName: 'Ridge Deer', blurb: 'Skittish, herd-minded, excellent ears.',
    maxBloodVolumeMl: 5000, bodyMassKg: [45, 110],
    trophy: { organ: 'antler_rack', scoreRange: [25, 90], label: 'antlers' },
    movement: { walk: 1.1, trot: 3.5, run: 12.0, stamina: 60 },
    senses: { visionRange: 180, fov: 310, hearing: 1.3, smell: 0.10 },
    behavior: { grouping: 'herd', groupSize: [2, 5], fear: 30, aggression: 999, curiosity: 0.45, defensiveRadius: 0, wounded: 'flee_bed' },
    tracks: { stride: 1.3, printCm: 7 },
    klass: [2, 3], value: 260, xp: 120, danger: 0,
    activity: ['dawn', 'dusk', 'day'], habitat: { meadow: 3, forest: 2, pine: 1, marsh: 1 },
    body: { len: 1.25, h: 0.62, w: 0.46, leg: 0.78, neck: 0.5, head: 0.3, headFwd: 0.14 },
    look: { coat: 0xc98a4b, belly: 0xf6e3c6, accent: 0x7a4a26, nose: 0x3a2618, eye: 'big', ears: 'deer', tail: 'puff', trophy: 'antlers', antlerSize: 1.0 },
    regions: {
      brain: ['brain'], trophy: ['antler_rack'], neck: ['gait_column_neck'], heart: ['core_pump_cavity'],
      lungL: ['primary_thorax_left'], lungR: ['primary_thorax_right'], spine: ['spine_thoracic'], gut: ['wobble_rump'], ...QUAD_LEGS,
    },
    bodyParts: [
      { id: 'antler_rack', tissue: 'dense_bone', boneIntegrity: 20, trophyOrgan: true },
      ...legs(40, 45),
      { id: 'primary_thorax_left', tissue: 'lung', layers: [L('skin', 0.3, 0.4), L('muscle', 3, 1), L('rib_bone', 1, 4, { bone: true }), L('lung', 15, 0.7, { organ: true })] },
      { id: 'primary_thorax_right', tissue: 'lung', layers: [L('skin', 0.3, 0.4), L('muscle', 3, 1), L('rib_bone', 1, 4, { bone: true }), L('lung', 15, 0.7, { organ: true })] },
      { id: 'core_pump_cavity', tissue: 'heart', layers: [L('skin', 0.3, 0.4), L('muscle', 4, 1.1), L('sternum_rib', 1.3, 4.5, { bone: true }), L('heart', 8, 0.9, { organ: true })] },
      { id: 'gait_column_neck', tissue: 'major_vessel' },
      { id: 'spine_thoracic', tissue: 'dense_bone', boneIntegrity: 30 },
      { id: 'wobble_rump', tissue: 'liver_gut' },
      { id: 'brain', tissue: 'brain', layers: skull(0.3, 0.8, 6) },
    ],
  },

  elk: {
    id: 'elk', displayName: 'Highland Elk', blurb: 'Big, confident, travels far once spooked.',
    maxBloodVolumeMl: 12000, bodyMassKg: [220, 450],
    trophy: { organ: 'antler_rack', scoreRange: [35, 95], label: 'antlers' },
    movement: { walk: 1.4, trot: 4.5, run: 11.0, stamina: 90 },
    senses: { visionRange: 220, fov: 300, hearing: 1.0, smell: 0.12 },
    behavior: { grouping: 'herd', groupSize: [3, 6], fear: 45, aggression: 999, curiosity: 0.35, defensiveRadius: 0, wounded: 'flee_bed' },
    tracks: { stride: 1.7, printCm: 11 },
    klass: [3, 4], value: 560, xp: 260, danger: 1,
    activity: ['dawn', 'dusk'], habitat: { meadow: 3, pine: 2, forest: 1 },
    body: { len: 1.8, h: 0.9, w: 0.66, leg: 1.05, neck: 0.7, head: 0.4, headFwd: 0.2 },
    look: { coat: 0xb07a4a, belly: 0xe8cfa6, accent: 0x5a3a22, mane: 0x6b4428, nose: 0x2e1d12, eye: 'big', ears: 'deer', tail: 'puff', trophy: 'antlers', antlerSize: 1.7 },
    regions: {
      brain: ['brain'], trophy: ['antler_rack'], neck: ['gait_column_neck'], heart: ['core_pump_cavity'],
      lungL: ['primary_thorax_left'], lungR: ['primary_thorax_right'], spine: ['spine_thoracic'], gut: ['wobble_rump'], ...QUAD_LEGS,
    },
    bodyParts: [
      { id: 'antler_rack', tissue: 'dense_bone', boneIntegrity: 25, trophyOrgan: true },
      ...legs(60, 65),
      { id: 'primary_thorax_left', tissue: 'lung', layers: [L('hide', 0.5, 0.5), L('muscle', 5, 1), L('rib_bone', 1.4, 4.5, { bone: true }), L('lung', 18, 0.7, { organ: true })] },
      { id: 'primary_thorax_right', tissue: 'lung', layers: [L('hide', 0.5, 0.5), L('muscle', 5, 1), L('rib_bone', 1.4, 4.5, { bone: true }), L('lung', 18, 0.7, { organ: true })] },
      { id: 'core_pump_cavity', tissue: 'heart', layers: [L('hide', 0.5, 0.5), L('muscle', 6, 1.1), L('sternum_rib', 1.8, 4.8, { bone: true }), L('heart', 10, 0.9, { organ: true })] },
      { id: 'gait_column_neck', tissue: 'major_vessel' },
      { id: 'spine_thoracic', tissue: 'dense_bone', boneIntegrity: 45 },
      { id: 'wobble_rump', tissue: 'liver_gut' },
      { id: 'brain', tissue: 'brain', layers: skull(0.5, 1.2, 8) },
    ],
  },

  boar: {
    id: 'boar', displayName: 'Ridge Boar', blurb: 'Armoured shoulders, short fuse. Charges when cornered.',
    maxBloodVolumeMl: 3200, bodyMassKg: [60, 180],
    trophy: { organ: 'tusks', scoreRange: [20, 85], label: 'tusks' },
    movement: { walk: 1.0, trot: 3.0, run: 11.0, stamina: 50 },
    senses: { visionRange: 70, fov: 260, hearing: 1.1, smell: 0.06 },
    behavior: { grouping: 'herd', groupSize: [2, 5], fear: 45, aggression: 65, curiosity: 0.5, defensiveRadius: 15, wounded: 'flee_circle_charge' },
    tracks: { stride: 0.9, printCm: 6 },
    klass: [2, 3], value: 230, xp: 140, danger: 2,
    attack: { name: 'tusk gore', blunt: 18, cut: 14, knock: 7, reach: 1.4, cooldown: 1.6 },
    activity: ['dusk', 'night', 'dawn'], habitat: { forest: 3, marsh: 2, brush: 3 },
    body: { len: 1.15, h: 0.66, w: 0.55, leg: 0.34, neck: 0.14, head: 0.38, headFwd: 0.05 },
    look: { coat: 0x7b5a4a, belly: 0xa88570, accent: 0x3e2a22, bristle: 0x2e1f19, nose: 0xe89aa0, eye: 'small', ears: 'pig', tail: 'curl', trophy: 'tusks' },
    regions: {
      brain: ['brain'], trophy: ['tusks'], neck: ['neck'], heart: ['rear_thorax'],
      lungL: ['shoulder_shield_left'], lungR: ['shoulder_shield_right'], spine: ['gut'], gut: ['gut'], ...QUAD_LEGS,
    },
    bodyParts: [
      { id: 'tusks', tissue: 'dense_bone', boneIntegrity: 15, trophyOrgan: true },
      ...legs(30, 32),
      { id: 'shoulder_shield_left', tissue: 'lung', layers: [L('hide', 0.6, 0.6), L('cartilage_shield', 3.5, 3.2, { bone: true }), L('muscle', 2, 1), L('rib_bone', 0.9, 4, { bone: true }), L('lung', 11, 0.7, { organ: true })] },
      { id: 'shoulder_shield_right', tissue: 'lung', layers: [L('hide', 0.6, 0.6), L('cartilage_shield', 3.5, 3.2, { bone: true }), L('muscle', 2, 1), L('rib_bone', 0.9, 4, { bone: true }), L('lung', 11, 0.7, { organ: true })] },
      { id: 'rear_thorax', tissue: 'heart', layers: [L('hide', 0.5, 0.6), L('muscle', 2.5, 1), L('heart', 6, 0.9, { organ: true })] },
      { id: 'neck', tissue: 'major_vessel' },
      { id: 'gut', tissue: 'liver_gut' },
      { id: 'brain', tissue: 'brain', layers: skull(0.8, 1.6, 5) },
    ],
  },

  black_bear: {
    id: 'black_bear', displayName: 'Hollow Black Bear', blurb: 'Usually shy. Curious about snacks. Terrifying up close.',
    maxBloodVolumeMl: 10000, bodyMassKg: [90, 280],
    trophy: { organ: 'skull', scoreRange: [30, 90], label: 'skull' },
    movement: { walk: 1.2, trot: 3.8, run: 13.0, stamina: 45 },
    senses: { visionRange: 100, fov: 240, hearing: 1.1, smell: 0.05 },
    behavior: { grouping: 'solitary', groupSize: [1, 1], fear: 60, aggression: 75, curiosity: 0.7, defensiveRadius: 25, wounded: 'defensive' },
    tracks: { stride: 1.1, printCm: 14 },
    klass: [3, 4], value: 620, xp: 320, danger: 3,
    attack: { name: 'paw swipe', blunt: 30, cut: 22, knock: 11, reach: 1.9, cooldown: 1.4 },
    activity: ['dawn', 'day', 'dusk'], habitat: { forest: 3, brush: 2, pine: 2 },
    body: { len: 1.35, h: 0.82, w: 0.72, leg: 0.5, neck: 0.18, head: 0.44, headFwd: 0.1 },
    look: { coat: 0x2f2a33, belly: 0x4a4250, accent: 0xb58a64, nose: 0x1b181e, eye: 'small', ears: 'round', tail: 'stub', trophy: 'skull', muzzle: 0xc9a27e },
    regions: {
      brain: ['brain'], trophy: ['brain'], trophyAlso: 'skull', neck: ['neck'], heart: ['core_pump_cavity'],
      lungL: ['primary_thorax_left'], lungR: ['primary_thorax_right'], spine: ['gut'], gut: ['gut'], ...QUAD_LEGS,
    },
    bodyParts: [
      { id: 'skull', tissue: 'dense_bone', boneIntegrity: 45, trophyOrgan: true },
      ...legs(55, 58),
      { id: 'primary_thorax_left', tissue: 'lung', layers: [L('hide', 0.8, 0.8), L('fat', 2.5, 0.7), L('muscle', 4, 1), L('rib_bone', 1.2, 4.2, { bone: true }), L('lung', 14, 0.7, { organ: true })] },
      { id: 'primary_thorax_right', tissue: 'lung', layers: [L('hide', 0.8, 0.8), L('fat', 2.5, 0.7), L('muscle', 4, 1), L('rib_bone', 1.2, 4.2, { bone: true }), L('lung', 14, 0.7, { organ: true })] },
      { id: 'core_pump_cavity', tissue: 'heart', layers: [L('hide', 0.8, 0.8), L('fat', 2, 0.7), L('muscle', 4, 1.1), L('rib_bone', 1.2, 4.2, { bone: true }), L('heart', 7, 0.9, { organ: true })] },
      { id: 'neck', tissue: 'major_vessel' },
      { id: 'gut', tissue: 'liver_gut', layers: [L('hide', 0.8, 0.8), L('fat', 2, 0.7), L('muscle', 3, 1), L('gut', 20, 0.5, { organ: true })] },
      { id: 'brain', tissue: 'brain', layers: skull(1.0, 2.0, 6) },
    ],
  },

  // --- Web-build additions: dangerous game ------------------------------

  grizzly: {
    id: 'grizzly', displayName: 'Stumpjaw Grizzly', blurb: 'Apex of the reserve. Does not flee. Bring the big rifle.',
    maxBloodVolumeMl: 18000, bodyMassKg: [180, 450],
    trophy: { organ: 'skull', scoreRange: [35, 98], label: 'skull' },
    movement: { walk: 1.3, trot: 4.2, run: 13.5, stamina: 55 },
    senses: { visionRange: 110, fov: 240, hearing: 1.1, smell: 0.04 },
    behavior: { grouping: 'solitary', groupSize: [1, 1], fear: 85, aggression: 55, curiosity: 0.8, defensiveRadius: 40, wounded: 'defensive', territorial: 30 },
    tracks: { stride: 1.35, printCm: 22 },
    klass: [4, 4], value: 1250, xp: 700, danger: 5,
    attack: { name: 'maul', blunt: 36, cut: 26, knock: 16, reach: 2.3, cooldown: 1.3 },
    activity: ['dawn', 'day', 'dusk', 'night'], habitat: { pine: 3, brush: 2, marsh: 2, ridge: 1 },
    body: { len: 1.9, h: 1.08, w: 0.98, leg: 0.64, neck: 0.22, head: 0.56, headFwd: 0.12, hump: 0.28 },
    look: { coat: 0x8a5f3c, belly: 0xa77e56, accent: 0xd8b48a, nose: 0x241a14, eye: 'small', ears: 'round', tail: 'stub', trophy: 'skull', muzzle: 0xd8b48a },
    regions: {
      brain: ['brain'], trophy: ['brain'], trophyAlso: 'skull', neck: ['neck'], heart: ['core_pump_cavity'],
      lungL: ['primary_thorax_left'], lungR: ['primary_thorax_right'], spine: ['spine_thoracic'], gut: ['gut'], ...QUAD_LEGS,
    },
    bodyParts: [
      { id: 'skull', tissue: 'dense_bone', boneIntegrity: 60, trophyOrgan: true },
      ...legs(78, 80),
      { id: 'primary_thorax_left', tissue: 'lung', layers: thorax(1.0, 4.0, 6.0, 1.5, 18) },
      { id: 'primary_thorax_right', tissue: 'lung', layers: thorax(1.0, 4.0, 6.0, 1.5, 18) },
      { id: 'core_pump_cavity', tissue: 'heart', layers: thorax(1.0, 3.0, 6.0, 1.6, 9, 'heart') },
      { id: 'neck', tissue: 'major_vessel', layers: [L('hide', 1.0, 0.9), L('fat', 3, 0.7), L('muscle', 8, 1.0), L('carotid', 4, 0.6, { organ: true })] },
      { id: 'spine_thoracic', tissue: 'dense_bone', boneIntegrity: 60 },
      { id: 'gut', tissue: 'liver_gut', layers: [L('hide', 1.0, 0.9), L('fat', 4, 0.7), L('muscle', 4, 1), L('gut', 26, 0.5, { organ: true })] },
      { id: 'brain', tissue: 'brain', layers: skull(1.2, 2.6, 7) },
    ],
  },

  moose: {
    id: 'moose', displayName: 'Bogwater Moose', blurb: 'Enormous and grumpy. Will stomp you for standing near it.',
    maxBloodVolumeMl: 24000, bodyMassKg: [380, 700],
    trophy: { organ: 'antler_rack', scoreRange: [40, 96], label: 'palms' },
    movement: { walk: 1.3, trot: 4.0, run: 13.0, stamina: 80 },
    senses: { visionRange: 90, fov: 280, hearing: 1.4, smell: 0.08 },
    behavior: { grouping: 'solitary', groupSize: [1, 2], fear: 70, aggression: 60, curiosity: 0.3, defensiveRadius: 28, wounded: 'defensive', territorial: 18 },
    tracks: { stride: 1.8, printCm: 14 },
    klass: [3, 4], value: 880, xp: 480, danger: 4,
    attack: { name: 'stomp', blunt: 48, cut: 6, knock: 18, reach: 2.4, cooldown: 1.8 },
    activity: ['dawn', 'dusk', 'day'], habitat: { marsh: 4, pine: 2, lake: 2 },
    body: { len: 2.1, h: 1.0, w: 0.78, leg: 1.3, neck: 0.55, head: 0.6, headFwd: 0.35, hump: 0.18 },
    look: { coat: 0x4a3326, belly: 0x6a4c3a, accent: 0x2c1e17, nose: 0x5a3f31, eye: 'big', ears: 'deer', tail: 'stub', trophy: 'palms', antlerSize: 1.8, dewlap: true },
    regions: {
      brain: ['brain'], trophy: ['antler_rack'], neck: ['neck'], heart: ['core_pump_cavity'],
      lungL: ['primary_thorax_left'], lungR: ['primary_thorax_right'], spine: ['spine_thoracic'], gut: ['gut'], ...QUAD_LEGS,
    },
    bodyParts: [
      { id: 'antler_rack', tissue: 'dense_bone', boneIntegrity: 35, trophyOrgan: true },
      ...legs(80, 85),
      { id: 'primary_thorax_left', tissue: 'lung', layers: thorax(0.8, 1.5, 6.0, 1.6, 22) },
      { id: 'primary_thorax_right', tissue: 'lung', layers: thorax(0.8, 1.5, 6.0, 1.6, 22) },
      { id: 'core_pump_cavity', tissue: 'heart', layers: thorax(0.8, 1.0, 7.0, 2.0, 12, 'heart') },
      { id: 'neck', tissue: 'major_vessel' },
      { id: 'spine_thoracic', tissue: 'dense_bone', boneIntegrity: 60 },
      { id: 'gut', tissue: 'liver_gut' },
      { id: 'brain', tissue: 'brain', layers: skull(0.8, 2.0, 8) },
    ],
  },

  wolf: {
    id: 'wolf', displayName: 'Hollow Wolf', blurb: 'Hunts in packs. Bolder at night and near blood.',
    maxBloodVolumeMl: 3000, bodyMassKg: [28, 60],
    trophy: { organ: 'pelt', scoreRange: [25, 90], label: 'pelt' },
    movement: { walk: 1.5, trot: 4.5, run: 14.0, stamina: 120 },
    senses: { visionRange: 160, fov: 270, hearing: 1.5, smell: 0.04 },
    behavior: { grouping: 'pack', groupSize: [3, 5], fear: 55, aggression: 60, curiosity: 0.6, defensiveRadius: 10, wounded: 'flee_bed', predator: true },
    tracks: { stride: 1.2, printCm: 10 },
    klass: [2, 3], value: 320, xp: 220, danger: 3,
    attack: { name: 'bite', blunt: 8, cut: 14, knock: 4, reach: 1.3, cooldown: 1.0 },
    activity: ['dusk', 'night', 'dawn'], habitat: { pine: 3, forest: 2, ridge: 2 },
    body: { len: 1.0, h: 0.42, w: 0.32, leg: 0.52, neck: 0.3, head: 0.28, headFwd: 0.16 },
    look: { coat: 0x8e959e, belly: 0xdfe3e6, accent: 0x4c525a, nose: 0x1e2226, eye: 'sly', ears: 'pointy', tail: 'bushy', trophy: 'pelt' },
    regions: {
      brain: ['brain'], trophy: ['pelt'], neck: ['neck'], heart: ['core_pump_cavity'],
      lungL: ['primary_thorax_left'], lungR: ['primary_thorax_right'], spine: ['gut'], gut: ['gut'], ...QUAD_LEGS,
    },
    bodyParts: [
      { id: 'pelt', tissue: 'muscle', trophyOrgan: true, pelt: true },
      ...legs(24, 26),
      { id: 'primary_thorax_left', tissue: 'lung', layers: thorax(0.4, 0, 2.0, 0.7, 9) },
      { id: 'primary_thorax_right', tissue: 'lung', layers: thorax(0.4, 0, 2.0, 0.7, 9) },
      { id: 'core_pump_cavity', tissue: 'heart', layers: thorax(0.4, 0, 2.5, 0.8, 5, 'heart') },
      { id: 'neck', tissue: 'major_vessel' },
      { id: 'gut', tissue: 'liver_gut' },
      { id: 'brain', tissue: 'brain', layers: skull(0.3, 0.7, 4) },
    ],
  },

  cougar: {
    id: 'cougar', displayName: 'Ghostpaw Cougar', blurb: 'You will not see it first. Keep looking behind you.',
    maxBloodVolumeMl: 3600, bodyMassKg: [40, 95],
    trophy: { organ: 'pelt', scoreRange: [30, 95], label: 'pelt' },
    movement: { walk: 1.2, trot: 4.0, run: 15.0, stamina: 30 },
    senses: { visionRange: 150, fov: 260, hearing: 1.3, smell: 0.07 },
    behavior: { grouping: 'solitary', groupSize: [1, 1], fear: 50, aggression: 50, curiosity: 0.5, defensiveRadius: 12, wounded: 'defensive', predator: true, stalker: true },
    tracks: { stride: 1.0, printCm: 9 },
    klass: [2, 3], value: 680, xp: 420, danger: 4,
    attack: { name: 'pounce', blunt: 26, cut: 24, knock: 13, reach: 1.6, cooldown: 1.2 },
    activity: ['dusk', 'night', 'dawn'], habitat: { ridge: 4, pine: 2, brush: 2 },
    body: { len: 1.25, h: 0.46, w: 0.34, leg: 0.5, neck: 0.24, head: 0.28, headFwd: 0.12 },
    look: { coat: 0xd2a36b, belly: 0xf3e2c8, accent: 0x6b4a2e, nose: 0xd98a8a, eye: 'sly', ears: 'round', tail: 'long', trophy: 'pelt' },
    regions: {
      brain: ['brain'], trophy: ['pelt'], neck: ['neck'], heart: ['core_pump_cavity'],
      lungL: ['primary_thorax_left'], lungR: ['primary_thorax_right'], spine: ['gut'], gut: ['gut'], ...QUAD_LEGS,
    },
    bodyParts: [
      { id: 'pelt', tissue: 'muscle', trophyOrgan: true, pelt: true },
      ...legs(28, 30),
      { id: 'primary_thorax_left', tissue: 'lung', layers: thorax(0.4, 0.5, 2.5, 0.8, 10) },
      { id: 'primary_thorax_right', tissue: 'lung', layers: thorax(0.4, 0.5, 2.5, 0.8, 10) },
      { id: 'core_pump_cavity', tissue: 'heart', layers: thorax(0.4, 0.5, 3.0, 0.9, 5.5, 'heart') },
      { id: 'neck', tissue: 'major_vessel' },
      { id: 'gut', tissue: 'liver_gut' },
      { id: 'brain', tissue: 'brain', layers: skull(0.4, 0.9, 4.5) },
    ],
  },

  // --- Small game -------------------------------------------------------

  turkey: {
    id: 'turkey', displayName: 'Gobblewick Turkey', blurb: 'Loud, nosy, sharp-eyed. Small shot only.',
    maxBloodVolumeMl: 450, bodyMassKg: [4.5, 11],
    trophy: { organ: 'tail_fan', scoreRange: [20, 88], label: 'fan' },
    movement: { walk: 0.9, trot: 3.0, run: 7.5, stamina: 25 },
    senses: { visionRange: 200, fov: 330, hearing: 1.2, smell: 0.5 },
    behavior: { grouping: 'herd', groupSize: [3, 7], fear: 25, aggression: 999, curiosity: 0.55, defensiveRadius: 0, wounded: 'flee_bed' },
    tracks: { stride: 0.35, printCm: 9 },
    klass: [1, 2], value: 95, xp: 60, danger: 0,
    activity: ['dawn', 'day', 'dusk'], habitat: { meadow: 3, forest: 2 },
    biped: true,
    body: { len: 0.5, h: 0.46, w: 0.4, leg: 0.36, neck: 0.3, head: 0.12, headFwd: 0.1 },
    look: { coat: 0x9a6b48, belly: 0x6a4a34, accent: 0xd8413b, wattle: 0xe0484a, nose: 0xe8c36b, eye: 'big', ears: 'none', tail: 'fan', trophy: 'fan', headColor: 0x8fc6f0 },
    regions: {
      brain: ['brain'], trophy: ['tail_fan'], neck: ['neck'], heart: ['core'],
      lungL: ['core'], lungR: ['core'], spine: ['core'], gut: ['gut'],
      legFL: ['leg_left'], legFR: ['leg_right'], legRL: ['leg_left'], legRR: ['leg_right'],
    },
    bodyParts: [
      { id: 'tail_fan', tissue: 'muscle', trophyOrgan: true, pelt: true },
      ...legs(8, 8, 2),
      { id: 'core', tissue: 'lung', layers: [L('feathers', 1.2, 0.2), L('skin', 0.2, 0.4), L('breast', 3, 1.0), L('lung', 4, 0.7, { organ: true })] },
      { id: 'neck', tissue: 'major_vessel' },
      { id: 'gut', tissue: 'liver_gut' },
      { id: 'brain', tissue: 'brain', layers: skull(0.1, 0.2, 1.5) },
    ],
  },

  rabbit: {
    id: 'rabbit', displayName: 'Bouncer Jackrabbit', blurb: 'Zig-zags. Use the .22 or shot, or there is no pelt left.',
    maxBloodVolumeMl: 250, bodyMassKg: [1.5, 4.2],
    trophy: { organ: 'pelt', scoreRange: [15, 85], label: 'pelt' },
    movement: { walk: 0.8, trot: 3.5, run: 13.0, stamina: 20 },
    senses: { visionRange: 100, fov: 340, hearing: 1.6, smell: 0.3 },
    behavior: { grouping: 'solitary', groupSize: [1, 2], fear: 20, aggression: 999, curiosity: 0.25, defensiveRadius: 0, wounded: 'flee_bed', zigzag: true },
    tracks: { stride: 0.8, printCm: 5 },
    klass: [1, 2], value: 45, xp: 30, danger: 0,
    activity: ['dawn', 'dusk', 'night'], habitat: { meadow: 4, brush: 2 },
    body: { len: 0.38, h: 0.26, w: 0.22, leg: 0.1, neck: 0.04, head: 0.17, headFwd: 0.04 },
    look: { coat: 0xb89b7a, belly: 0xf4ece0, accent: 0x6e5a44, nose: 0xe89aa0, eye: 'big', ears: 'bunny', tail: 'puff', trophy: 'pelt' },
    regions: {
      brain: ['brain'], trophy: ['pelt'], neck: ['neck'], heart: ['core'],
      lungL: ['core'], lungR: ['core'], spine: ['core'], gut: ['gut'], ...QUAD_LEGS,
    },
    bodyParts: [
      { id: 'pelt', tissue: 'muscle', trophyOrgan: true, pelt: true },
      ...legs(4, 5),
      { id: 'core', tissue: 'lung', layers: [L('fur', 0.6, 0.2), L('muscle', 1.0, 1.0), L('lung', 3, 0.7, { organ: true })] },
      { id: 'neck', tissue: 'major_vessel' },
      { id: 'gut', tissue: 'liver_gut' },
      { id: 'brain', tissue: 'brain', layers: skull(0.1, 0.2, 1.2) },
    ],
  },

  fox: {
    id: 'fox', displayName: 'Ember Fox', blurb: 'Nosy, fast and fluffy. Cannot resist a squeaky chicken.',
    maxBloodVolumeMl: 520, bodyMassKg: [3.5, 8],
    trophy: { organ: 'pelt', scoreRange: [20, 88], label: 'pelt' },
    movement: { walk: 1.2, trot: 3.6, run: 12.5, stamina: 45 },
    senses: { visionRange: 110, fov: 260, hearing: 1.9, smell: 0.035 },
    behavior: { grouping: 'solitary', groupSize: [1, 1], fear: 32, aggression: 999, curiosity: 0.95, defensiveRadius: 0, wounded: 'flee_bed', zigzag: true },
    tracks: { stride: 0.65, printCm: 5 },
    klass: [1, 2], value: 150, xp: 95, danger: 0,
    activity: ['dawn', 'dusk', 'night'], habitat: { forest: 2, meadow: 2, brush: 3, pine: 1 },
    body: { len: 0.62, h: 0.28, w: 0.2, leg: 0.3, neck: 0.16, head: 0.23, headFwd: 0.1 },
    look: { coat: 0xe8752a, belly: 0xfff4e6, accent: 0xfff4e6, nose: 0x1e1622, muzzle: 0xfff4e6, eye: 'sly', ears: 'pointy', tail: 'bushy', trophy: 'pelt' },
    regions: {
      brain: ['brain'], trophy: ['pelt'], neck: ['neck'], heart: ['core'],
      lungL: ['core'], lungR: ['core'], spine: ['core'], gut: ['gut'], ...QUAD_LEGS,
    },
    bodyParts: [
      { id: 'pelt', tissue: 'muscle', trophyOrgan: true, pelt: true },
      ...legs(7, 8),
      { id: 'core', tissue: 'lung', layers: [L('fur', 0.8, 0.2), L('muscle', 1.2, 1.0), L('lung', 4, 0.7, { organ: true })] },
      { id: 'neck', tissue: 'major_vessel' },
      { id: 'gut', tissue: 'liver_gut' },
      { id: 'brain', tissue: 'brain', layers: skull(0.15, 0.3, 1.8) },
    ],
  },

  bison: {
    id: 'bison', displayName: 'Thunderhump Bison', blurb: 'A living sofa with horns. Herds charge together if you crowd them.',
    maxBloodVolumeMl: 32000, bodyMassKg: [420, 900],
    trophy: { organ: 'horns', scoreRange: [40, 95], label: 'horns' },
    movement: { walk: 1.2, trot: 4.2, run: 13.5, stamina: 90 },
    senses: { visionRange: 100, fov: 300, hearing: 1.2, smell: 0.06 },
    behavior: { grouping: 'herd', groupSize: [4, 7], fear: 60, aggression: 55, curiosity: 0.2, defensiveRadius: 22, wounded: 'defensive', territorial: 20 },
    tracks: { stride: 1.9, printCm: 15 },
    klass: [3, 4], value: 1100, xp: 520, danger: 4,
    attack: { name: 'horn toss', blunt: 42, cut: 10, knock: 20, reach: 2.6, cooldown: 1.8 },
    activity: ['dawn', 'day', 'dusk'], habitat: { meadow: 4, brush: 2 },
    body: { len: 2.4, h: 1.2, w: 0.95, leg: 0.95, neck: 0.2, head: 0.62, headFwd: 0.3, hump: 0.38 },
    look: { coat: 0x5a3b26, belly: 0x6e4a30, accent: 0x2e1f15, nose: 0x241812, muzzle: 0x3a281c, eye: 'big', ears: 'round', tail: 'long', trophy: 'horns', mane: 0x3a2618, dewlap: true },
    regions: {
      brain: ['brain'], trophy: ['horns'], neck: ['neck'], heart: ['core_pump_cavity'],
      lungL: ['primary_thorax_left'], lungR: ['primary_thorax_right'], spine: ['spine_thoracic'], gut: ['gut'], ...QUAD_LEGS,
    },
    bodyParts: [
      { id: 'horns', tissue: 'dense_bone', boneIntegrity: 45, trophyOrgan: true },
      ...legs(90, 90),
      { id: 'primary_thorax_left', tissue: 'lung', layers: thorax(1.0, 2.5, 7.0, 1.8, 24) },
      { id: 'primary_thorax_right', tissue: 'lung', layers: thorax(1.0, 2.5, 7.0, 1.8, 24) },
      { id: 'core_pump_cavity', tissue: 'heart', layers: thorax(1.0, 1.5, 8.0, 2.2, 13, 'heart') },
      { id: 'neck', tissue: 'major_vessel' },
      { id: 'spine_thoracic', tissue: 'dense_bone', boneIntegrity: 70 },
      { id: 'gut', tissue: 'liver_gut' },
      { id: 'brain', tissue: 'brain', layers: skull(1.2, 2.6, 8) },
    ],
  },
};

export const SPECIES_IDS = Object.keys(SPECIES);

// Parity map: C++ species ids -> web species ids.
export const CPP_SPECIES = {
  prototype_deer: 'deer', prototype_elk: 'elk', prototype_boar: 'boar', prototype_black_bear: 'black_bear',
};
