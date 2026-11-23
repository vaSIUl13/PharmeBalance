import type { Metadata } from "next";
import { Pharmacies } from "@/components/admin/pharmacies";

export const metadata: Metadata = { title: "Аптеки · PharmaBalance" };

export default function AdminPharmaciesPage() {
  return <Pharmacies />;
}
