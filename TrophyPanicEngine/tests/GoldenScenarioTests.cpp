// Golden regression tests (roadmap Milestone 1 item).
//
// These lock in known-good outcomes for the three canonical scenarios in
// data/scenarios/. If a future tuning change (bleed coefficients, layer
// resistances, trophy score weights, etc.) shifts these results outside
// tolerance, this test is meant to fail loudly — that's the point. When
// that happens deliberately (an intentional rebalance), update the golden
// values here alongside the change, in the same commit, so the diff shows
// both the tuning change and its consequence together.
//
// Tolerances are deliberately loose on continuous values (times, scores)
// and exact on categorical ones (tier, life state, mobility) — the goal is
// catching "this scenario now behaves like a different scenario," not
// pinning down floating-point noise.

#include "engine/io/GameData.hpp"
#include "engine/sim/ScenarioRunner.hpp"

#include <cmath>
#include <filesystem>
#include <iostream>
#include <string>

namespace fs = std::filesystem;
using namespace tp;

namespace {

int failures = 0;

void checkNear(double actual, double expected, double tolerance, const std::string& label) {
    if (std::abs(actual - expected) > tolerance) {
        ++failures;
        std::cerr << "[FAIL] " << label << ": expected " << expected
                  << " +/- " << tolerance << ", got " << actual << "\n";
    } else {
        std::cout << "[PASS] " << label << " (" << actual << ")\n";
    }
}

void checkEqual(const std::string& actual, const std::string& expected, const std::string& label) {
    if (actual != expected) {
        ++failures;
        std::cerr << "[FAIL] " << label << ": expected '" << expected
                  << "', got '" << actual << "'\n";
    } else {
        std::cout << "[PASS] " << label << " (" << actual << ")\n";
    }
}

void loadAllSpecies(GameDataRegistry& registry, const std::string& speciesDir) {
    for (const auto& entry : fs::directory_iterator(speciesDir)) {
        if (entry.path().extension() == ".json") {
            registry.loadSpeciesFile(entry.path().string());
        }
    }
}

} // namespace

int main() {
    GameDataRegistry registry;
    loadAllSpecies(registry, "data/species");
    registry.loadAmmunitionFile("data/ammunition.json");

    // --- Golden 1: clean lung shot, deer ------------------------------
    {
        std::cout << "\n--- Golden: lung_shot_deer ---\n";
        const Scenario scenario = loadScenarioFromFile("data/scenarios/lung_shot_deer.json");
        const ScenarioRunResult result = runScenario(registry, scenario);

        checkEqual(std::string(toString(result.simulation.creature().life)),
                   "Dead", "lung_shot_deer final life state (60s window is long enough to fully bleed out)");
        checkNear(result.simulation.timeToIncapacitationSeconds(), 21.0, 5.0,
                  "lung_shot_deer time-to-incapacitation (seconds)");
        checkNear(result.trophyScore.overall, 97.0, 8.0,
                  "lung_shot_deer trophy overall score");
        checkEqual(result.trophyScore.tier, "Platinum", "lung_shot_deer trophy tier");
        checkEqual(std::to_string(result.shotOutcomes.size()), "1",
                   "lung_shot_deer shot count");
    }

    // --- Golden 2: heart shot, deer (cardiac fast-path) ----------------
    {
        std::cout << "\n--- Golden: heart_shot_deer ---\n";
        const Scenario scenario = loadScenarioFromFile("data/scenarios/heart_shot_deer.json");
        const ScenarioRunResult result = runScenario(registry, scenario);

        checkEqual(std::string(toString(result.simulation.creature().life)),
                   "Dead", "heart_shot_deer final life state (20s window is long enough to fully bleed out)");
        // Cardiac timer is 3s fixed; allow only a small tolerance since
        // this is meant to be a near-fixed-timer path, not a bleed race.
        checkNear(result.simulation.timeToIncapacitationSeconds(), 3.0, 1.0,
                  "heart_shot_deer time-to-incapacitation (seconds)");
        checkEqual(std::string(toString(result.simulation.creature().mobility)),
                   "Immobile", "heart_shot_deer final mobility");
        checkEqual(result.trophyScore.tier, "Platinum", "heart_shot_deer trophy tier");

        // Regression guard for the "wakes back up after cardiac arrest"
        // bug found and fixed during this development pass: consciousness
        // must stay at the floor once Down, never climb back up.
        bool sawDown = false;
        bool regressed = false;
        for (const auto& sample : result.simulation.telemetry()) {
            if (sample.life != LifeState::Active) {
                if (sawDown && sample.consciousness > 0.5) {
                    regressed = true;
                }
                sawDown = true;
            }
        }
        if (regressed) {
            ++failures;
            std::cerr << "[FAIL] heart_shot_deer: consciousness rose above 0 after Down "
                         "(regression of the cardiac-timer/blood-loss interaction bug)\n";
        } else {
            std::cout << "[PASS] heart_shot_deer: consciousness stayed pinned at 0 after Down\n";
        }
    }

    // --- Golden 3: boar, both front legs, never incapacitated ----------
    {
        std::cout << "\n--- Golden: boar_legs_immobilized ---\n";
        const Scenario scenario = loadScenarioFromFile("data/scenarios/boar_legs_immobilized.json");
        const ScenarioRunResult result = runScenario(registry, scenario);

        checkEqual(std::string(toString(result.simulation.creature().life)),
                   "Active", "boar_legs_immobilized final life state (should not have died)");
        checkEqual(std::string(toString(result.simulation.creature().mobility)),
                   "Crawling", "boar_legs_immobilized final mobility (2 legs down)");
        checkEqual(result.trophyScore.tier, "No Recovery",
                   "boar_legs_immobilized trophy tier");
        checkNear(result.trophyScore.overall, 0.0, 0.01,
                  "boar_legs_immobilized trophy overall score");
    }

    if (failures != 0) {
        std::cerr << "\n" << failures << " golden regression test(s) failed.\n";
        return 1;
    }
    std::cout << "\nAll golden regression tests passed.\n";
    return 0;
}
