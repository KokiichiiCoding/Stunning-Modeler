#include "engine/sim/HuntSimulation.hpp"

#include <algorithm>

namespace tp {

HuntSimulation::HuntSimulation(CreatureState creature)
    : creature_(std::move(creature)) {
    recordTelemetry();
}

CreatureState& HuntSimulation::creature() {
    return creature_;
}

const CreatureState& HuntSimulation::creature() const {
    return creature_;
}

HitResolution HuntSimulation::fire(
    const std::string& bodyPartId,
    const ProjectileSpec& projectile,
    const ImpactInput& impact) {
    const HitResolution result = applyImpact(creature_, bodyPartId, projectile, impact);
    if (result.validBodyPart) {
        ++shotsFired_;
    }
    return result;
}

void HuntSimulation::step(double deltaSeconds) {
    const LifeState before = creature_.life;
    stepPhysiology(creature_, deltaSeconds);
    timeSeconds_ += deltaSeconds;

    if (before == LifeState::Active &&
        creature_.life != LifeState::Active &&
        timeToIncapacitationSeconds_ < 0.0) {
        timeToIncapacitationSeconds_ = timeSeconds_;
    }

    if (timeSeconds_ + 1e-9 >= nextTelemetrySecond_) {
        recordTelemetry();
        nextTelemetrySecond_ = static_cast<double>(
            static_cast<int>(timeSeconds_) + 1);
    }
}

void HuntSimulation::runFor(double durationSeconds, double tickSeconds) {
    double remaining = std::max(0.0, durationSeconds);
    while (remaining > 0.0 &&
           creature_.life != LifeState::Dead) {
        const double dt = std::min(tickSeconds, remaining);
        step(dt);
        remaining -= dt;
    }
}

const std::vector<TelemetrySample>& HuntSimulation::telemetry() const {
    return telemetry_;
}

void HuntSimulation::recordTelemetry() {
    const double bloodLost =
        creature_.maxBloodVolumeMl - creature_.bloodVolumeMl;
    const double lostPct =
        creature_.maxBloodVolumeMl > 0.0
            ? (bloodLost / creature_.maxBloodVolumeMl) * 100.0
            : 100.0;

    telemetry_.push_back({
        timeSeconds_,
        creature_.bloodVolumeMl,
        lostPct,
        creature_.consciousness,
        creature_.totalBleedRateMlPerSec(),
        creature_.mobility,
        creature_.life
    });
}

} // namespace tp
