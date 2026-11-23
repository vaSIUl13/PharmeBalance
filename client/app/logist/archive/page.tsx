import type { Metadata } from "next";
import { Archive } from "@/components/logist/archive";

export const metadata: Metadata = { title: "Архів перевезень · PharmaBalance" };

export default function LogistArchivePage() {
  return <Archive />;
}
