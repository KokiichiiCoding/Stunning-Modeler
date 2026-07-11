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

SpeciesProfile loadSpeciesProfileFromFile(const std::string& path) {
    const std::string text = readFileOrThrow(path);

    json::Value root;
    try {
        root = json::Value::parse(text);
    } catch (const json::JsonError& e) {
        throw GameDataError("JSON parse error in '" + path + "': " + e.what());
    }

    try {
        SpeciesProfile profile;
        profile.id = root["id"].asString();
        profile.displayName = root.stringOr("display_name", profile.id);

        if (root.has("body_mass_kg_range")) {
            const auto& range = root["body_mass_kg_range"].asArray();
            if (range.size() != 2) {
                throw GameDataError("'body_mass_kg_range' must be [min, max] in '" + path + "'");
            }
            profile.bodyMassKgMin = range[0].asNumber();
            profile.bodyMassKgMax = range[1].asNumber();
            if (profile.bodyMassKgMax < profile.bodyMassKgMin) {
                throw GameDataError("'body_mass_kg_range' min exceeds max in '" + path + "'");
            }
        }

        if (root.has("trophy")) {
            const json::Value& trophy = root["trophy"];
            profile.trophyOrganId = trophy.stringOr("organ", "");
            if (trophy.has("base_score_range")) {
                const auto& range = trophy["base_score_range"].asArray();
                if (range.size() != 2) {
                    throw GameDataError(
                        "'trophy.base_score_range' must be [min, max] in '" + path + "'");
                }
                profile.trophyScoreMin = range[0].asNumber();
                profile.trophyScoreMax = range[1].asNumber();
            }
        }

        if (root.has("movement")) {
            const json::Value& mv = root["movement"];
            profile.walkMps = mv.numberOr("walk_mps", profile.walkMps);
            profile.trotMps = mv.numberOr("trot_mps", profile.trotMps);
            profile.runMps = mv.numberOr("run_mps", profile.runMps);
            profile.maxStaminaS = mv.numberOr("max_stamina_s", profile.maxStaminaS);
        }

        if (root.has("senses")) {
            const json::Value& sn = root["senses"];
            profile.visionRangeM = sn.numberOr("vision_range_m", profile.visionRangeM);
            profile.visionFovDeg = sn.numberOr("vision_fov_deg", profile.visionFovDeg);
            profile.hearingSensitivity =
                sn.numberOr("hearing_sensitivity", profile.hearingSensitivity);
            profile.smellThreshold = sn.numberOr("smell_threshold", profile.smellThreshold);
        }

        if (root.has("behavior")) {
            const json::Value& bh = root["behavior"];
            profile.grouping = bh.stringOr("grouping", profile.grouping);
            profile.fearThreshold = bh.numberOr("fear_threshold", profile.fearThreshold);
            profile.aggressionThreshold =
                bh.numberOr("aggression_threshold", profile.aggressionThreshold);
            profile.curiosity = bh.numberOr("curiosity", profile.curiosity);
            profile.defensiveRadiusM =
                bh.numberOr("defensive_radius_m", profile.defensiveRadiusM);
            profile.woundedStyle = bh.stringOr("wounded_style", profile.woundedStyle);
            if (bh.has("preferred_terrain")) {
                for (const auto& t : bh["preferred_terrain"].asArray()) {
                    profile.preferredTerrain.push_back(t.asString());
                }
            }
            if (bh.has("active_periods")) {
                for (const auto& p : bh["active_periods"].asArray()) {
                    profile.activePeriods.push_back(p.asString());
                }
            }
        }

        if (root.has("tracks")) {
            const json::Value& tr = root["tracks"];
            profile.trackStrideM = tr.numberOr("stride_m", profile.trackStrideM);
            profile.trackPrintSizeCm = tr.numberOr("print_size_cm", profile.trackPrintSizeCm);
        }

        return profile;
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
    // The file is parsed twice (anatomy + profile); acceptable for small,
    // one-time startup data loads, and not worth a merged loader code path.
    CreatureState creature = loadSpeciesFromFile(path);
    SpeciesProfile profile = loadSpeciesProfileFromFile(path);
    const std::string id = profile.id;
    speciesTemplates_[id] = std::move(creature);
    speciesProfiles_[id] = std::move(profile);
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

const SpeciesProfile& GameDataRegistry::speciesProfile(const std::string& id) const {
    auto it = speciesProfiles_.find(id);
    if (it == speciesProfiles_.end()) {
        throw GameDataError("Unknown species id: '" + id + "'");
    }
    return it->second;
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
