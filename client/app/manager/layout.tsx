import { Suspense, type ReactNode } from "react";
import { LoadingState } from "@/components/head/ui";
import { ManagerShell } from "@/components/manager/manager-shell";

export const instant = { unstable_disableDevValidation: true };

export default function ManagerLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingState />}><ManagerShell>{children}</ManagerShell></Suspense>;
}
