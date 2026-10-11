#include "uart.h"

#include <avr/interrupt.h>
#include <avr/io.h>

namespace uart {

namespace {
// 256 entries indexed by uint8_t: the indices wrap by themselves. One slot stays free to tell full
// from empty, hence RX_SIZE = 255.
uint8_t buffer[256];
volatile uint8_t head = 0;  // next byte to read (main loop)
volatile uint8_t tail = 0;  // next free slot (ISR)
volatile bool overrunFlag = false;
uint8_t freed = 0;  // bytes read since the last credit report
const uint8_t REPORT_EVERY = 32;
}  // namespace

void init() {
  // 250000 baud, 8N1: with U2X at 16 MHz, UBRR = 16e6 / (8 · 250000) − 1 = 7 exactly.
  UCSR0A = 1 << U2X0;
  UBRR0 = 7;
  UCSR0C = (1 << UCSZ01) | (1 << UCSZ00);
  UCSR0B = (1 << RXEN0) | (1 << TXEN0) | (1 << RXCIE0);
}

void write(uint8_t b) {
  while (!(UCSR0A & (1 << UDRE0))) {
  }
  UDR0 = b;
}

bool empty() { return head == tail; }
bool overrun() { return overrunFlag; }

int Source::read() {
  if (head == tail) return -1;
  uint8_t b = buffer[head];
  head = head + 1;
  freed++;
  return b;
}

void service() {
  // Report in batches, and whatever is left once the buffer runs empty, so the host never waits.
  if (freed >= REPORT_EVERY || (freed > 0 && empty())) {
    uint8_t k = freed > 127 ? 127 : freed;
    write(k);
    freed -= k;
  }
}

}  // namespace uart

ISR(USART_RX_vect) {
  uint8_t b = UDR0;
  uint8_t next = uart::tail + 1;
  if (next == uart::head) {
    uart::overrunFlag = true;  // host ignored flow control
  } else {
    uart::buffer[uart::tail] = b;
    uart::tail = next;
  }
}
