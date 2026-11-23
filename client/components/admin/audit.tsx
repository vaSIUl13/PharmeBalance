"use client";

import { useState } from "react";
import { loadAudit, loadUsers } from "@/lib/admin/api";
import { eventLabels, fullName } from "@/lib/admin/format";
import type { AuditEntry, AuditEventType } from "@/lib/admin/types";
import { formatDateTime } from "@/lib/head/format";
import { useResource } from "@/lib/head/use-resource";
import { Badge, buttonClasses, Card, EmptyState, inputClasses, Notice, PageHeader, ResourceGate } from "@/components/head/ui";

const loadFirstPage = () => loadAudit();

export function Audit() {
  const first = useResource(loadFirstPage);
  const users = useResource(loadUsers);
  const [extra, setExtra] = useState<AuditEntry[]>([]);
  const [next, setNext] = useState<number | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [problem, setProblem] = useState("");
  const [event, setEvent] = useState<"all" | AuditEventType>("all");
  const [query, setQuery] = useState("");

  const people = new Map((users.data ?? []).map(user => [user.userId, fullName(user)] as const));
  const person = (id: number | null) => id === null ? "—" : people.get(id) ?? "Користувач №" + id;
  const cursor = next === undefined ? first.data?.next ?? null : next;
  const rows = [...(first.data?.items ?? []), ...extra];
  const text = query.trim().toLowerCase();
  const visible = rows.filter(row => (event === "all" || row.eventType === event) &&
    (!text || (person(row.userId) + " " + person(row.targetUserId) + " " + (row.details ?? "")).toLowerCase().includes(text)));

  async function showMore() {
    if (cursor === null || loadingMore) return;
    setLoadingMore(true);
    setProblem("");
    try {
      const page = await loadAudit(cursor);
      setExtra(current => [...current, ...page.items]);
      setNext(page.next);
    } catch {
      setProblem("Не вдалося завантажити старіші події.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <PageHeader title="Системний журнал аудиту" subtitle="Події безпеки та адміністрування, від найновіших" />
      {problem && <Notice tone="danger">{problem}</Notice>}

      <Card>
        <form className="grid gap-3 border-b border-[#e2e8e5] p-4 sm:grid-cols-[1fr_260px]" role="search" onSubmit={e => e.preventDefault()}>
          <div>
            <label htmlFor="audit-query" className="mb-1 block text-xs font-semibold text-[#475569]">Пошук серед завантажених</label>
            <input id="audit-query" type="search" className={inputClasses} placeholder="Користувач або опис"
              value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <div>
            <label htmlFor="audit-event" className="mb-1 block text-xs font-semibold text-[#475569]">Тип події</label>
            <select id="audit-event" className={inputClasses} value={event} onChange={e => setEvent(e.target.value as "all" | AuditEventType)}>
              <option value="all">Усі події</option>
              {(Object.keys(eventLabels) as AuditEventType[]).map(code => <option key={code} value={code}>{eventLabels[code].label}</option>)}
            </select>
          </div>
        </form>

        <ResourceGate resource={first} errorText="Не вдалося завантажити журнал аудиту.">
          {() => rows.length === 0
            ? <EmptyState title="Подій ще немає" />
            : visible.length === 0
              ? <EmptyState title="Нічого не знайдено" hint="Змініть фільтри або завантажте старіші події" />
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#e2e8e5] text-left text-xs text-[#64748b]">
                        <th scope="col" className="px-4 py-2 font-medium">Час</th>
                        <th scope="col" className="px-2 py-2 font-medium">Подія</th>
                        <th scope="col" className="px-2 py-2 font-medium">Виконавець</th>
                        <th scope="col" className="px-2 py-2 font-medium">Ціль</th>
                        <th scope="col" className="px-4 py-2 font-medium">Опис</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map(row => {
                        const view = eventLabels[row.eventType];
                        return (
                          <tr key={row.logId} className="border-b border-[#e2e8e5] last:border-0">
                            <td className="whitespace-nowrap px-4 py-3 tabular-nums text-[#475569]">{formatDateTime(row.eventTime)}</td>
                            <td className="px-2 py-3"><Badge tone={view.tone}>{view.label}</Badge></td>
                            <td className="px-2 py-3">{person(row.userId)}</td>
                            <td className="px-2 py-3">{person(row.targetUserId)}</td>
                            <td className="break-words px-4 py-3 text-[#475569]">{row.details ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
        </ResourceGate>
        {cursor !== null && first.data && (
          <div className="border-t border-[#e2e8e5] px-4 py-3">
            <button type="button" className={buttonClasses.secondary} onClick={showMore} disabled={loadingMore}>
              {loadingMore ? "Завантаження…" : "Показати старіші"}
            </button>
          </div>
        )}
      </Card>
    </>
  );
}
