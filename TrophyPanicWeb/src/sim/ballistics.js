// Port of TrophyPanicEngine/src/engine/ballistics/Ballistics.cpp.
// Keep the formulas in lock-step with the C++ reference: the parity tests
// in tests/parity.test.js pin the same golden outcomes.

export const ProjectileKind = {
  ExpandingBullet: 'expanding_bullet',
  Broadhead: 'broadhead',
  SteelNail: 'steel_nail',
  BluntObject: 'blunt_object',
  AirImpulse: 'air_impulse',
  Pellets: 'pellets', // web addition: shotgun shot, behaves like a weak expanding round
};

export function kineticEnergyJ(massKg, velocityMps) {
  return 0.5 * massKg * velocityMps * velocityMps;
}

export function velocityAtDistance(p, distanceM) {
  if (p.energyHalfDistanceM <= 0) return p.muzzleVelocityMps;
  const energyFactor = Math.pow(0.5, Math.max(0, distanceM) / p.energyHalfDistanceM);
  return p.muzzleVelocityMps * Math.sqrt(energyFactor);
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function baseDiameter(kind) {
  return kind === ProjectileKind.BluntObject ? 0.08 : 0.009;
}

export function resolveImpact(p, impact, rng = null) {
  const r = {};
  r.impactVelocityMps = velocityAtDistance(p, impact.distanceM);
  r.impactEnergyJ = kineticEnergyJ(p.massKg, r.impactVelocityMps);

  const angle = clamp(impact.incidenceAngleDeg ?? 90, 0, 90) * Math.PI / 180;
  r.angleFactor = Math.max(0.05, Math.sin(angle));

  const resistance = Math.max(0.1, impact.tissueResistance ?? 1);
  const referenceEnergy = Math.max(1, kineticEnergyJ(p.massKg, p.muzzleVelocityMps));
  const energyFraction = r.impactEnergyJ / referenceEnergy;
  r.penetrationM = p.basePenetrationM * energyFraction * r.angleFactor / resistance;

  const expanding = p.kind === ProjectileKind.ExpandingBullet;
  if (rng && impact.denseBone && expanding) {
    // Seeded path: fragmentation is a probability that grows with energy
    // above the 800 J reference, agreeing with the legacy threshold at the margin.
    const chance = clamp((r.impactEnergyJ - 800) / 1600, 0, 0.95);
    r.fragments = rng.chance(chance);
  } else {
    r.fragments = !!impact.denseBone && expanding && r.impactEnergyJ > 800;
  }

  let expansion = p.expansionFactor;
  if (r.fragments) expansion *= 1.35;
  r.woundDiameterM = baseDiameter(p.kind) * Math.max(0.1, expansion);
  const radius = r.woundDiameterM * 0.5;
  r.permanentCavityM3 = Math.PI * radius * radius * Math.max(0, r.penetrationM);
  r.penetrates = p.kind !== ProjectileKind.AirImpulse && r.penetrationM >= 0.015;

  const transfer = clamp(0.25 + resistance * 0.25 + (r.fragments ? 0.2 : 0), 0.15, 0.95);
  r.transferredEnergyJ = r.impactEnergyJ * transfer;
  const bluntBias = p.kind === ProjectileKind.BluntObject ? 1.0 : 0.15;
  r.bluntShock = r.transferredEnergyJ * bluntBias * p.bluntShockScale / 50;
  return r;
}

/** Multi-layer traversal (skin -> muscle -> bone -> organ). */
export function resolveLayeredImpact(p, impact, layers) {
  const out = {
    baseline: resolveImpact(p, impact),
    totalCapacityCm: 0,
    penetrationAchievedCm: 0,
    reachedOrganLayer: false,
    organEntryEnergyFraction: 0,
    exitWound: false,
    exitEnergyJ: 0,
    stoppedAtLayerIndex: 0,
    stoppedInBoneLayer: false,
    layerLog: [], // web addition: which layers were traversed, for the harvest report
  };
  if (!layers || layers.length === 0) return out;

  const v = velocityAtDistance(p, impact.distanceM);
  const e = kineticEnergyJ(p.massKg, v);
  const ref = Math.max(1, kineticEnergyJ(p.massKg, p.muzzleVelocityMps));
  const energyFraction = e / ref;
  const angle = clamp(impact.incidenceAngleDeg ?? 90, 0, 90) * Math.PI / 180;
  const angleFactor = Math.max(0.05, Math.sin(angle));

  const total = p.basePenetrationM * 100 * energyFraction * angleFactor;
  out.totalCapacityCm = total;
  let remaining = total;
  let achieved = 0;
  let passedAll = true;

  for (let i = 0; i < layers.length; i++) {
    const layer = layers[i];
    const res = Math.max(0.1, layer.resistance);
    const cost = layer.thicknessCm * res;
    const fracAtEntry = total > 0 ? clamp(remaining / total, 0, 1) : 0;
    if (remaining < cost) {
      achieved += remaining / res;
      out.stoppedAtLayerIndex = i;
      out.stoppedInBoneLayer = !!layer.isBoneLayer;
      out.layerLog.push({ name: layer.tissueName, passed: false });
      remaining = 0;
      passedAll = false;
      if (layer.isOrganLayer && achieved > 0) {
        out.reachedOrganLayer = true;
        out.organEntryEnergyFraction = fracAtEntry;
      }
      break;
    }
    remaining -= cost;
    achieved += layer.thicknessCm;
    out.layerLog.push({ name: layer.tissueName, passed: true });
    if (layer.isOrganLayer) {
      out.reachedOrganLayer = true;
      out.organEntryEnergyFraction = fracAtEntry;
    }
  }
  out.penetrationAchievedCm = achieved;
  if (passedAll && remaining > 0.5) {
    out.exitWound = true;
    out.exitEnergyJ = e * (total > 0 ? clamp(remaining / total, 0, 1) : 0);
  }
  return out;
}
