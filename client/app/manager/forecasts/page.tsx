import type { Metadata } from "next";
import { Forecasts } from "@/components/manager/forecasts";

export const metadata: Metadata = { title: "Прогнози та ризики · PharmaBalance" };
export default function ManagerForecastsPage() {
  return <Forecasts />;
}
