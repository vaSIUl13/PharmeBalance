"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ApiError } from "@/lib/auth";
import { formatDrug } from "@/lib/head/format";
import { useResource } from "@/lib/head/use-resource";
import { loadTransfer } from "@/lib/logist/api";
import { Icon } from "@/components/ui/icon";
import { buttonClasses, Card, EmptyState, Notice, PageHeader, ResourceGate } from "@/components/head/ui";
import { DispatchDialog } from "./dispatch-dialog";
import { ReceiveDialog } from "@/components/head/receive-dialog";
import { TripStatus } from "./trip-parts";
import { TripRoute } from "./trip-route";

type Viewer = { role: "logist" } | { role: "manager" } | { role: "head"; receiverPharmacy?: number };
const defaultViewer = { role: "logist" } as const;
const backLinks = {
  logist: { href: "/logist/queue", label: "До черги" },
  manager: { href: "/manager/recommendations", label: "До рекомендацій" },
  head: { href: "/head/moves", label: "До переміщень" },
} as const;

export function TransferView({ id, viewer = defaultViewer }: { id: number; viewer?: Viewer }) {
  const load = useCallback(() => loadTransfer(id), [id]);
  const trip = useResource(load);
  const [dispatching, setDispatching] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [message, setMessage] = useState("");

  function changed(result: string) {
    setDispatching(false);
    setReceiving(false);
    setMessage(result);
    trip.reload();
  }

  const missing = trip.error instanceof ApiError && trip.error.status === 404;
  const back = backLinks[viewer.role];

  return (
    <>
      <Link href={back.href} className={buttonClasses.secondary + " w-fit"}><Icon name="arrow_left" size={14} />{back.label}</Link>
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
                    <TripRoute key={data.recommendationId} trip={data} />
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
                      {data.status === "CONFIRMED" && viewer.role === "logist" && (
                        <button type="button" className={buttonClasses.primary + " w-full"} onClick={() => setDispatching(true)}>
                          <Icon name="truck" size={16} />Розпочати переміщення
                        </button>
                      )}
                      {data.status === "IN_PROGRESS" && viewer.role === "head" &&
                        viewer.receiverPharmacy === data.recipientStock.pharmacy.pharmacyId && (
                          <button type="button" className={buttonClasses.primary + " w-full"} onClick={() => setReceiving(true)}>
                            <Icon name="check" size={16} />Підтвердити отримання
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
                  {receiving && <ReceiveDialog transfer={data} onClose={() => setReceiving(false)} onChanged={changed} />}
                </>
              );
            }}
          </ResourceGate>
        )}
    </>
  );
}
