// Passer-by report page (Person 3). Opened by the NFC sticker or the QR on the bracelet strap:
//   https://<page>/?b=785005002D12   (the bracelet number; #785005002D12 works too)
// No login, and it shows no personal data: it only sends the bracelet number, the time and,
// if the passer-by allows it, their location. Security matches the number to the member.
import { useState } from 'react';
import { braceletNumber, createPasserbyReport } from '../../../src/firebase/passerby';
import type { Point } from '../../../src/mock';

// slow: no answer yet. Firestore keeps the write and sends it when the network comes back,
// so the page waits instead of offering a retry that would send the report twice.
type Stage = 'ready' | 'sending' | 'slow' | 'sent' | 'failed';

const AMBULANCE = '997';
const SLOW_AFTER_MS = 12_000;

function numberFromUrl() {
  const url = new URL(window.location.href);
  return braceletNumber(url.searchParams.get('b') ?? url.hash.slice(1));
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
  const [bracelet, setBracelet] = useState(numberFromUrl);
  const [typed, setTyped] = useState('');
  const [stage, setStage] = useState<Stage>('ready');
  const [withLocation, setWithLocation] = useState(true);

  const busy = stage === 'sending' || stage === 'slow';

  const send = async () => {
    if (!bracelet || busy) return;
    setStage('sending');
    const slow = setTimeout(() => setStage((s) => (s === 'sending' ? 'slow' : s)), SLOW_AFTER_MS);
    try {
      const location = withLocation ? await whereAmI() : null;
      await createPasserbyReport(bracelet, location);
      setStage('sent');
    } catch {
      setStage('failed');
    } finally {
      clearTimeout(slow);
    }
  };

  const typedNumber = braceletNumber(typed);

  return (
    <main className="page">
      <header className="brand">
        <span className="logo" aria-hidden="true">ن</span>
        <span>
          <strong>نسيج</strong>
          <small>لا أحد يضيع في الزحام</small>
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
      ) : !bracelet ? (
        <section className="card">
          <h1>رقم السوار غير واضح</h1>
          <p>اكتب الرقم المطبوع على ظهر السوار، تحت رمز الاستجابة السريعة. يتكون من ١٢ حرفًا ورقمًا.</p>
          <label className="field">
            <span>رقم السوار</span>
            <input
              dir="ltr"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              placeholder="785005002D12"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </label>
          <button className="btn" disabled={!typedNumber} onClick={() => setBracelet(typedNumber)}>
            متابعة
          </button>
          <p className="muted after">إذا لم تجد الرقم، اتجه لأقرب نقطة أمن أو اتصل بالإسعاف {AMBULANCE}</p>
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
