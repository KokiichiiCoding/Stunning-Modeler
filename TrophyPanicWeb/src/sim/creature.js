// Port of TrophyPanicEngine/src/engine/biology/Creature.cpp.
// Wounds, bleeding, pain shock, oxygen impairment, cardiac events,
// consciousness and mobility. No hit points anywhere: an animal goes down
// because its body stops working, which is what the whole game is about.

import { resolveImpact, resolveLayeredImpact } from './ballistics.js';

export const Tissue = {
  Muscle: 'muscle',
  DenseBone: 'dense_bone',
  Lung: 'lung',
  Heart: 'heart',
  LiverGut: 'liver_gut',
  Brain: 'brain',
  MajorVessel: 'major_vessel',
};

export const Mobility = { Full: 'Full', Impaired: 'Impaired', Limping: 'Limping', Crawling: 'Crawling', Immobile: 'Immobile' };
export const Life = { Active: 'Active', Down: 'Down', Dead: 'Dead' };

export const VITAL_TISSUES = new Set([Tissue.Lung, Tissue.Heart, Tissue.Brain, Tissue.MajorVessel]);

/** Build a fresh, full-health creature from a species definition. */
export function instantiateCreature(species, bloodScale = 1) {
  return {
    species: species.displayName,
    speciesId: species.id,
    maxBloodVolumeMl: species.maxBloodVolumeMl * bloodScale,
    bloodVolumeMl: species.maxBloodVolumeMl * bloodScale,
    consciousness: 100,
    accumulatedPainShock: 0,
    oxygenPenalty: 0,
    cardiacEventTimerS: -1,
    mobility: Mobility.Full,
    life: Life.Active,
    bodyParts: species.bodyParts.map(bp => ({
      id: bp.id,
      tissue: bp.tissue,
      boneIntegrity: bp.boneIntegrity ?? 0,
      maxBoneIntegrity: bp.boneIntegrity ?? 0,
      loadBearing: !!bp.loadBearing,
      trophyOrgan: !!bp.trophyOrgan,
      organIntegrity: 100,
      layers: bp.layers ? bp.layers.map(l => ({ ...l })) : [],
    })),
    wounds: [],
  };
}

export function findPart(c, id) {
  return c.bodyParts.find(p => p.id === id) || null;
}

export function totalBleedRate(c) {
  let t = 0;
  for (const w of c.wounds) if (w.active) t += w.bleedRateMlPerSec;
  return t;
}

export function failedLoadBearingLimbs(c) {
  let n = 0;
  for (const p of c.bodyParts) if (p.loadBearing && p.maxBoneIntegrity > 0 && p.boneIntegrity <= 0) n++;
  return n;
}

// Tuned for gameplay pacing (see the C++ README's v0.1 pacing notes): a
// solid lung hit reads as "down within roughly half a minute".
function bleedScaleFor(tissue) {
  switch (tissue) {
    case Tissue.Lung: return 0.085;
    case Tissue.Heart: return 0.150;
    case Tissue.MajorVessel: return 0.150;
    case Tissue.LiverGut: return 0.010;
    case Tissue.Brain: return 0.010;
    case Tissue.DenseBone: return 0.002;
    case Tissue.Muscle: return 0.0007;
  }
  return 0;
}

function painShockFor(tissue, impact) {
  let shock = impact.bluntShock;
  switch (tissue) {
    case Tissue.LiverGut: shock += 45; break;
    case Tissue.DenseBone: shock += 15; break;
    case Tissue.Brain: shock += 100; break;
    case Tissue.Heart:
    case Tissue.MajorVessel: shock += 20; break;
  }
  return shock;
}

/**
 * Apply one projectile impact to one body part. Returns a hit resolution
 * like the C++ HitResolution plus `exitEnergyJ` so the caller can carry an
 * overpenetrating round on into the next body part along its path.
 */
export function applyImpact(c, bodyPartId, projectile, input) {
  const res = { impact: null, wound: null, validBodyPart: false, exitEnergyJ: 0, layerLog: [], reachedOrgan: false };
  const part = findPart(c, bodyPartId);
  if (!part) return res;
  res.validBodyPart = true;

  const wound = {
    bodyPartId: part.id, bleedRateMlPerSec: 0, painShock: 0, permanentCavityCm3: 0,
    boneDamage: 0, active: true, exitWound: false,
  };

  if (part.layers.length > 0) {
    const layered = resolveLayeredImpact(projectile, input, part.layers);
    res.impact = { ...layered.baseline };
    res.layerLog = layered.layerLog;
    res.exitEnergyJ = layered.exitEnergyJ;
    wound.exitWound = layered.exitWound;
    const radiusCm = layered.baseline.woundDiameterM * 100 * 0.5;
    wound.permanentCavityCm3 = Math.PI * radiusCm * radiusCm * layered.penetrationAchievedCm;

    if (layered.reachedOrganLayer) {
      res.reachedOrgan = true;
      const effE = layered.baseline.impactEnergyJ * layered.organEntryEnergyFraction;
      wound.bleedRateMlPerSec = effE * bleedScaleFor(part.tissue);
      if (layered.exitWound) wound.bleedRateMlPerSec *= 1.15;
      wound.painShock = painShockFor(part.tissue, layered.baseline);
      res.impact.transferredEnergyJ = layered.baseline.transferredEnergyJ * layered.organEntryEnergyFraction;
      const organDamage = Math.min(100, Math.max(0, wound.permanentCavityCm3 * 0.8));
      part.organIntegrity = Math.max(0, part.organIntegrity - organDamage);
    } else {
      wound.bleedRateMlPerSec = layered.baseline.impactEnergyJ * bleedScaleFor(Tissue.Muscle) * 0.25;
      wound.painShock = painShockFor(layered.stoppedInBoneLayer ? Tissue.DenseBone : Tissue.Muscle, layered.baseline);
      res.impact.transferredEnergyJ = 0;
    }
  } else {
    const adjusted = { ...input, denseBone: !!input.denseBone || part.tissue === Tissue.DenseBone };
    res.impact = resolveImpact(projectile, adjusted, input.rng || null);
    wound.permanentCavityCm3 = res.impact.permanentCavityM3 * 1e6;
    if (res.impact.penetrates) {
      wound.bleedRateMlPerSec = res.impact.impactEnergyJ * bleedScaleFor(part.tissue);
      res.reachedOrgan = part.tissue !== Tissue.Muscle && part.tissue !== Tissue.DenseBone;
    } else {
      wound.bleedRateMlPerSec = res.impact.impactEnergyJ * bleedScaleFor(Tissue.Muscle) * 0.25;
    }
    wound.painShock = painShockFor(part.tissue, res.impact);
    if (part.maxBoneIntegrity > 0) {
      const frag = res.impact.fragments ? 1.5 : 1.0;
      wound.boneDamage = res.impact.transferredEnergyJ * 0.03 * frag;
      part.boneIntegrity = Math.max(0, part.boneIntegrity - wound.boneDamage);
    }
    const organDamage = Math.min(100, Math.max(0, wound.permanentCavityCm3 * 0.8));
    part.organIntegrity = Math.max(0, part.organIntegrity - organDamage);
    // Non-layered soft parts: a round that punched well past the part's
    // depth keeps going (web addition for multi-part traversal).
    if (res.impact.penetrates && res.impact.penetrationM > 0.6) {
      res.exitEnergyJ = res.impact.impactEnergyJ * Math.min(0.6, (res.impact.penetrationM - 0.6) / res.impact.penetrationM);
      wound.exitWound = res.exitEnergyJ > 5;
    }
  }

  c.accumulatedPainShock += wound.painShock;
  c.wounds.push(wound);
  res.wound = wound;

  if (part.tissue === Tissue.Brain && res.impact.transferredEnergyJ > 80) {
    c.consciousness = 0;
    c.life = Life.Down;
  }
  if ((part.tissue === Tissue.Heart || part.tissue === Tissue.MajorVessel) &&
      res.impact.transferredEnergyJ > 150 && c.cardiacEventTimerS < 0) {
    c.cardiacEventTimerS = part.tissue === Tissue.Heart ? 3.0 : 5.0;
  }
  return res;
}

/**
 * Non-penetrating blunt event (boot, rubber chicken, antler-to-hunter,
 * falling log). Pain shock and daze only; no hit points.
 */
export function applyBluntImpulse(c, energyJ, bodyPartId = null) {
  const shock = energyJ / 40;
  c.accumulatedPainShock += shock;
  if (bodyPartId) {
    const part = findPart(c, bodyPartId);
    if (part && part.maxBoneIntegrity > 0) {
      part.boneIntegrity = Math.max(0, part.boneIntegrity - energyJ * 0.01);
    }
  }
  return shock;
}

function mobilityFromFailedLimbs(n) {
  if (n === 0) return Mobility.Full;
  if (n === 1) return Mobility.Limping;
  if (n === 2) return Mobility.Crawling;
  return Mobility.Immobile;
}

export function stepPhysiology(c, dt) {
  if (c.life === Life.Dead || dt <= 0) return;

  if (c.cardiacEventTimerS >= 0) {
    c.cardiacEventTimerS -= dt;
    if (c.cardiacEventTimerS <= 0) {
      c.consciousness = 0;
      c.mobility = Mobility.Immobile;
      c.life = Life.Down;
    }
  }

  const bleed = totalBleedRate(c);
  c.bloodVolumeMl = Math.max(0, c.bloodVolumeMl - bleed * dt);
  const lossFraction = c.maxBloodVolumeMl > 0 ? (c.maxBloodVolumeMl - c.bloodVolumeMl) / c.maxBloodVolumeMl : 1;

  let lungWounds = 0;
  let heartOrVessel = false;
  for (const w of c.wounds) {
    if (!w.active) continue;
    const p = findPart(c, w.bodyPartId);
    if (!p) continue;
    if (p.tissue === Tissue.Lung) lungWounds++;
    if (p.tissue === Tissue.Heart || p.tissue === Tissue.MajorVessel) heartOrVessel = true;
  }
  c.oxygenPenalty = Math.min(40, lungWounds * 12);

  // Once Down, never recompute consciousness upward (the v0.2 regression).
  if (c.life === Life.Active) {
    const bloodPenalty = lossFraction * 120;
    const shockPenalty = c.accumulatedPainShock * 0.18;
    const vascular = heartOrVessel ? 12 : 0;
    c.consciousness = Math.min(100, Math.max(0, 100 - bloodPenalty - shockPenalty - c.oxygenPenalty - vascular));
    c.mobility = mobilityFromFailedLimbs(failedLoadBearingLimbs(c));
    if (c.mobility === Mobility.Full) {
      if (c.consciousness < 55) c.mobility = Mobility.Impaired;
      if (c.consciousness < 25) c.mobility = Mobility.Crawling;
    }
    if (c.consciousness <= 0) c.life = Life.Down;
  }

  if (c.bloodVolumeMl <= c.maxBloodVolumeMl * 0.10) {
    c.life = Life.Dead;
    c.consciousness = 0;
    c.mobility = Mobility.Immobile;
  }
}
