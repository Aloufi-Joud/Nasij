// Security staff only: sign in, then the rules let a users/{uid}.role = 'security' account read everything.
// Security accounts are made by staff in the Firebase console; there is no sign-up here.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../../src/firebase';

export default function Login({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(
    () =>
      onAuthStateChanged(auth, async (u) => {
        setUser(u);
        setAllowed(null);
        if (!u) return;
        const role = await getDoc(doc(db, 'users', u.uid)).then((d) => d.data()?.role, () => null);
        setAllowed(role === 'security');
      }),
    [],
  );

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, String(f.get('email')).trim(), String(f.get('password')));
    } catch {
      setError('البريد أو كلمة المرور غير صحيحة');
    } finally {
      setBusy(false);
    }
  };

  if (user === undefined || (user && allowed === null)) return <p className="empty">جارٍ التحميل…</p>;
  if (user && allowed) return <>{children}</>;

  return (
    <main className="login">
      <h1>
        نسيج <span>لوحة الأمن</span>
      </h1>
      {user ? (
        <>
          <p>هذا الحساب ليس حساب أمن.</p>
          <p className="muted">
            رقم الحساب: <span className="mono" translate="no">{user.uid}</span>
          </p>
          <button className="ghost" onClick={() => signOut(auth)}>
            تسجيل الخروج
          </button>
        </>
      ) : (
        <form onSubmit={submit}>
          <label>
            البريد الإلكتروني
            <input name="email" type="email" autoComplete="username" required dir="ltr" />
          </label>
          <label>
            كلمة المرور
            <input name="password" type="password" autoComplete="current-password" required minLength={6} dir="ltr" />
          </label>
          {error && <p role="alert" className="login-error">{error}</p>}
          <button type="submit" disabled={busy}>
            {busy ? 'جارٍ الدخول…' : 'دخول'}
          </button>
        </form>
      )}
    </main>
  );
}
