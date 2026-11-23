import type { Metadata } from "next";
import { Drugs } from "@/components/admin/drugs";

export const metadata: Metadata = { title: "Довідник препаратів · PharmaBalance" };

export default function AdminDrugsPage() {
  return <Drugs />;
}
