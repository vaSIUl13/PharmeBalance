import type { Metadata } from "next";
import { Queue } from "@/components/logist/queue";

export const metadata: Metadata = { title: "Черга завдань · PharmaBalance" };
export default function LogistQueuePage() {
  return <Queue />;
}
