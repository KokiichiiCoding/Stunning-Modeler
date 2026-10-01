#include "engine/scoring/TrophyScore.hpp"

#include <algorithm>
#include <cmath>

namespace tp {

namespace {

bool isVitalTissue(TissueType t) {
    return t == TissueType::Lung || t == TissueType::Heart ||
           t == TissueType::Brain || t == TissueType::MajorVessel;
}

double computeShotQuality(const CreatureState& creature, int shotsFired) {
    if (creature.wounds.empty()) {
        return 0.0;
    }

    int vitalHits = 0;
    for (const auto& wound : creature.wounds) {
        const BodyPart* part = creature.findPart(wound.bodyPartId);
        if (part && isVitalTissue(part->tissue)) {
            ++vitalHits;
        }
    }

    const double vitalRatio =
        static_cast<double>(vitalHits) / static_cast<double>(creature.wounds.size());

    // Efficiency: did every shot fired actually connect and matter, or did
    // most of them miss / land on non-productive tissue? A single clean
    // shot scores 1.0 here; five shots producing one wound scores 0.2.
    const double shots = std::max(1, shotsFired);
    const double efficiency = std::min(
        1.0, static_cast<double>(creature.wounds.size()) / shots);

    return std::clamp((vitalRatio * 0.7 + efficiency * 0.3) * 100.0, 0.0, 100.0);
}

double computeTrophyIntegrity(const CreatureState& creature) {
    bool anyTrophyPart = false;
    double worst = 100.0;

    for (const auto& part : creature.bodyParts) {
        if (!part.trophyOrgan) continue;
        anyTrophyPart = true;

        double condition = 100.0;
        if (part.maxBoneIntegrity > 0.0) {
            condition = std::clamp(
                (part.boneIntegrity / part.maxBoneIntegrity) * 100.0, 0.0, 100.0);
        } else if (part.organIntegrity < 100.0) {
            condition = std::clamp(part.organIntegrity, 0.0, 100.0);
        }
        worst = std::min(worst, condition);
    }

    // A species with no defined trophy-relevant part (unlikely, but
    // possible for a data file that omits one) shouldn't be penalized for
    // a system that doesn't apply to it.
    return anyTrophyPart ? worst : 100.0;
}

double computeRecoveryQuality(double timeToIncapacitationSeconds) {
    const double t = timeToIncapacitationSeconds;
    if (t < 0.0) {
        return 0.0; // never went down within the observed window
    }
    if (t <= 5.0) {
        return 100.0; // instant — CNS/cardiac-style event
    }
    if (t <= 45.0) {
        // Linear 100 -> 70 across the "clean, expected" range.
        return 100.0 - (t - 5.0) / (45.0 - 5.0) * 30.0;
    }
    if (t <= 120.0) {
        // Linear 70 -> 30 across a marginal, prolonged recovery.
        return 70.0 - (t - 45.0) / (120.0 - 45.0) * 40.0;
    }
    return 20.0; // very prolonged; still recovered, but a poor hunt
}

std::string tierFor(double overall, bool recovered) {
    if (!recovered) return "No Recovery";
    if (overall >= 90.0) return "Platinum";
    if (overall >= 75.0) return "Gold";
    if (overall >= 50.0) return "Silver";
    if (overall >= 25.0) return "Bronze";
    return "Field Dressed Only";
}

} // namespace

TrophyScoreResult computeTrophyScore(
    const CreatureState& creature,
    const TrophyScoreInput& input) {

    TrophyScoreResult result;
    result.biologicalQuality = std::clamp(input.biologicalQualityPercent, 0.0, 100.0);
    result.shotQuality = computeShotQuality(creature, input.shotsFired);
    result.trophyIntegrity = computeTrophyIntegrity(creature);
    result.recoveryQuality = computeRecoveryQuality(input.timeToIncapacitationSeconds);
    result.recovered =
        creature.life != LifeState::Active && input.timeToIncapacitationSeconds >= 0.0;

    // First-pass weighting, not final balance (same caveat as the bleed
    // constants in Creature.cpp) — these should become tunable data once
    // there's a reason to differentiate them per contract type (e.g. a
    // "Trophy must remain Gold or better" contract might want different
    // weights than a meat-focused cull).
    if (result.recovered) {
        result.overall =
            result.biologicalQuality * 0.20 +
            result.shotQuality * 0.30 +
            result.trophyIntegrity * 0.25 +
            result.recoveryQuality * 0.25;
    } else {
        result.overall = 0.0;
    }

    result.tier = tierFor(result.overall, result.recovered);
    return result;
}

} // namespace tp
