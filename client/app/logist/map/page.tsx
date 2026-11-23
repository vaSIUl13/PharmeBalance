import type { Metadata } from "next";
import { LogistMap } from "@/components/logist/map";

export const metadata: Metadata = { title: "Карта рейсів · PharmaBalance" };
export default function LogistMapPage() {
  return <LogistMap />;
}
