import type { Tone } from "@/lib/head/format";
import type { TransferDetail, TransferStatus } from "@/lib/head/types";

export const tripStatuses: Record<TransferStatus, { label: string; tone: Tone }> = {
  CONFIRMED: { label: "Очікує відправлення", tone: "info" },
  IN_PROGRESS: { label: "В дорозі", tone: "warning" },
  COMPLETED: { label: "Виконана", tone: "success" },
  CANCELLED: { label: "Скасована", tone: "neutral" },
  CREATED: { label: "Сформована", tone: "neutral" },
  REJECTED: { label: "Відхилена", tone: "danger" },
  STALE: { label: "Застаріла", tone: "neutral" },
};

export function distance(trip: TransferDetail): number | null {
  if (trip.distanceKm === null) return null;
  const value = Number(trip.distanceKm);
  return Number.isFinite(value) ? value : null;
}

export function formatKm(value: number | null): string {
  return value === null ? "—" : value.toLocaleString("uk-UA", { maximumFractionDigits: 1 }) + " км";
}

export function byQueueOrder(a: TransferDetail, b: TransferDetail): number {
  const way = Number(b.status === "IN_PROGRESS") - Number(a.status === "IN_PROGRESS");
  return way || a.priority - b.priority || a.recommendationId - b.recommendationId;
}
