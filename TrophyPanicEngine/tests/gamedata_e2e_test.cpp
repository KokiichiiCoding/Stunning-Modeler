#include "engine/io/GameData.hpp"
#include "engine/sim/HuntSimulation.hpp"
#include <iostream>
#include <cassert>

using namespace tp;

int main() {
    GameDataRegistry registry;
    registry.loadSpeciesFile("data/species/prototype_deer.json");
    registry.loadSpeciesFile("data/species/prototype_boar.json");
    registry.loadAmmunitionFile("data/ammunition.json");

    assert(registry.hasSpecies("prototype_deer"));
    assert(registry.hasSpecies("prototype_boar"));
    assert(registry.hasAmmunition("308_soft_point"));
    assert(registry.hasAmmunition("throwing_boot"));
    assert(!registry.hasSpecies("bigfoot"));

    std::cout << "Loaded species: ";
    for (const auto& id : registry.speciesIds()) std::cout << id << " ";
    std::cout << "\nLoaded ammunition: ";
    for (const auto& id : registry.ammunitionIds()) std::cout << id << " ";
    std::cout << "\n\n";

    CreatureState deer = registry.instantiateSpecies("prototype_deer");
    std::cout << "Deer species name: " << deer.species << "\n";
    std::cout << "Deer body part count: " << deer.bodyParts.size() << "\n";
    assert(deer.bodyParts.size() == 11);

    // Confirm the thorax loaded its layers correctly (this is the whole
    // point of the exercise — data-driven layered anatomy).
    const BodyPart* lung = deer.findPart("primary_thorax_left");
    assert(lung != nullptr);
    std::cout << "Left thorax layer count: " << lung->layers.size() << "\n";
    assert(lung->layers.size() == 4);
    assert(lung->layers.back().isOrganLayer);
    assert(lung->layers.back().tissueName == "lung");

    const BodyPart* antler = deer.findPart("antler_rack");
    assert(antler != nullptr);
    assert(antler->trophyOrgan);
    std::cout << "Antler bone integrity: " << antler->boneIntegrity << "\n";

    // Fire an actual round from the loaded data through the loaded species,
    // exactly like a real hunt would.
    HuntSimulation sim(std::move(deer));
    const ProjectileSpec& rifle = registry.ammunition("308_soft_point");
    HitResolution hit = sim.fire("primary_thorax_left", rifle, {80.0, 90.0, 1.0, false});
    assert(hit.validBodyPart);
    std::cout << "\nData-driven lung shot -> bleedRateMlPerSec="
              << hit.wound.bleedRateMlPerSec << "\n";
    assert(hit.wound.bleedRateMlPerSec > 0.0);

    sim.runFor(60.0);
    std::cout << "Life state after 60s: " << toString(sim.creature().life) << "\n";
    assert(sim.creature().life != LifeState::Active);

    std::cout << "\nAll GameData end-to-end tests passed.\n";
    return 0;
}
