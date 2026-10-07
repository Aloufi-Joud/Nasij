# Volunteer app (Person 3)

Phase 2: live data. Reports come from Firestore, the bracelet signal from `src/ble`. No new native packages: `expo-location` was already in the app.

## Files

| File | What it is |
| --- | --- |
| `VolunteerApp.tsx` | Volunteer role: header, three tabs (المناوبة، البلاغ، سجلي) and the case flow, on Firestore |
| `DutyScreen.tsx` | On-duty toggle, zone, open reports nobody took yet |
| `AlertCard.tsx` | Incoming report: child's photo and description, "أنا أبحث" button (red version for emergency and fall) |
| `ProximityScreen.tsx` | Big "تقترب / تبتعد" indicator, signal bars, rough distance, last heard |
| `HealthScreen.tsx` | Health condition, what to do, call 997. Opens first for emergency and fall |
| `CloseCaseScreen.tsx` | Close as "وُجد" or "سُلِّم للأمن" |
| `signalView.ts` | Bars, zone and metres from a reading of `src/ble` |
| `ReportPhoto.tsx`, `labels.ts` | Photo or initial, shared wording |

Backend functions used, all in `src/firebase/`:

| File | Functions |
| --- | --- |
| `reports.ts` (Person 2) | `subscribeOpenReports`, `acceptReport`, `getReportHealth`, `closeReport` |
| `volunteers.ts` (Person 3) | `goOnDuty`, `updateVolunteerLocation`, `goOffDuty`, `areaOf` |
| `sightings.ts` (Person 3) | `addSighting`, `subscribeSightings` |
| `passerby.ts` (Person 3) | `createPasserbyReport`, `subscribePasserbyReports`, `braceletNumber` |

## Flow

1. **On duty:** sets `users/{uid}.role` to `volunteer` (so the header switch works from a family login), then listens to open reports. The location is written to `volunteers/{uid}` at most every 30 s. **Off duty deletes that document**, so the location is kept only during the shift.
2. **Report arrives:** the alert card pops up with vibration. "اترك البلاغ لغيري" hides it; it stays in the open list on the duty tab and can be opened again.
3. **أنا أبحث:** `acceptReport` is a transaction: if another volunteer took it first, the card closes with a notice. On success the health document is fetched (only the assigned volunteer may read it).
4. **Searching:** the proximity screen follows the reported bracelet with `useBraceletSignal` (the agreed direction method). If a passer-by reports the same bracelet, a green strip shows it, with a link to the location on the map.
5. **Close:** the photo, description and health leave the phone at once, and `closeReport` deletes health and photo in Firestore. If the family or security closed the case first, the volunteer gets a notice and the same local cleanup.

## For Person 1

- `addSighting(reportId, rssi)` is ready in `src/firebase/sightings.ts`. Call it on every packet you hear from an open report's bracelet: it writes at most once per report every 10 s, and uses the volunteer's latest location from `volunteers.ts`. It returns `false` without writing when there is no location yet (`Sighting.location` is required in `mock.ts`).

## Test without a phone

`node src/firebase/check.mjs <email> <password>` now also checks duty, sightings and the passer-by report.
