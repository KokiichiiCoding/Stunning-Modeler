#include "engine/world/Scent.hpp"

#include <algorithm>
#include <cmath>

namespace tp {

void ScentField::emit(const Vec3& position, double strength,
                      const std::string& sourceTag, double nowS) {
    if (strength <= 0.0) return;
    ScentPuff puff;
    puff.position = position;
    puff.strength = strength;
    puff.radiusM = 2.0;
    puff.bornAtS = nowS;
    puff.sourceTag = sourceTag;
    puffs_.push_back(std::move(puff));
}

void ScentField::update(double dtSeconds, const WindModel& wind) {
    if (dtSeconds <= 0.0) return;

    const Vec3 drift = wind.velocityMps() * dtSeconds;
    const double decayPerSecond = 0.045; // ~15s half-life
    const double spreadMps = 0.6;

    for (auto& puff : puffs_) {
        puff.position = puff.position + drift;
        puff.radiusM += spreadMps * dtSeconds;
        puff.strength *= std::exp(-decayPerSecond * dtSeconds);
    }

    puffs_.erase(std::remove_if(puffs_.begin(), puffs_.end(),
                                [](const ScentPuff& p) { return p.strength < 0.01; }),
                 puffs_.end());
}

double ScentField::sample(const Vec3& position,
                          const std::string& sourceTagFilter) const {
    double total = 0.0;
    for (const auto& puff : puffs_) {
        if (!sourceTagFilter.empty() && puff.sourceTag != sourceTagFilter) continue;
        const Vec3 d{position.x - puff.position.x, position.y - puff.position.y, 0.0};
        const double dist = d.length();
        if (dist >= puff.radiusM) continue;
        // Linear falloff inside the puff; strength dilutes as it spreads.
        const double dilution = 2.0 / std::max(2.0, puff.radiusM);
        total += puff.strength * dilution * (1.0 - dist / puff.radiusM);
    }
    return total;
}

double scentStrengthForBody(double bleedRateMlPerSec) {
    // Blood makes a body dramatically easier to wind: +1 strength per
    // 25 ml/s of open bleeding on top of the baseline body odor.
    return 1.0 + bleedRateMlPerSec / 25.0;
}

} // namespace tp
