#pragma once

#include "gestures.h"

namespace ble {

// Starts advertising the gesture GATT service. Call once in setup().
void begin();

// Notifies subscribers with a packed 14-byte payload. No-op if nobody is
// connected, so it's safe to call every classified frame.
void notify(const GestureEvent &e);

bool connected();

}  // namespace ble
