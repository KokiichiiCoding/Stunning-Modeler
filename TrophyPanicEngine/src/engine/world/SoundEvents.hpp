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

[[nodiscard]] const char* toString(SoundCategory c);

} // namespace tp
