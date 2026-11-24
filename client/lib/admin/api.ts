import { apiRequest, authRequest } from "@/lib/auth";
import type { Principal } from "@/lib/head/types";
import type { AdminPharmacy, AdminUser, AuditPage, CreatePharmacyInput, CreateUserInput, DrugPage, ExternalMapPage, ExternalPharmacy, RoleCode, RoleInfo, RolePermission } from "./types";

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

export function loadExternalInBox(box: { south: number; west: number; north: number; east: number }, limit = 500): Promise<ExternalMapPage> {
  const params = new URLSearchParams({
    south: box.south.toFixed(6), west: box.west.toFixed(6), north: box.north.toFixed(6), east: box.east.toFixed(6),
    limit: String(limit),
  });
  return apiRequest<ExternalMapPage>("pharmacies/external/map?" + params.toString());
}

export function loadRoles(): Promise<RoleInfo[]> {
  return apiRequest<RoleInfo[]>("roles");
}

export async function loadRights() {
  const [roles, permissions] = await Promise.all([loadRoles(), apiRequest<RolePermission[]>("roles/permissions")]);
  return { roles, permissions };
}

export function setRolePermission(role: RoleCode, code: string, granted: boolean): Promise<{ changed: boolean }> {
  return apiRequest("roles/" + role + "/permissions/" + encodeURIComponent(code), "PUT", { granted });
}

export function loadDrugs(query = "", after?: number): Promise<DrugPage> {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (after !== undefined) params.set("after", String(after));
  const suffix = params.toString();
  return apiRequest<DrugPage>("drugs" + (suffix ? "?" + suffix : ""));
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
