import { apiRequest, authRequest } from "@/lib/auth";
import type { Principal } from "@/lib/head/types";
import type { AdminPharmacy, AdminUser, AuditPage, CreatePharmacyInput, CreateUserInput, ExternalPharmacy, RoleCode } from "./types";

const pageLimit = 40;

type Page<T> = { items: T[]; next: number | null };

async function loadAll<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  let after: number | null = null;
  for (let page = 0; page < pageLimit; page += 1) {
    const result: Page<T> = await apiRequest<Page<T>>(path + (after === null ? "" : "?after=" + after));
    items.push(...result.items);
    if (result.next === null) break;
    after = result.next;
  }
  return items;
}

export function loadPrincipal(): Promise<Principal> {
  return authRequest<Principal>("me");
}

export function loadUsers(): Promise<AdminUser[]> {
  return loadAll<AdminUser>("users");
}

export function loadPharmacies(): Promise<AdminPharmacy[]> {
  return loadAll<AdminPharmacy>("pharmacies");
}

export function createPharmacy(input: CreatePharmacyInput): Promise<AdminPharmacy> {
  return apiRequest("pharmacies", "POST", input);
}

export function searchExternalPharmacies(query: string, after?: number): Promise<Page<ExternalPharmacy>> {
  const params = new URLSearchParams({ q: query, complete: "true" });
  if (after !== undefined) params.set("after", String(after));
  return apiRequest("pharmacies/external?" + params);
}

export function loadAudit(before?: number): Promise<AuditPage> {
  return apiRequest<AuditPage>("audit" + (before === undefined ? "" : "?before=" + before));
}

export function createUser(input: CreateUserInput): Promise<unknown> {
  return apiRequest("users", "POST", input);
}

export function updateAccess(userId: number, access: { role?: RoleCode; pharmacyId?: number }): Promise<unknown> {
  return apiRequest("users/" + userId, "PATCH", access);
}

export function blockUser(userId: number): Promise<void> {
  return apiRequest<void>("users/" + userId + "/block", "POST");
}
