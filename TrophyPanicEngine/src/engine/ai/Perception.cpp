#include "engine/ai/Perception.hpp"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace tp {

double visualDetection01(const SpeciesProfile& species, const Vec3& animalPos,
                         double animalFacingRad, const Vec3& targetPos,
                         double targetSpeedMps, Stance targetStance,
                         double targetCover01, bool alreadyAlert) {
    const Vec3 toTarget{targetPos.x - animalPos.x, targetPos.y - animalPos.y, 0.0};
    const double dist = toTarget.length();
    if (dist > species.visionRangeM || dist < 1e-9) {
        return dist < 1e-9 ? 1.0 : 0.0;
    }

    // Outside the field of view there is no visual channel at all —
    // ungulate eyes are wide but not omniscient.
    const double bearing = std::atan2(toTarget.y, toTarget.x);
    double angleOff = std::abs(bearing - animalFacingRad);
    const double twoPi = 2.0 * std::numbers::pi;
    angleOff = std::fmod(angleOff, twoPi);
    if (angleOff > std::numbers::pi) angleOff = twoPi - angleOff;
    const double halfFovRad = species.visionFovDeg * 0.5 * std::numbers::pi / 180.0;
    if (angleOff > halfFovRad) {
        return 0.0;
    }

    const double proximity = 1.0 - dist / species.visionRangeM;

    // Prey vision keys on motion: a still hunter is dramatically harder to
    // pick out than a moving one.
    const double movement = std::clamp(targetSpeedMps / 4.0, 0.0, 1.0);
    const double motionFactor = 0.15 + 0.85 * movement;

    double stanceFactor = 1.0;
    switch (targetStance) {
        case Stance::Standing: stanceFactor = 1.0; break;
        case Stance::Crouched: stanceFactor = 0.55; break;
        case Stance::Prone:    stanceFactor = 0.30; break;
    }

    const double concealment = 1.0 - std::clamp(targetCover01, 0.0, 0.95);
    const double alertBonus = alreadyAlert ? 1.6 : 1.0;

    return std::clamp(proximity * motionFactor * stanceFactor * concealment * alertBonus,
                      0.0, 1.0);
}

double heardLoudness(const SpeciesProfile& species, const SoundEvent& event,
                     const Vec3& animalPos) {
    return SoundLog::perceivedLoudness(event, animalPos) * species.hearingSensitivity;
}

double movementLoudness(Stance stance, double speedMps, double vegetationDensity01) {
    double base = 0.0;
    switch (stance) {
        case Stance::Standing: base = 0.5; break;
        case Stance::Crouched: base = 0.18; break;
        case Stance::Prone:    base = 0.10; break;
    }
    // Speed dominates: sprinting is ~4x a walk; standing still is silent.
    const double speedFactor = std::clamp(speedMps / 1.6, 0.0, 4.0);
    // Brush amplifies every step.
    const double vegetation = 1.0 + vegetationDensity01 * 1.5;
    return base * speedFactor * vegetation;
}

double smelledIntensity(const SpeciesProfile& species, const ScentField& scent,
                        const Vec3& animalPos, const std::string& sourceTag) {
    const double intensity = scent.sample(animalPos, sourceTag);
    return intensity >= species.smellThreshold ? intensity : 0.0;
}

const char* toString(Stance s) {
    switch (s) {
        case Stance::Standing: return "Standing";
        case Stance::Crouched: return "Crouched";
        case Stance::Prone:    return "Prone";
    }
    return "Unknown";
}

} // namespace tp
