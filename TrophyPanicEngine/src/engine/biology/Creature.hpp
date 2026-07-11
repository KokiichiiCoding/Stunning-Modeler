#pragma once
#include "engine/ballistics/Ballistics.hpp"

#include <cstddef>
#include <string>
#include <vector>

namespace tp {

enum class TissueType {
    Muscle,
    DenseBone,
    Lung,
    Heart,
    LiverGut,
    Brain,
    MajorVessel
};

enum class MobilityState {
    Full,
    Impaired,
    Limping,
    Crawling,
    Immobile
};

enum class LifeState {
    Active,
    Down,
    Dead
};

struct BodyPart {
    std::string id;
    TissueType tissue{TissueType::Muscle};
    double boneIntegrity{};
    double maxBoneIntegrity{};
    bool loadBearing{};
    bool trophyOrgan{};
    double organIntegrity{100.0};
    // Optional. When non-empty, applyImpact routes through the layered
    // traversal model (see Ballistics::resolveLayeredImpact) instead of the
    // single-resistance legacy path. Data-driven species loaded from JSON
    // are expected to populate this; hand-built prototypes may leave it
    // empty and keep using the original behavior.
    std::vector<TissueLayer> layers;
};

struct Wound {
    std::string bodyPartId;
    double bleedRateMlPerSec{};
    double painShock{};
    double permanentCavityCm3{};
    double boneDamage{};
    bool active{true};
    bool exitWound{false};
};

struct CreatureState {
    std::string species;
    double maxBloodVolumeMl{5000.0};
    double bloodVolumeMl{5000.0};
    double consciousness{100.0};
    double accumulatedPainShock{};
    double oxygenPenalty{};
    double cardiacEventTimerS{-1.0}; // -1 = no active cardiac event
    MobilityState mobility{MobilityState::Full};
    LifeState life{LifeState::Active};
    std::vector<BodyPart> bodyParts;
    std::vector<Wound> wounds;

    [[nodiscard]] BodyPart* findPart(const std::string& id);
    [[nodiscard]] const BodyPart* findPart(const std::string& id) const;
    [[nodiscard]] double totalBleedRateMlPerSec() const;
    [[nodiscard]] std::size_t failedLoadBearingLimbs() const;
};

struct HitResolution {
    ImpactResult impact;
    Wound wound;
    bool validBodyPart{};
};

[[nodiscard]] CreatureState makePrototypeDeer();
[[nodiscard]] HitResolution applyImpact(
    CreatureState& creature,
    const std::string& bodyPartId,
    const ProjectileSpec& projectile,
    const ImpactInput& input);

void stepPhysiology(CreatureState& creature, double deltaSeconds);

[[nodiscard]] const char* toString(MobilityState state);
[[nodiscard]] const char* toString(LifeState state);

} // namespace tp
