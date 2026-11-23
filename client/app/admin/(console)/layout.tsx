import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";

export const instant = { unstable_disableDevValidation: true };

export default function AdminConsoleLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
