// Fake data for Phase 1. These types ARE the agreed data model:
// the Firebase backend (Phase 2) copies them exactly. Change them together, not alone.
// No react-native import, so web/ can import it too.

export type Kind = 'child' | 'elder';
export type Role = 'family' | 'volunteer';
export type Point = { latitude: number; longitude: number };

// A visitor wearing a bracelet, added by the family
export type Member = {
  id: string;
  familyId: string;
  name: string;
  kind: Kind;
  age: number;
  health: string | null; // optional health condition, shown only to the assigned volunteer
  braceletMac: string | null; // 12 hex characters, printed on the back
};

export type Bracelet = {
  mac: string;
  memberId: string | null; // null = not linked this visit
  battery: number; // %
};

export type ReportKind = 'lost' | 'sos' | 'fall' | 'passerby';
export type ReportStatus = 'open' | 'searching' | 'closed';
export type CloseReason = 'found' | 'security';

export type Report = {
  id: string;
  kind: ReportKind;
  memberId: string | null; // null for a passer-by report until security matches it
  braceletMac: string;
  status: ReportStatus;
  clothing: string | null; // "my child is lost" description
  photo: string | null; // small base64 data URI later (no Firebase Storage on Spark)
  lastLocation: Point | null;
  zoneId: string | null;
  volunteerId: string | null; // the one volunteer who sees health data
  createdAt: number; // ms since epoch
  closedAt: number | null;
  closeReason: CloseReason | null;
};

export type Volunteer = {
  id: string;
  name: string;
  onDuty: boolean;
  location: Point;
  zoneId: string;
};

// A volunteer's phone heard a reported bracelet
export type Sighting = {
  id: string;
  reportId: string;
  volunteerId: string;
  rssi: number;
  location: Point;
  time: number;
};

export type Zone = { id: string; name: string; center: Point; radius: number }; // radius in metres

const now = Date.now();
const min = 60_000;

export const zones: Zone[] = [
  { id: 'z1', name: 'البوابة الرئيسية', center: { latitude: 24.7745, longitude: 46.7385 }, radius: 150 },
  { id: 'z2', name: 'الساحة المركزية', center: { latitude: 24.7760, longitude: 46.7400 }, radius: 200 },
  { id: 'z3', name: 'منطقة المطاعم', center: { latitude: 24.7775, longitude: 46.7380 }, radius: 120 },
];

export const members: Member[] = [
  { id: 'm1', familyId: 'f1', name: 'سنا', kind: 'child', age: 7, health: null, braceletMac: '785005002D12' },
  { id: 'm2', familyId: 'f1', name: 'أبو محمد', kind: 'elder', age: 72, health: 'سكري، يحتاج سكر عند الدوخة', braceletMac: '785005002D13' },
  { id: 'm3', familyId: 'f2', name: 'يوسف', kind: 'child', age: 5, health: 'ربو', braceletMac: '785005002D14' },
];

export const bracelets: Bracelet[] = [
  { mac: '785005002D12', memberId: 'm1', battery: 86 },
  { mac: '785005002D13', memberId: 'm2', battery: 64 },
  { mac: '785005002D14', memberId: 'm3', battery: 92 },
  { mac: '785005002D15', memberId: null, battery: 100 },
];

export const volunteers: Volunteer[] = [
  { id: 'v1', name: 'خالد', onDuty: true, location: { latitude: 24.7758, longitude: 46.7395 }, zoneId: 'z2' },
  { id: 'v2', name: 'ريم', onDuty: true, location: { latitude: 24.7748, longitude: 46.7388 }, zoneId: 'z1' },
  { id: 'v3', name: 'فهد', onDuty: false, location: { latitude: 24.7772, longitude: 46.7382 }, zoneId: 'z3' },
];

export const reports: Report[] = [
  {
    id: 'r1', kind: 'lost', memberId: 'm3', braceletMac: '785005002D14', status: 'searching',
    clothing: 'تيشيرت أحمر وبنطلون جينز، شنطة ظهر زرقاء', photo: null,
    lastLocation: { latitude: 24.7762, longitude: 46.7402 }, zoneId: 'z2', volunteerId: 'v1',
    createdAt: now - 6 * min, closedAt: null, closeReason: null,
  },
  {
    id: 'r2', kind: 'sos', memberId: 'm2', braceletMac: '785005002D13', status: 'open',
    clothing: null, photo: null,
    lastLocation: { latitude: 24.7747, longitude: 46.7386 }, zoneId: 'z1', volunteerId: null,
    createdAt: now - 1 * min, closedAt: null, closeReason: null,
  },
  {
    id: 'r3', kind: 'passerby', memberId: null, braceletMac: '785005002D12', status: 'closed',
    clothing: null, photo: null,
    lastLocation: { latitude: 24.7776, longitude: 46.7379 }, zoneId: 'z3', volunteerId: 'v2',
    createdAt: now - 40 * min, closedAt: now - 25 * min, closeReason: 'found',
  },
];

export const sightings: Sighting[] = [
  { id: 's1', reportId: 'r1', volunteerId: 'v1', rssi: -82, location: { latitude: 24.7759, longitude: 46.7397 }, time: now - 4 * min },
  { id: 's2', reportId: 'r1', volunteerId: 'v1', rssi: -74, location: { latitude: 24.7761, longitude: 46.7400 }, time: now - 2 * min },
];
