#pragma once
#include "engine/io/GameData.hpp"

#include <cstdint>
#include <string>
#include <vector>

namespace tp {

enum class ContractType { CleanHarvest, ProblemAnimal, ResearchObservation };

// A hunting contract (data/contracts/*.json). Contracts carry their own
// world and animal seeds so a contract is a complete, reproducible hunt
// definition — the same contract file always plays out on the same map
// against the same individual animal.
struct Contract {
    std::string id;
    std::string title;
    ContractType type{ContractType::CleanHarvest};
    std::string speciesId;
    std::string region; // ZoneType name hint in snake_case ("meadow", ...)

    double minTrophyQuality{0.0};
    int maxShots{99};
    double timeLimitS{1800.0};
    double rewardCredits{0.0};
    std::vector<std::string> allowedEquipment;

    // Research-observation tuning.
    double observationRangeM{60.0};
    double observationTimeS{10.0};

    std::uint64_t worldSeed{0};
    std::uint64_t animalSeed{0};
};

// Validates against the registry: species must exist, and every allowed
// equipment id must be a known item.
[[nodiscard]] Contract loadContractFromFile(const std::string& path,
                                            const GameDataRegistry& registry);

[[nodiscard]] const char* toString(ContractType t);

} // namespace tp
