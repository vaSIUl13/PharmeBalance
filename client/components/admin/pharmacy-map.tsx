"use client";

import { useEffect, useRef, useState } from "react";
import type { LatLngTuple, Map as LeafletMap } from "leaflet";
import type { ExternalPharmacy } from "@/lib/admin/types";
import "leaflet/dist/leaflet.css";

export function PharmacyMap({ items, onSelect }: {
  items: ExternalPharmacy[];
  onSelect: (item: ExternalPharmacy) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let disposed = false;
    let map: LeafletMap | undefined;
    let pinchDelta = 0;
    function zoomPinch(event: WheelEvent) {
      if (!event.ctrlKey || !map) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      pinchDelta += event.deltaY;
      if (Math.abs(pinchDelta) < 20) return;
      const position = map.mouseEventToContainerPoint(event);
      map.setZoomAround(position, map.getZoom() + (pinchDelta < 0 ? 1 : -1), { animate: false });
      pinchDelta = 0;
    }
    void import("leaflet").then(L => {
      if (disposed) return;
      map = L.map(element, { scrollWheelZoom: true, touchZoom: true }).setView([48.5, 31.2], 5);
      element.addEventListener("wheel", zoomPinch, { passive: false, capture: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        referrerPolicy: "strict-origin-when-cross-origin",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      }).addTo(map);
      const points: LatLngTuple[] = [];
      for (const item of items) {
        if (!item.latitude?.trim() || !item.longitude?.trim()) continue;
        const point: LatLngTuple = [Number(item.latitude), Number(item.longitude)];
        if (!point.every(Number.isFinite) || Math.abs(point[0]) > 90 || Math.abs(point[1]) > 180) continue;
        points.push(point);
        const linked = item.pharmacyId !== null;
        const name = item.name ?? "Аптека без назви";
        const label = document.createElement("span");
        label.textContent = [name, item.address, linked ? "Вже в мережі" : null].filter(Boolean).join(" · ");
        const marker = L.marker(point, {
          title: name,
          icon: L.divIcon({
            className: "",
            iconSize: [22, 22],
            iconAnchor: [11, 11],
            html: '<span class="block size-[22px] rounded-full border-2 border-white shadow ' +
              (linked ? 'bg-[#64748b]' : 'bg-[#0f766e]') + '"></span>',
          }),
        }).addTo(map).bindTooltip(label, { direction: "top" });
        if (!linked) marker.on("click", () => onSelect(item));
      }
      if (points.length) map.fitBounds(points, { padding: [26, 26], maxZoom: 16, animate: false });
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => {
      disposed = true;
      element.removeEventListener("wheel", zoomPinch, true);
      map?.remove();
    };
  }, [items, onSelect]);

  return (
    <div className="relative isolate overflow-hidden rounded-lg border border-[#e2e8e5] bg-[#f1f5f3]">
      <div ref={container} role="region" aria-label="Карта аптек" className="h-56 w-full sm:h-64" />
      {failed && <p className="absolute inset-0 z-[1000] grid place-items-center bg-[#f1f5f3] p-3 text-sm">
        Карта недоступна. Виберіть аптеку зі списку.
      </p>}
    </div>
  );
}
