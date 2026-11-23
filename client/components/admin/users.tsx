"use client";

import { useState } from "react";
import { loadPharmacies, loadPrincipal, loadUsers } from "@/lib/admin/api";
import { fullName, roleCodes, roleLabels } from "@/lib/admin/format";
import type { AdminUser, RoleCode } from "@/lib/admin/types";
import { useResource } from "@/lib/head/use-resource";
import { Icon } from "@/components/head/icon";
import { Badge, buttonClasses, Card, EmptyState, inputClasses, Kpi, Notice, PageHeader, ResourceGate } from "@/components/head/ui";
import { AccessDialog, BlockDialog, CreateUserDialog } from "./user-dialogs";

type Dialog = { kind: "create" } | { kind: "access"; user: AdminUser } | { kind: "block"; user: AdminUser };

export function Users() {
  const users = useResource(loadUsers);
  const pharmacies = useResource(loadPharmacies);
  const principal = useResource(loadPrincipal);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<"all" | RoleCode>("all");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [message, setMessage] = useState("");

  const items = users.data ?? [];
  const names = new Map((pharmacies.data ?? []).map(pharmacy => [pharmacy.pharmacyId, pharmacy.name] as const));
  const text = query.trim().toLowerCase();
  const visible = items.filter(user => (role === "all" || user.role.code === role) &&
    (!text || (fullName(user) + " " + user.email + " " + user.login).toLowerCase().includes(text)));
  const selfId = principal.data?.userId;

  function done(result: string) {
    setDialog(null);
    setMessage(result);
    users.reload();
  }

  return (
    <>
      <PageHeader title="Користувачі та ролі" subtitle="Облікові записи, ролі та призначення до аптек" actions={
        <button type="button" className={buttonClasses.primary} onClick={() => setDialog({ kind: "create" })} disabled={!pharmacies.data}>
          <Icon name="users" size={16} />Додати користувача
        </button>
      } />
      {message && <Notice tone="success">{message}</Notice>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Усього акаунтів" icon="users" value={users.data ? items.length : "…"} />
        <Kpi label="Активні" icon="check" tone="success" value={users.data ? items.filter(user => user.isActive).length : "…"} />
        <Kpi label="Заблоковані" icon="x" tone="danger" value={users.data ? items.filter(user => !user.isActive).length : "…"} />
        <Kpi label="Завідувачі та логісти" icon="pin" tone="info"
          value={users.data ? items.filter(user => user.role.code === "head" || user.role.code === "logist").length : "…"} />
      </div>

      <Card>
        <form className="grid gap-3 border-b border-[#e2e8e5] p-4 sm:grid-cols-[1fr_220px]" role="search" onSubmit={event => event.preventDefault()}>
          <div>
            <label htmlFor="users-query" className="mb-1 block text-xs font-semibold text-[#475569]">Пошук</label>
            <input id="users-query" type="search" className={inputClasses} placeholder="Ім’я, email або логін" value={query}
              onChange={event => setQuery(event.target.value)} />
          </div>
          <div>
            <label htmlFor="users-role" className="mb-1 block text-xs font-semibold text-[#475569]">Роль</label>
            <select id="users-role" className={inputClasses} value={role} onChange={event => setRole(event.target.value as "all" | RoleCode)}>
              <option value="all">Усі ролі</option>
              {roleCodes.map(code => <option key={code} value={code}>{roleLabels[code]}</option>)}
            </select>
          </div>
        </form>

        <ResourceGate resource={users} errorText="Не вдалося завантажити користувачів.">
          {() => items.length === 0
            ? <EmptyState title="Користувачів немає" />
            : visible.length === 0
              ? <EmptyState title="Нічого не знайдено" hint="Змініть пошук або фільтр за роллю" />
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#e2e8e5] text-left text-xs text-[#64748b]">
                        <th scope="col" className="px-4 py-2 font-medium">Користувач</th>
                        <th scope="col" className="px-2 py-2 font-medium">Роль</th>
                        <th scope="col" className="px-2 py-2 font-medium">Аптеки</th>
                        <th scope="col" className="px-2 py-2 font-medium">Статус</th>
                        <th scope="col" className="px-4 py-2"><span className="sr-only">Дії</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map(user => (
                        <tr key={user.userId} className="border-b border-[#e2e8e5] last:border-0">
                          <td className="px-4 py-3">
                            <p className="font-medium">{fullName(user)}</p>
                            <p className="break-all text-xs text-[#64748b]">{user.email} · {user.login}</p>
                          </td>
                          <td className="px-2 py-3">{roleLabels[user.role.code]}</td>
                          <td className="px-2 py-3 text-[#475569]">
                            {user.pharmacyIds.length === 0 ? "—" : user.pharmacyIds.map(id => names.get(id) ?? "№" + id).join(", ")}
                          </td>
                          <td className="px-2 py-3">
                            <Badge tone={user.isActive ? "success" : "danger"}>{user.isActive ? "Активний" : "Заблокований"}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            {user.isActive && (
                              <div className="flex flex-wrap justify-end gap-2">
                                <button type="button" className={buttonClasses.secondary} onClick={() => setDialog({ kind: "access", user })}>Доступ</button>
                                {user.userId !== selfId && (
                                  <button type="button" className={buttonClasses.secondary} onClick={() => setDialog({ kind: "block", user })}>Заблокувати</button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
        </ResourceGate>
      </Card>

      {dialog?.kind === "create" && pharmacies.data && (
        <CreateUserDialog pharmacies={pharmacies.data} onClose={() => setDialog(null)} onDone={done} />
      )}
      {dialog?.kind === "access" && (
        <AccessDialog user={dialog.user} self={dialog.user.userId === selfId} pharmacies={pharmacies.data ?? []}
          onClose={() => setDialog(null)} onDone={done} />
      )}
      {dialog?.kind === "block" && <BlockDialog user={dialog.user} onClose={() => setDialog(null)} onDone={done} />}
    </>
  );
}
