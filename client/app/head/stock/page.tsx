import type { Metadata } from "next";
import { StockTable } from "@/components/head/stock-table";

export const metadata: Metadata = { title: "Залишки та ризики · PharmaBalance" };

export default function HeadStockPage() {
  return <StockTable />;
}
