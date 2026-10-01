#pragma once
#include "engine/math/Vec3.hpp"
#include "engine/world/Wind.hpp"

#include <string>
#include <vector>

namespace tp {

// Practical prototype scent model: emitters shed discrete puffs that the
// wind advects downwind while they spread and decay. Not CFD — but it gets
// the one rule hunting lives by exactly right: your scent goes where the
// wind goes, so an animal directly upwind of you cannot smell you.
struct ScentPuff {
    Vec3 position;
    double strength{1.0};   // dimensionless source intensity, decays over time
    double radiusM{2.0};    // spreads as it travels
    double bornAtS{};
    std::string sourceTag;  // "player", "carcass", "blood", ...
};

class ScentField {
public:
    void emit(const Vec3& position, double strength, const std::string& sourceTag,
              double nowS);

    // Advect by wind, grow, decay, cull. Call at the ecology cadence
    // (1-2 Hz is plenty); dt-scaled so cadence doesn't change behavior.
    void update(double dtSeconds, const WindModel& wind);

    // Total scent intensity perceivable at a world position (sum over
    // puffs, distance-attenuated within each puff's radius), optionally
    // filtered by source tag.
    [[nodiscard]] double sample(const Vec3& position,
                                const std::string& sourceTagFilter = "") const;

    [[nodiscard]] const std::vector<ScentPuff>& puffs() const { return puffs_; }

private:
    std::vector<ScentPuff> puffs_;
};

// Standard source strengths so systems agree on magnitudes. A wounded,
// bleeding hunter or animal is much easier to smell; carcasses dominate.
[[nodiscard]] double scentStrengthForBody(double bleedRateMlPerSec);
inline constexpr double kScentStrengthPlayer = 1.0;
inline constexpr double kScentStrengthCarcass = 3.0;

} // namespace tp
