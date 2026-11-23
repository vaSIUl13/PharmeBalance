import type { ReactNode } from "react";
import { ManagerShell } from "@/components/manager/manager-shell";

export const instant = { unstable_disableDevValidation: true };

export default function ManagerLayout({ children }: { children: ReactNode }) {
  return <ManagerShell>{children}</ManagerShell>;
}
