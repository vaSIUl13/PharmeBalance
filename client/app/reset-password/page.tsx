"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { AuthCard, AuthLink } from "@/components/auth/auth-card";
import { AuthFeedback, AuthField, AuthSubmit } from "@/components/auth/auth-fields";
import styles from "@/components/auth/auth.module.css";
import { authRequest } from "@/lib/auth";

function subscribeToFragment(change: () => void) {
  window.addEventListener("hashchange", change);
  return () => window.removeEventListener("hashchange", change);
}

function readToken() {
  return new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
}

export default function ResetPassword() {
  const router = useRouter();
  const token = useSyncExternalStore(subscribeToFragment, readToken, () => "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      if (token) {
        const password = fields.get("password");
        if (password !== fields.get("confirmPassword")) throw new Error("Паролі не збігаються.");
        await authRequest("password/reset", "POST", { token, newPassword: password });
        window.history.replaceState(null, "", window.location.pathname);
        router.replace("/login");
      } else {
        await authRequest("password/reset-request", "POST", { email: fields.get("email") });
        setMessage("Якщо акаунт існує, ми надішлемо інструкцію на цю адресу.");
      }
    } catch (failure) {
      setError(true);
      setMessage(failure instanceof Error ? failure.message : "Не вдалося відновити пароль.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title={token ? "Новий пароль" : "Відновлення пароля"}
      description={token ? "Введіть і підтвердьте новий пароль." : "Вкажіть email облікового запису — ми надішлемо посилання для скидання пароля"}
      footer={<AuthLink href="/login"><span className="inline-flex items-center gap-1.5"><Icon name="arrow_right" size={14} />Повернутися до входу</span></AuthLink>}
    >
      <form className={styles.form} onSubmit={submit} method="post" key={String(Boolean(token))}>
        {token ? (
          <>
            <AuthField label="Новий пароль" name="password" type="password" minLength={8} maxLength={256}
              hint="Щонайменше 8 символів" autoComplete="new-password" required />
            <AuthField label="Повторіть пароль" name="confirmPassword" type="password" autoComplete="new-password" maxLength={256} required />
          </>
        ) : (
          <AuthField label="Email" name="email" type="email" placeholder="name@company.ua" autoComplete="email" maxLength={100} required />
        )}
        <AuthFeedback message={message} error={error} />
        <AuthSubmit busy={busy}>{token ? "Змінити пароль" : "Надіслати посилання"}</AuthSubmit>
      </form>
    </AuthCard>
  );
}
