#include <ESP8266WiFi.h>
#include <WiFiClient.h>
#include <ThingSpeak.h>

const char* ssid = "Arduino";
const char* password = "tana2010";

WiFiClient client;
unsigned long myChannelNumber = 3002707;
const char * myWriteAPIKey = "9G6WLME7YX2BVBAT";
const char * myReadAPIKey = "1GHETPILV0ESIJPS";

// Pin definitions
int ir1 = D1;
int led1 = D4;
int ir2 = D2;
int led2 = D5;
int ir3 = D3;
int led3 = D6;
int ldr = A0;

// Variables
int ambience = 0;
int motion_detected = 0;
int user_override = 0;

// Timing variables
unsigned long lastUpdate = 0;
const unsigned long updateInterval = 20000; // Update ThingSpeak every 20 seconds

// Light control variables - FIXED THRESHOLD VALUES
const int DARK_THRESHOLD = 300;  // Lower value = darker (was 800 - too high!)
const int BASE_BRIGHTNESS = 200;
const int MOTION_BRIGHTNESS = 1023; // Maximum brightness

// Calibration variables
int ldr_min = 1024;  // Will store minimum LDR reading (brightest)
int ldr_max = 0;     // Will store maximum LDR reading (darkest)
bool calibration_done = false;

void setup() {
  Serial.begin(9600);
  Serial.println();
  Serial.println("=== ESP8266 Smart Lighting System Starting ===");
  
  // Configure pins
  pinMode(ir1, INPUT);
  pinMode(led1, OUTPUT);
  pinMode(ir2, INPUT);
  pinMode(led2, OUTPUT);
  pinMode(ir3, INPUT);
  pinMode(led3, OUTPUT);
  
  Serial.println("Pins configured");
  
  // Initial LED test
  Serial.println("Testing LEDs...");
  analogWrite(led1, 512);
  analogWrite(led2, 512);
  analogWrite(led3, 512);
  delay(2000);
  analogWrite(led1, 0);
  analogWrite(led2, 0);
  analogWrite(led3, 0);
  Serial.println("LED test complete");
  
  // LDR Calibration
  Serial.println("=== LDR CALIBRATION ===");
  Serial.println("Please cover and uncover the LDR sensor for 10 seconds...");
  
  unsigned long calibration_start = millis();
  while (millis() - calibration_start < 10000) {
    int ldr_reading = analogRead(ldr);
    if (ldr_reading < ldr_min) ldr_min = ldr_reading;
    if (ldr_reading > ldr_max) ldr_max = ldr_reading;
    
    Serial.print("LDR: ");
    Serial.print(ldr_reading);
    Serial.print(" | Min: ");
    Serial.print(ldr_min);
    Serial.print(" | Max: ");
    Serial.println(ldr_max);
    
    delay(100);
  }
  
  // Set dynamic threshold
  int threshold_range = ldr_max - ldr_min;
  int dynamic_threshold = ldr_min + (threshold_range * 0.3); // 30% from bright end
  
  Serial.println("=== CALIBRATION COMPLETE ===");
  Serial.print("LDR Range: ");
  Serial.print(ldr_min);
  Serial.print(" (bright) to ");
  Serial.print(ldr_max);
  Serial.println(" (dark)");
  Serial.print("Dynamic Threshold: ");
  Serial.println(dynamic_threshold);
  
  calibration_done = true;
  
  // Connect to WiFi
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  
  int wifi_attempts = 0;
  while (WiFi.status() != WL_CONNECTED && wifi_attempts < 30) {
    delay(500);
    Serial.print(".");
    wifi_attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("WiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    ThingSpeak.begin(client);
    Serial.println("ThingSpeak initialized");
  } else {
    Serial.println();
    Serial.println("WiFi connection failed! Running in offline mode.");
  }
  
  Serial.println("=== Setup Complete ===");
}

void loop() {
  // Read sensors with debug info
  int s1 = digitalRead(ir1);
  int s2 = digitalRead(ir2);
  int s3 = digitalRead(ir3);
  
  // Invert IR sensor readings (assuming LOW = motion detected)
  s1 = !s1;
  s2 = !s2;
  s3 = !s3;
  
  // Read LDR value
  ambience = 1024 - analogRead(ldr);
  
  // Determine if any motion is detected
  motion_detected = (s1 || s2 || s3) ? 1 : 0;
  
  // Calculate dynamic threshold if calibration is done
  int current_threshold = DARK_THRESHOLD;
  if (calibration_done) {
    int threshold_range = ldr_max - ldr_min;
    current_threshold = ldr_min + (threshold_range * 0.3); // 30% from bright end
  }
  
  // Determine if it's dark
  bool is_dark = ambience > current_threshold;  // Higher LDR value = darker
  
  // Detailed debug output
  Serial.println("--- Sensor Readings ---");
  Serial.print("LDR Value: ");
  Serial.print(ambience);
  Serial.print(" | Threshold: ");
  Serial.print(current_threshold);
  Serial.print(" | Status: ");
  Serial.println(is_dark ? "DARK" : "BRIGHT");
  
  Serial.print("IR Sensors - Raw: ");
  Serial.print(!s1);
  Serial.print(",");
  Serial.print(!s2);
  Serial.print(",");
  Serial.print(!s3);
  Serial.print(" | Motion: ");
  Serial.print(s1);
  Serial.print(",");
  Serial.print(s2);
  Serial.print(",");
  Serial.println(s3);
  
  Serial.print("Motion Detected: ");
  Serial.println(motion_detected);
  Serial.print("User Override: ");
  Serial.println(user_override);
  
  // Control LEDs with improved logic
  controlLights(s1, s2, s3, is_dark);
  
  // Update ThingSpeak periodically
  if (WiFi.status() == WL_CONNECTED && millis() - lastUpdate > updateInterval) {
    Serial.println("--- ThingSpeak Update ---");
    updateThingSpeak();
    readUserOverride();
    lastUpdate = millis();
  }
  
  Serial.println("------------------------");
  delay(1000); // 1 second delay for easier debugging
}

void controlLights(int s1, int s2, int s3, bool is_dark) {
  int brightness = 0;
  
  Serial.print("Light Control Logic: ");
  
  // Check user override first
  if (user_override == 1) {
    brightness = MOTION_BRIGHTNESS;
    Serial.print("Override ON - ");
  } else if (user_override == 2) {
    brightness = 0;
    Serial.print("Override OFF - ");
  } else {
    // FIXED LOGIC: Only turn on lights if it's DARK
    if (is_dark) {
      if (motion_detected) {
        brightness = MOTION_BRIGHTNESS;
        Serial.print("DARK + Motion = FULL ON - ");
      } else {
        brightness = BASE_BRIGHTNESS;
        Serial.print("DARK Only = DIM ON - ");
      }
    } else {
      // It's bright (daylight) - NO lights regardless of motion
      brightness = 0;
      Serial.print("BRIGHT (Day) = OFF - ");
    }
  }
  
  Serial.print("Brightness: ");
  Serial.println(brightness);
  
  // Apply brightness to LEDs
  if (user_override != 0) {
    // Override mode - all LEDs same
    analogWrite(led1, brightness);
    analogWrite(led2, brightness);
    analogWrite(led3, brightness);
    Serial.print("All LEDs set to: ");
    Serial.println(brightness);
  } else {
    // Individual control - but only if it's dark
    int led1_brightness, led2_brightness, led3_brightness;
    
    if (is_dark) {
      // It's dark - control LEDs based on motion
      led1_brightness = s1 ? brightness : BASE_BRIGHTNESS/3;
      led2_brightness = s2 ? brightness : BASE_BRIGHTNESS/3;
      led3_brightness = s3 ? brightness : BASE_BRIGHTNESS/3;
    } else {
      // It's bright - all LEDs OFF regardless of motion
      led1_brightness = 0;
      led2_brightness = 0;
      led3_brightness = 0;
    }
    
    analogWrite(led1, led1_brightness);
    analogWrite(led2, led2_brightness);
    analogWrite(led3, led3_brightness);
    
    Serial.print("Individual LEDs: ");
    Serial.print(led1_brightness);
    Serial.print(",");
    Serial.print(led2_brightness);
    Serial.print(",");
    Serial.println(led3_brightness);
  }
}

void updateThingSpeak() {
  Serial.println("Updating ThingSpeak...");
  
  // Write to ThingSpeak fields
  ThingSpeak.setField(1, ambience);
  ThingSpeak.setField(2, motion_detected);
  ThingSpeak.setField(3, user_override);
  
  int x = ThingSpeak.writeFields(myChannelNumber, myWriteAPIKey);
  if (x == 200) {
    Serial.println("✓ ThingSpeak update successful");
  } else {
    Serial.print("✗ ThingSpeak update failed. HTTP error code: ");
    Serial.println(x);
  }
}

void readUserOverride() {
  Serial.println("Reading user override...");
  
  int override_value = ThingSpeak.readIntField(myChannelNumber, 3, myReadAPIKey);
  int statusCode = ThingSpeak.getLastReadStatus();
  
  if (statusCode == 200) {
    user_override = override_value;
    Serial.print("✓ User override read: ");
    Serial.println(user_override);
  } else {
    Serial.print("✗ Failed to read user override. Status: ");
    Serial.println(statusCode);
  }
}