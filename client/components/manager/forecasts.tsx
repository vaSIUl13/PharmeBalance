"use client";

import { useState } from "react";
import { loadPharmacies } from "@/lib/manager/api";
import type { ForecastView } from "@/lib/manager/types";
import { useResource } from "@/lib/head/use-resource";
import { Card, inputClasses, PageHeader } from "@/components/head/ui";
import { ForecastTable } from "./forecast-table";

const views: { value: ForecastView; label: string }[] = [
  { value: "risks", label: "Ризики дефіциту" },
  { value: "surpluses", label: "Надлишки" },
  { value: "forecasts", label: "Усі позиції" },
];

export function Forecasts() {
  const pharmacies = useResource(loadPharmacies);
  const [view, setView] = useState<ForecastView>("risks");
  const [pharmacy, setPharmacy] = useState("all");
  const [query, setQuery] = useState("");

  const names = new Map((pharmacies.data ?? []).map(item => [item.pharmacyId, item.name] as const));
  const pharmacyId = pharmacy === "all" ? undefined : Number(pharmacy);

  return (
    <>
      <PageHeader title="Прогнози та ризики" subtitle="Останній розрахунок по всій мережі" />
      <Card>
        <form className="grid gap-3 border-b border-[#e2e8e5] p-4 sm:grid-cols-[200px_1fr_1fr]" role="search" onSubmit={event => event.preventDefault()}>
          <div>
            <label htmlFor="forecast-view" className="mb-1 block text-xs font-semibold text-[#475569]">Показати</label>
            <select id="forecast-view" className={inputClasses} value={view} onChange={event => setView(event.target.value as ForecastView)}>
              {views.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="forecast-pharmacy" className="mb-1 block text-xs font-semibold text-[#475569]">Аптека</label>
            <select id="forecast-pharmacy" className={inputClasses} value={pharmacy} onChange={event => setPharmacy(event.target.value)}>
              <option value="all">Уся мережа</option>
              {(pharmacies.data ?? []).map(item => <option key={item.pharmacyId} value={item.pharmacyId}>{item.name} · {item.city}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="forecast-query" className="mb-1 block text-xs font-semibold text-[#475569]">Пошук серед завантажених</label>
            <input id="forecast-query" type="search" className={inputClasses} placeholder="SKU, препарат або аптека" value={query}
              onChange={event => setQuery(event.target.value)} />
          </div>
        </form>
        <ForecastTable key={view + ":" + pharmacy} view={view} pharmacyId={pharmacyId} names={names} query={query} mode="forecast" />
      </Card>
    </>
  );
}
