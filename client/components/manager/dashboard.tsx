"use client";

import Link from "next/link";
import { loadTransfers } from "@/lib/head/api";
import { formatNumber, formatProbability, riskLevels } from "@/lib/head/format";
import { useResource } from "@/lib/head/use-resource";
import { loadForecastPage, loadPharmacies, loadSummary } from "@/lib/manager/api";
import { isoDay } from "@/lib/manager/format";
import { Icon } from "@/components/head/icon";
import { Badge, buttonClasses, Card, EmptyState, Kpi, PageHeader, ResourceGate } from "@/components/head/ui";

const loadMonthSummary = () => loadSummary(isoDay(-30), isoDay());
const loadTopRisks = () => loadForecastPage("risks");

export function ManagerDashboard() {
  const summary = useResource(loadMonthSummary);
  const risks = useResource(loadTopRisks);
  const trips = useResource(loadTransfers);
  const pharmacies = useResource(loadPharmacies);

  const names = new Map((pharmacies.data ?? []).map(item => [item.pharmacyId, item.name] as const));
  const totals = summary.data?.totals;
  const pending = (trips.data ?? []).filter(trip => trip.status === "CREATED");
  const top = (risks.data?.items ?? []).filter(item => item.risk?.positionType === "SHORTAGE").slice(0, 8);

  return (
    <>
      <PageHeader title="Дашборд мережі" subtitle="Огляд ризиків і перерозподілу за останні 30 днів" actions={
        <Link href="/manager/recommendations" className={buttonClasses.primary}>
          <Icon name="truck" size={14} />Рекомендації{trips.data ? " (" + pending.length + ")" : ""}
        </Link>
      } />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Позиції з ризиком дефіциту" icon="alert" tone="danger" value={totals ? formatNumber(totals.shortageRisks) : "…"} />
        <Kpi label="Позиції з надлишком" icon="box" tone="info" value={totals ? formatNumber(totals.surplusPositions) : "…"} />
        <Kpi label="Очікують рішення" icon="clock" tone="warning" value={trips.data ? pending.length : "…"} />
        <Kpi label="Переміщено одиниць" icon="truck" tone="success" value={totals ? formatNumber(totals.movedUnits) : "…"}
          note={totals ? "виконано рейсів: " + formatNumber(totals.completed) : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Найкритичніші позиції" action={<Link href="/manager/forecasts" className="text-sm text-[#0f766e] underline">Усі ризики</Link>}>
          <ResourceGate resource={risks} errorText="Не вдалося завантажити ризики.">
            {() => top.length === 0
              ? <EmptyState title="Ризиків дефіциту немає" hint="За останнім прогнозом критичних позицій не знайдено" />
              : (
                <ul className="divide-y divide-[#e2e8e5]">
                  {top.map(item => (
                    <li key={item.forecastId} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{item.stock.drug.name}</p>
                        <p className="truncate text-xs text-[#64748b]">{names.get(item.stock.pharmacyId) ?? "Аптека №" + item.stock.pharmacyId}</p>
                      </div>
                      <span className="text-xs tabular-nums text-[#475569]">{formatProbability(item.shortageProbability)}</span>
                      {item.risk && <Badge tone={riskLevels[item.risk.riskLevel].tone}>{riskLevels[item.risk.riskLevel].label}</Badge>}
                    </li>
                  ))}
                </ul>
              )}
          </ResourceGate>
        </Card>

        <Card title="Очікують вашого рішення" action={<Link href="/manager/recommendations" className="text-sm text-[#0f766e] underline">Усі рекомендації</Link>}>
          <ResourceGate resource={trips} errorText="Не вдалося завантажити рекомендації.">
            {() => pending.length === 0
              ? <EmptyState title="Нових рекомендацій немає" hint="Сформуйте їх за останнім прогнозом на сторінці рекомендацій" />
              : (
                <ul className="divide-y divide-[#e2e8e5]">
                  {pending.slice(0, 8).map(trip => (
                    <li key={trip.recommendationId} className="px-4 py-3">
                      <p className="font-medium">{trip.donorStock.drug.name} · <span className="tabular-nums">{trip.quantity} {trip.donorStock.drug.unit}</span></p>
                      <p className="text-xs text-[#64748b]">{trip.donorStock.pharmacy.name} → {trip.recipientStock.pharmacy.name}</p>
                    </li>
                  ))}
                </ul>
              )}
          </ResourceGate>
        </Card>
      </div>
    </>
  );
}
