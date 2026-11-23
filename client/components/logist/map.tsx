"use client";

import { useCallback, useState } from "react";
import { loadTransfers } from "@/lib/head/api";
import { useResource } from "@/lib/head/use-resource";
import { loadTransferRoute } from "@/lib/logist/api";
import { byQueueOrder, distance, formatKm } from "@/lib/logist/format";
import type { TransferDetail } from "@/lib/head/types";
import { Card, EmptyState, Kpi, PageHeader, ResourceGate } from "@/components/head/ui";
import { TripStatus } from "./trip-parts";
import { TripsMap } from "./trips-map";

function Board({ trips }: { trips: TransferDetail[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  return <Panel key={selectedId ?? "none"} trips={trips} selectedId={selectedId} onSelect={setSelectedId} />;
}

function Panel({ trips, selectedId, onSelect }: {
  trips: TransferDetail[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const loadRoute = useCallback(
    () => selectedId === null ? Promise.resolve(null) : loadTransferRoute(selectedId), [selectedId]);
  const route = useResource(loadRoute);
  const line = route.data?.status === "ready" ? route.data.coordinates : undefined;
  const selected = trips.find(trip => trip.recommendationId === selectedId);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card>
        <div className="p-4"><TripsMap trips={trips} selectedId={selectedId} line={line} onSelect={onSelect} /></div>
      </Card>
      <Card title="Рейси на мапі" note="Оберіть рейс, щоб побачити дорожній маршрут">
        <ul className="max-h-[32rem] divide-y divide-[#e2e8e5] overflow-y-auto">
          {trips.map(trip => (
            <li key={trip.recommendationId}>
              <button type="button" aria-pressed={trip.recommendationId === selectedId}
                onClick={() => onSelect(trip.recommendationId === selectedId ? null : trip.recommendationId)}
                className={"block w-full px-4 py-3 text-left text-sm hover:bg-[#f8faf9] " + (trip.recommendationId === selectedId ? "bg-[#ecfdf5]" : "")}>
                <span className="flex items-center justify-between gap-2">
                  <b className="tabular-nums">№{trip.recommendationId}</b><TripStatus status={trip.status} />
                </span>
                <span className="mt-1 block truncate font-medium">{trip.donorStock.drug.name}</span>
                <span className="block truncate text-xs text-[#64748b]">{trip.donorStock.pharmacy.name} → {trip.recipientStock.pharmacy.name}</span>
                <span className="block text-xs tabular-nums text-[#475569]">{formatKm(distance(trip))}</span>
              </button>
            </li>
          ))}
        </ul>
        {selectedId !== null && (
          <p role="status" className="border-t border-[#e2e8e5] px-4 py-3 text-xs text-[#475569]">
            {route.loading ? "Прокладаємо маршрут…"
              : route.data?.status === "ready" && selected
                ? "Дорогою: " + formatKm(route.data.distanceMeters / 1000) + ", ≈ " + Math.max(1, Math.round(route.data.durationSeconds / 60)) + " хв"
                : "Дорожній маршрут недоступний, показано пряму лінію."}
          </p>
        )}
      </Card>
    </div>
  );
}

export function LogistMap() {
  const trips = useResource(loadTransfers);
  const active = (trips.data ?? []).filter(trip => trip.status === "CONFIRMED" || trip.status === "IN_PROGRESS").sort(byQueueOrder);
  const inProgress = active.filter(trip => trip.status === "IN_PROGRESS").length;

  return (
    <>
      <PageHeader title="Карта рейсів" subtitle="Активні перевезення між аптеками з ваших призначень" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Активних рейсів" icon="truck" value={trips.data ? active.length : "…"} />
        <Kpi label="В дорозі" icon="clock" tone="warning" value={trips.data ? inProgress : "…"} />
        <Kpi label="Км у черзі" icon="pin" tone="info" value={trips.data ? formatKm(active.reduce((sum, trip) => sum + (distance(trip) ?? 0), 0)) : "…"} />
      </div>
      <ResourceGate resource={trips} errorText="Не вдалося завантажити рейси.">
        {() => active.length === 0
          ? <Card><EmptyState title="Активних рейсів немає" hint="Підтверджені рекомендації з’являться тут автоматично" /></Card>
          : <Board key={active.map(trip => trip.recommendationId).join(",")} trips={active} />}
      </ResourceGate>
    </>
  );
}
