import type { Metadata } from "next";
import { DemoDay } from "@/components/admin/demo-day";

export const metadata: Metadata = { title: "Закриття demo-дня · PharmaBalance" };

export default function DemoDayPage() {
  return <DemoDay />;
}
