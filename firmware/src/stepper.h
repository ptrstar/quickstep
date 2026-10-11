// Timer1 step interrupt. The logic is qs::StepCore (tested natively); this file only touches pins.
#pragma once

#include "step_core.h"

namespace stepper {

void init();

// Producer side for the main loop.
qs::SliceQueue& queue();

// True when no slice is running or queued.
bool idle();

// Emergency stop: drop all queued slices and disable the drivers.
void stop();

}  // namespace stepper
