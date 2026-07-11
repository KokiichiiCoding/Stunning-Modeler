// Full hunt-loop tests (Phases H/I/J): contracts, the complete headless
// camp-to-extraction loop, incident reports, and the systemic behavior of
// the absurd equipment.

#include "engine/game/Contracts.hpp"
#include "engine/game/HuntLoop.hpp"
#include "engine/game/IncidentReport.hpp"
#include "engine/io/Json.hpp"

#include <cmath>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>
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

GameDataRegistry loadEverything() {
    GameDataRegistry registry;
    for (const auto& entry : fs::directory_iterator("data/species")) {
        if (entry.path().extension() == ".json") {
            registry.loadSpeciesFile(entry.path().string());
        }
    }
    registry.loadAmmunitionFile("data/ammunition.json");
    registry.loadItemsFile("data/items.json");
    return registry;
}

std::string transcriptDigest(const HuntResult& result) {
    std::ostringstream out;
    for (const auto& event : result.transcript) {
        out << event.timeS << "|" << event.text << ";";
    }
    return out.str();
}

} // namespace

int main() {
    GameDataRegistry registry = loadEverything();

    // --- Items & contract validation --------------------------------------
    check(registry.hasItem("bolt_rifle_308") && registry.hasItem("rubber_chicken") &&
              registry.hasItem("leaf_blower") && registry.hasItem("throwing_boot"),
          "equipment set (professional + absurd) loads from data/items.json");

    const Contract deerContract =
        loadContractFromFile("data/contracts/clean_harvest_deer.json", registry);
    check(deerContract.type == ContractType::CleanHarvest &&
              deerContract.speciesId == "prototype_deer" && deerContract.maxShots == 3,
          "clean-harvest contract parses");

    bool badContractRejected = false;
    try {
        // Write a temporary contract referencing a bogus species.
        std::ofstream bad("data/contracts/.tmp_bad_contract.json");
        bad << R"({"id":"bad","type":"clean_harvest","species":"unicorn"})";
        bad.close();
        (void)loadContractFromFile("data/contracts/.tmp_bad_contract.json", registry);
    } catch (const GameDataError&) {
        badContractRejected = true;
    }
    fs::remove("data/contracts/.tmp_bad_contract.json");
    check(badContractRejected, "contract referencing an unknown species is rejected");

    // --- The complete clean-harvest loop ----------------------------------
    HuntResult deerRun;
    {
        HuntLoopSim hunt(registry, deerContract);
        hunt.runToCompletion();
        deerRun = hunt.result();

        check(deerRun.success, "clean-harvest deer hunt completes successfully");
        check(deerRun.finalPhase == HuntPhase::Complete, "final phase is Complete");
        check(deerRun.animalRecovered, "the animal was recovered");
        check(deerRun.shotsFired >= 1 && deerRun.shotsFired <= deerContract.maxShots,
              "shot count within contract allowance");
        check(deerRun.firstShotDistanceM > 5.0, "shot taken at a real distance");
        check(deerRun.timeToIncapacitationS > 0.0,
              "time-to-incapacitation measured from the wound simulation");

        // Biological quality must come from the generated individual.
        const GeneratedAnimal expected =
            generateAnimal(registry.speciesProfile("prototype_deer"),
                           deerContract.animalSeed);
        check(std::abs(deerRun.trophyScore.biologicalQuality -
                       expected.biologicalQualityPercent) < 1e-9,
              "trophy biological quality equals the generated animal's");

        check(!deerRun.transcript.empty() && deerRun.transcript.size() >= 6,
              "hunt transcript narrates the loop");
    }

    // --- Determinism: the same contract replays identically ---------------
    {
        HuntLoopSim again(registry, deerContract);
        again.runToCompletion();
        check(transcriptDigest(again.result()) == transcriptDigest(deerRun) &&
                  again.result().trophyScore.overall == deerRun.trophyScore.overall,
              "the same contract + seeds replay the identical hunt");
    }

    // --- Problem animal (boar) ---------------------------------------------
    {
        const Contract contract =
            loadContractFromFile("data/contracts/problem_boar.json", registry);
        HuntLoopSim hunt(registry, contract);
        hunt.runToCompletion();
        check(hunt.result().success, "problem-boar contract completes successfully");
        check(hunt.result().animalRecovered, "the boar was recovered");
    }

    // --- Research observation (elk): no shot, no wound ---------------------
    {
        const Contract contract =
            loadContractFromFile("data/contracts/research_elk.json", registry);
        HuntLoopSim hunt(registry, contract);
        hunt.runToCompletion();
        const HuntResult& r = hunt.result();
        check(r.success, "research-observation contract completes successfully");
        check(r.observedOnly && r.shotsFired == 0, "research hunt fired no shots");
        check(hunt.animal().creature().wounds.empty(),
              "research target ends the hunt unwounded");
    }

    // --- Contract failure conditions ----------------------------------------
    {
        Contract impossible = deerContract;
        impossible.minTrophyQuality = 101.0; // unreachable on purpose
        HuntLoopSim hunt(registry, impossible);
        hunt.runToCompletion();
        check(!hunt.result().success && !hunt.result().failureReason.empty(),
              "an unreachable trophy minimum fails the contract with a reason");
    }

    // --- Incident report round-trip -----------------------------------------
    {
        std::ostringstream out;
        writeIncidentReportJson(deerRun, deerContract, out);
        json::Value report;
        bool parsed = true;
        try {
            report = json::Value::parse(out.str());
        } catch (const json::JsonError&) {
            parsed = false;
        }
        check(parsed, "incident report is valid JSON (engine's own parser)");
        if (parsed) {
            check(report["contract"]["animal_seed"].asNumber() ==
                      static_cast<double>(deerContract.animalSeed),
                  "incident report carries the reproduction seed");
            check(report["outcome"]["success"].asBool(),
                  "incident report records the outcome");
            check(report["trophy_score"]["tier"].asString() == deerRun.trophyScore.tier,
                  "incident report records the trophy tier");
            check(!report["transcript"].asArray().empty(),
                  "incident report carries the event transcript");
        }
    }

    // --- Absurd equipment is physical, not comedy-damage --------------------
    {
        // A thrown boot to a deer's thorax: blunt impulse, no penetration of
        // the layered stack, near-zero bleed. Same pipeline as a bullet.
        CreatureState deer = registry.instantiateSpecies("prototype_deer");
        const ItemSpec& boot = registry.item("throwing_boot");
        const ProjectileSpec& bootProj = registry.ammunition(boot.projectileId);
        const ImpactInput toss{4.0, 90.0, 1.0, false};
        const HitResolution hit = applyImpact(deer, "primary_thorax_left", bootProj, toss);
        check(hit.validBodyPart && !hit.wound.exitWound &&
                  hit.wound.bleedRateMlPerSec < 1.0,
              "a thrown boot cannot penetrate a deer thorax (blunt event only)");
        check(deer.findPart("primary_thorax_left")->organIntegrity == 100.0,
              "the boot leaves the lung untouched");

        // The rubber chicken's job is sound: audible a long way off, and it
        // feeds the same SoundLog animals hear.
        SoundEvent squeak;
        squeak.category = SoundCategory::ChickenSqueak;
        squeak.origin = {0, 0, 0};
        squeak.loudness = registry.item("rubber_chicken").fireLoudness;
        const double at150m = SoundLog::perceivedLoudness(squeak, {150.0, 0.0, 0.0});
        check(at150m > 0.02, "a rubber chicken squeak carries at least 150 m");

        // The leaf blower is an air impulse: zero penetration by kind.
        const ProjectileSpec& blower = registry.ammunition("leaf_blower");
        CreatureState deer2 = registry.instantiateSpecies("prototype_deer");
        const HitResolution gust =
            applyImpact(deer2, "primary_thorax_left", blower, {1.0, 90.0, 1.0, false});
        check(gust.wound.bleedRateMlPerSec < 0.5,
              "a leaf blower cannot wound; it only pushes and annoys");
    }

    if (failures != 0) {
        std::cerr << "\n" << failures << " hunt loop test(s) failed.\n";
        return 1;
    }
    std::cout << "\nAll hunt loop tests passed.\n";
    return 0;
}
