#pragma once
#include <cmath>

namespace tp {

struct Vec3 {
    double x{};
    double y{};
    double z{};

    [[nodiscard]] double lengthSquared() const {
        return x * x + y * y + z * z;
    }

    [[nodiscard]] double length() const {
        return std::sqrt(lengthSquared());
    }

    [[nodiscard]] Vec3 normalized() const {
        const double len = length();
        if (len <= 1e-12) {
            return {};
        }
        return {x / len, y / len, z / len};
    }

    constexpr Vec3 operator+(const Vec3& rhs) const {
        return {x + rhs.x, y + rhs.y, z + rhs.z};
    }

    constexpr Vec3 operator-(const Vec3& rhs) const {
        return {x - rhs.x, y - rhs.y, z - rhs.z};
    }

    constexpr Vec3 operator*(double scalar) const {
        return {x * scalar, y * scalar, z * scalar};
    }

    static constexpr double dot(const Vec3& a, const Vec3& b) {
        return a.x * b.x + a.y * b.y + a.z * b.z;
    }
};

} // namespace tp
