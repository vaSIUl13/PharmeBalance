import { Suspense, type ReactNode } from "react";
import { LoadingState } from "@/components/head/ui";
import { LogistShell } from "@/components/logist/logist-shell";

export const instant = { unstable_disableDevValidation: true };

export default function LogistLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<LoadingState />}>
      <LogistShell>{children}</LogistShell>
    </Suspense>
  );
}
