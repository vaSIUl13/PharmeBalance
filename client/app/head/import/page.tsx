import type { Metadata } from "next";
import { ImportPage } from "@/components/head/imports";

export const metadata: Metadata = { title: "Імпорт даних · PharmaBalance" };

export default function HeadImportPage() {
  return <ImportPage />;
}
