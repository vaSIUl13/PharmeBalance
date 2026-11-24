"use client";

import { useState } from "react";
import { buttonClasses, Card, Notice, PageHeader, ResourceGate } from "@/components/head/ui";
import { apiRequest } from "@/lib/auth";
import { useResource } from "@/lib/head/use-resource";

type DayStatus = {
  enabled: boolean; latestDay: string | null; nextDay: string | null; today: string;
  scheduledThrough: string; automatic: boolean;
};
type CloseResult =
  | { status: "closed"; day: string; pharmacies: number; positions: number; sold: number; received: number;
      returned: number; runId: number; fileName: string; recommendations: { created: number } }
  | { status: "no-seed" | "no-active-stock" | "already-updated" | "out-of-order" | "up-to-date" };

const endpoint = "demo-day";
const loadDay = () => apiRequest<DayStatus>(endpoint);
const displayDay = (day: string | null) => day ? day.split("-").reverse().join(".") : "—";

export function DemoDay() {
  const status = useResource(loadDay);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [report, setReport] = useState<Extract<CloseResult, { status: "closed" }> | null>(null);

  async function close(day: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await apiRequest<CloseResult>(endpoint, "POST", { day });
      if (result.status === "closed") setReport(result);
      else if (result.status === "no-seed" || result.status === "no-active-stock") {
        setMessage("Для закриття потрібні початкові продажі та запаси в активній demo-аптеці.");
      } else setMessage("Стан зрізу оновлено. Перевірте наступну доступну дату.");
      status.reload();
    } catch {
      setError("Запит на закриття дня не завершився. Перевірте стан і повторіть за потреби.");
      status.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Закриття demo-дня" subtitle="Синтетичні продажі, поповнення та прогноз для demo-мережі" />
      {error && <Notice tone="danger">{error}</Notice>}
      {message && <Notice tone="neutral">{message}</Notice>}
      <Card>
        <ResourceGate resource={status} errorText="Не вдалося отримати стан demo-зрізу.">
          {data => {
            const next = data.nextDay;
            if (!data.enabled) return <div className="p-4"><Notice tone="neutral">Закриття доступне в demo-БД.</Notice></div>;
            return (
              <div className="space-y-4 p-4">
                <dl className="grid gap-4 text-sm sm:grid-cols-3">
                  <div><dt className="text-[#64748b]">Останній зріз</dt><dd className="font-semibold">{displayDay(data.latestDay)}</dd></div>
                  <div><dt className="text-[#64748b]">Наступний день</dt><dd className="font-semibold">{displayDay(next)}</dd></div>
                  <div><dt className="text-[#64748b]">Автоматичне закриття</dt><dd className="font-semibold">
                    {data.automatic ? "18:00 за Києвом · якщо запущено воркер" : "Вимкнено"}
                  </dd></div>
                </dl>
                {!next && <p className="text-sm text-[#475569]">Потрібен початковий засів demo-продажів і запасів.</p>}
                {next && next > data.today && <p className="text-sm text-[#475569]">Дані актуальні до сьогодні.</p>}
                <button type="button" className={buttonClasses.primary}
                  disabled={busy || status.loading || !next || next > data.today}
                  onClick={() => { if (next) void close(next); }}>
                  {busy ? "Закриваємо день і рахуємо прогноз…" : "Закрити наступний demo-день"}
                </button>
              </div>
            );
          }}
        </ResourceGate>
      </Card>
      {report && <Card title={`День ${displayDay(report.day)} закрито`}>
        <div className="space-y-2 p-4 text-sm">
          <p>Аптек: {report.pharmacies} · позицій: {report.positions} · прогноз №{report.runId}</p>
          <p>Продано: {report.sold} · поповнено: {report.received} · повернено: {report.returned} · рекомендацій: {report.recommendations.created}</p>
          <p className="break-all text-[#64748b]">JSON-звіт: {report.fileName}</p>
        </div>
      </Card>}
    </>
  );
}
