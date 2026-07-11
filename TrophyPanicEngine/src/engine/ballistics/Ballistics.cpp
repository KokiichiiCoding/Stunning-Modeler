#include "engine/ballistics/Ballistics.hpp"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace tp {

double kineticEnergyJ(double massKg, double velocityMps) {
    return 0.5 * massKg * velocityMps * velocityMps;
}

double velocityAtDistance(const ProjectileSpec& projectile, double distanceM) {
    if (projectile.energyHalfDistanceM <= 0.0) {
        return projectile.muzzleVelocityMps;
    }

    // Energy follows 0.5^(distance / half-distance). Velocity is proportional
    // to sqrt(energy), so its decay exponent is halved.
    const double energyFactor =
        std::pow(0.5, std::max(0.0, distanceM) / projectile.energyHalfDistanceM);
    return projectile.muzzleVelocityMps * std::sqrt(energyFactor);
}

ImpactResult resolveImpact(
    const ProjectileSpec& projectile,
    const ImpactInput& impact) {

    ImpactResult result;
    result.impactVelocityMps = velocityAtDistance(projectile, impact.distanceM);
    result.impactEnergyJ = kineticEnergyJ(
        projectile.massKg, result.impactVelocityMps);

    const double clampedAngle = std::clamp(impact.incidenceAngleDeg, 0.0, 90.0);
    const double angleRadians = clampedAngle * std::numbers::pi / 180.0;
    result.angleFactor = std::max(0.05, std::sin(angleRadians));

    const double resistance = std::max(0.1, impact.tissueResistance);
    const double referenceEnergy = std::max(
        1.0,
        kineticEnergyJ(projectile.massKg, projectile.muzzleVelocityMps));

    const double energyFraction = result.impactEnergyJ / referenceEnergy;
    result.penetrationM =
        projectile.basePenetrationM *
        energyFraction *
        result.angleFactor /
        resistance;

    result.fragments =
        impact.denseBone &&
        projectile.kind == ProjectileKind::ExpandingBullet &&
        result.impactEnergyJ > 800.0;

    double effectiveExpansion = projectile.expansionFactor;
    if (result.fragments) {
        effectiveExpansion *= 1.35;
    }

    const double baseDiameterM =
        projectile.kind == ProjectileKind::BluntObject ? 0.08 : 0.009;
    result.woundDiameterM = baseDiameterM * std::max(0.1, effectiveExpansion);

    const double radius = result.woundDiameterM * 0.5;
    result.permanentCavityM3 =
        std::numbers::pi * radius * radius * std::max(0.0, result.penetrationM);

    result.penetrates =
        projectile.kind != ProjectileKind::AirImpulse &&
        result.penetrationM >= 0.015;

    const double transferFraction = std::clamp(
        0.25 + resistance * 0.25 + (result.fragments ? 0.20 : 0.0),
        0.15,
        0.95);

    result.transferredEnergyJ = result.impactEnergyJ * transferFraction;

    const double bluntBias =
        projectile.kind == ProjectileKind::BluntObject ? 1.0 : 0.15;
    result.bluntShock =
        result.transferredEnergyJ * bluntBias * projectile.bluntShockScale / 50.0;

    return result;
}

ImpactResult resolveImpact(
    const ProjectileSpec& projectile,
    const ImpactInput& impact,
    Rng& rng) {

    // Reuse the deterministic calculation, then replace only the
    // fragmentation decision with a probabilistic roll. A fragmentation
    // *chance* scales with how far impact energy sits above the 800 J
    // reference threshold used by the legacy path — this keeps the two
    // overloads agreeing at the margins instead of disagreeing arbitrarily.
    ImpactResult result = resolveImpact(projectile, impact);

    if (impact.denseBone && projectile.kind == ProjectileKind::ExpandingBullet) {
        const double energyAboveThreshold = result.impactEnergyJ - 800.0;
        const double chance = std::clamp(energyAboveThreshold / 1600.0, 0.0, 0.95);
        result.fragments = rng.rollChance(chance);

        // Fragmentation changes wound geometry, so recompute the parts of
        // the result that depend on it.
        double effectiveExpansion = projectile.expansionFactor;
        if (result.fragments) {
            effectiveExpansion *= 1.35;
        }
        const double baseDiameterM =
            projectile.kind == ProjectileKind::BluntObject ? 0.08 : 0.009;
        result.woundDiameterM = baseDiameterM * std::max(0.1, effectiveExpansion);
        const double radius = result.woundDiameterM * 0.5;
        result.permanentCavityM3 =
            std::numbers::pi * radius * radius * std::max(0.0, result.penetrationM);

        const double resistance = std::max(0.1, impact.tissueResistance);
        const double transferFraction = std::clamp(
            0.25 + resistance * 0.25 + (result.fragments ? 0.20 : 0.0),
            0.15,
            0.95);
        result.transferredEnergyJ = result.impactEnergyJ * transferFraction;
    }

    return result;
}

LayeredImpactResult resolveLayeredImpact(
    const ProjectileSpec& projectile,
    const ImpactInput& impact,
    const std::vector<TissueLayer>& layers) {

    LayeredImpactResult out;
    out.baseline = resolveImpact(projectile, impact);

    if (layers.empty()) {
        // Nothing to traverse; treat as an immediate stop with no organ.
        return out;
    }

    const double impactVelocity = velocityAtDistance(projectile, impact.distanceM);
    const double impactEnergy = kineticEnergyJ(projectile.massKg, impactVelocity);
    const double referenceEnergy = std::max(
        1.0, kineticEnergyJ(projectile.massKg, projectile.muzzleVelocityMps));
    const double energyFraction = impactEnergy / referenceEnergy;

    const double clampedAngle = std::clamp(impact.incidenceAngleDeg, 0.0, 90.0);
    const double angleRadians = clampedAngle * std::numbers::pi / 180.0;
    const double angleFactor = std::max(0.05, std::sin(angleRadians));

    // Raw capacity, in cm, BEFORE any per-layer resistance is applied.
    // Per-layer resistance is what consumes this budget below, unlike the
    // single-resistance path where one resistance value divides the whole
    // penetration formula up front.
    const double totalCapacityCm =
        projectile.basePenetrationM * 100.0 * energyFraction * angleFactor;
    out.totalCapacityCm = totalCapacityCm;

    double remaining = totalCapacityCm;
    double achieved = 0.0;
    bool fullyPassedAllLayers = true;

    for (std::size_t i = 0; i < layers.size(); ++i) {
        const TissueLayer& layer = layers[i];
        const double resistance = std::max(0.1, layer.resistance);
        const double costCm = layer.thicknessCm * resistance;

        const double fractionRemainingAtEntry =
            totalCapacityCm > 0.0 ? std::clamp(remaining / totalCapacityCm, 0.0, 1.0) : 0.0;

        if (remaining < costCm) {
            // Stops partway through this layer.
            achieved += remaining / resistance;
            out.stoppedAtLayerIndex = i;
            out.stoppedInBoneLayer = layer.isBoneLayer;
            remaining = 0.0;
            fullyPassedAllLayers = false;
            if (layer.isOrganLayer && achieved > 0.0) {
                // Grazed the organ layer's near edge without fully
                // traversing it — still counts as reaching it, just with
                // whatever energy fraction was left on arrival.
                out.reachedOrganLayer = true;
                out.organEntryEnergyFractionJ = fractionRemainingAtEntry;
            }
            break;
        }

        remaining -= costCm;
        achieved += layer.thicknessCm;

        if (layer.isOrganLayer) {
            out.reachedOrganLayer = true;
            out.organEntryEnergyFractionJ = fractionRemainingAtEntry;
        }
    }

    out.penetrationAchievedCm = achieved;

    if (fullyPassedAllLayers && remaining > 0.5) {
        // More than half a centimeter of unspent capacity after clearing
        // every defined layer: the round kept going. Treat as an exit
        // wound with the leftover capacity converted back to an energy
        // fraction for downstream bleed/damage scaling.
        out.exitWound = true;
        const double exitFraction = totalCapacityCm > 0.0
            ? std::clamp(remaining / totalCapacityCm, 0.0, 1.0)
            : 0.0;
        out.exitEnergyJ = impactEnergy * exitFraction;
    }

    return out;
}

} // namespace tp
