#include "engine/game/HuntLoop.hpp"

#include "engine/ai/Perception.hpp"

#include <algorithm>
#include <cmath>
#include <numbers>
#include <sstream>

namespace tp {

namespace {

constexpr double kWalkMps = 1.5;
constexpr double kCrouchMps = 0.75;
constexpr double kProneMps = 0.4;
constexpr double kMaxRifleRangeM = 150.0;  // confident rifle shot envelope
constexpr double kFollowUpRangeM = 120.0;
constexpr double kDefensiveRangeM = 12.0;
constexpr double kClaimRangeM = 4.0;
constexpr double kSpotRangeM = 220.0; // binocular-assisted spotting
constexpr double kShotCooldownS = 4.0;     // bolt cycle + re-settle

ZoneType zoneFromRegion(const std::string& region) {
    if (region == "camp") return ZoneType::Camp;
    if (region == "forest") return ZoneType::Forest;
    if (region == "meadow") return ZoneType::Meadow;
    if (region == "creek") return ZoneType::Creek;
    if (region == "rocky_slope") return ZoneType::RockySlope;
    if (region == "dense_cover") return ZoneType::DenseCover;
    if (region == "extraction") return ZoneType::Extraction;
    return ZoneType::Meadow; // "any" and unknowns default to the open ground
}

double planarDistance(const Vec3& a, const Vec3& b) {
    const Vec3 d{a.x - b.x, a.y - b.y, 0.0};
    return d.length();
}

} // namespace

HuntLoopSim::HuntLoopSim(const GameDataRegistry& registry, Contract contract,
                         std::uint64_t animalSeedOverride)
    : registry_(&registry), contract_(std::move(contract)),
      terrain_(TerrainGrid::generate(contract_.worldSeed)),
      wind_(contract_.worldSeed ^ 0x5DEECE66Dull, 0.0, 3.5) {

    const std::uint64_t animalSeed =
        animalSeedOverride != 0 ? animalSeedOverride : contract_.animalSeed;

    const SpeciesProfile& profile = registry.speciesProfile(contract_.speciesId);
    GeneratedAnimal generated = generateAnimal(profile, animalSeed);
    CreatureState creature = instantiateGeneratedAnimal(registry, generated);

    // The animal starts in the contract's reported region, offset
    // deterministically off-center so it isn't standing on the hint marker.
    regionHint_ = terrain_.zoneCenter(zoneFromRegion(contract_.region));
    Rng spawnRng(animalSeed ^ contract_.worldSeed);
    const double spawnAngle = spawnRng.range(0.0, 2.0 * std::numbers::pi);
    const double spawnDist = spawnRng.range(20.0, 60.0);
    Vec3 animalSpawn{regionHint_.x + std::cos(spawnAngle) * spawnDist,
                     regionHint_.y + std::sin(spawnAngle) * spawnDist, 0.0};
    animalSpawn.x = std::clamp(animalSpawn.x, 5.0, terrain_.worldWidthM() - 5.0);
    animalSpawn.y = std::clamp(animalSpawn.y, 5.0, terrain_.worldHeightM() - 5.0);
    animalSpawn.z = terrain_.heightAt(animalSpawn.x, animalSpawn.y);

    result_.animal = generated;
    animal_ = std::make_unique<AnimalAgent>(std::move(generated), std::move(creature),
                                            profile, animalSpawn);

    hunterPos_ = terrain_.zoneCenter(ZoneType::Camp);
    extractionPos_ = terrain_.zoneCenter(ZoneType::Extraction);

    for (const auto& itemId : contract_.allowedEquipment) {
        const ItemSpec& item = registry.item(itemId);
        if ((item.kind == "rifle" || item.kind == "bow") && !item.projectileId.empty()) {
            hasWeapon_ = true;
            weapon_ = item;
            weaponProjectile_ = registry.ammunition(item.projectileId);
            break;
        }
    }

    result_.contractType = contract_.type;

    log("Contract accepted: " + contract_.title + " [" + toString(contract_.type) +
        ", species " + contract_.speciesId + ", animal seed " +
        std::to_string(animalSeed) + ", world seed " +
        std::to_string(contract_.worldSeed) + "]");
    log("Target individual: " + result_.animal.individualId + " (" +
        std::string(toString(result_.animal.sex)) + " " +
        toString(result_.animal.ageClass) + ", " +
        std::to_string(static_cast<int>(result_.animal.bodyMassKg)) + " kg, " +
        toString(result_.animal.temperament) +
        (result_.animal.rareTrait ? ", RARE: " + result_.animal.rareTraitName : "") + ")");
    log("Hunter departs camp for the " + contract_.region + " area.");
    phase_ = HuntPhase::Traveling;
}

void HuntLoopSim::log(const std::string& text) {
    result_.transcript.push_back({nowS_, text});
}

double HuntLoopSim::hunterAnimalDistanceM() const {
    return planarDistance(hunterPos_, animal_->position());
}

bool HuntLoopSim::hunterCanSeeAnimal() const {
    const double dist = hunterAnimalDistanceM();
    if (dist > kSpotRangeM) return false;
    // The animal's concealment comes from the vegetation it stands in; the
    // hunter has binoculars-grade optics in every loadout for the slice.
    const double cover =
        terrain_.cellAtWorld(animal_->position().x, animal_->position().y).cover01;
    return cover < 0.75 || dist < 30.0;
}

void HuntLoopSim::moveHunterToward(const Vec3& target, double speedMps, double dt) {
    const Vec3 to{target.x - hunterPos_.x, target.y - hunterPos_.y, 0.0};
    const double dist = to.length();
    if (dist < 0.2) {
        hunterSpeedMps_ = 0.0;
        return;
    }
    const double cost =
        terrain_.cellAtWorld(hunterPos_.x, hunterPos_.y).traversalCost;
    const double speed = speedMps / std::max(1.0, cost * 0.7);
    const Vec3 dir = to.normalized();
    hunterPos_.x += dir.x * std::min(speed * dt, dist);
    hunterPos_.y += dir.y * std::min(speed * dt, dist);
    hunterPos_.z = terrain_.heightAt(hunterPos_.x, hunterPos_.y);
    hunterSpeedMps_ = speed;
}

std::string HuntLoopSim::pickAimBodyPart() const {
    // Broadside vital aim, species-agnostic: prefer the lung/thorax stack,
    // fall back to the heart, then to whatever the species defines first.
    const CreatureState& c = animal_->creature();
    for (const char* preferred :
         {"primary_thorax_left", "shoulder_shield_left", "core_pump_cavity",
          "rear_thorax"}) {
        if (c.findPart(preferred)) return preferred;
    }
    return c.bodyParts.empty() ? std::string{} : c.bodyParts.front().id;
}

void HuntLoopSim::fireAtAnimal(const std::string& reason) {
    if (!hasWeapon_) return;

    const double dist = hunterAnimalDistanceM();
    const std::string aim = pickAimBodyPart();

    const ImpactInput input{dist, 90.0, 1.0, false};
    const HitResolution hit =
        applyImpact(animal_->creature(), aim, weaponProjectile_, input);

    // The hunter marks where the animal stood at the shot — the standard
    // starting point for reading the blood trail afterwards.
    lastCluePos_ = animal_->position();
    hasClueHeading_ = true;
    trailStallS_ = 0.0;

    ++result_.shotsFired;
    if (result_.firstShotDistanceM < 0.0) {
        result_.firstShotDistanceM = dist;
        animalPosAtFirstHit_ = animal_->position();
        animalWasHit_ = true;
    }

    HuntShotRecord record;
    record.timeS = nowS_;
    record.distanceM = dist;
    record.bodyPartId = aim;
    record.projectileId = weapon_.projectileId;
    record.impactEnergyJ = hit.impact.impactEnergyJ;
    record.bleedRateMlPerSec = hit.wound.bleedRateMlPerSec;
    record.exitWound = hit.wound.exitWound;
    record.reachedOrgan = hit.wound.bleedRateMlPerSec > 1.0;
    result_.shots.push_back(record);

    // The shot is a world event: the animal hears/feels it, and so would
    // every other animal on the map.
    sounds_.emit(SoundCategory::Gunshot, hunterPos_, kLoudnessGunshot, nowS_, "player");
    animal_->notifyShot(hunterPos_, nowS_);

    std::ostringstream msg;
    msg << reason << ": fired " << weaponProjectile_.name << " at " << aim << ", "
        << static_cast<int>(dist) << " m -> " << static_cast<int>(hit.impact.impactEnergyJ)
        << " J impact, bleed " << hit.wound.bleedRateMlPerSec << " ml/s"
        << (hit.wound.exitWound ? ", exit wound" : "");
    log(msg.str());

    sinceLastShotS_ = 0.0;
}

void HuntLoopSim::finish(bool success, const std::string& failureReason) {
    finished_ = true;
    result_.success = success;
    result_.failureReason = failureReason;
    result_.finalPhase = success ? HuntPhase::Complete : HuntPhase::Failed;
    phase_ = result_.finalPhase;
    result_.totalTimeS = nowS_;

    if (!success) {
        log("HUNT FAILED: " + failureReason);
        return;
    }
    log("Hunt complete.");
}

void HuntLoopSim::updatePhase(double dt) {
    const double dist = hunterAnimalDistanceM();
    const bool animalDown = animal_->alertState() == AlertState::Incapacitated;
    const bool research = contract_.type == ContractType::ResearchObservation;

    // A charging animal preempts every phase: defend if armed.
    if (!animalDown && animal_->alertState() == AlertState::Aggressive &&
        dist < kDefensiveRangeM && hasWeapon_ && sinceLastShotS_ > 1.0 &&
        result_.shotsFired < contract_.maxShots) {
        fireAtAnimal("DEFENSIVE SHOT (charge at " + std::to_string(static_cast<int>(dist)) +
                     " m)");
    }

    switch (phase_) {
        case HuntPhase::AtCamp:
            phase_ = HuntPhase::Traveling;
            break;

        case HuntPhase::Traveling: {
            hunterStance_ = Stance::Standing;
            if (hunterCanSeeAnimal()) {
                log("Spotted " + result_.animal.individualId + " on the way in, at " +
                    std::to_string(static_cast<int>(dist)) + " m.");
                phase_ = research ? HuntPhase::Observing : HuntPhase::Stalking;
                break;
            }
            moveHunterToward(regionHint_, kWalkMps, dt);
            if (planarDistance(hunterPos_, regionHint_) < 60.0) {
                log("Reached the " + contract_.region + " area; reading the ground.");
                phase_ = HuntPhase::Tracking;
            }
            break;
        }

        case HuntPhase::Tracking: {
            hunterStance_ = Stance::Standing;

            if (hunterCanSeeAnimal()) {
                log("Spotted " + result_.animal.individualId + " at " +
                    std::to_string(static_cast<int>(dist)) + " m.");
                phase_ = research ? HuntPhase::Observing : HuntPhase::Stalking;
                break;
            }

            // Fresh sign? Follow the newest readable clue.
            const auto clues =
                evidence_.queryNearby(hunterPos_, 25.0, nowS_, terrain_, 0.15);
            const Clue* newest = nullptr;
            for (const Clue* clue : clues) {
                if (clue->createdAtS <= lastFollowedClueTimeS_) continue;
                if (!newest || clue->createdAtS > newest->createdAtS) newest = clue;
            }
            if (newest) {
                if (lastFollowedClueTimeS_ < 0.0) {
                    log(std::string("Found sign: ") + toString(newest->kind) +
                        (newest->injuredGait ? " (injured gait!)" : "") + ".");
                }
                lastFollowedClueTimeS_ = newest->createdAtS;
                lastCluePos_ = newest->position;
                hasClueHeading_ = true;
                const Vec3 ahead{newest->position.x + newest->direction.x * 10.0,
                                 newest->position.y + newest->direction.y * 10.0, 0.0};
                moveHunterToward(ahead, kWalkMps, dt);
            } else {
                // Deterministic search orbit around the reported area.
                searchAngleRad_ += 0.06 * dt * kWalkMps;
                const Vec3 waypoint{
                    regionHint_.x + std::cos(searchAngleRad_) * 45.0,
                    regionHint_.y + std::sin(searchAngleRad_) * 45.0, 0.0};
                moveHunterToward(waypoint, kWalkMps, dt);
            }
            break;
        }

        case HuntPhase::Stalking: {
            hunterStance_ = Stance::Crouched;
            if (!hunterCanSeeAnimal()) {
                phase_ = HuntPhase::Tracking;
                break;
            }
            if (dist > kMaxRifleRangeM) {
                moveHunterToward(animal_->position(), kCrouchMps, dt);
            } else if (hasWeapon_ && sinceLastShotS_ > kShotCooldownS &&
                       result_.shotsFired < contract_.maxShots) {
                fireAtAnimal("SHOT");
                phase_ = HuntPhase::Trailing;
            }
            break;
        }

        case HuntPhase::Observing: {
            hunterStance_ = Stance::Prone;
            if (!hunterCanSeeAnimal()) {
                phase_ = HuntPhase::Tracking;
                observedS_ = std::max(0.0, observedS_ - dt); // lost sight
                break;
            }
            if (dist > contract_.observationRangeM) {
                // Belly-crawl in: slow, but nearly invisible.
                moveHunterToward(animal_->position(), kProneMps, dt);
            } else {
                observedS_ += dt;
                if (observedS_ >= contract_.observationTimeS) {
                    log("Observation complete: " +
                        std::to_string(static_cast<int>(observedS_)) +
                        " s of documentation at " +
                        std::to_string(static_cast<int>(dist)) + " m.");
                    result_.observedOnly = true;
                    phase_ = HuntPhase::Extracting;
                }
            }
            break;
        }

        case HuntPhase::Trailing: {
            hunterStance_ = Stance::Standing;

            if (animalDown && dist < kClaimRangeM) {
                phase_ = HuntPhase::Claiming;
                break;
            }

            // Follow-up on a still-standing wounded animal in sight.
            if (!animalDown && hunterCanSeeAnimal() && dist < kFollowUpRangeM &&
                hasWeapon_ && sinceLastShotS_ > kShotCooldownS &&
                result_.shotsFired < contract_.maxShots &&
                animal_->creature().life == LifeState::Active) {
                fireAtAnimal("FOLLOW-UP");
            }

            // Trail the newest evidence (blood or tracks laid since the last
            // clue we stood on). Visible downed animals can be walked to
            // directly.
            if (animalDown && hunterCanSeeAnimal()) {
                moveHunterToward(animal_->position(), kWalkMps, dt);
                trailStallS_ = 0.0;
                break;
            }

            const auto clues =
                evidence_.queryNearby(hunterPos_, 35.0, nowS_, terrain_, 0.10);
            const Clue* newest = nullptr;
            for (const Clue* clue : clues) {
                if (clue->createdAtS <= lastFollowedClueTimeS_) continue;
                if (!newest || clue->createdAtS > newest->createdAtS) newest = clue;
            }
            if (newest) {
                lastFollowedClueTimeS_ = newest->createdAtS;
                lastCluePos_ = newest->position;
                hasClueHeading_ = true;
                trailStallS_ = 0.0;
                moveHunterToward(newest->position, kWalkMps, dt);
            } else if (hasClueHeading_) {
                // Push on toward the last confirmed sign.
                moveHunterToward(lastCluePos_, kWalkMps, dt);
                trailStallS_ += dt;
                if (trailStallS_ > 120.0) {
                    finish(false, "Lost the trail: no readable sign for two minutes.");
                    return;
                }
            } else {
                trailStallS_ += dt;
                if (trailStallS_ > 120.0) {
                    finish(false, "Lost the trail immediately after the shot.");
                    return;
                }
            }
            break;
        }

        case HuntPhase::Claiming: {
            const CreatureState& c = animal_->creature();
            std::ostringstream inspect;
            inspect << "CLAIMED " << result_.animal.individualId << ": "
                    << toString(result_.animal.sex) << " "
                    << toString(result_.animal.ageClass) << ", "
                    << static_cast<int>(result_.animal.bodyMassKg) << " kg, trophy size "
                    << static_cast<int>(result_.animal.trophySize01 * 100.0) << "/100."
                    << " Wounds:";
            for (const auto& wound : c.wounds) {
                inspect << " [" << wound.bodyPartId
                        << (wound.exitWound ? ", entry+exit" : ", entry only") << ", "
                        << wound.bleedRateMlPerSec << " ml/s]";
            }
            log(inspect.str());

            result_.animalRecovered = true;
            if (animalWasHit_) {
                result_.recoveryDistanceM =
                    planarDistance(animalPosAtFirstHit_, animal_->position());
            }
            // A carcass is a world object: it smells, and scavengers (later
            // milestones) will care.
            scent_.emit(animal_->position(), kScentStrengthCarcass, "carcass", nowS_);

            log("Harvest tagged. Heading to extraction.");
            phase_ = HuntPhase::Extracting;
            break;
        }

        case HuntPhase::Extracting: {
            hunterStance_ = Stance::Standing;
            moveHunterToward(extractionPos_, kWalkMps, dt);
            if (planarDistance(hunterPos_, extractionPos_) < 8.0) {
                log("Reached the extraction zone.");

                // Contract adjudication.
                if (contract_.type == ContractType::ResearchObservation) {
                    const bool clean = animal_->creature().wounds.empty();
                    if (!clean) {
                        finish(false, "Research target was wounded.");
                        return;
                    }
                    // Research scores on the documented animal alone.
                    result_.trophyScore.biologicalQuality =
                        result_.animal.biologicalQualityPercent;
                    result_.trophyScore.overall = result_.animal.biologicalQualityPercent;
                    result_.trophyScore.tier = "Documented";
                    finish(true, "");
                    return;
                }

                TrophyScoreInput input;
                input.biologicalQualityPercent = result_.animal.biologicalQualityPercent;
                input.shotsFired = result_.shotsFired;
                input.timeToIncapacitationSeconds = result_.timeToIncapacitationS;
                result_.trophyScore = computeTrophyScore(animal_->creature(), input);

                if (!result_.animalRecovered) {
                    finish(false, "Left without recovering the animal.");
                    return;
                }
                if (result_.shotsFired > contract_.maxShots) {
                    finish(false, "Exceeded the contract's shot allowance.");
                    return;
                }
                if (result_.trophyScore.overall < contract_.minTrophyQuality) {
                    finish(false, "Trophy quality " +
                                      std::to_string(result_.trophyScore.overall) +
                                      " below the contracted minimum.");
                    return;
                }
                finish(true, "");
                return;
            }
            break;
        }

        case HuntPhase::Complete:
        case HuntPhase::Failed:
            break;
    }
}

void HuntLoopSim::step(double dt) {
    if (finished_ || dt <= 0.0) return;

    nowS_ += dt;
    sinceLastShotS_ += dt;

    // World systems.
    wind_.update(dt);
    scent_.update(dt, wind_);
    if ((scentEmitAccumS_ += dt) >= 0.5) {
        scentEmitAccumS_ -= 0.5;
        scent_.emit(hunterPos_, kScentStrengthPlayer, "player", nowS_);
        sounds_.expire(nowS_);
    }

    // Hunter noise is a physical consequence of how they move.
    if (hunterSpeedMps_ > 0.05) {
        if ((footstepAccumS_ += dt) >= 0.7) {
            footstepAccumS_ -= 0.7;
            const double vegetation =
                terrain_.cellAtWorld(hunterPos_.x, hunterPos_.y).vegetationDensity01;
            const double loud =
                movementLoudness(hunterStance_, hunterSpeedMps_, vegetation);
            if (loud > 0.0) {
                sounds_.emit(SoundCategory::Footstep, hunterPos_, loud, nowS_, "player");
            }
        }
    }

    // The animal lives in the same world every tick.
    WorldView view;
    view.terrain = &terrain_;
    view.wind = &wind_;
    view.scent = &scent_;
    view.sounds = &sounds_;
    view.playerPos = hunterPos_;
    view.playerSpeedMps = hunterSpeedMps_;
    view.playerStance = hunterStance_;
    view.nowS = nowS_;
    animal_->update(view, evidence_, dt);

    // Narrate meaningful animal state transitions.
    const AlertState animalState = animal_->alertState();
    if (animalState != prevAnimalState_) {
        if (animalState == AlertState::Fleeing) log("The animal bolts!");
        if (animalState == AlertState::Aggressive) log("The animal turns and charges!");
        if (animalState == AlertState::Incapacitated) {
            log("The animal is down.");
            if (result_.timeToIncapacitationS < 0.0 && !result_.shots.empty()) {
                result_.timeToIncapacitationS = nowS_ - result_.shots.front().timeS;
            }
        }
        if (animal_->isBedded() && prevAnimalState_ == AlertState::Fleeing) {
            log("The trail suggests the animal has bedded down.");
        }
        prevAnimalState_ = animalState;
    }

    updatePhase(dt);

    if (!finished_ && nowS_ > contract_.timeLimitS) {
        finish(false, "Contract time limit expired.");
    }
}

bool HuntLoopSim::finished() const { return finished_; }

void HuntLoopSim::runToCompletion() {
    // Hard ceiling well past any contract limit, purely as an infinite-loop
    // guard for malformed data.
    const double ceilingS = contract_.timeLimitS + 300.0;
    while (!finished_ && nowS_ < ceilingS) {
        step();
    }
    if (!finished_) {
        finish(false, "Simulation ceiling reached (engine guard).");
    }
}

const char* toString(HuntPhase p) {
    switch (p) {
        case HuntPhase::AtCamp:     return "AtCamp";
        case HuntPhase::Traveling:  return "Traveling";
        case HuntPhase::Tracking:   return "Tracking";
        case HuntPhase::Stalking:   return "Stalking";
        case HuntPhase::Observing:  return "Observing";
        case HuntPhase::Trailing:   return "Trailing";
        case HuntPhase::Claiming:   return "Claiming";
        case HuntPhase::Extracting: return "Extracting";
        case HuntPhase::Complete:   return "Complete";
        case HuntPhase::Failed:     return "Failed";
    }
    return "Unknown";
}

} // namespace tp
