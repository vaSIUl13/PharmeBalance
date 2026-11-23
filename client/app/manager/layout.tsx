import type { ReactNode } from "react";
import { ManagerShell } from "@/components/manager/manager-shell";

export default function ManagerLayout({ children }: { children: ReactNode }) {
  return <ManagerShell>{children}</ManagerShell>;
}
