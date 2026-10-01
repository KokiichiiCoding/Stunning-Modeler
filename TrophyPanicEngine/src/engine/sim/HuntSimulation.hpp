#pragma once
#include "engine/biology/Creature.hpp"

#include <string>
#include <vector>

namespace tp {

struct TelemetrySample {
    double timeSeconds{};
    double bloodVolumeMl{};
    double bloodLostPercent{};
    double consciousness{};
    double bleedRateMlPerSec{};
    MobilityState mobility{MobilityState::Full};
    LifeState life{LifeState::Active};
};

class HuntSimulation {
public:
    explicit HuntSimulation(CreatureState creature);

    [[nodiscard]] CreatureState& creature();
    [[nodiscard]] const CreatureState& creature() const;

    HitResolution fire(
        const std::string& bodyPartId,
        const ProjectileSpec& projectile,
        const ImpactInput& impact);

    void step(double deltaSeconds);
    void runFor(double durationSeconds, double tickSeconds = 1.0 / 60.0);

    [[nodiscard]] const std::vector<TelemetrySample>& telemetry() const;

    // Hunt-level stats needed for trophy scoring. Not derivable from a
    // single CreatureState snapshot, so HuntSimulation (which owns the
    // whole timeline) tracks them directly.
    [[nodiscard]] int shotsFired() const { return shotsFired_; }
    // Seconds from simulation start to the first tick where life left
    // Active, or -1.0 if the creature never went Down/Dead in the
    // simulated window.
    [[nodiscard]] double timeToIncapacitationSeconds() const { return timeToIncapacitationSeconds_; }

private:
    void recordTelemetry();

    CreatureState creature_;
    double timeSeconds_{};
    double nextTelemetrySecond_{};
    std::vector<TelemetrySample> telemetry_;
    int shotsFired_{0};
    double timeToIncapacitationSeconds_{-1.0};
};

} // namespace tp
