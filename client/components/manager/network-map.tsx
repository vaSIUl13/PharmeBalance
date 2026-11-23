"use client";

import { useEffect, useRef, useState } from "react";
import type { LatLngTuple, Map as LeafletMap } from "leaflet";
import type { ForecastItem, Pharmacy, TransferDetail, TransferStatus } from "@/lib/head/types";
import "leaflet/dist/leaflet.css";

export type MapPharmacy = Pharmacy & { latitude: string; longitude: string };

const lineColors: Partial<Record<TransferStatus, string>> = { CREATED: "#64748b", CONFIRMED: "#2563eb", IN_PROGRESS: "#d97706" };

function point(latitude: string, longitude: string): LatLngTuple | null {
  const result: LatLngTuple = [Number(latitude), Number(longitude)];
  return result.every(Number.isFinite) && Math.abs(result[0]) <= 90 && Math.abs(result[1]) <= 180 ? result : null;
}

function text(parts: (string | null | undefined)[]) {
  const element = document.createElement("span");
  element.textContent = parts.filter(Boolean).join(" · ");
  return element;
}

export function NetworkMap({ pharmacies, risks, surpluses, trips, heightClass = "h-80 sm:h-[26rem]" }: {
  pharmacies: MapPharmacy[];
  risks: ForecastItem[];
  surpluses: ForecastItem[];
  trips: TransferDetail[];
  heightClass?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let disposed = false;
    let map: LeafletMap | undefined;

    void import("leaflet").then(L => {
      if (disposed) return;
      const instance = L.map(element, { scrollWheelZoom: true }).setView([48.5, 31.2], 6);
      map = instance;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        referrerPolicy: "strict-origin-when-cross-origin",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      }).addTo(instance);

      const shortage = new Map<number, number>();
      for (const item of risks) {
        if (item.risk?.positionType === "SHORTAGE") shortage.set(item.stock.pharmacyId, (shortage.get(item.stock.pharmacyId) ?? 0) + 1);
      }
      const surplus = new Map<number, number>();
      for (const item of surpluses) surplus.set(item.stock.pharmacyId, (surplus.get(item.stock.pharmacyId) ?? 0) + 1);

      const bounds: LatLngTuple[] = [];
      for (const trip of trips) {
        const color = lineColors[trip.status];
        if (!color) continue;
        const from = point(trip.donorStock.pharmacy.latitude, trip.donorStock.pharmacy.longitude);
        const to = point(trip.recipientStock.pharmacy.latitude, trip.recipientStock.pharmacy.longitude);
        if (!from || !to) continue;
        L.polyline([from, to], { color, weight: 3, opacity: 0.8, dashArray: "8 8" }).addTo(instance)
          .bindTooltip(text([trip.donorStock.drug.name, trip.quantity + " " + trip.donorStock.drug.unit,
            trip.donorStock.pharmacy.name + " → " + trip.recipientStock.pharmacy.name]), { sticky: true });
      }
      for (const item of pharmacies) {
        const place = point(item.latitude, item.longitude);
        if (!place) continue;
        bounds.push(place);
        const shortages = shortage.get(item.pharmacyId) ?? 0;
        const surplusCount = surplus.get(item.pharmacyId) ?? 0;
        const color = !item.isActive ? "#94a3b8" : shortages > 0 ? "#b91c1c" : surplusCount > 0 ? "#0369a1" : "#0f766e";
        L.marker(place, {
          title: item.name,
          icon: L.divIcon({
            className: "", iconSize: [24, 24], iconAnchor: [12, 12],
            html: '<span class="block size-6 rounded-full border-2 border-white shadow" style="background:' + color + '"></span>',
          }),
        }).addTo(instance).bindTooltip(text([item.name, item.city, item.address,
          shortages ? "Ризиків дефіциту: " + shortages : null, surplusCount ? "Позицій із надлишком: " + surplusCount : null]), { direction: "top" });
      }
      if (bounds.length) instance.fitBounds(bounds, { padding: [30, 30], maxZoom: 12, animate: false });
    }).catch(() => { if (!disposed) setFailed(true); });

    return () => {
      disposed = true;
      map?.remove();
    };
  }, [pharmacies, risks, surpluses, trips]);

  return (
    <div className="space-y-2">
      <div className="relative isolate overflow-hidden rounded-lg border border-[#e2e8e5] bg-[#f1f5f3]">
        <div ref={container} role="region" aria-label="Карта мережі" className={"w-full " + heightClass} />
        {failed && <p className="absolute inset-0 z-[1000] grid place-items-center bg-[#f1f5f3] p-3 text-sm">Карта недоступна.</p>}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#475569]">
        <li className="inline-flex items-center gap-1.5"><span className="size-3 rounded-full bg-[#b91c1c]" />Є ризик дефіциту</li>
        <li className="inline-flex items-center gap-1.5"><span className="size-3 rounded-full bg-[#0369a1]" />Є надлишок</li>
        <li className="inline-flex items-center gap-1.5"><span className="size-3 rounded-full bg-[#0f766e]" />Норма</li>
        <li className="inline-flex items-center gap-1.5"><span className="size-3 rounded-full bg-[#94a3b8]" />Неактивна</li>
        <li className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 bg-[#2563eb]" />Рейс підтверджено</li>
        <li className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 bg-[#d97706]" />У дорозі</li>
      </ul>
    </div>
  );
}
