"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authRequest } from "../../lib/auth";

type Session = { id: string; device: string; lastSeenAt: string; current: boolean };

export default function Account() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authRequest<{ email: string }>("me").then(async (user) => {
      const list = await authRequest<Session[]>("sessions");
      if (!cancelled) {
        setEmail(user.email);
        setSessions(list);
      }
    }).catch(() => { if (!cancelled) router.replace("/login"); });
    return () => { cancelled = true; };
  }, [router]);

  async function execute(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    void execute(async () => {
      await authRequest("password/change", "POST", {
        currentPassword: fields.get("currentPassword"), newPassword: fields.get("newPassword"),
      });
      router.replace("/login");
    });
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Активні сеанси</h1>
      {email && <p>{email}</p>}
      {message && <p role="alert">{message}</p>}
      {!email ? <p role="status">Завантаження…</p> : (
        <>
          <ul className="space-y-3">
            {sessions.map((session) => (
              <li className="break-words rounded border p-3" key={session.id}>
                <p>{session.device}{session.current && " (поточний)"}</p>
                <p>Остання активність: {new Date(session.lastSeenAt).toLocaleString("uk-UA")}</p>
                <button className="underline disabled:opacity-50" disabled={busy} onClick={() => execute(async () => {
                  await authRequest("sessions/" + session.id, "DELETE");
                  if (session.current) router.replace("/login");
                  else setSessions(await authRequest<Session[]>("sessions"));
                })}>Завершити сеанс</button>
              </li>
            ))}
          </ul>
          <button className="underline disabled:opacity-50" disabled={busy} onClick={() => execute(async () => {
            await authRequest("logout-all", "POST");
            router.replace("/login");
          })}>Вийти на всіх пристроях</button>
          <form className="space-y-3 border-t pt-4" onSubmit={changePassword}>
            <h2 className="text-lg font-semibold">Зміна пароля</h2>
            <label className="block">Поточний пароль
              <input className="block rounded border p-2" name="currentPassword" type="password" autoComplete="current-password" maxLength={256} required />
            </label>
            <label className="block">Новий пароль
              <input className="block rounded border p-2" name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={256} required />
            </label>
            <button className="underline disabled:opacity-50" disabled={busy}>Змінити пароль</button>
          </form>
        </>
      )}
    </main>
  );
}
