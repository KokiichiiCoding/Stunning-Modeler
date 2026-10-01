// Deterministic animal generation (Phase C).
//
// Player-visible invariants under test:
//  - the same (species, seed) always produces the identical animal
//  - different seeds produce actual variety, not one clone
//  - generated values stay inside their documented ranges
//  - biological quality comes from the generated animal and stays inside
//    the species' base trophy score range (+rare bonus headroom)
//  - a scenario with an animal_seed scores with the generated quality
//  - blood volume scales with the individual's body mass

#include "engine/ecology/AnimalGenerator.hpp"
#include "engine/io/GameData.hpp"
#include "engine/io/ScenarioLoader.hpp"
#include "engine/sim/ScenarioRunner.hpp"

#include <cmath>
#include <filesystem>
#include <iostream>
#include <set>
#include <string>

namespace fs = std::filesystem;
using namespace tp;

namespace {

int failures = 0;

void check(bool condition, const std::string& label) {
    if (!condition) {
        ++failures;
        std::cerr << "[FAIL] " << label << "\n";
    } else {
        std::cout << "[PASS] " << label << "\n";
    }
}

bool sameAnimal(const GeneratedAnimal& a, const GeneratedAnimal& b) {
    return a.individualId == b.individualId && a.ageClass == b.ageClass &&
           a.sex == b.sex && a.bodyMassKg == b.bodyMassKg &&
           a.trophySize01 == b.trophySize01 &&
           a.trophySymmetry01 == b.trophySymmetry01 &&
           a.coatVariation01 == b.coatVariation01 &&
           a.healthCondition01 == b.healthCondition01 &&
           a.temperament == b.temperament &&
           a.alertnessBaseline01 == b.alertnessBaseline01 &&
           a.rareTrait == b.rareTrait && a.rareTraitName == b.rareTraitName &&
           a.maxStaminaS == b.maxStaminaS &&
           a.biologicalQualityPercent == b.biologicalQualityPercent;
}

} // namespace

int main() {
    GameDataRegistry registry;
    for (const auto& entry : fs::directory_iterator("data/species")) {
        if (entry.path().extension() == ".json") {
            registry.loadSpeciesFile(entry.path().string());
        }
    }
    registry.loadAmmunitionFile("data/ammunition.json");

    check(registry.hasSpecies("prototype_deer") && registry.hasSpecies("prototype_boar") &&
              registry.hasSpecies("prototype_elk") &&
              registry.hasSpecies("prototype_black_bear"),
          "all four vertical-slice species load from data");

    const SpeciesProfile& elk = registry.speciesProfile("prototype_elk");
    check(elk.grouping == "herd" && elk.bodyMassKgMax > elk.bodyMassKgMin,
          "elk profile fields parsed");
    const SpeciesProfile& bear = registry.speciesProfile("prototype_black_bear");
    check(bear.woundedStyle == "defensive" && bear.aggressionThreshold < 999.0,
          "bear profile fields parsed");

    // --- Determinism -----------------------------------------------------
    const GeneratedAnimal a1 = generateAnimal(elk, 12345);
    const GeneratedAnimal a2 = generateAnimal(elk, 12345);
    check(sameAnimal(a1, a2), "same seed produces the identical elk");

    const GeneratedAnimal b1 = generateAnimal(elk, 12346);
    check(!sameAnimal(a1, b1), "adjacent seed produces a different elk");

    // --- Ranges & variety over a seed sweep ------------------------------
    std::set<std::string> ageClasses;
    std::set<std::string> temperaments;
    bool massInRange = true;
    bool qualityInRange = true;
    bool unitIntervalsOk = true;
    for (std::uint64_t seed = 0; seed < 300; ++seed) {
        const GeneratedAnimal a = generateAnimal(elk, seed);
        ageClasses.insert(toString(a.ageClass));
        temperaments.insert(toString(a.temperament));
        if (a.bodyMassKg < elk.bodyMassKgMin - 1e-9 ||
            a.bodyMassKg > elk.bodyMassKgMax + 1e-9) {
            massInRange = false;
        }
        // Rare trait bonus may exceed the base range's top by up to 5.
        if (a.biologicalQualityPercent < 0.0 ||
            a.biologicalQualityPercent > elk.trophyScoreMax + 5.0 + 1e-9) {
            qualityInRange = false;
        }
        for (double v : {a.trophySize01, a.trophySymmetry01, a.coatVariation01,
                         a.healthCondition01, a.alertnessBaseline01}) {
            if (v < 0.0 || v > 1.0) unitIntervalsOk = false;
        }
    }
    check(massInRange, "300 elk: body mass stays inside species range");
    check(qualityInRange, "300 elk: biological quality stays inside range");
    check(unitIntervalsOk, "300 elk: unit-interval traits stay in [0,1]");
    check(ageClasses.size() == 4, "300 elk: all four age classes appear");
    check(temperaments.size() == 5, "300 elk: all five temperaments appear");

    // --- Physiology scales with the individual ---------------------------
    {
        // Sweep for a heavy and a light individual and compare blood volume.
        double minMass = 1e9, maxMass = -1e9;
        std::uint64_t minSeed = 0, maxSeed = 0;
        for (std::uint64_t seed = 0; seed < 300; ++seed) {
            const GeneratedAnimal a = generateAnimal(elk, seed);
            if (a.bodyMassKg < minMass) { minMass = a.bodyMassKg; minSeed = seed; }
            if (a.bodyMassKg > maxMass) { maxMass = a.bodyMassKg; maxSeed = seed; }
        }
        const CreatureState light =
            instantiateGeneratedAnimal(registry, generateAnimal(elk, minSeed));
        const CreatureState heavy =
            instantiateGeneratedAnimal(registry, generateAnimal(elk, maxSeed));
        check(heavy.maxBloodVolumeMl > light.maxBloodVolumeMl * 1.2,
              "a heavy elk carries substantially more blood than a light one");
    }

    // --- Scenario integration --------------------------------------------
    {
        Scenario scenario = loadScenarioFromFile("data/scenarios/elk_lung_clean.json");
        scenario.hasAnimalSeed = true;
        scenario.animalSeed = 777;
        const ScenarioRunResult run = runScenario(registry, scenario);
        const GeneratedAnimal expected = generateAnimal(elk, 777);
        check(run.usedGeneratedAnimal, "seeded scenario reports a generated animal");
        check(std::abs(run.trophyScore.biologicalQuality -
                       expected.biologicalQualityPercent) < 1e-9,
              "seeded scenario's biological quality comes from the generated animal");
        check(run.generatedAnimal.individualId == expected.individualId,
              "seeded scenario reproduces the exact individual");
    }

    if (failures != 0) {
        std::cerr << "\n" << failures << " animal generation test(s) failed.\n";
        return 1;
    }
    std::cout << "\nAll animal generation tests passed.\n";
    return 0;
}
