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
//   [0]      gesture     (uint8)
//   [1..4]   angleDeg    (float32) — meaningful only for Move (gesture v3;
//                                    replaced the old direction:uint8 enum)
//   [5..8]   magnitude   (float32)
//   [9..12]  signedDelta (float32)
//   [13..16] timestamp   (uint32)
constexpr size_t PAYLOAD_LEN = 17;

void pack(const GestureEvent &e, uint8_t *buf) {
  buf[0] = static_cast<uint8_t>(e.gesture);
  memcpy(buf + 1, &e.angleDeg, 4);
  memcpy(buf + 5, &e.magnitude, 4);
  memcpy(buf + 9, &e.signedDelta, 4);
  memcpy(buf + 13, &e.timestamp, 4);
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
