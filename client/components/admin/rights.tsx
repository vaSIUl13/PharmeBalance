"use client";

import { loadRoles } from "@/lib/admin/api";
import { useResource } from "@/lib/head/use-resource";
import { Badge, Card, EmptyState, Notice, PageHeader, ResourceGate } from "@/components/head/ui";

const scopeLabels = { NETWORK: "Уся мережа", ASSIGNED_PHARMACIES: "Призначені аптеки" } as const;

export function Rights() {
  const roles = useResource(loadRoles);

  return (
    <>
      <PageHeader title="Права доступу" subtitle="Ролі та дозволи, які діють на сервері" />
      <Notice tone="neutral">Матриця лише відображає поточні налаштування. Дозволи змінюються на рівні бази даних, а не в кабінеті.</Notice>
      <Card>
        <ResourceGate resource={roles} errorText="Не вдалося завантажити ролі.">
          {() => {
            const items = roles.data ?? [];
            if (items.length === 0) return <EmptyState title="Ролей немає" />;
            const permissions = new Map<string, string>();
            for (const role of items) for (const permission of role.permissions) permissions.set(permission.code, permission.name);
            const rows = [...permissions].sort((a, b) => a[0].localeCompare(b[0]));
            return (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <caption className="sr-only">Матриця дозволів за ролями</caption>
                  <thead>
                    <tr className="border-b border-[#e2e8e5] text-left text-xs text-[#64748b]">
                      <th scope="col" className="px-4 py-3 font-medium">Дозвіл</th>
                      {items.map(role => (
                        <th key={role.code} scope="col" className="px-2 py-3 text-center font-medium">
                          <span className="block text-[#0f172a]">{role.name}</span>
                          <span className="block font-normal">{scopeLabels[role.dataScope]}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([code, name]) => (
                      <tr key={code} className="border-b border-[#e2e8e5] last:border-0">
                        <th scope="row" className="px-4 py-3 text-left font-normal">
                          <span className="block font-medium">{name}</span>
                          <span className="block text-xs tabular-nums text-[#64748b]">{code}</span>
                        </th>
                        {items.map(role => {
                          const granted = role.permissions.some(permission => permission.code === code);
                          return (
                            <td key={role.code} className="px-2 py-3 text-center">
                              <Badge tone={granted ? "success" : "neutral"}>{granted ? "Так" : "Ні"}</Badge>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }}
        </ResourceGate>
      </Card>
    </>
  );
}
