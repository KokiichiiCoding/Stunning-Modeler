#pragma once
#include "engine/math/Vec3.hpp"

#include <cstdint>
#include <string>
#include <vector>

namespace tp {

// World coordinate convention (documented once, used everywhere):
// x and y span the horizontal ground plane in meters, z is up.
// TerrainGrid::heightAt returns the ground z for a horizontal (x, y).

enum class SurfaceType { Soil, Grass, Rock, Mud, Water };

// Coarse gameplay zoning painted over the surface grid. Every generated map
// contains at least: Camp, Forest, Meadow, Creek, RockySlope, DenseCover,
// Extraction (the vertical-slice checklist).
enum class ZoneType { Camp, Forest, Meadow, Creek, RockySlope, DenseCover, Extraction };

struct TerrainCell {
    double heightM{};
    SurfaceType surface{SurfaceType::Grass};
    ZoneType zone{ZoneType::Forest};
    double vegetationDensity01{}; // 0 bare .. 1 impassable brush
    double cover01{};             // concealment value for perception checks
    double traversalCost{1.0};    // 1 = easy walking; higher = slower
    bool water{false};
};

class TerrainGrid {
public:
    // Deterministic procedural generation: the same seed always produces
    // the identical map. Dimensions are in cells; cellSizeM converts to
    // world meters.
    static TerrainGrid generate(std::uint64_t seed,
                                int widthCells = 64,
                                int heightCells = 64,
                                double cellSizeM = 8.0);

    [[nodiscard]] int widthCells() const { return width_; }
    [[nodiscard]] int heightCells() const { return height_; }
    [[nodiscard]] double cellSizeM() const { return cellSizeM_; }
    [[nodiscard]] double worldWidthM() const { return width_ * cellSizeM_; }
    [[nodiscard]] double worldHeightM() const { return height_ * cellSizeM_; }
    [[nodiscard]] std::uint64_t seed() const { return seed_; }

    // Indices are clamped to the grid edge, so out-of-bounds queries return
    // the border cell instead of crashing — callers at the world edge get
    // sensible values.
    [[nodiscard]] const TerrainCell& cell(int cx, int cy) const;
    [[nodiscard]] const TerrainCell& cellAtWorld(double x, double y) const;
    [[nodiscard]] double heightAt(double x, double y) const;

    // Center (in world meters) of the first cell found with the zone, or
    // the map center if the zone is missing (generate() always places all
    // zones, so the fallback is defensive only).
    [[nodiscard]] Vec3 zoneCenter(ZoneType zone) const;
    [[nodiscard]] bool zoneExists(ZoneType zone) const;

private:
    int width_{};
    int height_{};
    double cellSizeM_{};
    std::uint64_t seed_{};
    std::vector<TerrainCell> cells_;

    [[nodiscard]] TerrainCell& cellRef(int cx, int cy);
};

[[nodiscard]] const char* toString(SurfaceType s);
[[nodiscard]] const char* toString(ZoneType z);

} // namespace tp
