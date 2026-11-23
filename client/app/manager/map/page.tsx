import type { Metadata } from "next";
import { ManagerMap } from "@/components/manager/map";

export const metadata: Metadata = { title: "Мапа мережі · PharmaBalance" };
export default function ManagerMapPage() {
  return <ManagerMap />;
}
