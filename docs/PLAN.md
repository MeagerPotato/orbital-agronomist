# Orbital Agronomist: Build Plan

This is the single source of truth for building this project. The agent (Cursor, Grok 4.7) should read this whole file before starting, then execute **one phase at a time**, stopping at the end of each phase for the human (Allen) to verify.

---

## 0. Rules for the agent

- **Deadline:** Saturday 10:00 PM ET (Devpost submission with GitHub repo + demo video). Live expo demo Sunday morning.
- **Judging priorities, in order:** built with Cursor (heavy, visible use), meaningful use of Grok Voice and Grok Imagine APIs, real space data, real-world impact, demo quality.
- Work phase by phase. Each phase ends with **acceptance criteria**. Do not start the next phase until the current one passes. Stop and report when a phase is done.
- Commit after every task with a clear message (`feat: ...`, `fix: ...`, `data: ...`, `docs: ...`).
- After every task, append one line to `docs/CURSOR_LOG.md`: timestamp, what was built, which Cursor feature was used (Agent, Tab, inline edit, rules, background agent, etc.). This is submission evidence.
- **Never expose `XAI_API_KEY` or `SUPABASE_SECRET_KEY` to the browser.** The browser gets an xAI ephemeral token and the Supabase publishable key only. All privileged calls go through Next.js API routes.
- Everything is **config-driven by farm**. No farm-specific logic in components. Adding a farm = adding an entry to `data/farms.config.json` and rerunning scripts.
- Do not add dependencies beyond Section 3 without asking.
- When unsure about an xAI API detail, check https://docs.x.ai (append `.md` to any docs URL for markdown) instead of guessing. Log unknown server event types to the console in dev mode to confirm names.
- Everything user-facing must be honest: farmers are fictional, satellite and weather data are real, and each scenario is a replay of a real past event.

---

## 1. Product summary

**Orbital Agronomist** is a voice hotline that lets smallholder farmers ask what satellites see on their field, in their own language, with no smartphone literacy required.

1. A farmer calls from their phone (browser voice call on the phone for the hackathon; real phone line is the production path).
2. A Grok Voice agent greets them by name in their language, pulls their field's satellite health (Sentinel-2 NDVI) and weather (NASA POWER), and explains what is happening and what to do.
3. After the call, the farmer receives a short illustrated guidance clip (Grok Imagine video + Grok TTS narration in their language).
4. A separate judge-facing dashboard, on another screen, updates live over Supabase Realtime: field map, NDVI vs baseline year, rainfall, the diagnosis, the live call transcript, tool calls, and the clip being sent.

**Why it matters:** hundreds of millions of smallholder farms produce a large share of the world's food, and most of their operators have no access to the satellite analytics large farms use. Voice is the interface that reaches them. Two farms on two continents in two languages show it generalizes.

---

## 2. Demo scenarios (2 farms, 2 real events)

| | Farm A | Farm B |
|---|---|---|
| id | `cn-rice-2022` | `ke-maize-2022` |
| Event | 2022 Yangtze basin drought + heatwave | 2022 Horn of Africa drought (failed March–May long rains) |
| Where | Rice cluster in Sichuan / Chongqing / Jiangxi | Smallholder maize plots in Machakos / Makueni / Kitui, eastern Kenya |
| Crop | Mid-season rice | Maize (with beans) |
| Fictional farmer | 张师傅 (Master Zhang) | Mary Mutua |
| Languages | `zh` primary, `en` toggle | `en` |
| Analysis window | 2022-06-01 → 2022-09-30 | 2022-02-01 → 2022-06-30 |
| Baseline year | 2021 (same window) | 2020 (same window, a good-rains year) |
| Simulated "today" | Last cloud-free obs in mid/late Aug 2022 | Last cloud-free obs in late Apr / May 2022 |
| Clip topics | `irrigation_timing`, `prioritize_flowering_fields`, `heat_stress_foliar_spray` | `mulching_soil_moisture`, `zai_pits_water_harvesting`, `drought_tolerant_varieties` |

Allen picks both polygons in Copernicus Browser (Section 5, Phase 1) where NDVI visibly drops vs the baseline year.

**Call flow (both farms):** scripted greeting → farmer asks what is wrong → agent reports greenness change vs last month and vs baseline year, rainfall deficit, heat → 2–3 actions → offers a video → call ends → clip arrives on the phone and appears on the dashboard.

---

## 3. Tech stack and repo layout

- Next.js 15 (App Router) + TypeScript + Tailwind CSS
- `@supabase/supabase-js` (DB, Storage, Realtime)
- `recharts` (charts), `react-leaflet` + `leaflet` (map), `qrcode.react` (QR to open the call page on a phone)
- `tsx` + `dotenv` for scripts
- Deploy: Vercel (GitHub integration). Mic access on phones requires HTTPS, which Vercel provides.

```
/
├─ .cursor/rules/project.mdc
├─ docs/  PLAN.md · CURSOR_LOG.md · DEVPOST.md · DEMO_SCRIPT.md
├─ supabase/migrations/0001_init.sql
├─ data/
│  ├─ farms.config.json             # per-farm config (Section 2)
│  └─ farms/{farmId}/
│     ├─ field.geojson              # polygon Allen draws
│     ├─ farm.json                  # built by scripts
│     └─ diagnosis.json             # built by Grok 4.7
├─ scripts/
│  ├─ fetch-ndvi.ts · fetch-weather.ts · fetch-imagery.ts (optional)
│  ├─ build-farm.ts · diagnose.ts · generate-clips.ts
│  └─ seed-supabase.ts              # upserts all JSON + uploads clips to Storage
├─ src/app/
│  ├─ page.tsx                      # farm picker
│  ├─ call/[farmId]/page.tsx        # phone view (mobile-first)
│  ├─ dashboard/[farmId]/page.tsx   # judge view, live via Realtime
│  └─ api/
│     ├─ session/route.ts           # xAI ephemeral token
│     ├─ calls/route.ts             # create call row
│     ├─ call-events/route.ts       # append transcript / tool / clip events
│     ├─ clip/route.ts              # send clip (demo: cached; live: start generation)
│     ├─ clip/[id]/route.ts         # poll live generation, upload to Storage when done
│     └─ tts/route.ts
└─ src/lib/  voice client · audio worklet · tools · supabase clients · types
```

---

## 4. Environment variables

`.env.local` (never commit; add `.env.example` with empty values):

```
XAI_API_KEY=
CDSE_CLIENT_ID=
CDSE_CLIENT_SECRET=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

On Vercel: `XAI_API_KEY` and the three Supabase vars. CDSE keys are only for local scripts.

---

## 5. Phases

### Phase 0: Scaffold (≈20 min)

1. The repo already contains `docs/PLAN.md`, `.env.local`, and `.gitignore`. Scaffold the Next.js app (TypeScript, Tailwind, App Router, `src/` dir) with `create-next-app` in a temporary folder, then move its files into the repo root. **Do not overwrite `docs/PLAN.md` or `.env.local`.** Merge `.gitignore` so it still ignores `.env*` (except `.env.example`) and `node_modules`. Confirm `.env.local` is not tracked by git before the first commit.
2. Install dependencies from Section 3.
3. Create `.cursor/rules/project.mdc` summarizing Section 0 rules, both scenarios, and the data layout.
4. Create `docs/CURSOR_LOG.md`, `.env.example`, stub `README.md`, and `data/farms.config.json` with both farms from Section 2 (polygon paths, windows, baseline years, languages, profiles, clip topics).
5. Initial commit.

**Accept when:** `npm run dev` shows a placeholder page; config file has both farms.

### Phase 1: Data pipeline, both farms (≈75 min)

All scripts loop over every farm in `farms.config.json` (or take `--farm <id>`). Run with `npx tsx scripts/<name>.ts`.

**1a. `fetch-ndvi.ts`**: Sentinel-2 L2A NDVI time series via the Copernicus Data Space Statistical API.

- Token: `POST https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token`, form body `grant_type=client_credentials`, `client_id`, `client_secret`.
- Stats: `POST https://sh.dataspace.copernicus.eu/api/v1/statistics` with `Authorization: Bearer <token>`.
- Geometry from `field.geojson` (EPSG:4326), `resx`/`resy` ≈ `0.0001` degrees (≈10 m).
- Time ranges: the farm's analysis window in the event year and in its baseline year. `aggregationInterval: { of: "P5D" }`.
- Data: `type: "sentinel-2-l2a"`, `dataFilter: { mosaickingOrder: "leastCC" }`.
- Evalscript (masks cloud, shadow, cirrus via SCL):

```js
//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "SCL", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  const ndvi = (s.B08 - s.B04) / (s.B08 + s.B04);
  const bad = [3, 8, 9, 10].includes(s.SCL);
  return { ndvi: [ndvi], dataMask: [s.dataMask && !bad ? 1 : 0] };
}
```

- Output per interval: `{ date, mean, stdev, validPixelPct }`; drop intervals with `validPixelPct < 60`.
- If the API gives trouble after 45 minutes: stop, tell Allen, and fall back to manually entered CSVs copied from the Copernicus Browser statistics tool.

**1b. `fetch-weather.ts`**: NASA POWER daily point data (no key), polygon centroid, covering both years' windows:

```
https://power.larc.nasa.gov/api/temporal/daily/point
  ?parameters=PRECTOTCORR,T2M_MAX,T2M,GWETROOT
  &community=AG&longitude={lon}&latitude={lat}
  &start={YYYYMMDD}&end={YYYYMMDD}&format=JSON
```

Output `{ date, precipMm, tMaxC, tMeanC, rootZoneWetness }`; convert `-999` to `null`.

**1c. `fetch-imagery.ts` (optional)**: NDVI color-mapped PNG for early-window and simulated-today via `POST https://sh.dataspace.copernicus.eu/api/v1/process`.

**1d. `build-farm.ts`**: writes `data/farms/{id}/farm.json`:

```ts
type Farm = {
  profile: {
    id: string; farmerName: string; farmerNameEn: string; fictional: true;
    village: string; region: string; country: string; lat: number; lon: number;
    crop: string; languages: ("zh" | "en")[];
    event: { name: string; summary: string };
  };
  polygon: GeoJSON.Polygon;
  simulatedToday: string;
  baselineYear: number;
  ndvi: { event: NdviPoint[]; baseline: NdviPoint[] };
  weather: WeatherPoint[];
  derived: {
    ndviNow: number; ndvi30dAgo: number; ndviSameDateBaseline: number;
    pctChange30d: number; pctChangeVsBaseline: number;
    rain30dMm: number; rain30dMmBaseline: number;
    rainWindowMm: number; rainWindowMmBaseline: number;
    heatDays35C_30d: number; rootZoneWetnessNow: number; rootZoneWetnessBaseline: number;
  };
  sources: { name: string; url: string }[];
};
```

**Accept when:** both `farm.json` files exist, each event year shows a visible NDVI drop vs its baseline, and a summary table prints for Allen to check.

### Phase 2: Supabase (≈45 min)

**2a. `supabase/migrations/0001_init.sql`:**

```sql
create table farms (
  id text primary key,
  profile jsonb not null,
  polygon jsonb not null,
  simulated_today date not null,
  baseline_year int not null,
  derived jsonb not null,
  sources jsonb not null,
  updated_at timestamptz default now()
);
create table ndvi_observations (
  farm_id text references farms(id) on delete cascade,
  series text check (series in ('event','baseline')),
  date date, mean real, stdev real, valid_pct real,
  primary key (farm_id, series, date)
);
create table weather_daily (
  farm_id text references farms(id) on delete cascade,
  date date, precip_mm real, tmax_c real, tmean_c real, root_zone_wetness real,
  primary key (farm_id, date)
);
create table diagnoses (
  farm_id text primary key references farms(id) on delete cascade,
  content jsonb not null, model text, created_at timestamptz default now()
);
create table clips (
  id uuid primary key default gen_random_uuid(),
  farm_id text references farms(id) on delete cascade,
  call_id uuid,
  topic text, language text,
  video_path text, audio_path text,
  source text check (source in ('pregenerated','live')),
  status text default 'ready',
  created_at timestamptz default now()
);
create table calls (
  id uuid primary key default gen_random_uuid(),
  farm_id text references farms(id) on delete cascade,
  language text, started_at timestamptz default now(), ended_at timestamptz
);
create table call_events (
  id bigserial primary key,
  call_id uuid references calls(id) on delete cascade,
  type text check (type in ('user_transcript','assistant_transcript','tool_call','tool_result','clip_sent','status')),
  payload jsonb, created_at timestamptz default now()
);

alter table farms enable row level security;
alter table ndvi_observations enable row level security;
alter table weather_daily enable row level security;
alter table diagnoses enable row level security;
alter table clips enable row level security;
alter table calls enable row level security;
alter table call_events enable row level security;

create policy "public read" on farms for select using (true);
create policy "public read" on ndvi_observations for select using (true);
create policy "public read" on weather_daily for select using (true);
create policy "public read" on diagnoses for select using (true);
create policy "public read" on clips for select using (true);
create policy "public read" on calls for select using (true);
create policy "public read" on call_events for select using (true);
-- all writes go through API routes using the secret key

alter publication supabase_realtime add table calls, call_events, clips;
```

- Storage: public bucket `clips` (mp4 + mp3).
- Allen applies the migration (SQL editor or Supabase MCP).

**2b. `src/lib/supabase.ts`:** browser client (publishable key) and server client (secret key, used only in API routes and scripts).

**2c. `seed-supabase.ts`:** upserts farms, ndvi, weather, diagnoses from JSON. Rerunnable.

**Accept when:** tables are populated for both farms and a test page reads a farm from Supabase.

### Phase 3: Diagnosis with Grok 4.7 (≈30 min)

**`diagnose.ts`**: for each farm, send `profile`, `derived`, and trimmed series to `grok-4.7` with structured outputs (check https://docs.x.ai/developers/model-capabilities/text/structured-outputs). Write `diagnosis.json`, then reseed.

```ts
type Diagnosis = {
  status: "healthy" | "water_stress" | "heat_stress" | "water_and_heat_stress" | "unclear";
  severity: 1 | 2 | 3;
  evidence: Record<Lang, string>[];     // each cites a number from farm.json
  summary: Record<Lang, string>;         // 2–3 plain sentences
  actions: { topic: string; text: Record<Lang, string> }[];  // topics from farm config
  caveats: Record<Lang, string>;
};
```

- System prompt must require: only numbers present in the input, no invented figures, general agronomy only, and always recommend confirming with local agricultural extension officers (Farm A: 农技站; Farm B: county agricultural extension officer).
- Produce text for every language in the farm's `languages`.

**Accept when:** both diagnoses are grounded; Allen checks the Mandarin and English read naturally.

### Phase 4: Voice agent (≈2.75 h, the core)

Reference implementation for audio handling: https://github.com/xai-org/xai-cookbook/tree/main/voice-examples/agent/web

**4a. `/api/session`**: `POST https://api.x.ai/v1/realtime/client_secrets` with `{ "expires_after": { "seconds": 300 } }` and the server API key. Return the token JSON.

**4b. Call lifecycle:** on call start, `POST /api/calls` → `call_id`. Every final user transcript, assistant transcript, tool call, tool result, and clip send is posted to `/api/call-events` (batched or debounced is fine). On hang-up, set `ended_at`.

**4c. Browser voice client (`src/lib/voice.ts`)**:

- Connect `new WebSocket("wss://api.x.ai/v1/realtime?model=grok-voice-latest", ["xai-client-secret." + token])`; start mic capture in parallel and buffer early audio.
- PCM16 mono 24 kHz in and out; AudioWorklet capture; playback queue. **Resample to 24 kHz if the AudioContext sample rate differs** (iOS Safari often ignores the requested rate). Test on iOS Safari and Android Chrome.
- Send mic audio via `input_audio_buffer.append` (base64); play `response.output_audio.delta`.
- On open, send `session.update` with `voice` (`ara` for zh, `ara` or `celeste` for en; Allen picks), Section 7 instructions with farm profile injected, `turn_detection: { type: "server_vad", silence_duration_ms: 700 }`, audio formats, `audio.input.transcription.language_hint` set from the language toggle (`zh` or `en`), and the tools below.
- Greeting via xAI `force_message` (scripted, verbatim; do not send `response.create` after it). Greeting text comes from farm config per language.
- Barge-in: when the server reports user speech started, stop and clear local playback.
- Confirm transcript event names by logging all event types in dev.

**4d. Function tools** (handlers in the browser; read from Supabase with the publishable client, cached at call start):

| name | args | returns |
|---|---|---|
| `get_farmer_profile` | none | profile fields |
| `get_field_health` | none | NDVI part of `derived`, last obs date, short trend description |
| `get_weather_summary` | none | rain 30d and window vs baseline, heat days, soil wetness now vs baseline |
| `get_diagnosis` | none | diagnosis in the active language |
| `send_guidance_clip` | `topic` (enum from farm config), `language` | `{ status: "sending" }`; triggers Phase 5 flow |

- Tool flow: on `response.function_call_arguments.done` → run handler → send `conversation.item.create` with `function_call_output` → **wait for current audio playback to finish** → send `response.create`. If several calls arrive, answer all before one `response.create`. Show "checking satellite data…" meanwhile.

**Accept when:** Allen completes a full Mandarin call on Farm A and a full English call on Farm B, from his phone, with tools called, real numbers cited, and the clip offer made. Events appear in `call_events`.

**Kill rule:** if voice is not talking by 12:30 PM ET, tell Allen and fall back to text chat + `/v1/tts` narration.

### Phase 5: Guidance clips (≈1.5 h)

Silent Imagine video + separate TTS narration played in sync (accurate narration, no garbled on-screen text).

**5a. `generate-clips.ts`** (pre-generation): for each farm × topic:

- `POST https://api.x.ai/v1/videos/generations` with `{ "model": "grok-imagine-video-1.5", "prompt": <Section 8>, "duration": 10, "aspect_ratio": "9:16", "resolution": "720p", "generate_audio": false }` → poll `GET https://api.x.ai/v1/videos/{request_id}` every 5 s until `done` (`video.url`) or `failed`/`expired`. Run all generations concurrently.
- Download immediately (URLs are temporary) and upload to Supabase Storage `clips/{farmId}/{topic}.mp4`.
- Narration per language: `POST https://api.x.ai/v1/tts` with `{ "text": <action text>, "voice_id": <farm voice>, "language": <lang> }` → upload `clips/{farmId}/{topic}.{lang}.mp3`.
- Total: 6 videos, 9 narrations (Farm A: 3 × zh + en; Farm B: 3 × en).

**5b. Runtime:**

- **Demo mode (default):** `send_guidance_clip` → `POST /api/clip` inserts a `clips` row (`source: 'pregenerated'`, `call_id`) pointing at the stored files, and a `clip_sent` call event.
- **Live mode (toggle):** `/api/clip` starts a generation and returns `request_id`; the client polls `/api/clip/[id]`, which proxies xAI and, on `done`, downloads, uploads to Storage, and inserts the `clips` row. Never hold a Vercel function open for minutes.
- The phone subscribes via Realtime to `clips` where `call_id` matches and shows a "video message received" card when the row lands (after hang-up, or 3 s after the tool call if the call continues).

**Accept when:** all 6 clips and 9 narrations are in Storage and a clip reaches the phone via Realtime in demo mode.

### Phase 6: UI (≈2.25 h)

Dark "mission control" style, readable on a projector.

- **`/` farm picker:** two cards (event name, place, crop, language flag) → buttons "Open dashboard" and "Call from this device".
- **`/call/[farmId]` phone view (mobile-first):** big call button, language toggle (only languages the farm supports), live transcript bubbles, "checking satellite data" indicator, incoming clip card (video + narration, tap to play).
- **`/dashboard/[farmId]` judge view:**
  - QR code linking to `/call/[farmId]` so anyone can call from their phone.
  - Map (react-leaflet, Esri World Imagery basemap with attribution) with the field polygon; optional NDVI PNG toggle.
  - NDVI chart: event year vs baseline year on a day-of-year axis, marker on simulated today.
  - Rain + max temperature chart, event year vs baseline.
  - Diagnosis card (status, severity, evidence, actions).
  - **Live call panel:** subscribes to the newest `calls` row for the farm and its `call_events`; shows transcript, tool calls as chips ("get_field_health ✓"), and the clip when sent.
  - Provenance strip: Sentinel-2 L2A (Copernicus), NASA POWER, Grok Voice, Grok Imagine, Grok 4.7, Supabase.
- Footer: "Replay of real {event} satellite and weather data. Farmer is fictional. Guidance is general; confirm with your local agricultural extension officer."

**Accept when:** everything renders from Supabase; phone on one device + dashboard on another update live during a call, for both farms.

### Phase 7: Deploy and harden (≈1 h)

1. Push to GitHub (public), connect Vercel, set env vars.
2. Test both farms end to end on the deployed URL: iPhone Safari or Android Chrome for the call, laptop for the dashboard. Twice each.
3. Error states: token failure, socket drop (reconnect button), mic denied, clip failure (fall back to pregenerated), Realtime disconnect (refetch on reconnect).
4. `?demo=1` forces cached clips.

**Accept when:** two clean deployed runs per farm.

### Phase 8: Submission docs (≈1 h, agent drafts, Allen edits)

1. `README.md`: pitch, screenshots/GIF, Mermaid architecture diagram, how each Grok product is used, Supabase role, data sources, **How we used Cursor** (summarize `CURSOR_LOG.md`), setup, limitations and ethics.
2. `docs/DEVPOST.md`: Inspiration, What it does, How we built it, Challenges, Accomplishments, What we learned, What's next, Built with.
3. `docs/DEMO_SCRIPT.md`: Section 9.

### Cut order if behind schedule

1. Live-mode clip generation (keep demo mode).
2. NDVI imagery PNGs.
3. QR code.
4. Farm A English toggle (keep Farm B English).
5. Realtime dashboard sync (dashboard reads data only; transcript stays on phone).

### Stretch (only after Phase 8)

- Hindi farm (supported language `hi`).
- Real phone number via xAI SIP or Twilio (xai-cookbook `voice-examples/agent/telephony`).
- Proactive outbound call when NDVI crosses a threshold.

---

## 6. Key API facts (verified from docs.x.ai, Sept 2026)

- Voice: `wss://api.x.ai/v1/realtime?model=grok-voice-latest` (alias of `grok-voice-think-fast-2.0`), OpenAI Realtime compatible. Browser auth via subprotocol `xai-client-secret.<token>`. Ephemeral token: `POST /v1/realtime/client_secrets`. Default audio PCM16 24 kHz. Custom tools use `type: "function"`. `force_message` is an xAI extension. `language_hint` is under `audio.input.transcription`.
- Voices include `ara` (warm), `luna` (patient), `celeste` (reassuring), `eve` (default); all speak all supported languages including `zh` and `en`.
- Imagine video: `POST /v1/videos/generations`, poll `GET /v1/videos/{request_id}`; statuses `pending | done | failed | expired`; duration 1–15 s; 480p/720p/1080p; `generate_audio: false` for silent; URLs are temporary.
- TTS: `POST /v1/tts` with `text`, `voice_id`, `language`; returns mp3.
- Text model: `grok-4.7`.

---

## 7. Voice agent instructions (inject profile values)

```
# Role
You are Orbital Agronomist (天眼农技助手 in Chinese), a phone assistant for smallholder farmers. You explain what satellites and weather data show about the caller's own field, then give practical, general guidance.

# Caller
{farmerName}, {crop} grower in {village}, {region}, {country}. Speak {language}. Today is {simulatedToday}.

# How to talk
- Short sentences. Plain words. Say "greenness seen from the satellite" instead of NDVI unless asked.
- One idea per turn. Pause for the caller.
- Use real numbers from tools, rounded ("about 20% less green than this time in {baselineYear}").
- Warm and respectful, like a trusted local extension officer.

# Tools
- Call get_field_health and get_weather_summary before making any claim about the field.
- Call get_diagnosis before giving advice. At most 3 actions, most important first.
- Offer a short video for the top action; call send_guidance_clip only after the caller agrees.

# Limits
- Never invent numbers. If data is missing or cloudy, say so.
- Guidance is general. Always suggest confirming with the local agricultural extension officer.
- If asked about something unrelated to the farm, answer briefly and return to the field.
```

---

## 8. Imagine prompt template

```
Warm hand-painted illustration style, soft natural light, {setting}.
{scene}. {farmer} demonstrates the action calmly.
Vertical composition, gentle camera movement, no text, no captions, no logos.
```

Farm A setting: "rural southern China, terraced rice paddies"; farmer: "a middle-aged rice farmer in a straw hat".
- `irrigation_timing`: early-morning sun over the paddies; the farmer opens a small earthen channel gate so a shallow layer of water flows in.
- `prioritize_flowering_fields`: close-up of rice panicles in flower, then the farmer guiding water to the flowering plot first.
- `heat_stress_foliar_spray`: late afternoon, the farmer walks the paddy with a backpack sprayer, fine mist over the leaves.

Farm B setting: "semi-arid eastern Kenya, red soil, small maize plots, acacia trees"; farmer: "a Kenyan woman farmer in a headscarf".
- `mulching_soil_moisture`: the farmer spreads dry maize stalks and grass around young maize plants to cover bare soil.
- `zai_pits_water_harvesting`: the farmer digs small round planting pits in a grid, adds manure, and rain water collects in them.
- `drought_tolerant_varieties`: the farmer compares seed packets at a small village agro-dealer, then plants short-season seeds.

---

## 9. Demo scripts

**Video (≈2:45):**
1. 0:00–0:20 Problem: smallholders, climate shocks, no access to satellite insight. Two events on a world map.
2. 0:20–0:35 Solution + architecture flash (Sentinel-2 + NASA POWER → Grok 4.7 → Grok Voice → Grok Imagine, Supabase Realtime).
3. 0:35–1:25 Farm A: Mandarin call on a phone (English subtitles), dashboard updating beside it.
4. 1:25–1:40 Clip arrives and plays.
5. 1:40–2:15 Farm B: English call, shortened.
6. 2:15–2:45 Impact, what's next (real phone lines, more languages, proactive alerts), built with Cursor.

**Expo (≈3 min):** 20 s pitch → Mandarin call live → clip lands → hand a judge the QR code to call Farm B themselves → 30 s on data and Grok stack → 20 s on the Cursor workflow (show CURSOR_LOG) → questions. Backup: recorded video on the laptop.

---

## 10. STATUS AND REVISED SCHEDULE (updated Sat 1:00 PM ET, overrides earlier timings)

- Phase 0: DONE.
- Phase 2a: DONE. Migration applied to Supabase (project `gpuzmgxplywdbastvjtm`), public `clips` Storage bucket created. SQL is in `supabase/migrations/0001_init.sql` for reference. **Do not re-run it.** Phase 2 now means only 2b (`src/lib/supabase.ts`) and 2c (`seed-supabase.ts`). Note: `clips.call_id` is a nullable FK to `calls(id)`.
- We are ~4 hours behind. Work runs in **two parallel Cursor Agent tabs**:
  - **Tab A (data track):** Phase 2b/2c → Phase 1 (once both `field.geojson` files exist) → Phase 3 → seed → Phase 5a clip generation.
  - **Tab B (voice track):** Phase 4. Until Supabase is seeded, tool handlers read from a local fixture `src/lib/fixtures.ts` shaped like the Farm and Diagnosis types (placeholder numbers clearly marked FAKE). Swap to Supabase once seeded. Tab B must not edit `scripts/`, `data/`, or `package.json`.
- **Cuts now in effect:** live-mode clip generation, NDVI imagery PNGs, Farm A English toggle. Keep: both farms, Farm B in English, Supabase + Realtime dashboard, QR code if time.
- **New kill rule:** if voice is not talking by 3:30 PM ET, fall back to text chat + `/v1/tts`.
- Targets: data + diagnosis 2:30 PM · voice 3:30 PM · clips 4:30 PM · UI 6:00 PM · deployed 6:45 PM · video recorded 8:00 PM · Devpost submitted 9:30 PM.
