# Nasij: the laptop as an on-duty volunteer (same job as the volunteer phone's search network)
# Hears the bracelet of an open report and writes a sighting to Firestore, at most once per report every 10 s.
# The laptop has no GPS: the location is the centre of the zone you pick.
# Run:  pip install bleak   then   python "nasij volunteer.py"   (asks for a volunteer account)

import asyncio
import getpass
import json
import time
import urllib.error
import urllib.request

API_KEY = "AIzaSyD4XEagBz9Juf9hTgC9Tj6Y6gwoI4MGZZA"  # same web config as src/firebase/index.ts
DB = "https://firestore.googleapis.com/v1/projects/nasij-0/databases/(default)/documents"
SIGHTING_EVERY = 10   # seconds, same as SIGHTING_EVERY_MS in src/firebase/sightings.ts
REPORTS_EVERY = 5     # seconds between refreshes of the open reports
ZONES = [  # same as zones in src/mock.ts
    ("منطقة المملكة", 24.9124, 46.7050),
    ("المجتمعات المزدهرة", 24.9100, 46.7086),
    ("التكنولوجيا التحويلية", 24.9063, 46.7072),
    ("التعاون الدولي", 24.9063, 46.7028),
    ("الحلول المستدامة", 24.9100, 46.7014),
    ("الساحة المركزية", 24.9090, 46.7050),
]

auth = {}
open_reports = {}   # bracelet MAC -> (report id, member name)
last_sent = {}      # report id -> time of the last write
heard = []          # (report id, name, rssi) waiting to be written
ignored = set()     # bracelets heard without an open report (printed once)


def call(url, body=None, method="POST", token=None):
    req = urllib.request.Request(url, json.dumps(body).encode() if body is not None else None, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{e.code} {e.read().decode(errors='replace')[:300]}") from None


def sign_in(email, password):
    body = {"email": email, "password": password, "returnSecureToken": True}
    try:
        r = call(f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}", body)
    except RuntimeError:
        # New email: make the account, like the app's login screen does
        try:
            r = call(f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}", body)
            print("New account made.")
        except RuntimeError as e:
            raise SystemExit("Wrong password for this email." if "EMAIL_EXISTS" in str(e) else f"Sign-in failed: {e}")
    auth.update(token=r["idToken"], uid=r["localId"], at=time.time())


def load_open_reports():
    q = {"structuredQuery": {"from": [{"collectionId": "reports"}], "where": {"fieldFilter": {
        "field": {"fieldPath": "status"}, "op": "IN",
        "value": {"arrayValue": {"values": [{"stringValue": "open"}, {"stringValue": "searching"}]}}}}}}
    rows = call(f"{DB}:runQuery", q, token=auth["token"])
    found = {}
    for row in rows:
        doc = row.get("document")
        if doc:
            f = doc["fields"]
            name = f["member"]["mapValue"]["fields"]["name"]["stringValue"]
            found[f["braceletId"]["stringValue"].upper()] = (doc["name"].rsplit("/", 1)[1], name)
    return found


def add_sighting(report_id, rssi, zone):
    area, lat, lng = zone
    fields = {
        "reportId": {"stringValue": report_id},
        "volunteerId": {"stringValue": auth["uid"]},
        "rssi": {"integerValue": str(rssi)},
        "at": {"integerValue": str(int(time.time() * 1000))},
        "area": {"stringValue": area},
        "location": {"mapValue": {"fields": {"latitude": {"doubleValue": lat}, "longitude": {"doubleValue": lng}}}},
    }
    call(f"{DB}/sightings", {"fields": fields}, token=auth["token"])
    # What the family sees: area and time only (same as subscribeLastSeen in src/firebase/sightings.ts)
    call(f"{DB}/reports/{report_id}/seen/last", {"fields": {"area": fields["area"], "at": fields["at"]}},
         "PATCH", auth["token"])


def on_advert(device, adv):
    # MOKO W6R: service data EA00, last 6 bytes = its MAC
    for uuid, data in adv.service_data.items():
        if uuid.lower().startswith("0000ea00") and len(data) >= 6:
            mac = data[-6:].hex().upper()
            report = open_reports.get(mac)
            if not report and mac not in ignored:
                ignored.add(mac)
                print(f"{time.strftime('%H:%M:%S')}  heard bracelet {mac}, no open report for it")
            if report and time.time() - last_sent.get(report[0], 0) >= SIGHTING_EVERY:
                last_sent[report[0]] = time.time()  # set before the write, so a refused write is not retried on every packet
                heard.append((*report, adv.rssi))


async def main():
    from bleak import BleakScanner

    email = input("Volunteer email: ")
    password = getpass.getpass("Password: ")
    for i, (name, _, _) in enumerate(ZONES, 1):
        print(f"  {i}. {name}")
    zone = ZONES[int(input("Laptop is in zone (1-6): ") or 1) - 1]

    await asyncio.to_thread(sign_in, email, password)
    # The rules show open reports to the volunteer role only (same write as goOnDuty in the app)
    await asyncio.to_thread(call, f"{DB}/users/{auth['uid']}?updateMask.fieldPaths=role",
                            {"fields": {"role": {"stringValue": "volunteer"}}}, "PATCH", auth["token"])

    scanner = BleakScanner(on_advert)
    await scanner.start()
    print("\nOn duty. Listening for bracelets of open reports... (Ctrl+C to stop)\n")
    next_refresh = 0
    first = True
    try:
        while True:
            if time.time() - auth["at"] > 50 * 60:  # the sign-in token lasts an hour
                await asyncio.to_thread(sign_in, email, password)
            if time.time() >= next_refresh:
                next_refresh = time.time() + REPORTS_EVERY
                try:
                    found = await asyncio.to_thread(load_open_reports)
                    if found.keys() != open_reports.keys() or first:
                        first = False
                        ignored.clear()
                        print(f"{time.strftime('%H:%M:%S')}  open reports: {', '.join(f'{n} ({mac})' for mac, (_, n) in found.items()) or 'none'}")
                    open_reports.clear()
                    open_reports.update(found)
                except Exception as e:
                    print(f"{time.strftime('%H:%M:%S')}  could not load reports: {e}")
            while heard:
                report_id, name, rssi = heard.pop(0)
                try:
                    await asyncio.to_thread(add_sighting, report_id, rssi, zone)
                    print(f"{time.strftime('%H:%M:%S')}  sighting sent: {name}  rssi {rssi}  in {zone[0]}")
                except Exception as e:
                    print(f"{time.strftime('%H:%M:%S')}  sighting refused: {e}")
            await asyncio.sleep(0.5)
    finally:
        await scanner.stop()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nStopped.")
