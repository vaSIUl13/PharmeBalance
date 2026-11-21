"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { authRequest } from "../../lib/auth";

export default function Login() {
  const router = useRouter();
  const [mfa, setMfa] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      if (mfa) {
        await authRequest("mfa/verify", "POST", { code: fields.get("code") });
      } else {
        const result = await authRequest<{ mfaRequired: boolean }>("login", "POST", {
          email: fields.get("email"), password: fields.get("password"),
        });
        if (result.mfaRequired) {
          setMfa(true);
          return;
        }
      }
      router.replace("/account");
    } catch (error) {
      const detail = (error as Error).message;
      if (mfa && detail === "Запит MFA завершився. Увійди знову з email і паролем.") setMfa(false);
      setMessage(detail);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm space-y-5 p-8">
      <h1 className="text-2xl font-semibold">{mfa ? "Двофакторна перевірка" : "Вхід у PharmeBalance"}</h1>
      <form className="space-y-4" onSubmit={submit} key={String(mfa)}>
        {mfa ? (
          <label className="block">Код із застосунку або резервний код
            <input className="block w-full rounded border p-2" name="code" autoComplete="one-time-code" pattern="[0-9]{6}|[A-Za-z0-9_\-]{22}" maxLength={22} required />
          </label>
        ) : (
          <>
            <label className="block">Електронна пошта
              <input className="block w-full rounded border p-2" name="email" type="email" autoComplete="username" maxLength={100} required />
            </label>
            <label className="block">Пароль
              <input className="block w-full rounded border p-2" name="password" type="password" autoComplete="current-password" maxLength={256} required />
            </label>
          </>
        )}
        {message && <p role="alert">{message}</p>}
        <button className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50" disabled={busy}>
          {mfa ? "Підтвердити" : "Увійти"}
        </button>
      </form>
      {mfa ? <button type="button" className="underline" onClick={() => { setMfa(false); setMessage(""); }}>Повернутися до входу</button>
        : <Link className="underline" href="/reset-password">Відновити пароль</Link>}
    </main>
  );
}
