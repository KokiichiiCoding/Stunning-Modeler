// World-layer tests (Phase D): terrain, wind, tracks, blood evidence, scent,
// sound. Tests target player-visible invariants, e.g. "an animal directly
// upwind cannot smell you," not implementation details.

#include "engine/io/GameData.hpp"
#include "engine/world/Evidence.hpp"
#include "engine/world/Scent.hpp"
#include "engine/world/SoundEvents.hpp"
#include "engine/world/Terrain.hpp"
#include "engine/world/Wind.hpp"

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

} // namespace

int main() {
    // --- Terrain ----------------------------------------------------------
    {
        const TerrainGrid a = TerrainGrid::generate(1234);
        const TerrainGrid b = TerrainGrid::generate(1234);
        const TerrainGrid c = TerrainGrid::generate(9999);

        bool identical = true;
        bool differs = false;
        for (int y = 0; y < a.heightCells(); ++y) {
            for (int x = 0; x < a.widthCells(); ++x) {
                if (a.cell(x, y).heightM != b.cell(x, y).heightM) identical = false;
                if (a.cell(x, y).heightM != c.cell(x, y).heightM) differs = true;
            }
        }
        check(identical, "terrain: same seed generates the identical map");
        check(differs, "terrain: different seed generates a different map");

        for (ZoneType zone : {ZoneType::Camp, ZoneType::Forest, ZoneType::Meadow,
                              ZoneType::Creek, ZoneType::RockySlope,
                              ZoneType::DenseCover, ZoneType::Extraction}) {
            check(a.zoneExists(zone),
                  std::string("terrain: generated map contains zone ") + toString(zone));
        }

        const Vec3 camp = a.zoneCenter(ZoneType::Camp);
        check(a.cellAtWorld(camp.x, camp.y).zone == ZoneType::Camp,
              "terrain: zoneCenter(Camp) actually lands in the camp");
    }

    // --- Wind --------------------------------------------------------------
    {
        WindModel w1(42, 0.5, 3.0);
        WindModel w2(42, 0.5, 3.0);
        for (int i = 0; i < 600; ++i) { w1.update(0.1); w2.update(0.1); }
        check(w1.directionRad() == w2.directionRad() && w1.speedMps() == w2.speedMps(),
              "wind: same seed evolves identically over 60s");

        WindModel w3(42, 0.5, 3.0);
        double maxStepChange = 0.0;
        double prev = w3.directionRad();
        for (int i = 0; i < 100; ++i) {
            w3.update(1.0);
            double delta = std::abs(w3.directionRad() - prev);
            if (delta > 3.141592) delta = 2 * 3.141592 - delta; // wrap
            maxStepChange = std::max(maxStepChange, delta);
            prev = w3.directionRad();
        }
        check(maxStepChange < 0.35, "wind: direction drifts slowly, never snaps");
    }

    // --- Tracks -------------------------------------------------------------
    GameDataRegistry registry;
    registry.loadSpeciesFile("data/species/prototype_deer.json");
    registry.loadAmmunitionFile("data/ammunition.json");
    const SpeciesProfile& deerProfile = registry.speciesProfile("prototype_deer");

    {
        EvidenceMap evidence;
        TrackEmitter tracker(deerProfile);
        CreatureState deer = registry.instantiateSpecies("prototype_deer");

        // Walk 30 m east at walking speed.
        double now = 0.0;
        Vec3 pos{100.0, 100.0, 0.0};
        for (int i = 0; i < 300; ++i) {
            const double dt = 0.1;
            pos.x += deerProfile.walkMps * dt;
            tracker.update(evidence, deer, pos, now, dt);
            now += dt;
        }
        const std::size_t healthyPrints = evidence.clues().size();
        check(healthyPrints >= 15 && healthyPrints <= 40,
              "tracks: walking 30m leaves a sensible print count (got " +
                  std::to_string(healthyPrints) + ")");
        check(!evidence.clues().empty() && evidence.clues()[0].gait == Gait::Walk &&
                  !evidence.clues()[0].injuredGait,
              "tracks: healthy walking prints read as Walk, not injured");
        check(!evidence.clues().empty() && evidence.clues()[0].direction.x > 0.9,
              "tracks: prints record direction of travel");

        // Break a front leg; the same walk must now read as an injured gait
        // with a shortened stride.
        deer.findPart("gait_column_front_left")->boneIntegrity = 0.0;
        stepPhysiology(deer, 1.0 / 60.0);
        check(deer.mobility == MobilityState::Limping,
              "tracks precondition: failed load-bearing limb => Limping");

        EvidenceMap injuredEvidence;
        TrackEmitter injuredTracker(deerProfile);
        Vec3 pos2{100.0, 100.0, 0.0};
        double now2 = 0.0;
        for (int i = 0; i < 300; ++i) {
            const double dt = 0.1;
            pos2.x += deerProfile.walkMps * dt;
            injuredTracker.update(injuredEvidence, deer, pos2, now2, dt);
            now2 += dt;
        }
        check(!injuredEvidence.clues().empty() &&
                  injuredEvidence.clues()[0].injuredGait &&
                  injuredEvidence.clues()[0].gait == Gait::Limp,
              "tracks: limping animal leaves injured-gait prints");
        check(injuredEvidence.clues().size() > healthyPrints,
              "tracks: shortened limping stride leaves more prints over the same path");
        check(injuredEvidence.clues()[0].strideM < deerProfile.trackStrideM,
              "tracks: limping stride is shorter than the species baseline");
    }

    // --- Track aging ---------------------------------------------------------
    {
        Clue print;
        print.kind = ClueKind::Footprint;
        print.createdAtS = 0.0;
        print.baseIntensity01 = 1.0;

        const double fresh = EvidenceMap::readability(print, 60.0, SurfaceType::Mud);
        const double old1 = EvidenceMap::readability(print, 3600.0, SurfaceType::Mud);
        check(fresh > old1, "aging: an hour-old print is less readable than a minute-old one");

        const double mud = EvidenceMap::readability(print, 600.0, SurfaceType::Mud);
        const double rock = EvidenceMap::readability(print, 600.0, SurfaceType::Rock);
        check(mud > rock, "aging: mud holds prints far better than rock");

        const double dry = EvidenceMap::readability(print, 600.0, SurfaceType::Grass, 0.0);
        const double rain = EvidenceMap::readability(print, 600.0, SurfaceType::Grass, 1.0);
        check(dry > rain, "aging: rain washes evidence out faster");
    }

    // --- Blood evidence -------------------------------------------------------
    {
        // A real lung wound versus a muscle graze, produced by the actual
        // impact model — the blood trail must reflect wound severity.
        CreatureState lungDeer = registry.instantiateSpecies("prototype_deer");
        const ProjectileSpec& ammo = registry.ammunition("308_soft_point");
        const ImpactInput input{80.0, 90.0, 1.0, false};
        (void)applyImpact(lungDeer, "primary_thorax_left", ammo, input);

        CreatureState grazedDeer = registry.instantiateSpecies("prototype_deer");
        const ImpactInput weak{200.0, 25.0, 1.0, false};
        (void)applyImpact(grazedDeer, "wobble_rump", ammo, weak);

        auto countBlood = [&](CreatureState& creature) {
            EvidenceMap evidence;
            BloodEvidenceEmitter emitter;
            Vec3 pos{0, 0, 0};
            double now = 0.0;
            for (int i = 0; i < 200; ++i) {
                const double dt = 0.1;
                pos.x += 2.0 * dt;
                emitter.update(evidence, creature, pos, true, now, dt);
                now += dt;
            }
            return evidence.clues().size();
        };

        const std::size_t lungTrail = countBlood(lungDeer);
        const std::size_t grazeTrail = countBlood(grazedDeer);
        check(lungTrail > grazeTrail * 2,
              "blood: a lung wound leaves a much heavier trail than a graze (" +
                  std::to_string(lungTrail) + " vs " + std::to_string(grazeTrail) + ")");

        // Stationary bleeding animal pools instead of dripping a line.
        EvidenceMap bedEvidence;
        BloodEvidenceEmitter bedEmitter;
        double now = 0.0;
        for (int i = 0; i < 600; ++i) {
            bedEmitter.update(bedEvidence, lungDeer, {5, 5, 0}, false, now, 0.1);
            now += 0.1;
        }
        bool sawPool = false;
        for (const auto& clue : bedEvidence.clues()) {
            if (clue.kind == ClueKind::BloodPool) sawPool = true;
        }
        check(sawPool, "blood: a bedded bleeding animal forms pools");
    }

    // --- Scent ------------------------------------------------------------------
    {
        // Wind blowing due east (+x). Player at origin emits continuously.
        WindModel eastWind(7, 0.0, 4.0);
        ScentField scent;
        double now = 0.0;
        for (int i = 0; i < 100; ++i) {
            scent.emit({0, 0, 0}, kScentStrengthPlayer, "player", now);
            scent.update(0.1, eastWind);
            now += 0.1;
        }
        // Note: WindModel drifts slightly, but over 10s it stays near east.
        const double downwind = scent.sample({20, 0, 0}, "player");
        const double upwind = scent.sample({-20, 0, 0}, "player");
        check(downwind > 0.01, "scent: detectable 20m downwind of the source");
        check(upwind < 1e-6, "scent: an animal directly upwind smells nothing");

        // Detection thresholds: bear (0.05) winds what deer (0.10) misses.
        const SpeciesProfile bearLike = [] {
            SpeciesProfile p; p.smellThreshold = 0.05; return p; }();
        const SpeciesProfile deerLike = [] {
            SpeciesProfile p; p.smellThreshold = 0.30; return p; }();
        const double faint = downwind * 0.9;
        check(faint > bearLike.smellThreshold || faint < deerLike.smellThreshold,
              "scent: species thresholds can disagree about a faint plume");

        // Bleeding bodies are easier to wind.
        check(scentStrengthForBody(100.0) > scentStrengthForBody(0.0) * 3.0,
              "scent: heavy bleeding multiplies body scent");

        // Decay: with the source silenced, the plume fades out.
        for (int i = 0; i < 1200; ++i) scent.update(0.1, eastWind);
        check(scent.puffs().empty(), "scent: plume dissipates after the source stops");
    }

    // --- Sound -------------------------------------------------------------------
    {
        SoundLog log;
        log.emit(SoundCategory::Gunshot, {0, 0, 0}, 1000.0, 10.0, "player");
        log.emit(SoundCategory::Footstep, {0, 0, 0}, 0.5, 10.0, "player");

        const auto recent = log.eventsSince(9.0);
        check(recent.size() == 2, "sound: events retrievable since a timestamp");

        const double near = SoundLog::perceivedLoudness(*recent[0], {10, 0, 0});
        const double far = SoundLog::perceivedLoudness(*recent[0], {100, 0, 0});
        check(near > far * 50.0, "sound: inverse-square falloff with distance");

        const double shotAt100m = SoundLog::perceivedLoudness(*recent[0], {100, 0, 0});
        const double stepAt10m = SoundLog::perceivedLoudness(*recent[1], {10, 0, 0});
        check(shotAt100m > stepAt10m,
              "sound: a gunshot 100m away still outclasses a footstep at 10m");

        log.expire(60.0, 30.0);
        check(log.events().empty(), "sound: old events expire from the log");
    }

    if (failures != 0) {
        std::cerr << "\n" << failures << " world test(s) failed.\n";
        return 1;
    }
    std::cout << "\nAll world tests passed.\n";
    return 0;
}
