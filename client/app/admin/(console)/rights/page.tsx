import type { Metadata } from "next";
import { Rights } from "@/components/admin/rights";

export const metadata: Metadata = { title: "Права доступу · PharmaBalance" };

export default function AdminRightsPage() {
  return <Rights />;
}
