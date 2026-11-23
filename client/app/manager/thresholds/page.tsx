import type { Metadata } from "next";
import { Thresholds } from "@/components/manager/thresholds";

export const metadata: Metadata = { title: "Пороги MSL / Max · PharmaBalance" };
export default function ManagerThresholdsPage() {
  return <Thresholds />;
}
