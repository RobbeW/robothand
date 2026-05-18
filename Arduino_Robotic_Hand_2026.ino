/*
  Copyright (c) 2026 Robbe Wulgaert

  Project Robothand J1
  Robbe Wulgaert
  Website: https://www.robbewulgaert.be
  Projectpagina: https://robbew.github.io/robothand/

*/

#include <Servo.h>

// ------------------------------------------------------------
// Hardware-instellingen
// ------------------------------------------------------------

const int N_FINGERS = 5;

// Volgorde: duim, wijsvinger, middenvinger, ringvinger, pink
const int sensorPins[N_FINGERS] = {A0, A1, A2, A3, A4};

// Code 2 gebruikte pinnen 2, 3, 4, 5, 6.
// Pas enkel deze rij aan als je bedrading anders is.
const int servoPins[N_FINGERS] = {2, 3, 4, 5, 6};

// Zet per vinger op true als de richting omgekeerd voelt.
const bool invertSensor[N_FINGERS] = {false, false, false, false, false};

// ------------------------------------------------------------
// Servo-instellingen
// ------------------------------------------------------------

const int SERVO_MIN = 10;
const int SERVO_MAX = 160;
// Kleine schommelingen rond dezelfde doelhoek worden genegeerd.
const int SERVO_DEADBAND_DEGREES = 2;
// Servo's bewegen per update maximaal zoveel graden richting hun doel.
const int SERVO_MAX_STEP_DEGREES = 4;

// Zet per vinger op true als de servo verkeerd om beweegt.
const bool invertServo[N_FINGERS] = {false, false, false, false, false};

Servo servos[N_FINGERS];
int servoAngles[N_FINGERS] = {SERVO_MIN, SERVO_MIN, SERVO_MIN, SERVO_MIN, SERVO_MIN};

// ------------------------------------------------------------
// Sensorverwerking
// ------------------------------------------------------------

const int NUM_SAMPLES = 12;
const int MIN_CALIBRATION_RANGE = 60;
// Kleine meetruis in procenten wordt niet doorgestuurd naar de servo's.
const int SENSOR_DEADBAND_PERCENT = 2;

int smoothingBuffer[N_FINGERS][NUM_SAMPLES];
long smoothingTotal[N_FINGERS] = {0};
int smoothingIndex = 0;

int sensorMin[N_FINGERS];
int sensorMax[N_FINGERS];

int rawAdc[N_FINGERS] = {0};
int smoothAdc[N_FINGERS] = {0};
int fingerValues[N_FINGERS] = {0};  // 0 = open, 100 = gebogen

// ------------------------------------------------------------
// Timing
// ------------------------------------------------------------

const unsigned long SERVO_INTERVAL_MS = 35;
const unsigned long SERIAL_INTERVAL_MS = 75;

unsigned long previousServoTime = 0;
unsigned long previousSerialTime = 0;

// ------------------------------------------------------------
// Blad-steen-schaar
// ------------------------------------------------------------

const int ROCK = 1;
const int PAPER = 2;
const int SCISSORS = 3;
const int NAG = -1;

const int ROUNDS_PER_MATCH = 5;
const int GESTURE_THRESHOLD = 55;

int playerGesture = 0;
int opponentGesture = 0;
int selectedOpponentGesture = ROCK;

int playerRounds[ROUNDS_PER_MATCH] = {0};
int opponentRounds[ROUNDS_PER_MATCH] = {0};

bool matchRunning = false;
bool matchComplete = true;
bool roundCaptured = false;

int currentRound = 0;
int countdown = 0;

unsigned long roundStartTime = 0;
unsigned long roundIntervalMs = 5000;

// ------------------------------------------------------------
// Seriële inputbuffer
// ------------------------------------------------------------

const int SERIAL_BUFFER_SIZE = 96;
char serialBuffer[SERIAL_BUFFER_SIZE];
int serialBufferIndex = 0;
int previousMatchTrigger = 0;

// ------------------------------------------------------------
// Setup
// ------------------------------------------------------------

void setup() {
  Serial.begin(9600);

  for (int i = 0; i < N_FINGERS; i++) {
    pinMode(sensorPins[i], INPUT);

    int startValue = analogRead(sensorPins[i]);

    sensorMin[i] = startValue;
    sensorMax[i] = startValue;

    smoothingTotal[i] = 0;
    for (int j = 0; j < NUM_SAMPLES; j++) {
      smoothingBuffer[i][j] = startValue;
      smoothingTotal[i] += startValue;
    }

    servos[i].attach(servoPins[i]);
    servoAngles[i] = SERVO_MIN;
    servos[i].write(servoAngles[i]);
  }
}

// ------------------------------------------------------------
// Hoofdlus
// ------------------------------------------------------------

void loop() {
  processIncomingSerial();
  updateSensorsAndServos();
  updateMatchState();
  sendSerialData();
}

// ------------------------------------------------------------
// Sensoren en servos
// ------------------------------------------------------------

void updateSensorsAndServos() {
  unsigned long now = millis();

  if (now - previousServoTime < SERVO_INTERVAL_MS) {
    return;
  }

  previousServoTime = now;

  readSensors();

  for (int i = 0; i < N_FINGERS; i++) {
    int targetAngle = map(fingerValues[i], 0, 100, SERVO_MIN, SERVO_MAX);

    if (invertServo[i]) {
      targetAngle = map(fingerValues[i], 0, 100, SERVO_MAX, SERVO_MIN);
    }

    targetAngle = constrain(targetAngle, SERVO_MIN, SERVO_MAX);

    int difference = targetAngle - servoAngles[i];
    if (abs(difference) <= SERVO_DEADBAND_DEGREES) {
      continue;
    }

    int stepSize = min(abs(difference), SERVO_MAX_STEP_DEGREES);
    if (difference < 0) {
      stepSize = -stepSize;
    }

    servoAngles[i] = constrain(servoAngles[i] + stepSize, SERVO_MIN, SERVO_MAX);
    servos[i].write(servoAngles[i]);
  }
}

void readSensors() {
  for (int i = 0; i < N_FINGERS; i++) {
    rawAdc[i] = analogRead(sensorPins[i]);

    smoothingTotal[i] -= smoothingBuffer[i][smoothingIndex];
    smoothingBuffer[i][smoothingIndex] = rawAdc[i];
    smoothingTotal[i] += rawAdc[i];

    smoothAdc[i] = smoothingTotal[i] / NUM_SAMPLES;

    if (smoothAdc[i] < sensorMin[i]) {
      sensorMin[i] = smoothAdc[i];
    }

    if (smoothAdc[i] > sensorMax[i]) {
      sensorMax[i] = smoothAdc[i];
    }

    int range = sensorMax[i] - sensorMin[i];

    int value;
    if (range >= MIN_CALIBRATION_RANGE) {
      value = map(smoothAdc[i], sensorMin[i], sensorMax[i], 0, 100);
    } else {
      value = map(smoothAdc[i], 0, 1023, 0, 100);
    }

    if (invertSensor[i]) {
      value = 100 - value;
    }

    int nextValue = constrain(value, 0, 100);
    if (
      abs(nextValue - fingerValues[i]) > SENSOR_DEADBAND_PERCENT ||
      nextValue == 0 ||
      nextValue == 100
    ) {
      fingerValues[i] = nextValue;
    }
  }

  smoothingIndex++;
  if (smoothingIndex >= NUM_SAMPLES) {
    smoothingIndex = 0;
  }

  censorMiddleFingerGesture();
}

void censorMiddleFingerGesture() {
  const int MIN_BIRD = 25;
  const int MAX_BIRD = 55;

  int thumb = fingerValues[0];
  int index = fingerValues[1];
  int middle = fingerValues[2];
  int ring = fingerValues[3];
  int pinky = fingerValues[4];

  if (index > MAX_BIRD && middle < MIN_BIRD && ring > MAX_BIRD) {
    fingerValues[2] = 100;
  }
}

// ------------------------------------------------------------
// Gebarenherkenning
// ------------------------------------------------------------

int detectGesture() {
  bool indexFlexed = fingerValues[1] >= GESTURE_THRESHOLD;
  bool middleFlexed = fingerValues[2] >= GESTURE_THRESHOLD;
  bool ringFlexed = fingerValues[3] >= GESTURE_THRESHOLD;

  if (indexFlexed && middleFlexed && ringFlexed) {
    return ROCK;
  }

  if (!indexFlexed && !middleFlexed && !ringFlexed) {
    return PAPER;
  }

  if (!indexFlexed && !middleFlexed && ringFlexed) {
    return SCISSORS;
  }

  return NAG;
}

// ------------------------------------------------------------
// Matchlogica
// ------------------------------------------------------------

void startMatch() {
  matchRunning = true;
  matchComplete = false;
  roundCaptured = false;

  currentRound = 1;
  countdown = 4;

  playerGesture = 0;
  opponentGesture = selectedOpponentGesture;

  for (int i = 0; i < ROUNDS_PER_MATCH; i++) {
    playerRounds[i] = 0;
    opponentRounds[i] = 0;
  }

  roundStartTime = millis();
}

void updateMatchState() {
  if (!matchRunning) {
    return;
  }

  unsigned long now = millis();
  unsigned long elapsed = now - roundStartTime;

  if (elapsed < 1000) {
    countdown = 4;
  } else if (elapsed < 2000) {
    countdown = 3;
  } else if (elapsed < 3000) {
    countdown = 2;
  } else if (elapsed < 4000) {
    countdown = 1;
  } else {
    countdown = 0;
  }

  if (!roundCaptured && elapsed >= 4200) {
    playerGesture = detectGesture();
    opponentGesture = selectedOpponentGesture;

    int roundIndex = currentRound - 1;
    if (roundIndex >= 0 && roundIndex < ROUNDS_PER_MATCH) {
      playerRounds[roundIndex] = playerGesture;
      opponentRounds[roundIndex] = opponentGesture;
    }

    roundCaptured = true;
  }

  if (elapsed >= roundIntervalMs) {
    if (currentRound >= ROUNDS_PER_MATCH) {
      matchRunning = false;
      matchComplete = true;
      countdown = 0;
      currentRound = ROUNDS_PER_MATCH;
      return;
    }

    currentRound++;
    roundCaptured = false;
    countdown = 4;
    roundStartTime = now;
  }
}

// ------------------------------------------------------------
// Inkomende WebSerial-commando's
// ------------------------------------------------------------

void processIncomingSerial() {
  while (Serial.available() > 0) {
    char incoming = Serial.read();

    if (incoming == '\n' || incoming == '\r') {
      if (serialBufferIndex > 0) {
        serialBuffer[serialBufferIndex] = '\0';
        parseSerialCommand(serialBuffer);
        serialBufferIndex = 0;
      }
    } else {
      if (serialBufferIndex < SERIAL_BUFFER_SIZE - 1) {
        serialBuffer[serialBufferIndex] = incoming;
        serialBufferIndex++;
      }
    }
  }
}

void parseSerialCommand(char *line) {
  int values[9] = {0};
  int index = 0;

  char *token = strtok(line, ",");

  while (token != NULL && index < 9) {
    values[index] = atoi(token);
    token = strtok(NULL, ",");
    index++;
  }

  int incomingRoundInterval = values[4];
  int incomingMatchTrigger = values[5];
  int incomingOpponentGesture = values[8];

  if (incomingRoundInterval > 0) {
    incomingRoundInterval = constrain(incomingRoundInterval, 5, 15);
    roundIntervalMs = (unsigned long)incomingRoundInterval * 1000UL;
  }

  if (
    incomingOpponentGesture == ROCK ||
    incomingOpponentGesture == PAPER ||
    incomingOpponentGesture == SCISSORS
  ) {
    selectedOpponentGesture = incomingOpponentGesture;
  }

  if (
    incomingMatchTrigger == 1 &&
    previousMatchTrigger == 0 &&
    !matchRunning
  ) {
    startMatch();
  }

  previousMatchTrigger = incomingMatchTrigger;
}

// ------------------------------------------------------------
// Uitgaande data naar de website
// ------------------------------------------------------------

void sendSerialData() {
  unsigned long now = millis();

  if (now - previousSerialTime < SERIAL_INTERVAL_MS) {
    return;
  }

  previousSerialTime = now;

  Serial.print(0);                         // workbookMode

  Serial.print(",");
  Serial.print(0);                         // matchTrigger, niet meer nodig aan browserkant

  Serial.print(",");
  Serial.print(matchComplete ? 1 : 0);     // matchComplete

  Serial.print(",");
  Serial.print(countdown);                 // countdown

  for (int i = 0; i < N_FINGERS; i++) {
    Serial.print(",");
    Serial.print(fingerValues[i]);         // s0-s4, waarden 0-100
  }

  Serial.print(",");
  Serial.print(currentRound);              // huidige ronde

  Serial.print(",");
  Serial.print(playerGesture);             // huidig spelergebaar

  Serial.print(",");
  Serial.print(opponentGesture);           // huidig tegenspelergebaar

  for (int i = 0; i < ROUNDS_PER_MATCH; i++) {
    Serial.print(",");
    Serial.print(playerRounds[i]);         // speler rondes 1-5
  }

  for (int i = 0; i < ROUNDS_PER_MATCH; i++) {
    Serial.print(",");
    Serial.print(opponentRounds[i]);       // tegenspeler rondes 1-5
  }

  Serial.println();
}
