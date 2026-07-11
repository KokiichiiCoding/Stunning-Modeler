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

// Reads a single species JSON file (see data/species/*.json for schema
// examples) and returns a fully-populated, full-health CreatureState ready
// to hand to HuntSimulation. Throws GameDataError with file + field context
// on malformed data.
[[nodiscard]] CreatureState loadSpeciesFromFile(const std::string& path);

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
    [[nodiscard]] const ProjectileSpec& ammunition(const std::string& id) const;

    [[nodiscard]] std::vector<std::string> speciesIds() const;
    [[nodiscard]] std::vector<std::string> ammunitionIds() const;

private:
    std::map<std::string, CreatureState> speciesTemplates_;
    std::map<std::string, ProjectileSpec> ammunition_;
};

} // namespace tp
