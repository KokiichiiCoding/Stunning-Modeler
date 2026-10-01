// Port of TrophyScore.cpp, extended with recovery distance and overkill
// (the C++ dev log listed both as next steps). The four categories stay
// separately visible — the hunt is never reduced to one unexplained number.

import { VITAL_TISSUES, Life, findPart } from './creature.js';

function shotQuality(c, shotsFired) {
  if (c.wounds.length === 0) return 0;
  let vital = 0;
  for (const w of c.wounds) {
    const p = findPart(c, w.bodyPartId);
    if (p && VITAL_TISSUES.has(p.tissue)) vital++;
  }
  const ratio = vital / c.wounds.length;
  const eff = Math.min(1, c.wounds.length / Math.max(1, shotsFired));
  return Math.min(100, Math.max(0, (ratio * 0.7 + eff * 0.3) * 100));
}

function trophyIntegrity(c) {
  let any = false, worst = 100;
  for (const p of c.bodyParts) {
    if (!p.trophyOrgan) continue;
    any = true;
    let cond = 100;
    if (p.maxBoneIntegrity > 0) cond = Math.min(100, Math.max(0, p.boneIntegrity / p.maxBoneIntegrity * 100));
    else if (p.organIntegrity < 100) cond = Math.min(100, Math.max(0, p.organIntegrity));
    worst = Math.min(worst, cond);
  }
  return any ? worst : 100;
}

function recoveryFromTime(t) {
  if (t < 0) return 0;
  if (t <= 5) return 100;
  if (t <= 45) return 100 - (t - 5) / 40 * 30;
  if (t <= 120) return 70 - (t - 45) / 75 * 40;
  return 20;
}

export function tierFor(overall, recovered) {
  if (!recovered) return 'No Recovery';
  if (overall >= 90) return 'Platinum';
  if (overall >= 75) return 'Gold';
  if (overall >= 50) return 'Silver';
  if (overall >= 25) return 'Bronze';
  return 'Field Dressed Only';
}

/**
 * input: { biologicalQuality, shotsFired, timeToIncapacitationS,
 *          recoveryDistanceM? (web), useDistance? }
 * When `useDistance` is false the result matches the C++ reference exactly.
 */
export function computeTrophyScore(c, input) {
  const r = {};
  r.biologicalQuality = Math.min(100, Math.max(0, input.biologicalQuality ?? 100));
  r.shotQuality = shotQuality(c, input.shotsFired ?? 1);
  r.trophyIntegrity = trophyIntegrity(c);
  let rec = recoveryFromTime(input.timeToIncapacitationS ?? -1);
  if (input.useDistance && input.recoveryDistanceM > 0 && rec > 0) {
    // Trailing an animal 300 m through the brush is a worse outcome than
    // finding it 40 m from the hit site, even at the same time-to-down.
    rec *= Math.max(0.6, 1 - Math.max(0, input.recoveryDistanceM - 60) / 600);
  }
  r.recoveryQuality = rec;
  r.recovered = c.life !== Life.Active && (input.timeToIncapacitationS ?? -1) >= 0;
  r.overall = r.recovered
    ? r.biologicalQuality * 0.20 + r.shotQuality * 0.30 + r.trophyIntegrity * 0.25 + r.recoveryQuality * 0.25
    : 0;
  r.tier = tierFor(r.overall, r.recovered);
  return r;
}
