# Nasij Project Brief

Oct 5, 2026 · @Joy

## 1. Overview

Nasij (Arabic: «نسيج», meaning "woven fabric") is a smart safety network for large crowded events. A low-cost, reusable Bluetooth bracelet links a visitor (mainly children and elderly people) to their family, nearby volunteers and the security team in real time. Tagline: *No One Is Lost in the Crowd.*

**The problem:** in big crowds, children wander off and elderly people fall or need help, and families lose precious minutes before anyone can act.

**The solution:** the family's phone constantly listens to the bracelet and warns them *before* the child is lost, when the signal starts to weaken. If the child is lost anyway, nearby volunteers' phones become a search network with temporary permission to recognise that one bracelet. Elderly wearers can call for help with a double press, and the bracelet raises an alert if they stop moving (possible fall). The bracelet itself carries no personal data.

Nasij is designed for large crowded events, starting with Expo 2030 Riyadh.

## 2. Users and features

Four roles share one system: **family** (mobile app), **volunteer** (same app, different role), **security team** (web dashboard) and **passers-by** (a public web page, no app needed).

**Children:**

- Bracelet is linked to the parent's phone; early warning when the signal weakens, before the child is lost
- Parent taps "my child is lost": nearby volunteers get temporary permission to recognise that bracelet
- Volunteer walking past gets an alert with the child's photo and description, plus an "approaching / moving away" indicator
- The permission is deleted automatically when the child is found
- Alert if the bracelet leaves the event boundary
- Emergency button and fall alert are off for children

**Elderly and patients:**

- Emergency: double press on the bracelet sends an alert to the nearest volunteer
- Possible fall: the bracelet broadcasts an alert when it stops moving for 60 s (vendor "abnormal inactivity" mode). It detects the stillness after a fall, not the impact itself
- Passers-by can tap or scan the bracelet and report a case without seeing any personal data
- Medical data goes to one volunteer only and is deleted when the case is closed

**Health conditions** are optional for any family member (child or elderly).

**Removed:** heat stress detection (moved to future work).

## 3. Privacy and security

Privacy is a core part of the design, not an add-on.

- The bracelet broadcasts only a number. All personal data lives in the system, never on the bracelet
- Anyone can hear the broadcast, but only the system knows which person a number belongs to
- Only authorised staff see data; everyone else gets only "report a case"
- The bracelet number changes every visit; data is deleted after the visitor leaves; bracelets are reused
- Volunteers get access to one bracelet, temporarily, only after a lost-child report
- The app never connects to the bracelet. It only listens, so many phones can hear the same bracelet at once

**Known gap (be honest about it):** someone could follow the same broadcast number during one visit without knowing who it is. Per-visit numbers reduce this. Future work: a number that rotates every few minutes using a secret only the system knows (like Apple Find My).

**Design decision:** the vendor's power saving mode stops broadcasting and disables the alarm after 10 minutes without movement. For a fallen elderly person that is exactly the wrong moment, so Nasij turns power saving off.

## 4. Hardware: the bracelet

The bracelet is a **MOKO W6R** from Shenzhen Moko Technology (2 units received). It appears in Bluetooth scans as `MK Button`, runs firmware family BXP-B-D (nRF52810 chip, LIS3DH accelerometer, LED, buzzer, replaceable coin battery). Its 12-character number (MAC) is printed under the QR code on the back, e.g. `785005002D12`.

**Configuration app:** BeaconX Pro (or MK Button) → choose *MK Button* / *BXP-B-D Firmware* → connect with the default password `Moko4321`. The vendor's user manual (MOKO Button APP User Manual V1.2) documents the broadcast format.

**Required settings:**

| Setting | Value | Why |
| --- | --- | --- |
| Power saving mode | Off | Otherwise it goes silent and disables alarms after 10 min still |
| Double press mode | Slot on, Alarm info, Alarm mode on, Stay advertising before triggered on | Emergency button |
| Double press: normal adv interval | 25 (×20 ms = 500 ms) | Faster distance updates |
| Double press: alarm adv interval | 5 (×20 ms = 100 ms), for 30 s | Alert reaches phones in about a second |
| Double press: notification | LED + Buzzer | The wearer knows the alert was sent |
| Abnormal inactivity mode | Slot on, Alarm info, Alarm mode on, Stay advertising on, 60 s, alarm interval 5 | Possible fall alert |

**Broadcast format (no connection needed):**

- Service data `FEE0` (advertising packet): byte 0 = frame type (`0x20` single, `0x21` double press, `0x22` long press, `0x23` inactivity), byte 1 = status flags (bit 1 = alarm triggered), bytes 2 to 3 = trigger count (big-endian), then device ID
- Service data `EA00` (scan response): accelerometer full-scale and threshold, X/Y/Z in mg (signed 16-bit, big-endian), temperature, battery %, then the **last 6 bytes = MAC**
- On iPhone the MAC is not exposed, so the app identifies the bracelet from the last 6 bytes of `EA00`, then remembers the phone-side device ID to match its `FEE0` packets
- The alarm flag stays on for the whole 30 s alarm broadcast, so the app alerts only on a *new* event (count goes up, or flag turns on)

**NFC:** the built-in chip is 13.56 MHz RFID that the iPhone cannot read. Plan: an **NTAG213** sticker on the strap holding the report page URL plus the bracelet number only (no personal data), locked with a password and rewritable per visit with NFC Tools. Quick fallback for the hackathon: a printed QR sticker. Future work: **NTAG 424 DNA**, which changes the URL on every tap so it cannot be copied.

**Range:** up to 150 m in open space per vendor; expect 10 to 30 m on a wrist in a crowd. This is why the volunteer network matters.

## 5. Tech stack and constraints

| Part | Choice |
| --- | --- |
| Mobile app | React Native + Expo dev build, TypeScript, single codebase for family and volunteer roles |
| Bluetooth | `react-native-ble-plx` (scan only, `allowDuplicates: true`, never connect) |
| Map and location | `react-native-maps` (Apple Maps) + `expo-location` |
| Icons | `@expo/vector-icons` (Ionicons) |
| Backend | Firebase **free Spark plan**: Firestore + Auth |
| Web pages | React (Vite): security dashboard and passer-by report page |
| Code sharing | GitHub, private repo `Aloufi-Joud/Nasij` |
| Laptop test tool | Python + `bleak` scanner (`nasij_scanner.py`), acts as a volunteer device |

**Constraints any helper must respect:**

- Development is on **Windows**. iPhone installs need a **Mac** with a free Apple ID, and each install expires after **7 days**
- After install, daily work runs from Windows: `npx expo start` (same Wi-Fi) or `npx expo start --tunnel`
- **No new native libraries** between Mac installs. Pure JavaScript packages are fine. Native additions are batched for the next Mac install: planned are persistent storage (`@react-native-async-storage/async-storage`) and push notifications
- Firebase Spark plan has **no Cloud Functions and no Storage**: deletion on case close happens inside the app's close function, and the child's photo is stored small inside the report document
- Navigation is simple state-based tabs (no `react-navigation`, which needs native modules)
- Use the Command Prompt on Windows, not PowerShell (script policy blocks `npx`)

## 6. Current state of the app

The family side works on a real iPhone with the real bracelet. Everything is in one file, `App.tsx`, to be split into folders next.

**Done and tested:**

- [x] Link a bracelet in the app: list of nearby bracelets sorted by signal, or type the number from the back
- [x] Add a family member: name, child or elderly, age (stored in memory until async-storage is added)
- [x] Live signal reading, smoothed over the last 6 readings
- [x] Zones with anti-flicker: near (≥ −65 dBm), medium, far (< −80 dBm), signal lost (no packet for 10 s). A new zone must hold 3 s, and leaving near or far needs a 4 dB margin
- [x] Direction: approaching / moving away / steady (last 3 readings vs the average)
- [x] Map with the parent's location and a circle of estimated distance (TX at 1 m = −59, path loss 2.5)
- [x] Emergency double press → red alert card, strong vibration, "received" button that does not re-trigger
- [x] Possible fall (inactivity frame `0x23`) → same alert card with fall wording (needs the bracelet slot enabled)
- [x] Alerts log with time of every change
- [x] Design matches the original prototype: dark teal header, member card with avatar and 4 signal bars, warning strips, bottom tabs (Home, Map, Alerts)

## 7. App screens

| Area | Screen | Status |
| --- | --- | --- |
| Shared | Login and role choice (family or volunteer) | To do |
| Family | Add member (with optional health condition) and link bracelet | Done, health field to add |
| Family | Home: member card, signal, zone, direction | Done |
| Family | Family map | Done |
| Family | Alerts log | Done |
| Family | Emergency / possible fall alert | Done |
| Family | "My child is lost": confirm, clothing description, photo | To do |
| Family | "Found" | To do |
| Volunteer | On-duty mode (toggle receiving reports) | To do |
| Volunteer | Alert card: child's photo and description, "I'm searching" | To do |
| Volunteer | Proximity: approaching / moving away + signal | To do |
| Volunteer | Health condition (only to the assigned volunteer) | To do |
| Volunteer | Close case: found, or handed to security | To do |
| Web | Passer-by report page (opened by NFC or QR, shows no data) | To do |
| Web | Security dashboard: map, open reports, live updates | To do |

The original interactive prototype had 21 screens and defines the look; build to it.

## 8. Main user journey

1. A parent links the bracelet in the app and adds the child (name, age, optional health condition)
2. The child walks away: the signal weakens and the parent gets an early warning, before the child is lost
3. If the child is lost, the parent taps "my child is lost": nearby volunteers get temporary access and an alert with the child's photo and description
4. A volunteer follows the "approaching / moving away" indicator and finds the child; the case closes and access and medical data are deleted
5. An elderly wearer double-presses the bracelet: the emergency alert reaches the family and nearest volunteer in about a second. If they stop moving for 60 s, a possible-fall alert is raised
6. A passer-by taps the NFC sticker and reports a case without seeing any personal data
7. The security dashboard shows open cases and sightings live

## 9. Design

**Design system** (from the original prototype; app text is Arabic, right-to-left, rows use `row-reverse`):

| Token | Colour |
| --- | --- |
| Primary (dark teal) | `#0E3F3C` |
| Accent | `#5E8C85` |
| Background | `#F4F4E9` |
| Card border | `#E8E4D8` |
| Safe | `#1B6B3A` |
| Warning | `#D4841A` |
| Danger | `#C0392B` |

**Links:**

- Interactive prototype (defines the look): https://claude.ai/artifact/G6MiovE3Y91UjmT7o6WN3R
- Code: GitHub `Aloufi-Joud/Nasij` (private)

## 10. Task split (front end first)

All three people build their screens first with fake data, so the whole app can be clicked through end to end. Real data and Bluetooth are wired in only after every screen exists.

**Step 0, together (first day):**

- [ ] One shared `src/theme.ts` with the colours in section 9, font sizes, card and button styles
- [ ] One shared `src/mock.ts` with fake members, bracelets, reports, volunteers and sightings. Its shape is the agreed data model; the backend later copies it exactly
- [ ] Folders as below; each person edits only their own folder

| Folder | Owner |
| --- | --- |
| `App.tsx`, `src/screens/family/`, `src/components/`, `src/ble/` | Person 1 |
| `web/report/`, `web/dashboard/`, later `src/firebase/` | Person 2 |
| `src/screens/volunteer/` | Person 3 |

### Phase 1: front end with fake data

**Person 1: family app and app shell**

- [ ] App shell: role choice (family or volunteer) switches between the two tab sets; shared components (header, card, button, alert banner)
- [ ] Login and role choice screen
- [ ] Add member: add the optional health condition field
- [ ] "My child is lost": confirm, clothing description, photo picker (fake photo for now)
- [ ] "Found" screen that closes the case
- [ ] Keep home, map, alerts and the emergency card working with the real bracelet

**Person 2: web pages**

- [ ] Passer-by report page: opened by NFC or QR with the bracelet number in the URL, one "report a case" button, confirmation screen, shows no personal data
- [ ] Security dashboard: map, list of open reports, report detail, zone list (all from `mock.ts`)
- [ ] Same colours and style as the app

**Person 3: volunteer app**

- [ ] On-duty mode toggle
- [ ] Alert card: child's photo and description, "I'm searching" button
- [ ] Proximity screen: big "approaching / moving away" indicator and signal bars, driven by fake values that change over time
- [ ] Health condition screen (emergency call, or a child with a health condition)
- [ ] Close case: "found" or "handed to security"

**Phase 1 is done when:** the whole user journey in section 8 can be clicked through on one phone and in the browser, with fake data only.

### Phase 2: real data

- **Person 2:** Firebase project on the free plan, the data model from `mock.ts`, security rules, functions to create, close and subscribe to reports and sightings (close deletes temporary access and medical data); switch both web pages to live data
- **Person 1:** feed real Bluetooth values into the volunteer proximity screen; upload sightings when a volunteer's phone hears a reported bracelet; NFC stickers; final integration and Mac install on all three phones
- **Person 3:** replace fake data in the volunteer screens with Person 2's functions, then test the volunteer flow with the real bracelet
