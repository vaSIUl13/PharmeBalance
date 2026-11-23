import { apiRequest, authRequest } from "@/lib/auth";
import type { Principal, TransferDetail, TransferResult } from "@/lib/head/types";

export function loadPrincipal(): Promise<Principal> {
  return authRequest<Principal>("me");
}

export function loadTransfer(id: number): Promise<TransferDetail> {
  return apiRequest<TransferDetail>("recommendations/" + id);
}

export function dispatchTransfer(id: number, comment: string): Promise<TransferResult> {
  return apiRequest<TransferResult>("recommendations/" + id + "/actions/DISPATCH", "POST", comment ? { comment } : {});
}
