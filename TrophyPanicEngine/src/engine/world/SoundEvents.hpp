#pragma once
#include "engine/math/Vec3.hpp"

#include <string>
#include <vector>

namespace tp {

// Authoritative world sounds. A gunshot is not a player audio effect — it
// is a simulation event with origin, loudness, and timestamp that animal
// hearing consumes. Presentation layers may ALSO play a sound, but this
// log is what perception reads.
enum class SoundCategory {
    Gunshot,
    Footstep,
    EquipmentImpact,
    AnimalCall,
    HunterCall,
    ChickenSqueak,
    LeafBlower,
    VegetationRustle,
    BodyFall,
    Splash
};

struct SoundEvent {
    SoundCategory category{SoundCategory::Footstep};
    Vec3 origin;
    double loudness{1.0}; // source intensity at 1 m; gunshot ~1000, footstep ~0.5
    double timeS{};
    std::string sourceTag; // "player", animal individual id, ...
};

class SoundLog {
public:
    void emit(SoundCategory category, const Vec3& origin, double loudness,
              double nowS, const std::string& sourceTag);

    // Events emitted after sinceS (exclusive of older ones).
    [[nodiscard]] std::vector<const SoundEvent*> eventsSince(double sinceS) const;

    // Inverse-square falloff with a floor; what a listener at listenerPos
    // receives before species hearing sensitivity is applied.
    [[nodiscard]] static double perceivedLoudness(const SoundEvent& event,
                                                  const Vec3& listenerPos);

    // Drop events older than horizonS to keep the log bounded.
    void expire(double nowS, double horizonS = 30.0);

    [[nodiscard]] const std::vector<SoundEvent>& events() const { return events_; }

private:
    std::vector<SoundEvent> events_;
};

// Standard source intensities (at 1 m) so emitters and tests agree.
// With inverse-square falloff and the animal hearing floor (~0.02), a
// rifle shot stays audible out to roughly 3.5 km; a squeeze of a rubber
// chicken carries ~200 m on a quiet day.
inline constexpr double kLoudnessGunshot = 2.5e5;
inline constexpr double kLoudnessChickenSqueak = 900.0;
inline constexpr double kLoudnessLeafBlower = 2500.0;
inline constexpr double kLoudnessEquipmentImpact = 150.0;
inline constexpr double kLoudnessHunterCall = 400.0;

[[nodiscard]] const char* toString(SoundCategory c);

} // namespace tp
