#pragma once
#include "engine/core/Rng.hpp"
#include "engine/io/GameData.hpp"

#include <cstdint>
#include <string>

namespace tp {

// An individual animal, deterministically generated from (species, seed).
// This is what "Biological Quality" is computed from — replacing the old
// caller-supplied placeholder score. The same (species, seed) pair must
// always produce the identical animal; the RNG draw order below is
// therefore part of the save/replay format and must not be reordered
// casually (see generateAnimal's implementation comment).
enum class AgeClass { Juvenile, Young, Mature, Old };
enum class Sex { Female, Male };
enum class Temperament { Timid, Nervous, Steady, Bold, Ornery };

struct GeneratedAnimal {
    std::string individualId; // e.g. "prototype_elk#42"
    std::string speciesId;
    std::uint64_t seed{};

    AgeClass ageClass{AgeClass::Mature};
    Sex sex{Sex::Female};
    double bodyMassKg{};
    double trophySize01{};      // 0..1 relative to species maximum
    double trophySymmetry01{};  // 0..1, 1 = perfectly symmetric
    double coatVariation01{};   // 0..1 hue/pattern axis for presentation
    double healthCondition01{}; // 0..1 general condition
    Temperament temperament{Temperament::Steady};
    double alertnessBaseline01{}; // 0..1 starting wariness
    bool rareTrait{false};
    std::string rareTraitName;
    double maxStaminaS{};

    // Derived: the animal's natural biological quality (0..100), inside the
    // species' base trophy score range and driven by trophy size, symmetry,
    // age and condition. This is what trophy scoring consumes.
    double biologicalQualityPercent{};
};

[[nodiscard]] const char* toString(AgeClass a);
[[nodiscard]] const char* toString(Sex s);
[[nodiscard]] const char* toString(Temperament t);

// Deterministically generates the individual for (profile, seed).
[[nodiscard]] GeneratedAnimal generateAnimal(const SpeciesProfile& profile,
                                             std::uint64_t seed);

// Instantiates the species' CreatureState template and rescales the
// individual-dependent physiology (blood volume scales linearly with body
// mass relative to the species' midpoint mass). Anatomy layout is shared;
// individuals differ in physiology, not skeleton.
[[nodiscard]] CreatureState instantiateGeneratedAnimal(
    const GameDataRegistry& registry, const GeneratedAnimal& animal);

} // namespace tp
