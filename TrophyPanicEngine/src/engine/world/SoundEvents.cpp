#include "engine/world/SoundEvents.hpp"

#include <algorithm>

namespace tp {

void SoundLog::emit(SoundCategory category, const Vec3& origin, double loudness,
                    double nowS, const std::string& sourceTag) {
    SoundEvent event;
    event.category = category;
    event.origin = origin;
    event.loudness = loudness;
    event.timeS = nowS;
    event.sourceTag = sourceTag;
    events_.push_back(std::move(event));
}

std::vector<const SoundEvent*> SoundLog::eventsSince(double sinceS) const {
    std::vector<const SoundEvent*> found;
    for (const auto& event : events_) {
        if (event.timeS > sinceS) {
            found.push_back(&event);
        }
    }
    return found;
}

double SoundLog::perceivedLoudness(const SoundEvent& event, const Vec3& listenerPos) {
    const Vec3 d{event.origin.x - listenerPos.x, event.origin.y - listenerPos.y,
                 event.origin.z - listenerPos.z};
    const double dist = std::max(1.0, d.length());
    return event.loudness / (dist * dist);
}

void SoundLog::expire(double nowS, double horizonS) {
    events_.erase(std::remove_if(events_.begin(), events_.end(),
                                 [&](const SoundEvent& e) {
                                     return nowS - e.timeS > horizonS;
                                 }),
                  events_.end());
}

const char* toString(SoundCategory c) {
    switch (c) {
        case SoundCategory::Gunshot:          return "Gunshot";
        case SoundCategory::Footstep:         return "Footstep";
        case SoundCategory::EquipmentImpact:  return "EquipmentImpact";
        case SoundCategory::AnimalCall:       return "AnimalCall";
        case SoundCategory::HunterCall:       return "HunterCall";
        case SoundCategory::ChickenSqueak:    return "ChickenSqueak";
        case SoundCategory::LeafBlower:       return "LeafBlower";
        case SoundCategory::VegetationRustle: return "VegetationRustle";
        case SoundCategory::BodyFall:         return "BodyFall";
        case SoundCategory::Splash:           return "Splash";
    }
    return "Unknown";
}

} // namespace tp
