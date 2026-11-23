"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthCard, AuthLink } from "@/components/auth/auth-card";
import { Badge, buttonClasses, Card } from "@/components/head/ui";
import { AuthField, AuthFeedback } from "@/components/auth/auth-fields";
import { registrationRoles } from "@/components/auth/registration-roles";
import styles from "@/components/auth/auth.module.css";
import { ApiError, apiRequest } from "@/lib/auth";

type Decision = "approve" | "reject";
type RequestSummary = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  login: string;
  requestedRole: string;
  approved: boolean | null;
};

export function RegistrationReview({ id, suggestedDecision }: { id?: string; suggestedDecision?: Decision }) {
  const [requests, setRequests] = useState<RequestSummary[] | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [decision, setDecision] = useState<Decision | undefined>(suggestedDecision);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const route = "registration-requests" + (id ? "/" + encodeURIComponent(id) : "");

  useEffect(() => {
    let active = true;
    apiRequest<RequestSummary | RequestSummary[]>(route).then(result => {
      if (active) setRequests(Array.isArray(result) ? result : [result]);
    }).catch(failure => {
      if (!active) return;
      if (failure instanceof ApiError && failure.status === 401) {
        router.replace("/login?next=" + encodeURIComponent(window.location.pathname + window.location.search));
        return;
      }
      setError(true);
      setMessage(failure instanceof ApiError && failure.status === 403
        ? "Перегляд заявок доступний призначеному суперадміністратору."
        : "Не вдалося завантажити заявку.");
    });
    return () => { active = false; };
  }, [route, router]);

  async function confirm(event: FormEvent<HTMLFormElement>, request: RequestSummary) {
    event.preventDefault();
    if (!decision || busy) return;
    const value = new FormData(event.currentTarget).get("pharmacyId");
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      await apiRequest(route + "/" + decision, "POST", value ? { pharmacyId: Number(value) } : {});
      setRequests([{ ...request, approved: decision === "approve" }]);
      setDecision(undefined);
      setMessage(decision === "approve"
        ? request.requestedRole === "admin"
          ? "Обліковий запис створено. Перед першим входом налаштуйте MFA для цього адміністратора."
          : "Заявку схвалено, обліковий запис створено."
        : "Заявку відхилено.");
    } catch (failure) {
      setError(true);
      setMessage(failure instanceof ApiError && failure.status === 409
        ? "Конфлікт даних. Перевірте зайнятість аптеки, унікальність логіна й email та стан заявки."
        : "Не вдалося підтвердити рішення. Перевірте права доступу й ID аптеки.");
    } finally {
      setBusy(false);
    }
  }

  const request = id ? requests?.[0] : undefined;
  const pharmacyRole = request?.requestedRole === "head" || request?.requestedRole === "logist";

  return (
    <AuthCard embedded title={id ? "Заявка на реєстрацію" : "Заявки на реєстрацію"} description={id ? "Перевірте дані заявника перед ухваленням рішення." : "Заявки, які очікують рішення."}
      footer={id ? <AuthLink href="/superadmin/registration-requests">Усі заявки</AuthLink> : undefined}>
      {!requests && !message && <p role="status">Завантаження…</p>}
      {requests?.length === 0 && <p>Немає заявок на розгляд.</p>}
      {!id && requests && <ul className="space-y-3">
        {requests.map(item => (
          <li key={item.id}>
            <Card>
              <div className="grid gap-3 bg-[#f8faf9] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 break-words font-semibold">{item.firstName} {item.lastName}</p>
                  <Badge tone="warning">Очікує розгляду</Badge>
                </div>
                <div className="min-w-0 break-words text-sm text-[#475569]">
                  <p>{item.email}</p>
                  <p>Бажана роль · {registrationRoles.find(role => role.value === item.requestedRole)?.label}</p>
                </div>
                <Link className={buttonClasses.secondary + " w-fit"} href={"/superadmin/registration-requests?id=" + item.id}>
                  Переглянути заявку
                </Link>
              </div>
            </Card>
          </li>
        ))}
      </ul>}
      {request && (
        <div className="grid gap-4">
          <div>
            {request.approved === null
              ? <Badge tone="warning">Очікує розгляду</Badge>
              : <Badge tone={request.approved ? "success" : "danger"}>{request.approved ? "Схвалено" : "Відхилено"}</Badge>}
          </div>
          <dl className="break-words rounded-md border border-[#e2e8e5] bg-[#f8faf9] p-4">
            <dt className="font-semibold">Заявник</dt><dd>{request.firstName} {request.lastName}</dd>
            <dt className="mt-2 font-semibold">Email</dt><dd>{request.email}</dd>
            <dt className="mt-2 font-semibold">Логін</dt><dd>{request.login}</dd>
            <dt className="mt-2 font-semibold">Бажана роль</dt>
            <dd>{registrationRoles.find(role => role.value === request.requestedRole)?.label}</dd>
          </dl>
          {request.approved === null && (
            <>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={buttonClasses.primary + " aria-pressed:ring-2 aria-pressed:ring-offset-2"} aria-pressed={decision === "approve"} disabled={busy}
                  onClick={() => setDecision("approve")}>Approve</button>
                <button type="button" className={buttonClasses.secondary + " text-[#b91c1c] aria-pressed:ring-2 aria-pressed:ring-offset-2"} aria-pressed={decision === "reject"} disabled={busy}
                  onClick={() => setDecision("reject")}>Reject</button>
              </div>
              {decision && (
                <form className={styles.form} onSubmit={event => confirm(event, request)} key={decision} method="post">
                  {decision === "approve" && pharmacyRole && <AuthField label="ID аптеки" name="pharmacyId" type="number"
                    min={1} max={2147483647} required={request.requestedRole === "head"} />}
                  <button type="submit" className={styles.submit} disabled={busy}>
                    {decision === "approve" ? "Підтвердити схвалення" : "Підтвердити відхилення"}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      )}
      <AuthFeedback message={message} error={error} />
    </AuthCard>
  );
}
