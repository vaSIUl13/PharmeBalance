import type { Metadata } from "next";
import { HeadDashboard } from "@/components/head/dashboard";

export const metadata: Metadata = { title: "Дашборд аптеки · PharmaBalance" };

export default function HeadDashboardPage() {
  return <HeadDashboard />;
}
