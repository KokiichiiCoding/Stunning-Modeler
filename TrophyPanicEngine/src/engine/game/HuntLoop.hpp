#pragma once
#include "engine/ai/Behavior.hpp"
#include "engine/game/Contracts.hpp"
#include "engine/scoring/TrophyScore.hpp"
#include "engine/world/Evidence.hpp"
#include "engine/world/Scent.hpp"
#include "engine/world/SoundEvents.hpp"
#include "engine/world/Terrain.hpp"
#include "engine/world/Wind.hpp"

#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace tp {

// The complete single-hunt loop, headless: spawn at camp, travel to the
// contract region, read tracks, stalk, shoot through the real ballistics/
// anatomy pipeline, trail the blood evidence, claim, extract, score.
//
// The hunter is driven by a deterministic scripted policy (a "bot player")
// so the entire loop is testable without graphics. The state machine is the
// game mode; the viewer later swaps the bot's decisions for human input
// while every simulation rule stays identical.
enum class HuntPhase {
    AtCamp,
    Traveling,
    Tracking,
    Stalking,
    Observing,
    Trailing,
    Claiming,
    Extracting,
    Complete,
    Failed
};

struct HuntShotRecord {
    double timeS{};
    double distanceM{};
    std::string bodyPartId;
    std::string projectileId;
    double impactEnergyJ{};
    double bleedRateMlPerSec{};
    bool exitWound{};
    bool reachedOrgan{};
};

struct HuntEvent {
    double timeS{};
    std::string text;
};

struct HuntResult {
    bool success{false};
    std::string failureReason;
    HuntPhase finalPhase{HuntPhase::Failed};
    ContractType contractType{ContractType::CleanHarvest};

    GeneratedAnimal animal;
    TrophyScoreResult trophyScore;

    int shotsFired{0};
    double firstShotDistanceM{-1.0};
    double timeToIncapacitationS{-1.0};
    double recoveryDistanceM{-1.0}; // animal travel between first hit and down site
    double totalTimeS{0.0};
    bool animalRecovered{false};
    bool observedOnly{false};

    std::vector<HuntShotRecord> shots;
    std::vector<HuntEvent> transcript;
};

class HuntLoopSim {
public:
    // animalSeedOverride != 0 replaces the contract's animal_seed, so the
    // same contract can be replayed against different individuals.
    HuntLoopSim(const GameDataRegistry& registry, Contract contract,
                std::uint64_t animalSeedOverride = 0);

    void step(double dtSeconds = 1.0 / 60.0);
    [[nodiscard]] bool finished() const;
    void runToCompletion();

    [[nodiscard]] const HuntResult& result() const { return result_; }

    // Introspection for the debug viewer / tests.
    [[nodiscard]] HuntPhase phase() const { return phase_; }
    [[nodiscard]] const TerrainGrid& terrain() const { return terrain_; }
    [[nodiscard]] const WindModel& wind() const { return wind_; }
    [[nodiscard]] const EvidenceMap& evidence() const { return evidence_; }
    [[nodiscard]] const AnimalAgent& animal() const { return *animal_; }
    [[nodiscard]] Vec3 hunterPos() const { return hunterPos_; }
    [[nodiscard]] Stance hunterStance() const { return hunterStance_; }
    [[nodiscard]] double nowS() const { return nowS_; }

private:
    void log(const std::string& text);
    void moveHunterToward(const Vec3& target, double speedMps, double dt);
    [[nodiscard]] double hunterAnimalDistanceM() const;
    [[nodiscard]] bool hunterCanSeeAnimal() const;
    void fireAtAnimal(const std::string& reason);
    [[nodiscard]] std::string pickAimBodyPart() const;
    void finish(bool success, const std::string& failureReason);
    void updatePhase(double dt);

    const GameDataRegistry* registry_;
    Contract contract_;

    TerrainGrid terrain_;
    WindModel wind_;
    ScentField scent_;
    SoundLog sounds_;
    EvidenceMap evidence_;
    std::unique_ptr<AnimalAgent> animal_;

    HuntPhase phase_{HuntPhase::AtCamp};
    double nowS_{0.0};

    // Hunter state (bot-driven).
    Vec3 hunterPos_;
    Stance hunterStance_{Stance::Standing};
    double hunterSpeedMps_{0.0};
    Vec3 regionHint_;
    Vec3 extractionPos_;
    double searchAngleRad_{0.0};
    double lastFollowedClueTimeS_{-1.0};
    Vec3 lastCluePos_;
    bool hasClueHeading_{false};
    double trailStallS_{0.0};
    double observedS_{0.0};
    double scentEmitAccumS_{0.0};
    double footstepAccumS_{0.0};
    double sinceLastShotS_{0.0};

    // Weapon (first rifle/bow in the contract's allowed equipment).
    bool hasWeapon_{false};
    ItemSpec weapon_;
    ProjectileSpec weaponProjectile_;

    // Outcome tracking.
    Vec3 animalPosAtFirstHit_;
    bool animalWasHit_{false};
    AlertState prevAnimalState_{AlertState::Calm};
    HuntResult result_;
    bool finished_{false};
};

[[nodiscard]] const char* toString(HuntPhase p);

} // namespace tp
