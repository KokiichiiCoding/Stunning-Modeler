#include "engine/io/GameData.hpp"
#include "engine/sim/ScenarioRunner.hpp"

#include <filesystem>
#include <iomanip>
#include <iostream>

namespace fs = std::filesystem;
using namespace tp;

namespace {

void loadAllSpecies(GameDataRegistry& registry, const std::string& speciesDir) {
    if (!fs::exists(speciesDir)) {
        throw GameDataError("Species directory not found: " + speciesDir);
    }
    for (const auto& entry : fs::directory_iterator(speciesDir)) {
        if (entry.path().extension() == ".json") {
            registry.loadSpeciesFile(entry.path().string());
        }
    }
}

void printShotOutcomes(const std::vector<ScenarioShotOutcome>& outcomes) {
    for (const auto& outcome : outcomes) {
        std::cout << "  [t=" << outcome.firedAtSimSeconds << "s] Fired "
                  << outcome.shot.ammunitionId << " at " << outcome.shot.bodyPartId
                  << " (range " << outcome.shot.distanceM << "m) -> impact "
                  << std::fixed << std::setprecision(0)
                  << outcome.hit.impact.impactEnergyJ << " J, bleed "
                  << std::setprecision(2) << outcome.hit.wound.bleedRateMlPerSec
                  << " ml/s" << (outcome.hit.wound.exitWound ? " [EXIT WOUND]" : "") << "\n";
    }
}

void printTelemetry(const HuntSimulation& sim) {
    std::cout << "\nTIME  BLOOD LOST  CONSCIOUS  BLEED    MOBILITY   LIFE\n";
    for (const auto& sample : sim.telemetry()) {
        const int rounded = static_cast<int>(sample.timeSeconds + 0.5);
        if (rounded % 5 != 0 && sample.life == LifeState::Active) {
            continue;
        }
        std::cout << std::setw(4) << rounded << "s  "
                  << std::setw(8) << std::fixed << std::setprecision(2)
                  << sample.bloodLostPercent << "%  "
                  << std::setw(8) << sample.consciousness << "%  "
                  << std::setw(7) << sample.bleedRateMlPerSec << "  "
                  << std::setw(9) << toString(sample.mobility) << "  "
                  << toString(sample.life) << '\n';
    }
}

void printTrophyScore(const TrophyScoreResult& score) {
    std::cout << "\n--- TROPHY SCORE ---\n";
    std::cout << std::fixed << std::setprecision(1);
    std::cout << "Biological Quality: " << score.biologicalQuality << "\n";
    std::cout << "Shot Quality:       " << score.shotQuality << "\n";
    std::cout << "Trophy Integrity:   " << score.trophyIntegrity << "\n";
    std::cout << "Recovery Quality:   " << score.recoveryQuality << "\n";
    std::cout << "Overall:            " << score.overall << "\n";
    std::cout << "Tier:               " << score.tier << "\n";
}

} // namespace

int main(int argc, char** argv) {
    const std::string speciesDir = "data/species";
    const std::string ammoFile = "data/ammunition.json";
    const std::string scenarioPath =
        argc > 1 ? argv[1] : "data/scenarios/lung_shot_deer.json";

    try {
        GameDataRegistry registry;
        loadAllSpecies(registry, speciesDir);
        registry.loadAmmunitionFile(ammoFile);

        const Scenario scenario = loadScenarioFromFile(scenarioPath);
        std::cout << "=== " << scenario.title << " ===\n";

        ScenarioRunResult result = runScenario(registry, scenario);

        std::cout << "Species: " << result.simulation.creature().species << "\n";
        printShotOutcomes(result.shotOutcomes);
        printTelemetry(result.simulation);
        printTrophyScore(result.trophyScore);

        return 0;
    } catch (const GameDataError& e) {
        std::cerr << "Data error: " << e.what() << "\n";
        return 1;
    } catch (const std::exception& e) {
        std::cerr << "Unexpected error: " << e.what() << "\n";
        return 1;
    }
}
