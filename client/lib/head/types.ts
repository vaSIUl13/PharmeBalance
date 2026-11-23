export type Principal = {
  userId: number;
  email: string;
  role: string;
  permissions: string[];
  pharmacyIds: number[];
};

export type Pharmacy = {
  pharmacyId: number;
  code: string;
  name: string;
  city: string;
  address: string;
  isActive: boolean;
};

export type CursorPage<T> = { items: T[]; next: number | null };

export type PositionType = "SHORTAGE" | "SURPLUS";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export type ForecastItem = {
  forecastId: number;
  stockId: number;
  quantity: number | null;
  msl: number | null;
  maxLevel: number | null;
  abcClass: "A" | "B" | "C" | null;
  xyzClass: "X" | "Y" | "Z" | null;
  predictedDemand: string | null;
  shortageProbability: string | null;
  risk: {
    positionType: PositionType;
    riskLevel: RiskLevel;
    daysToStockout: number | null;
  } | null;
  stock: { pharmacyId: number; drug: { sku: string; name: string } };
};

export type ForecastPage = {
  run: { id: number; asOf: string } | null;
  items: ForecastItem[];
  next: number | null;
};

export type TransferStatus = "STALE" | "CREATED" | "CONFIRMED" | "REJECTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export type Transfer = {
  recommendationId: number;
  quantity: number;
  priority: number;
  status: TransferStatus;
  createdAt: string;
  distanceKm: string | null;
  distanceSource?: "OSRM" | "OVERPASS" | "HAVERSINE" | null;
};

export type TransferPosition = {
  stockId: number;
  pharmacy: Pharmacy & { latitude: string; longitude: string };
  drug: { sku: string; name: string; dosageForm: string; strength: string | null; unit: string };
};

export type TransferDetail = Transfer & {
  donorStock: TransferPosition;
  recipientStock: TransferPosition;
};

export type TransferResult = { recommendationId: number; status: TransferStatus; replayed: boolean };

export type ImportStatus = "LEGACY" | "APPLIED" | "REJECTED";
export type ImportKind = "stocks" | "sales";

export type ImportBatch = {
  importId: number;
  dataType: "STOCKS" | "SALES";
  sourceFormat: "CSV" | "JSON";
  fileName: string;
  uploadedAt: string;
  snapshotAt: string | null;
  recordsTotal: number;
  recordsApplied: number;
  recordsRejected: number;
  status: ImportStatus;
};

export type ImportRowError = { row: number; message: string };

export type ImportDetail = ImportBatch & { errors: ImportRowError[] };
