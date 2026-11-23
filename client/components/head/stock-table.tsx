"use client";

import { useState } from "react";
import { loadPositions } from "@/lib/head/api";
import {
  formatDateTime, formatNumber, formatProbability, positionStatuses, riskLevels, toNumber,
  type PositionStatus,
} from "@/lib/head/format";
import type { CurrentPosition } from "@/lib/head/types";
import { useResource } from "@/lib/head/use-resource";
import { Icon } from "@/components/ui/icon";
import { useHeadSession } from "./head-session";
import { PositionDialog } from "./position-dialog";
import { Badge, Card, EmptyState, inputClasses, Kpi, Notice, PageHeader, ResourceGate } from "./ui";

const classes = ["AX", "AY", "AZ", "BX", "BY", "BZ", "CX", "CY", "CZ"];

type Filters = { query: string; status: "all" | PositionStatus; classes: string };

function itemClass(item: CurrentPosition): string {
  return item.abcClass && item.xyzClass ? item.abcClass + item.xyzClass : "";
}

function byUrgency(a: CurrentPosition, b: CurrentPosition): number {
  const days = (a.risk?.daysToStockout ?? Infinity) - (b.risk?.daysToStockout ?? Infinity);
  return Number.isNaN(days) || days === 0 ? a.stock.drug.name.localeCompare(b.stock.drug.name, "uk") : days;
}

function positionStatus(item: CurrentPosition): PositionStatus {
  if (item.quantity < item.msl) return "shortage";
  if (item.quantity > item.maxLevel) return "surplus";
  return "normal";
}

function matches(item: CurrentPosition, filters: Filters): boolean {
  const query = filters.query.trim().toLowerCase();
  return (filters.status === "all" || positionStatus(item) === filters.status) &&
    (filters.classes === "all" || itemClass(item) === filters.classes) &&
    (!query || (item.stock.drug.name + " " + item.stock.drug.sku).toLowerCase().includes(query));
}

function StatusBadge({ item }: { item: CurrentPosition }) {
  const status = positionStatuses[positionStatus(item)];
  return <Badge tone={status.tone}>{status.label}</Badge>;
}

function DaysCell({ item }: { item: CurrentPosition }) {
  const days = item.risk?.daysToStockout ?? null;
  if (days === null || item.risk?.positionType !== "SHORTAGE") return <span className="text-[#64748b]">—</span>;
  const level = item.risk.riskLevel;
  return <Badge tone={riskLevels[level].tone}>{days < 1 ? "<1" : days} дн.</Badge>;
}

export function StockTable() {
  const { pharmacy } = useHeadSession();
  const positions = useResource(loadPositions);
  const [filters, setFilters] = useState<Filters>({ query: "", status: "all", classes: "all" });
  const [selected, setSelected] = useState<CurrentPosition | null>(null);

  const items = positions.data?.items ?? [];
  const count = (status: PositionStatus) => items.filter(item => positionStatus(item) === status).length;
  const visible = items.filter(item => matches(item, filters)).sort(byUrgency);

  return (
    <>
      <PageHeader title="Залишки та ризики" subtitle={pharmacy ? pharmacy.name + " · лише ваша аптека" : undefined} />
      {positions.data?.asOf && (
        <p className="text-xs text-[#64748b]">Прогноз станом на {formatDateTime(positions.data.asOf).split(",")[0]}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Позицій" icon="box" value={positions.data ? items.length : "…"} />
        <Kpi label="Дефіцит" icon="alert" tone="danger" value={positions.data ? count("shortage") : "…"} />
        <Kpi label="Норма" icon="check" tone="success" value={positions.data ? count("normal") : "…"} />
        <Kpi label="Надлишок" icon="box" tone="info" value={positions.data ? count("surplus") : "…"} />
      </div>

      <Notice tone="neutral">Пороги MSL / Max доступні лише для перегляду. Змінювати їх може товарний менеджер або адміністратор.</Notice>

      <Card>
        <form className="grid gap-3 border-b border-[#e2e8e5] p-4 sm:grid-cols-[1fr_180px_160px]" role="search" onSubmit={event => event.preventDefault()}>
          <div>
            <label htmlFor="stock-query" className="mb-1 block text-xs font-semibold text-[#475569]">Пошук</label>
            <input id="stock-query" type="search" className={inputClasses} placeholder="SKU або назва" value={filters.query}
              onChange={event => setFilters({ ...filters, query: event.target.value })} />
          </div>
          <div>
            <label htmlFor="stock-status" className="mb-1 block text-xs font-semibold text-[#475569]">Статус ризику</label>
            <select id="stock-status" className={inputClasses} value={filters.status}
              onChange={event => setFilters({ ...filters, status: event.target.value as Filters["status"] })}>
              <option value="all">Усі</option>
              <option value="shortage">Дефіцит</option>
              <option value="normal">Норма</option>
              <option value="surplus">Надлишок</option>
            </select>
          </div>
          <div>
            <label htmlFor="stock-class" className="mb-1 block text-xs font-semibold text-[#475569]">Клас ABC/XYZ</label>
            <select id="stock-class" className={inputClasses} value={filters.classes}
              onChange={event => setFilters({ ...filters, classes: event.target.value })}>
              <option value="all">Усі</option>
              {classes.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>
        </form>

        <ResourceGate resource={positions} errorText="Не вдалося завантажити залишки та ризики.">
          {() => items.length === 0
            ? <EmptyState title="Немає позицій на складі" hint="Залишки з’являться після додавання позицій або імпорту даних" />
            : visible.length === 0
              ? <EmptyState title="Нічого не знайдено" hint="Змініть пошуковий запит або фільтри" />
              : (
                <>
                  <table className="hidden w-full text-sm md:table">
                    <thead>
                      <tr className="border-b border-[#e2e8e5] text-left text-xs text-[#64748b]">
                        <th scope="col" className="px-4 py-2 font-medium">SKU</th>
                        <th scope="col" className="px-2 py-2 font-medium">Назва ЛЗ</th>
                        <th scope="col" className="px-2 py-2 font-medium">ABC/XYZ</th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">Залишок</th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">MSL / Max</th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">Попит, 14 дн.</th>
                        <th scope="col" className="px-2 py-2 text-right font-medium">Ймовірність дефіциту</th>
                        <th scope="col" className="px-2 py-2 font-medium">До вичерпання</th>
                        <th scope="col" className="px-2 py-2 font-medium">Статус</th>
                        <th scope="col" className="px-4 py-2 text-right font-medium"><span className="sr-only">Динаміка</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map(item => (
                        <tr key={item.stockId} className="border-b border-[#e2e8e5] last:border-0">
                          <td className="px-4 py-3 tabular-nums text-[#475569]">{item.stock.drug.sku}</td>
                          <td className="px-2 py-3 font-medium">{item.stock.drug.name}</td>
                          <td className="px-2 py-3">{itemClass(item) || "—"}</td>
                          <td className={"px-2 py-3 text-right font-semibold tabular-nums " +
                            ((item.quantity ?? 0) < (item.msl ?? 0) ? "text-[#b91c1c]" : "")}>{formatNumber(item.quantity)}</td>
                          <td className="px-2 py-3 text-right tabular-nums text-[#475569]">{formatNumber(item.msl)} / {formatNumber(item.maxLevel)}</td>
                          <td className="px-2 py-3 text-right tabular-nums">{formatNumber(toNumber(item.predictedDemand))}</td>
                          <td className="px-2 py-3 text-right tabular-nums">{formatProbability(item.shortageProbability)}</td>
                          <td className="px-2 py-3"><DaysCell item={item} /></td>
                          <td className="px-2 py-3"><StatusBadge item={item} /></td>
                          <td className="px-4 py-3 text-right">
                            <button type="button" aria-label={"Динаміка: " + item.stock.drug.name} onClick={() => setSelected(item)}
                              className="grid size-8 place-items-center rounded-md border border-[#e2e8e5] text-[#0f766e] hover:bg-[#f8faf9]"><Icon name="chart" size={14} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <ul className="divide-y divide-[#e2e8e5] md:hidden">
                    {visible.map(item => (
                      <li key={item.stockId} className="space-y-2 px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium">{item.stock.drug.name}</p>
                            <p className="text-xs tabular-nums text-[#64748b]">{item.stock.drug.sku} · {itemClass(item) || "—"}</p>
                          </div>
                          <StatusBadge item={item} />
                        </div>
                        <dl className="grid grid-cols-3 gap-2 text-xs">
                          <div><dt className="text-[#64748b]">Залишок</dt><dd className="font-semibold tabular-nums">{formatNumber(item.quantity)}</dd></div>
                          <div><dt className="text-[#64748b]">MSL / Max</dt><dd className="tabular-nums">{formatNumber(item.msl)} / {formatNumber(item.maxLevel)}</dd></div>
                          <div><dt className="text-[#64748b]">До вичерпання</dt><dd><DaysCell item={item} /></dd></div>
                        </dl>
                        <button type="button" onClick={() => setSelected(item)}
                          className="inline-flex min-h-9 items-center gap-2 text-sm text-[#0f766e] underline"><Icon name="chart" size={14} />Динаміка продажів</button>
                      </li>
                    ))}
                  </ul>
                  <p className="border-t border-[#e2e8e5] px-4 py-3 text-xs text-[#64748b]">{visible.length} із {items.length} позицій</p>
                </>
              )}
        </ResourceGate>
      </Card>
      {selected && <PositionDialog item={selected} status={positionStatus(selected)} onClose={() => setSelected(null)} />}
    </>
  );
}
