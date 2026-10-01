#pragma once
#include "engine/ai/Perception.hpp"
#include "engine/biology/Creature.hpp"
#include "engine/core/Rng.hpp"
#include "engine/ecology/AnimalGenerator.hpp"
#include "engine/world/Evidence.hpp"
#include "engine/world/Terrain.hpp"
#include "engine/world/Wind.hpp"

#include <string>
#include <vector>

namespace tp {

// Readable alertness ladder. Detection is graded, not binary: stimuli feed
// an alertness accumulator, and states change at thresholds, so a careless
// hunter gets warning signs (head up, staring) before the animal bolts.
enum class AlertState {
    Calm,
    Curious,
    Suspicious,
    Alert,
    Fleeing,
    Defensive,
    Aggressive,
    Incapacitated
};

enum class Goal { Wander, Investigate, Watch, Flee, Bed, Charge, None };

struct AnimalMemory {
    bool hasThreat{false};
    Vec3 lastThreatPos;
    double lastThreatTimeS{-1e9};
    double lastGunshotTimeS{-1e9};
    double lastScentTimeS{-1e9};
    int disturbanceCount{0};
};

// Everything an animal can sense this tick, provided by the hunt loop.
// The agent never reaches into the player controller directly.
struct WorldView {
    const TerrainGrid* terrain{};
    const WindModel* wind{};
    const ScentField* scent{};
    const SoundLog* sounds{};
    Vec3 playerPos;
    double playerSpeedMps{};
    Stance playerStance{Stance::Standing};
    double nowS{};
};

// One animal in the world: identity (GeneratedAnimal), authoritative
// physiology (CreatureState), species tuning (SpeciesProfile), spatial
// state, perception, memory, and a small species-flavored decision loop.
//
// Common infrastructure + species tuning/wounded-style branches — NOT a
// single universal AI and NOT a per-species class hierarchy. Species
// character comes from profile data (fear/aggression thresholds,
// defensive radius, wounded_style, senses) plus temperament.
class AnimalAgent {
public:
    AnimalAgent(GeneratedAnimal identity, CreatureState physiology,
                const SpeciesProfile& profile, Vec3 spawnPos);

    // Master update, called at the simulation rate. Perception runs at
    // ~10 Hz and decisions at ~5 Hz internally; movement and physiology
    // integrate every tick.
    void update(const WorldView& view, EvidenceMap& evidence, double dtSeconds);

    // Wounds are applied externally (the ballistics pipeline); this hook
    // lets behavior react immediately (pain spike, threat memory).
    void notifyShot(const Vec3& shotOriginPos, double nowS);

    // Herd communication: another animal's flight raised the alarm here.
    void receiveAlarm(const Vec3& threatPos, double nowS);

    [[nodiscard]] const GeneratedAnimal& identity() const { return identity_; }
    [[nodiscard]] CreatureState& creature() { return creature_; }
    [[nodiscard]] const CreatureState& creature() const { return creature_; }
    [[nodiscard]] const SpeciesProfile& profile() const { return *profile_; }
    [[nodiscard]] Vec3 position() const { return position_; }
    [[nodiscard]] double facingRad() const { return facingRad_; }
    [[nodiscard]] AlertState alertState() const { return alertState_; }
    [[nodiscard]] Goal goal() const { return goal_; }
    [[nodiscard]] double alertness() const { return alertness_; }
    [[nodiscard]] double staminaS() const { return staminaS_; }
    [[nodiscard]] double currentSpeedMps() const { return currentSpeedMps_; }
    [[nodiscard]] const AnimalMemory& memory() const { return memory_; }
    [[nodiscard]] const std::vector<Stimulus>& recentStimuli() const { return recentStimuli_; }
    [[nodiscard]] bool isBedded() const { return goal_ == Goal::Bed; }

    // Headless behavior debugger: one line with state, goal, alertness,
    // physiological modifiers, memory, and last stimuli.
    [[nodiscard]] std::string debugString() const;

private:
    void perceive(const WorldView& view);
    void decide(const WorldView& view);
    void move(const WorldView& view, EvidenceMap& evidence, double dtSeconds);

    [[nodiscard]] double maxSpeedForState() const;

    GeneratedAnimal identity_;
    CreatureState creature_;
    const SpeciesProfile* profile_;
    Rng rng_;

    Vec3 position_;
    double facingRad_{0.0};
    Vec3 moveTarget_;
    bool hasMoveTarget_{false};

    AlertState alertState_{AlertState::Calm};
    Goal goal_{Goal::Wander};
    double alertness_{0.0}; // 0..100 accumulator
    double staminaS_;
    double currentSpeedMps_{0.0};

    AnimalMemory memory_;
    std::vector<Stimulus> recentStimuli_;

    TrackEmitter tracks_;
    BloodEvidenceEmitter blood_;

    double perceiveAccumulatorS_{0.0};
    double decideAccumulatorS_{0.0};
    double lastSoundQueryS_{0.0};
};

[[nodiscard]] const char* toString(AlertState s);
[[nodiscard]] const char* toString(Goal g);

// Herd communication: any fleeing herd animal alarms same-species herd
// members within alarmRadiusM. Call once per decision cadence.
void propagateHerdAlarm(std::vector<AnimalAgent*>& agents, double nowS,
                        double alarmRadiusM = 80.0);

} // namespace tp
