"use client";

import Link from "next/link";
import { useState } from "react";
import { loadTransfers } from "@/lib/head/api";
import { formatDateTime } from "@/lib/head/format";
import { useResource } from "@/lib/head/use-resource";
import { distance, formatKm } from "@/lib/logist/format";
import { Card, EmptyState, inputClasses, Kpi, PageHeader, ResourceGate } from "@/components/head/ui";
import { TripStatus } from "./trip-parts";

export function Archive() {
  const trips = useResource(loadTransfers);
  const [query, setQuery] = useState("");

  const finished = (trips.data ?? []).filter(trip => trip.status === "COMPLETED" || trip.status === "CANCELLED");
  const completed = finished.filter(trip => trip.status === "COMPLETED");
  const totalKm = completed.reduce((sum, trip) => sum + (distance(trip) ?? 0), 0);
  const text = query.trim().toLowerCase();
  const visible = finished.filter(trip => !text ||
    (trip.recommendationId + " " + trip.donorStock.drug.name + " " + trip.donorStock.drug.sku).toLowerCase().includes(text));

  return (
    <>
      <PageHeader title="Архів перевезень" subtitle="Завершені та скасовані рейси" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Рейсів виконано" icon="check" tone="success" value={trips.data ? completed.length : "…"} />
        <Kpi label="Пройдено" icon="truck" value={trips.data ? formatKm(totalKm) : "…"} note="сума відстаней виконаних рейсів" />
        <Kpi label="Скасовано" icon="x" value={trips.data ? finished.length - completed.length : "…"} />
      </div>

      <Card>
        <form className="border-b border-[#e2e8e5] p-4" role="search" onSubmit={event => event.preventDefault()}>
          <label htmlFor="archive-query" className="mb-1 block text-xs font-semibold text-[#475569]">Пошук за номером або препаратом</label>
          <input id="archive-query" type="search" className={inputClasses + " sm:max-w-sm"} value={query} onChange={event => setQuery(event.target.value)} />
        </form>
        <ResourceGate resource={trips} errorText="Не вдалося завантажити архів.">
          {() => finished.length === 0
            ? <EmptyState title="Архів порожній" hint="Тут з’являться завершені рейси" />
            : visible.length === 0
              ? <EmptyState title="Нічого не знайдено" hint="Змініть пошуковий запит" />
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#e2e8e5] text-left text-xs text-[#64748b]">
                        <th scope="col" className="px-4 py-2 font-medium">№</th>
                        <th scope="col" className="px-2 py-2 font-medium">Препарат</th>
                        <th scope="col" className="px-2 py-2 font-medium">Маршрут</th>
                        <th scope="col" className="px-2 py-2 font-medium">Створено</th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">Км</th>
                        <th scope="col" className="px-2 py-2 font-medium">Статус</th>
                        <th scope="col" className="px-4 py-2"><span className="sr-only">Деталі</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map(trip => (
                        <tr key={trip.recommendationId} className="border-b border-[#e2e8e5] last:border-0">
                          <td className="px-4 py-3 tabular-nums text-[#475569]">{trip.recommendationId}</td>
                          <td className="px-2 py-3"><p className="font-medium">{trip.donorStock.drug.name}</p>
                            <p className="text-xs text-[#64748b]">{trip.quantity} {trip.donorStock.drug.unit}</p></td>
                          <td className="px-2 py-3">{trip.donorStock.pharmacy.name} → {trip.recipientStock.pharmacy.name}</td>
                          <td className="whitespace-nowrap px-2 py-3 tabular-nums text-[#475569]">{formatDateTime(trip.createdAt)}</td>
                          <td className="px-2 py-3 text-right tabular-nums">{formatKm(distance(trip))}</td>
                          <td className="px-2 py-3"><TripStatus status={trip.status} /></td>
                          <td className="px-4 py-3 text-right">
                            <Link className="text-[#0f766e] underline" href={"/logist/transfer/" + trip.recommendationId}>Деталі</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
        </ResourceGate>
      </Card>
    </>
  );
}
