"use client";

import { useState, type ReactNode } from "react";
import { loadRights, setRolePermission } from "@/lib/admin/api";
import type { RoleInfo, RolePermission } from "@/lib/admin/types";
import { useResource } from "@/lib/head/use-resource";
import { buttonClasses, Card, EmptyState, Notice, PageHeader, ResourceGate } from "@/components/head/ui";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/manager/modal";

const scopeLabels = { NETWORK: "Уся мережа", ASSIGNED_PHARMACIES: "Призначені аптеки" } as const;

const groups: { title: string; codes: string[] }[] = [
  { title: "Дані мережі та аптек", codes: ["NETWORK_VIEW", "PHARMACY_VIEW", "STATS_VIEW", "DATA_IMPORT"] },
  { title: "Рекомендації та рейси", codes: ["REC_DECIDE", "REC_CANCEL", "TRANSFER_VIEW", "TRANSFER_DISPATCH", "RECEIPT_CONFIRM"] },
  { title: "Довідники та пороги", codes: ["REFERENCE_EDIT", "THRESHOLDS_EDIT"] },
  { title: "Адміністрування", codes: ["USERS_MANAGE", "AUDIT_VIEW"] },
];

type Change = { role: RoleInfo; permission: RolePermission; granted: boolean };
type Cells = {
  editMode: boolean;
  busy: boolean;
  changedKey: string | null;
  onChange: (role: RoleInfo, permission: RolePermission, granted: boolean) => void;
};

function grouped(permissions: RolePermission[]) {
  const known = new Set(groups.flatMap(group => group.codes));
  const result = groups
    .map(group => ({ title: group.title, items: group.codes.flatMap(code => permissions.filter(item => item.code === code)) }))
    .filter(group => group.items.length > 0);
  const rest = permissions.filter(item => !known.has(item.code));
  return rest.length > 0 ? [...result, { title: "Інше", items: rest }] : result;
}

function Status({ granted, dim = false }: { granted: boolean; dim?: boolean }) {
  return (
    <span className={"inline-flex min-h-8 min-w-[68px] items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-semibold " +
      (granted ? "border-[#86efac] bg-[#dcfce7] text-[#166534]" : "border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]") + (dim ? " opacity-60" : "")}>
      <Icon name={granted ? "check" : "x"} size={14} />{granted ? "Так" : "Ні"}
    </span>
  );
}

function Switch({ granted, label, disabled, onClick }: { granted: boolean; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={granted} aria-label={label} disabled={disabled} onClick={onClick}
      className={"relative inline-flex h-8 w-[76px] cursor-pointer items-center rounded-full border text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-60 " +
        (granted ? "justify-start border-[#16a34a] bg-[#16a34a] pl-3 text-white" : "justify-end border-[#cbd5e1] bg-[#e2e8f0] pr-3 text-[#475569]")}>
      {granted ? "Так" : "Ні"}
      <span aria-hidden className={"absolute top-0.5 size-6 rounded-full bg-white shadow transition-all " + (granted ? "right-0.5" : "left-0.5")} />
    </button>
  );
}

function Cell({ role, permission, cells }: { role: RoleInfo; permission: RolePermission; cells: Cells }) {
  const granted = role.permissions.some(item => item.code === permission.code);
  const changed = cells.changedKey === role.code + ":" + permission.code;
  const editable = cells.editMode && (granted || permission.grantableRoles.includes(role.code));
  const label = (granted ? "Прибрати" : "Надати") + " доступ «" + permission.name + "» для ролі «" + role.name + "»";
  return (
    <span className={"inline-flex rounded-full " + (changed ? "ring-2 ring-[#0f766e] ring-offset-2" : "")}>
      {editable
        ? <Switch granted={granted} label={label} disabled={cells.busy} onClick={() => cells.onChange(role, permission, !granted)} />
        : cells.editMode
          ? <span title="Цей дозвіл не можна надати цій ролі"><Status granted={granted} dim /><span className="sr-only"> (змінити не можна)</span></span>
          : <Status granted={granted} />}
    </span>
  );
}

function Legend({ editMode }: { editMode: boolean }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#475569]">
      <li className="inline-flex items-center gap-2"><Status granted />доступ надано</li>
      <li className="inline-flex items-center gap-2"><Status granted={false} />доступу немає</li>
      {editMode && <li className="inline-flex items-center gap-2"><Status granted={false} dim />змінити не можна</li>}
    </ul>
  );
}

function Matrix({ roles, permissions, cells }: { roles: RoleInfo[]; permissions: RolePermission[]; cells: Cells }) {
  const sections = grouped(permissions);
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
        <caption className="sr-only">Матриця дозволів за ролями</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-[2] border-b border-[#e2e8e5] bg-white px-4 py-3 text-left text-xs font-medium text-[#64748b]">Дозвіл</th>
            {roles.map(role => (
              <th key={role.code} scope="col" className="border-b border-[#e2e8e5] bg-white px-2 py-3 text-center align-top font-normal">
                <span className="block font-semibold text-[#0f172a]">{role.name}</span>
                <span className="block text-xs text-[#64748b]">{scopeLabels[role.dataScope]}</span>
                <span className="mx-auto mt-2 block h-1.5 w-20 overflow-hidden rounded-full bg-[#e2e8f0]" aria-hidden>
                  <span className="block h-full rounded-full bg-[#16a34a]" style={{ width: (role.permissions.length / Math.max(permissions.length, 1)) * 100 + "%" }} />
                </span>
                <span className="mt-1 block text-xs tabular-nums text-[#475569]">{role.permissions.length} з {permissions.length}</span>
              </th>
            ))}
          </tr>
        </thead>
        {sections.map(section => (
          <tbody key={section.title}>
            <tr>
              <th colSpan={roles.length + 1} scope="colgroup"
                className="border-b border-[#e2e8e5] bg-[#f8faf9] px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[#475569]">{section.title}</th>
            </tr>
            {section.items.map(permission => (
              <tr key={permission.code} className="group">
                <th scope="row" className="sticky left-0 z-[1] border-b border-[#e2e8e5] bg-white px-4 py-3 text-left font-normal group-hover:bg-[#f8faf9]">
                  <span className="block font-medium">{permission.name}</span>
                  <span className="block text-xs text-[#64748b]">{permission.code}</span>
                </th>
                {roles.map(role => (
                  <td key={role.code} className="border-b border-[#e2e8e5] px-2 py-3 text-center group-hover:bg-[#f8faf9]">
                    <Cell role={role} permission={permission} cells={cells} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function RoleList({ roles, permissions, cells }: { roles: RoleInfo[]; permissions: RolePermission[]; cells: Cells }) {
  const [code, setCode] = useState(roles[0]?.code);
  const role = roles.find(item => item.code === code) ?? roles[0];
  if (!role) return null;
  return (
    <div className="md:hidden">
      <div role="tablist" aria-label="Роль" className="flex flex-wrap gap-2 border-b border-[#e2e8e5] p-3">
        {roles.map(item => (
          <button key={item.code} type="button" role="tab" aria-selected={item.code === role.code} onClick={() => setCode(item.code)}
            className={"min-h-9 rounded-full border px-3 text-sm font-medium " + (item.code === role.code
              ? "border-[#0f766e] bg-[#0f766e] text-white" : "border-[#e2e8e5] bg-white text-[#475569]")}>{item.name}</button>
        ))}
      </div>
      <p className="px-4 pt-3 text-xs text-[#64748b]">{scopeLabels[role.dataScope]} · {role.permissions.length} з {permissions.length} дозволів</p>
      {grouped(permissions).map(section => (
        <section key={section.title}>
          <h3 className="mt-2 bg-[#f8faf9] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[#475569]">{section.title}</h3>
          <ul className="divide-y divide-[#e2e8e5]">
            {section.items.map(permission => (
              <li key={permission.code} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0"><span className="block text-sm font-medium">{permission.name}</span>
                  <span className="block truncate text-xs text-[#64748b]">{permission.code}</span></span>
                <Cell role={role} permission={permission} cells={cells} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function Rights({ editable = false }: { editable?: boolean }) {
  const rights = useResource(loadRights);
  const [editing, setEditing] = useState(false);
  const [change, setChange] = useState<Change | null>(null);
  const [changedKey, setChangedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const editMode = editable && editing;

  async function submit() {
    if (!change || busy) return;
    const key = change.role.code + ":" + change.permission.code;
    setBusy(true);
    setError("");
    try {
      const result = await setRolePermission(change.role.code, change.permission.code, change.granted);
      setMessage(result.changed ? "Дозвіл оновлено." : "Дозвіл уже має вибраний стан.");
      setChangedKey(key);
      setChange(null);
      rights.reload();
    } catch {
      setError("Не вдалося змінити дозвіл. Оновіть сторінку або спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  }

  const cells: Cells = {
    editMode, busy: busy || rights.loading, changedKey,
    onChange: (role, permission, granted) => {
      setError("");
      setMessage("");
      setChangedKey(null);
      setChange({ role, permission, granted });
    },
  };

  let notice: ReactNode = null;
  if (!editable) notice = <Notice tone="neutral">Матриця доступна для перегляду. Дозволи змінює суперадміністратор.</Notice>;
  else if (editMode) notice = <Notice tone="warning">Режим редагування. Перемикач змінює доступ для всієї ролі одразу після підтвердження.</Notice>;

  return (
    <>
      <PageHeader title="Права доступу" subtitle="Ролі та дозволи, які діють на сервері"
        actions={editable && (
          <button type="button" className={editMode ? buttonClasses.secondary : buttonClasses.primary}
            disabled={busy || !rights.data?.roles.length}
            onClick={() => { setEditing(current => !current); setMessage(""); setChangedKey(null); }}>
            {editMode ? "Завершити редагування" : "Змінити права"}
          </button>
        )} />
      {notice}
      {message && <Notice tone="success">{message}</Notice>}
      <Card>
        <div className="border-b border-[#e2e8e5] px-4 py-3"><Legend editMode={editMode} /></div>
        <ResourceGate resource={rights} errorText="Не вдалося завантажити ролі й дозволи.">
          {({ roles, permissions }) => roles.length === 0
            ? <EmptyState title="Ролей немає" />
            : (
              <>
                <Matrix roles={roles} permissions={permissions} cells={cells} />
                <RoleList roles={roles} permissions={permissions} cells={cells} />
              </>
            )}
        </ResourceGate>
      </Card>
      {change && (
        <Modal title={(change.granted ? "Надати" : "Прибрати") + " доступ для ролі «" + change.role.name + "»?"}
          busy={busy} onClose={() => setChange(null)}>
          <div className="space-y-4 p-5 text-sm">
            <div>
              <p className="font-medium">{change.permission.name}</p>
              <p className="text-xs text-[#64748b]">{change.permission.code}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3" aria-label="Зміна стану">
              <Status granted={!change.granted} />
              <span aria-hidden className="text-[#64748b]">→</span>
              <Status granted={change.granted} />
            </div>
            <p className="text-[#475569]">Зміна застосовується до всіх користувачів ролі, зокрема до активних сеансів.</p>
            {error && <Notice tone="danger">{error}</Notice>}
          </div>
          <div className="flex justify-end gap-2 border-t border-[#e2e8e5] px-5 py-4">
            <button type="button" className={buttonClasses.secondary} disabled={busy} onClick={() => setChange(null)}>Скасувати</button>
            <button type="button"
              className={change.granted ? buttonClasses.primary : buttonClasses.primary + " bg-[#b91c1c]! hover:enabled:bg-[#991b1b]!"}
              disabled={busy} onClick={() => void submit()}>
              {busy ? "Збереження…" : change.granted ? "Надати доступ" : "Прибрати доступ"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
