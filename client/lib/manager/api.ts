import { apiRequest, authRequest } from "@/lib/auth";
import type { ForecastPage, Pharmacy, Principal, TransferResult } from "@/lib/head/types";
import type { AuditPage, DecisionCommand, ForecastView, ReportSummary } from "./types";

const pharmacyPageLimit = 40;

export function loadPrincipal(): Promise<Principal> {
  return authRequest<Principal>("me");
}

export async function loadPharmacies(): Promise<Pharmacy[]> {
  const items: Pharmacy[] = [];
  let after: number | null = null;
  for (let page = 0; page < pharmacyPageLimit; page += 1) {
    const result: { items: Pharmacy[]; next: number | null } = await apiRequest<{ items: Pharmacy[]; next: number | null }>(
      "pharmacies" + (after === null ? "" : "?after=" + after));
    items.push(...result.items);
    if (result.next === null) break;
    after = result.next;
  }
  return items;
}

export function loadForecastPage(view: ForecastView, pharmacyId?: number, after?: number): Promise<ForecastPage> {
  const query = new URLSearchParams();
  if (pharmacyId !== undefined) query.set("pharmacyId", String(pharmacyId));
  if (after !== undefined) query.set("after", String(after));
  const text = query.toString();
  return apiRequest<ForecastPage>(view + (text ? "?" + text : ""));
}

export function loadSummary(from: string, to: string, pharmacyId?: number): Promise<ReportSummary> {
  const query = new URLSearchParams({ from, to });
  if (pharmacyId !== undefined) query.set("pharmacyId", String(pharmacyId));
  return apiRequest<ReportSummary>("reports/summary?" + query.toString());
}

export function exportUrl(from: string, to: string, format: "csv" | "xlsx", pharmacyId?: number): string {
  const query = new URLSearchParams({ from, to, format });
  if (pharmacyId !== undefined) query.set("pharmacyId", String(pharmacyId));
  return "/api/v1/reports/export?" + query.toString();
}

export function decide(id: number, command: DecisionCommand, comment: string): Promise<TransferResult> {
  return apiRequest<TransferResult>("recommendations/" + id + "/actions/" + command, "POST", comment ? { comment } : {});
}

export async function generateRecommendations(): Promise<void> {
  const page = await loadForecastPage("forecasts");
  if (!page.run) throw new Error("No forecast run");
  await apiRequest("recommendations/generate/" + page.run.id, "POST", {});
}

export function updateThresholds(stockId: number, msl: number, maxLevel: number): Promise<unknown> {
  return apiRequest("stocks/" + stockId + "/thresholds", "PATCH", { msl, maxLevel });
}

export function loadAudit(before?: number): Promise<AuditPage> {
  return apiRequest<AuditPage>("audit" + (before === undefined ? "" : "?before=" + before));
}
