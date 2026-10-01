#pragma once
#include <string>
#include <vector>

#include "engine/core/Rng.hpp"

namespace tp {

enum class ProjectileKind {
    ExpandingBullet,
    Broadhead,
    SteelNail,
    BluntObject,
    AirImpulse
};

struct ProjectileSpec {
    std::string name;
    ProjectileKind kind{ProjectileKind::ExpandingBullet};
    double massKg{};
    double muzzleVelocityMps{};
    double energyHalfDistanceM{150.0};
    double basePenetrationM{};
    double expansionFactor{1.0};
    double bluntShockScale{1.0};
};

struct ImpactInput {
    double distanceM{};
    double incidenceAngleDeg{90.0}; // 90 = ideal perpendicular impact
    double tissueResistance{1.0};   // muscle 1.0, dense bone > 1.0
    bool denseBone{};
};

struct ImpactResult {
    double impactVelocityMps{};
    double impactEnergyJ{};
    double angleFactor{};
    double penetrationM{};
    double woundDiameterM{};
    double permanentCavityM3{};
    double transferredEnergyJ{};
    double bluntShock{};
    bool fragments{};
    bool penetrates{};
};

[[nodiscard]] double kineticEnergyJ(double massKg, double velocityMps);
[[nodiscard]] double velocityAtDistance(const ProjectileSpec& projectile, double distanceM);
[[nodiscard]] ImpactResult resolveImpact(
    const ProjectileSpec& projectile,
    const ImpactInput& impact);

// Same as resolveImpact, but fragmentation is a probability roll against
// `rng` instead of a hard energy threshold. Reproducible given the same
// seed. The plain (non-Rng) overload above remains the legacy deterministic
// path used by existing callers/tests and is unaffected by this addition.
[[nodiscard]] ImpactResult resolveImpact(
    const ProjectileSpec& projectile,
    const ImpactInput& impact,
    Rng& rng);

// --- Multi-layer traversal ---------------------------------------------
// A body part can optionally be described as an ordered stack of tissue
// layers (skin -> muscle -> [bone] -> organ, roughly outside-in) instead of
// a single lumped resistance value. This lets, e.g., a shot that has to
// break a rib before reaching a lung lose real stopping power on the way,
// and lets an overpowered round produce an exit wound.

struct TissueLayer {
    std::string tissueName;   // free-form label, e.g. "skin", "rib_bone", "lung"
    double thicknessCm{1.0};
    double resistance{1.0};   // >1 = denser/tougher than baseline muscle
    bool isOrganLayer{false}; // does reaching this layer count as an organ hit?
    bool isBoneLayer{false};  // does stopping in this layer count as a bone impact?
};

struct LayeredImpactResult {
    ImpactResult baseline;         // same-distance/angle single-layer calc, for reference
    double totalCapacityCm{};      // raw penetration capacity before any layer resistance
    double penetrationAchievedCm{};
    bool reachedOrganLayer{false};
    double organEntryEnergyFractionJ{}; // fraction of impact energy remaining when organ layer reached (0..1)
    bool exitWound{false};
    double exitEnergyJ{};
    std::size_t stoppedAtLayerIndex{}; // index of the layer the projectile stopped inside (if it didn't fully pass through)
    bool stoppedInBoneLayer{false};
};

[[nodiscard]] LayeredImpactResult resolveLayeredImpact(
    const ProjectileSpec& projectile,
    const ImpactInput& impact,
    const std::vector<TissueLayer>& layers);

} // namespace tp
