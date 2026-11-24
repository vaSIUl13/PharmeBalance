import type { Tone } from "@/lib/head/format";
import type { AuditEventType } from "./types";

export function isoDay(offsetDays = 0): string {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return date.toLocaleDateString("sv-SE", { timeZone: "Europe/Kyiv" });
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
