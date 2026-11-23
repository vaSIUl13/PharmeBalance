import { apiRequest, apiUpload, authRequest } from "@/lib/auth";
import type {
  CurrentPosition, CursorPage, ImportBatch, ImportDetail, ImportKind, Pharmacy, Principal,
  Transfer, TransferDetail, TransferResult,
} from "./types";

const transferPageSize = 100;

export type HeadSession = { principal: Principal; pharmacy: Pharmacy | null };

export async function loadSession(): Promise<HeadSession> {
  const principal = await authRequest<Principal>("me");
  const pharmacyId = principal.pharmacyIds[0];
  const pharmacy = pharmacyId === undefined ? null : await apiRequest<Pharmacy>("pharmacies/" + pharmacyId);
  return { principal, pharmacy };
}

export async function loadPositions(): Promise<{ asOf: string | null; items: CurrentPosition[] }> {
  const items: CurrentPosition[] = [];
  let asOf: string | null = null;
  let after: number | null = null;
  do {
    const result: CursorPage<CurrentPosition> & { asOf: string | null } =
      await apiRequest("stocks/current" + (after === null ? "" : "?after=" + after));
    asOf = result.asOf;
    items.push(...result.items);
    after = result.next;
  } while (after !== null);
  return { asOf, items };
}

export async function loadTransfers(): Promise<TransferDetail[]> {
  const list = await apiRequest<Transfer[]>("recommendations");
  return Promise.all(list.slice(0, transferPageSize).map(item =>
    apiRequest<TransferDetail>("recommendations/" + item.recommendationId)));
}

export function receiveTransfer(id: number, quantity: number, comment: string): Promise<TransferResult> {
  return apiRequest<TransferResult>("recommendations/" + id + "/actions/RECEIVE", "POST",
    comment ? { quantity, comment } : { quantity });
}

export function loadImports(before?: number): Promise<CursorPage<ImportBatch>> {
  return apiRequest<CursorPage<ImportBatch>>("imports" + (before === undefined ? "" : "?before=" + before));
}

export function loadImport(id: number): Promise<ImportDetail> {
  return apiRequest<ImportDetail>("imports/" + id);
}

export function uploadImport(kind: ImportKind, form: FormData): Promise<ImportDetail> {
  return apiUpload<ImportDetail>("imports/" + kind, form, [422]);
}
