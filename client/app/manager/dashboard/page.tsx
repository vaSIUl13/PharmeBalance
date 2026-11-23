import type { Metadata } from "next";
import { ManagerDashboard } from "@/components/manager/dashboard";

export const metadata: Metadata = { title: "Дашборд мережі · PharmaBalance" };
export default function ManagerDashboardPage() {
  return <ManagerDashboard />;
}
