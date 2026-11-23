"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ApiError } from "@/lib/auth";
import { formatDateTime, formatDrug } from "@/lib/head/format";
import { useResource } from "@/lib/head/use-resource";
import { distance, formatKm } from "@/lib/logist/format";
import { loadTransfer } from "@/lib/logist/api";
import { Icon } from "@/components/head/icon";
import { buttonClasses, Card, EmptyState, Notice, PageHeader, ResourceGate } from "@/components/head/ui";
import { DispatchDialog } from "./dispatch-dialog";
import { RouteStops, TripStatus } from "./trip-parts";

export function TransferView({ id }: { id: number }) {
  const load = useCallback(() => loadTransfer(id), [id]);
  const trip = useResource(load);
  const [dispatching, setDispatching] = useState(false);
  const [message, setMessage] = useState("");

  function changed(result: string) {
    setDispatching(false);
    setMessage(result);
    trip.reload();
  }

  const missing = trip.error instanceof ApiError && trip.error.status === 404;

  return (
    <>
      <Link href="/logist/queue" className={buttonClasses.secondary + " w-fit"}>← До черги</Link>
      {message && <Notice tone="success">{message}</Notice>}
      {missing
        ? <Card><EmptyState title="Рейс не знайдено" hint="Він недоступний для вашого облікового запису" /></Card>
        : (
          <ResourceGate resource={trip} errorText="Не вдалося завантажити рейс.">
            {data => {
              const drug = data.donorStock.drug;
              return (
                <>
                  <PageHeader title={"Рейс №" + data.recommendationId + " · " + drug.name}
                    subtitle={data.donorStock.pharmacy.name + " → " + data.recipientStock.pharmacy.name}
                    actions={<TripStatus status={data.status} />} />
                  <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                    <Card title="Маршрут">
                      <div className="space-y-4 p-4">
                        <RouteStops trip={data} />
                        <dl className="grid grid-cols-2 gap-3 text-sm">
                          <div><dt className="text-xs text-[#64748b]">Відстань</dt><dd className="font-semibold tabular-nums">{formatKm(distance(data))}</dd></div>
                          <div><dt className="text-xs text-[#64748b]">Створено</dt><dd className="font-semibold tabular-nums">{formatDateTime(data.createdAt)}</dd></div>
                        </dl>
                      </div>
                    </Card>
                    <div className="space-y-4">
                      <Card title="Специфікація вантажу">
                        <dl className="space-y-2 p-4 text-sm">
                          <div className="flex justify-between gap-3"><dt className="text-[#64748b]">Назва ЛЗ</dt><dd className="text-right font-medium">{drug.name}</dd></div>
                          <div className="flex justify-between gap-3"><dt className="text-[#64748b]">SKU</dt><dd className="font-medium tabular-nums">{drug.sku}</dd></div>
                          <div className="flex justify-between gap-3"><dt className="text-[#64748b]">Форма / дозування</dt><dd className="text-right font-medium">{formatDrug(drug)}</dd></div>
                          <div className="flex justify-between gap-3"><dt className="text-[#64748b]">Кількість</dt><dd className="text-lg font-semibold tabular-nums">{data.quantity} {drug.unit}</dd></div>
                          <div className="flex justify-between gap-3"><dt className="text-[#64748b]">Пріоритет</dt><dd className="font-medium tabular-nums">{data.priority}</dd></div>
                        </dl>
                      </Card>
                      {data.status === "CONFIRMED" && (
                        <button type="button" className={buttonClasses.primary + " w-full"} onClick={() => setDispatching(true)}>
                          <Icon name="truck" size={16} />Розпочати переміщення
                        </button>
                      )}
                      {data.status === "IN_PROGRESS" && (
                        <Notice tone="warning">Очікує підтвердження отримання завідувачем аптеки-реципієнта ({data.recipientStock.pharmacy.name}).</Notice>
                      )}
                      {data.status === "COMPLETED" && <Notice tone="success">Рейс завершено: отримання підтверджено завідувачем.</Notice>}
                      {data.status === "CANCELLED" && <Notice tone="neutral">Рейс скасовано, резерв знято.</Notice>}
                    </div>
                  </div>
                  {dispatching && <DispatchDialog trip={data} onClose={() => setDispatching(false)} onChanged={changed} />}
                </>
              );
            }}
          </ResourceGate>
        )}
    </>
  );
}
