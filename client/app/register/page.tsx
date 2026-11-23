"use client";

import { useState, type FormEvent } from "react";
import { AuthCard, AuthLink } from "@/components/auth/auth-card";
import { AuthFeedback, AuthField, AuthSubmit } from "@/components/auth/auth-fields";
import { RegistrationRoles } from "@/components/auth/registration-roles";
import styles from "@/components/auth/auth.module.css";
import { ApiError, apiRequest } from "@/lib/auth";

export default function Register() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    const password = String(fields.get("password") ?? "");
    if (password !== fields.get("confirmPassword")) {
      setMessage("Паролі не збігаються.");
      return;
    }
    if (!/\p{L}/u.test(password) || !/\d/.test(password)) {
      setMessage("Пароль має містити літери та цифри.");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      await apiRequest("registration-requests", "POST", {
        lastName: fields.get("lastName"), firstName: fields.get("firstName"),
        email: fields.get("email"), login: fields.get("login"), role: fields.get("role"),
        consent: fields.get("consent") === "on", password,
      });
      setSubmitted(true);
    } catch (error) {
      setMessage(error instanceof ApiError && error.status === 429
        ? "Забагато спроб. Спробуйте пізніше."
        : "Не вдалося подати заявку. Перевірте дані й спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title="Реєстрація"
      description="Подайте заявку на створення облікового запису. Роль і аптеку підтвердить адміністратор."
      footer={<>Вже маєте обліковий запис? <AuthLink href="/login">Увійти</AuthLink></>}
    >
      {submitted ? (
        <AuthFeedback message="Якщо заявку вдалося зареєструвати, адміністратор розгляне її. Вхід стане доступним після схвалення." />
      ) : (
        <form className={styles.form} method="post" onSubmit={submit}>
          <div className="grid gap-3 lg:grid-cols-2">
            <AuthField label="Прізвище *" name="lastName" placeholder="Петренко" autoComplete="family-name" maxLength={60} required />
            <AuthField label="Ім’я *" name="firstName" placeholder="Андрій" autoComplete="given-name" maxLength={60} required />
          </div>
          <AuthField label="Робочий email *" name="email" type="email" placeholder="name@company.ua" autoComplete="email" maxLength={100} required />
          <AuthField label="Логін *" name="login" placeholder="mgr.petrenko" autoComplete="username" minLength={4} maxLength={50}
            pattern="[A-Za-z0-9.]{4,50}" hint="Латиниця, цифри та крапка. Мінімум 4 символи" required />
          <RegistrationRoles />
          <AuthField label="Пароль *" name="password" type="password" placeholder="Мінімум 8 символів" autoComplete="new-password" minLength={8} maxLength={256} required />
          <AuthField label="Повторіть пароль *" name="confirmPassword" type="password" placeholder="Введіть пароль ще раз" autoComplete="new-password" maxLength={256} required />
          <label className="flex items-start gap-2 text-slate-600">
            <input type="checkbox" name="consent" className="mt-1 accent-teal-700" required />
            Погоджуюсь з умовами використання та обробкою персональних даних
          </label>
          <AuthFeedback message={message} error />
          <AuthSubmit busy={busy}>Зареєструватися</AuthSubmit>
        </form>
      )}
    </AuthCard>
  );
}
