#include "engine/world/Terrain.hpp"

#include <algorithm>
#include <cmath>

namespace tp {

namespace {

// Deterministic integer hash -> [0,1). Used for value noise so terrain
// depends only on (seed, cell), never on call order — unlike drawing from
// a sequential Rng, which would make the map depend on generation order.
double hash01(std::uint64_t seed, std::uint64_t x, std::uint64_t y, std::uint64_t salt) {
    std::uint64_t h = seed ^ (x * 0x9E3779B97F4A7C15ull) ^
                      (y * 0xC2B2AE3D27D4EB4Full) ^ (salt * 0x165667B19E3779F9ull);
    h ^= h >> 30; h *= 0xBF58476D1CE4E5B9ull;
    h ^= h >> 27; h *= 0x94D049BB133111EBull;
    h ^= h >> 31;
    return static_cast<double>(h >> 11) * (1.0 / 9007199254740992.0);
}

// Smoothed 2-octave value noise over the cell lattice.
double valueNoise(std::uint64_t seed, double x, double y, std::uint64_t salt) {
    const double x0 = std::floor(x);
    const double y0 = std::floor(y);
    const double tx = x - x0;
    const double ty = y - y0;
    const auto ix = static_cast<std::uint64_t>(static_cast<std::int64_t>(x0) + (1 << 20));
    const auto iy = static_cast<std::uint64_t>(static_cast<std::int64_t>(y0) + (1 << 20));

    const double a = hash01(seed, ix, iy, salt);
    const double b = hash01(seed, ix + 1, iy, salt);
    const double c = hash01(seed, ix, iy + 1, salt);
    const double d = hash01(seed, ix + 1, iy + 1, salt);

    const double sx = tx * tx * (3.0 - 2.0 * tx);
    const double sy = ty * ty * (3.0 - 2.0 * ty);
    const double top = a + (b - a) * sx;
    const double bottom = c + (d - c) * sx;
    return top + (bottom - top) * sy;
}

double fractalNoise(std::uint64_t seed, double x, double y, std::uint64_t salt) {
    return valueNoise(seed, x * 0.06, y * 0.06, salt) * 0.65 +
           valueNoise(seed, x * 0.18, y * 0.18, salt + 1) * 0.35;
}

} // namespace

TerrainGrid TerrainGrid::generate(std::uint64_t seed, int widthCells, int heightCells,
                                  double cellSizeM) {
    TerrainGrid grid;
    grid.width_ = std::max(8, widthCells);
    grid.height_ = std::max(8, heightCells);
    grid.cellSizeM_ = cellSizeM;
    grid.seed_ = seed;
    grid.cells_.resize(static_cast<std::size_t>(grid.width_) * grid.height_);

    const int w = grid.width_;
    const int h = grid.height_;

    // Creek: a wandering north-south band, its west-east position driven by
    // 1D noise per row so it meanders deterministically.
    for (int cy = 0; cy < h; ++cy) {
        for (int cx = 0; cx < w; ++cx) {
            TerrainCell& cell = grid.cellRef(cx, cy);

            const double base = fractalNoise(seed, cx, cy, 7);
            // Height rises toward the north-east corner (the rocky slope).
            const double slopeBias =
                (static_cast<double>(cx) / w + static_cast<double>(cy) / h) * 0.5;
            cell.heightM = base * 18.0 + slopeBias * slopeBias * 40.0;

            cell.vegetationDensity01 = fractalNoise(seed, cx, cy, 13);

            const double creekCenter =
                w * (0.55 + 0.15 * (valueNoise(seed, 0.0, cy * 0.07, 29) - 0.5));
            const bool inCreek = std::abs(cx - creekCenter) < 1.5;

            if (inCreek) {
                cell.zone = ZoneType::Creek;
                cell.surface = SurfaceType::Water;
                cell.water = true;
                cell.heightM -= 2.0;
                cell.vegetationDensity01 = 0.0;
                cell.traversalCost = 4.0;
            } else if (cell.heightM > 34.0) {
                cell.zone = ZoneType::RockySlope;
                cell.surface = SurfaceType::Rock;
                cell.vegetationDensity01 *= 0.2;
                cell.traversalCost = 2.2;
            } else if (cell.vegetationDensity01 > 0.72) {
                cell.zone = ZoneType::DenseCover;
                cell.surface = SurfaceType::Soil;
                cell.traversalCost = 1.8;
            } else if (cell.vegetationDensity01 < 0.30) {
                cell.zone = ZoneType::Meadow;
                cell.surface = SurfaceType::Grass;
                cell.traversalCost = 1.0;
            } else {
                cell.zone = ZoneType::Forest;
                cell.surface = SurfaceType::Soil;
                cell.traversalCost = 1.25;
            }

            // Mud along the creek banks: slower, but holds tracks well.
            if (!inCreek) {
                if (std::abs(cx - creekCenter) < 3.5) {
                    cell.surface = SurfaceType::Mud;
                    cell.traversalCost = std::max(cell.traversalCost, 1.6);
                }
            }

            cell.cover01 = std::clamp(
                cell.vegetationDensity01 * (cell.zone == ZoneType::DenseCover ? 1.2 : 0.9),
                0.0, 1.0);
        }
    }

    // Fixed anchor zones: camp in the south-west, extraction in the
    // north-east. Small stamped squares so they always exist regardless of
    // what the noise painted there.
    auto stampZone = [&](int centerX, int centerY, int radius, ZoneType zone,
                         SurfaceType surface) {
        for (int cy = centerY - radius; cy <= centerY + radius; ++cy) {
            for (int cx = centerX - radius; cx <= centerX + radius; ++cx) {
                if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
                TerrainCell& cell = grid.cellRef(cx, cy);
                cell.zone = zone;
                cell.surface = surface;
                cell.water = false;
                cell.vegetationDensity01 = 0.05;
                cell.cover01 = 0.05;
                cell.traversalCost = 1.0;
            }
        }
    };
    stampZone(w / 8, h / 8, 2, ZoneType::Camp, SurfaceType::Soil);
    stampZone(w - 1 - w / 8, h - 1 - h / 8, 2, ZoneType::Extraction, SurfaceType::Grass);

    return grid;
}

const TerrainCell& TerrainGrid::cell(int cx, int cy) const {
    const int x = std::clamp(cx, 0, width_ - 1);
    const int y = std::clamp(cy, 0, height_ - 1);
    return cells_[static_cast<std::size_t>(y) * width_ + x];
}

TerrainCell& TerrainGrid::cellRef(int cx, int cy) {
    const int x = std::clamp(cx, 0, width_ - 1);
    const int y = std::clamp(cy, 0, height_ - 1);
    return cells_[static_cast<std::size_t>(y) * width_ + x];
}

const TerrainCell& TerrainGrid::cellAtWorld(double x, double y) const {
    return cell(static_cast<int>(std::floor(x / cellSizeM_)),
                static_cast<int>(std::floor(y / cellSizeM_)));
}

double TerrainGrid::heightAt(double x, double y) const {
    return cellAtWorld(x, y).heightM;
}

Vec3 TerrainGrid::zoneCenter(ZoneType zone) const {
    for (int cy = 0; cy < height_; ++cy) {
        for (int cx = 0; cx < width_; ++cx) {
            if (cell(cx, cy).zone == zone) {
                const double x = (cx + 0.5) * cellSizeM_;
                const double y = (cy + 0.5) * cellSizeM_;
                return {x, y, cell(cx, cy).heightM};
            }
        }
    }
    return {worldWidthM() * 0.5, worldHeightM() * 0.5, 0.0};
}

bool TerrainGrid::zoneExists(ZoneType zone) const {
    for (const auto& c : cells_) {
        if (c.zone == zone) return true;
    }
    return false;
}

const char* toString(SurfaceType s) {
    switch (s) {
        case SurfaceType::Soil:  return "Soil";
        case SurfaceType::Grass: return "Grass";
        case SurfaceType::Rock:  return "Rock";
        case SurfaceType::Mud:   return "Mud";
        case SurfaceType::Water: return "Water";
    }
    return "Unknown";
}

const char* toString(ZoneType z) {
    switch (z) {
        case ZoneType::Camp:       return "Camp";
        case ZoneType::Forest:     return "Forest";
        case ZoneType::Meadow:     return "Meadow";
        case ZoneType::Creek:      return "Creek";
        case ZoneType::RockySlope: return "RockySlope";
        case ZoneType::DenseCover: return "DenseCover";
        case ZoneType::Extraction: return "Extraction";
    }
    return "Unknown";
}

} // namespace tp
