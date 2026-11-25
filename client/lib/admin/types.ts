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

export type ExternalPharmacy = {
  id: number;
  source: string;
  name: string | null;
  city: string | null;
  address: string | null;
  latitude: string | null;
  longitude: string | null;
  pharmacyId: number | null;
};

export type ExternalMapPage = { items: Omit<ExternalPharmacy, "source">[]; truncated: boolean };

export type RoleInfo = {
  code: RoleCode;
  name: string;
  dataScope: "NETWORK" | "ASSIGNED_PHARMACIES";
  permissions: { code: string; name: string }[];
};

export type RolePermission = { code: string; name: string; grantableRoles: RoleCode[] };

export type Drug = {
  drugId: number;
  sku: string;
  name: string;
  dosageForm: string;
  strength: string | null;
  unit: string;
  isActive: boolean;
  registration: { number: string; inn: string | null; atcCodes: string[] } | null;
};

export type DrugPage = { items: Drug[]; next: number | null };
export type CreateDrugInput = Pick<Drug, "sku" | "name" | "dosageForm" | "strength" | "unit">;

export type CreatePharmacyInput = {
  code?: string;
  name: string;
  city: string;
  address: string;
  latitude: number;
  longitude: number;
  externalRecordIds?: number[];
};
export type UpdatePharmacyInput = Partial<Omit<CreatePharmacyInput, "code" | "externalRecordIds">>;

export type AuditEventType =
  | "LOGIN" | "ACCOUNT_CREATED" | "ACCOUNT_BLOCKED" | "ROLE_CHANGED" | "ROLE_PERMISSION_CHANGED" | "PHARMACY_ASSIGNED"
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
