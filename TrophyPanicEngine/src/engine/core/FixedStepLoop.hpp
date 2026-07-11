#pragma once
#include <algorithm>
#include <chrono>
#include <utility>

namespace tp {

class FixedStepLoop {
public:
    using Clock = std::chrono::steady_clock;

    explicit FixedStepLoop(double tickSeconds = 1.0 / 60.0)
        : tickSeconds_(tickSeconds), previous_(Clock::now()) {}

    template <typename StepFn>
    void update(StepFn&& step) {
        const auto now = Clock::now();
        const std::chrono::duration<double> elapsed = now - previous_;
        previous_ = now;

        // Avoid a debugger pause creating thousands of catch-up steps.
        accumulator_ += std::min(elapsed.count(), 0.25);

        while (accumulator_ >= tickSeconds_) {
            std::forward<StepFn>(step)(tickSeconds_);
            accumulator_ -= tickSeconds_;
        }
    }

    [[nodiscard]] double interpolationAlpha() const {
        return accumulator_ / tickSeconds_;
    }

private:
    double tickSeconds_;
    double accumulator_{};
    Clock::time_point previous_;
};

} // namespace tp
