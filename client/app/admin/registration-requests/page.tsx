import { Suspense } from "react";
import { redirect } from "next/navigation";

export default function LegacyReviewPage({ searchParams }: PageProps<"/admin/registration-requests">) {
  return <Suspense><LegacyReviewRedirect searchParams={searchParams} /></Suspense>;
}

async function LegacyReviewRedirect({ searchParams }: Pick<PageProps<"/admin/registration-requests">, "searchParams">) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const key of ["id", "decision"]) {
    if (typeof params[key] === "string") query.set(key, params[key]);
  }
  return redirect("/superadmin/registration-requests" + (query.size ? "?" + query : ""));
}