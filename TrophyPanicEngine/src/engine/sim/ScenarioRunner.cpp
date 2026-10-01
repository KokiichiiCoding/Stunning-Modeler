#include "engine/sim/ScenarioRunner.hpp"

#include <algorithm>

namespace tp {

ScenarioRunResult runScenario(
    const GameDataRegistry& registry,
    const Scenario& scenario) {

    if (!registry.hasSpecies(scenario.speciesId)) {
        throw GameDataError("Unknown species in scenario: " + scenario.speciesId);
    }

    bool usedGeneratedAnimal = false;
    GeneratedAnimal generated;
    CreatureState creature = [&] {
        if (scenario.hasAnimalSeed) {
            usedGeneratedAnimal = true;
            generated = generateAnimal(
                registry.speciesProfile(scenario.speciesId), scenario.animalSeed);
            return instantiateGeneratedAnimal(registry, generated);
        }
        return registry.instantiateSpecies(scenario.speciesId);
    }();

    HuntSimulation sim(std::move(creature));

    std::vector<ScenarioShot> shots = scenario.shots;
    std::sort(shots.begin(), shots.end(),
              [](const ScenarioShot& a, const ScenarioShot& b) {
                  return a.fireAtSeconds < b.fireAtSeconds;
              });

    std::vector<ScenarioShotOutcome> outcomes;
    double simulatedSoFar = 0.0;

    for (const auto& shot : shots) {
        if (shot.fireAtSeconds > simulatedSoFar) {
            sim.runFor(shot.fireAtSeconds - simulatedSoFar);
            simulatedSoFar = shot.fireAtSeconds;
        }

        if (!registry.hasAmmunition(shot.ammunitionId)) {
            throw GameDataError("Unknown ammunition in scenario: " + shot.ammunitionId);
        }

        const ProjectileSpec& ammo = registry.ammunition(shot.ammunitionId);
        const ImpactInput input{
            shot.distanceM, shot.incidenceAngleDeg,
            shot.tissueResistance, shot.denseBoneOverride};

        HitResolution hit = sim.fire(shot.bodyPartId, ammo, input);
        if (!hit.validBodyPart) {
            throw GameDataError("Unknown body part in scenario: " + shot.bodyPartId);
        }

        outcomes.push_back(ScenarioShotOutcome{shot, hit, simulatedSoFar});
    }

    if (scenario.runDurationSeconds > simulatedSoFar) {
        sim.runFor(scenario.runDurationSeconds - simulatedSoFar);
    }

    TrophyScoreInput scoreInput;
    scoreInput.biologicalQualityPercent = usedGeneratedAnimal
        ? generated.biologicalQualityPercent
        : scenario.biologicalQualityPercent;
    scoreInput.shotsFired = sim.shotsFired();
    scoreInput.timeToIncapacitationSeconds = sim.timeToIncapacitationSeconds();

    const TrophyScoreResult score = computeTrophyScore(sim.creature(), scoreInput);

    return ScenarioRunResult{std::move(sim), std::move(outcomes), score,
                             usedGeneratedAnimal, std::move(generated)};
}

} // namespace tp
