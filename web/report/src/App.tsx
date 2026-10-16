// Passer-by report page. Opened by the NFC sticker or the QR on the bracelet strap:
//   https://<page>/?t=<secret token>   (made by scripts/tokens.mjs; #<token> works too)
// The token is the proof that the passer-by holds the bracelet: the rules refuse reports without it, so
// nobody can report bracelets by guessing their printed numbers from home.
// No login, and it shows no personal data: it only sends the bracelet number, the time and,
// if the passer-by allows it, their location. Security matches the number to the member.
// ?demo shows the page with a sample bracelet and sends nothing (the README links it).
import { useEffect, useState } from 'react';
import { braceletOfToken, createPasserbyReport } from '../../../src/firebase/passerby';
import type { Point } from '../../../src/mock';

// slow: no answer yet. Firestore keeps the write and sends it when the network comes back,
// so the page waits instead of offering a retry that would send the report twice.
type Stage = 'ready' | 'sending' | 'slow' | 'sent' | 'failed';

const AMBULANCE = '997';
const SLOW_AFTER_MS = 12_000;
const DEMO = new URLSearchParams(window.location.search).has('demo');

function tokenFromUrl() {
  const url = new URL(window.location.href);
  return url.searchParams.get('t') ?? url.hash.slice(1);
}

// The passer-by's location, or null if they refuse or it takes too long: the report goes either way
function whereAmI(): Promise<Point | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((done) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => done({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => done(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  });
}

export default function App() {
  const [token] = useState(tokenFromUrl);
  // undefined: still checking the sticker, null: unknown sticker
  const [bracelet, setBracelet] = useState<string | null | undefined>(undefined);
  const [stage, setStage] = useState<Stage>('ready');
  const [withLocation, setWithLocation] = useState(true);

  const busy = stage === 'sending' || stage === 'slow';

  useEffect(() => {
    if (DEMO) return setBracelet('785005002D12');
    braceletOfToken(token).then(setBracelet, () => setBracelet(null));
  }, [token]);

  const send = async () => {
    if (!bracelet || busy) return;
    setStage('sending');
    const slow = setTimeout(() => setStage((s) => (s === 'sending' ? 'slow' : s)), SLOW_AFTER_MS);
    try {
      const location = withLocation ? await whereAmI() : null;
      if (!DEMO) await createPasserbyReport(token, location);
      setStage('sent');
    } catch {
      setStage('failed');
    } finally {
      clearTimeout(slow);
    }
  };

  return (
    <main className="page">
      <header className="brand">
        <span className="logo" aria-hidden="true">ن</span>
        <span>
          <strong>نسيج</strong>
          <small>نسيجٌ من الأمان حول من تحب</small>
        </span>
      </header>

      {stage === 'sent' ? (
        <section className="card done" aria-live="polite">
          <div className="badge ok" aria-hidden="true">✓</div>
          <h1>وصل بلاغك</h1>
          <p>أبلغنا فريق المتطوعين والأمن. شكرًا لأنك توقفت للمساعدة.</p>
          <ul className="steps">
            <li>إذا قدرت، ابقَ مع الشخص في مكانك حتى يصل أحد</li>
            <li>إذا كان مصابًا أو لا يستجيب، اتصل بالإسعاف فورًا</li>
          </ul>
          <a className="btn danger" href={`tel:${AMBULANCE}`}>
            اتصل بالإسعاف {AMBULANCE}
          </a>
        </section>
      ) : bracelet === undefined ? (
        <section className="card" aria-busy="true">
          <p className="muted">جارٍ قراءة الملصق…</p>
        </section>
      ) : !bracelet ? (
        <section className="card">
          <h1>تعذّرت قراءة الملصق</h1>
          <p>جرّب تقريب الجوال من الملصق مرة ثانية، أو امسح رمز الاستجابة السريعة على السوار.</p>
          <p>إذا لم ينجح، ابقَ مع الشخص واطلب من أقرب متطوع أو اتجه لأقرب نقطة أمن.</p>
          <a className="btn danger" href={`tel:${AMBULANCE}`}>
            اتصل بالإسعاف {AMBULANCE}
          </a>
        </section>
      ) : (
        <section className="card">
          <h1>وجدت شخصًا يحتاج مساعدة؟</h1>
          <p>هذا السوار لطفل أو كبير سن مسجّل في نسيج. اضغط الزر وسيصل بلاغك لفريق المتطوعين والأمن في الفعالية.</p>

          <label className="check">
            <input type="checkbox" checked={withLocation} onChange={(e) => setWithLocation(e.target.checked)} disabled={busy} />
            <span>أرسل موقعي معه، ليصلوا أسرع</span>
          </label>

          <button className="btn big" onClick={send} disabled={busy} aria-busy={busy}>
            {busy ? 'جارٍ الإرسال…' : 'أبلغ عن حالة'}
          </button>

          {stage === 'slow' && (
            <p className="warn" role="status">
              الشبكة ضعيفة. أبقِ الصفحة مفتوحة وسيُرسل البلاغ تلقائيًا متى رجع الاتصال، أو اتجه لأقرب نقطة أمن.
            </p>
          )}

          {stage === 'failed' && (
            <p className="error" role="alert">
              تعذّر الإرسال، تحقق من الإنترنت وحاول مرة ثانية. أو اتجه لأقرب نقطة أمن.
            </p>
          )}

          <a className="btn ghost" href={`tel:${AMBULANCE}`}>
            حالة طارئة؟ اتصل بالإسعاف {AMBULANCE}
          </a>

          <a className="btn ghost volunteer" href={`nasij://bracelet?t=${token}`}>
            أنا متطوع، افتح في تطبيق نسيج
          </a>

          <p className="privacy">
            <span aria-hidden="true">🔒</span> لن ترى أي بيانات عن صاحب السوار، ولا نطلب اسمك أو رقمك.
          </p>
        </section>
      )}

      {bracelet && (
        <footer className="muted foot">
          رقم السوار: <bdi className="mono">{bracelet}</bdi>
        </footer>
      )}
    </main>
  );
}
