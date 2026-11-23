"use client";

import { useEffect, useRef, useState } from "react";
import type { LatLngTuple, Map as LeafletMap } from "leaflet";
import type { TransferDetail } from "@/lib/head/types";
import type { TransferRoute } from "@/lib/logist/api";
import "leaflet/dist/leaflet.css";

type RouteLine = Extract<TransferRoute, { status: "ready" }>["coordinates"];

export function RouteMap({ trip, line }: { trip: TransferDetail; line?: RouteLine }) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const donor = trip.donorStock.pharmacy;
  const recipient = trip.recipientStock.pharmacy;

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let disposed = false;
    let map: LeafletMap | undefined;
    let resize: ResizeObserver | undefined;

    void import("leaflet").then(L => {
      if (disposed) return;
      const points: LatLngTuple[] = [
        [Number(donor.latitude), Number(donor.longitude)],
        [Number(recipient.latitude), Number(recipient.longitude)],
      ];
      if (points.some(([lat, lng]) => !Number.isFinite(lat) || !Number.isFinite(lng) ||
        Math.abs(lat) > 90 || Math.abs(lng) > 180)) {
        setFailed(true);
        return;
      }

      map = L.map(element, { scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        referrerPolicy: "strict-origin-when-cross-origin",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      }).addTo(map);

      const path = line?.map(([lng, lat]): LatLngTuple => [lat, lng]) ?? [];
      if (path.length) {
        L.polyline(path, { color: "#fff", weight: 8, interactive: false }).addTo(map);
        L.polyline(path, { color: "#0f766e", weight: 5, interactive: false }).addTo(map);
      }

      for (const [index, pharmacy] of [donor, recipient].entries()) {
        const label = index === 0 ? "A" : "B";
        const color = index === 0 ? "#0f766e" : "#b91c1c";
        const icon = L.divIcon({
          className: "",
          iconSize: [28, 28], iconAnchor: [14, 14],
          html: `<span class="grid size-7 place-items-center rounded-full border-2 border-white font-bold text-white shadow" style="background-color:${color}">${label}</span>`,
        });
        const name = (index === 0 ? "Донор · " : "Отримувач · ") + pharmacy.name;
        const popup = document.createElement("span");
        popup.textContent = name;
        L.marker(points[index], { icon, title: name }).addTo(map).bindPopup(popup);
      }

      map.fitBounds([...points, ...path], { padding: [30, 30], maxZoom: 17, animate: false });
      resize = new ResizeObserver(() => map?.invalidateSize({ pan: false }));
      resize.observe(element);
    }).catch(() => {
      if (!disposed) setFailed(true);
    });

    return () => {
      disposed = true;
      resize?.disconnect();
      map?.remove();
    };
  }, [donor, recipient, line]);

  return (
    <div className="relative isolate overflow-hidden rounded-lg border border-[#e2e8e5] bg-[#f1f5f3]">
      <div ref={container} className="h-64 w-full sm:h-80" role="region" aria-label="Карта маршруту між аптеками" />
      {failed && <p role="status" className="absolute inset-0 grid place-items-center bg-[#f1f5f3] p-4 text-center text-sm text-[#475569]">Не вдалося завантажити карту.</p>}
    </div>
  );
}
