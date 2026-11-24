import { Suspense, type ReactNode } from "react";
import { LoadingState } from "@/components/head/ui";
import { HeadShell } from "@/components/head/head-shell";

export const instant = { unstable_disableDevValidation: true };

export default function HeadLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingState />}><HeadShell>{children}</HeadShell></Suspense>;
}
