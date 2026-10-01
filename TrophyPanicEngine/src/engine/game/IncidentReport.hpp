#pragma once
#include "engine/game/HuntLoop.hpp"

#include <ostream>
#include <string>

namespace tp {

// Serializes a finished hunt as a human-readable JSON "incident report":
// contract, seeds, the generated animal, every shot, the event transcript,
// the physiological end-state, and the score. The seeds inside make the
// hunt reproducible — feed the same contract + seeds back through
// HuntLoopSim and the identical hunt replays.
void writeIncidentReportJson(const HuntResult& result, const Contract& contract,
                             std::ostream& out);

// Convenience: writes to `path`, creating parent directories if needed.
// Returns false (and leaves no partial file guarantee) on I/O failure.
bool saveIncidentReport(const HuntResult& result, const Contract& contract,
                        const std::string& path);

} // namespace tp
