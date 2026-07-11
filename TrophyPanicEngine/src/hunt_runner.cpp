// tp_hunt: runs the complete headless hunt loop for a contract file.
//
//   ./build/tp_hunt data/contracts/clean_harvest_deer.json [animal_seed]
//
// Run from the project root so relative data/ paths resolve. Prints the
// hunt transcript and score, and writes a reproducible incident report to
// incident_reports/.

#include "engine/game/HuntLoop.hpp"
#include "engine/game/IncidentReport.hpp"

#include <filesystem>
#include <iomanip>
#include <iostream>

namespace fs = std::filesystem;
using namespace tp;

namespace {

void loadAllData(GameDataRegistry& registry) {
    for (const auto& entry : fs::directory_iterator("data/species")) {
        if (entry.path().extension() == ".json") {
            registry.loadSpeciesFile(entry.path().string());
        }
    }
    registry.loadAmmunitionFile("data/ammunition.json");
    registry.loadItemsFile("data/items.json");
}

} // namespace

int main(int argc, char** argv) {
    const std::string contractPath =
        argc > 1 ? argv[1] : "data/contracts/clean_harvest_deer.json";
    const std::uint64_t seedOverride =
        argc > 2 ? std::strtoull(argv[2], nullptr, 10) : 0;

    try {
        GameDataRegistry registry;
        loadAllData(registry);

        const Contract contract = loadContractFromFile(contractPath, registry);
        HuntLoopSim hunt(registry, contract, seedOverride);
        hunt.runToCompletion();

        const HuntResult& result = hunt.result();

        std::cout << "=== " << contract.title << " ===\n\n";
        std::cout << std::fixed << std::setprecision(1);
        for (const auto& event : result.transcript) {
            std::cout << "[" << std::setw(7) << event.timeS << "s] " << event.text << "\n";
        }

        std::cout << "\n--- RESULT ---\n";
        std::cout << "Outcome:            " << (result.success ? "SUCCESS" : "FAILED")
                  << (result.failureReason.empty() ? "" : " (" + result.failureReason + ")")
                  << "\n";
        if (result.contractType != ContractType::ResearchObservation) {
            std::cout << "Biological Quality: " << result.trophyScore.biologicalQuality << "\n";
            std::cout << "Shot Quality:       " << result.trophyScore.shotQuality << "\n";
            std::cout << "Trophy Integrity:   " << result.trophyScore.trophyIntegrity << "\n";
            std::cout << "Recovery Quality:   " << result.trophyScore.recoveryQuality << "\n";
        }
        std::cout << "Overall:            " << result.trophyScore.overall << "\n";
        std::cout << "Tier:               " << result.trophyScore.tier << "\n";
        if (result.success && contract.rewardCredits > 0.0) {
            std::cout << "Reward:             " << contract.rewardCredits << " credits\n";
        }

        const std::string reportPath =
            "incident_reports/" + contract.id + "_" +
            std::to_string(result.animal.seed) + ".json";
        if (saveIncidentReport(result, contract, reportPath)) {
            std::cout << "\nIncident report: " << reportPath << "\n";
        } else {
            std::cerr << "\nWarning: could not write incident report to " << reportPath
                      << "\n";
        }

        return result.success ? 0 : 2;
    } catch (const GameDataError& e) {
        std::cerr << "Data error: " << e.what() << "\n";
        return 1;
    } catch (const std::exception& e) {
        std::cerr << "Unexpected error: " << e.what() << "\n";
        return 1;
    }
}
