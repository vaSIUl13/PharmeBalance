import { apiRequest, authRequest } from "@/lib/auth";
import type { Principal, TransferDetail, TransferResult, TransferStatus } from "@/lib/head/types";

export function loadPrincipal(): Promise<Principal> {
  return authRequest<Principal>("me");
}

export function loadTransfer(id: number): Promise<TransferDetail> {
  return apiRequest<TransferDetail>("recommendations/" + id);
}

type TransferAction = {
  actionId: number;
  userId: number;
  actionTime: string;
  quantity: number | null;
  comment: string | null;
  actionType: { code: string; fromStatus: TransferStatus; toStatus: TransferStatus };
};

export function loadTransferHistory(id: number): Promise<TransferAction[]> {
  return apiRequest("recommendations/" + id + "/history");
}

export type TransferRoute =
  | { status: "ready"; distanceMeters: number; durationSeconds: number; coordinates: [longitude: number, latitude: number][] }
  | { status: "no-route" | "unavailable" };

export function loadTransferRoute(id: number): Promise<TransferRoute> {
  return apiRequest<TransferRoute>("recommendations/" + id + "/route");
}

export function dispatchTransfer(id: number, comment: string): Promise<TransferResult> {
  return apiRequest<TransferResult>("recommendations/" + id + "/actions/DISPATCH", "POST", comment ? { comment } : {});
}
