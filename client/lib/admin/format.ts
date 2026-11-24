import type { Tone } from "@/lib/head/format";
import type { AdminUser, AuditEventType, RoleCode } from "./types";

export const roleLabels: Record<RoleCode | "superadmin", string> = {
  superadmin: "Суперадміністратор",
  admin: "Адміністратор",
  manager: "Товарний менеджер",
  head: "Завідувач аптеки",
  logist: "Логіст",
};

export const roleCodes = ["admin", "manager", "head", "logist"] satisfies RoleCode[];

export function needsPharmacy(role: RoleCode): boolean {
  return role === "head" || role === "logist";
}

export const eventLabels: Record<AuditEventType, { label: string; tone: Tone }> = {
  LOGIN: { label: "Вхід", tone: "neutral" },
  ACCOUNT_CREATED: { label: "Створення акаунта", tone: "success" },
  ACCOUNT_BLOCKED: { label: "Блокування акаунта", tone: "danger" },
  ROLE_CHANGED: { label: "Зміна ролі", tone: "warning" },
  ROLE_PERMISSION_CHANGED: { label: "Зміна дозволу ролі", tone: "warning" },
  PHARMACY_ASSIGNED: { label: "Призначення до аптеки", tone: "info" },
  THRESHOLDS_CHANGED: { label: "Зміна порогів", tone: "warning" },
  REFERENCE_EDITED: { label: "Редагування довідника", tone: "info" },
  REPORT_EXPORTED: { label: "Експорт звіту", tone: "neutral" },
};

export function fullName(user: Pick<AdminUser, "firstName" | "lastName">): string {
  return (user.lastName + " " + user.firstName).trim();
}
