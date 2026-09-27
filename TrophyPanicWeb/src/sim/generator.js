// Port of AnimalGenerator.cpp: (species, seed) -> a deterministic individual.
// The draw order is a replay-format contract; append new draws at the end.

import { Rng } from '../core/rng.js';

const AGE = ['Juvenile', 'Young', 'Mature', 'Old'];
const AGE_FACTOR = { Juvenile: 0.10, Young: 0.45, Mature: 0.95, Old: 0.80 };
const TEMPERAMENTS = ['Timid', 'Nervous', 'Steady', 'Bold', 'Ornery'];
const RARE = ['Piebald', 'Melanistic', 'Ghost Gray'];

// Cute generated names for the harvest card. Pure flavour; drawn last.
const NAME_A = ['Sir', 'Big', 'Lil', 'Old', 'Captain', 'Professor', 'Auntie', 'Sergeant', 'Baron', 'Grandpa', 'Tiny', 'Madame'];
const NAME_B = ['Muffin', 'Biscuit', 'Nibbles', 'Tater', 'Pickles', 'Waffles', 'Bumble', 'Crumpet', 'Noodle', 'Pudding', 'Sprout', 'Gumdrop', 'Pretzel', 'Doodle', 'Marbles', 'Wobbles'];

export function generateAnimal(species, seed) {
  const rng = new Rng(seed >>> 0);
  const a = { speciesId: species.id, seed: seed >>> 0, individualId: `${species.id}#${seed >>> 0}` };

  a.sex = rng.next() < 0.5 ? 'Female' : 'Male';
  const r = rng.next();
  a.ageClass = r < 0.2 ? AGE[0] : r < 0.5 ? AGE[1] : r < 0.85 ? AGE[2] : AGE[3];
  const age = AGE_FACTOR[a.ageClass];

  const massT = Math.min(1, Math.max(0, age * 0.6 + rng.next() * 0.4));
  a.bodyMassKg = species.bodyMassKg[0] + (species.bodyMassKg[1] - species.bodyMassKg[0]) * massT;

  a.trophySize01 = Math.min(1, Math.max(0, rng.next() * (0.3 + 0.7 * age)));
  // Antlered species: only males carry racks. Other trophies run smaller on females.
  const antlered = species.look.trophy === 'antlers' || species.look.trophy === 'palms';
  if (a.sex === 'Female') a.trophySize01 *= antlered ? 0 : 0.6;

  a.trophySymmetry01 = 0.55 + rng.next() * 0.45;
  a.coatVariation01 = rng.next();
  a.healthCondition01 = 0.4 + rng.next() * 0.6;
  const t = rng.next();
  a.temperament = t < 0.2 ? 'Timid' : t < 0.45 ? 'Nervous' : t < 0.75 ? 'Steady' : t < 0.92 ? 'Bold' : 'Ornery';

  let alert = 0.2 + rng.next() * 0.6;
  if (a.temperament === 'Timid') alert += 0.15;
  if (a.temperament === 'Bold' || a.temperament === 'Ornery') alert -= 0.10;
  a.alertnessBaseline01 = Math.min(1, Math.max(0, alert));

  const rareRoll = rng.next();
  a.rareTrait = rareRoll < 0.03;
  a.rareTraitName = a.rareTrait ? RARE[Math.min(2, Math.floor(rareRoll / 0.03 * 3))] : '';

  a.maxStaminaS = species.movement.stamina * (0.8 + 0.4 * a.healthCondition01);

  const q01 = Math.min(1, Math.max(0,
    a.trophySize01 * 0.45 + a.trophySymmetry01 * 0.15 + age * 0.25 + a.healthCondition01 * 0.15));
  let q = species.trophy.scoreRange[0] + (species.trophy.scoreRange[1] - species.trophy.scoreRange[0]) * q01;
  if (a.rareTrait) q += 5;
  a.biologicalQuality = Math.min(100, Math.max(0, q));

  // web-only flavour draws (appended after the C++ contract)
  a.nickname = `${rng.pick(NAME_A)} ${rng.pick(NAME_B)}`;
  a.scale = 0.75 + massT * 0.5;
  return a;
}

export { TEMPERAMENTS };
