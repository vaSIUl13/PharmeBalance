"use client";

import { useCallback } from "react";
import type { TransferDetail } from "@/lib/head/types";
import { useResource } from "@/lib/head/use-resource";
import { loadTransferRoute } from "@/lib/logist/api";
import { formatKm, formatTripDistance } from "@/lib/logist/format";
import { formatDateTime } from "@/lib/head/format";
import { buttonClasses, Card } from "@/components/head/ui";
import { RouteMap } from "./route-map";
import { RouteStops } from "./trip-parts";

export function TripRoute({ trip }: { trip: TransferDetail }) {
  const id = trip.recommendationId;
  const load = useCallback(() => loadTransferRoute(id), [id]);
  const { data, loading, error, reload } = useResource(load);
  const route = data?.status === "ready" ? data : undefined;
  const unavailable = Boolean(error) || data?.status === "unavailable";
  const minutes = route ? Math.round(route.durationSeconds / 60) : null;
  const duration = minutes === null ? "—" : minutes === 0 ? "< 1 хв" : `≈ ${minutes} хв`;

  return (
    <Card title="Маршрут">
      <div className="space-y-4 p-4">
        <RouteStops trip={trip} />
        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-[#f8faf9] p-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-[#64748b]">Відстань</dt>
            <dd className="font-semibold tabular-nums">{route ? formatKm(route.distanceMeters / 1000) + " дорогою" : formatTripDistance(trip)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[#64748b]">Орієнтовний час</dt>
            <dd className="font-semibold tabular-nums">{duration}</dd>
          </div>
          <div>
            <dt className="text-xs text-[#64748b]">Створено</dt>
            <dd className="font-semibold tabular-nums">{formatDateTime(trip.createdAt)}</dd>
          </div>
        </dl>
        {loading
          ? <div role="status" className="grid h-64 place-items-center rounded-lg border border-[#e2e8e5] bg-[#f1f5f3] text-sm text-[#475569] sm:h-80">Прокладаємо маршрут…</div>
          : <RouteMap trip={trip} line={route?.coordinates} />}
        {!loading && (unavailable || data?.status === "no-route") && (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[#475569]">
            <p role="status">{unavailable ? "Дорожній маршрут тимчасово недоступний." : "Автомобільного маршруту між цими точками не знайдено."}</p>
            {unavailable && <button type="button" className={buttonClasses.secondary} onClick={reload}>Повторити</button>}
          </div>
        )}
      </div>
    </Card>
  );
}
