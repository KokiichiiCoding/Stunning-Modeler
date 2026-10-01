#include "engine/world/Evidence.hpp"

#include <algorithm>
#include <cmath>

namespace tp {

void EvidenceMap::add(Clue clue) {
    clues_.push_back(std::move(clue));
}

double EvidenceMap::readability(const Clue& clue, double nowS, SurfaceType surface,
                                double rainIntensity01) {
    const double age = std::max(0.0, nowS - clue.createdAtS);

    // Half-life in seconds, by clue type and surface. Values are gameplay
    // pacing (a hunt lasts tens of minutes), not literal forensics.
    double halfLifeS = 600.0;
    switch (clue.kind) {
        case ClueKind::Footprint:
            switch (surface) {
                case SurfaceType::Mud:   halfLifeS = 1800.0; break;
                case SurfaceType::Soil:  halfLifeS = 900.0;  break;
                case SurfaceType::Grass: halfLifeS = 420.0;  break;
                case SurfaceType::Rock:  halfLifeS = 90.0;   break;
                case SurfaceType::Water: halfLifeS = 5.0;    break;
            }
            break;
        case ClueKind::BloodDrop:
        case ClueKind::BloodSmear:
            halfLifeS = 1200.0;
            if (surface == SurfaceType::Water) halfLifeS = 8.0;
            break;
        case ClueKind::BloodPool:
            halfLifeS = 3600.0;
            break;
        case ClueKind::Droppings:
        case ClueKind::FeedingSign:
        case ClueKind::Bedding:
            halfLifeS = 7200.0;
            break;
        case ClueKind::Hair:
        case ClueKind::DisturbedVegetation:
            halfLifeS = 2400.0;
            break;
        case ClueKind::Carcass:
            halfLifeS = 100000.0;
            break;
        case ClueKind::CallHeard:
            halfLifeS = 30.0; // a heard call is only "evidence" briefly
            break;
    }

    // Rain accelerates decay, hitting blood hardest.
    if (rainIntensity01 > 0.0) {
        const bool blood = clue.kind == ClueKind::BloodDrop ||
                           clue.kind == ClueKind::BloodSmear ||
                           clue.kind == ClueKind::BloodPool;
        const double rainFactor = blood ? 8.0 : 3.0;
        halfLifeS /= 1.0 + rainIntensity01 * rainFactor;
    }

    return std::clamp(clue.baseIntensity01 * std::pow(0.5, age / halfLifeS), 0.0, 1.0);
}

std::vector<const Clue*> EvidenceMap::queryNearby(
    const Vec3& pos, double radiusM, double nowS, const TerrainGrid& terrain,
    double minReadability, double rainIntensity01) const {
    std::vector<const Clue*> found;
    const double r2 = radiusM * radiusM;
    for (const auto& clue : clues_) {
        const Vec3 d{clue.position.x - pos.x, clue.position.y - pos.y, 0.0};
        if (d.lengthSquared() > r2) continue;
        const SurfaceType surface =
            terrain.cellAtWorld(clue.position.x, clue.position.y).surface;
        if (readability(clue, nowS, surface, rainIntensity01) >= minReadability) {
            found.push_back(&clue);
        }
    }
    return found;
}

Gait gaitFor(const CreatureState& creature, double speedMps,
             const SpeciesProfile& profile) {
    if (creature.mobility == MobilityState::Crawling ||
        creature.mobility == MobilityState::Immobile) {
        return Gait::Crawl;
    }
    if (creature.mobility == MobilityState::Limping) {
        return Gait::Limp;
    }
    if (speedMps > (profile.trotMps + profile.runMps) * 0.5) return Gait::Run;
    if (speedMps > (profile.walkMps + profile.trotMps) * 0.5) return Gait::Trot;
    return Gait::Walk;
}

void TrackEmitter::update(EvidenceMap& evidence, const CreatureState& creature,
                          const Vec3& position, double nowS, double dtSeconds) {
    if (!hasLastPosition_) {
        lastPosition_ = position;
        hasLastPosition_ = true;
        return;
    }

    const Vec3 moved{position.x - lastPosition_.x, position.y - lastPosition_.y, 0.0};
    const double movedM = moved.length();
    lastPosition_ = position;
    if (movedM <= 1e-9 || dtSeconds <= 0.0) return;

    const double speedMps = movedM / dtSeconds;
    const Gait gait = gaitFor(creature, speedMps, *profile_);

    // Stride stretches when running and shortens when limping or crawling —
    // this is the physical basis of "reading" a track line.
    double strideM = profile_->trackStrideM;
    switch (gait) {
        case Gait::Run:   strideM *= 1.8; break;
        case Gait::Trot:  strideM *= 1.3; break;
        case Gait::Walk:  break;
        case Gait::Limp:  strideM *= 0.6; break;
        case Gait::Crawl: strideM *= 0.35; break;
    }

    const bool injured = gait == Gait::Limp || gait == Gait::Crawl;

    distanceSinceLastPrintM_ += movedM;
    while (distanceSinceLastPrintM_ >= strideM) {
        distanceSinceLastPrintM_ -= strideM;

        Clue print;
        print.kind = ClueKind::Footprint;
        print.position = position;
        print.direction = moved.normalized();
        print.createdAtS = nowS;
        print.speciesId = creature.species;
        print.gait = gait;
        print.printSizeCm = profile_->trackPrintSizeCm;
        print.strideM = strideM;
        print.injuredGait = injured;
        // Heavier gaits press deeper and read better when fresh.
        print.baseIntensity01 = gait == Gait::Run ? 1.0 : (injured ? 0.9 : 0.75);
        evidence.add(std::move(print));
    }
}

void BloodEvidenceEmitter::update(EvidenceMap& evidence, const CreatureState& creature,
                                  const Vec3& position, bool moving, double nowS,
                                  double dtSeconds) {
    const double bleedMlPerS = creature.totalBleedRateMlPerSec();
    if (bleedMlPerS <= 0.0 || dtSeconds <= 0.0) return;

    bool anyExitWound = false;
    for (const auto& wound : creature.wounds) {
        if (wound.active && wound.exitWound) anyExitWound = true;
    }

    // Only a fraction of lost blood reaches the ground; an exit channel
    // roughly doubles external evidence. The rest pools internally.
    const double externalFraction = anyExitWound ? 0.30 : 0.15;
    bloodAccumulatorMl_ += bleedMlPerS * externalFraction * dtSeconds;

    if (!moving) {
        // Bedded/stationary and bleeding: a pool forms once enough blood
        // has accumulated in one place.
        if (bloodAccumulatorMl_ >= 30.0) {
            Clue pool;
            pool.kind = ClueKind::BloodPool;
            pool.position = position;
            pool.createdAtS = nowS;
            pool.speciesId = creature.species;
            pool.baseIntensity01 = 1.0;
            evidence.add(std::move(pool));
            bloodAccumulatorMl_ = 0.0;
        }
        return;
    }

    // Moving: shed drops every few ml. Severe bleeds read stronger and
    // occasionally smear.
    const double mlPerDrop = 4.0;
    while (bloodAccumulatorMl_ >= mlPerDrop) {
        bloodAccumulatorMl_ -= mlPerDrop;

        Clue drop;
        drop.kind = bleedMlPerS > 60.0 ? ClueKind::BloodSmear : ClueKind::BloodDrop;
        drop.position = position;
        drop.createdAtS = nowS;
        drop.speciesId = creature.species;
        drop.baseIntensity01 = std::clamp(0.4 + bleedMlPerS / 100.0, 0.4, 1.0);
        evidence.add(std::move(drop));
    }
}

const char* toString(ClueKind k) {
    switch (k) {
        case ClueKind::Footprint:           return "Footprint";
        case ClueKind::BloodDrop:           return "BloodDrop";
        case ClueKind::BloodSmear:          return "BloodSmear";
        case ClueKind::BloodPool:           return "BloodPool";
        case ClueKind::Droppings:           return "Droppings";
        case ClueKind::Bedding:             return "Bedding";
        case ClueKind::Hair:                return "Hair";
        case ClueKind::DisturbedVegetation: return "DisturbedVegetation";
        case ClueKind::FeedingSign:         return "FeedingSign";
        case ClueKind::Carcass:             return "Carcass";
        case ClueKind::CallHeard:           return "CallHeard";
    }
    return "Unknown";
}

const char* toString(Gait g) {
    switch (g) {
        case Gait::Walk:  return "Walk";
        case Gait::Trot:  return "Trot";
        case Gait::Run:   return "Run";
        case Gait::Limp:  return "Limp";
        case Gait::Crawl: return "Crawl";
    }
    return "Unknown";
}

} // namespace tp
