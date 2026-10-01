#pragma once
#include "engine/ecology/AnimalGenerator.hpp"
#include "engine/io/GameData.hpp"
#include "engine/io/ScenarioLoader.hpp"
#include "engine/scoring/TrophyScore.hpp"
#include "engine/sim/HuntSimulation.hpp"

#include <vector>

namespace tp {

struct ScenarioShotOutcome {
    ScenarioShot shot;
    HitResolution hit;
    double firedAtSimSeconds{};
};

struct ScenarioRunResult {
    HuntSimulation simulation;
    std::vector<ScenarioShotOutcome> shotOutcomes;
    TrophyScoreResult trophyScore;
    // Populated only when the scenario supplied an animal_seed.
    bool usedGeneratedAnimal{false};
    GeneratedAnimal generatedAnimal;
};

// Runs every shot in `scenario` against a freshly-instantiated creature from
// `registry`, in fire-time order, then advances simulation to
// scenario.runDurationSeconds and computes the trophy score. Throws
// GameDataError if the scenario references an unknown species/ammo/body
// part. This is the single code path used by both the CLI scenario runner
// and the golden regression tests, specifically so the two can't silently
// diverge.
[[nodiscard]] ScenarioRunResult runScenario(
    const GameDataRegistry& registry,
    const Scenario& scenario);

} // namespace tp
