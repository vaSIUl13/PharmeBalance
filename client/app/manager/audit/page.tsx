import type { Metadata } from "next";
import { Audit } from "@/components/manager/audit";

export const metadata: Metadata = { title: "Журнал аудиту · PharmaBalance" };
export default function ManagerAuditPage() {
  return <Audit />;
}
