"use client";

import { useState } from "react";
import { loadDrugs } from "@/lib/admin/api";
import type { Drug } from "@/lib/admin/types";
import { useResource } from "@/lib/head/use-resource";
import { Badge, buttonClasses, Card, EmptyState, inputClasses, Notice, PageHeader, ResourceGate } from "@/components/head/ui";
import { DrugDialog } from "./drug-dialog";

type Listing = { query: string; items: Drug[]; next: number | null };

function loadFirstPage() {
  return loadDrugs();
}

export function Drugs() {
  const first = useResource(loadFirstPage);
  const [text, setText] = useState("");
  const [listing, setListing] = useState<Listing | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<Drug | "new" | null>(null);
  const [message, setMessage] = useState("");

  const query = listing?.query ?? "";
  const items = listing ? listing.items : first.data?.items ?? [];
  const next = listing ? listing.next : first.data?.next ?? null;

  async function run(nextQuery: string, after: number | undefined, previous: Drug[]) {
    setBusy(true);
    setFailed(false);
    try {
      const page = await loadDrugs(nextQuery, after);
      setListing({ query: nextQuery, items: [...previous, ...page.items], next: page.next });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Довідник препаратів" subtitle="Препарати мережі й реєстраційні дані ДРЛЗ" actions={
        <button type="button" className={buttonClasses.primary} disabled={busy} onClick={() => setEditing("new")}>
          Додати локальний препарат
        </button>
      } />
      {message && <Notice tone="success">{message}</Notice>}
      {failed && <Notice tone="danger">Не вдалося завантажити препарати. Спробуйте ще раз.</Notice>}
      <Card>
        <form className="flex flex-wrap items-end gap-2 border-b border-[#e2e8e5] p-4" role="search"
          onSubmit={event => { event.preventDefault(); void run(text.trim(), undefined, []); }}>
          <div className="min-w-0 flex-1 sm:max-w-sm">
            <label htmlFor="drug-query" className="mb-1 block text-xs font-semibold text-[#475569]">Пошук</label>
            <input id="drug-query" type="search" maxLength={100} className={inputClasses} placeholder="Назва, SKU або міжнародна назва"
              value={text} onChange={event => setText(event.target.value)} />
          </div>
          <button type="submit" className={buttonClasses.primary} disabled={busy}>Знайти</button>
        </form>
        <ResourceGate resource={first} errorText="Не вдалося завантажити препарати.">
          {() => items.length === 0
            ? <EmptyState title={query ? "Нічого не знайдено" : "Препаратів немає"} hint={query ? "Змініть пошуковий запит" : undefined} />
            : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="border-b border-[#e2e8e5] text-left text-xs text-[#64748b]">
                        <th scope="col" className="px-4 py-2 font-medium">SKU</th>
                        <th scope="col" className="px-2 py-2 font-medium">Назва</th>
                        <th scope="col" className="px-2 py-2 font-medium">Форма й дозування</th>
                        <th scope="col" className="px-2 py-2 font-medium">МНН / АТХ</th>
                        <th scope="col" className="px-4 py-2 font-medium">Статус</th>
                        <th scope="col" className="px-4 py-2 font-medium">Дії</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(drug => (
                        <tr key={drug.drugId} className="border-b border-[#e2e8e5] last:border-0">
                          <td className="px-4 py-3 tabular-nums text-[#475569]">{drug.sku}</td>
                          <td className="px-2 py-3 font-medium">{drug.name}</td>
                          <td className="px-2 py-3 text-[#475569]">{[drug.dosageForm, drug.strength, drug.unit].filter(Boolean).join(", ")}</td>
                          <td className="px-2 py-3 text-[#475569]">
                            {drug.registration
                              ? <>{drug.registration.inn ?? "—"}<span className="block text-xs text-[#64748b]">{drug.registration.atcCodes.join(", ") || drug.registration.number}</span></>
                              : "—"}
                          </td>
                          <td className="px-4 py-3"><Badge tone={drug.isActive ? "success" : "neutral"}>{drug.isActive ? "Активний" : "Неактивний"}</Badge></td>
                          <td className="px-4 py-3">
                            <button type="button" className={buttonClasses.secondary} aria-label={`Редагувати назву «${drug.name}»`}
                              disabled={busy} onClick={() => setEditing(drug)}>Редагувати</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {next !== null && (
                  <div className="border-t border-[#e2e8e5] p-4">
                    <button type="button" className={buttonClasses.secondary} disabled={busy}
                      onClick={() => void run(query, next, items)}>
                      {busy ? "Завантаження…" : "Показати ще"}
                    </button>
                  </div>
                )}
              </>
            )}
        </ResourceGate>
      </Card>
      {editing && <DrugDialog drug={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={drug => {
        setEditing(null);
        setText(drug.sku);
        setMessage(`Препарат «${drug.name}» ${editing === "new" ? "додано" : "оновлено"}.`);
        void run(drug.sku, undefined, []);
      }} />}
    </>
  );
}
