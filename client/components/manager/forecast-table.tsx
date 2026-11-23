"use client";

import { useCallback, useState } from "react";
import { formatNumber, formatProbability, positionStatus, positionStatuses, riskLevels, toNumber } from "@/lib/head/format";
import type { ForecastItem } from "@/lib/head/types";
import { useResource } from "@/lib/head/use-resource";
import { loadForecastPage } from "@/lib/manager/api";
import type { ForecastView } from "@/lib/manager/types";
import { Badge, buttonClasses, EmptyState, Notice, ResourceGate } from "@/components/head/ui";

function PositionBadge({ item }: { item: ForecastItem }) {
  const status = positionStatus(item);
  const tone = status === "shortage" && item.risk ? riskLevels[item.risk.riskLevel].tone : positionStatuses[status].tone;
  return <Badge tone={tone}>{positionStatuses[status].label}</Badge>;
}

function Days({ item }: { item: ForecastItem }) {
  const days = item.risk?.daysToStockout ?? null;
  if (days === null || item.risk?.positionType !== "SHORTAGE") return <span className="text-[#64748b]">—</span>;
  return <span className="tabular-nums">{days < 1 ? "<1" : days} дн.</span>;
}

export function ForecastTable({ view, pharmacyId, names, query, mode, onEdit }: {
  view: ForecastView;
  pharmacyId?: number;
  names: Map<number, string>;
  query: string;
  mode: "forecast" | "thresholds";
  onEdit?: (item: ForecastItem) => void;
}) {
  const load = useCallback(() => loadForecastPage(view, pharmacyId), [view, pharmacyId]);
  const first = useResource(load);
  const [extra, setExtra] = useState<ForecastItem[]>([]);
  const [next, setNext] = useState<number | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [problem, setProblem] = useState("");

  const cursor = next === undefined ? first.data?.next ?? null : next;
  const rows = [...(first.data?.items ?? []), ...extra];
  const text = query.trim().toLowerCase();
  const pharmacy = (item: ForecastItem) => names.get(item.stock.pharmacyId) ?? "Аптека №" + item.stock.pharmacyId;
  const visible = rows.filter(item => !text ||
    (item.stock.drug.name + " " + item.stock.drug.sku + " " + pharmacy(item)).toLowerCase().includes(text));

  async function showMore() {
    if (cursor === null || loadingMore) return;
    setLoadingMore(true);
    setProblem("");
    try {
      const page = await loadForecastPage(view, pharmacyId, cursor);
      setExtra(current => [...current, ...page.items]);
      setNext(page.next);
    } catch {
      setProblem("Не вдалося завантажити наступні позиції.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <ResourceGate resource={first} errorText="Не вдалося завантажити дані прогнозу.">
      {page => page.run === null
        ? <EmptyState title="Прогнозів ще немає" hint="Дані з’являться після імпорту та розрахунку прогнозу" />
        : rows.length === 0
          ? <EmptyState title="Позицій немає" hint="За цими умовами записів не знайдено" />
          : (
            <>
              {problem && <div className="p-4"><Notice tone="danger">{problem}</Notice></div>}
              {visible.length === 0
                ? <EmptyState title="Нічого не знайдено серед завантажених" hint="Змініть пошук або завантажте більше позицій" />
                : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#e2e8e5] text-left text-xs text-[#64748b]">
                          <th scope="col" className="px-4 py-2 font-medium">Аптека</th>
                          <th scope="col" className="px-2 py-2 font-medium">Препарат</th>
                          {mode === "forecast" && <th scope="col" className="px-2 py-2 font-medium">ABC/XYZ</th>}
                          <th scope="col" className="px-2 py-2 text-right font-medium">Залишок</th>
                          {mode === "forecast"
                            ? <th scope="col" className="px-2 py-2 text-right font-medium">MSL / Max</th>
                            : <><th scope="col" className="px-2 py-2 text-right font-medium">MSL</th>
                              <th scope="col" className="px-2 py-2 text-right font-medium">Max</th></>}
                          {mode === "forecast" && <>
                            {view === "surpluses" && <>
                              <th scope="col" className="px-2 py-2 text-right font-medium">Надлишок на дату зрізу</th>
                              <th scope="col" className="px-2 py-2 text-right font-medium">Надлишок через 14 днів</th>
                            </>}
                            <th scope="col" className="px-2 py-2 text-right font-medium">Попит</th>
                            <th scope="col" className="px-2 py-2 text-right font-medium">Ймовірність дефіциту</th>
                            <th scope="col" className="px-2 py-2 font-medium">До вичерпання</th>
                            <th scope="col" className="px-4 py-2 font-medium">Статус</th>
                          </>}
                          {mode === "thresholds" && <th scope="col" className="px-4 py-2"><span className="sr-only">Дії</span></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map(item => (
                          <tr key={item.forecastId} className="border-b border-[#e2e8e5] last:border-0">
                            <td className="px-4 py-3">{pharmacy(item)}</td>
                            <td className="px-2 py-3">
                              <p className="font-medium">{item.stock.drug.name}</p>
                              <p className="text-xs tabular-nums text-[#64748b]">{item.stock.drug.sku}</p>
                            </td>
                            {mode === "forecast" && <td className="px-2 py-3">{item.abcClass && item.xyzClass ? item.abcClass + item.xyzClass : "—"}</td>}
                            <td className="px-2 py-3 text-right font-semibold tabular-nums">{formatNumber(item.quantity)}</td>
                            {mode === "forecast"
                              ? <td className="px-2 py-3 text-right tabular-nums text-[#475569]">{formatNumber(item.msl)} / {formatNumber(item.maxLevel)}</td>
                              : <><td className="px-2 py-3 text-right tabular-nums">{formatNumber(item.msl)}</td>
                                <td className="px-2 py-3 text-right tabular-nums">{formatNumber(item.maxLevel)}</td></>}
                            {mode === "forecast" && <>
                              {view === "surpluses" && <>
                                <td className="px-2 py-3 text-right tabular-nums">{formatNumber(item.currentSurplus)}</td>
                                <td className="px-2 py-3 text-right tabular-nums">{formatNumber(item.projectedSurplus)}</td>
                              </>}
                              <td className="px-2 py-3 text-right tabular-nums">{formatNumber(toNumber(item.predictedDemand))}</td>
                              <td className="px-2 py-3 text-right tabular-nums">{formatProbability(item.shortageProbability)}</td>
                              <td className="px-2 py-3"><Days item={item} /></td>
                              <td className="px-4 py-3"><PositionBadge item={item} /></td>
                            </>}
                            {mode === "thresholds" && (
                              <td className="px-4 py-3 text-right">
                                <button type="button" className={buttonClasses.secondary} onClick={() => onEdit?.(item)}>Змінити</button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              <div className="flex flex-wrap items-center gap-3 border-t border-[#e2e8e5] px-4 py-3 text-xs text-[#64748b]">
                <span>Завантажено {rows.length} позицій{page.run ? " · прогноз станом на " + page.run.asOf.slice(0, 10) : ""}</span>
                {cursor !== null && (
                  <button type="button" className={buttonClasses.secondary} onClick={showMore} disabled={loadingMore}>
                    {loadingMore ? "Завантаження…" : "Показати ще"}
                  </button>
                )}
              </div>
            </>
          )}
    </ResourceGate>
  );
}
