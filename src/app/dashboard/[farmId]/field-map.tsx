"use client";

import { useEffect, type ReactElement, type ReactNode } from "react";
import { MapContainer, Polygon, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { GeoPolygon } from "@/lib/types";

// Leaflet ships without TypeScript types in this install. The runtime props are the documented ones.
const MapView = MapContainer as unknown as (props: {
  center: [number, number];
  zoom: number;
  scrollWheelZoom: boolean;
  className: string;
  style: { height: string; width: string };
  children: ReactNode;
}) => ReactElement;
const Imagery = TileLayer as unknown as (props: {
  url: string;
  attribution: string;
}) => ReactElement;

const ESRI_IMAGERY =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export type FootprintCell = {
  id: string;
  polygon: GeoPolygon;
  pctChange: number | null;
};

export default function FieldMap({
  polygon,
  footprint = [],
}: {
  polygon: GeoPolygon;
  footprint?: FootprintCell[];
}) {
  const positions = ringLatLng(polygon);
  const center = positions[0] ?? [0, 0];
  const fit = footprint.length > 0 ? footprint.flatMap((cell) => ringLatLng(cell.polygon)) : positions;

  return (
    <MapView
      center={center}
      zoom={15}
      scrollWheelZoom={false}
      className="z-0 w-full"
      style={{ height: "320px", width: "100%" }}
    >
      <Imagery
        url={ESRI_IMAGERY}
        attribution="Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
      />
      {footprint.map((cell) => (
        <Polygon
          key={cell.id}
          positions={ringLatLng(cell.polygon)}
          pathOptions={{
            color: droughtColor(cell.pctChange),
            weight: 1,
            fillColor: droughtColor(cell.pctChange),
            fillOpacity: cell.pctChange === null ? 0.25 : 0.55,
          }}
        />
      ))}
      <Polygon
        positions={positions}
        pathOptions={{ color: "#fbbf24", weight: 3, fillColor: "#fbbf24", fillOpacity: 0.12 }}
      />
      <Fit positions={fit} />
    </MapView>
  );
}

function ringLatLng(polygon: GeoPolygon): [number, number][] {
  return (polygon.coordinates[0] ?? []).map(([lon, lat]) => [lat, lon]);
}

function droughtColor(pct: number | null): string {
  if (pct === null) return "#64748b";
  if (pct <= -30) return "#dc2626";
  if (pct <= -15) return "#f97316";
  if (pct <= -5) return "#facc15";
  if (pct < 5) return "#a3a3a3";
  return "#16a34a";
}

function Fit({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) map.fitBounds(positions, { padding: [28, 28] });
  }, [map, positions]);
  return null;
}
