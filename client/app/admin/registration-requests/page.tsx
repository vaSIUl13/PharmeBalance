import { Suspense } from "react";
import { RegistrationReview } from "./registration-review";

export default function RegistrationRequests({ searchParams }: PageProps<"/admin/registration-requests">) {
  return (
    <Suspense fallback={<main className="p-6"><p role="status">Завантаження…</p></main>}>
      <ReviewRoute searchParams={searchParams} />
    </Suspense>
  );
}

async function ReviewRoute({ searchParams }: Pick<PageProps<"/admin/registration-requests">, "searchParams">) {
  const params = await searchParams;
  const id = typeof params.id === "string" ? params.id : undefined;
  const decision = params.decision === "approve" || params.decision === "reject" ? params.decision : undefined;

  return <RegistrationReview key={id ?? "pending"} id={id} suggestedDecision={decision} />;
}
