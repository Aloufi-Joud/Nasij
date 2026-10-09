import { useEffect, useMemo, useState } from 'react';
import { zones, type ClosedAs, type Health, type PasserbyReport, type Report, type Sighting, type Volunteer } from '../../../src/mock';
import { minSec } from '../../../src/components/digits';
import { metresBetween } from '../../../src/components/geo';
import { TYPE, useLive, zoneOf } from './live';
import MapView from './MapView';

// A report nobody took after this long is flagged in red and beeps once
const LATE_MS = 2 * 60_000;
const isLate = (r: Report, now: number) => r.status === 'open' && now - r.createdAt >= LATE_MS;
// Handed to security by a volunteer, waiting for the family at the security point
const atDesk = (r: Report) => r.closedAs === 'security' && !r.reunitedAt;

// Short beeps from the browser itself (no sound file). Browsers keep sound off until the page is clicked once:
// the login does that, and so does the sound button in the header
let audio: AudioContext | null = null;
function beep(times: number) {
  audio ??= new AudioContext();
  void audio.resume();
  for (let i = 0; i < times; i++) {
    const at = audio.currentTime + i * 0.35;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.25);
    osc.connect(gain).connect(audio.destination);
    osc.start(at);
    osc.stop(at + 0.25);
  }
}

// Beeps for each new report (emergency and fall three times) and when a report becomes late.
// What was already there when the page opened stays quiet
function useAlarm(open: Report[], now: number, on: boolean) {
  const [loaded] = useState(Date.now);
  const [heard] = useState(() => new Set<string>());
  useEffect(() => {
    const fresh = [
      ...open.filter((r) => r.createdAt > loaded).map((r) => ({ key: r.id, urgent: r.type !== 'lost' })),
      ...open.filter((r) => isLate(r, now) && r.createdAt + LATE_MS > loaded).map((r) => ({ key: `${r.id}:late`, urgent: false })),
    ].filter((x) => !heard.has(x.key));
    fresh.forEach((x) => heard.add(x.key));
    if (on && fresh.length) beep(fresh.some((x) => x.urgent) ? 3 : 1);
  }, [open, now, on, loaded, heard]);
}

const KIND = { child: 'طفل', elder: 'كبير سن' };
const STATUS: Record<Report['status'], string> = { open: 'بانتظار متطوع', searching: 'متطوع يبحث', closed: 'مغلق' };
const CLOSED: Record<ClosedAs, string> = { found: 'سُلّم للعائلة', security: 'سُلّم لنقطة الأمن', helped: 'سوعد في مكانه', expired: 'أُغلق تلقائيًا' };
const took = (r: Report) => minSec(r.closedAt! - r.createdAt, ' د', ' ث');

// One case as a story: sent, taken, heard in each area, passer-by, closed. Sightings come every ~10 s,
// so only a change of area is shown
type Step = { at: number; text: string; kind: 'report' | 'signal' | 'passerby' };
function timeline(r: Report, sightings: Sighting[], passerby: PasserbyReport[], volunteers: Volunteer[]): Step[] {
  const name = volunteers.find((v) => v.id === r.assignedVolunteerId)?.name ?? 'متطوع';
  const end = r.closedAt ?? Infinity;
  const steps: Step[] = [{ at: r.createdAt, kind: 'report', text: `أُرسل البلاغ (${TYPE[r.type]})` }];
  if (r.acceptedAt) steps.push({ at: r.acceptedAt, kind: 'signal', text: `${name} استلم البلاغ` });
  let area: string | undefined;
  for (const x of sightings.filter((x) => x.reportId === r.id).sort((a, b) => a.at - b.at)) {
    if (x.area === area) continue;
    area = x.area;
    steps.push({ at: x.at, kind: 'signal', text: `التُقطت إشارة السوار${x.area ? ` في ${x.area}` : ''}` });
  }
  for (const p of passerby) {
    if (p.braceletId.toUpperCase() === r.braceletId.toUpperCase() && p.at >= r.createdAt && p.at <= end) {
      steps.push({ at: p.at, kind: 'passerby', text: 'مارّ أبلغ عن السوار' });
    }
  }
  if (r.closedAt) steps.push({ at: r.closedAt, kind: 'report', text: `${CLOSED[r.closedAs ?? 'found']}${r.securityPoint ? ` (${r.securityPoint})` : ''} خلال ${took(r)}` });
  if (r.reunitedAt) steps.push({ at: r.reunitedAt, kind: 'report', text: 'سُلّم لولي الأمر عند نقطة الأمن' });
  return steps.sort((a, b) => a.at - b.at);
}

// urgent first (emergency, fall), then oldest first
const byUrgency = (a: Report, b: Report) => Number(a.type === 'lost') - Number(b.type === 'lost') || a.createdAt - b.createdAt;

const rtf = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });
const clock = new Intl.DateTimeFormat('ar', { hour: 'numeric', minute: '2-digit' });
const liveClock = new Intl.DateTimeFormat('ar', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
function since(t: number, now: number) {
  const sec = Math.round((t - now) / 1000);
  if (sec > -5) return 'الآن';
  return sec > -60 ? rtf.format(sec, 'second') : rtf.format(Math.round(sec / 60), 'minute');
}

// Selected report lives in the URL (?r=r2) so a link opens the same case
function useSelected(open: Report[]) {
  const [id, setId] = useState(() => new URLSearchParams(location.search).get('r'));
  useEffect(() => {
    const onPop = () => setId(new URLSearchParams(location.search).get('r'));
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);
  const select = (next: string | null) => {
    history.pushState(null, '', next ? `?r=${next}` : location.pathname);
    setId(next);
  };
  return [open.find((r) => r.id === id) ?? null, select] as const;
}

function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function App() {
  const live = useLive();
  // memo: the map redraws its report markers only when Firestore sends new reports
  const open = useMemo(() => [...live.reports].sort(byUrgency), [live.reports]);
  const all = useMemo(() => [...open, ...live.closed], [open, live.closed]);
  const [selected, select] = useSelected(all);
  const found = live.closed.filter((r) => r.closedAs === 'found' || r.closedAs === 'helped');
  const avg = found.length ? found.reduce((t, r) => t + r.closedAt! - r.createdAt, 0) / found.length : 0;
  const now = useNow();
  const lastSignal = live.events.find((e) => e.kind === 'signal');
  // phone layout stacks the detail under the list, so bring it into view after it renders
  useEffect(() => {
    if (selected && matchMedia('(max-width: 1023px)').matches) document.getElementById('detail')?.scrollIntoView();
  }, [selected]);
  const urgent = open.filter((r) => r.type !== 'lost').length;
  const late = open.filter((r) => isLate(r, now)).length;
  const desk = live.closed.filter(atDesk);
  const caseOf = (v: Volunteer) => open.find((r) => r.assignedVolunteerId === v.id);
  const free = live.volunteers.filter((v) => !caseOf(v));
  const [sound, setSound] = useState(true);
  useAlarm(open, now, sound);

  return (
    <>
      <a className="skip" href="#detail">تخطي إلى تفاصيل البلاغ</a>
      <header className="top">
        <h1>
          نسيج <span>لوحة الأمن</span>
        </h1>
        <p className="live" role="status">
          <span className="live-dot" aria-hidden="true" />
          مباشر <span className="num">{liveClock.format(now)}</span>
        </p>
        <button
          className="sound"
          aria-pressed={sound}
          onClick={() => {
            if (!sound) beep(1); // also lets the browser play sound from now on
            setSound(!sound);
          }}
        >
          {sound ? 'التنبيه الصوتي يعمل' : 'التنبيه الصوتي موقوف'}
        </button>
        <dl className="stats">
          <div>
            <dt>بلاغات مفتوحة</dt>
            <dd>{open.length}</dd>
          </div>
          <div className={urgent ? 'hot' : ''}>
            <dt>طوارئ وسقوط</dt>
            <dd>{urgent}</dd>
          </div>
          <div className={late ? 'hot' : ''}>
            <dt>بلا متطوع +٢ د</dt>
            <dd>{late}</dd>
          </div>
          <div>
            <dt>متطوعون متاحون</dt>
            <dd>
              {free.length}
              <span className="of">/{live.volunteers.length}</span>
            </dd>
          </div>
          {desk.length > 0 && (
            <div className="warm">
              <dt>عند نقطة الأمن</dt>
              <dd>{desk.length}</dd>
            </div>
          )}
          {found.length > 0 && (
            <div>
              <dt>متوسط وقت الإيجاد</dt>
              <dd>{minSec(avg, ' د', ' ث')}</dd>
            </div>
          )}
        </dl>
      </header>

      <main className="layout">
        <aside className="side">
          <section aria-labelledby="h-open">
            <h2 id="h-open">البلاغات المفتوحة</h2>
            {open.length === 0 ? (
              <p className="empty">لا توجد بلاغات مفتوحة الآن.</p>
            ) : (
              <ul className="reports">
                {open.map((r) => (
                  <li key={r.id}>
                    <button
                      className={`report t-${r.type}${isLate(r, now) ? ' late' : ''}`}
                      aria-current={selected?.id === r.id}
                      onClick={() => select(selected?.id === r.id ? null : r.id)}
                    >
                      <span className="badge">{TYPE[r.type]}</span>
                      <strong>
                        {r.member.name}، {KIND[r.member.kind]} {r.member.age}
                      </strong>
                      <span className="muted">{r.area}</span>
                      <span className="meta">
                        <span className="state">{isLate(r, now) ? 'لم يستلمه أحد' : STATUS[r.status]}</span>
                        <span>{since(r.createdAt, now)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {desk.length > 0 && (
            <section aria-labelledby="h-desk">
              <h2 id="h-desk">عند نقطة الأمن</h2>
              <ul className="plain">
                {desk.map((r) => (
                  <li key={r.id}>
                    <button className="row desk" aria-current={selected?.id === r.id} onClick={() => select(selected?.id === r.id ? null : r.id)}>
                      <strong>
                        {r.member.name}، {KIND[r.member.kind]} {r.member.age}
                      </strong>
                      <span className="muted">ينتظر ولي الأمر، وصل {since(r.closedAt!, now)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="h-vols">
            <h2 id="h-vols">المتطوعون في الخدمة</h2>
            {live.volunteers.length === 0 ? (
              <p className="empty">لا يوجد متطوع في الخدمة.</p>
            ) : (
              <ul className="plain">
                {[...free, ...live.volunteers.filter(caseOf)].map((v) => {
                  const r = caseOf(v);
                  const label = (
                    <>
                      <strong>{v.name}</strong>
                      <span className="muted">
                        {zoneOf(v.location)?.name ?? v.area}، {r ? `مع بلاغ ${r.member.name}` : 'متاح'}
                      </span>
                    </>
                  );
                  return (
                    <li key={v.id}>
                      {r ? (
                        <button className="row" onClick={() => select(r.id)}>
                          {label}
                        </button>
                      ) : (
                        <div className="row free">{label}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {live.closed.length > desk.length && (
            <section aria-labelledby="h-closed">
              <h2 id="h-closed">أُغلقت اليوم</h2>
              <ul className="plain">
                {live.closed.filter((r) => !atDesk(r)).map((r) => (
                  <li key={r.id}>
                    <button className="row" aria-current={selected?.id === r.id} onClick={() => select(selected?.id === r.id ? null : r.id)}>
                      <strong>{r.member.name}</strong>
                      <span className="muted">
                        {CLOSED[r.closedAs ?? 'found']} خلال {took(r)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="h-feed">
            <h2 id="h-feed">آخر النشاط</h2>
            <ol className="feed">
              {live.events.slice(0, 6).map((e) => (
                <li key={e.id} className={`f-${e.kind}`}>
                  {e.reportId ? (
                    <button className="feed-row" onClick={() => select(e.reportId!)}>
                      {e.text}
                    </button>
                  ) : (
                    <span className="feed-row">{e.text}</span>
                  )}
                  <time className="muted">{since(e.at, now)}</time>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="h-passerby">
            <h2 id="h-passerby">بلاغات المارّة</h2>
            {live.passerby.length === 0 ? (
              <p className="empty">لم يبلّغ أي مارّ.</p>
            ) : (
              <ul className="plain">
                {live.passerby.map((p) => {
                  const member = live.memberOf(p.braceletId);
                  const report = open.find((r) => r.braceletId === p.braceletId);
                  const label = (
                    <>
                      <strong>{member ? member.name : 'سوار غير مربوط'}</strong>
                      <span className="muted">
                        {zoneOf(p.location)?.name ?? 'موقع غير معروف'}، {since(p.at, now)}
                      </span>
                    </>
                  );
                  return (
                    <li key={p.id}>
                      {report ? (
                        <button className="row" onClick={() => select(report.id)}>
                          {label}
                        </button>
                      ) : (
                        <div className="row">{label}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-labelledby="h-zones">
            <h2 id="h-zones">المناطق</h2>
            <ul className="zones">
              {zones.map((z) => {
                const cases = open.filter((r) => zoneOf(r.location)?.id === z.id).length;
                const vols = live.volunteers.filter((v) => zoneOf(v.location)?.id === z.id).length;
                return (
                  <li key={z.id} className={cases ? 'busy' : ''}>
                    <strong>{z.name}</strong>
                    <span className="num">{cases} بلاغ</span>
                    <span className="num">{vols} متطوع</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>

        <section className="map" aria-label="خريطة الفعالية">
          <MapView zones={zones} reports={open} volunteers={live.volunteers} lastSignal={lastSignal} selectedId={selected?.id ?? null} onSelect={select} />
        </section>

        <section id="detail" className="detail" aria-live="polite" tabIndex={-1}>
          {selected ? (
            <Detail key={selected.id} r={selected} now={now} live={live} free={free} onClose={() => select(null)} />
          ) : (
            <p className="empty">اختر بلاغًا من القائمة أو من الخريطة لعرض تفاصيله.</p>
          )}
        </section>
      </main>
    </>
  );
}

const metres = new Intl.NumberFormat('ar');

type DetailProps = { r: Report; now: number; live: ReturnType<typeof useLive>; free: Volunteer[]; onClose: () => void };
function Detail({ r, now, live, free, onClose }: DetailProps) {
  const { volunteers, passerby, sightings } = live;
  const volunteer = volunteers.find((v) => v.id === r.assignedVolunteerId);
  const seenBy = passerby.filter((p) => p.braceletId.toUpperCase() === r.braceletId.toUpperCase()).sort((a, b) => a.at - b.at);
  // Health and the family phone sit in their own documents (reports/{id}/private/...); security may read them.
  // They exist while the case is open, or while the person waits at the security point
  const holds = !r.closedAt || atDesk(r);
  const [health, setHealth] = useState<Health | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  useEffect(() => {
    if (!holds) return;
    live.healthOf(r.id).then(setHealth, () => {});
    live.phoneOf(r.id).then(setPhone, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.id, holds]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = (action: Promise<void>, failed: string) => {
    setBusy(true);
    setError('');
    action.catch(() => setError(failed)).finally(() => setBusy(false));
  };
  // Nearest free volunteers first
  const away = (v: Volunteer) => (r.location ? metresBetween(v.location, r.location) : Infinity);
  const nearest = [...free].sort((a, b) => away(a) - away(b));
  return (
    <article className={`t-${r.type}`}>
      <div className="detail-head">
        <span className="badge">{TYPE[r.type]}</span>
        <button className="ghost" onClick={onClose}>
          إغلاق
        </button>
      </div>
      <div className="who">
        {r.photo ? (
          <img src={r.photo} alt={`صورة ${r.member.name}`} width={88} height={88} />
        ) : (
          <div className="no-photo" aria-hidden="true">
            {r.member.name[0]}
          </div>
        )}
        <div>
          <h2>{r.member.name}</h2>
          <p className="muted">
            {KIND[r.member.kind]}، العمر {r.member.age}
          </p>
        </div>
      </div>

      <dl className="facts">
        <dt>الوصف</dt>
        <dd>{r.description || 'لم تكتب العائلة وصفًا.'}</dd>
        <dt>آخر موقع</dt>
        <dd>
          {r.area}
          {zoneOf(r.location) && <span className="muted"> ({zoneOf(r.location)!.name})</span>}
        </dd>
        <dt>وقت البلاغ</dt>
        <dd>
          {clock.format(r.createdAt)}، {since(r.createdAt, now)}
        </dd>
        <dt>الحالة</dt>
        <dd>
          {atDesk(r)
            ? 'عند نقطة الأمن، بانتظار ولي الأمر'
            : r.reunitedAt
              ? 'سُلّم لولي الأمر عند نقطة الأمن'
              : r.closedAt
                ? `${CLOSED[r.closedAs ?? 'found']} خلال ${took(r)}`
                : volunteer
                  ? `${volunteer.name} يبحث`
                  : STATUS[r.status]}
        </dd>
        {holds && phone && (
          <>
            <dt>جوال العائلة</dt>
            <dd>
              <a className="mono" href={`tel:${phone}`} dir="ltr" translate="no">
                {phone}
              </a>
            </dd>
          </>
        )}
        <dt>رقم السوار</dt>
        <dd className="mono" translate="no">
          {r.braceletId}
        </dd>
        {seenBy.length > 0 && (
          <>
            <dt>بلاغ مارّ</dt>
            <dd>
              {seenBy.length} بلاغ، آخره {since(seenBy[seenBy.length - 1].at, now)}
            </dd>
          </>
        )}
      </dl>

      {holds && health && (
        <div className="health">
          <h3>حالة صحية: {health.condition}</h3>
          <p>{health.notes}</p>
        </div>
      )}

      {atDesk(r) && (
        <div className="action">
          <h3>التسليم لولي الأمر</h3>
          <p className="muted">تحقق من هوية ولي الأمر قبل التسليم. بعد التسليم تُحذف الصورة والحالة الصحية ورقم الجوال.</p>
          <button
            className="primary"
            disabled={busy}
            onClick={() => confirm(`تأكيد تسليم ${r.member.name} لولي الأمر بعد التحقق من هويته؟`) && run(live.reunite(r.id), 'تعذّر الحفظ، تحقق من الاتصال وحاول مرة ثانية')}
          >
            سُلّم لولي الأمر
          </button>
        </div>
      )}

      {!r.closedAt && (
        <div className="action">
          <h3>{volunteer ? 'تحويل البلاغ لمتطوع آخر' : 'تكليف متطوع'}</h3>
          {nearest.length === 0 ? (
            <p className="muted">لا يوجد متطوع متاح الآن.</p>
          ) : (
            <ul className="plain">
              {nearest.slice(0, 4).map((v) => (
                <li key={v.id} className="assign">
                  <span>
                    <strong>{v.name}</strong>
                    <span className="muted">
                      {' '}
                      {zoneOf(v.location)?.name ?? v.area}
                      {Number.isFinite(away(v)) && `، ${metres.format(Math.round(away(v) / 10) * 10)} م`}
                    </span>
                  </span>
                  <button className="ghost" disabled={busy} onClick={() => run(live.assign(r.id, v.id), 'تعذّر التكليف، تحقق من الاتصال وحاول مرة ثانية')}>
                    كلّف
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <h3 className="steps-title">مسار البلاغ</h3>
      <ol className="feed">
        {timeline(r, sightings, passerby, volunteers).map((x, i) => (
          <li key={i} className={`f-${x.kind}`}>
            <span className="feed-row">{x.text}</span>
            <time className="muted">{clock.format(x.at)}</time>
          </li>
        ))}
      </ol>
    </article>
  );
}
