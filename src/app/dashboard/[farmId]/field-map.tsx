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

export default function FieldMap({ polygon }: { polygon: GeoPolygon }) {
  const positions = (polygon.coordinates[0] ?? []).map(
    ([lon, lat]) => [lat, lon] as [number, number],
  );
  const center = positions[0] ?? [0, 0];

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
      <Polygon
        positions={positions}
        pathOptions={{ color: "#fbbf24", weight: 3, fillColor: "#f59e0b", fillOpacity: 0.28 }}
      />
      <Fit positions={positions} />
    </MapView>
  );
}

function Fit({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) map.fitBounds(positions, { padding: [28, 28] });
  }, [map, positions]);
  return null;
}
