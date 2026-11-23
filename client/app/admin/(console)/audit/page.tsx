import type { Metadata } from "next";
import { Audit } from "@/components/admin/audit";

export const metadata: Metadata = { title: "Журнал аудиту · PharmaBalance" };

export default function AdminAuditPage() {
  return <Audit />;
}
