
int testa = 0;
int testb = 10000;

ISR(TIMER1_COMPA_vect) {
    OCR1A += 62500;
    PORTB ^= (1 << PB5);  // toggle pin 13 (LED on many Arduinos)
}
ISR(TIMER1_COMPB_vect) {
    OCR1B += 62500/3;
    PORTB ^= (1 << PB5);  // toggle pin 13 (LED on many Arduinos)
}

void setup() {
    TCCR1A = 0;
    TCCR1B = 0;
    TCCR1B = B00000100;
    OCR1A = 62500;
    OCR1B = 62500/3;
    TIMSK1 |= (1 << OCIE1A) | (1 << OCIE1B);

    //Serial.begin(9600);
}

void loop() {
    //while(true);
}