/** Shared farm and diagnosis shapes. farm.json and diagnosis.json use these. */

export type Lang = "zh" | "en";

/** Text for the languages that farm supports. Farm B is English only. */
export type LocalizedText = Partial<Record<Lang, string>>;

export type GeoPolygon = {
  type: "Polygon";
  coordinates: number[][][];
};

export type FarmProfile = {
  id: string;
  farmerName: string;
  farmerNameEn: string;
  fictional: true;
  village: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
  crop: string;
  languages: Lang[];
  event: { name: string; summary: string };
};

export type NdviPoint = {
  date: string;
  mean: number;
  stdev: number | null;
  validPixelPct: number;
};

export type WeatherPoint = {
  date: string;
  precipMm: number | null;
  tMaxC: number | null;
  tMeanC: number | null;
  rootZoneWetness: number | null;
};

export type FarmDerived = {
  ndviNow: number;
  ndvi30dAgo: number;
  ndviSameDateBaseline: number;
  pctChange30d: number;
  pctChangeVsBaseline: number;
  rain30dMm: number;
  rain30dMmBaseline: number;
  rainWindowMm: number;
  rainWindowMmBaseline: number;
  heatDays35C_30d: number;
  rootZoneWetnessNow: number;
  rootZoneWetnessBaseline: number;
};

export type Farm = {
  profile: FarmProfile;
  polygon: GeoPolygon;
  simulatedToday: string;
  baselineYear: number;
  ndvi: { event: NdviPoint[]; baseline: NdviPoint[] };
  weather: WeatherPoint[];
  derived: FarmDerived;
  sources: { name: string; url: string }[];
};

export type Diagnosis = {
  status:
    | "healthy"
    | "water_stress"
    | "heat_stress"
    | "water_and_heat_stress"
    | "unclear";
  severity: 1 | 2 | 3;
  evidence: LocalizedText[];
  summary: LocalizedText;
  actions: { topic: string; text: LocalizedText }[];
  caveats: LocalizedText;
};
