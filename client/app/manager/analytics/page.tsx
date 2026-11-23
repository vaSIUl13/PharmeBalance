import type { Metadata } from "next";
import { Analytics } from "@/components/manager/analytics";

export const metadata: Metadata = { title: "Аналітика · PharmaBalance" };

export default function ManagerAnalyticsPage() {
  return <Analytics />;
}
