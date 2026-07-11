#include "engine/ai/Behavior.hpp"

#include <algorithm>
#include <cmath>
#include <numbers>
#include <sstream>

namespace tp {

namespace {

constexpr double kPerceiveIntervalS = 0.1;  // ~10 Hz
constexpr double kDecideIntervalS = 0.2;    // ~5 Hz
constexpr double kAlertnessDecayPerS = 3.0;

// Stimulus-to-alertness gains. Vision is trusted most; a gunshot is an
// immediate full alarm regardless of species.
constexpr double kVisionGain = 45.0;
constexpr double kSoundGain = 30.0;
constexpr double kScentGain = 35.0;
constexpr double kGunshotAlarm = 80.0;

// Loudness (post-sensitivity) an animal starts reacting to.
constexpr double kHearingFloor = 0.02;

} // namespace

AnimalAgent::AnimalAgent(GeneratedAnimal identity, CreatureState physiology,
                         const SpeciesProfile& profile, Vec3 spawnPos)
    : identity_(std::move(identity)), creature_(std::move(physiology)),
      profile_(&profile),
      // Derive the behavior seed from the animal's identity seed so a
      // replayed (species, seed) animal also behaves identically.
      rng_(identity_.seed * 0x9E3779B97F4A7C15ull + 1),
      position_(spawnPos), staminaS_(identity_.maxStaminaS),
      tracks_(profile) {
    alertness_ = identity_.alertnessBaseline01 * 15.0;
}

void AnimalAgent::notifyShot(const Vec3& shotOriginPos, double nowS) {
    alertness_ = 100.0;
    memory_.hasThreat = true;
    memory_.lastThreatPos = shotOriginPos;
    memory_.lastThreatTimeS = nowS;
    memory_.lastGunshotTimeS = nowS;
    ++memory_.disturbanceCount;
}

void AnimalAgent::receiveAlarm(const Vec3& threatPos, double nowS) {
    alertness_ = std::min(100.0, alertness_ + 50.0);
    memory_.hasThreat = true;
    memory_.lastThreatPos = threatPos;
    memory_.lastThreatTimeS = nowS;
    ++memory_.disturbanceCount;
}

void propagateHerdAlarm(std::vector<AnimalAgent*>& agents, double nowS,
                        double alarmRadiusM) {
    const double r2 = alarmRadiusM * alarmRadiusM;
    for (AnimalAgent* alarmed : agents) {
        if (!alarmed || alarmed->alertState() != AlertState::Fleeing) continue;
        if (alarmed->profile().grouping != "herd") continue;
        for (AnimalAgent* other : agents) {
            if (!other || other == alarmed) continue;
            if (other->identity().speciesId != alarmed->identity().speciesId) continue;
            if (other->alertState() == AlertState::Fleeing ||
                other->alertState() == AlertState::Incapacitated) continue;
            const Vec3 d{other->position().x - alarmed->position().x,
                         other->position().y - alarmed->position().y, 0.0};
            if (d.lengthSquared() <= r2 && alarmed->memory().hasThreat) {
                other->receiveAlarm(alarmed->memory().lastThreatPos, nowS);
            }
        }
    }
}

void AnimalAgent::perceive(const WorldView& view) {
    recentStimuli_.clear();

    // --- Vision ---------------------------------------------------------
    const double playerCover01 =
        view.terrain->cellAtWorld(view.playerPos.x, view.playerPos.y).cover01;
    const bool keyedUp = alertState_ != AlertState::Calm;
    const double seen = visualDetection01(
        *profile_, position_, facingRad_, view.playerPos, view.playerSpeedMps,
        view.playerStance, playerCover01, keyedUp);
    if (seen > 0.05) {
        recentStimuli_.push_back(
            {StimulusKind::Visual, view.playerPos, seen, view.nowS});
        alertness_ += seen * kVisionGain * kPerceiveIntervalS * 10.0;
        memory_.hasThreat = true;
        memory_.lastThreatPos = view.playerPos;
        memory_.lastThreatTimeS = view.nowS;
    }

    // --- Hearing ----------------------------------------------------------
    for (const SoundEvent* event : view.sounds->eventsSince(lastSoundQueryS_)) {
        const double loud = heardLoudness(*profile_, *event, position_);
        if (loud < kHearingFloor) continue;

        double strength = std::clamp(loud / 2.0, 0.05, 1.0);
        if (event->category == SoundCategory::Gunshot) {
            alertness_ += kGunshotAlarm;
            strength = 1.0;
            memory_.lastGunshotTimeS = event->timeS;
        } else {
            alertness_ += strength * kSoundGain;
        }
        recentStimuli_.push_back(
            {StimulusKind::Sound, event->origin, strength, event->timeS});
        memory_.hasThreat = true;
        memory_.lastThreatPos = event->origin;
        memory_.lastThreatTimeS = event->timeS;
        ++memory_.disturbanceCount;
    }
    lastSoundQueryS_ = view.nowS;

    // --- Smell -------------------------------------------------------------
    // The scent field is wind-advected, so an animal upwind of the hunter
    // simply finds nothing to sample — no special-casing needed. The
    // stimulus places the threat upwind of the animal's nose, which is the
    // only direction information smell actually gives.
    const double smelled =
        smelledIntensity(*profile_, *view.scent, position_, "player");
    if (smelled > 0.0) {
        const Vec3 upwind = view.wind->directionVector() * -30.0;
        const Vec3 guess{position_.x + upwind.x, position_.y + upwind.y, 0.0};
        const double strength = std::clamp(smelled * 2.0, 0.1, 1.0);
        recentStimuli_.push_back({StimulusKind::Scent, guess, strength, view.nowS});
        alertness_ += strength * kScentGain;
        memory_.hasThreat = true;
        memory_.lastThreatPos = guess;
        memory_.lastThreatTimeS = view.nowS;
        memory_.lastScentTimeS = view.nowS;
    }

    alertness_ = std::clamp(alertness_, 0.0, 100.0);
}

void AnimalAgent::decide(const WorldView&) {
    // Physiology overrides everything: a downed animal makes no decisions.
    if (creature_.life != LifeState::Active ||
        creature_.mobility == MobilityState::Immobile) {
        alertState_ = AlertState::Incapacitated;
        goal_ = Goal::None;
        hasMoveTarget_ = false;
        return;
    }

    const bool wounded = !creature_.wounds.empty();
    const double threatDist = memory_.hasThreat
        ? Vec3{memory_.lastThreatPos.x - position_.x,
               memory_.lastThreatPos.y - position_.y, 0.0}.length()
        : 1e9;

    auto fleeFromThreat = [&] {
        alertState_ = AlertState::Fleeing;
        goal_ = Goal::Flee;
        Vec3 away = memory_.hasThreat
            ? Vec3{position_.x - memory_.lastThreatPos.x,
                   position_.y - memory_.lastThreatPos.y, 0.0}.normalized()
            : Vec3{1.0, 0.0, 0.0};
        // A little deterministic jitter so flight paths aren't laser-straight.
        const double jitter = rng_.range(-0.4, 0.4);
        const double c = std::cos(jitter), s = std::sin(jitter);
        away = {away.x * c - away.y * s, away.x * s + away.y * c, 0.0};
        moveTarget_ = {position_.x + away.x * 120.0, position_.y + away.y * 120.0, 0.0};
        hasMoveTarget_ = true;
    };

    auto chargeThreat = [&] {
        alertState_ = AlertState::Aggressive;
        goal_ = Goal::Charge;
        moveTarget_ = memory_.lastThreatPos;
        hasMoveTarget_ = true;
    };

    if (wounded) {
        // Injury-driven behavior, flavored by the species' wounded style.
        const double bloodLoss01 =
            creature_.maxBloodVolumeMl > 0.0
                ? 1.0 - creature_.bloodVolumeMl / creature_.maxBloodVolumeMl
                : 1.0;

        if (profile_->woundedStyle == "flee_circle_charge" &&
            threatDist < profile_->defensiveRadiusM) {
            // Cornered boar: turn and fight.
            chargeThreat();
            return;
        }
        if (profile_->woundedStyle == "defensive" &&
            threatDist < profile_->defensiveRadiusM * 1.5) {
            // Wounded bear with the threat pressing in — dangerous, but
            // only because the threat is actually close, not homing.
            chargeThreat();
            return;
        }

        // Exhausted or heavily bled animals bed down; a fading body cannot
        // sprint forever (this is where gut-shot animals are found bedded).
        const bool exhausted = staminaS_ <= 1.0;
        if (bloodLoss01 > 0.22 || creature_.consciousness < 55.0 || exhausted) {
            alertState_ = AlertState::Alert;
            goal_ = Goal::Bed;
            hasMoveTarget_ = false;
            // Bedding while a threat is on top of you doesn't hold: bump
            // back to fleeing if it closes within 15 m.
            if (threatDist < 15.0) fleeFromThreat();
            return;
        }

        fleeFromThreat();
        return;
    }

    // Unwounded ladder, thresholds scaled off the species fear threshold so
    // a skittish deer walks the whole ladder earlier than a confident bear.
    const double fear = profile_->fearThreshold;

    if (alertness_ >= profile_->aggressionThreshold &&
        threatDist < profile_->defensiveRadiusM) {
        chargeThreat();
        return;
    }

    if (alertness_ >= fear) {
        if (profile_->defensiveRadiusM > 0.0 && threatDist < profile_->defensiveRadiusM &&
            (identity_.temperament == Temperament::Bold ||
             identity_.temperament == Temperament::Ornery)) {
            alertState_ = AlertState::Defensive;
            goal_ = Goal::Watch;
            hasMoveTarget_ = false;
            return;
        }
        fleeFromThreat();
        return;
    }

    if (alertness_ >= fear * 0.66) {
        alertState_ = AlertState::Suspicious;
        goal_ = Goal::Watch;
        hasMoveTarget_ = false;
        if (memory_.hasThreat) {
            const Vec3 to{memory_.lastThreatPos.x - position_.x,
                          memory_.lastThreatPos.y - position_.y, 0.0};
            if (to.length() > 1e-6) facingRad_ = std::atan2(to.y, to.x);
        }
        return;
    }

    if (alertness_ >= fear * 0.33) {
        alertState_ = AlertState::Curious;
        if (memory_.hasThreat && rng_.rollChance(profile_->curiosity * 0.5)) {
            goal_ = Goal::Investigate;
            // Approach partway, never all the way in.
            moveTarget_ = {position_.x + (memory_.lastThreatPos.x - position_.x) * 0.4,
                           position_.y + (memory_.lastThreatPos.y - position_.y) * 0.4,
                           0.0};
            hasMoveTarget_ = true;
        } else {
            goal_ = Goal::Watch;
            hasMoveTarget_ = false;
        }
        return;
    }

    alertState_ = AlertState::Calm;
    goal_ = Goal::Wander;
    if (!hasMoveTarget_ || rng_.rollChance(0.08)) {
        const double angle = rng_.range(0.0, 2.0 * std::numbers::pi);
        const double dist = rng_.range(10.0, 40.0);
        moveTarget_ = {position_.x + std::cos(angle) * dist,
                       position_.y + std::sin(angle) * dist, 0.0};
        hasMoveTarget_ = true;
    }
}

double AnimalAgent::maxSpeedForState() const {
    // Intent...
    double intent = 0.0;
    switch (goal_) {
        case Goal::Flee:
        case Goal::Charge:      intent = profile_->runMps; break;
        case Goal::Investigate: intent = profile_->walkMps; break;
        case Goal::Wander:      intent = profile_->walkMps * 0.6; break;
        case Goal::Watch:
        case Goal::Bed:
        case Goal::None:        return 0.0;
    }

    // ...capped by what the body can still deliver.
    double cap = intent;
    switch (creature_.mobility) {
        case MobilityState::Full:     break;
        case MobilityState::Impaired: cap = std::min(cap, profile_->trotMps); break;
        case MobilityState::Limping:  cap = std::min(cap, profile_->trotMps * 0.5); break;
        case MobilityState::Crawling: cap = std::min(cap, profile_->walkMps * 0.35); break;
        case MobilityState::Immobile: return 0.0;
    }

    // Oxygen impairment (lung wounds) cuts sustainable pace.
    cap *= 1.0 - std::clamp(creature_.oxygenPenalty / 80.0, 0.0, 0.6);

    // Out of stamina: no more sprinting, only a laboured trot.
    if (staminaS_ <= 0.0) {
        cap = std::min(cap, profile_->trotMps * 0.8);
    }

    return cap;
}

void AnimalAgent::move(const WorldView& view, EvidenceMap& evidence, double dtSeconds) {
    double speed = 0.0;

    if (hasMoveTarget_ && alertState_ != AlertState::Incapacitated) {
        const Vec3 to{moveTarget_.x - position_.x, moveTarget_.y - position_.y, 0.0};
        const double dist = to.length();
        if (dist > 1.0) {
            const double terrainCost =
                view.terrain->cellAtWorld(position_.x, position_.y).traversalCost;
            speed = maxSpeedForState() / std::max(1.0, terrainCost * 0.7);
            const Vec3 dir = to.normalized();
            position_.x += dir.x * speed * dtSeconds;
            position_.y += dir.y * speed * dtSeconds;
            position_.z = view.terrain->heightAt(position_.x, position_.y);
            facingRad_ = std::atan2(dir.y, dir.x);
        } else {
            hasMoveTarget_ = goal_ == Goal::Wander ? false : hasMoveTarget_;
        }
    }
    currentSpeedMps_ = speed;

    // Stamina: drains above trot pace, recovers at rest/walk.
    if (speed > profile_->trotMps) {
        staminaS_ = std::max(0.0, staminaS_ - dtSeconds);
    } else if (speed < profile_->walkMps) {
        staminaS_ = std::min(identity_.maxStaminaS, staminaS_ + dtSeconds * 0.5);
    }

    // Evidence is a side effect of being a physical body in the world.
    tracks_.update(evidence, creature_, position_, view.nowS, dtSeconds);
    blood_.update(evidence, creature_, position_, speed > 0.05, view.nowS, dtSeconds);
}

void AnimalAgent::update(const WorldView& view, EvidenceMap& evidence, double dtSeconds) {
    if (dtSeconds <= 0.0) return;

    perceiveAccumulatorS_ += dtSeconds;
    while (perceiveAccumulatorS_ >= kPerceiveIntervalS) {
        perceiveAccumulatorS_ -= kPerceiveIntervalS;
        if (creature_.life == LifeState::Active) {
            perceive(view);
        }
        // Alertness relaxes when nothing is feeding it.
        if (recentStimuli_.empty()) {
            alertness_ = std::max(0.0, alertness_ - kAlertnessDecayPerS * kPerceiveIntervalS);
        }
    }

    decideAccumulatorS_ += dtSeconds;
    while (decideAccumulatorS_ >= kDecideIntervalS) {
        decideAccumulatorS_ -= kDecideIntervalS;
        decide(view);
    }

    move(view, evidence, dtSeconds);
    stepPhysiology(creature_, dtSeconds);
}

std::string AnimalAgent::debugString() const {
    std::ostringstream out;
    out << identity_.individualId << " [" << toString(alertState_) << "/"
        << toString(goal_) << "]"
        << " alert=" << static_cast<int>(alertness_)
        << " pos=(" << static_cast<int>(position_.x) << ","
        << static_cast<int>(position_.y) << ")"
        << " v=" << currentSpeedMps_ << "m/s"
        << " stam=" << static_cast<int>(staminaS_) << "s"
        << " | blood=" << static_cast<int>(creature_.bloodVolumeMl) << "ml"
        << " consc=" << static_cast<int>(creature_.consciousness) << "%"
        << " mob=" << tp::toString(creature_.mobility)
        << " life=" << tp::toString(creature_.life);
    if (memory_.hasThreat) {
        out << " | threat@(" << static_cast<int>(memory_.lastThreatPos.x) << ","
            << static_cast<int>(memory_.lastThreatPos.y) << ")";
    }
    for (const auto& s : recentStimuli_) {
        out << " {"
            << (s.kind == StimulusKind::Visual ? "see"
                : s.kind == StimulusKind::Sound ? "hear" : "smell")
            << " " << s.strength01 << "}";
    }
    return out.str();
}

const char* toString(AlertState s) {
    switch (s) {
        case AlertState::Calm:          return "Calm";
        case AlertState::Curious:       return "Curious";
        case AlertState::Suspicious:    return "Suspicious";
        case AlertState::Alert:         return "Alert";
        case AlertState::Fleeing:       return "Fleeing";
        case AlertState::Defensive:     return "Defensive";
        case AlertState::Aggressive:    return "Aggressive";
        case AlertState::Incapacitated: return "Incapacitated";
    }
    return "Unknown";
}

const char* toString(Goal g) {
    switch (g) {
        case Goal::Wander:      return "Wander";
        case Goal::Investigate: return "Investigate";
        case Goal::Watch:       return "Watch";
        case Goal::Flee:        return "Flee";
        case Goal::Bed:         return "Bed";
        case Goal::Charge:      return "Charge";
        case Goal::None:        return "None";
    }
    return "Unknown";
}

} // namespace tp
