// CNC Shield V3 pin definitions
#define X_STEP 2
#define X_DIR  5
#define Y_STEP 3
#define Y_DIR  6
#define Z_STEP 4
#define Z_DIR  7
#define ENABLE_PIN 8

#define X_MICROSTEPS 8
#define Y_MICROSTEPS 8
#define Z_MICROSTEPS 8

#define LIFT_AMT 20

#define MAX_SPEED 50 // steps per second

const uint8_t IM[] PROGMEM = {
  0x03
};


uint16_t IP = 0;
uint8_t printhead_down = 0;
uint8_t instr_buffer = 0;
uint8_t instr_buffer_index = 0;
uint16_t data_size = 0x08; // amt of bits used per data point, 0: 4 bit signed ints, 1: (default) 8 bit signed ints, 2: 16 bit signed ints

const uint16_t instrCount = sizeof(IM) / sizeof(IM[0]);

void setup() {
  pinMode(X_STEP, OUTPUT); 
  pinMode(X_DIR, OUTPUT);  
  pinMode(Y_STEP, OUTPUT); 
  pinMode(Y_DIR, OUTPUT);  
  pinMode(Z_STEP, OUTPUT); 
  pinMode(Z_DIR, OUTPUT);  

  pinMode(ENABLE_PIN, OUTPUT);

  digitalWrite(X_DIR, LOW);
  digitalWrite(Y_DIR, LOW);
  digitalWrite(Z_DIR, LOW);

  digitalWrite(X_STEP, LOW);
  digitalWrite(Y_STEP, LOW);
  digitalWrite(Z_STEP, LOW);

  digitalWrite(ENABLE_PIN, LOW);

  while (!Serial);
  // Serial.begin(9600);
  delay(1500);
  // Serial.println("START");
}

uint8_t fetch_instr() {
  // load new instruction
  if (instr_buffer_index == 0) {
    instr_buffer = pgm_read_byte(&IM[IP]);
    IP++;
    instr_buffer_index = 4; 
  }
  uint8_t mask = 0x03;
  uint8_t instr = mask & instr_buffer;
  instr_buffer = instr_buffer >> 2;
  instr_buffer_index--;
  return instr;
}

void loop() {

  if (IP >= instrCount) return;

  uint8_t instr = fetch_instr();

  switch(instr) {
    case 0x00:
      i_toggle_printhead();
      break;
    case 0x01:
      i_set_datasize();
      break;
    case 0x02:
      i_move();
      break;
    case 0x03:
      i_exit();
      break;
  }
}
void drive(int pin) {
  digitalWrite(pin, HIGH);
  delayMicroseconds(2);
  digitalWrite(pin, LOW);
}

void i_toggle_printhead() {
  if (printhead_down) {
    digitalWrite(Z_DIR, LOW);
  } else {
    digitalWrite(Z_DIR, HIGH);
  }
  printhead_down = !printhead_down;
  for (uint8_t i = 0; i < LIFT_AMT * Z_MICROSTEPS; i++) {
    drive(Z_STEP);
    delay(max(2, 1000/MAX_SPEED));
  }
}

void i_set_datasize() {
  uint8_t instr = fetch_instr();
  data_size = 0x04 << instr;
}

void i_move() {
  
  uint32_t yx;

  switch (data_size) {
    case 0x04:
      yx = pgm_read_byte(&IM[IP]);
      IP++;
    case 0x08:
      yx = pgm_read_word(&IM[IP]);
      IP += 2;
    case 0x04:
      yx = pgm_read_dword(&IM[IP]);
      IP += 4;
  }
  
  // read data_size many bits for both x and y
  int32_t readY = (yx >> data_size);
  int32_t readX = (yx & ((1 << data_size)-1));

  // extend negative numbers eg. for data size = 4
  // readY = ...00001000 as msb is 1 we need to extend to
  // readY = ...11111000 to retain the same value
  if (readY & (1 << (data_size-1))) {
    readY = readY | ~((1 << data_size)-1);
  }
  if (readX & (1 << (data_size-1))) {
    readX = readX | ~((1 << data_size)-1);
  }

  // set direction
  digitalWrite(X_DIR, (readX < 0) ? LOW : HIGH);
  digitalWrite(Y_DIR, (readY < 0) ? LOW : HIGH);

  // driver
  uint32_t tarX = abs(readX);
  uint32_t tarY = abs(readY);
  uint64_t posX = 0;
  uint64_t posY = 0;
  uint64_t current_time;

  uint32_t dist = sqrt(sq(tarX) + sq(tarY));
  uint64_t duration = 1000000 * dist / MAX_SPEED; // in millis

  uint32_t start_time = micros();
  uint32_t wait;

  uint64_t mtX = tarX * X_MICROSTEPS;
  uint64_t mtY = tarY * Y_MICROSTEPS;

  while (posX != mtX || posY != mtY) {
    current_time = micros() - start_time;
    wait = 0;

    uint64_t stepX = mtX * current_time / duration;
    uint64_t stepY = mtY * current_time / duration;

    if (stepX > posX) {
      drive(X_STEP);
      posX++;
      wait = 1;
    }
    if (stepY > posY) {
      drive(Y_STEP);
      posY++;
      wait = 1;
    }

    if (wait) {delayMicroseconds(500);}
  }
}
void i_exit() {
  // Serial.println("i_exit()");
  digitalWrite(ENABLE_PIN, HIGH);
  while(true);
}