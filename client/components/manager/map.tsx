"use client";

import Link from "next/link";
import { loadTransfers } from "@/lib/head/api";
import { transferStatuses } from "@/lib/head/format";
import { useResource } from "@/lib/head/use-resource";
import { loadForecastPage, loadPharmacies } from "@/lib/manager/api";
import { Badge, Card, EmptyState, Kpi, Notice, PageHeader, ResourceGate } from "@/components/head/ui";
import { NetworkMap } from "./network-map";

const loadRisks = () => loadForecastPage("risks");
const loadSurpluses = () => loadForecastPage("surpluses");

export function ManagerMap() {
  const pharmacies = useResource(loadPharmacies);
  const risks = useResource(loadRisks);
  const surpluses = useResource(loadSurpluses);
  const trips = useResource(loadTransfers);

  const active = (trips.data ?? []).filter(trip => ["CREATED", "CONFIRMED", "IN_PROGRESS"].includes(trip.status));
  const ready = pharmacies.data && risks.data && surpluses.data && trips.data;
  const failed = Boolean(risks.error || surpluses.error || trips.error);

  return (
    <>
      <PageHeader title="Мапа мережі" subtitle="Стан аптек за останнім прогнозом і активні переміщення" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Аптек у мережі" icon="pin" value={pharmacies.data ? pharmacies.data.length : "…"} />
        <Kpi label="З ризиком дефіциту" icon="alert" tone="danger"
          value={risks.data ? new Set(risks.data.items.filter(item => item.risk?.positionType === "SHORTAGE").map(item => item.stock.pharmacyId)).size : "…"} />
        <Kpi label="Активні рейси" icon="truck" tone="warning" value={trips.data ? active.length : "…"} />
      </div>
      {(risks.error || surpluses.error || trips.error) && <Notice tone="danger">Не вдалося завантажити частину даних для мапи.</Notice>}
      <Notice tone="neutral">Позначки враховують до 50 найкритичніших позицій за останнім прогнозом, тому для повної картини перегляньте розділ «Прогнози та ризики».</Notice>
      <Card>
        <ResourceGate resource={pharmacies} errorText="Не вдалося завантажити аптеки.">
          {() => ready
            ? <div className="p-4"><NetworkMap pharmacies={pharmacies.data!} risks={risks.data!.items} surpluses={surpluses.data!.items} trips={trips.data!} /></div>
            : failed ? <EmptyState title="Карта недоступна" hint="Оновіть сторінку" /> : <p className="p-6 text-center text-sm text-[#64748b]">Завантаження даних для мапи…</p>}
        </ResourceGate>
      </Card>
      <Card title="Активні переміщення" action={<Link href="/manager/recommendations" className="text-sm text-[#0f766e] underline">Усі рекомендації</Link>}>
        {active.length === 0
          ? <EmptyState title="Активних рейсів немає" />
          : (
            <ul className="divide-y divide-[#e2e8e5]">
              {active.map(trip => (
                <li key={trip.recommendationId} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <b>{trip.donorStock.drug.name}</b> · <span className="tabular-nums">{trip.quantity} {trip.donorStock.drug.unit}</span>
                    <span className="block text-xs text-[#64748b]">{trip.donorStock.pharmacy.name} → {trip.recipientStock.pharmacy.name}</span>
                  </span>
                  <Badge tone={transferStatuses[trip.status].tone}>{transferStatuses[trip.status].label}</Badge>
                </li>
              ))}
            </ul>
          )}
      </Card>
    </>
  );
}
