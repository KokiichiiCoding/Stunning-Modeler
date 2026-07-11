// Animal perception & behavior tests (Phase E).
//
// Invariants under test are the player-visible ones from the design doc:
// a quiet prone hunter goes unnoticed, a sprinting one doesn't, gunshots
// alarm everything, an animal directly upwind smells nothing, wounded
// behavior follows physiology (flee -> bed -> down, no infinite sprint),
// boars/bears answer close threats instead of fleeing, herds share alarm,
// and identical seeds replay identical behavior.

#include "engine/ai/Behavior.hpp"
#include "engine/ecology/AnimalGenerator.hpp"
#include "engine/io/GameData.hpp"

#include <cmath>
#include <iostream>
#include <string>

using namespace tp;

namespace {

int failures = 0;

void check(bool condition, const std::string& label) {
    if (!condition) {
        ++failures;
        std::cerr << "[FAIL] " << label << "\n";
    } else {
        std::cout << "[PASS] " << label << "\n";
    }
}

struct TestWorld {
    TerrainGrid terrain = TerrainGrid::generate(1234);
    WindModel wind{7, 0.0, 4.0}; // blows toward +x
    ScentField scent;
    SoundLog sounds;
    EvidenceMap evidence;
    double nowS = 0.0;

    [[nodiscard]] WorldView view(const Vec3& playerPos, double playerSpeed,
                                 Stance stance) const {
        WorldView v;
        v.terrain = &terrain;
        v.wind = &wind;
        v.scent = &scent;
        v.sounds = &sounds;
        v.playerPos = playerPos;
        v.playerSpeedMps = playerSpeed;
        v.playerStance = stance;
        v.nowS = nowS;
        return v;
    }
};

AnimalAgent makeAgent(const GameDataRegistry& registry, const std::string& species,
                      std::uint64_t seed, Vec3 pos) {
    const SpeciesProfile& profile = registry.speciesProfile(species);
    GeneratedAnimal animal = generateAnimal(profile, seed);
    CreatureState creature = instantiateGeneratedAnimal(registry, animal);
    return AnimalAgent(std::move(animal), std::move(creature), profile, pos);
}

} // namespace

int main() {
    GameDataRegistry registry;
    registry.loadSpeciesFile("data/species/prototype_deer.json");
    registry.loadSpeciesFile("data/species/prototype_boar.json");
    registry.loadSpeciesFile("data/species/prototype_elk.json");
    registry.loadSpeciesFile("data/species/prototype_black_bear.json");
    registry.loadAmmunitionFile("data/ammunition.json");

    const double dt = 1.0 / 60.0;

    // Use the open camp square so terrain cover is known-low for vision.
    TestWorld probe;
    const Vec3 camp = probe.terrain.zoneCenter(ZoneType::Camp);

    // --- 1. A still, prone, silent, downwind-safe hunter goes unnoticed ---
    {
        TestWorld w;
        // Player far WEST is upwind... wind blows +x (east), so put the
        // player EAST of the deer: scent travels further east, away.
        const Vec3 playerPos{camp.x + 120.0, camp.y, 0.0};
        AnimalAgent deer = makeAgent(registry, "prototype_deer", 5, camp);

        for (int i = 0; i < 30 * 60; ++i) {
            w.wind.update(dt);
            w.scent.emit(playerPos, kScentStrengthPlayer, "player", w.nowS);
            w.scent.update(dt, w.wind);
            deer.update(w.view(playerPos, 0.0, Stance::Prone), w.evidence, dt);
            w.nowS += dt;
        }
        check(deer.alertState() == AlertState::Calm ||
                  deer.alertState() == AlertState::Curious,
              "a still prone hunter 120m away, scent blowing away, stays undetected (got " +
                  std::string(toString(deer.alertState())) + ")");
    }

    // --- 2. A sprinting hunter in the open is spotted fast ---------------
    {
        TestWorld w;
        AnimalAgent deer = makeAgent(registry, "prototype_deer", 5, camp);
        const Vec3 start = deer.position();
        Vec3 playerPos{camp.x + 40.0, camp.y, 0.0};

        double detectedAtS = -1.0;
        for (int i = 0; i < 20 * 60; ++i) {
            deer.update(w.view(playerPos, 6.0, Stance::Standing), w.evidence, dt);
            w.nowS += dt;
            if (detectedAtS < 0.0 && deer.alertState() == AlertState::Fleeing) {
                detectedAtS = w.nowS;
            }
        }
        check(detectedAtS >= 0.0 && detectedAtS < 5.0,
              "a sprinting hunter 40m away in the open triggers flight within 5s");

        const Vec3 moved{deer.position().x - start.x, deer.position().y - start.y, 0.0};
        check(moved.length() > 30.0, "the fleeing deer actually covers ground");
        const double distBefore = 40.0;
        const Vec3 toPlayer{playerPos.x - deer.position().x,
                            playerPos.y - deer.position().y, 0.0};
        check(toPlayer.length() > distBefore,
              "the fleeing deer ends farther from the hunter than it started");
    }

    // --- 3. A gunshot alarms an animal that saw nothing -------------------
    {
        TestWorld w;
        AnimalAgent elk = makeAgent(registry, "prototype_elk", 9, camp);
        const Vec3 shooter{camp.x + 300.0, camp.y, 0.0}; // beyond vision range

        for (int i = 0; i < 2 * 60; ++i) {
            elk.update(w.view(shooter, 0.0, Stance::Prone), w.evidence, dt);
            w.nowS += dt;
        }
        check(elk.alertState() == AlertState::Calm, "elk calm before the shot");

        w.sounds.emit(SoundCategory::Gunshot, shooter, kLoudnessGunshot, w.nowS, "player");
        bool elkFled = false;
        for (int i = 0; i < 5 * 60; ++i) {
            elk.update(w.view(shooter, 0.0, Stance::Prone), w.evidence, dt);
            w.nowS += dt;
            if (elk.alertState() == AlertState::Fleeing) elkFled = true;
        }
        check(elkFled,
              "a distant gunshot sends the unseen elk fleeing");
    }

    // --- 4. Scent: downwind animal winds the hunter; upwind animal cannot -
    {
        TestWorld w;
        const Vec3 playerPos{camp.x, camp.y, 0.0};
        // Downwind = +x of the player (wind seed 7 blows toward +x).
        AnimalAgent downwindDeer =
            makeAgent(registry, "prototype_deer", 5, {camp.x + 25.0, camp.y, 0.0});
        AnimalAgent upwindDeer =
            makeAgent(registry, "prototype_deer", 5, {camp.x - 25.0, camp.y, 0.0});

        bool downwindSmelled = false;
        for (int i = 0; i < 40 * 60; ++i) {
            w.wind.update(dt);
            if (i % 30 == 0) {
                w.scent.emit(playerPos, kScentStrengthPlayer, "player", w.nowS);
            }
            w.scent.update(dt, w.wind);
            // Prone + still: the only open channel is smell.
            downwindDeer.update(w.view(playerPos, 0.0, Stance::Prone), w.evidence, dt);
            upwindDeer.update(w.view(playerPos, 0.0, Stance::Prone), w.evidence, dt);
            for (const auto& s : downwindDeer.recentStimuli()) {
                if (s.kind == StimulusKind::Scent) downwindSmelled = true;
            }
            w.nowS += dt;
        }
        check(downwindSmelled, "deer 25m downwind winds the hunter");
        check(upwindDeer.alertState() == AlertState::Calm ||
                  upwindDeer.alertState() == AlertState::Curious,
              "deer 25m upwind never smells the hunter (got " +
                  std::string(toString(upwindDeer.alertState())) + ")");
    }

    // --- 5. Wounded deer: flee -> bed -> incapacitated, no infinite sprint -
    {
        TestWorld w;
        AnimalAgent deer = makeAgent(registry, "prototype_deer", 5, camp);
        const Vec3 shooter{camp.x - 80.0, camp.y, 0.0};

        const ProjectileSpec& ammo = registry.ammunition("308_soft_point");
        const ImpactInput input{80.0, 90.0, 1.0, false};
        (void)applyImpact(deer.creature(), "primary_thorax_left", ammo, input);
        deer.notifyShot(shooter, w.nowS);
        w.sounds.emit(SoundCategory::Gunshot, shooter, kLoudnessGunshot, w.nowS, "player");

        bool sawFlee = false, sawBed = false;
        for (int i = 0; i < 120 * 60; ++i) {
            deer.update(w.view(shooter, 0.0, Stance::Standing), w.evidence, dt);
            w.nowS += dt;
            if (deer.alertState() == AlertState::Fleeing) sawFlee = true;
            if (sawFlee && deer.isBedded()) sawBed = true;
            if (deer.alertState() == AlertState::Incapacitated) break;
        }
        check(sawFlee, "lung-shot deer initially flees");
        check(sawBed, "bleeding deer eventually beds down instead of sprinting forever");
        check(deer.alertState() == AlertState::Incapacitated,
              "the wound simulation eventually downs the bedded deer");
        check(deer.currentSpeedMps() == 0.0, "a downed deer stops moving");

        bool sawBlood = false;
        for (const auto& clue : w.evidence.clues()) {
            if (clue.kind == ClueKind::BloodDrop || clue.kind == ClueKind::BloodSmear ||
                clue.kind == ClueKind::BloodPool) {
                sawBlood = true;
                break;
            }
        }
        check(sawBlood, "the wounded deer's flight leaves a blood trail to follow");
    }

    // --- 6. Broken leg physically caps flight speed -----------------------
    {
        TestWorld w;
        AnimalAgent deer = makeAgent(registry, "prototype_deer", 5, camp);
        deer.creature().findPart("gait_column_front_left")->boneIntegrity = 0.0;
        deer.notifyShot({camp.x - 30.0, camp.y, 0.0}, w.nowS);

        double topSpeed = 0.0;
        for (int i = 0; i < 10 * 60; ++i) {
            deer.update(w.view({camp.x - 30.0, camp.y, 0.0}, 0.0, Stance::Standing),
                        w.evidence, dt);
            w.nowS += dt;
            topSpeed = std::max(topSpeed, deer.currentSpeedMps());
        }
        const SpeciesProfile& deerProfile = registry.speciesProfile("prototype_deer");
        check(topSpeed > 0.0 && topSpeed <= deerProfile.trotMps * 0.5 + 1e-9,
              "a deer with a failed front leg cannot exceed the limping cap");
    }

    // --- 7. Wounded boar answers a close threat with a charge -------------
    {
        TestWorld w;
        AnimalAgent boar = makeAgent(registry, "prototype_boar", 11, camp);
        const Vec3 hunter{camp.x + 10.0, camp.y, 0.0}; // inside 15m defensive radius

        const ProjectileSpec& ammo = registry.ammunition("22lr_solid");
        const ImpactInput input{10.0, 90.0, 1.0, false};
        (void)applyImpact(boar.creature(), "gut", ammo, input);
        boar.notifyShot(hunter, w.nowS);

        double closestApproach = 10.0;
        bool charged = false;
        for (int i = 0; i < 10 * 60; ++i) {
            boar.update(w.view(hunter, 0.0, Stance::Standing), w.evidence, dt);
            w.nowS += dt;
            if (boar.alertState() == AlertState::Aggressive) charged = true;
            const Vec3 d{hunter.x - boar.position().x, hunter.y - boar.position().y, 0.0};
            closestApproach = std::min(closestApproach, d.length());
        }
        check(charged, "a wounded boar with the hunter inside its defensive radius charges");
        check(closestApproach < 5.0, "the charging boar closes on the hunter");
    }

    // --- 8. Bears: avoid humans unwounded, dangerous wounded up close ------
    {
        TestWorld w;
        AnimalAgent bear = makeAgent(registry, "prototype_black_bear", 13, camp);
        Vec3 hiker{camp.x + 60.0, camp.y, 0.0}; // outside 25m defensive radius

        bool bearFled = false;
        bool bearCharged = false;
        for (int i = 0; i < 20 * 60; ++i) {
            bear.update(w.view(hiker, 1.5, Stance::Standing), w.evidence, dt);
            w.nowS += dt;
            if (bear.alertState() == AlertState::Fleeing) bearFled = true;
            if (bear.alertState() == AlertState::Aggressive) bearCharged = true;
        }
        check(bearFled && !bearCharged,
              "an unprovoked bear avoids a visible human rather than attacking");

        // Same bear individual, wounded, with the hunter pressing to 20m.
        TestWorld w2;
        AnimalAgent woundedBear = makeAgent(registry, "prototype_black_bear", 13, camp);
        const Vec3 hunter{camp.x + 20.0, camp.y, 0.0};
        const ProjectileSpec& ammo = registry.ammunition("45acp_hollow_point");
        const ImpactInput input{20.0, 90.0, 1.0, false};
        (void)applyImpact(woundedBear.creature(), "gut", ammo, input);
        woundedBear.notifyShot(hunter, w2.nowS);

        bool aggressive = false;
        for (int i = 0; i < 5 * 60; ++i) {
            woundedBear.update(w2.view(hunter, 0.0, Stance::Standing), w2.evidence, dt);
            w2.nowS += dt;
            if (woundedBear.alertState() == AlertState::Aggressive) aggressive = true;
        }
        check(aggressive, "a wounded bear with the hunter close turns aggressive");
    }

    // --- 9. Herd communication ---------------------------------------------
    {
        TestWorld w;
        AnimalAgent sentinel = makeAgent(registry, "prototype_deer", 5, camp);
        AnimalAgent grazer =
            makeAgent(registry, "prototype_deer", 6, {camp.x + 40.0, camp.y + 20.0, 0.0});
        std::vector<AnimalAgent*> herd{&sentinel, &grazer};

        // Only the sentinel sees the sprinting hunter (grazer looks away and
        // is farther); the alarm must still spread.
        const Vec3 hunter{camp.x - 30.0, camp.y, 0.0};
        for (int i = 0; i < 10 * 60; ++i) {
            sentinel.update(w.view(hunter, 6.0, Stance::Standing), w.evidence, dt);
            grazer.update(w.view({camp.x + 500.0, camp.y, 0.0}, 0.0, Stance::Prone),
                          w.evidence, dt);
            if (i % 12 == 0) propagateHerdAlarm(herd, w.nowS);
            w.nowS += dt;
        }
        check(sentinel.alertState() == AlertState::Fleeing, "sentinel deer flees");
        check(grazer.alertness() >= 50.0 ||
                  grazer.alertState() == AlertState::Fleeing,
              "herd alarm propagates to the deer that saw nothing");
    }

    // --- 10. Determinism: identical seeds replay identical behavior --------
    {
        auto runOnce = [&]() {
            TestWorld w;
            AnimalAgent deer = makeAgent(registry, "prototype_deer", 21, camp);
            const Vec3 hunter{camp.x + 45.0, camp.y - 10.0, 0.0};
            for (int i = 0; i < 30 * 60; ++i) {
                w.wind.update(dt);
                if (i % 30 == 0) w.scent.emit(hunter, 1.0, "player", w.nowS);
                w.scent.update(dt, w.wind);
                deer.update(w.view(hunter, 1.0, Stance::Crouched), w.evidence, dt);
                w.nowS += dt;
            }
            return deer.position();
        };
        const Vec3 p1 = runOnce();
        const Vec3 p2 = runOnce();
        check(p1.x == p2.x && p1.y == p2.y,
              "identical world + animal seeds reproduce the identical trajectory");
    }

    // --- 11. Behavior debugger emits a useful line --------------------------
    {
        TestWorld w;
        AnimalAgent deer = makeAgent(registry, "prototype_deer", 5, camp);
        deer.update(w.view(camp, 0.0, Stance::Standing), w.evidence, dt);
        const std::string line = deer.debugString();
        check(line.find("prototype_deer#5") != std::string::npos &&
                  line.find("blood=") != std::string::npos &&
                  line.find("life=") != std::string::npos,
              "debugString reports identity, physiology and state");
    }

    if (failures != 0) {
        std::cerr << "\n" << failures << " behavior test(s) failed.\n";
        return 1;
    }
    std::cout << "\nAll behavior tests passed.\n";
    return 0;
}
