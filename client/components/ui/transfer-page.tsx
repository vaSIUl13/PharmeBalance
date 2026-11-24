import type { ComponentType } from "react";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LoadingState } from "@/components/head/ui";

type Props = {
  params: Promise<{ id: string }>;
  view: ComponentType<{ id: number }>;
};

export function TransferPage(props: Props) {
  return <Suspense fallback={<LoadingState />}><TransferRoute {...props} /></Suspense>;
}

async function TransferRoute({ params, view: View }: Props) {
  const { id } = await params;
  const value = Number(id);
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(value) || value < 1) notFound();
  return <View id={value} />;
}
