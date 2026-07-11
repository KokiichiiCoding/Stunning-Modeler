#pragma once
#include "engine/ballistics/Ballistics.hpp"
#include "engine/biology/Creature.hpp"

#include <map>
#include <stdexcept>
#include <string>

namespace tp {

struct GameDataError : std::runtime_error {
    using std::runtime_error::runtime_error;
};

// The non-anatomical half of a species definition: everything the ecology,
// generation, and behavior systems need. Parsed from the same species JSON
// file as the CreatureState anatomy. All fields have conservative defaults
// so a minimal legacy species file (id + body_parts only) still loads.
struct SpeciesProfile {
    std::string id;
    std::string displayName;

    double bodyMassKgMin{50.0};
    double bodyMassKgMax{100.0};

    std::string trophyOrganId;
    double trophyScoreMin{20.0};
    double trophyScoreMax{90.0};

    // movement
    double walkMps{1.0};
    double trotMps{3.0};
    double runMps{9.0};
    double maxStaminaS{60.0};

    // senses
    double visionRangeM{150.0};
    double visionFovDeg{300.0};
    double hearingSensitivity{1.0}; // multiplier on perceived loudness
    double smellThreshold{0.10};    // scent intensity needed for detection

    // behavior tuning
    std::string grouping{"solitary"}; // "herd" | "solitary"
    double fearThreshold{40.0};       // alertness level that triggers fleeing
    double aggressionThreshold{999.0}; // alertness+pain level that triggers charging (999 = never)
    double curiosity{0.3};            // 0..1 chance-weight of investigating over ignoring
    double defensiveRadiusM{0.0};     // inside this range, threat may be answered, not fled
    std::string woundedStyle{"flee_bed"}; // "flee_bed" | "flee_circle_charge" | "defensive"
    std::vector<std::string> preferredTerrain;
    std::vector<std::string> activePeriods;

    // track geometry
    double trackStrideM{1.0};
    double trackPrintSizeCm{7.0};
};

// Reads a single species JSON file (see data/species/*.json for schema
// examples) and returns a fully-populated, full-health CreatureState ready
// to hand to HuntSimulation. Throws GameDataError with file + field context
// on malformed data.
[[nodiscard]] CreatureState loadSpeciesFromFile(const std::string& path);

// Reads the profile half (mass range, senses, behavior tuning, ...) of a
// species JSON file. Same error contract as loadSpeciesFromFile.
[[nodiscard]] SpeciesProfile loadSpeciesProfileFromFile(const std::string& path);

// Reads an ammunition file (see data/ammunition.json) and returns every
// projectile it defines, keyed by id.
[[nodiscard]] std::map<std::string, ProjectileSpec> loadAmmunitionFromFile(
    const std::string& path);

// A small in-memory registry so a scenario runner (or eventually game code)
// can load a directory of species files and one ammunition file once, then
// look things up by id repeatedly.
class GameDataRegistry {
public:
    void loadSpeciesFile(const std::string& path);
    void loadAmmunitionFile(const std::string& path);

    [[nodiscard]] bool hasSpecies(const std::string& id) const;
    [[nodiscard]] bool hasAmmunition(const std::string& id) const;

    // Returns a fresh copy each call, since CreatureState is mutable
    // per-hunt state, not a shared template.
    [[nodiscard]] CreatureState instantiateSpecies(const std::string& id) const;
    [[nodiscard]] const SpeciesProfile& speciesProfile(const std::string& id) const;
    [[nodiscard]] const ProjectileSpec& ammunition(const std::string& id) const;

    [[nodiscard]] std::vector<std::string> speciesIds() const;
    [[nodiscard]] std::vector<std::string> ammunitionIds() const;

private:
    std::map<std::string, CreatureState> speciesTemplates_;
    std::map<std::string, SpeciesProfile> speciesProfiles_;
    std::map<std::string, ProjectileSpec> ammunition_;
};

} // namespace tp
