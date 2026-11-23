"use client";

import Link from "next/link";
import { useState } from "react";
import { loadImports, loadPositions, loadTransfers } from "@/lib/head/api";
import { formatDateTime, formatNumber, importStatuses, toNumber } from "@/lib/head/format";
import type { ForecastItem, TransferDetail } from "@/lib/head/types";
import { useResource } from "@/lib/head/use-resource";
import { useHeadSession } from "./head-session";
import { Icon } from "@/components/ui/icon";
import { ReceiveDialog } from "./receive-dialog";
import { Badge, buttonClasses, Card, EmptyState, Kpi, Notice, PageHeader, ProgressBar, ResourceGate } from "./ui";

const loadLatestImports = () => loadImports();
const stockoutHorizonDays = 14;
const urgentDays = 3;
const nearestLimit = 6;

type Slice = { label: string; value: number; color: string };

function StockDonut({ slices }: { slices: Slice[] }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const arcs = slices.map((slice, index) => ({
    slice,
    length: total > 0 ? (slice.value / total) * circumference : 0,
    start: total > 0 ? (slices.slice(0, index).reduce((sum, previous) => sum + previous.value, 0) / total) * circumference : 0,
  }));
  return (
    <div className="flex flex-wrap items-center justify-center gap-6 p-4">
      <svg role="img" aria-label={"Стан запасів: " + slices.map(slice => slice.label + " " + slice.value).join(", ")}
        width="140" height="140" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="14" />
        {arcs.map(({ slice, length, start }) => (
          <circle key={slice.label} cx="50" cy="50" r={radius} fill="none" stroke={slice.color} strokeWidth="14"
            strokeDasharray={length + " " + (circumference - length)} strokeDashoffset={-start} transform="rotate(-90 50 50)" />
        ))}
        <text x="50" y="49" textAnchor="middle" fontSize="16" fontWeight="600" fill="#0f172a">{total}</text>
        <text x="50" y="61" textAnchor="middle" fontSize="7" fill="#64748b">позицій</text>
      </svg>
      <ul className="space-y-2 text-sm">
        {slices.map(slice => (
          <li key={slice.label} className="flex items-center gap-2">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: slice.color }} />
            <span className="text-[#475569]">{slice.label}</span>
            <b className="tabular-nums">{slice.value}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function daysLabel(days: number | null): string {
  if (days === null) return "—";
  return days < 1 ? "<1 дн." : days + " дн.";
}

function nearestToStockout(items: ForecastItem[]): ForecastItem[] {
  return items
    .filter(item => item.risk?.positionType === "SHORTAGE")
    .sort((a, b) => (a.risk?.daysToStockout ?? Infinity) - (b.risk?.daysToStockout ?? Infinity))
    .slice(0, nearestLimit);
}

export function HeadDashboard() {
  const { pharmacy } = useHeadSession();
  const positions = useResource(loadPositions);
  const transfers = useResource(loadTransfers);
  const imports = useResource(loadLatestImports);
  const [receiving, setReceiving] = useState<TransferDetail | null>(null);
  const [message, setMessage] = useState("");

  const items = positions.data?.items ?? [];
  const shortages = items.filter(item => item.risk?.positionType === "SHORTAGE");
  const highRisk = shortages.filter(item => item.risk?.riskLevel === "HIGH");
  const surpluses = items.filter(item => item.risk?.positionType === "SURPLUS");
  const incoming = (transfers.data ?? []).filter(transfer => transfer.status === "IN_PROGRESS");
  const lastImport = imports.data?.items[0];

  function changed(result: string) {
    setReceiving(null);
    setMessage(result);
    transfers.reload();
    positions.reload();
  }

  return (
    <>
      <PageHeader title="Дашборд аптеки" subtitle={pharmacy?.name} actions={
        <>
          <Link href="/head/import" className={buttonClasses.secondary}><Icon name="upload" size={14} />Імпорт даних</Link>
          <Link href="/head/moves" className={buttonClasses.primary}><Icon name="truck" size={14} />Вхідні ({incoming.length})</Link>
        </>
      } />
      {message && <Notice tone="success">{message}</Notice>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Позиції з високим ризиком" icon="alert" tone="danger" value={positions.data ? highRisk.length : "…"}
          note={positions.data ? "з " + items.length + " позицій" : undefined} />
        <Kpi label="Очікують підтвердження отримання" icon="truck" tone="warning" value={transfers.data ? incoming.length : "…"}
          note="Статус «У виконанні»" />
        <Kpi label="Позицій у надлишку" icon="box" tone="info" value={positions.data ? surpluses.length : "…"} />
        <Kpi label="Останній імпорт" icon="clock" tone={lastImport?.status === "REJECTED" ? "danger" : "success"}
          value={<span className="text-lg">{lastImport ? formatDateTime(lastImport.uploadedAt) : "—"}</span>}
          note={lastImport ? importStatuses[lastImport.status].label + " · " + formatNumber(lastImport.recordsTotal) + " рядків" : "Імпортів ще не було"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card title="Швидка дія: підтвердити отримання" note="Вхідні посилки в дорозі">
          <ResourceGate resource={transfers} errorText="Не вдалося завантажити вхідні переміщення.">
            {() => incoming.length === 0
              ? <EmptyState title="Немає посилок у дорозі" hint="Нові вхідні перерозподіли з’являться тут" />
              : (
                <ul className="divide-y divide-[#e2e8e5]">
                  {incoming.map(transfer => (
                    <li key={transfer.recommendationId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{transfer.donorStock.drug.name}</p>
                        <p className="text-sm text-[#475569]">
                          Від {transfer.donorStock.pharmacy.name} · <span className="tabular-nums">{transfer.quantity} {transfer.donorStock.drug.unit}</span>
                          {transfer.distanceKm !== null && <> · <span className="tabular-nums">{formatNumber(toNumber(transfer.distanceKm), 1)} км</span></>}
                        </p>
                      </div>
                      <button type="button" className={buttonClasses.primary} onClick={() => setReceiving(transfer)}>
                        <Icon name="check" size={16} />Підтвердити отримання
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </ResourceGate>
        </Card>

        <Card title="Стан запасів аптеки">
          <ResourceGate resource={positions} errorText="Не вдалося завантажити залишки.">
            {() => items.length === 0
              ? <EmptyState title="Немає розрахованих позицій" hint="Прогноз ще не сформовано для вашої аптеки" />
              : <StockDonut slices={[
                { label: "Дефіцит", value: shortages.length, color: "#b91c1c" },
                { label: "Норма", value: items.length - shortages.length - surpluses.length, color: "#0f766e" },
                { label: "Надлишок", value: surpluses.length, color: "#1d4ed8" },
              ]} />}
          </ResourceGate>
        </Card>
      </div>

      <Card title="Найближчі до вичерпання" note="Днів до вичерпання за прогнозом"
        action={<Link href="/head/stock" className="text-sm text-[#0f766e] underline">Усі позиції</Link>}>
        <ResourceGate resource={positions} errorText="Не вдалося завантажити прогноз.">
          {() => {
            const nearest = nearestToStockout(items);
            if (nearest.length === 0) return <EmptyState title="Дефіциту не прогнозується" />;
            return (
              <ul className="space-y-3 p-4">
                {nearest.map(item => {
                  const days = item.risk?.daysToStockout ?? null;
                  const urgent = days !== null && days < urgentDays;
                  return (
                    <li key={item.forecastId} className="grid grid-cols-[1fr_96px_56px] items-center gap-3 sm:grid-cols-[1fr_180px_64px]">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{item.stock.drug.name}</p>
                        <p className="text-xs tabular-nums text-[#64748b]">{formatNumber(item.quantity)} / MSL {formatNumber(item.msl)}</p>
                      </div>
                      <ProgressBar value={days === null ? 0 : (days / stockoutHorizonDays) * 100} tone={urgent ? "danger" : "warning"} />
                      <b className={"text-right text-sm tabular-nums " + (urgent ? "text-[#b91c1c]" : "")}>{daysLabel(days)}</b>
                    </li>
                  );
                })}
              </ul>
            );
          }}
        </ResourceGate>
      </Card>

      <Card title="Історія імпортів" action={<Link href="/head/import" className="text-sm text-[#0f766e] underline">Усі імпорти</Link>}>
        <ResourceGate resource={imports} errorText="Не вдалося завантажити історію імпортів.">
          {page => page.items.length === 0
            ? <EmptyState title="Імпортів ще не було" hint="Завантажте залишки або продажі у розділі «Імпорт даних»" />
            : (
              <ul className="divide-y divide-[#e2e8e5]">
                {page.items.slice(0, 3).map(batch => (
                  <li key={batch.importId} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                    <span className="min-w-0 flex-1 truncate font-medium">{batch.fileName}</span>
                    <span className="tabular-nums text-[#64748b]">{formatDateTime(batch.uploadedAt)}</span>
                    <Badge tone={importStatuses[batch.status].tone}>{importStatuses[batch.status].label}</Badge>
                  </li>
                ))}
              </ul>
            )}
        </ResourceGate>
      </Card>

      {receiving && <ReceiveDialog transfer={receiving} onClose={() => setReceiving(null)} onChanged={changed} />}
    </>
  );
}
