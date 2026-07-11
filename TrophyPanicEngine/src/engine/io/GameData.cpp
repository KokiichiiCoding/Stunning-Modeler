#include "engine/io/GameData.hpp"
#include "engine/io/Json.hpp"

#include <fstream>
#include <sstream>

namespace tp {

namespace {

std::string readFileOrThrow(const std::string& path) {
    std::ifstream file(path, std::ios::binary);
    if (!file) {
        throw GameDataError("Could not open data file: " + path);
    }
    std::ostringstream contents;
    contents << file.rdbuf();
    return contents.str();
}

TissueType parseTissueType(const std::string& s, const std::string& context) {
    if (s == "muscle") return TissueType::Muscle;
    if (s == "dense_bone") return TissueType::DenseBone;
    if (s == "lung") return TissueType::Lung;
    if (s == "heart") return TissueType::Heart;
    if (s == "liver_gut") return TissueType::LiverGut;
    if (s == "brain") return TissueType::Brain;
    if (s == "major_vessel") return TissueType::MajorVessel;
    throw GameDataError("Unknown tissue type '" + s + "' at " + context);
}

ProjectileKind parseProjectileKind(const std::string& s, const std::string& context) {
    if (s == "expanding_bullet") return ProjectileKind::ExpandingBullet;
    if (s == "broadhead") return ProjectileKind::Broadhead;
    if (s == "steel_nail") return ProjectileKind::SteelNail;
    if (s == "blunt_object") return ProjectileKind::BluntObject;
    if (s == "air_impulse") return ProjectileKind::AirImpulse;
    throw GameDataError("Unknown projectile kind '" + s + "' at " + context);
}

std::vector<TissueLayer> parseLayers(const json::Value& bodyPartJson) {
    std::vector<TissueLayer> layers;
    if (!bodyPartJson.has("layers")) {
        return layers;
    }
    for (const auto& layerJson : bodyPartJson["layers"].asArray()) {
        TissueLayer layer;
        layer.tissueName = layerJson.stringOr("tissue_name", "unnamed");
        layer.thicknessCm = layerJson.numberOr("thickness_cm", 1.0);
        layer.resistance = layerJson.numberOr("resistance", 1.0);
        layer.isOrganLayer = layerJson.boolOr("is_organ_layer", false);
        layer.isBoneLayer = layerJson.boolOr("is_bone_layer", false);
        layers.push_back(layer);
    }
    return layers;
}

} // namespace

CreatureState loadSpeciesFromFile(const std::string& path) {
    std::string text;
    try {
        text = readFileOrThrow(path);
    } catch (const GameDataError&) {
        throw;
    }

    json::Value root;
    try {
        root = json::Value::parse(text);
    } catch (const json::JsonError& e) {
        throw GameDataError("JSON parse error in '" + path + "': " + e.what());
    }

    try {
        CreatureState creature;
        creature.species = root.stringOr("display_name", root["id"].asString());
        creature.maxBloodVolumeMl = root.numberOr("max_blood_volume_ml", 5000.0);
        creature.bloodVolumeMl = creature.maxBloodVolumeMl;

        for (const auto& bp : root["body_parts"].asArray()) {
            BodyPart part;
            part.id = bp["id"].asString();
            part.tissue = parseTissueType(bp["tissue"].asString(), bp.debugPath());
            part.boneIntegrity = bp.numberOr("bone_integrity", 0.0);
            part.maxBoneIntegrity = part.boneIntegrity;
            part.loadBearing = bp.boolOr("load_bearing", false);
            part.trophyOrgan = bp.boolOr("trophy_organ", false);
            part.organIntegrity = 100.0;
            part.layers = parseLayers(bp);
            creature.bodyParts.push_back(std::move(part));
        }

        if (creature.bodyParts.empty()) {
            throw GameDataError("Species file '" + path + "' defines zero body parts");
        }

        return creature;
    } catch (const json::JsonError& e) {
        throw GameDataError("Malformed species file '" + path + "': " + e.what());
    }
}

std::map<std::string, ProjectileSpec> loadAmmunitionFromFile(const std::string& path) {
    std::string text = readFileOrThrow(path);

    json::Value root;
    try {
        root = json::Value::parse(text);
    } catch (const json::JsonError& e) {
        throw GameDataError("JSON parse error in '" + path + "': " + e.what());
    }

    std::map<std::string, ProjectileSpec> result;
    try {
        const json::Value& projectiles = root["projectiles"];
        if (!projectiles.isObject()) {
            throw GameDataError("'projectiles' must be an object in '" + path + "'");
        }
        for (const auto& id : projectiles.objectKeys()) {
            const json::Value& p = projectiles[id];
            ProjectileSpec spec;
            spec.name = p.stringOr("display_name", id);
            spec.kind = parseProjectileKind(p["kind"].asString(), p.debugPath());
            spec.massKg = p["mass_kg"].asNumber();
            spec.muzzleVelocityMps = p["muzzle_velocity_mps"].asNumber();
            spec.energyHalfDistanceM = p.numberOr("energy_half_distance_m", 150.0);
            spec.basePenetrationM = p.numberOr("base_penetration_m", 0.0);
            spec.expansionFactor = p.numberOr("expansion_factor", 1.0);
            spec.bluntShockScale = p.numberOr("blunt_shock_scale", 1.0);
            result[id] = spec;
        }
    } catch (const json::JsonError& e) {
        throw GameDataError("Malformed ammunition file '" + path + "': " + e.what());
    }

    if (result.empty()) {
        throw GameDataError("Ammunition file '" + path + "' defines zero projectiles");
    }

    return result;
}

void GameDataRegistry::loadSpeciesFile(const std::string& path) {
    CreatureState creature = loadSpeciesFromFile(path);
    // CreatureState doesn't retain the short "id" used for lookups (only
    // the display name), so we read it directly from the file here. This
    // means the file gets parsed twice; acceptable for small, one-time
    // startup data loads, and not worth a second loader code path.
    const std::string text = readFileOrThrow(path);
    const json::Value root = json::Value::parse(text);
    const std::string id = root["id"].asString();
    speciesTemplates_[id] = std::move(creature);
}

void GameDataRegistry::loadAmmunitionFile(const std::string& path) {
    auto loaded = loadAmmunitionFromFile(path);
    for (auto& [id, spec] : loaded) {
        ammunition_[id] = std::move(spec);
    }
}

bool GameDataRegistry::hasSpecies(const std::string& id) const {
    return speciesTemplates_.find(id) != speciesTemplates_.end();
}

bool GameDataRegistry::hasAmmunition(const std::string& id) const {
    return ammunition_.find(id) != ammunition_.end();
}

CreatureState GameDataRegistry::instantiateSpecies(const std::string& id) const {
    auto it = speciesTemplates_.find(id);
    if (it == speciesTemplates_.end()) {
        throw GameDataError("Unknown species id: '" + id + "'");
    }
    return it->second; // copy — caller gets independent mutable state
}

const ProjectileSpec& GameDataRegistry::ammunition(const std::string& id) const {
    auto it = ammunition_.find(id);
    if (it == ammunition_.end()) {
        throw GameDataError("Unknown ammunition id: '" + id + "'");
    }
    return it->second;
}

std::vector<std::string> GameDataRegistry::speciesIds() const {
    std::vector<std::string> ids;
    for (const auto& [id, _] : speciesTemplates_) ids.push_back(id);
    return ids;
}

std::vector<std::string> GameDataRegistry::ammunitionIds() const {
    std::vector<std::string> ids;
    for (const auto& [id, _] : ammunition_) ids.push_back(id);
    return ids;
}

} // namespace tp
