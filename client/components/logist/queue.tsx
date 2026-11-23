"use client";

import Link from "next/link";
import { useState } from "react";
import { loadTransfers } from "@/lib/head/api";
import { useResource } from "@/lib/head/use-resource";
import { byQueueOrder, distance, formatKm } from "@/lib/logist/format";
import type { TransferDetail } from "@/lib/head/types";
import { Icon } from "@/components/head/icon";
import { buttonClasses, Card, EmptyState, inputClasses, Kpi, Notice, PageHeader, ResourceGate } from "@/components/head/ui";
import { DispatchDialog } from "./dispatch-dialog";
import { DrugLine, RouteStops, TripStatus } from "./trip-parts";

type Filter = "active" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED";

const filters: { value: Filter; label: string }[] = [
  { value: "active", label: "Всі активні" },
  { value: "CONFIRMED", label: "Очікують відправлення" },
  { value: "IN_PROGRESS", label: "В дорозі" },
  { value: "COMPLETED", label: "Завершені" },
];

function matchesFilter(trip: TransferDetail, filter: Filter): boolean {
  if (filter === "active") return trip.status === "CONFIRMED" || trip.status === "IN_PROGRESS";
  return trip.status === filter;
}

export function Queue() {
  const trips = useResource(loadTransfers);
  const [filter, setFilter] = useState<Filter>("active");
  const [donor, setDonor] = useState("all");
  const [dispatching, setDispatching] = useState<TransferDetail | null>(null);
  const [message, setMessage] = useState("");

  const items = trips.data ?? [];
  const count = (status: TransferDetail["status"]) => items.filter(trip => trip.status === status).length;
  const pending = items.filter(trip => trip.status === "CONFIRMED" || trip.status === "IN_PROGRESS");
  const queuedKm = pending.reduce((sum, trip) => sum + (distance(trip) ?? 0), 0);
  const donors = [...new Map(items.map(trip => [trip.donorStock.pharmacy.pharmacyId, trip.donorStock.pharmacy.name] as const)).entries()];
  const visible = items
    .filter(trip => matchesFilter(trip, filter) && (donor === "all" || String(trip.donorStock.pharmacy.pharmacyId) === donor))
    .sort(byQueueOrder);

  function changed(result: string) {
    setDispatching(null);
    setMessage(result);
    trips.reload();
  }

  return (
    <>
      <PageHeader title="Черга завдань на перевезення" subtitle="Бачите лише підтверджені рекомендації з призначених вам аптек" />
      {message && <Notice tone="success">{message}</Notice>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Очікують відправлення" icon="clock" tone="info" value={trips.data ? count("CONFIRMED") : "…"} />
        <Kpi label="В дорозі" icon="truck" tone="warning" value={trips.data ? count("IN_PROGRESS") : "…"} />
        <Kpi label="Завершено" icon="check" tone="success" value={trips.data ? count("COMPLETED") : "…"} />
        <Kpi label="Км у черзі" icon="box" value={trips.data ? formatKm(queuedKm) : "…"} note="сумарна відстань активних рейсів" />
      </div>

      <Card>
        <form className="flex flex-wrap items-end gap-3 border-b border-[#e2e8e5] p-4" onSubmit={event => event.preventDefault()}>
          <div className="w-full sm:w-60">
            <label htmlFor="queue-filter" className="mb-1 block text-xs font-semibold text-[#475569]">Статус</label>
            <select id="queue-filter" className={inputClasses} value={filter} onChange={event => setFilter(event.target.value as Filter)}>
              {filters.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="w-full sm:w-72">
            <label htmlFor="queue-donor" className="mb-1 block text-xs font-semibold text-[#475569]">Аптека-донор</label>
            <select id="queue-donor" className={inputClasses} value={donor} onChange={event => setDonor(event.target.value)}>
              <option value="all">Усі донори</option>
              {donors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </div>
        </form>

        <ResourceGate resource={trips} errorText="Не вдалося завантажити чергу завдань.">
          {() => visible.length === 0
            ? <EmptyState title="Завдань немає" hint="Нові підтверджені рекомендації з’являться тут після оновлення" />
            : (
              <ul className="grid gap-3 p-4 lg:grid-cols-2">
                {visible.map(trip => (
                  <li key={trip.recommendationId} className="flex flex-col gap-3 rounded-xl border border-[#e2e8e5] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm"><b className="tabular-nums">№{trip.recommendationId}</b>
                        <span className="ml-2 text-[#64748b]">Пріоритет {trip.priority}</span></p>
                      <TripStatus status={trip.status} />
                    </div>
                    <DrugLine trip={trip} />
                    <RouteStops trip={trip} />
                    <p className="text-sm text-[#475569]">Відстань: <b className="tabular-nums text-[#0f172a]">{formatKm(distance(trip))}</b></p>
                    <div className="flex flex-wrap gap-2">
                      {trip.status === "CONFIRMED" && (
                        <button type="button" className={buttonClasses.primary} onClick={() => setDispatching(trip)}>
                          <Icon name="truck" size={16} />Розпочати переміщення
                        </button>
                      )}
                      <Link href={"/logist/transfer/" + trip.recommendationId} className={buttonClasses.secondary}>
                        {trip.status === "COMPLETED" || trip.status === "CANCELLED" ? "Деталі рейсу" : "Відкрити рейс"}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
        </ResourceGate>
      </Card>

      {dispatching && <DispatchDialog trip={dispatching} onClose={() => setDispatching(null)} onChanged={changed} />}
    </>
  );
}
