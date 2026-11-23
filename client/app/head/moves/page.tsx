import type { Metadata } from "next";
import { Transfers } from "@/components/head/transfers";

export const metadata: Metadata = { title: "Вхідні переміщення · PharmaBalance" };

export default function HeadMovesPage() {
  return <Transfers />;
}
