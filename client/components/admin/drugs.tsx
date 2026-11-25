"use client";

import { useCallback, useEffect, useState } from "react";
import { loadDrugs } from "@/lib/admin/api";
import type { Drug } from "@/lib/admin/types";
import { useResource } from "@/lib/head/use-resource";
import { Badge, buttonClasses, Card, EmptyState, inputClasses, Notice, PageHeader, ResourceGate } from "@/components/head/ui";
import { DrugDialog } from "./drug-dialog";

const searchDelayMs = 250;

export function Drugs() {
  const [text, setText] = useState("");
  const [search, setSearch] = useState({ query: "", revision: 0 });
  const [editing, setEditing] = useState<Drug | "new" | null>(null);
  const [message, setMessage] = useState("");

  function applySearch(query: string) {
    setSearch(current => ({ query, revision: current.revision + 1 }));
  }

  const query = text.trim();
  useEffect(() => {
    if (query === search.query) return;
    const timer = window.setTimeout(() => applySearch(query), searchDelayMs);
    return () => window.clearTimeout(timer);
  }, [query, search.query]);

  return (
    <>
      <PageHeader title="Довідник препаратів" subtitle="Препарати мережі й реєстраційні дані ДРЛЗ" actions={
        <button type="button" className={buttonClasses.primary} onClick={() => setEditing("new")}>
          Додати локальний препарат
        </button>
      } />
      {message && <Notice tone="success">{message}</Notice>}
      <Card>
        <form className="flex flex-wrap items-end gap-2 border-b border-[#e2e8e5] p-4" role="search"
          onSubmit={event => { event.preventDefault(); applySearch(query); }}>
          <div className="min-w-0 flex-1 sm:max-w-sm">
            <label htmlFor="drug-query" className="mb-1 block text-xs font-semibold text-[#475569]">Пошук</label>
            <input id="drug-query" type="search" maxLength={100} className={inputClasses} placeholder="Назва, SKU або міжнародна назва"
              value={text} onChange={event => setText(event.target.value)} />
          </div>
          <button type="submit" className={buttonClasses.primary}>Знайти</button>
        </form>
        <DrugResults key={search.revision} query={search.query} onEdit={setEditing} />
      </Card>
      {editing && <DrugDialog drug={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={drug => {
        setEditing(null);
        setText(drug.sku);
        setMessage(`Препарат «${drug.name}» ${editing === "new" ? "додано" : "оновлено"}.`);
        applySearch(drug.sku);
      }} />}
    </>
  );
}

function DrugResults({ query, onEdit }: { query: string; onEdit: (drug: Drug) => void }) {
  const load = useCallback(() => loadDrugs(query), [query]);
  const first = useResource(load);
  const [more, setMore] = useState<{ items: Drug[]; next: number | null }>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const items = [...(first.data?.items ?? []), ...(more?.items ?? [])];
  const next = more ? more.next : first.data?.next ?? null;

  async function showMore(after: number) {
    setBusy(true);
    setFailed(false);
    try {
      const page = await loadDrugs(query, after);
      setMore(current => ({ items: [...(current?.items ?? []), ...page.items], next: page.next }));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {failed && <Notice tone="danger">Не вдалося завантажити наступну сторінку. Спробуйте ще раз.</Notice>}
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
                              disabled={busy} onClick={() => onEdit(drug)}>Редагувати</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {next !== null && (
                  <div className="border-t border-[#e2e8e5] p-4">
                    <button type="button" className={buttonClasses.secondary} disabled={busy}
                      onClick={() => void showMore(next)}>
                      {busy ? "Завантаження…" : "Показати ще"}
                    </button>
                  </div>
                )}
              </>
            )}
        </ResourceGate>
    </>
  );
}
