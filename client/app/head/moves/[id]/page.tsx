import { HeadTransferDetail } from "@/components/head/transfer-detail";
import { TransferPage } from "@/components/ui/transfer-page";

export default function HeadTransferPage({ params }: PageProps<"/head/moves/[id]">) {
  return <TransferPage params={params} view={HeadTransferDetail} />;
}
