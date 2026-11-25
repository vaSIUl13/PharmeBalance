import type { Metadata } from "next";
import { Suspense } from "react";
import { Recommendations } from "@/components/manager/recommendations";
import { LoadingState } from "@/components/head/ui";

export const metadata: Metadata = { title: "Рекомендації · PharmaBalance" };
export default function ManagerRecommendationsPage() {
  return <Suspense fallback={<LoadingState />}><Recommendations /></Suspense>;
}
