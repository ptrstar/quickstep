// Wiring of the CNC Shield V3 on an Arduino Uno. Adjust here if an axis runs the wrong way.
#pragma once

#include <avr/io.h>

// Step pins X, Y, Z = D2, D3, D4 = PD2..PD4. Direction pins X, Y, Z = D5, D6, D7 = PD5..PD7.
// The firmware relies on this order: step mask bit n → PD(2+n), direction bit n → PD(5+n).
#define STEP_SHIFT 2
#define DIR_SHIFT 5
#define STEP_BITS (0x7 << STEP_SHIFT)
#define DIR_BITS (0x7 << DIR_SHIFT)

// Driver enable: D8 = PB0, active low.
#define ENABLE_BIT (1 << PB0)

// Direction pin level for positive X, positive Y and pen down is HIGH (as in the v1 firmware).
// Set a bit to invert an axis: 1 = X, 2 = Y, 4 = Z.
#define DIR_INVERT 0

// Step pulse width in µs (TMC22xx needs 0.1 µs, A4988 1 µs).
#define STEP_PULSE_US 2
