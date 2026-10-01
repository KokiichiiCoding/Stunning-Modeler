#pragma once
#include "engine/core/Rng.hpp"
#include "engine/math/Vec3.hpp"

#include <cstdint>

namespace tp {

// World wind: a single direction/speed pair that drifts slowly and
// deterministically. Scent advection, lightweight projectiles, the player
// wind indicator, and animal smell perception all read from this one model
// so they can never disagree about which way the wind blows.
class WindModel {
public:
    explicit WindModel(std::uint64_t seed,
                       double initialDirectionRad = 0.0,
                       double initialSpeedMps = 3.0);

    void update(double dtSeconds);

    [[nodiscard]] double directionRad() const { return directionRad_; }
    [[nodiscard]] double speedMps() const { return speedMps_; }

    // Unit-plane vector the wind blows TOWARD (x, y ground plane, z = 0).
    [[nodiscard]] Vec3 directionVector() const;
    // Velocity = direction * speed; what a scent puff experiences.
    [[nodiscard]] Vec3 velocityMps() const;

private:
    Rng rng_;
    double directionRad_;
    double speedMps_;
    double gustTimerS_{0.0};
};

} // namespace tp
