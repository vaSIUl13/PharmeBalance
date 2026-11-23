"use client";

import { useEffect, useRef, useState } from "react";
import type { LayerGroup, LatLngTuple, Map as LeafletMap } from "leaflet";
import { loadExternalInBox } from "@/lib/admin/api";
import type { AdminPharmacy } from "@/lib/admin/types";
import "leaflet/dist/leaflet.css";

const catalogMinZoom = 10;

type Status =
  | { kind: "zoom" }
  | { kind: "loading" }
  | { kind: "ready"; count: number; truncated: boolean }
  | { kind: "error" };

function coordinates(latitude: string | null, longitude: string | null): LatLngTuple | null {
  if (!latitude?.trim() || !longitude?.trim()) return null;
  const point: LatLngTuple = [Number(latitude), Number(longitude)];
  return point.every(Number.isFinite) && Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180 ? point : null;
}

function label(parts: (string | null | undefined)[]) {
  const element = document.createElement("span");
  element.textContent = parts.filter(Boolean).join(" · ");
  return element;
}

export function NetworkMap({ pharmacies }: { pharmacies: AdminPharmacy[] }) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "zoom" });

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let disposed = false;
    let map: LeafletMap | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request = 0;

    void import("leaflet").then(L => {
      if (disposed) return;
      const instance = L.map(element, { scrollWheelZoom: true }).setView([48.5, 31.2], 6);
      map = instance;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        referrerPolicy: "strict-origin-when-cross-origin",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      }).addTo(instance);

      const catalog: LayerGroup = L.layerGroup().addTo(instance);
      const managed: LayerGroup = L.layerGroup().addTo(instance);
      const points: LatLngTuple[] = [];
      for (const item of pharmacies) {
        const point = coordinates(item.latitude, item.longitude);
        if (!point) continue;
        points.push(point);
        L.marker(point, {
          title: item.name,
          icon: L.divIcon({
            className: "",
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            html: '<span class="block size-6 rounded-full border-2 border-white shadow ' +
              (item.isActive ? "bg-[#0f766e]" : "bg-[#d97706]") + '"></span>',
          }),
        }).addTo(managed).bindTooltip(label([item.name, item.code, item.address, item.isActive ? "Активна" : "Неактивна"]), { direction: "top" });
      }
      if (points.length) instance.fitBounds(points, { padding: [30, 30], maxZoom: 12, animate: false });

      async function refresh() {
        if (disposed) return;
        if (instance.getZoom() < catalogMinZoom) {
          request += 1;
          catalog.clearLayers();
          setStatus({ kind: "zoom" });
          return;
        }
        const bounds = instance.getBounds();
        const current = ++request;
        setStatus({ kind: "loading" });
        try {
          const page = await loadExternalInBox({
            south: bounds.getSouth(), west: bounds.getWest(), north: bounds.getNorth(), east: bounds.getEast(),
          });
          if (disposed || current !== request) return;
          catalog.clearLayers();
          let shown = 0;
          for (const item of page.items) {
            if (item.pharmacyId !== null) continue;
            const point = coordinates(item.latitude, item.longitude);
            if (!point) continue;
            shown += 1;
            L.circleMarker(point, { radius: 6, color: "#ffffff", weight: 1.5, fillColor: "#475569", fillOpacity: 0.9 })
              .addTo(catalog).bindTooltip(label([item.name, item.city, item.address]), { direction: "top" });
          }
          setStatus({ kind: "ready", count: shown, truncated: page.truncated });
        } catch {
          if (!disposed && current === request) setStatus({ kind: "error" });
        }
      }

      instance.on("moveend", () => {
        clearTimeout(timer);
        timer = setTimeout(() => void refresh(), 350);
      });
      void refresh();
    }).catch(() => { if (!disposed) setFailed(true); });

    return () => {
      disposed = true;
      clearTimeout(timer);
      map?.remove();
    };
  }, [pharmacies]);

  const note =
    status.kind === "zoom" ? "Наблизьте карту, щоб побачити аптеки з довідника OpenStreetMap."
    : status.kind === "loading" ? "Завантаження аптек довідника…"
    : status.kind === "error" ? "Не вдалося завантажити довідник на карту. Перемістіть карту, щоб спробувати ще раз."
    : status.truncated ? "Показано " + status.count + " аптек довідника. Наблизьте карту, щоб побачити решту."
    : "Аптек довідника в зоні: " + status.count + ".";

  return (
    <div className="space-y-2">
      <div className="relative isolate overflow-hidden rounded-lg border border-[#e2e8e5] bg-[#f1f5f3]">
        <div ref={container} role="region" aria-label="Карта аптек України" className="h-80 w-full sm:h-[26rem]" />
        {failed && <p className="absolute inset-0 z-[1000] grid place-items-center bg-[#f1f5f3] p-3 text-sm">Карта недоступна.</p>}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#475569]">
        <span className="inline-flex items-center gap-1"><span className="size-3 rounded-full bg-[#0f766e]" />Активна аптека мережі</span>
        <span className="inline-flex items-center gap-1"><span className="size-3 rounded-full bg-[#d97706]" />Неактивна</span>
        <span className="inline-flex items-center gap-1"><span className="size-3 rounded-full bg-[#475569]" />Довідник OSM</span>
        <span role="status" className="ml-auto">{note}</span>
      </div>
    </div>
  );
}
