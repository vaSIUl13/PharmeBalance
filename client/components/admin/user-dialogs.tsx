"use client";

import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/auth";
import { blockUser, createUser, updateAccess } from "@/lib/admin/api";
import { fullName, needsPharmacy, roleCodes, roleLabels } from "@/lib/admin/format";
import type { AdminPharmacy, AdminUser, RoleCode } from "@/lib/admin/types";
import { buttonClasses, inputClasses, Notice } from "@/components/head/ui";
import { Modal } from "./modal";

const labelClasses = "mb-1 block text-xs font-semibold text-[#475569]";

function useAction(onDone: (message: string) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(action: () => Promise<unknown>, success: string, describe: (failure: ApiError | null) => string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      onDone(success);
    } catch (failure) {
      setError(describe(failure instanceof ApiError ? failure : null));
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, run };
}

function PharmacySelect({ id, pharmacies, defaultValue, required }: {
  id: string;
  pharmacies: AdminPharmacy[];
  defaultValue?: number;
  required: boolean;
}) {
  return (
    <select id={id} name="pharmacyId" className={inputClasses} required={required} defaultValue={defaultValue ?? ""}>
      <option value="">{required ? "Оберіть аптеку" : "Без призначення"}</option>
      {pharmacies.map(pharmacy => (
        <option key={pharmacy.pharmacyId} value={pharmacy.pharmacyId}>{pharmacy.name} · {pharmacy.city}</option>
      ))}
    </select>
  );
}

function RoleSelect({ id, value, disabled, onChange }: {
  id: string;
  value: RoleCode;
  disabled?: boolean;
  onChange: (role: RoleCode) => void;
}) {
  return (
    <select id={id} name="role" className={inputClasses} value={value} disabled={disabled}
      onChange={event => onChange(event.target.value as RoleCode)}>
      {roleCodes.map(code => <option key={code} value={code}>{roleLabels[code]}</option>)}
    </select>
  );
}

export function CreateUserDialog({ pharmacies, onClose, onDone }: {
  pharmacies: AdminPharmacy[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { busy, error, run } = useAction(onDone);
  const [role, setRole] = useState<RoleCode>("manager");
  const [problem, setProblem] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const password = String(form.get("password") ?? "");
    const pharmacy = text("pharmacyId");
    if (password.length < 8) {
      setProblem("Пароль має містити щонайменше 8 символів.");
      return;
    }
    setProblem("");
    void run(() => createUser({
      login: text("login"), email: text("email").toLowerCase(), firstName: text("firstName"), lastName: text("lastName"),
      password, role, ...(needsPharmacy(role) && pharmacy ? { pharmacyId: Number(pharmacy) } : {}),
    }), "Користувача створено.", failure => {
      if (failure?.status === 409) return "Користувач із таким логіном або email уже існує, або аптека вже має завідувача.";
      if (failure?.status === 400) {
        if (failure.message === "Invalid password") return "Сервер відхилив пароль. Перевірте, чи він має від 8 до 256 символів.";
        if (failure.message === "Invalid email") return "Перевірте формат email.";
        if (failure.message === "A pharmacy is required for a head") return "Виберіть аптеку для завідувача.";
        return "Перевірте введені дані й повторіть спробу.";
      }
      if (failure?.status === 403) return "Недостатньо прав для створення користувачів.";
      return "Не вдалося створити користувача. Спробуйте ще раз.";
    });
  }

  return (
    <Modal title="Новий користувач" busy={busy} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <div><label htmlFor="new-last" className={labelClasses}>Прізвище</label>
            <input id="new-last" name="lastName" className={inputClasses} maxLength={60} required autoComplete="off" /></div>
          <div><label htmlFor="new-first" className={labelClasses}>Ім’я</label>
            <input id="new-first" name="firstName" className={inputClasses} maxLength={60} required autoComplete="off" /></div>
          <div><label htmlFor="new-login" className={labelClasses}>Логін</label>
            <input id="new-login" name="login" className={inputClasses} maxLength={50} required autoComplete="off" /></div>
          <div><label htmlFor="new-email" className={labelClasses}>Email</label>
            <input id="new-email" name="email" type="email" className={inputClasses} maxLength={100} required autoComplete="off" /></div>
          <div><label htmlFor="new-role" className={labelClasses}>Роль</label>
            <RoleSelect id="new-role" value={role} onChange={setRole} /></div>
          {needsPharmacy(role) && (
            <div key={role}><label htmlFor="new-pharmacy" className={labelClasses}>Аптека{role === "head" ? "" : " (необов’язково)"}</label>
              <PharmacySelect id="new-pharmacy" pharmacies={pharmacies} required={role === "head"} /></div>
          )}
          <div className="sm:col-span-2">
            <label htmlFor="new-password" className={labelClasses}>Тимчасовий пароль</label>
            <input id="new-password" name="password" type="password" className={inputClasses} minLength={8} maxLength={256}
              required autoComplete="new-password" aria-describedby="new-password-hint" />
            <p id="new-password-hint" className="mt-1 text-xs text-[#64748b]">Щонайменше 8 символів. Передайте його користувачеві безпечним каналом.</p>
          </div>
          {(problem || error) && <div className="sm:col-span-2"><Notice tone="danger">{problem || error}</Notice></div>}
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-[#e2e8e5] px-5 py-4">
          <button type="button" className={buttonClasses.secondary} onClick={onClose} disabled={busy}>Скасувати</button>
          <button type="submit" className={buttonClasses.primary} disabled={busy}>{busy ? "Зачекайте…" : "Створити"}</button>
        </footer>
      </form>
    </Modal>
  );
}

export function AccessDialog({ user, self, pharmacies, onClose, onDone }: {
  user: AdminUser;
  self: boolean;
  pharmacies: AdminPharmacy[];
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { busy, error, run } = useAction(onDone);
  const [role, setRole] = useState<RoleCode>(user.role.code === "superadmin" ? "admin" : user.role.code);
  const [problem, setProblem] = useState("");
  const changed = role !== user.role.code;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const pharmacy = String(new FormData(event.currentTarget).get("pharmacyId") ?? "");
    if (!changed && !pharmacy) {
      setProblem("Змініть роль або оберіть аптеку.");
      return;
    }
    if (changed && role === "head" && !pharmacy) {
      setProblem("Для завідувача оберіть аптеку.");
      return;
    }
    setProblem("");
    void run(() => updateAccess(user.userId, {
      ...(changed ? { role } : {}), ...(needsPharmacy(role) && pharmacy ? { pharmacyId: Number(pharmacy) } : {}),
    }), "Доступ оновлено.", failure => {
      if (failure?.status === 403) return "Не можна змінити власну роль або бракує прав.";
      if (failure?.status === 409) return "Не вдалося змінити доступ: аптека вже має завідувача, завідувач обслуговує іншу аптеку або обліковий запис заблоковано.";
      if (failure?.status === 404) return "Користувача чи аптеку не знайдено.";
      if (failure?.status === 400) return "Перевірте вибір ролі та аптеки.";
      return "Не вдалося змінити доступ. Спробуйте ще раз.";
    });
  }

  return (
    <Modal title="Змінити доступ" subtitle={fullName(user) + " · " + user.email} busy={busy} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="space-y-4 px-5 py-4">
          <div>
            <label htmlFor="access-role" className={labelClasses}>Роль</label>
            <RoleSelect id="access-role" value={role} onChange={setRole} disabled={self} />
            {self && <p className="mt-1 text-xs text-[#64748b]">Власну роль змінювати не можна.</p>}
          </div>
          {needsPharmacy(role) && (
            <div key={role}>
              <label htmlFor="access-pharmacy" className={labelClasses}>
                {role === "head" ? "Аптека завідувача" : "Додати аптеку"}
              </label>
              <PharmacySelect id="access-pharmacy" pharmacies={pharmacies} required={changed && role === "head"} />
            </div>
          )}
          {changed && <Notice tone="warning">Під час зміни ролі поточні призначення до аптек будуть завершені.</Notice>}
          {(problem || error) && <Notice tone="danger">{problem || error}</Notice>}
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-[#e2e8e5] px-5 py-4">
          <button type="button" className={buttonClasses.secondary} onClick={onClose} disabled={busy}>Скасувати</button>
          <button type="submit" className={buttonClasses.primary} disabled={busy}>{busy ? "Зачекайте…" : "Зберегти"}</button>
        </footer>
      </form>
    </Modal>
  );
}

export function BlockDialog({ user, onClose, onDone }: {
  user: AdminUser;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { busy, error, run } = useAction(onDone);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(() => blockUser(user.userId), "Обліковий запис заблоковано.", failure =>
      failure?.status === 403 ? "Не можна заблокувати власний обліковий запис або бракує прав."
        : "Не вдалося заблокувати користувача. Спробуйте ще раз.");
  }

  return (
    <Modal title="Заблокувати користувача?" subtitle={fullName(user) + " · " + user.email} busy={busy} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="space-y-4 px-5 py-4">
          <Notice tone="warning">
            Усі активні сеанси буде завершено, призначення до аптек знято. Розблокування в системі не передбачене.
          </Notice>
          {error && <Notice tone="danger">{error}</Notice>}
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-[#e2e8e5] px-5 py-4">
          <button type="button" className={buttonClasses.secondary} onClick={onClose} disabled={busy}>Скасувати</button>
          <button type="submit" disabled={busy}
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-[#b91c1c] px-4 text-sm font-medium text-white hover:enabled:bg-[#991b1b] disabled:opacity-60">
            {busy ? "Зачекайте…" : "Заблокувати"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
