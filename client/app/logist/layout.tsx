import type { ReactNode } from "react";
import { LogistShell } from "@/components/logist/logist-shell";

export default function LogistLayout({ children }: { children: ReactNode }) {
  return <LogistShell>{children}</LogistShell>;
}
