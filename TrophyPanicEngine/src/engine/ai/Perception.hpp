#pragma once
#include "engine/io/GameData.hpp"
#include "engine/math/Vec3.hpp"
#include "engine/world/Scent.hpp"
#include "engine/world/SoundEvents.hpp"

namespace tp {

// Hunter stance, shared by perception (visibility/noise) and the player
// controller. Defined here because the simulation, not presentation,
// decides how visible and loud a stance is.
enum class Stance { Standing, Crouched, Prone };

// A perceived stimulus, already filtered through this animal's senses.
enum class StimulusKind { Visual, Sound, Scent };

struct Stimulus {
    StimulusKind kind{StimulusKind::Visual};
    Vec3 position;      // where the stimulus places the threat
    double strength01{}; // 0..1 after species sensitivity; drives alertness
    double timeS{};
};

// --- Vision -------------------------------------------------------------
// Detection in [0,1] for one look. Considers distance vs species range,
// field of view, target movement, stance, concealment cover, and whether
// the animal is already keyed up (alert animals spot movement sooner).
// No line-of-sight raycast yet: cover01 stands in for intervening
// vegetation (documented limitation).
[[nodiscard]] double visualDetection01(const SpeciesProfile& species,
                                       const Vec3& animalPos,
                                       double animalFacingRad,
                                       const Vec3& targetPos,
                                       double targetSpeedMps,
                                       Stance targetStance,
                                       double targetCover01,
                                       bool alreadyAlert);

// --- Hearing --------------------------------------------------------------
// Perceived loudness after species hearing sensitivity; the caller maps
// this to a stimulus strength.
[[nodiscard]] double heardLoudness(const SpeciesProfile& species,
                                   const SoundEvent& event,
                                   const Vec3& animalPos);

// Loudness (source intensity at 1 m) of hunter movement. Simulation-owned
// so "a quiet crouched player is harder to hear than a sprinting player"
// is an engine invariant, not an audio-design accident.
[[nodiscard]] double movementLoudness(Stance stance, double speedMps,
                                      double vegetationDensity01);

// --- Smell ------------------------------------------------------------------
// Scent intensity at the animal's nose for a tag, or 0 if below the
// species threshold. Wind direction is already baked into the field.
[[nodiscard]] double smelledIntensity(const SpeciesProfile& species,
                                      const ScentField& scent,
                                      const Vec3& animalPos,
                                      const std::string& sourceTag);

[[nodiscard]] const char* toString(Stance s);

} // namespace tp
