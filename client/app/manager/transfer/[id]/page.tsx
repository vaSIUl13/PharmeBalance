import { TransferView } from "@/components/logist/transfer-view";
import { TransferPage } from "@/components/ui/transfer-page";

function ManagerTransfer({ id }: { id: number }) {
  return <TransferView id={id} viewer={{ role: "manager" }} />;
}

export default function ManagerTransferPage({ params }: PageProps<"/manager/transfer/[id]">) {
  return <TransferPage params={params} view={ManagerTransfer} />;
}
