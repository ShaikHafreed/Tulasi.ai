#include "ble_broadcast.h"

#include <BLE2902.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>

#include "config.h"

namespace ble {
namespace {

BLECharacteristic *gestureChar = nullptr;
bool isConnected = false;

class ConnCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *server) override {
    isConnected = true;
    (void)server;
  }
  void onDisconnect(BLEServer *server) override {
    isConnected = false;
    // Re-advertise so the browser can reconnect without a firmware reset.
    server->getAdvertising()->start();
  }
};

// Packed little-endian payload — must match the DataView parse in
// frontend/src/lib/gloveGesture.ts byte-for-byte:
//   [0]     gesture   (uint8)
//   [1]     direction (uint8)
//   [2..5]  magnitude (float32)
//   [6..9]  signedDelta (float32)
//   [10..13] timestamp (uint32)
constexpr size_t PAYLOAD_LEN = 14;

void pack(const GestureEvent &e, uint8_t *buf) {
  buf[0] = static_cast<uint8_t>(e.gesture);
  buf[1] = static_cast<uint8_t>(e.direction);
  memcpy(buf + 2, &e.magnitude, 4);
  memcpy(buf + 6, &e.signedDelta, 4);
  memcpy(buf + 10, &e.timestamp, 4);
}

}  // namespace

void begin() {
  BLEDevice::init(BLE_DEVICE_NAME);
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new ConnCallbacks());

  BLEService *service = server->createService(GESTURE_SERVICE_UUID);
  gestureChar = service->createCharacteristic(
      GESTURE_CHAR_UUID,
      BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
  gestureChar->addDescriptor(new BLE2902());  // enables client subscriptions

  service->start();

  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(GESTURE_SERVICE_UUID);
  advertising->setScanResponse(true);
  BLEDevice::startAdvertising();
}

void notify(const GestureEvent &e) {
  if (!isConnected || gestureChar == nullptr) return;
  uint8_t buf[PAYLOAD_LEN];
  pack(e, buf);
  gestureChar->setValue(buf, PAYLOAD_LEN);
  gestureChar->notify();
}

bool connected() { return isConnected; }

}  // namespace ble
