// Parity: the JS simulation port must reproduce the C++ engine's golden
// scenarios (TrophyPanicEngine/tests/GoldenScenarioTests.cpp). Scenario
// files are read straight from the C++ data directory so the two builds
// can never silently drift apart.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { SPECIES, CPP_SPECIES } from '../src/sim/species.js';
import { AMMO } from '../src/sim/arsenal.js';
import { instantiateCreature, applyImpact, stepPhysiology, findPart, Life } from '../src/sim/creature.js';
import { computeTrophyScore } from '../src/sim/scoring.js';
import { generateAnimal } from '../src/sim/generator.js';

const here = dirname(fileURLToPath(import.meta.url));
const cppData = join(here, '..', '..', 'TrophyPanicEngine', 'data');

function runScenario(file) {
  const sc = JSON.parse(readFileSync(join(cppData, 'scenarios', file), 'utf8'));
  const species = SPECIES[CPP_SPECIES[sc.species]];
  const c = instantiateCreature(species);
  const shots = [...sc.shots].sort((a, b) => (a.fire_at_seconds ?? 0) - (b.fire_at_seconds ?? 0));
  let t = 0, tti = -1, shotsFired = 0;
  const tick = 1 / 60;
  const telemetry = [];
  const runFor = (dur) => {
    let remaining = Math.max(0, dur);
    while (remaining > 0 && c.life !== Life.Dead) {
      const dt = Math.min(tick, remaining);
      const before = c.life;
      stepPhysiology(c, dt);
      t += dt;
      if (before === Life.Active && c.life !== Life.Active && tti < 0) tti = t;
      telemetry.push({ life: c.life, consciousness: c.consciousness });
      remaining -= dt;
    }
  };
  let simulated = 0;
  const outcomes = [];
  for (const s of shots) {
    const at = s.fire_at_seconds ?? 0;
    if (at > simulated) { runFor(at - simulated); simulated = at; }
    const hit = applyImpact(c, s.body_part, AMMO[s.ammunition], {
      distanceM: s.distance_m ?? 50, incidenceAngleDeg: s.angle_deg ?? 90,
      tissueResistance: s.tissue_resistance ?? 1, denseBone: !!s.dense_bone,
    });
    assert.ok(hit.validBodyPart, `body part ${s.body_part} exists`);
    shotsFired++;
    outcomes.push(hit);
  }
  const dur = sc.run_duration_seconds ?? 120;
  if (dur > simulated) runFor(dur - simulated);
  const score = computeTrophyScore(c, {
    biologicalQuality: sc.biological_quality_percent ?? 100, shotsFired, timeToIncapacitationS: tti,
  });
  return { c, tti, score, outcomes, telemetry };
}

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: expected ${b} ±${tol}, got ${a}`);

test('lung_shot_deer matches C++ golden', () => {
  const r = runScenario('lung_shot_deer.json');
  assert.equal(r.c.life, 'Dead');
  near(r.tti, 21.0, 1.0, 'time to incapacitation');
  near(r.score.overall, 97.1, 0.1, 'overall');
  assert.equal(r.score.tier, 'Platinum');
});

test('heart_shot_deer: cardiac fast path and no waking up after Down', () => {
  const r = runScenario('heart_shot_deer.json');
  assert.equal(r.c.life, 'Dead');
  near(r.tti, 3.0, 0.05, 'cardiac timer');
  assert.equal(r.c.mobility, 'Immobile');
  assert.equal(r.score.tier, 'Platinum');
  let sawDown = false;
  for (const s of r.telemetry) {
    if (s.life !== 'Active') {
      if (sawDown) assert.ok(s.consciousness <= 0.5, 'consciousness stays pinned after Down');
      sawDown = true;
    }
  }
});

test('boar_legs_immobilized: crawling, not recovered', () => {
  const r = runScenario('boar_legs_immobilized.json');
  assert.equal(r.c.life, 'Active');
  assert.equal(r.c.mobility, 'Crawling');
  assert.equal(r.score.tier, 'No Recovery');
});

test('elk_lung_clean: long but successful recovery with exit wound', () => {
  const r = runScenario('elk_lung_clean.json');
  assert.equal(r.c.life, 'Dead');
  near(r.tti, 61, 1.0, 'tti');
  near(r.score.overall, 88.5, 0.1, 'overall');
  assert.equal(r.score.tier, 'Gold');
  assert.ok(r.outcomes[0].wound.exitWound);
});

test('elk_underpowered_22lr: stops in bone, lung untouched', () => {
  const r = runScenario('elk_underpowered_22lr.json');
  assert.equal(r.c.life, 'Active');
  assert.equal(r.score.tier, 'No Recovery');
  assert.equal(findPart(r.c, 'primary_thorax_left').organIntegrity, 100);
});

test('bear_heart_shot and bear_gut_poor_shot', () => {
  const heart = runScenario('bear_heart_shot.json');
  assert.equal(heart.c.life, 'Dead');
  near(heart.tti, 3.0, 0.05, 'bear cardiac');
  near(heart.score.overall, 99.0, 0.1, 'bear heart overall');
  const gut = runScenario('bear_gut_poor_shot.json');
  assert.equal(gut.c.life, 'Active');
  assert.equal(gut.c.mobility, 'Full');
});

test('elk_antler_trophy_damage: integrity 0, Silver', () => {
  const r = runScenario('elk_antler_trophy_damage.json');
  near(r.score.trophyIntegrity, 0, 0.01, 'integrity');
  near(r.score.overall, 54.3, 0.1, 'overall');
  assert.equal(r.score.tier, 'Silver');
});

test('every C++ scenario file is covered by a species mapping', () => {
  for (const f of readdirSync(join(cppData, 'scenarios'))) {
    const sc = JSON.parse(readFileSync(join(cppData, 'scenarios', f), 'utf8'));
    assert.ok(CPP_SPECIES[sc.species], `species ${sc.species} mapped`);
  }
});

test('generator: deterministic, varied, in range', () => {
  const elk = SPECIES.elk;
  assert.deepEqual(generateAnimal(elk, 12345), generateAnimal(elk, 12345));
  assert.notDeepEqual(generateAnimal(elk, 12345), generateAnimal(elk, 12346));
  const ages = new Set();
  for (let s = 0; s < 300; s++) {
    const a = generateAnimal(elk, s);
    ages.add(a.ageClass);
    assert.ok(a.bodyMassKg >= elk.bodyMassKg[0] - 1e-9 && a.bodyMassKg <= elk.bodyMassKg[1] + 1e-9);
    assert.ok(a.biologicalQuality >= 0 && a.biologicalQuality <= 100);
  }
  assert.equal(ages.size, 4);
});

test('every species anatomy is complete and hit regions resolve', () => {
  const needed = ['brain', 'trophy', 'neck', 'heart', 'lungL', 'lungR', 'spine', 'gut', 'legFL', 'legFR', 'legRL', 'legRR'];
  for (const sp of Object.values(SPECIES)) {
    const c = instantiateCreature(sp);
    for (const region of needed) {
      const parts = sp.regions[region];
      assert.ok(parts && parts.length, `${sp.id} has region ${region}`);
      for (const id of parts) assert.ok(findPart(c, id), `${sp.id}.${region} -> ${id} exists`);
    }
    assert.ok(c.bodyParts.some(p => p.trophyOrgan), `${sp.id} has a trophy organ`);
  }
});
