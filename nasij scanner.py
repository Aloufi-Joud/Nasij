# Nasij: laptop test scanner (same logic as the phone app)
# Finds the NASIJ bracelet, measures signal, shows NEAR / MEDIUM / FAR / SIGNAL LOST
# Run:  pip install bleak   then   python nasij_scanner.py

import asyncio
import statistics
import time
from bleak import BleakScanner

COMPANY_ID = 0xFFFF   # test company ID used by the ESP32
BRACELET_MAC = "785005002D12"  # MOKO W6R (printed under the QR on the back)
LOST_AFTER = 20       # seconds with no packet = signal lost (bracelet calls slowly)
WINDOW = 6            # average the last 6 readings
NEAR = -65            # stronger than this = near
FAR = -80             # weaker than this = far
HOLD = 3              # a new state must last 3 s before we announce it
GAP = 4               # extra margin needed to leave NEAR or FAR
TREND_HOLD = 3        # approaching / moving away stays shown 3 s after the readings settle

history = []
last = {"t": None, "id": None, "rssi": None}


def identify(adv):
    """Return the bracelet ID, or None if this is not our bracelet."""
    # MOKO W6R: service data EA00, last 6 bytes = its MAC
    for uuid, data in adv.service_data.items():
        if uuid.lower().startswith("0000ea00") and len(data) >= 6:
            if data[-6:].hex().upper() == BRACELET_MAC:
                return BRACELET_MAC
    # ESP32 stand-in: manufacturer data FF FF 'N' 'S' id status
    data = adv.manufacturer_data.get(COMPANY_ID)
    if data and len(data) >= 4 and data[0:2] == b"NS":
        return f"ESP-{data[2]}"
    return None


def on_advert(device, adv):
    bracelet = identify(adv)
    # Like the app: every packet from the bracelet counts (FEE0 alarm info too), not only the EA00 scan response
    if bracelet is None and device.address.replace(":", "").upper() == BRACELET_MAC:
        bracelet = BRACELET_MAC
    if bracelet is None:
        return
    now = time.time()
    # Coming back after being lost: start the average fresh
    if last["t"] is not None and now - last["t"] > LOST_AFTER:
        history.clear()
    history.append(adv.rssi)
    del history[:-WINDOW]
    last.update(t=now, id=bracelet, rssi=adv.rssi)


def get_state(age, smooth, current):
    if age > LOST_AFTER:
        return "SIGNAL LOST"
    # Stay in NEAR / FAR until the signal clearly crosses back (no flicker at the edge)
    if current == "NEAR" and smooth >= NEAR - GAP:
        return "NEAR"
    if current == "FAR" and smooth < FAR + GAP:
        return "FAR"
    if smooth >= NEAR:
        return "NEAR"
    if smooth >= FAR:
        return "MEDIUM"
    return "FAR"


async def main():
    scanner = BleakScanner(on_advert)
    await scanner.start()
    print("Searching for NASIJ bracelet... (Ctrl+C to stop)\n")
    prev_state = None
    candidate = None
    candidate_since = 0
    shown = {"trend": "steady", "t": 0}
    try:
        while True:
            await asyncio.sleep(0.5)
            if last["t"] is None:
                continue
            age = time.time() - last["t"]
            smooth = round(statistics.median(history))  # same as the app: one odd reading can't pull it
            raw_state = get_state(age, smooth, prev_state)

            # Ignore quick flickers: only switch after the new state holds
            if raw_state != candidate:
                candidate = raw_state
                candidate_since = time.time()
            if prev_state is None or raw_state == "SIGNAL LOST" \
                    or time.time() - candidate_since >= HOLD:
                state = candidate
            else:
                state = prev_state

            # Log every change on its own line (with a beep for bad news)
            if state != prev_state:
                beep = "\a" if state in ("FAR", "SIGNAL LOST") else ""
                print(f"\n{time.strftime('%H:%M:%S')}  >>> {state}{beep}")
                prev_state = state

            # Direction: compare the last 3 readings with the full average
            recent = sum(history[-3:]) / len(history[-3:])
            diff = recent - sum(history) / len(history)
            trend = "approaching" if diff > 3 else "moving away" if diff < -3 else "steady"
            # Same as the app: a seen direction stays 3 s after the readings settle
            if trend != "steady":
                shown.update(trend=trend, t=time.time())
            elif time.time() - shown["t"] < TREND_HOLD:
                trend = shown["trend"]

            bar = "#" * max(0, min(20, (smooth + 100) // 3))
            line = (f"ID {last['id']} | now {last['rssi']:>4} | avg {smooth:>4} "
                    f"| {bar:<20} | {state:<11} | {trend:<11} | last {age:3.0f}s")
            print("\r" + line, end="", flush=True)
    finally:
        await scanner.stop()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nStopped.")
