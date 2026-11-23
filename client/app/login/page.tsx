"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthCard, AuthLink } from "@/components/auth/auth-card";
import { AuthFeedback, AuthField, AuthSubmit } from "@/components/auth/auth-fields";
import styles from "@/components/auth/auth.module.css";
import { authRequest } from "@/lib/auth";

const expiredMfa = "Запит MFA завершився. Увійди знову з email і паролем.";

export default function Login() {
  const router = useRouter();
  const [mfa, setMfa] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      if (mfa) {
        await authRequest("mfa/verify", "POST", { code: fields.get("code") });
      } else {
        const { mfaRequired } = await authRequest<{ mfaRequired: boolean }>("login", "POST", {
          email: fields.get("email"), password: fields.get("password"),
        });
        if (mfaRequired) {
          setMfa(true);
          return;
        }
      }
      const next = new URLSearchParams(window.location.search).get("next");
      if (next?.split("?")[0] === "/admin/registration-requests") {
        router.replace(next);
        return;
      }
      const user = await authRequest<{ role: string }>("me").catch(() => null);
      const homes: Record<string, string> = { admin: "/admin/users", head: "/head/dashboard", logist: "/logist/queue" };
      const homes: Record<string, string> = { manager: "/manager/dashboard", head: "/head/dashboard", logist: "/logist/queue" };
      router.replace(homes[user?.role ?? ""] ?? "/account");
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Не вдалося увійти.";
      if (mfa && detail === expiredMfa) setMfa(false);
      setMessage(detail);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={mfa ? "Двофакторна перевірка" : "Вхід у систему"}
      description={mfa ? "Введіть код із застосунку або резервний код." : "Введіть облікові дані, надані адміністратором"}
      footer={mfa ? (
        <button type="button" className={styles.link} disabled={busy} onClick={() => { setMfa(false); setMessage(""); }}>
          Повернутися до входу
        </button>
      ) : <>Немає облікового запису? <AuthLink href="/register">Зареєструватися</AuthLink></>}
    >
      <form className={styles.form} onSubmit={submit} method="post" key={String(mfa)}>
        {mfa ? (
          <AuthField label="Код підтвердження" name="code" autoComplete="one-time-code" maxLength={22}
            pattern={String.raw`[0-9]{6}|[A-Za-z0-9_\-]{22}`} required />
        ) : (
          <>
            <AuthField label="Робочий email" name="email" type="email" placeholder="name@company.ua" autoComplete="username" maxLength={100} required />
            <AuthField label="Пароль" name="password" type="password" placeholder="Введіть пароль" autoComplete="current-password"
              maxLength={256} required labelAction={<AuthLink href="/reset-password">Забули пароль?</AuthLink>} />
          </>
        )}
        <AuthFeedback message={message} error />
        <AuthSubmit busy={busy}>{mfa ? "Підтвердити" : "Увійти"}</AuthSubmit>
      </form>
    </AuthCard>
  );
}
