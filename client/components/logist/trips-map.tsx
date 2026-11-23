"use client";

import { useEffect, useRef, useState } from "react";
import type { LatLngTuple, Map as LeafletMap } from "leaflet";
import type { TransferDetail } from "@/lib/head/types";
import type { TransferRoute } from "@/lib/logist/api";
import "leaflet/dist/leaflet.css";

type RouteLine = Extract<TransferRoute, { status: "ready" }>["coordinates"];

function point(latitude: string, longitude: string): LatLngTuple | null {
  const result: LatLngTuple = [Number(latitude), Number(longitude)];
  return result.every(Number.isFinite) && Math.abs(result[0]) <= 90 && Math.abs(result[1]) <= 180 ? result : null;
}

function label(text: string) {
  const element = document.createElement("span");
  element.textContent = text;
  return element;
}

export function TripsMap({ trips, selectedId, line, onSelect }: {
  trips: TransferDetail[];
  selectedId: number | null;
  line?: RouteLine;
  onSelect: (id: number) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let disposed = false;
    let map: LeafletMap | undefined;
    let resize: ResizeObserver | undefined;

    void import("leaflet").then(L => {
      if (disposed) return;
      const instance = L.map(element, { scrollWheelZoom: true });
      map = instance;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        referrerPolicy: "strict-origin-when-cross-origin",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      }).addTo(instance);

      const roles = new Map<number, { place: LatLngTuple; name: string; donor: boolean; recipient: boolean }>();
      const focus: LatLngTuple[] = [];
      const all: LatLngTuple[] = [];
      for (const trip of trips) {
        const from = point(trip.donorStock.pharmacy.latitude, trip.donorStock.pharmacy.longitude);
        const to = point(trip.recipientStock.pharmacy.latitude, trip.recipientStock.pharmacy.longitude);
        if (!from || !to) continue;
        all.push(from, to);
        for (const [pharmacy, place, key] of [[trip.donorStock.pharmacy, from, "donor"], [trip.recipientStock.pharmacy, to, "recipient"]] as const) {
          const entry = roles.get(pharmacy.pharmacyId) ?? { place, name: pharmacy.name, donor: false, recipient: false };
          entry[key] = true;
          roles.set(pharmacy.pharmacyId, entry);
        }
        const selected = trip.recommendationId === selectedId;
        if (selected) focus.push(from, to);
        const color = trip.status === "IN_PROGRESS" ? "#d97706" : "#2563eb";
        const tip = label("№" + trip.recommendationId + " · " + trip.donorStock.drug.name + " · " + trip.quantity + " " + trip.donorStock.drug.unit);
        if (selected && line?.length) continue;
        L.polyline([from, to], { color, weight: selected ? 5 : 3, opacity: selected ? 0.95 : 0.6, dashArray: selected ? undefined : "8 8" })
          .addTo(instance).bindTooltip(tip, { sticky: true }).on("click", () => onSelect(trip.recommendationId));
      }
      if (line?.length) {
        const path = line.map(([lng, lat]): LatLngTuple => [lat, lng]);
        L.polyline(path, { color: "#fff", weight: 9, interactive: false }).addTo(instance);
        L.polyline(path, { color: "#0f766e", weight: 5, interactive: false }).addTo(instance);
        focus.push(...path);
      }
      for (const entry of roles.values()) {
        const color = entry.donor && entry.recipient ? "#d97706" : entry.donor ? "#0f766e" : "#b91c1c";
        const role = entry.donor && entry.recipient ? "Донор і отримувач" : entry.donor ? "Донор" : "Отримувач";
        L.marker(entry.place, {
          title: entry.name,
          icon: L.divIcon({
            className: "", iconSize: [24, 24], iconAnchor: [12, 12],
            html: '<span class="block size-6 rounded-full border-2 border-white shadow" style="background:' + color + '"></span>',
          }),
        }).addTo(instance).bindTooltip(label(role + " · " + entry.name), { direction: "top" });
      }
      const target = focus.length ? focus : all;
      if (target.length) instance.fitBounds(target, { padding: [30, 30], maxZoom: 15, animate: false });
      else instance.setView([48.5, 31.2], 6);
      resize = new ResizeObserver(() => instance.invalidateSize({ pan: false }));
      resize.observe(element);
    }).catch(() => { if (!disposed) setFailed(true); });

    return () => {
      disposed = true;
      resize?.disconnect();
      map?.remove();
    };
  }, [trips, selectedId, line, onSelect]);

  return (
    <div className="space-y-2">
      <div className="relative isolate overflow-hidden rounded-lg border border-[#e2e8e5] bg-[#f1f5f3]">
        <div ref={container} role="region" aria-label="Карта рейсів" className="h-80 w-full lg:h-[32rem]" />
        {failed && <p className="absolute inset-0 z-[1000] grid place-items-center bg-[#f1f5f3] p-3 text-sm">Не вдалося завантажити карту.</p>}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#475569]">
        <li className="inline-flex items-center gap-1.5"><span className="size-3 rounded-full bg-[#0f766e]" />Донор</li>
        <li className="inline-flex items-center gap-1.5"><span className="size-3 rounded-full bg-[#b91c1c]" />Отримувач</li>
        <li className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 bg-[#2563eb]" />Очікує відправлення</li>
        <li className="inline-flex items-center gap-1.5"><span className="h-0.5 w-5 bg-[#d97706]" />В дорозі</li>
      </ul>
    </div>
  );
}
