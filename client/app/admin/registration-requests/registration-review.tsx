"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthCard, AuthLink } from "@/components/auth/auth-card";
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
      setMessage(decision === "approve" ? "Заявку схвалено, обліковий запис створено." : "Заявку відхилено.");
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
    <AuthCard title="Заявки на реєстрацію" description={id ? "Перевірте дані заявника перед ухваленням рішення." : "Заявки, які очікують рішення."}
      footer={id ? <AuthLink href="/admin/registration-requests">Усі заявки</AuthLink> : <AuthLink href="/account">До облікового запису</AuthLink>}>
      {!requests && !message && <p role="status">Завантаження…</p>}
      {requests?.length === 0 && <p>Немає заявок на розгляд.</p>}
      {!id && requests && <ul className="space-y-3">
        {requests.map(item => (
          <li key={item.id} className="break-words">
            <AuthLink href={"/admin/registration-requests?id=" + item.id}>{item.firstName} {item.lastName} · {item.email}</AuthLink>
          </li>
        ))}
      </ul>}
      {request && (
        <div className="grid gap-4">
          <dl className="break-words">
            <dt className="font-semibold">Заявник</dt><dd>{request.firstName} {request.lastName}</dd>
            <dt className="mt-2 font-semibold">Email</dt><dd>{request.email}</dd>
            <dt className="mt-2 font-semibold">Логін</dt><dd>{request.login}</dd>
            <dt className="mt-2 font-semibold">Бажана роль</dt>
            <dd>{registrationRoles.find(role => role.value === request.requestedRole)?.label}</dd>
          </dl>
          {request.approved === null ? (
            <>
              <div className="flex gap-4">
                <button type="button" className={styles.link} aria-pressed={decision === "approve"} disabled={busy}
                  onClick={() => setDecision("approve")}>Approve</button>
                <button type="button" className={styles.link} aria-pressed={decision === "reject"} disabled={busy}
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
          ) : <p>Статус: {request.approved ? "Схвалено" : "Відхилено"}</p>}
        </div>
      )}
      <AuthFeedback message={message} error={error} />
    </AuthCard>
  );
}
