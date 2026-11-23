"use client";

import { createContext, useContext } from "react";
import type { HeadSession } from "@/lib/head/api";

const SessionContext = createContext<HeadSession | null>(null);

export const HeadSessionProvider = SessionContext.Provider;

export function useHeadSession(): HeadSession {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useHeadSession must be used inside HeadShell");
  return session;
}
