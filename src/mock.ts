// Nasij fake data (Step 0 draft). Its shape is the agreed data model:
// the Firebase backend copies these types exactly in Phase 2.

export type Kind = 'child' | 'elder';
export type Point = { latitude: number; longitude: number };

// lost = parent tapped "my child is lost"
// emergency = double press on the bracelet
// fall = bracelet stopped moving for 60 s (possible fall)
export type ReportType = 'lost' | 'emergency' | 'fall';
export type ReportStatus = 'open' | 'searching' | 'closed';
// found = handed to the family, security = handed to security or ambulance,
// helped = helped on the spot (e.g. an emergency press), nobody needed to take over
export type ClosedAs = 'found' | 'security' | 'helped' | 'expired'; // expired = closed by scripts/cleanup.mjs
export type Gender = 'male' | 'female';

// Languages a member speaks and a volunteer can offer; volunteers who share it get the report first
export const LANGUAGES = {
  ar: 'العربية', en: 'الإنجليزية', ur: 'الأردية', hi: 'الهندية', bn: 'البنغالية', id: 'الإندونيسية', fr: 'الفرنسية', tr: 'التركية',
} as const;
export type Language = keyof typeof LANGUAGES;

// Age limits checked when the family saves a member
export const MAX_AGE = { child: 16, elder: 120 } as const;

export type Health = {
  condition: string; // what the family wrote, e.g. "Asthma"
  notes: string; // what a helper should know or do
};

export type Member = {
  id: string;
  name: string;
  kind: Kind;
  gender: Gender;
  age: number;
  language: Language;
  phone: string | null; // family phone; the assigned volunteer calls it directly
  description: string; // how to recognise them today (clothes, looks), used by bracelet alerts
  health: Health | null; // optional, for child or elderly
  braceletId: string | null; // linked bracelet this visit
};

export type Report = {
  id: string;
  type: ReportType;
  braceletId: string; // per-visit bracelet number (MAC), the only thing the bracelet broadcasts
  member: { name: string; kind: Kind; age: number; gender?: Gender; language?: Language };
  photo: string | null; // small data URI stored inside the report (Spark plan has no Storage)
  description: string; // clothing and looks, written by the parent
  health: Health | null; // shown only to the assigned volunteer, deleted on close
  phone: string | null; // family phone, same privacy as health
  hasCode?: boolean; // a child's report: handing over to the family needs the code (checked by the rules)
  memberId?: string; // which of the family's members, so the family app finds its open reports after a restart
  area: string; // last known area inside the event
  location: Point | null; // last known position, for the security map
  createdAt: number; // ms since epoch
  status: ReportStatus;
  assignedVolunteerId: string | null;
  acceptedAt?: number | null; // when a volunteer took the case, for the case timeline
  closedAs: ClosedAs | null;
  closedAt: number | null;
  reunitedAt?: number | null; // closed as 'security': when security handed the person to the family
};

export type Volunteer = {
  id: string;
  name: string;
  onDuty: boolean;
  area: string;
  location: Point;
};

// A volunteer's phone heard a reported bracelet
export type Sighting = {
  id: string;
  reportId: string;
  volunteerId: string;
  rssi: number;
  at: number;
  area: string;
  location: Point;
};

// Passer-by tapped the NFC sticker or scanned the QR. Only the bracelet number
// is known; the system matches it to a member and alerts the nearest volunteer.
export type PasserbyReport = {
  id: string;
  braceletId: string;
  at: number;
  location: Point | null; // from the browser, if the passer-by allows it
};

// An area of the event, for the security dashboard.
// Coordinates sit on the Expo 2030 Riyadh site (approx., between KAPSARC and King Khalid airport)
export type Zone = {
  id: string;
  name: string;
  center: Point;
  radius: number; // metres
};

// Illustrations, not real children
const PHOTO_SANA = 'data:image/jpeg;base64,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';
const PHOTO_YOUSEF = 'data:image/jpeg;base64,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';

// The five Expo 2030 Riyadh zones around the central plaza (petals of the masterplan)
export const zones: Zone[] = [
  { id: 'z1', name: 'منطقة المملكة', center: { latitude: 24.9124, longitude: 46.7050 }, radius: 220 },
  { id: 'z2', name: 'المجتمعات المزدهرة', center: { latitude: 24.9100, longitude: 46.7086 }, radius: 220 },
  { id: 'z3', name: 'التكنولوجيا التحويلية', center: { latitude: 24.9063, longitude: 46.7072 }, radius: 220 },
  { id: 'z4', name: 'التعاون الدولي', center: { latitude: 24.9063, longitude: 46.7028 }, radius: 220 },
  { id: 'z5', name: 'الحلول المستدامة', center: { latitude: 24.9100, longitude: 46.7014 }, radius: 220 },
  { id: 'z6', name: 'الساحة المركزية', center: { latitude: 24.9090, longitude: 46.7050 }, radius: 130 },
];

export const ME: Volunteer = {
  id: 'v1', name: 'متطوع ١', onDuty: false, area: 'منطقة المملكة', location: { latitude: 24.9121, longitude: 46.7055 },
};

export const volunteers: Volunteer[] = [
  ME,
  { id: 'v2', name: 'متطوع ٢', onDuty: true, area: 'الساحة المركزية', location: { latitude: 24.9092, longitude: 46.7046 } },
  { id: 'v3', name: 'متطوع ٣', onDuty: true, area: 'المجتمعات المزدهرة', location: { latitude: 24.9097, longitude: 46.7074 } },
];

export const members: Member[] = [
  { id: 'm1', name: 'سنا', gender: 'female', language: 'ar', phone: null, description: '', kind: 'child', age: 6, health: null, braceletId: '785005002D12' },
  {
    id: 'm2',
    name: 'يوسف',
    gender: 'male',
    language: 'ar',
    phone: null,
    description: '',
    braceletId: '785005002E40',
    kind: 'child',
    age: 8,
    health: { condition: 'ربو', notes: 'بخاخه في الجيب الأمامي لحقيبته الصغيرة. إذا ضاق نفسه أجلسه في مكان هادئ ومظلل.' },
  },
  {
    id: 'm3',
    name: 'عبدالله',
    gender: 'male',
    language: 'ar',
    phone: null,
    description: '',
    braceletId: '785005002F07',
    kind: 'elder',
    age: 74,
    health: { condition: 'سكري وضغط', notes: 'يحمل علبة عصير في جيبه. إذا ظهر عليه دوار أو تعرّق شديد أخبر المسعفين بأنه مريض سكري.' },
  },
  {
    id: 'm4',
    name: 'فاطمة',
    gender: 'female',
    language: 'ar',
    phone: null,
    description: '',
    braceletId: '785005003A19',
    kind: 'elder',
    age: 68,
    health: { condition: 'هشاشة عظام', notes: 'لا تحرّكها إذا اشتكت من ألم في الورك أو الظهر حتى يصل الإسعاف.' },
  },
];

// Minutes before the app loaded, so demo screens show "6 minutes ago", not a 1970 date
const ago = (min: number) => Date.now() - min * 60_000;
const base = { status: 'open' as ReportStatus, assignedVolunteerId: null, closedAs: null, closedAt: null, phone: null };

export const reports: Report[] = [
  {
    ...base,
    id: 'r1',
    type: 'lost',
    braceletId: '785005002D12',
    member: { name: 'سنا', kind: 'child', age: 6 },
    photo: PHOTO_SANA,
    description: 'فستان أصفر وحذاء أبيض، شعرها مربوط بشريطة وردية، تحمل بالونًا أزرق',
    health: null,
    area: 'منطقة المملكة، قرب المدخل',
    location: { latitude: 24.9121, longitude: 46.7042 },
    createdAt: ago(6),
  },
  {
    ...base,
    id: 'r2',
    type: 'lost',
    braceletId: '785005002E40',
    member: { name: 'يوسف', kind: 'child', age: 8 },
    photo: PHOTO_YOUSEF,
    description: 'قميص أحمر وبنطلون جينز، شعر قصير، على ظهره حقيبة صغيرة رمادية',
    health: members[1].health,
    area: 'الساحة المركزية، عند النافورة',
    location: { latitude: 24.9087, longitude: 46.7052 },
    createdAt: ago(3),
  },
  {
    ...base,
    id: 'r3',
    type: 'emergency',
    braceletId: '785005002F07',
    member: { name: 'عبدالله', kind: 'elder', age: 74 },
    photo: null,
    description: 'ثوب أبيض وشماغ أحمر، يمشي بعكاز',
    health: members[2].health,
    area: 'منطقة الجلوس في المجتمعات المزدهرة',
    location: { latitude: 24.9095, longitude: 46.7083 },
    createdAt: ago(1),
  },
  {
    ...base,
    id: 'r4',
    type: 'fall',
    braceletId: '785005003A19',
    member: { name: 'فاطمة', kind: 'elder', age: 68 },
    photo: null,
    description: 'عباءة سوداء وحقيبة يد بنية',
    health: members[3].health,
    area: 'الممر بين التعاون الدولي والتكنولوجيا التحويلية',
    location: { latitude: 24.9054, longitude: 46.7050 },
    createdAt: ago(2),
  },
];

export const sightings: Sighting[] = [];

export const passerbyReports: PasserbyReport[] = [
  { id: 'p1', braceletId: '785005002F07', at: ago(1), location: { latitude: 24.9096, longitude: 46.7083 } },
];
