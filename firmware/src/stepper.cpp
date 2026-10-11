#include "stepper.h"

#include <avr/interrupt.h>
#include <avr/io.h>
#include <util/delay.h>

#include "config.h"

namespace stepper {

namespace {
qs::SliceQueue slices;
qs::StepCore core;
volatile bool idleFlag = true;
}  // namespace

void init() {
  DDRD |= STEP_BITS | DIR_BITS;
  PORTD &= ~(STEP_BITS | DIR_BITS);
  DDRB |= ENABLE_BIT;
  PORTB |= ENABLE_BIT;  // drivers off until the first move: the carriage can be moved by hand

  // Timer1, CTC mode (TOP = OCR1A), prescaler 8: 2 MHz ticks.
  TCCR1A = 0;
  TCCR1B = (1 << WGM12) | (1 << CS11);
  OCR1A = qs::IDLE_PERIOD - 1;
  TCNT1 = 0;
  TIMSK1 = 1 << OCIE1A;
}

qs::SliceQueue& queue() { return slices; }

bool idle() { return idleFlag && slices.empty(); }

void stop() {
  TIMSK1 = 0;
  slices.clear();
  core.reset();
  PORTB |= ENABLE_BIT;
  idleFlag = true;
}

}  // namespace stepper

ISR(TIMER1_COMPA_vect) {
  qs::StepEvent e = stepper::core.tick(stepper::slices);
  if (e.steps) {
    PORTD |= e.steps << STEP_SHIFT;
    _delay_us(STEP_PULSE_US);
    PORTD &= ~STEP_BITS;
  }
  if (e.setDirs) {
    PORTD = (PORTD & ~DIR_BITS) | (((e.dirs ^ DIR_INVERT) & 0x7) << DIR_SHIFT);
  }
  if (e.motorsOff) PORTB |= ENABLE_BIT;
  if (e.enable) PORTB &= ~ENABLE_BIT;
  stepper::idleFlag = e.idle;
  OCR1A = e.period - 1;  // CTC counts 0..OCR1A
}
