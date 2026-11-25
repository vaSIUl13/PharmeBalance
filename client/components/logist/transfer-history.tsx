"use client";

import { useCallback } from "react";
import { Card, EmptyState, ResourceGate } from "@/components/head/ui";
import { formatDateTime, formatNumber } from "@/lib/head/format";
import { useResource } from "@/lib/head/use-resource";
import { loadTransferHistory } from "@/lib/logist/api";
import { TripStatus } from "./trip-parts";

const actionLabels: Readonly<Partial<Record<string, string>>> = {
  CONFIRM: "Підтверджено рекомендацію",
  REJECT: "Відхилено рекомендацію",
  CANCEL: "Скасовано переміщення",
  DISPATCH: "Відправлено вантаж",
  RECEIVE: "Підтверджено отримання",
  STALE: "Рекомендація втратила актуальність",
};

export function TransferHistory({ id, unit }: { id: number; unit: string }) {
  const load = useCallback(() => loadTransferHistory(id), [id]);
  const history = useResource(load);

  return (
    <Card title="Історія рейсу">
      <ResourceGate resource={history} errorText="Не вдалося завантажити історію рейсу.">
        {actions => actions.length === 0
          ? <EmptyState title="Дій за рейсом ще немає" />
          : (
            <ol className="divide-y divide-[#e2e8e5]">
              {actions.map(({ actionId, actionTime, userId, actionType, quantity, comment }) => (
                <li key={actionId} className="space-y-2 px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="text-sm font-semibold">{actionLabels[actionType.code] ?? actionType.code}</p>
                    <time dateTime={actionTime} className="text-xs tabular-nums text-[#64748b]">{formatDateTime(actionTime)}</time>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <TripStatus status={actionType.fromStatus} />
                    <span aria-hidden="true" className="text-[#64748b]">→</span>
                    <span className="sr-only">змінено на</span>
                    <TripStatus status={actionType.toStatus} />
                  </div>
                  <p className="text-xs text-[#475569]">
                    Користувач №{userId}{quantity !== null && <> · {formatNumber(quantity)} {unit}</>}
                  </p>
                  {comment && <p className="whitespace-pre-wrap break-words text-sm text-[#475569]">{comment}</p>}
                </li>
              ))}
            </ol>
          )}
      </ResourceGate>
    </Card>
  );
}
