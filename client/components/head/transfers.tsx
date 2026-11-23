"use client";

import { useState } from "react";
import { loadTransfers } from "@/lib/head/api";
import { formatDateTime, formatDrug, formatNumber, toNumber, transferStatuses } from "@/lib/head/format";
import type { TransferDetail, TransferStatus } from "@/lib/head/types";
import { useResource } from "@/lib/head/use-resource";
import { Icon } from "./icon";
import { useHeadSession } from "./head-session";
import { ReceiveDialog } from "./receive-dialog";
import { Badge, buttonClasses, Card, EmptyState, inputClasses, Notice, PageHeader, ResourceGate } from "./ui";

const listLimit = 100;

function StatusBadge({ status }: { status: TransferStatus }) {
  const view = transferStatuses[status];
  return <Badge tone={view.tone}>{view.label}</Badge>;
}

export function Transfers() {
  const { pharmacy } = useHeadSession();
  const transfers = useResource(loadTransfers);
  const [status, setStatus] = useState<"all" | TransferStatus>("all");
  const [receiving, setReceiving] = useState<TransferDetail | null>(null);
  const [message, setMessage] = useState("");

  const items = transfers.data ?? [];
  const visible = items.filter(item => status === "all" || item.status === status);

  function changed(result: string) {
    setReceiving(null);
    setMessage(result);
    transfers.reload();
  }

  function receiveAction(item: TransferDetail) {
    return item.status === "IN_PROGRESS"
      ? <button type="button" className={buttonClasses.primary} onClick={() => setReceiving(item)}><Icon name="check" size={14} />Підтвердити отримання</button>
      : null;
  }

  return (
    <>
      <PageHeader title="Вхідні переміщення" subtitle={pharmacy ? pharmacy.name : undefined} />
      {message && <Notice tone="success">{message}</Notice>}

      <Card>
        <form className="flex flex-wrap items-end gap-3 border-b border-[#e2e8e5] p-4" onSubmit={event => event.preventDefault()}>
          <div className="w-full sm:w-56">
            <label htmlFor="move-status" className="mb-1 block text-xs font-semibold text-[#475569]">Статус</label>
            <select id="move-status" className={inputClasses} value={status}
              onChange={event => setStatus(event.target.value as "all" | TransferStatus)}>
              <option value="all">Усі</option>
              {(Object.keys(transferStatuses) as TransferStatus[]).map(value => (
                <option key={value} value={value}>{transferStatuses[value].label}</option>
              ))}
            </select>
          </div>
          <p className="pb-2 text-xs text-[#64748b]">Підтвердити отримання можна для переміщень у виконанні. Приймається лише повна відправлена кількість.</p>
        </form>

        <ResourceGate resource={transfers} errorText="Не вдалося завантажити переміщення.">
          {() => items.length === 0
            ? <EmptyState title="Переміщень немає" hint="Тут з’являться рекомендації, пов’язані з вашою аптекою" />
            : visible.length === 0
              ? <EmptyState title="Нічого не знайдено" hint="Змініть фільтр за статусом" />
              : (
                <>
                  <table className="hidden w-full text-sm md:table">
                    <thead>
                      <tr className="border-b border-[#e2e8e5] text-left text-xs text-[#64748b]">
                        <th scope="col" className="px-4 py-2 font-medium">№</th>
                        <th scope="col" className="px-2 py-2 font-medium">Препарат</th>
                        <th scope="col" className="px-2 py-2 font-medium">Донор</th>
                        <th scope="col" className="px-2 py-2 font-medium">Одержувач</th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">Кількість</th>
                        <th scope="col" className="px-2 py-2 font-medium">Створено</th>
                        <th scope="col" className="px-2 py-2 font-medium">Статус</th>
                        <th scope="col" className="px-4 py-2"><span className="sr-only">Дія</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map(item => (
                        <tr key={item.recommendationId} className="border-b border-[#e2e8e5] last:border-0">
                          <td className="px-4 py-3 tabular-nums text-[#475569]">{item.recommendationId}</td>
                          <td className="px-2 py-3">
                            <p className="font-medium">{item.donorStock.drug.name}</p>
                            <p className="text-xs text-[#64748b]">{formatDrug(item.donorStock.drug)}</p>
                          </td>
                          <td className="px-2 py-3">{item.donorStock.pharmacy.name}</td>
                          <td className="px-2 py-3">{item.recipientStock.pharmacy.name}</td>
                          <td className="px-2 py-3 text-right tabular-nums">{formatNumber(toNumber(item.quantity))} {item.donorStock.drug.unit}</td>
                          <td className="px-2 py-3 tabular-nums text-[#475569]">{formatDateTime(item.createdAt)}</td>
                          <td className="px-2 py-3"><StatusBadge status={item.status} /></td>
                          <td className="px-4 py-3 text-right">{receiveAction(item)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <ul className="divide-y divide-[#e2e8e5] md:hidden">
                    {visible.map(item => (
                      <li key={item.recommendationId} className="space-y-2 px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium">{item.donorStock.drug.name}</p>
                            <p className="text-xs text-[#64748b]">№{item.recommendationId} · {formatDateTime(item.createdAt)}</p>
                          </div>
                          <StatusBadge status={item.status} />
                        </div>
                        <p className="text-sm text-[#475569]">
                          {item.donorStock.pharmacy.name} → {item.recipientStock.pharmacy.name}
                        </p>
                        <p className="text-sm font-semibold tabular-nums">{formatNumber(toNumber(item.quantity))} {item.donorStock.drug.unit}</p>
                        {receiveAction(item)}
                      </li>
                    ))}
                  </ul>

                  {items.length >= listLimit && (
                    <p className="border-t border-[#e2e8e5] px-4 py-3 text-xs text-[#64748b]">Показано перші {listLimit} переміщень.</p>
                  )}
                </>
              )}
        </ResourceGate>
      </Card>

      {receiving && <ReceiveDialog transfer={receiving} onClose={() => setReceiving(null)} onChanged={changed} />}
    </>
  );
}
