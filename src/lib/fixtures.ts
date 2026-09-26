/**
 * Local stand-in until Supabase has the seeded farm and diagnosis.
 * cn-rice-2022 derived values are copied from farm.json (real Sentinel-2 and NASA POWER).
 * A fixture with placeholder: true is not a measurement.
 */
import type { Diagnosis, Farm } from "./types";

export const FIXTURE_FLAG = "FAKE" as const;

export type FixtureFarm = Farm & {
  diagnosis: Diagnosis;
  lastObsDate: string;
  placeholder: boolean;
};

const fakeSources = [
  {
    name: "FAKE placeholder — not a Sentinel-2 fetch",
    url: "https://dataspace.copernicus.eu/",
  },
  {
    name: "FAKE placeholder — not a NASA POWER fetch",
    url: "https://power.larc.nasa.gov/",
  },
];

export const FIXTURES: Record<string, FixtureFarm> = {
  "cn-rice-2022": {
    profile: {
      id: "cn-rice-2022",
      farmerName: "张师傅",
      farmerNameEn: "Master Zhang",
      fictional: true,
      village: "Rice cluster in Sichuan / Chongqing / Jiangxi",
      region: "Sichuan / Chongqing / Jiangxi",
      country: "China",
      lat: 28.79719,
      lon: 116.72302,
      crop: "Mid-season rice",
      languages: ["zh", "en"],
      event: {
        name: "2022 Yangtze basin drought + heatwave",
        summary:
          "Replay of the 2022 Yangtze basin drought and heatwave during the mid-season rice window. Satellite and weather data are real; the farmer is fictional.",
      },
    },
    polygon: {
      type: "Polygon",
      coordinates: [
        [
          [116.71982288360597, 28.801322379962905],
          [116.71875, 28.800683067065854],
          [116.72394275665285, 28.792484471742636],
          [116.7272472381592, 28.79417689515362],
          [116.72291278839113, 28.80072067381543],
          [116.72209739685059, 28.800683067065854],
          [116.72115325927736, 28.801623231733885],
          [116.71982288360597, 28.801322379962905],
        ],
      ],
    },
    simulatedToday: "2022-08-25",
    baselineYear: 2021,
    lastObsDate: "2022-08-25",
    placeholder: false,
    ndvi: {
      event: [{ date: "2022-08-25", mean: 0.6085, stdev: null, validPixelPct: 100 }],
      baseline: [{ date: "2021-08-25", mean: 0.8994, stdev: null, validPixelPct: 100 }],
    },
    weather: [
      {
        date: "2022-08-25",
        precipMm: null,
        tMaxC: null,
        tMeanC: null,
        rootZoneWetness: 0.71,
      },
    ],
    derived: {
      ndviNow: 0.6085,
      ndvi30dAgo: 0.7701,
      ndviSameDateBaseline: 0.8994,
      pctChange30d: -21,
      pctChangeVsBaseline: -32.3,
      rain30dMm: 21.6,
      rain30dMmBaseline: 261.8,
      rainWindowMm: 666.6,
      rainWindowMmBaseline: 933,
      heatDays35C_30d: 3,
      rootZoneWetnessNow: 0.71,
      rootZoneWetnessBaseline: 0.92,
    },
    sources: [
      { name: "Sentinel-2 L2A", url: "https://dataspace.copernicus.eu/" },
      { name: "NASA POWER", url: "https://power.larc.nasa.gov/" },
    ],
    diagnosis: {
      status: "water_stress",
      severity: 3,
      evidence: [
        {
          zh: "卫星看到的绿度现在是 0.6085，大约 30 天前是 0.7701，少了大约 21%。",
          en: "Satellite greenness is 0.6085 now, versus 0.7701 about 30 days ago, about 21% less.",
        },
        {
          zh: "和 2021 年同一时间的 0.8994 比，绿度大约少 32%。",
          en: "Greenness is about 32% lower than 0.8994 at the same time in 2021.",
        },
        {
          zh: "近 30 天降雨 21.6 毫米，2021 年同期 261.8 毫米。近 30 天有 3 天最高气温达到 35°C。根区湿度现在是 0.71，2021 年是 0.92。",
          en: "Rain over the last 30 days is 21.6 mm, versus 261.8 mm in 2021. Three of the last 30 days reached 35°C. Root-zone wetness is 0.71 now, versus 0.92 in 2021.",
        },
      ],
      summary: {
        zh: "这块田比一个月前更少绿，也比 2021 年同一时间更少绿。近 30 天的雨少了很多。这主要是缺水。热天不多，只有 3 天达到 35°C。",
        en: "This field is less green than a month ago and less green than the same time in 2021. Rain over the last 30 days is far below that year. The main stress is water. Only three days reached 35°C.",
      },
      actions: [
        {
          topic: "irrigation_timing",
          text: {
            zh: "如果还有水，尽量在清晨给田里补一层浅水，避开最热的中午。先确认沟渠还能进水。",
            en: "If water is still available, add a shallow layer in the early morning rather than at midday. Check that the channel can still reach the field.",
          },
        },
        {
          topic: "prioritize_flowering_fields",
          text: {
            zh: "水不够时，先浇正在抽穗开花的田，再顾其他田。",
            en: "If water is short, water the plots that are flowering first, then the others.",
          },
        },
        {
          topic: "heat_stress_foliar_spray",
          text: {
            zh: "高温午后不要喷叶面。若当地农技站建议叶面补充，放在傍晚，并按他们的用量。",
            en: "Do not spray leaves in the hottest part of the day. If the local station suggests a foliar spray, do it in the evening and follow their rate.",
          },
        },
      ],
      caveats: {
        zh: "以上是一般性建议。请向当地农技站确认后再做决定。",
        en: "This is general guidance. Confirm with your local agricultural extension station before you act.",
      },
    },
  },
};

export function getFixture(farmId: string): FixtureFarm | undefined {
  return FIXTURES[farmId];
}
