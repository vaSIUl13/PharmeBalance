import type { ReactNode } from "react";
import { HeadShell } from "@/components/head/head-shell";

export const instant = { unstable_disableDevValidation: true };

export default function HeadLayout({ children }: { children: ReactNode }) {
  return <HeadShell>{children}</HeadShell>;
}
