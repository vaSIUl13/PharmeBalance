"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authRequest } from "../../lib/auth";

export default function ResetPassword() {
  const router = useRouter();
  const [mode, setMode] = useState<"detect" | "request" | "reset">("detect");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function start() {
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (value) {
      setToken(value);
      window.history.replaceState(null, "", window.location.pathname);
    }
    setMode(value ? "reset" : "request");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      if (mode === "reset") {
        await authRequest("password/reset", "POST", { token, newPassword: fields.get("password") });
        router.replace("/login");
      } else {
        await authRequest("password/reset-request", "POST", { email: fields.get("email") });
        setMessage("Якщо акаунт існує, ми надішлемо інструкцію на цю адресу.");
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm space-y-5 p-8">
      <h1 className="text-2xl font-semibold">Відновлення пароля</h1>
      {mode === "detect" ? <button className="underline" onClick={start}>Продовжити</button> : (
        <form className="space-y-4" onSubmit={submit}>
          {mode === "reset" ? (
            <label className="block">Новий пароль
              <input className="block w-full rounded border p-2" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required />
            </label>
          ) : (
            <label className="block">Електронна пошта
              <input className="block w-full rounded border p-2" name="email" type="email" autoComplete="email" maxLength={100} required />
            </label>
          )}
          <button className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50" disabled={busy}>{mode === "reset" ? "Змінити пароль" : "Надіслати посилання"}</button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
      <Link className="underline" href="/login">Повернутися до входу</Link>
    </main>
  );
}
