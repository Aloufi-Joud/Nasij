# Nasij · نسيج

**A Weave of Safety Around Those You Love.**

Nasij is a smart safety network for large crowded events, designed for Expo 2030 Riyadh. A low-cost, reusable Bluetooth bracelet links a visitor (mainly children and elderly people) to their family, nearby volunteers and the security team in real time.

## The problem

In big crowds, children wander off and elderly people fall or need help. Families lose precious minutes before anyone can act.

## The solution

- **Early warning:** the family's phone keeps listening to the bracelet and warns them when the signal weakens, *before* the child is lost.
- **A search network of volunteers:** if a child is lost, the parent taps "my child is lost". Nearby volunteers get temporary permission to recognise that one bracelet, with the child's description and an "approaching / moving away" indicator.
- **Emergency button and fall alert:** an elderly wearer double-presses the bracelet to call for help. If they stop moving for 3 minutes, a "please check on them" alert is raised. Any volunteer phone that hears the press can relay it, even without a family phone nearby.
- **Passers-by can help:** tapping the NFC sticker or scanning the QR on the bracelet opens a page that reports the case, without showing any personal data.
- **Security dashboard:** a live map of open cases, sightings, volunteers and response times.
- **Safe handover:** a lost child is handed back only after the volunteer enters a code shown in the parent's app.

## Privacy by design

- The bracelet broadcasts only a number. Names, photos, phone numbers and health data are never stored on it.
- A volunteer sees one case at a time. The child's photo and health notes are shown only to the volunteer who took the case.
- Case data is deleted when the case closes, and an hourly cleanup removes anything left behind.
- Access is enforced by Firestore security rules, covered by automated tests (`scripts/rules.test.mjs`).
- The app never connects to the bracelet. It only listens, so many phones can hear the same bracelet at once.

## How it works

```
Bracelet (BLE broadcast) ──► Family app ──┐
          │                               ├──► Firebase (Firestore + Auth) ──► Security dashboard (web)
          └──────────► Volunteer app ─────┘
NFC / QR sticker ──► Passer-by report page (web)
```

| Part | Technology |
| --- | --- |
| Mobile app (family and volunteer) | React Native, Expo, TypeScript, `react-native-ble-plx` |
| Backend | Firebase Firestore and Authentication, Firestore security rules |
| Security dashboard and passer-by page | React and Vite, on Firebase Hosting |
| Bracelet | MOKO W6R BLE beacon with accelerometer, button, LED and buzzer |

## Live demo

- Demo video: Watch the Nasij film: https://drive.google.com/file/d/1YsMjAu2jBYJydPAIrvtPqNbWpT1WqE9s/view?usp=drive_link
- Passer-by report page: https://nasij-0.web.app
- Security dashboard: https://nasij-0-dashboard.web.app

## Project structure

| Path | What it is |
| --- | --- |
| `App.tsx` | App shell: login, then the family or volunteer side |
| `src/screens/family/` | Family app: members, bracelet linking, map, alerts, lost report |
| `src/screens/volunteer/` | Volunteer app: incoming cases, proximity search, closing a case |
| `src/ble/` | Bluetooth: packet parsing, signal smoothing, direction, emergency relay |
| `src/firebase/` | Data access: reports, members, bracelets, sightings, passer-by reports |
| `modules/nasij-beacon/` | Native iOS module: warning when the phone is locked |
| `web/dashboard/` | Security dashboard |
| `web/report/` | Passer-by report page |
| `firestore.rules` | Who may read and write what |
| `scripts/` | Hourly cleanup, sticker tokens, rules tests |

## Run it

```
git clone https://github.com/Aloufi-Joud/Nasij.git
cd Nasij
npm install
npx expo run:ios --device    # first install on an iPhone (needs a Mac with Xcode)
npx expo start               # daily development
```

The Bluetooth features need a development build on a real phone and the bracelet. The volunteer side can also run in a browser with Bluetooth and maps stubbed: `npx expo start --web`.

Web pages:

```
npm --prefix web/dashboard install
npm --prefix web/dashboard run dev
```

Firestore rules tests:

```
npm run test:rules
```

## Future work

- Bracelets with rotating IDs, so a broadcast cannot be followed or replayed
- Cloud Functions to check the handover code server-side and to delete data the moment a case closes
