import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TransferView } from "@/components/logist/transfer-view";

export const metadata: Metadata = { title: "Картка рейсу · PharmaBalance" };

export default function LogistTransferPage({ params }: PageProps<"/logist/transfer/[id]">) {
  return (
    <Suspense fallback={<p role="status" className="text-sm text-[#64748b]">Завантаження…</p>}>
      <TransferRoute params={params} />
    </Suspense>
  );
}

async function TransferRoute({ params }: Pick<PageProps<"/logist/transfer/[id]">, "params">) {
  const { id } = await params;
  const value = Number(id);
  if (!Number.isSafeInteger(value) || value < 1) notFound();
  return <TransferView id={value} />;
}
