import type { Pharmacy } from "@/lib/head/types";

export type RoleCode = "admin" | "manager" | "head" | "logist";

export type AdminUser = {
  userId: number;
  login: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  role: { code: RoleCode | "superadmin" };
  pharmacyIds: number[];
};

export type AdminPharmacy = Pharmacy & { latitude: string; longitude: string };

export type AuditEventType =
  | "LOGIN" | "ACCOUNT_CREATED" | "ACCOUNT_BLOCKED" | "ROLE_CHANGED" | "PHARMACY_ASSIGNED"
  | "THRESHOLDS_CHANGED" | "REFERENCE_EDITED" | "REPORT_EXPORTED";

export type AuditEntry = {
  logId: number;
  userId: number;
  targetUserId: number | null;
  stockId: number | null;
  eventType: AuditEventType;
  eventTime: string;
  details: string | null;
};

export type AuditPage = { items: AuditEntry[]; next: number | null };

export type CreateUserInput = {
  login: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  role: RoleCode;
  pharmacyId?: number;
};
