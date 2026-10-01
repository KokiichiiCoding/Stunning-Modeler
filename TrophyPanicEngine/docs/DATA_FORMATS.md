# Data Formats

All gameplay data is JSON, parsed by the engine's own dependency-free parser
(`engine/io/Json.*`). Bad data throws `GameDataError` with the file name and
offending field. Unknown fields are ignored (forward compatibility); every
field listed as *optional* has the default shown.

Units are real: meters, kilograms, seconds, Joules, milliliters.

---

## Species — `data/species/<id>.json`

One file per species. Two halves: the **anatomy** (`body_parts`, consumed by
the ballistics/physiology pipeline) and the **profile** (everything else,
consumed by generation, ecology, and behavior).

```json
{
  "id": "prototype_deer",              // required, lookup key
  "display_name": "Prototype Ridge Deer",
  "max_blood_volume_ml": 5000.0,       // optional, default 5000

  "body_mass_kg_range": [45.0, 110.0], // optional [min,max], default [50,100]
  "trophy": {
    "organ": "antler_rack",            // body part id of the trophy
    "base_score_range": [25.0, 90.0]   // biological-quality span for the species
  },
  "movement": {                        // optional, all m/s
    "walk_mps": 1.1, "trot_mps": 3.5, "run_mps": 12.0,
    "max_stamina_s": 60.0              // seconds of sustained sprint
  },
  "senses": {
    "vision_range_m": 180.0,
    "vision_fov_deg": 310.0,
    "hearing_sensitivity": 1.3,        // multiplier on perceived loudness
    "smell_threshold": 0.10            // scent intensity needed to detect
  },
  "behavior": {
    "grouping": "herd",                // "herd" | "solitary"
    "fear_threshold": 30.0,            // alertness (0-100) that triggers flight
    "aggression_threshold": 999.0,     // alertness that triggers charging (999 = never)
    "curiosity": 0.45,                 // 0..1, weight of investigating vs ignoring
    "defensive_radius_m": 0.0,         // inside this range threats may be answered
    "wounded_style": "flee_bed",       // "flee_bed" | "flee_circle_charge" | "defensive"
    "preferred_terrain": ["forest", "meadow"],
    "active_periods": ["dawn", "dusk"]
  },
  "tracks": {
    "stride_m": 1.3,
    "print_size_cm": 7.0
  },

  "body_parts": [
    {
      "id": "primary_thorax_left",     // required
      "tissue": "lung",                // muscle | dense_bone | lung | heart |
                                       // liver_gut | brain | major_vessel
      "bone_integrity": 0.0,           // optional; >0 makes it breakable
      "load_bearing": false,           // optional; failed load-bearers cripple gait
      "trophy_organ": false,           // optional; damage lowers Trophy Integrity
      "layers": [                      // optional; enables layered traversal
        {"tissue_name": "skin",  "thickness_cm": 0.3, "resistance": 0.4},
        {"tissue_name": "rib",   "thickness_cm": 1.0, "resistance": 4.0, "is_bone_layer": true},
        {"tissue_name": "lung",  "thickness_cm": 15,  "resistance": 0.7, "is_organ_layer": true}
      ]
    }
  ]
}
```

Body parts without `layers` use the legacy single-resistance impact model —
Milestone 0 prototypes keep working unchanged.

## Ammunition — `data/ammunition.json`

```json
{
  "projectiles": {
    "308_soft_point": {
      "display_name": ".308 Soft Point",
      "kind": "expanding_bullet",   // expanding_bullet | broadhead | steel_nail |
                                    // blunt_object | air_impulse
      "mass_kg": 0.0097,
      "muzzle_velocity_mps": 840.0,
      "energy_half_distance_m": 150.0,  // optional, default 150
      "base_penetration_m": 0.45,       // optional, default 0
      "expansion_factor": 2.0,          // optional, default 1
      "blunt_shock_scale": 1.0          // optional, default 1
    }
  }
}
```

The absurd equipment lives here too (`throwing_boot`, `rubber_chicken`,
`leaf_blower`) — same physics, honest parameters. No projectile carries an
abstract damage number.

## Items — `data/items.json`

Hunter equipment. Weapons/throwables reference a projectile id; anything
noisy declares its world-sound category and loudness so using it feeds
animal hearing through the same `SoundLog` as everything else.

```json
{
  "items": {
    "bolt_rifle_308": {
      "display_name": "Bolt-Action Rifle (.308)",
      "kind": "rifle",              // rifle | bow | thrown | tool | optic |
                                    // call | harvest_tool | utility
      "projectile": "308_soft_point",
      "magazine_size": 4,
      "fire_sound": "gunshot",      // SoundCategory, snake_case; omit = silent
      "fire_loudness": 250000.0     // source intensity at 1 m
    },
    "binoculars": { "kind": "optic", "magnification": 8.0 },
    "rangefinder": { "kind": "optic", "magnification": 6.0, "ranging": true }
  }
}
```

## Scenarios — `data/scenarios/*.json`

Scripted shot sequences against one animal; used by `tp_scenario` and the
golden regression tests.

```json
{
  "title": "Clean lung shot, deer, 80m broadside",
  "species": "prototype_deer",
  "shots": [
    {
      "ammunition": "308_soft_point",  // required
      "body_part": "primary_thorax_left", // required
      "distance_m": 80,                // optional, default 50
      "angle_deg": 90,                 // optional, default 90 (perpendicular)
      "tissue_resistance": 1.0,        // optional; legacy non-layered parts only
      "dense_bone": false,             // optional legacy override
      "fire_at_seconds": 0.0           // optional firing time
    }
  ],
  "run_duration_seconds": 60,          // optional, default 120
  "biological_quality_percent": 100,   // legacy placeholder path
  "animal_seed": 42                    // optional; when present, a generated
                                       // individual replaces the placeholder
}
```

## Contracts — `data/contracts/*.json`

A contract is a complete reproducible hunt: it embeds the world seed and the
animal seed. Loaded via `loadContractFromFile`, validated against the
registry (unknown species/items are actionable errors).

```json
{
  "id": "clean_harvest_deer",
  "title": "Clean Harvest: Ridge Deer near the meadow",
  "type": "clean_harvest",          // clean_harvest | problem_animal |
                                    // research_observation
  "species": "prototype_deer",
  "region": "meadow",               // camp|forest|meadow|creek|rocky_slope|
                                    // dense_cover|extraction|any
  "min_trophy_quality": 50.0,       // optional, default 0
  "max_shots": 3,                   // optional, default 99
  "time_limit_s": 1800.0,           // optional, default 1800
  "reward_credits": 450.0,          // optional
  "allowed_equipment": ["bolt_rifle_308", "binoculars", "field_knife"],
  "observation_range_m": 60.0,      // research contracts only
  "observation_time_s": 10.0,       // research contracts only
  "world_seed": 1234,
  "animal_seed": 42
}
```

## Incident reports — `incident_reports/*.json` (output)

Written by `tp_hunt` (and `saveIncidentReport`). Contains the contract,
seeds, the generated animal, every shot (distance, energy, bleed, exit
wound), the full event transcript, the physiological outcome, and the
four-part trophy score. Parseable by the engine's own JSON parser (tested),
and sufficient to reproduce the hunt exactly.
