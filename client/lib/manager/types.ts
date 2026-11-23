export type ForecastView = "forecasts" | "risks" | "surpluses";

export type ReportTotals = {
  shortageRisks: number;
  surplusPositions: number;
  recommendations: number;
  confirmed: number;
  dispatched: number;
  completed: number;
  movedUnits: number;
};

export type ReportSummary = {
  period: { from: string; to: string; timeZone: string };
  pharmacyId: number | null;
  totals: ReportTotals;
};

export type TimelinePoint = ReportTotals & { day: string };

export type ReportTimeline = {
  period: { from: string; to: string; timeZone: string };
  pharmacyId: number | null;
  points: TimelinePoint[];
};

export type DecisionCommand = "CONFIRM" | "REJECT" | "CANCEL";

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
