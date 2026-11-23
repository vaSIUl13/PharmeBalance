"use client";

import { useState } from "react";
import { loadPharmacies } from "@/lib/admin/api";
import { useResource } from "@/lib/head/use-resource";
import { Badge, buttonClasses, Card, EmptyState, inputClasses, Kpi, Notice, PageHeader, ResourceGate } from "@/components/head/ui";
import { NetworkMap } from "./network-map";
import { PharmacyDialog } from "./pharmacy-dialog";

export function Pharmacies() {
  const pharmacies = useResource(loadPharmacies);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState("");

  const items = pharmacies.data ?? [];
  const text = query.trim().toLowerCase();
  const visible = items.filter(item => !text || (item.name + " " + item.code + " " + item.city + " " + item.address).toLowerCase().includes(text));

  return (
    <>
      <PageHeader title="Аптеки мережі" subtitle="Довідник керованих аптек" actions={
        <button type="button" className={buttonClasses.primary} onClick={() => setAdding(true)}>Додати аптеку</button>
      } />
      {message && <Notice tone="success">{message}</Notice>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Усього аптек" icon="pin" value={pharmacies.data ? items.length : "…"} />
        <Kpi label="Активні" icon="check" tone="success" value={pharmacies.data ? items.filter(item => item.isActive).length : "…"} />
        <Kpi label="Неактивні" icon="alert" tone="warning" value={pharmacies.data ? items.filter(item => !item.isActive).length : "…"} />
      </div>
      <Notice tone="neutral">Аптека стає активною після призначення завідувача в розділі «Користувачі».</Notice>

      {pharmacies.data && (
        <Card title="Карта аптек" note="Аптеки мережі та довідник України з OpenStreetMap">
          <div className="p-4"><NetworkMap pharmacies={items} /></div>
        </Card>
      )}

      <Card>
        <form className="border-b border-[#e2e8e5] p-4" role="search" onSubmit={event => event.preventDefault()}>
          <label htmlFor="pharmacy-query" className="mb-1 block text-xs font-semibold text-[#475569]">Пошук</label>
          <input id="pharmacy-query" type="search" className={inputClasses + " sm:max-w-sm"} placeholder="Назва, код, місто або адреса"
            value={query} onChange={event => setQuery(event.target.value)} />
        </form>
        <ResourceGate resource={pharmacies} errorText="Не вдалося завантажити аптеки.">
          {() => items.length === 0
            ? <EmptyState title="Аптек немає" />
            : visible.length === 0
              ? <EmptyState title="Нічого не знайдено" hint="Змініть пошуковий запит" />
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#e2e8e5] text-left text-xs text-[#64748b]">
                        <th scope="col" className="px-4 py-2 font-medium">Код</th>
                        <th scope="col" className="px-2 py-2 font-medium">Назва</th>
                        <th scope="col" className="px-2 py-2 font-medium">Адреса</th>
                        <th scope="col" className="px-4 py-2 font-medium">Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map(item => (
                        <tr key={item.pharmacyId} className="border-b border-[#e2e8e5] last:border-0">
                          <td className="px-4 py-3 tabular-nums text-[#475569]">{item.code}</td>
                          <td className="px-2 py-3 font-medium">{item.name}</td>
                          <td className="px-2 py-3 text-[#475569]">{item.city}, {item.address}</td>
                          <td className="px-4 py-3"><Badge tone={item.isActive ? "success" : "neutral"}>{item.isActive ? "Активна" : "Неактивна"}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
        </ResourceGate>
      </Card>
      {adding && <PharmacyDialog onClose={() => setAdding(false)} onCreated={name => {
        setAdding(false);
        setQuery("");
        setMessage("Аптеку «" + name + "» додано.");
        pharmacies.reload();
      }} />}
    </>
  );
}
