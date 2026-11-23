"use client";

import { useState } from "react";
import { loadPharmacies } from "@/lib/manager/api";
import type { ForecastItem } from "@/lib/head/types";
import { useResource } from "@/lib/head/use-resource";
import { Card, inputClasses, Notice, PageHeader } from "@/components/head/ui";
import { ForecastTable } from "./forecast-table";
import { ThresholdDialog } from "./threshold-dialog";

export function Thresholds() {
  const pharmacies = useResource(loadPharmacies);
  const [pharmacy, setPharmacy] = useState("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ForecastItem | null>(null);
  const [message, setMessage] = useState("");
  const [version, setVersion] = useState(0);

  const names = new Map((pharmacies.data ?? []).map(item => [item.pharmacyId, item.name] as const));
  const pharmacyId = pharmacy === "all" ? undefined : Number(pharmacy);

  function done(result: string) {
    setEditing(null);
    setMessage(result);
    setVersion(current => current + 1);
  }

  return (
    <>
      <PageHeader title="Пороги MSL / Max" subtitle="Мінімальний і максимальний запас по позиціях мережі" />
      {message && <Notice tone="success">{message}</Notice>}
      <Notice tone="neutral">Позиції беруться з останнього розрахунку прогнозу. Кожна зміна порогів записується в журнал аудиту.</Notice>
      <Card>
        <form className="grid gap-3 border-b border-[#e2e8e5] p-4 sm:grid-cols-2" role="search" onSubmit={event => event.preventDefault()}>
          <div>
            <label htmlFor="threshold-pharmacy" className="mb-1 block text-xs font-semibold text-[#475569]">Аптека</label>
            <select id="threshold-pharmacy" className={inputClasses} value={pharmacy} onChange={event => setPharmacy(event.target.value)}>
              <option value="all">Уся мережа</option>
              {(pharmacies.data ?? []).map(item => <option key={item.pharmacyId} value={item.pharmacyId}>{item.name} · {item.city}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="threshold-query" className="mb-1 block text-xs font-semibold text-[#475569]">Пошук серед завантажених</label>
            <input id="threshold-query" type="search" className={inputClasses} placeholder="SKU, препарат або аптека" value={query}
              onChange={event => setQuery(event.target.value)} />
          </div>
        </form>
        <ForecastTable key={pharmacy + ":" + version} view="forecasts" pharmacyId={pharmacyId} names={names} query={query}
          mode="thresholds" onEdit={setEditing} />
      </Card>
      {editing && (
        <ThresholdDialog item={editing} pharmacy={names.get(editing.stock.pharmacyId) ?? "Аптека №" + editing.stock.pharmacyId}
          onClose={() => setEditing(null)} onDone={done} />
      )}
    </>
  );
}
