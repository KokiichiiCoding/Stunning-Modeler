#include "engine/world/Wind.hpp"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace tp {

WindModel::WindModel(std::uint64_t seed, double initialDirectionRad,
                     double initialSpeedMps)
    : rng_(seed), directionRad_(initialDirectionRad),
      speedMps_(std::max(0.0, initialSpeedMps)) {}

void WindModel::update(double dtSeconds) {
    if (dtSeconds <= 0.0) return;

    // Re-roll drift targets on a coarse gust cadence rather than every
    // tick, so the wander rate is framerate/tick independent and the RNG
    // draw count is stable per simulated second.
    gustTimerS_ -= dtSeconds;
    while (gustTimerS_ <= 0.0) {
        gustTimerS_ += 2.0;
        directionRad_ += rng_.range(-0.15, 0.15);
        speedMps_ = std::clamp(speedMps_ + rng_.range(-0.5, 0.5), 0.3, 12.0);
    }

    const double twoPi = 2.0 * std::numbers::pi;
    directionRad_ = std::fmod(directionRad_, twoPi);
    if (directionRad_ < 0.0) directionRad_ += twoPi;
}

Vec3 WindModel::directionVector() const {
    return {std::cos(directionRad_), std::sin(directionRad_), 0.0};
}

Vec3 WindModel::velocityMps() const {
    return directionVector() * speedMps_;
}

} // namespace tp
