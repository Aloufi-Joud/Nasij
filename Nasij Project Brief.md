# Nasij Project Brief

Oct 6, 2026 · @Joy

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
- Alert if the bracelet reaches or leaves the event boundary
- Emergency button and fall alert are off for children

**Elderly and patients:**

- Emergency: double press on the bracelet sends an alert to the nearest volunteer
- Possible fall: the bracelet broadcasts an alert when it stops moving for 3 minutes (vendor "abnormal inactivity" mode). It detects the stillness after a fall, not the impact itself, so the wording is "please check on them", not "they fell"
- Passers-by can tap or scan the bracelet and report a case without seeing any personal data
- Medical data goes to one volunteer only and is deleted when the case is closed

**Health conditions** are optional for any family member (child or elderly).

**Removed:** heat stress detection (moved to future work).

## 3. Privacy and security

Privacy is a core part of the design, not an add-on.

- The bracelet broadcasts only a number. All personal data lives in the system, never on the bracelet
- Anyone can hear the broadcast, but only the system knows which person a number belongs to
- Only authorised staff see data; everyone else gets only "report a case"
- Data is deleted after the visitor leaves; bracelets are reused. The bracelet number is fixed (its MAC), but it holds no personal data: name, photo and phone live only in Firebase and are deleted after the visit (see section 11)
- Volunteers get access to one bracelet, temporarily, only after a lost-child report
- The app never connects to the bracelet. It only listens, so many phones can hear the same bracelet at once
- **Linking needs the bracelet in your hand:** the family holds it next to the phone and double-presses it. The app links only after a *new* press heard while the signal is strong (stronger than −65 dBm). A passer-by who only hears the number, or presses it from far away, cannot link it. Phase 2 adds a server-side lock: one family per bracelet per visit

**Known gap (be honest about it):** someone could follow the same broadcast number during one visit without knowing who it is. Per-visit numbers reduce this. Future work: a number that rotates every few minutes using a secret only the system knows (like Apple Find My).

**Design decision:** the vendor's power saving mode stops broadcasting and disables the alarm after 10 minutes without movement. For a fallen elderly person that is exactly the wrong moment, so Nasij turns power saving off.

## 4. Hardware: the bracelet

The bracelet is a **MOKO W6R** from Shenzhen Moko Technology (2 units received). It appears in Bluetooth scans as `MK Button`, runs firmware family BXP-B-D (nRF52810 chip, LIS3DH accelerometer, LED, buzzer, replaceable coin battery). Its 12-character number (MAC) is printed under the QR code on the back, e.g. `785005002D12`.

**Configuration app:** BeaconX Pro (or MK Button) → choose *MK Button* / *BXP-B-D Firmware* → connect with the team's bracelet password (the vendor default was changed; never write the password in this file or the repo). The vendor's user manual (MOKO Button APP User Manual V1.2) documents the broadcast format.

**Required settings:**

| Setting | Value | Why |
| --- | --- | --- |
| Power saving mode | Off | Otherwise it goes silent and disables alarms after 10 min still |
| Double press mode | Slot on, Alarm info, Alarm mode on, Stay advertising before triggered on | Emergency button |
| Double press: normal adv interval | 25 (×20 ms = 500 ms) | Faster distance updates |
| Double press: alarm adv interval | 5 (×20 ms = 100 ms), for 30 s | Alert reaches phones in about a second |
| Double press: notification | LED + Buzzer | The wearer knows the alert was sent |
| Abnormal inactivity mode | Slot on, Alarm info, Alarm mode on, Stay advertising on, 3 minutes, alarm interval 5 | Possible fall alert |

**Broadcast format (no connection needed):**

- Service data `FEE0` (advertising packet): byte 0 = frame type (`0x20` single, `0x21` double press, `0x22` long press, `0x23` inactivity), byte 1 = status flags (bit 1 = alarm triggered), bytes 2 to 3 = trigger count (big-endian), then device ID
- Service data `EA00` (scan response): accelerometer full-scale and threshold, X/Y/Z in mg (signed 16-bit, big-endian), temperature, battery %, then the **last 6 bytes = MAC**
- On iPhone the MAC is not exposed, so the app identifies the bracelet from the last 6 bytes of `EA00`, then remembers the phone-side device ID to match its `FEE0` packets
- The alarm flag stays on for the whole 30 s alarm broadcast, so the app alerts only on a *new* event (count goes up, or flag turns on)

**NFC:** the built-in chip is 13.56 MHz RFID that the iPhone cannot read (checked 2026-10-10: NFC Tools on the iPhone reads nothing from it). Plan: an **NTAG213** sticker on the strap holding the report page link with the bracelet's secret token (`?t=...`, made by `scripts/tokens.mjs`; no personal data), locked with a password. The sticker stays with its bracelet across visits. Quick fallback for the hackathon: a printed QR sticker. Future work: **NTAG 424 DNA**, which changes the URL on every tap so it cannot be copied.

**Range:** up to 150 m in open space per vendor; expect 10 to 30 m on a wrist in a crowd. This is why the volunteer network matters.

## 5. Tech stack and constraints

| Part | Choice |
| --- | --- |
| Mobile app | React Native + Expo dev build, TypeScript, single codebase for family and volunteer roles |
| Bluetooth | `react-native-ble-plx` (scan only, `allowDuplicates: true`, never connect) |
| Map and location | `react-native-maps` (Apple Maps) + `expo-location` |
| Icons | `@expo/vector-icons` (Ionicons) |
| Backend | Firebase **free Spark plan**: Firestore + Auth (**email and password**; phone login dropped, too complex) |
| Web pages | React (Vite): security dashboard and passer-by report page |
| Code sharing | GitHub, private repo `Aloufi-Joud/Nasij` |
| Laptop test tool | Python + `bleak` scanner (`nasij_scanner.py`), acts as a volunteer device |

**Constraints any helper must respect:**

- Development is on **Windows**. iPhone installs need a **Mac** with a free Apple ID, and each install expires after **7 days**
- After install, daily work runs from Windows: `npx expo start` (same Wi-Fi) or `npx expo start --tunnel`
- **No new native libraries** between Mac installs. Pure JavaScript packages are fine. Native additions are batched for the next Mac install: planned is persistent storage (`@react-native-async-storage/async-storage`). `expo-image-picker` was added on 2026-10-11 (child photo in the lost report, falls back to the demo photo on builds without it), so the next Mac install must rebuild. The camera permission for it was turned on in `app.json` on 2026-10-12 (same Mac install). Push notifications are dropped (free signing may reject the push entitlement)
- Firebase Spark plan has **no Cloud Functions and no Storage**: deletion on case close happens inside the app's close function, and the child's photo is stored small inside the report document
- Navigation is simple state-based tabs (no `react-navigation`, which needs native modules)
- Use the Command Prompt on Windows, not PowerShell (script policy blocks `npx`)

## 6. Current state of the app

The family side works on a real iPhone with the real bracelet (tested before the code was split into folders; to retest after the split). The code is now split into folders: `App.tsx` is the shell, family screens are in `src/screens/family/`, volunteer screens in `src/screens/volunteer/`. Since 2026-10-13 each family page has its own file like the volunteer side: `MapScreen.tsx`, `AlertsScreen.tsx`, `AccountScreen.tsx`, `MemberForm.tsx` (add/edit member), with shared types and zone labels in `shared.ts`. `FamilyApp.tsx` keeps the home tab, the bracelet scanning and the full-screen alerts.

**Done and tested on the iPhone:**

- [x] Link a bracelet in the app: list of nearby bracelets sorted by signal, or type the number from the back
- [x] Add a family member: name, child or elderly, age (stored in memory until async-storage is added)
- [x] Live signal reading, smoothed over the last 6 readings
- [x] Zones with anti-flicker: near (≥ −65 dBm), medium, far (< −80 dBm), signal lost (no packet for 20 s; was 10 s until 2026-10-11, which gave false alarms with the bracelet beside the phone). A new zone must hold 3 s, and leaving near or far needs a 4 dB margin
- [x] Direction: approaching / moving away / steady (last 3 readings vs the average of 6, ±3 dB). **This is the agreed method for the whole app**, including the volunteer proximity screen
- [x] Map with the parent's location and a circle of estimated distance (TX at 1 m = −59, path loss 2.5)
- [x] Emergency double press → red alert card, strong vibration, "received" button that does not re-trigger
- [x] Possible fall (inactivity frame `0x23`) → same alert card with fall wording (needs the bracelet slot enabled)
- [x] Alerts log with time of every change
- [x] Design matches the original prototype: dark teal header, member card with avatar and 4 signal bars, warning strips, bottom tabs (Home, Map, Alerts)

**Done in Phase 1, builds and typechecks, not yet tested on the iPhone:**

- [x] App shell: login, then family or volunteer screens; the header switch button changes role and keeps each side's state
- [x] Login and role choice with **email and password** (fake login until Firebase Auth)
- [x] Optional health condition when adding a member (condition + what a helper should do)
- [x] Edit a member after saving, cancel an edit, and **delete a member completely** (details, health, bracelet link, open report)
- [x] **Verified linking:** hold the bracelet close and double-press it; nothing links without that (see section 3). Self-check: `node src/ble/check.mjs`
- [x] **Event boundary alert:** warning, vibration and log entry when the bracelet's possible area reaches the edge; boundary drawn on the map. For testing, the boundary is a 150 m circle around the family's first location
- [x] "My child is lost": clothing description and photo (fake photo until `expo-image-picker`), sends the report
- [x] "Found": closes the case and deletes its data
- [x] Shared components: `Header`, `BottomNav`, `Banner`, `Button`
- [x] Bluetooth logic shared in `src/ble/` (one scan for the whole app, packet parsing, smoothing, direction)
- [x] **Volunteer proximity screen on the real bracelet:** it follows the reported bracelet's live signal, with the agreed direction method
- [x] Volunteer app (Person 3): on-duty toggle, alert card, proximity screen, health screen, close case, all with fake data

**Done on 2026-10-08, not yet tested on the iPhone:**

- [x] Several members per family, each with its own bracelet, report and alerts
- [x] Member form: gender, language (list picker), family phone (required for a child), how to recognise them; max age 16 for a child, 120 for an elder
- [x] Bracelet alerts (double press, possible fall) send the member's description, not the alarm text
- [x] Linking needs the bracelet held against the phone (signal −35 or stronger)
- [x] Handover code: 4 digits in the family app; the volunteer types it before handing the child to the family
- [x] Volunteer sees the family phone and calls it directly, so a lost child no longer has to go through security
- [x] Language first: volunteers who speak the member's language get the report at once, others 15 s later, with a "speaks their language" badge
- [x] Close case options: handed to the family, helped on the spot (emergency only), or handed to security / ambulance
- [x] Family profile tab: guardian name and phone (fills in new members)
- [x] Login: "forgot password" link, one message for a wrong email or password

## 7. App screens

| Area | Screen | Status |
| --- | --- | --- |
| Shared | Login (email and password) and role choice, forgot password | Done (Firebase Auth) |
| Family | Add / edit / delete members, several per family (gender, language, phone, description, optional health) | Done, to test on iPhone |
| Family | Profile: guardian name and phone | Done, to test on iPhone |
| Family | Link bracelet with press check | Done, to test on iPhone |
| Family | Home: member card, signal, zone, direction, event boundary | Done |
| Family | Family map (with event boundary) | Done |
| Family | Alerts log | Done |
| Family | Emergency / possible fall alert | Done |
| Family | "My child is lost": clothing description, photo | Done (fake photo) |
| Family | "Found" | Done |
| Volunteer | On-duty mode (toggle receiving reports) | Done |
| Volunteer | Alert card: child's photo and description, "I'm searching" | Done |
| Volunteer | Proximity: approaching / moving away + signal | Done (real bracelet), to test on iPhone |
| Volunteer | Health condition (only to the assigned volunteer) | Done |
| Volunteer | Close case: handed to the family (handover code), helped on the spot, or handed to security | Done, to test on iPhone |
| Volunteer | Call the family, languages spoken | Done, to test on iPhone |
| Web | Passer-by report page (opened by NFC or QR, shows no data) | Done (Person 3) |
| Web | Security dashboard: map, open reports, live updates | Done |

The original interactive prototype had 21 screens and defines the look; build to it.

## 8. Main user journey

1. A parent links the bracelet in the app and adds the child (name, age, optional health condition)
2. The child walks away: the signal weakens and the parent gets an early warning, before the child is lost
3. If the child is lost, the parent taps "my child is lost": nearby volunteers get temporary access and an alert with the child's photo and description
4. A volunteer follows the "approaching / moving away" indicator and finds the child, calls the parent, and hands the child over only after the parent reads the handover code from their app; the case closes and access, phone and medical data are deleted
5. An elderly wearer double-presses the bracelet: the emergency alert reaches the family and nearest volunteer in about a second. If they stop moving for 3 minutes, a "please check on them" alert is raised
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

**Step 0, together (first day):** done

- [x] One shared `src/theme.ts` with the colours in section 9, font sizes, card and button styles (Person 3's version agreed)
- [x] One shared `src/mock.ts` with fake members, bracelets, reports, volunteers, sightings, passer-by reports and zones. Its shape is the agreed data model; the backend later copies it exactly
- [x] Folders as below; each person edits only their own folder

| Folder | Owner |
| --- | --- |
| `App.tsx`, `src/screens/family/`, `src/screens/LoginScreen.tsx`, `src/components/`, `src/ble/` | Person 1 |
| `web/dashboard/`, `src/firebase/` | Person 2 |
| `src/screens/volunteer/`, `web/report/` | Person 3 |

`src/firebase/` is Person 2's folder; Person 1 and Person 3 add their own functions there in their own files (`bracelets.ts`, `sightings.ts`, `passerby.ts`) so nobody edits the same file.

### Phase 1: front end with fake data

**Person 1: family app and app shell** (done)

- [x] App shell: role choice (family or volunteer) switches between the two tab sets; shared components (header, card, button, alert banner)
- [x] Login and role choice screen (email and password)
- [x] Add member: add the optional health condition field
- [x] Edit and delete a member after saving
- [x] Verified bracelet linking (press check)
- [x] Event boundary alert
- [x] "My child is lost": confirm, clothing description, photo picker (fake photo for now)
- [x] "Found" screen that closes the case
- [ ] Retest home, map, alerts and the emergency card on the iPhone with the real bracelet after the split, plus linking and the boundary alert

**Person 2: security dashboard** (done)

- [x] Security dashboard: map, list of open reports, report detail, zone list (all from `mock.ts`). Run: `cd web/dashboard`, `npm install`, `npm run dev`
- [x] Same colours and style as the app (reads `src/theme.ts` directly)

**Person 3: volunteer app** (done) **and passer-by page**

- [x] Passer-by report page (`web/report/`): opened by NFC or QR with the bracelet's secret token in the URL (since 2026-10-10; was the bracelet number), one "report a case" button, confirmation screen, shows no personal data. Same colours and style as the app

- [x] On-duty mode toggle
- [x] Alert card: child's photo and description, "I'm searching" button
- [x] Proximity screen: big "approaching / moving away" indicator and signal bars, driven by fake values that change over time
- [x] Health condition screen (emergency call, or a child with a health condition)
- [x] Close case: "found" or "handed to security"

**Phase 1 is done when:** the whole user journey in section 8 can be clicked through on one phone and in the browser, with fake data only.

### Phase 2: real data

The work is split by topic: Person 2 builds the base everyone uses (Firebase, rules, reports, dashboard), Person 3 owns everything volunteer and passer-by, Person 1 owns everything bracelet and family. Since 2026-10-06 Person 1 also does Person 2's tasks.

**Status 2026-10-08:** Person 3 pushed the volunteer and passer-by backend (sightings, passer-by, on-duty location, volunteer screens on live data). Person 1 and Person 2 tasks are done except the event boundary and the work that needs the phones (Mac install, NFC, final integration). Firebase project `nasij-0` is live. How to use it: see the Firebase section in the README.

**Changes on 2026-10-08 that affect everyone** (branch `family-members-languages`):

- `firestore.rules` changed: publish it again (Firebase console → Firestore → Rules → Publish)
- Members moved from `members/{familyUid}` (one per family) to `members/{id}` with `familyId` (several per family). The dashboard finds a member by bracelet through the bracelet lock
- `mock.ts`: `Member` has `gender`, `language`, `phone`, `description`; `Report.member` has `gender` and `language`; `Report.phone`; `ClosedAs` adds `helped`; new `LANGUAGES` and `MAX_AGE`
- Family phone and handover code live in `reports/{id}/private/contact`, next to `private/health`
- Volunteer screens: `whoLine` shows gender and language; `AlertCard` takes `speaks`; `CloseCaseScreen` takes `code`; `DutyScreen` takes `languages`

**Changes on 2026-10-09 that affect everyone** (same branch):

- After `git pull`, run `npm install`: new packages (`expo-font`, IBM Plex Sans Arabic, `react-native-web`, `react-dom`, `@expo/metro-runtime`)
- The phone needs a **new development build** (`npx expo run:ios --device` on the Mac): the font is native and does not come through Metro
- `firestore.rules` changed again (last-seen, stricter sightings): publish it again
- Use `Text` and `TextInput` from `src/components/Text.tsx`, not from `react-native`: they carry the app font and work in English
- Every screen string is written as `tr('عربي', 'English')` from `src/i18n.ts`. Keep writing layouts right-to-left (`row-reverse`, `textAlign: 'right'`): in English the app mirrors them by itself
- Volunteer side runs in a browser for testing: `npx expo start --web` (Bluetooth and maps are stubbed in `src/web/`)
- The family sees the area and time where a volunteer last heard the bracelet (`reports/{id}/seen/last`), never the volunteer or their exact location
- Reports carry `memberId`; the family app restores its open reports after a restart and closes orphans. Unlinking a bracelet closes its open report
- Only one person runs Metro on a machine at a time: two `expo start` on the same folder stop each other
- Emergency press: the family app waits 15 s (`SOS_DELAY_MS` in `FamilyApp.tsx`) before the report goes to volunteers, with "mistake, cancel" and "send now". A possible fall still goes at once
- Handover code is for children only: elder reports have none, so the volunteer closes them without a code
- Handover code is now **6 digits and checked by the rules**: it lives as a document id in `reports/{id}/handover/{code}`, which volunteers cannot read. The volunteer's typed code goes with the close (`closeReport(id, 'found', code)`), and a wrong code fails with `permission-denied`. Reports carry `hasCode`
- A volunteer can close a child's report only as "found" (with the code) or "handed to security"; the family app then says which, and for security tells them to go to the security point with ID
- Passer-by reports are limited to one per bracelet per minute (`passerbyLimits/{bracelet}`, written in the same batch)
- `ClosedAs` adds `expired`: closed by the hourly cleanup, not by a person
- Family "My account" tab redesigned: identity card, member/bracelet/report counts, "My details" (name, phone, email) with one save, a "change password" button (old, new, confirm), and settings (language, switch to volunteer, end visit). New in `src/firebase/profile.ts`: `changeEmail` (sends a confirmation link; the email changes once it is opened), `confirmPassword`, `changePassword`. **Person 3:** build the same page for the volunteer app (task 7 in your list)
- `TextInput` from `src/components/Text.tsx` now flips `textAlign="right"` to left in English (React Native does not flip inputs by itself). `textAlign="left"` stays left in both languages, for Latin-only fields
- **One-time setup for the hourly cleanup** (`scripts/cleanup.mjs`, `.github/workflows/cleanup.yml`): Firebase console → Project settings → Service accounts → Generate new private key. Then GitHub → the repo → Settings → Secrets and variables → Actions → New repository secret, name `FIREBASE_SERVICE_ACCOUNT`, value = the whole JSON file. Never commit that file. The schedule runs from `main`, so it starts after the PR is merged; "Run workflow" in the Actions tab runs it by hand
- **Case timeline and time to found** (2026-10-09): `firestore.rules` changed again, publish it. `acceptReport` now also writes `acceptedAt` (new optional field on `Report`). The security dashboard shows each case as a timeline (sent, taken by a volunteer, bracelet heard per area, passer-by, closed with the time it took), a "closed today" list, and the average time to find in the header. The family's "safe" banner says how long it took. `minSec()` in `src/components/digits.ts` formats it. In `npm run dev` the dashboard has one finished demo case (`?r=demo-closed`), which works as a fallback if the bracelet misbehaves on stage
- **Security dashboard can act now** (2026-10-09):
  - **Security point:** a case closed as "handed to security" no longer loses its photo, health and family phone; they stay for security until the dashboard's "handed to the guardian" button (after an ID check), which wipes them. New `reuniteAtSecurity(id)` and optional `Report.reunitedAt`. The hourly cleanup wipes them anyway after 6 hours
  - **Assign a volunteer:** security picks a free volunteer (nearest first) for a case, or moves it to another one. New `assignReport(id, volunteerId)`. **Person 3:** `VolunteerApp.tsx` now opens a case that security gave to this volunteer by itself (the `take()` function, shared with "accept") and says "Security gave you this report"
  - A report nobody took for 2 minutes turns red; a sound plays for each new report (3 beeps for emergency and fall) and when one becomes late. The browser allows sound only after one click on the page (the login, or the sound button in the header)
  - A volunteer list shows who is free and who is on which case
  - No rules change needed: security could already write reports
- **Report place, lost-signal prompt** (2026-10-09): a report's `area` is now the event zone of the family's location, not "near the family". Away from the Expo site (every demo) the report goes to a **random zone** and a point inside it (marked `ponytail:` in `sendReport`; remove at the real event). Family app: when a child's signal is lost for 20 s (10 s before 2026-10-11), a full-screen prompt asks "are they with you?" with "lost, report" or "no, they're with me"; it closes by itself if the signal comes back. The waiting text now says "waiting for someone to find them". Mock reports now have recent times instead of 0. A volunteer whose accept is refused by the rules now sees "not allowed", not "check the internet"
- **"We found them" full screen** (2026-10-09): when a volunteer closes a case, the family app shows a full-screen green notice with the time it took (and where to go if handed to security). It shows only while the family side is on screen, so after switching from the volunteer side it appears on return
- **Security point, ready on the family and backend side** (2026-10-09): `Report.securityPoint` (zone and pavilion, e.g. `منطقة المملكة · جناح السعودية`) is shown big on the family's green notice and in the dashboard timeline. `closeReport(id, as, handover?, securityPoint?)` saves it, and `firestore.rules` allows it (publish the rules again). **Proposal for Person 3** (your folder, not done for you): when the volunteer picks "handed to security" in `CloseCaseScreen`, ask for the zone (required, chips from `zones` in `mock.ts`) and the pavilion or a landmark (optional text, up to 60 characters), join them as `zone · pavilion`, and pass it to `closeReport` as the 4th argument. Until then the family still gets the notice, just without the place
- **Zone names in English** (2026-10-09): zones in `mock.ts` have an `en` name. Reports store the Arabic zone name, so show any stored place through `place()` from `src/i18n.ts` (it translates the zone part when the app is in English). Already applied in `AlertCard`, `DutyScreen` and `ProximityScreen` (translation only, nothing else changed there)

**Changes on 2026-10-10 that affect everyone** (same branch):

- `firestore.rules` changed: publish it again
- Passer-by limit is now **2 reports per bracelet in 15 minutes** (was 1 per minute). `passerbyLimits/{bracelet}` is `{ start, n, at }`. `createPasserbyReport` now resolves with `null` instead of failing when the limit is reached, so the page still shows "sent" (security already has the recent reports). No change needed in `web/report/`
- **Passer-by reports need the sticker** (same day): the sticker link is `https://<report page>/?t=<secret token>`, not the bracelet number. A report is accepted only with a known token, so nobody can send reports for guessed bracelet numbers from home. Tokens live in `braceletTokens/{token}` (made only by `scripts/tokens.mjs` with the service account; run it again for a bracelet to replace a lost or copied sticker's token). The token goes into a hidden `passerbyClaims/{reportId}` next to the report, so volunteers and security never see it. The page no longer has "type the number on the back": without a readable sticker it sends the person to a volunteer or a security point. `createPasserbyReport(token, location)` now takes the token; new `braceletOfToken(token)`. Publish the rules again
- The report page's files were moved back into `web/report/src/` (the 2026-10-07 upload had put them one folder up, so `npm run dev` could not find them)
- `node src/firebase/check.mjs <email> <password> [sticker token]`: with a token it also sends a real passer-by report
- **The family is asked about passer-by reports** (same day): each passer-by report also writes `passerbyAlerts/{bracelet}` (`{ at, location, reportId }`, new `PasserbyAlert` in `mock.ts`), readable only by the family holding the bracelet and by security. The family app shows a full-screen "someone reported X, are they with you?" with "lost, report" (opens the lost form) or "no, they're with me". The answer shows on the dashboard's passer-by list. Only for reports under 15 minutes old with no open report for that member. New `subscribePasserbyAlert`, `answerPasserbyAlert` in `src/firebase/passerby.ts`. JavaScript only: no new build needed
- Passer-by limit is **2 per bracelet in 1 minute for testing and the demo** (`WINDOW_MS` in `passerby.ts` and `60000` in `firestore.rules`); set both back to 15 minutes for the real event
- `bracelets/{mac}` is now readable only by the family holding it and security (was: any logged-in user). `claimBracelet` still returns `false` when another family holds it
- **A report can only name a bracelet the family holds** (or none): otherwise anyone could report someone else's bracelet and learn where they are from volunteers' sightings
- **At most 5 reports per family in 10 minutes** (`reportLimits/{family}`, written by `createReport` in the same batch). `createReport` throws `too many reports` past that
- **A report photo must be an embedded image** (`data:image/jpeg|png|webp;base64,...`, under 700 KB), never a link. Keep this in mind for `expo-image-picker`: send it as base64
- **The child's photo is only for the volunteer who took the case** (task 8, backend done): the photo moved out of `reports/{id}` into `reports/{id}/private/photo`. Readable by the family, security, and the assigned volunteer until the case closes; a volunteer never sees it before accepting (the alert card shows the initial and the description). New `getReportPhoto(id)` (photo or `null`). `Report.photo` is now always `null` in `subscribeOpenReports` / `subscribeReport`; `createReport` still takes `photo` and stores it in the private document. Closing, "handed to the guardian" and the cleanup delete it. The dashboard loads it with `getReportPhoto`. No fallback for old reports (none are real yet). Publish the rules
- **Private documents (health, phone, photo) after closing:** the assigned volunteer can no longer read them once the case is closed; after "handed to security" only security keeps them
- **Bracelets free themselves after 12 hours:** the hourly cleanup deletes `bracelets/{mac}` locks linked more than 12 hours ago (`BRACELET_LOCK_MS` in `scripts/cleanup.mjs`), for families that left without "end of visit". The member who wore it gets `braceletId: null`, so the family app shows no bracelet next time it opens
- **`sightings` readable by security only** (was: any volunteer too). Anyone can pick "volunteer" at login, so it exposed where every reported person was heard. The volunteer app never read it; `addSighting` still works

**Changes on 2026-10-13: warning with the phone locked** (branch `locked-phone-beacon`):

- **Needs a new Mac install** (`npx expo run:ios --device`): new local native module `modules/nasij-beacon` (Swift, picked up automatically, nothing to `npm install`). On the phone, allow location **"Always"** and notifications
- **How it works:** each bracelet also broadcasts an **iBeacon**. iOS watches it even when the phone is locked or the app is closed, and when a linked bracelet goes out of range it shows a notification: "can't hear <name>'s bracelet, open Nasij and check". Only when the app is not on screen (on screen, the app's own "are they with you?" prompt is used). The notification goes away by itself when the bracelet is back in range. iOS takes about 30 s to a minute to decide the bracelet is gone; there are no zones or direction while locked
- **Bracelet setup (every bracelet, BeaconX Pro):** Long press mode → Slot on, frame type **iBeacon**, Alarm mode off, UUID `C4945856-6071-418B-845D-47040C4988CD` (same for all), Major `1`, Minor = last 4 characters of the bracelet number as a decimal number (`785005002D12` → `2D12` → `11538`), TX power and interval the same as Double press. Do not touch Double press or Abnormal inactivity. The open app does not see iBeacon packets (iOS hides them from Bluetooth scans), so zones and direction are unchanged. Check it broadcasts with the **Locate Beacon** app
- Builds without the module (the current install) keep working; the warning just does nothing there
- Battery: one more slot broadcasting; add to the battery measurement in section 11

**Changes on 2026-10-13** (branch `family-card-photo`):

- **Family pages split into their own files** (family side, no change in how the app looks or works): `MapScreen.tsx`, `AlertsScreen.tsx`, `AccountScreen.tsx`, `MemberForm.tsx`, shared types and zone labels in `shared.ts`. `FamilyApp.tsx` keeps the home tab, bracelet scanning and the full-screen alerts. One small difference: typing on "My account" and leaving the tab before saving now clears it, the same as the volunteer account page
- **Family bell number = unread alerts:** it counts alerts since the alerts tab was last opened and clears when that tab is seen. Before, it counted every alert of the visit and never cleared
- **Done in Person 3's folder with the user's OK:** the first comment line of `src/screens/volunteer/AccountScreen.tsx` now points to `src/screens/family/AccountScreen.tsx` instead of `FamilyApp.tsx`. Comment only
- **Each account keeps the role it signed up with** (`LoginScreen.tsx`, `App.tsx`): the family / volunteer choice is saved in `users/{uid}.role` at sign-up only (or the first time for older accounts with no role). Signing in with the other choice is refused with "this account is registered as family / a volunteer" and signs out; a security account can't sign in to the app. The "switch to volunteer / family" buttons are gone from both headers and both account pages (the volunteer side already hid them when `onSwitchRole` is not passed, so no volunteer screen changed). **Demo account:** `test@gmail.com` (`DEMO_EMAIL` in `LoginScreen.tsx`) is the exception: it opens either side, keeps the switch button, and keeps both sides mounted as before. Accounts for the demo: `test@gmail.com` (both sides), `family@gmail.com` (family only), `volunteer@gmail.com` (volunteer only). The new two are made by signing in once in the app with the right role picked

**Changes on 2026-10-12 that affect everyone** (branch `lost-signal-20s`):

- **Volunteer notices follow the language switch** (part of the app-wide language work; touches `DutyScreen.tsx` and `VolunteerApp.tsx` in Person 3's folder): `Notice.text` in `DutyScreen.tsx` is now a function, `() => tr('…', '…')`, read when the notice is drawn. Before, the text was translated once when the notice was made, so a "report closed" notice stayed in Arabic after switching to English. New notices: pass `text: () => tr(...)`, and `endCase` / `dropShown` take the same kind of function
- **Child photo in today's clothes, taken when the member is added** (family side): optional, recommended once after saving a new child (take a photo / from gallery / skip). It stays **on the family's phone only**, in memory: never written to `members/`, gone if the app is fully closed. It fills the lost report's photo, which the family can still change or remove; the description stays required. Auto emergency/fall reports send it too. New shared `src/components/PhotoField.tsx` (`PhotoField`, `pickPhoto(camera)`). **The camera permission was turned on in `app.json`: it arrives with the next Mac install** (`npx expo run:ios --device`). Until then the gallery works and the camera button shows "not available"
- **Reports without a bracelet** (allowed on purpose, e.g. bracelet lost or never linked): the family's lost screen now says "no bracelet linked, volunteers will search by the description and photo". **Done in `ProximityScreen` on 2026-10-13, with Person 3's OK** (Person 3's folder): when `report.braceletId` is empty it shows "no bracelet on this report, search by the photo and description in <area>" with an eye icon and the full description, and hides the signal metrics. Before, it waited forever on "your phone hasn't picked up the bracelet yet"
- Fixed 2026-10-10: for about an hour, saving a member was refused by the rules (a check meant for bracelet locks had gone into the members rule)
- **Length limits in the rules:** names 60, phone 20, description and health notes 300, health condition 100 characters (members, reports, health, contact, profile). The family app's inputs stop at the same lengths
- `.gitignore` now skips Firebase service account key files and `.firebase/`
- **Live addresses:** passer-by page `https://nasij-0.web.app`, security dashboard `https://nasij-0-dashboard.web.app` (Firebase Hosting, `firebase.json`). To publish after a change: `npm --prefix web/report run build` (or `web/dashboard`), then `npx firebase-tools deploy --only hosting`. Rules: `npx firebase-tools deploy --only firestore:rules`
- **Security account:** create the user in Firebase Authentication, then add `users/{uid}` with `role: "security"` by hand in the console (the rules never let the app set that role)
- Dashboard passer-by list says "outside the event site" instead of "unknown location" when the report has a location away from the Expo site
- Volunteer documents carry `at` (last location write). The hourly cleanup deletes a volunteer document an hour old, so a volunteer whose app closed while on duty does not leave their location behind (PDPL)

**Person 1: Bluetooth, bracelet and family app, final integration**

1. [x] Move the Bluetooth logic (parsing, smoothing, **direction**) into `src/ble/` so the family and volunteer screens share it
2. [x] Feed real readings into the volunteer proximity screen instead of `useFakeSignal`
3. [x] (done 2026-10-08, to test with two phones) Volunteer phone listens for bracelets with open reports and calls Person 3's `addSighting`, about once every 10 s per report (stay inside the free plan limits)
4. [x] Bracelet functions in `src/firebase/bracelets.ts`: `claimBracelet` (after the press check; refuse if another family holds it) and `releaseBracelet`
5. [x] "End of visit" button: deletes the member's data and releases the bracelet (no Cloud Functions, so the app does it)
6. [ ] Family app on live data (all done except the event boundary; several members per family, saved in `members/{id}` with `familyId`, and they come back after login with their bracelets):
   - [x] real login with email and password
   - [x] "my child is lost" calls `createReport`
   - [x] double press and possible fall create an `emergency` / `fall` report automatically, so it reaches the nearest volunteer (journey step 5)
   - [x] show the real report status: "a volunteer is searching", then "found"
   - [x] delete member calls the backend
   - [ ] replace the 150 m test circle with the real event boundary, kept as a constant in the code (one event, no need to store it in Firebase)
7. [ ] Next Mac install, all native additions at once: `@react-native-async-storage/async-storage` (saved data, and Firebase Auth needs it to stay logged in), `expo-image-picker` (real photo). No push notifications
8. [ ] NFC stickers (NTAG213) with the report page link and the bracelet's secret token (`scripts/tokens.mjs` prints it); printed QR as a fallback. Needs the report page deployed first, for its address
9. [ ] Final integration and Mac install on all three phones

**Person 2: Firebase base and security dashboard (items 1 to 5 come first, everyone depends on them)**

1. [x] Firebase project on the free Spark plan; enable Firestore and Auth with **email and password**
2. [x] Collections with the same shape as `mock.ts`: `members`, `reports`, `volunteers`, `sightings`, `passerbyReports`, `zones`, plus `users` (role: family, volunteer or security) and `bracelets` (who linked it this visit)
3. [x] Health data in a separate private document, e.g. `reports/{id}/private/health`. Firestore rules work per document and cannot hide one field, so this is the only way to show health to the assigned volunteer only. The family phone and handover code use the same way: `private/contact`
4. [x] Security rules (`firestore.rules`, published, checked with 61 allow/deny cases on the emulator: `scripts/rules.test.mjs`, run with `npx firebase-tools emulators:exec --project demo-nasij --only firestore "node --test scripts/rules.test.mjs"`; added 2026-10-11, rerun after every rules change):
   - a family reads and writes only its own members
   - an on-duty volunteer reads open reports, without health (the rules check the volunteer role; on-duty is not checked yet)
   - only the assigned volunteer reads the health document
   - a passer-by with no login can only create a `passerbyReport` holding the bracelet number
   - security reads everything
   - **bracelet lock:** a bracelet can be linked only if no other family holds it this visit
5. [x] Report functions in `src/firebase/reports.ts`: `createReport`, `subscribeOpenReports`, `acceptReport` (transaction, so only one volunteer takes a case), `closeReport` (deletes health, photo and temporary access)
6. [x] Security dashboard on live data, with a security-only login, including passer-by reports matched to the member by bracelet number (security is allowed to see the data)

**Person 3: volunteer and passer-by on live data**

1. [x] Sighting functions in `src/firebase/sightings.ts`: `addSighting`, `subscribeSightings`
2. [x] Passer-by function in `src/firebase/passerby.ts`: `createPasserbyReport`, and switch the passer-by page to it
3. [x] Volunteer screens on Person 2's functions: `subscribeOpenReports`, `acceptReport`, `closeReport`, and the health document for the assigned volunteer
4. [x] Update the volunteer's on-duty status and location in their `volunteers` document
5. [x] Remove the volunteer's own direction calculation; use Person 1's readings from `src/ble/`
6. [ ] Test the whole volunteer flow with the real bracelet
7. [x] (added 2026-10-09, done 2026-10-10 in PR #22: also language, switch role and logout) "My account" page in the volunteer app, the same as the family one: name and phone, email change, and a "change password" button. Reuse `changeEmail`, `confirmPassword`, `changePassword` from `src/firebase/profile.ts` and copy the layout from the `profile` tab in `FamilyApp.tsx`
8. [x] (added 2026-10-10, done the same day) **Child's photo only for the volunteer who took the case.** The photo was a field of `reports/{id}`, which every volunteer can read while it is open, so anyone logged in as a volunteer could fetch every child's photo with a short script. Decided 2026-10-10: no photo before accepting, not even while `open`. Fix, done together:
   - [x] **Person 1 (backend):** photo in `reports/{id}/private/photo`, readable by the family, security and the assigned volunteer until closing. `getReportPhoto(id)` in `src/firebase/reports.ts`; closing and the cleanup delete it; the dashboard loads it. No fallback to the old field (no real reports yet)
   - [x] **Person 3 (screens, PR #22):** the alert card shows no photo (initial and description only). After accepting (or when security assigns the case), load it with `getReportPhoto(id)` (same pattern as `getReportPhone`) and drop it when the case ends. `report.photo` from the live list is always `null` now
   - Rules publish: Person 1 only. Merge both parts together, after the rules are published

**Order:**

- Person 2 does items 1 to 4 first (project, collections, health document, rules). Nobody can save real data before that
- Meanwhile: Person 3 builds the passer-by page with fake data (Person 1's `src/ble/` work is done)
- Once the rules exist, all three write their functions in parallel, each in their own file
- Person 3 wires the volunteer screens once Person 2's report functions exist

## 11. Later: security hardening

The focus now is visible features: build the app first, then harden it step by step. These are known and parked, not forgotten:

- **Fixed MAC in `EA00`:** decided 2026-10-10 to keep it. The vendor manual allows turning off the scan response and setting a per-visit Device ID, but that means reconfiguring every bracelet and replacing its NFC/QR sticker at each visit, which is not practical. Risk is small: the number carries no personal data, and a per-visit number would only stop linking one visit to the next. Pitch: future bracelets with rotating IDs
- **Replay attack:** someone records a child's broadcast and replays it near the parent, so the app shows "near" while the child is gone. Cannot be fixed with this bracelet: per the vendor manual (V1.2) every frame it sends (Eddystone-UID, iBeacon, Alarm info) is static, with no rotating ID, encryption or secret. Needs custom firmware from MOKO or another bracelet. Pitch: future work
- **Volunteer role assigned by staff:** today anyone can pick "volunteer" at login. The role must come from the `users` document, set by staff, and be checked in Firestore rules
- **Spam on the passer-by page:** done: a report needs the sticker's secret token, so numbers cannot be guessed from home, and 2 reports per bracelet in 15 minutes. Left: someone holding a bracelet (or a copied sticker link) can still send 2 false reports per 15 minutes for it
- **Handover code:** checked by the rules now; a better check needs the paid plan, see below
- **Linking code at the gate:** a code handed over with the bracelet, on top of the press check. Why (found 2026-10-10): the press check runs only in the app, so anyone with an account can link a bracelet nobody holds yet (and get its passer-by alerts), or link it before the real family. Idea, not decided (Joud to think about it): an 8-character code per bracelet on a card given at the gate, typed when linking and checked by the rules, like the sticker token
- **Reunion code** when a child is found, with a fallback if the parent's phone is dead (staff ID check against the gate record)
- **Copies outlive the case:** the child's photo can stay on volunteers' phones after the report closes
- **Volunteer location is personal data (PDPL):** done: kept only while on duty, and the hourly cleanup removes it if the app closed on duty. Sightings still keep the volunteer's exact point for up to a day (security only)
- **Early warning with the phone locked:** partly done 2026-10-13: an iBeacon "out of range" notification works while locked (see that day's changes), but zones and direction still need the app open. iOS background scanning ignores `allowDuplicates` (rare readings, false "signal lost"), and may not match a `FEE0` filter because `FEE0` is sent as service data, not as an advertised service UUID. Pitch: fast, privacy-safe search once someone is lost; early warning while the app is open
- **Privacy notice and consent (PDPL, OWASP M6):** a short screen at signup: what is collected, why, when it is deleted, with an agree button. Decided 2026-10-10: later, not now
- **At the next Mac build (OWASP M9, M10):** keep only the login session in AsyncStorage (never health, photo or codes); make the handover code with `expo-crypto` instead of `Math.random()`
- **Battery:** the vendor's 1.5 years likely assumes power saving on; measure it with power saving off and 500 ms intervals
- **Resetting bracelets at the exit gate:** each needs a password connection and a sticker rewrite; time it before promising it

### Free-plan workarounds, and what the paid plan would do better

The project runs on the free Spark plan: no Cloud Functions (no code on the server) and no Storage. Each gap has a free workaround in place; Firebase Blaze (pay as you go, small use stays near free, needs a card) would do it properly:

- **Handover code.** Now: the code is a document id the volunteer cannot read, and the rules only let them close a child's report as "found" if the typed code names that document. Gap: someone with a script can try codes one by one (6 digits = a million tries; the rules cannot count attempts). Better with Blaze: a Cloud Function checks the code and locks the case after a few wrong tries
- **Closing reports nobody closed.** Now: GitHub Actions runs `scripts/cleanup.mjs` every hour (free), closing reports open more than 6 hours (`closedAs: 'expired'`) and deleting their health, phone, code and last-seen, plus sightings and passer-by reports older than a day. Needs the `FIREBASE_SERVICE_ACCOUNT` secret (see the 2026-10-09 notes). Gap: up to an hour late. Better with Blaze: a scheduled Cloud Function, or one that runs the moment a member is deleted
- **Photos.** Now: a small base64 image inside the report (fine under Firestore's 1 MB per document). Better with Blaze: Storage for real photos
- **Passer-by spam.** Now: a report needs the sticker's secret token, and 2 reports per bracelet in 15 minutes, both in the rules. Gap: whoever holds a sticker link can send its 2 reports every 15 minutes. Better with Blaze: App Check or a function with an IP limit

Possible on the free plan, postponed until after the demo (it slows down testing): **volunteer role set by staff** (staff edit `users/{uid}.role` in the Firebase console, and the rules stop users from giving themselves `volunteer`).
