"use client";

import { TransferView } from "@/components/logist/transfer-view";
import { useHeadSession } from "./head-session";

export function HeadTransferDetail({ id }: { id: number }) {
  const { principal, pharmacy } = useHeadSession();
  const receiverPharmacy = principal.permissions.includes("RECEIPT_CONFIRM") ? pharmacy?.pharmacyId : undefined;
  return <TransferView id={id} viewer={{ role: "head", receiverPharmacy }} />;
}
