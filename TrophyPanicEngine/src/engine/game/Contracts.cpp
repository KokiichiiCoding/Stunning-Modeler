#include "engine/game/Contracts.hpp"
#include "engine/io/Json.hpp"

#include <fstream>
#include <sstream>

namespace tp {

namespace {

std::string readFileOrThrow(const std::string& path) {
    std::ifstream file(path, std::ios::binary);
    if (!file) {
        throw GameDataError("Could not open contract file: " + path);
    }
    std::ostringstream contents;
    contents << file.rdbuf();
    return contents.str();
}

ContractType parseType(const std::string& s, const std::string& path) {
    if (s == "clean_harvest") return ContractType::CleanHarvest;
    if (s == "problem_animal") return ContractType::ProblemAnimal;
    if (s == "research_observation") return ContractType::ResearchObservation;
    throw GameDataError("Unknown contract type '" + s + "' in '" + path +
                        "' (expected clean_harvest | problem_animal | research_observation)");
}

} // namespace

Contract loadContractFromFile(const std::string& path,
                              const GameDataRegistry& registry) {
    const std::string text = readFileOrThrow(path);

    json::Value root;
    try {
        root = json::Value::parse(text);
    } catch (const json::JsonError& e) {
        throw GameDataError("JSON parse error in contract '" + path + "': " + e.what());
    }

    try {
        Contract contract;
        contract.id = root["id"].asString();
        contract.title = root.stringOr("title", contract.id);
        contract.type = parseType(root["type"].asString(), path);
        contract.speciesId = root["species"].asString();
        contract.region = root.stringOr("region", "any");
        contract.minTrophyQuality = root.numberOr("min_trophy_quality", 0.0);
        contract.maxShots = static_cast<int>(root.numberOr("max_shots", 99.0));
        contract.timeLimitS = root.numberOr("time_limit_s", 1800.0);
        contract.rewardCredits = root.numberOr("reward_credits", 0.0);
        contract.observationRangeM = root.numberOr("observation_range_m", 60.0);
        contract.observationTimeS = root.numberOr("observation_time_s", 10.0);
        contract.worldSeed = static_cast<std::uint64_t>(root.numberOr("world_seed", 0.0));
        contract.animalSeed = static_cast<std::uint64_t>(root.numberOr("animal_seed", 0.0));

        if (root.has("allowed_equipment")) {
            for (const auto& item : root["allowed_equipment"].asArray()) {
                contract.allowedEquipment.push_back(item.asString());
            }
        }

        if (!registry.hasSpecies(contract.speciesId)) {
            throw GameDataError("Contract '" + path + "' references unknown species '" +
                                contract.speciesId + "'");
        }
        for (const auto& itemId : contract.allowedEquipment) {
            if (!registry.hasItem(itemId)) {
                throw GameDataError("Contract '" + path + "' allows unknown item '" +
                                    itemId + "'");
            }
        }

        return contract;
    } catch (const json::JsonError& e) {
        throw GameDataError("Malformed contract file '" + path + "': " + e.what());
    }
}

const char* toString(ContractType t) {
    switch (t) {
        case ContractType::CleanHarvest:        return "CleanHarvest";
        case ContractType::ProblemAnimal:       return "ProblemAnimal";
        case ContractType::ResearchObservation: return "ResearchObservation";
    }
    return "Unknown";
}

} // namespace tp
