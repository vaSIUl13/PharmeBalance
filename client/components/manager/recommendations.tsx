"use client";

import { useState } from "react";
import { loadTransfers } from "@/lib/head/api";
import { formatDateTime, formatNumber, transferStatuses } from "@/lib/head/format";
import type { TransferDetail, TransferStatus } from "@/lib/head/types";
import { useResource } from "@/lib/head/use-resource";
import { generateRecommendations } from "@/lib/manager/api";
import type { DecisionCommand } from "@/lib/manager/types";
import { Icon } from "@/components/ui/icon";
import { Badge, buttonClasses, Card, EmptyState, inputClasses, Kpi, Notice, PageHeader, ResourceGate } from "@/components/head/ui";
import { DecisionDialog } from "./decision-dialog";

const listLimit = 100;

export function Recommendations() {
  const trips = useResource(loadTransfers);
  const [status, setStatus] = useState<"all" | TransferStatus>("CREATED");
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<{ trip: TransferDetail; command: DecisionCommand } | null>(null);
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");
  const [generating, setGenerating] = useState(false);

  const items = trips.data ?? [];
  const count = (value: TransferStatus) => items.filter(trip => trip.status === value).length;
  const text = query.trim().toLowerCase();
  const visible = items.filter(trip => (status === "all" || trip.status === status) && (!text ||
    (trip.recommendationId + " " + trip.donorStock.drug.name + " " + trip.donorStock.drug.sku + " " +
      trip.donorStock.pharmacy.name + " " + trip.recipientStock.pharmacy.name).toLowerCase().includes(text)));

  function done(result: string, ok: boolean) {
    setDialog(null);
    setMessage(ok ? result : "");
    setProblem(ok ? "" : result);
    trips.reload();
  }

  async function generate() {
    if (generating) return;
    setGenerating(true);
    setMessage("");
    setProblem("");
    try {
      await generateRecommendations();
      setMessage("Рекомендації сформовано за останнім прогнозом.");
      trips.reload();
    } catch {
      setProblem("Не вдалося сформувати рекомендації. Перевірте, що прогноз розраховано, і спробуйте ще раз.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <PageHeader title="Рекомендації перерозподілу" subtitle="Рішення щодо переміщень між аптеками мережі" actions={
        <button type="button" className={buttonClasses.secondary} onClick={generate} disabled={generating}>
          <Icon name="refresh" size={14} />{generating ? "Формування…" : "Сформувати за останнім прогнозом"}
        </button>
      } />
      {message && <Notice tone="success">{message}</Notice>}
      {problem && <Notice tone="danger">{problem}</Notice>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Очікують рішення" icon="clock" tone="warning" value={trips.data ? count("CREATED") : "…"} />
        <Kpi label="Підтверджені" icon="check" tone="info" value={trips.data ? count("CONFIRMED") : "…"} />
        <Kpi label="У виконанні" icon="truck" tone="warning" value={trips.data ? count("IN_PROGRESS") : "…"} />
        <Kpi label="Виконані" icon="check" tone="success" value={trips.data ? count("COMPLETED") : "…"} />
      </div>

      <Card>
        <form className="grid gap-3 border-b border-[#e2e8e5] p-4 sm:grid-cols-[220px_1fr]" role="search" onSubmit={event => event.preventDefault()}>
          <div>
            <label htmlFor="rec-status" className="mb-1 block text-xs font-semibold text-[#475569]">Статус</label>
            <select id="rec-status" className={inputClasses} value={status} onChange={event => setStatus(event.target.value as "all" | TransferStatus)}>
              <option value="all">Усі</option>
              {(Object.keys(transferStatuses) as TransferStatus[]).map(value => (
                <option key={value} value={value}>{transferStatuses[value].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="rec-query" className="mb-1 block text-xs font-semibold text-[#475569]">Пошук</label>
            <input id="rec-query" type="search" className={inputClasses} placeholder="Номер, препарат або аптека" value={query}
              onChange={event => setQuery(event.target.value)} />
          </div>
        </form>

        <ResourceGate resource={trips} errorText="Не вдалося завантажити рекомендації.">
          {() => items.length === 0
            ? <EmptyState title="Рекомендацій ще немає" hint="Сформуйте їх за останнім прогнозом" />
            : visible.length === 0
              ? <EmptyState title="Нічого не знайдено" hint="Змініть статус або пошуковий запит" />
              : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#e2e8e5] text-left text-xs text-[#64748b]">
                          <th scope="col" className="px-4 py-2 font-medium">№</th>
                          <th scope="col" className="px-2 py-2 font-medium">Препарат</th>
                          <th scope="col" className="px-2 py-2 font-medium">Маршрут</th>
                          <th scope="col" className="px-2 py-2 text-right font-medium">Кількість</th>
                          <th scope="col" className="px-2 py-2 text-right font-medium">Пріоритет</th>
                          <th scope="col" className="px-2 py-2 font-medium">Створено</th>
                          <th scope="col" className="px-2 py-2 font-medium">Статус</th>
                          <th scope="col" className="px-4 py-2"><span className="sr-only">Дії</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map(trip => {
                          const view = transferStatuses[trip.status];
                          return (
                            <tr key={trip.recommendationId} className="border-b border-[#e2e8e5] last:border-0">
                              <td className="px-4 py-3 tabular-nums text-[#475569]">{trip.recommendationId}</td>
                              <td className="px-2 py-3"><p className="font-medium">{trip.donorStock.drug.name}</p>
                                <p className="text-xs tabular-nums text-[#64748b]">{trip.donorStock.drug.sku}</p></td>
                              <td className="px-2 py-3">{trip.donorStock.pharmacy.name} → {trip.recipientStock.pharmacy.name}</td>
                              <td className="px-2 py-3 text-right tabular-nums">{formatNumber(trip.quantity)} {trip.donorStock.drug.unit}</td>
                              <td className="px-2 py-3 text-right tabular-nums">{trip.priority}</td>
                              <td className="whitespace-nowrap px-2 py-3 tabular-nums text-[#475569]">{formatDateTime(trip.createdAt)}</td>
                              <td className="px-2 py-3"><Badge tone={view.tone}>{view.label}</Badge></td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap justify-end gap-2">
                                  {trip.status === "CREATED" && <>
                                    <button type="button" className={buttonClasses.primary} onClick={() => setDialog({ trip, command: "CONFIRM" })}>Підтвердити</button>
                                    <button type="button" className={buttonClasses.secondary} onClick={() => setDialog({ trip, command: "REJECT" })}>Відхилити</button>
                                  </>}
                                  {trip.status === "CONFIRMED" && (
                                    <button type="button" className={buttonClasses.secondary} onClick={() => setDialog({ trip, command: "CANCEL" })}>Скасувати</button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {items.length >= listLimit && (
                    <p className="border-t border-[#e2e8e5] px-4 py-3 text-xs text-[#64748b]">Показано перші {listLimit} рекомендацій.</p>
                  )}
                </>
              )}
        </ResourceGate>
      </Card>

      {dialog && <DecisionDialog trip={dialog.trip} command={dialog.command} onClose={() => setDialog(null)} onDone={done} />}
    </>
  );
}
