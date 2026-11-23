"use client";

import { useCallback } from "react";
import { loadDailySales } from "@/lib/head/api";
import { formatNumber, positionStatuses, toNumber, type PositionStatus } from "@/lib/head/format";
import type { CurrentPosition } from "@/lib/head/types";
import { useResource } from "@/lib/head/use-resource";
import { BarChart } from "@/components/manager/charts";
import { Icon } from "@/components/ui/icon";
import { useModalDialog } from "@/components/ui/use-modal-dialog";
import { Badge, EmptyState, ProgressBar, ResourceGate } from "./ui";

const days = 30;

function dayLabel(day: string) {
  return day.slice(8, 10) + "." + day.slice(5, 7);
}

export function PositionDialog({ item, status, onClose }: { item: CurrentPosition; status: PositionStatus; onClose: () => void }) {
  const dialog = useModalDialog(false, onClose);
  const load = useCallback(() => loadDailySales(days, item.stockId), [item.stockId]);
  const sales = useResource(load);
  const demand = toNumber(item.predictedDemand);
  const state = positionStatuses[status];
  const fill = item.maxLevel > 0 ? Math.min(100, (item.quantity / item.maxLevel) * 100) : 0;

  return (
    <dialog {...dialog} aria-labelledby="position-title"
      className="m-auto w-[min(100%-24px,640px)] rounded-xl border border-[#e2e8e5] bg-white p-0 text-[#0f172a] backdrop:bg-[#0f172a]/40">
      <header className="flex items-start gap-3 border-b border-[#e2e8e5] px-5 py-4">
        <div className="min-w-0 flex-1">
          <h2 id="position-title" className="text-lg font-semibold">{item.stock.drug.name}</h2>
          <p className="text-xs tabular-nums text-[#64748b]">{item.stock.drug.sku}</p>
        </div>
        <Badge tone={state.tone}>{state.label}</Badge>
        <button type="button" onClick={onClose} aria-label="Закрити"
          className="grid size-8 place-items-center rounded-md border border-[#e2e8e5]"><Icon name="x" size={14} /></button>
      </header>
      <div className="space-y-4 px-5 py-4">
        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-[#f8faf9] p-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-[#64748b]">Залишок</dt><dd className="text-lg font-semibold tabular-nums">{formatNumber(item.quantity)}</dd></div>
          <div><dt className="text-xs text-[#64748b]">MSL / Max</dt><dd className="font-semibold tabular-nums">{formatNumber(item.msl)} / {formatNumber(item.maxLevel)}</dd></div>
          <div><dt className="text-xs text-[#64748b]">Попит, 14 дн.</dt><dd className="font-semibold tabular-nums">{formatNumber(demand)}</dd></div>
          <div><dt className="text-xs text-[#64748b]">До вичерпання</dt>
            <dd className="font-semibold tabular-nums">{item.risk?.daysToStockout != null ? item.risk.daysToStockout + " дн." : "—"}</dd></div>
        </dl>
        <div>
          <div className="mb-1 flex justify-between text-xs text-[#64748b]"><span>Заповнення до Max</span><span className="tabular-nums">{Math.round(fill)}%</span></div>
          <ProgressBar value={fill} tone={status === "shortage" ? "danger" : status === "surplus" ? "warning" : "success"} />
        </div>
        <div>
          <h3 className="mb-1 text-sm font-semibold">Продажі за {days} днів</h3>
          <ResourceGate resource={sales} errorText="Не вдалося завантажити продажі.">
            {data => data.hasSales
              ? (
                <>
                  <BarChart label={"Продажі " + item.stock.drug.name + " за " + days + " днів"} height={180}
                    labels={data.points.map(point => dayLabel(point.day))}
                    series={{ name: "Продано", color: "#0f766e", values: data.points.map(point => point.quantity) }} />
                  <p className="text-xs text-[#64748b]">
                    Усього: <b className="tabular-nums text-[#0f172a]">{formatNumber(data.points.reduce((sum, point) => sum + point.quantity, 0))}</b>
                    {" · "}останній день даних: {dayLabel(data.to)}
                  </p>
                </>
              )
              : <EmptyState title="Продажів немає" hint="Імпортуйте продажі у розділі «Імпорт даних»" />}
          </ResourceGate>
        </div>
      </div>
    </dialog>
  );
}
