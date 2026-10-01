#include "engine/biology/Creature.hpp"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace tp {

BodyPart* CreatureState::findPart(const std::string& id) {
    for (auto& part : bodyParts) {
        if (part.id == id) {
            return &part;
        }
    }
    return nullptr;
}

const BodyPart* CreatureState::findPart(const std::string& id) const {
    for (const auto& part : bodyParts) {
        if (part.id == id) {
            return &part;
        }
    }
    return nullptr;
}

double CreatureState::totalBleedRateMlPerSec() const {
    double total = 0.0;
    for (const auto& wound : wounds) {
        if (wound.active) {
            total += wound.bleedRateMlPerSec;
        }
    }
    return total;
}

std::size_t CreatureState::failedLoadBearingLimbs() const {
    std::size_t failed = 0;
    for (const auto& part : bodyParts) {
        if (part.loadBearing && part.maxBoneIntegrity > 0.0 &&
            part.boneIntegrity <= 0.0) {
            ++failed;
        }
    }
    return failed;
}

CreatureState makePrototypeDeer() {
    CreatureState deer;
    deer.species = "Prototype Ridge Deer";
    deer.maxBloodVolumeMl = 5000.0;
    deer.bloodVolumeMl = deer.maxBloodVolumeMl;

    deer.bodyParts = {
        {"google_eye_orbital", TissueType::Brain, 50.0, 50.0, false, true, 100.0, {}},
        {"gait_column_front_left", TissueType::DenseBone, 40.0, 40.0, true, false, 100.0, {}},
        {"gait_column_front_right", TissueType::DenseBone, 40.0, 40.0, true, false, 100.0, {}},
        {"gait_column_rear_left", TissueType::DenseBone, 45.0, 45.0, true, false, 100.0, {}},
        {"gait_column_rear_right", TissueType::DenseBone, 45.0, 45.0, true, false, 100.0, {}},
        {"primary_thorax_left", TissueType::Lung, 0.0, 0.0, false, false, 100.0, {}},
        {"primary_thorax_right", TissueType::Lung, 0.0, 0.0, false, false, 100.0, {}},
        {"core_pump_cavity", TissueType::Heart, 0.0, 0.0, false, false, 100.0, {}},
        {"gait_column_neck", TissueType::MajorVessel, 0.0, 0.0, false, false, 100.0, {}},
        {"spine_thoracic", TissueType::DenseBone, 30.0, 30.0, false, false, 100.0, {}},
        {"wobble_rump", TissueType::LiverGut, 0.0, 0.0, false, false, 100.0, {}}
    };

    return deer;
}

// Tuned for gameplay pacing rather than literal real-time exsanguination:
// a solid single-lung hit should read as "down within roughly half a minute,"
// not "down within five minutes." Major vessel / heart hits bleed fast AND
// (see applyImpact) can trigger an independent short cardiac-event timer.
static double bleedScaleFor(TissueType tissue) {
    switch (tissue) {
        case TissueType::Lung:        return 0.085;
        case TissueType::Heart:       return 0.150;
        case TissueType::MajorVessel: return 0.150;
        case TissueType::LiverGut:    return 0.010;
        case TissueType::Brain:       return 0.010;
        case TissueType::DenseBone:   return 0.002;
        case TissueType::Muscle:      return 0.0007;
    }
    return 0.0;
}

static double painShockFor(TissueType tissue, const ImpactResult& impact) {
    double shock = impact.bluntShock;

    switch (tissue) {
        case TissueType::LiverGut:
            shock += 45.0;
            break;
        case TissueType::DenseBone:
            shock += 15.0;
            break;
        case TissueType::Brain:
            shock += 100.0;
            break;
        case TissueType::Heart:
        case TissueType::MajorVessel:
            shock += 20.0;
            break;
        default:
            break;
    }

    return shock;
}

HitResolution applyImpact(
    CreatureState& creature,
    const std::string& bodyPartId,
    const ProjectileSpec& projectile,
    const ImpactInput& input) {

    HitResolution resolution;
    BodyPart* part = creature.findPart(bodyPartId);
    if (!part) {
        return resolution;
    }

    resolution.validBodyPart = true;

    Wound wound;
    wound.bodyPartId = part->id;

    if (!part->layers.empty()) {
        // --- Layered traversal path -------------------------------------
        const LayeredImpactResult layered =
            resolveLayeredImpact(projectile, input, part->layers);

        resolution.impact = layered.baseline;
        wound.exitWound = layered.exitWound;

        const double radiusCm = (layered.baseline.woundDiameterM * 100.0) * 0.5;
        wound.permanentCavityCm3 =
            std::numbers::pi * radiusCm * radiusCm * layered.penetrationAchievedCm;

        if (layered.reachedOrganLayer) {
            const double effectiveEnergyJ =
                layered.baseline.impactEnergyJ * layered.organEntryEnergyFractionJ;

            wound.bleedRateMlPerSec = effectiveEnergyJ * bleedScaleFor(part->tissue);
            if (layered.exitWound) {
                // An entry AND exit channel bleeds more than a single
                // pocketed wound.
                wound.bleedRateMlPerSec *= 1.15;
            }

            wound.painShock = painShockFor(part->tissue, layered.baseline);

            const double effectiveTransferredEnergyJ =
                layered.baseline.transferredEnergyJ * layered.organEntryEnergyFractionJ;
            resolution.impact.transferredEnergyJ = effectiveTransferredEnergyJ;

            const double organDamage =
                std::clamp(wound.permanentCavityCm3 * 0.8, 0.0, 100.0);
            part->organIntegrity = std::max(0.0, part->organIntegrity - organDamage);
        } else {
            // Stopped short of the organ layer (e.g. absorbed by bone).
            wound.bleedRateMlPerSec =
                layered.baseline.impactEnergyJ * bleedScaleFor(TissueType::Muscle) * 0.25;
            wound.painShock = painShockFor(
                layered.stoppedInBoneLayer ? TissueType::DenseBone : TissueType::Muscle,
                layered.baseline);
            // Nothing reached the organ, so no organ-integrity loss and no
            // brain/cardiac fast-path should fire; zero this out so the
            // shared tail below doesn't misfire on a stopped, non-organ hit.
            resolution.impact.transferredEnergyJ = 0.0;
        }
    } else {
        // --- Legacy single-resistance path (unchanged) ------------------
        ImpactInput adjusted = input;
        adjusted.denseBone =
            adjusted.denseBone || part->tissue == TissueType::DenseBone;

        resolution.impact = resolveImpact(projectile, adjusted);

        wound.permanentCavityCm3 =
            resolution.impact.permanentCavityM3 * 1'000'000.0;

        if (resolution.impact.penetrates) {
            wound.bleedRateMlPerSec =
                resolution.impact.impactEnergyJ * bleedScaleFor(part->tissue);
        } else {
            wound.bleedRateMlPerSec =
                resolution.impact.impactEnergyJ * bleedScaleFor(TissueType::Muscle) * 0.25;
        }

        wound.painShock = painShockFor(part->tissue, resolution.impact);

        if (part->maxBoneIntegrity > 0.0) {
            const double fragmentMultiplier = resolution.impact.fragments ? 1.5 : 1.0;
            wound.boneDamage =
                resolution.impact.transferredEnergyJ *
                0.03 *
                fragmentMultiplier;

            part->boneIntegrity = std::max(
                0.0, part->boneIntegrity - wound.boneDamage);
        }

        const double organDamage =
            std::clamp(wound.permanentCavityCm3 * 0.8, 0.0, 100.0);
        part->organIntegrity = std::max(0.0, part->organIntegrity - organDamage);
    }

    creature.accumulatedPainShock += wound.painShock;
    creature.wounds.push_back(wound);
    resolution.wound = wound;

    if (part->tissue == TissueType::Brain &&
        resolution.impact.transferredEnergyJ > 80.0) {
        creature.consciousness = 0.0;
        creature.life = LifeState::Down;
    }

    if ((part->tissue == TissueType::Heart ||
         part->tissue == TissueType::MajorVessel) &&
        resolution.impact.transferredEnergyJ > 150.0 &&
        creature.cardiacEventTimerS < 0.0) {
        // Cardiac/major-vessel trauma is lethal on a short, mostly-fixed
        // timer rather than purely riding the general bleed-out curve.
        // Heart shots ~3-6s, major-vessel slightly longer.
        const double base = part->tissue == TissueType::Heart ? 3.0 : 5.0;
        creature.cardiacEventTimerS = base;
    }

    return resolution;
}

static MobilityState mobilityFromFailedLimbs(std::size_t failed) {
    switch (failed) {
        case 0: return MobilityState::Full;
        case 1: return MobilityState::Limping;
        case 2: return MobilityState::Crawling;
        default: return MobilityState::Immobile;
    }
}

void stepPhysiology(CreatureState& creature, double deltaSeconds) {
    if (creature.life == LifeState::Dead || deltaSeconds <= 0.0) {
        return;
    }

    if (creature.cardiacEventTimerS >= 0.0) {
        creature.cardiacEventTimerS -= deltaSeconds;
        if (creature.cardiacEventTimerS <= 0.0) {
            creature.consciousness = 0.0;
            creature.mobility = MobilityState::Immobile;
            creature.life = LifeState::Down;
        }
    }

    // Blood volume keeps draining regardless of consciousness state — a
    // downed animal that's still bleeding will eventually cross the Dead
    // threshold below. What must NOT happen is the general
    // consciousness/mobility formula recomputing upward once the animal
    // has already gone Down (from cardiac arrest OR from blood loss);
    // without the `life == Active` guard further down, a cardiac-downed
    // animal would appear to "wake back up" for a few ticks while blood
    // loss alone hadn't yet reached the unconsciousness threshold.
    const double bleed = creature.totalBleedRateMlPerSec();
    creature.bloodVolumeMl = std::max(
        0.0, creature.bloodVolumeMl - bleed * deltaSeconds);

    const double bloodLost = creature.maxBloodVolumeMl - creature.bloodVolumeMl;
    const double lossFraction =
        creature.maxBloodVolumeMl > 0.0
            ? bloodLost / creature.maxBloodVolumeMl
            : 1.0;

    std::size_t lungWounds = 0;
    bool heartOrMajorVessel = false;

    for (const auto& wound : creature.wounds) {
        const BodyPart* part = creature.findPart(wound.bodyPartId);
        if (!part) {
            continue;
        }

        if (part->tissue == TissueType::Lung && wound.active) {
            ++lungWounds;
        }
        if ((part->tissue == TissueType::Heart ||
             part->tissue == TissueType::MajorVessel) &&
            wound.active) {
            heartOrMajorVessel = true;
        }
    }

    creature.oxygenPenalty = std::min(40.0, static_cast<double>(lungWounds) * 12.0);

    if (creature.life == LifeState::Active) {
        const double bloodPenalty = lossFraction * 120.0;
        const double shockPenalty = creature.accumulatedPainShock * 0.18;
        const double vascularPenalty = heartOrMajorVessel ? 12.0 : 0.0;

        creature.consciousness = std::clamp(
            100.0 - bloodPenalty - shockPenalty -
            creature.oxygenPenalty - vascularPenalty,
            0.0,
            100.0);

        creature.mobility = mobilityFromFailedLimbs(
            creature.failedLoadBearingLimbs());

        if (creature.mobility == MobilityState::Full) {
            if (creature.consciousness < 55.0) {
                creature.mobility = MobilityState::Impaired;
            }
            if (creature.consciousness < 25.0) {
                creature.mobility = MobilityState::Crawling;
            }
        }

        if (creature.consciousness <= 0.0) {
            creature.life = LifeState::Down;
        }
    }

    if (creature.bloodVolumeMl <= creature.maxBloodVolumeMl * 0.10) {
        creature.life = LifeState::Dead;
        creature.consciousness = 0.0;
        creature.mobility = MobilityState::Immobile;
    }
}

const char* toString(MobilityState state) {
    switch (state) {
        case MobilityState::Full:     return "Full";
        case MobilityState::Impaired: return "Impaired";
        case MobilityState::Limping:  return "Limping";
        case MobilityState::Crawling: return "Crawling";
        case MobilityState::Immobile: return "Immobile";
    }
    return "Unknown";
}

const char* toString(LifeState state) {
    switch (state) {
        case LifeState::Active: return "Active";
        case LifeState::Down:   return "Down";
        case LifeState::Dead:   return "Dead";
    }
    return "Unknown";
}

} // namespace tp
