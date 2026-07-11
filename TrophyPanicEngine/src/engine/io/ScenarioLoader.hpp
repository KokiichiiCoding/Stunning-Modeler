#pragma once
#include <cstdint>

#include "engine/ballistics/Ballistics.hpp"
#include "engine/io/GameData.hpp"

#include <string>
#include <vector>

namespace tp {

struct ScenarioShot {
    std::string ammunitionId;
    std::string bodyPartId;
    double distanceM{50.0};
    double incidenceAngleDeg{90.0};
    double tissueResistance{1.0}; // only used by legacy (non-layered) body parts
    bool denseBoneOverride{false};
    double fireAtSeconds{0.0}; // simulation time at which this shot is fired
};

struct Scenario {
    std::string title;
    std::string speciesId;
    std::vector<ScenarioShot> shots;
    double runDurationSeconds{120.0};
    // Legacy placeholder path: used only when no animal_seed is given.
    double biologicalQualityPercent{100.0};
    // When set, the scenario runs against a deterministically generated
    // individual (engine/ecology/AnimalGenerator) instead of the bare
    // species template, and biological quality comes from that animal.
    bool hasAnimalSeed{false};
    std::uint64_t animalSeed{0};
};

[[nodiscard]] Scenario loadScenarioFromFile(const std::string& path);

} // namespace tp
