import { formatDrug } from "@/lib/head/format";
import type { Pharmacy, TransferDetail } from "@/lib/head/types";
import { tripStatuses } from "@/lib/logist/format";
import { Badge } from "@/components/head/ui";

export function TripStatus({ status }: { status: TransferDetail["status"] }) {
  const view = tripStatuses[status];
  return <Badge tone={view.tone}>{view.label}</Badge>;
}

export function DrugLine({ trip }: { trip: TransferDetail }) {
  const drug = trip.donorStock.drug;
  return (
    <div className="min-w-0">
      <p className="font-semibold">{drug.name}</p>
      <p className="text-sm text-[#475569]">
        <span className="tabular-nums">{drug.sku}</span> · {formatDrug(drug)} ·{" "}
        <b className="tabular-nums text-[#0f172a]">{trip.quantity} {drug.unit}</b>
      </p>
    </div>
  );
}

function Stop({ label, pharmacy, color }: { label: string; pharmacy: Pharmacy; color: string }) {
  return (
    <div className="flex gap-3">
      <span className="flex flex-col items-center pt-1" aria-hidden="true">
        <span className={"size-3 rounded-full " + color} />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[#64748b]">{label}</p>
        <p className="font-medium">{pharmacy.name}</p>
        <p className="text-sm text-[#475569]">{pharmacy.address}, {pharmacy.city}</p>
      </div>
    </div>
  );
}

export function RouteStops({ trip }: { trip: TransferDetail }) {
  return (
    <div className="space-y-3">
      <Stop label="Звідки · донор" pharmacy={trip.donorStock.pharmacy} color="bg-[#0f766e]" />
      <Stop label="Куди · реципієнт" pharmacy={trip.recipientStock.pharmacy} color="bg-[#b91c1c]" />
    </div>
  );
}
