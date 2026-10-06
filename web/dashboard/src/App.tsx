import { useEffect, useState } from 'react';
import { members, passerbyReports, reports as mockReports, volunteers, zones, type Report } from '../../../src/mock';
import { useLive, zoneOf } from './live';
import MapView from './MapView';

const TYPE: Record<Report['type'], string> = { lost: 'مفقود', emergency: 'طوارئ', fall: 'سقوط محتمل' };
const KIND = { child: 'طفل', elder: 'كبير سن' };
const STATUS: Record<Report['status'], string> = { open: 'بانتظار متطوع', searching: 'متطوع يبحث', closed: 'مغلق' };

// ponytail: fake data has createdAt 0; stamp staggered times on load until Firebase gives real ones
const start = Date.now();
const reports = mockReports.map((r, i) => ({ ...r, createdAt: r.createdAt || start - (i + 1) * 4 * 60_000 }));
const passerby = passerbyReports.map((p) => ({ ...p, at: p.at || start - 90_000 }));

const open = reports
  .filter((r) => r.status !== 'closed')
  // urgent first (emergency, fall), then oldest first
  .sort((a, b) => Number(a.type === 'lost') - Number(b.type === 'lost') || a.createdAt - b.createdAt);

const rtf = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });
const clock = new Intl.DateTimeFormat('ar', { hour: 'numeric', minute: '2-digit' });
const liveClock = new Intl.DateTimeFormat('ar', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
function since(t: number, now: number) {
  const sec = Math.round((t - now) / 1000);
  if (sec > -5) return 'الآن';
  return sec > -60 ? rtf.format(sec, 'second') : rtf.format(Math.round(sec / 60), 'minute');
}

// Selected report lives in the URL (?r=r2) so a link opens the same case
function useSelected() {
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
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export default function App() {
  const [selected, select] = useSelected();
  const now = useNow();
  const live = useLive(volunteers, open);
  const onDuty = live.vols;
  const lastSignal = live.events.find((e) => e.kind === 'signal');
  // phone layout stacks the detail under the list, so bring it into view after it renders
  useEffect(() => {
    if (selected && matchMedia('(max-width: 1023px)').matches) document.getElementById('detail')?.scrollIntoView();
  }, [selected]);
  const urgent = open.filter((r) => r.type !== 'lost').length;

  return (
    <>
      <a className="skip" href="#detail">تخطي إلى تفاصيل البلاغ</a>
      <header className="top">
        <h1>
          نسيج <span>لوحة الأمن</span>
        </h1>
        <p className="live" role="status">
          <span className="live-dot" aria-hidden="true" />
          مباشر <span className="num">{liveClock.format(live.at)}</span>
        </p>
        <dl className="stats">
          <div>
            <dt>بلاغات مفتوحة</dt>
            <dd>{open.length}</dd>
          </div>
          <div className={urgent ? 'hot' : ''}>
            <dt>طوارئ وسقوط</dt>
            <dd>{urgent}</dd>
          </div>
          <div>
            <dt>متطوعون في الخدمة</dt>
            <dd>{onDuty.length}</dd>
          </div>
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
                      className={`report t-${r.type}`}
                      aria-current={selected?.id === r.id}
                      onClick={() => select(selected?.id === r.id ? null : r.id)}
                    >
                      <span className="badge">{TYPE[r.type]}</span>
                      <strong>
                        {r.member.name}، {KIND[r.member.kind]} {r.member.age}
                      </strong>
                      <span className="muted">{r.area}</span>
                      <span className="meta">
                        <span>{STATUS[r.status]}</span>
                        <span>{since(r.createdAt, now)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

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
                  <time className="muted">{since(e.at, live.at)}</time>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="h-passerby">
            <h2 id="h-passerby">بلاغات المارّة</h2>
            {passerby.length === 0 ? (
              <p className="empty">لم يبلّغ أي مارّ.</p>
            ) : (
              <ul className="plain">
                {passerby.map((p) => {
                  const member = members.find((m) => m.braceletId === p.braceletId);
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
                const vols = onDuty.filter((v) => zoneOf(v.location)?.id === z.id).length;
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
          <MapView zones={zones} reports={open} volunteers={onDuty} lastSignal={lastSignal} selectedId={selected?.id ?? null} onSelect={select} />
        </section>

        <section id="detail" className="detail" aria-live="polite" tabIndex={-1}>
          {selected ? <Detail r={selected} now={now} onClose={() => select(null)} /> : <p className="empty">اختر بلاغًا من القائمة أو من الخريطة لعرض تفاصيله.</p>}
        </section>
      </main>
    </>
  );
}

function Detail({ r, now, onClose }: { r: Report; now: number; onClose: () => void }) {
  const volunteer = volunteers.find((v) => v.id === r.assignedVolunteerId);
  const seenBy = passerby.filter((p) => p.braceletId === r.braceletId);
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
        <dd>{volunteer ? `${volunteer.name} يبحث` : STATUS[r.status]}</dd>
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

      {r.health && (
        <div className="health">
          <h3>حالة صحية: {r.health.condition}</h3>
          <p>{r.health.notes}</p>
        </div>
      )}
    </article>
  );
}
