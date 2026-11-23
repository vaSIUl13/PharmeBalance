import type { Metadata } from "next";
import { Recommendations } from "@/components/manager/recommendations";

export const metadata: Metadata = { title: "Рекомендації · PharmaBalance" };
export default function ManagerRecommendationsPage() {
  return <Recommendations />;
}
