import type { ForecastItem, ImportBatch, RiskLevel, TransferStatus } from "./types";

export type Tone = "danger" | "warning" | "success" | "neutral" | "info";

export const transferStatuses: Record<TransferStatus, { label: string; tone: Tone }> = {
  CREATED: { label: "Сформована", tone: "neutral" },
  CONFIRMED: { label: "Підтверджена", tone: "info" },
  IN_PROGRESS: { label: "У виконанні", tone: "warning" },
  COMPLETED: { label: "Виконана", tone: "success" },
  REJECTED: { label: "Відхилена", tone: "danger" },
  CANCELLED: { label: "Скасована", tone: "neutral" },
  STALE: { label: "Застаріла", tone: "neutral" },
};

export const importStatuses: Record<ImportBatch["status"], { label: string; tone: Tone }> = {
  APPLIED: { label: "Застосовано", tone: "success" },
  REJECTED: { label: "Відхилено", tone: "danger" },
  LEGACY: { label: "Архівний", tone: "neutral" },
};

export const importKinds: Record<ImportBatch["dataType"], string> = { STOCKS: "Залишки", SALES: "Продажі" };

export const riskLevels: Record<RiskLevel, { label: string; tone: Tone }> = {
  HIGH: { label: "Високий", tone: "danger" },
  MEDIUM: { label: "Середній", tone: "warning" },
  LOW: { label: "Низький", tone: "neutral" },
};

export type PositionStatus = "shortage" | "surplus" | "normal";

export const positionStatuses: Record<PositionStatus, { label: string; tone: Tone }> = {
  shortage: { label: "Дефіцит", tone: "danger" },
  surplus: { label: "Надлишок", tone: "info" },
  normal: { label: "Норма", tone: "success" },
};

export function positionStatus(item: ForecastItem): PositionStatus {
  if (item.risk?.positionType === "SHORTAGE") return "shortage";
  if (item.risk?.positionType === "SURPLUS") return "surplus";
  return "normal";
}

export function toNumber(value: string | number | null): number | null {
  if (value === null) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

export function formatNumber(value: number | null, fractionDigits = 0): string {
  return value === null ? "—" : value.toLocaleString("uk-UA", { maximumFractionDigits: fractionDigits });
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("uk-UA", { dateStyle: "short", timeStyle: "short" });
}

export function formatProbability(value: string | null): string {
  const probability = toNumber(value);
  return probability === null ? "—" : Math.round(probability * 100) + "%";
}

export function formatDrug(drug: { dosageForm: string; strength: string | null }): string {
  return drug.strength ? drug.dosageForm + ", " + drug.strength : drug.dosageForm;
}
