# Volunteer app (Person 3)

Phase 1: all five volunteer screens, clickable end to end with fake data. No new packages: only React Native core (`Animated`, `Linking`, `Vibration`, `Image`) and `@expo/vector-icons`, which the app already uses.

## Files

| File | What it is |
| --- | --- |
| `VolunteerApp.tsx` | Volunteer role: header, three tabs (المناوبة، البلاغ، سجلي) and the case flow |
| `DutyScreen.tsx` | On-duty toggle, plus demo buttons that send each fake report |
| `AlertCard.tsx` | Incoming report: child's photo and description, "أنا أبحث" button (red version for emergency and fall) |
| `ProximityScreen.tsx` | Big "تقترب / تبتعد" indicator, signal bars, rough distance, last heard |
| `HealthScreen.tsx` | Health condition, what to do, call 997. Opens first for emergency and fall |
| `CloseCaseScreen.tsx` | Close as "وُجد" or "سُلِّم للأمن"; closing drops the photo and health data |
| `useFakeSignal.ts` | Fake readings that change over time (not heard, approaching, wrong turn, found) |
| `ReportPhoto.tsx`, `labels.ts` | Photo or initial, shared wording |

`src/theme.ts` and `src/mock.ts` are the agreed Step 0 shared files (colours and the data model). Tell the team before changing them.

## Flow

On duty → report arrives (first one 5 s after going on duty, or tap a demo button) → "أنا أبحث" → proximity → close case → back on duty. Emergency and fall open the health screen first.

## Try it before the app shell exists

In your local copy only (do not commit), change `index.ts`:

```ts
import { registerRootComponent } from 'expo';
import { VolunteerApp } from './src/screens/volunteer';
registerRootComponent(VolunteerApp);
```

## For Person 1 (app shell)

When the role is "volunteer", render `<VolunteerApp onSwitchRole={...} />`. It brings its own header and tabs, like the family side.

## Phase 2

- `ProximityScreen` takes `signal` (`{ rssi, smooth, trend, lastSeen }`, the same shape as `Reading` in `App.tsx`). Replace `useFakeSignal` in `VolunteerApp` with real readings for the reported bracelet from `src/ble`.
- Replace `receive()` with a Firestore subscription to open reports near the volunteer, and `closeCase()` with the backend close function.
- Direction uses the last 3 s against the 3 s before (2 dB, held 1.5 s), not the last 3 readings against the last 6. See the note in `useFakeSignal.ts`.
