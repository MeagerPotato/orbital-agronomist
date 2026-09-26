# SpaceXAI Challenge: Brief, Criteria, and Alignment Tracker

Single source of truth for **what we are judged on**. Every feature and every line of the submission should map to a row in Section 2. Agents: read this before starting any new feature.

---

## 1. Challenge brief (verbatim, as provided)

> **SpaceXAI: 🤖 Make it Legendary with SpaceXAI**
>
> **Scenario:** SpaceXAI is the world's most useful AI. SpaceXAI does the parts nobody brags about, so you can build the part they do. We're giving you the tools to build something incredible, so go out and make it legendary.
>
> Your solution should push the boundaries of what humanity can know and do by addressing societal issues in areas like public health, sustainability, and education. Try to go beyond everyday problems. Embrace your most ambitious ideas and use AI to bring those to life.
>
> Imagine Cursor is your canvas and paint brush. Grok products will be the paints you choose from to elevate your project and take it to the next level. You'll code with Cursor, generate images or videos with Grok Imagine, and integrate voice with Grok Voice - all powered by Grok models, our most capable reasonable model.
>
> Space gives you more to work with than almost any other field. You have access to enormous public datasets, decades of missions, and a literature no human can read all of. Real space data goes in and a legendary project comes out.
>
> **Message from SpaceXAI:** To be eligible, your project must be built with Cursor. The more you use Cursor, the more likely you are to win. You must also use the Grok Imagine or Voice API in your project. Bonus points if you use Grok Bot for project planning and team collaboration. Anyone who submits to our challenge will be entered to win a Cursor Owala bottle. Winners will receive branded Cursor mechanical keyboards.
>
> **Your Mission:**
> - Create a solution with Cursor using Grok technology that addresses a real-world challenge faced by humanity.
> - Create compelling use cases of Grok products built with Cursor's powerful engine.
>
> **Prizes:** Winning team: custom Cursor keyboard each. All participants: Cursor and Grok credits. Anyone who submits is entered to win a Cursor Owala water bottle.

**Submission logistics (our understanding, confirm on Devpost):** Devpost submission with GitHub repo + demo video, deadline **Sat 10:00 PM ET**. In-person expo demo **Sunday morning**.

---

## 1b. Hackathon rules (HackGT / HexLabs Devpost, verbatim) and our compliance

Source: Devpost rules page; more at live.hexlabs.org.

| # | Rule | Our compliance | Status |
|---|---|---|---|
| R1 | Teams of 1–4 | Solo (Allen) | ✅ |
| R2 | No crossposting to other hackathons | Submitted only here | ✅ |
| R3 | Must submit code (GitHub etc.) | Public repo MeagerPotato/orbital-agronomist | ✅ |
| R4 | Public frameworks allowed but **must be mentioned and credited** in Devpost | Credits section in README + Devpost (list in Section 6) | ❌ to write |
| R5 | AI may be used as a tool, **not reskinned**; AI projects must **clearly state what they use vs what was built this weekend** | "What we used vs what we built" section in README + Devpost | ❌ to write |
| R6 | **Cannot make multiple projects** | ⚠️ Allen's teammates are building a separate project. Confirm with organizers whether Allen may also be on that team's submission. | ⚠️ **OPEN, ask organizers** |
| R7 | Can submit to multiple categories | Select SpaceXAI + any other fitting categories | 🟡 |
| R8 | No coding before 8 PM ET Friday | Repo created Sat 2:18 AM ET; first commit after | ✅ |
| R9 | **Must be at expo Sunday** to be judged | Allen attends | 🟡 |
| R10–11 | Enrolled in college, 18+ | Allen is a UC Berkeley student | ✅ |
| R12 | Emerging track rule | N/A unless entering Emerging | — |

---

## 1c. Pitch facts (researched by Grok Bot, verify before quoting)

1. Nearly 500 million of the world's ~570 million farms are smallholders under 2 ha; their crops supply ~16% of global crop-derived dietary energy (~60% in low- and lower-middle-income countries). Source: FAO, *The State of Food and Agriculture 2025*, executive summary. Caveat: an older, widely cited figure is ~35% of world food; the 16% is crop dietary energy only.
2. In Jiangxi (Poyang Lake / Yangtze basin), the Jul 15–Aug 31, 2022 drought and heatwave affected 505,900 ha of crops and caused total crop failure on 51,200 ha, with late rice among damaged plantings. Source: Caixin, citing Jiangxi Flood Control and Drought Relief Headquarters. Caveat: all crops, not rice only.
3. Only 24–37% of farms under 1 ha have 3G/4G coverage, vs 74–80% of farms over 200 ha. Source: Mehrabi et al., *Nature Sustainability* (2020). Caveat: connectivity, a proxy for access to digital advice. Supports the voice-first (works over basic phone calls) design.

---

## 2. Criteria → how we satisfy it → status

| # | Criterion (from brief) | Type | How Orbital Agronomist satisfies it | Evidence to show judges | Status |
|---|---|---|---|---|---|
| E1 | Built with Cursor | **Eligibility** | Entire codebase built by Cursor Agent (grok-4.7), incl. 3 parallel agent tabs | Commit history, `docs/CURSOR_LOG.md`, `.cursor/rules/project.mdc`, screenshots of parallel agents | ✅ ongoing |
| E2 | Uses Grok Imagine **or** Voice API | **Eligibility** | Uses **both**: Voice Agent API (realtime, tools) + Imagine video + TTS | Live call demo, clips | ✅ |
| S1 | "The more you use Cursor, the more likely you are to win" | Scoring | Heavy, visible use: rules file, parallel agents, per-task log | README "How we used Cursor" section with numbers (commits, agents, log lines) | 🟡 README pending |
| S2 | Grok products elevate the project ("paints") | Scoring | Voice = the interface; Imagine = guidance videos; TTS = narration in farmer's language; grok-4.7 = diagnosis reasoning | Architecture diagram labeling each Grok product | 🟡 |
| S3 | Real-world societal challenge (health, **sustainability**, education) | Scoring | Food security + climate adaptation for smallholder farmers | Problem stats with sources (Grok Bot researching) | 🟡 stats pending |
| S4 | Beyond everyday problems, ambitious | Scoring | Satellite agronomy for people with no smartphone literacy, in their own language; scales to millions of fields | "What's next" + scale story | 🟡 |
| S5 | Push boundaries of what humanity can **know and do** | Scoring | Turns orbital observation into spoken, actionable advice for one family's field | Demo moment: satellite numbers → spoken advice → video | ✅ core loop works |
| S6 | **Real space data in** | Scoring | Sentinel-2 L2A NDVI (ESA Copernicus), NASA POWER (satellite-derived weather, root-zone wetness) | Dashboard provenance strip, NDVI chart, satellite imagery | 🟡 dashboard pending |
| S7 | "Decades of missions / a literature no human can read all of" | Scoring (theme) | Voice agent searches an xAI Collection of IRRI Rice Knowledge Bank + FAO documents (`file_search`) and cites the source aloud (e.g. IRRI "Rice feels the heat") | Call transcript + tool_result log + `data/knowledge/sources.json` | ✅ |
| S8 | Compelling use cases of Grok built with Cursor | Scoring | Voice hotline, multilingual, tool-calling on live data | Demo video + expo | 🟡 |
| B1 | Grok Bot for planning + team collaboration | **Bonus** | "Mission Planner" Bot: checklist, 9 routines, status log, research task | Screenshots in `docs/evidence/` | ✅ ongoing |
| Q1 | Demo quality (implicit) | Scoring | Phone view + live dashboard synced via Supabase Realtime, QR for judges | Expo: judge calls from own phone | 🟡 |

Status key: ✅ done · 🟡 in progress · ❌ not started

---

## 3. Build status (core)

| Item | Status |
|---|---|
| Data: Sentinel-2 NDVI + NASA POWER for cn-rice-2022 | ✅ |
| Supabase schema + bucket | ✅ |
| Voice agent zh + en with tools | ✅ (transcript display fix in progress, Tab C) |
| Diagnosis (grok-4.7) + seed | ✅ |
| Imagine clips (3) + TTS narration (zh, en) + phone delivery | ✅ |
| Dashboard UI + Realtime + QR | ✅ v1, polish in progress |
| Deploy (Vercel) | ✅ https://orbital-agronomist.vercel.app |
| README (Cursor writes) | ❌ |
| Devpost text (Claude writes at the end, Allen edits and submits) | ❌ |
| Demo video | ❌ |

---

## 4. Polish and feature backlog (ranked by rubric impact per hour)

Only start after core items are ✅ or clearly on track. Timebox each.

| Pri | Feature | Rubric rows | Est. | Notes |
|---|---|---|---|---|
| P1-a ✅ | **Literature grounding**: upload 3–5 FAO / IRRI drought-and-heat rice guidance PDFs to an xAI Collection; add `file_search` tool to the voice session; agent cites the source; dashboard shows "Sources cited" | S7, S2, S5 | 45 min | Directly answers "a literature no human can read all of" |
| P1-b | **Satellite imagery panel**: Sentinel-2 true-color + NDVI images, July vs Aug 2022, before/after slider on dashboard | S6, Q1 | 30 min | Restores cut item 1c; strongest "space" visual |
| P1-c | **Proactive alert call**: dashboard "Drought alert" button → phone view rings with an incoming call from Orbital Agronomist, agent opens with the alert | S4, S5, Q1 | 30 min | Shows the product acts before the farmer asks |
| P2-a | **Real phone number** via xAI SIP (see docs: speech-to-speech/sip) | S4, Q1 | 60 min timebox | Judges dial a real number; only if P1 done by 6:00 PM |
| P2-b | **Regional drought footprint**: NDVI change for a grid of ~50 fields around Poyang Lake, shown as a heat map | S5, S6 | 60 min | "What humanity can know" at scale |
| P2-c | Satellite rainfall from NASA GPM IMERG instead of reanalysis | S6 | 30 min | Nice-to-have accuracy upgrade |

---

## 5. Submission checklist

- [ ] Public GitHub repo, README with pitch, architecture diagram, Grok usage, Cursor usage, data sources, setup, limitations
- [ ] Demo video (length per Devpost rules), shows: problem → live call → clip → dashboard → Cursor + Grok stack
- [ ] Devpost text (Claude drafts at the end in `docs/DEVPOST.md`): Inspiration, What it does, How we built it, Challenges, Accomplishments, What we learned, What's next, Built with
- [ ] SpaceXAI challenge selected on Devpost
- [ ] Evidence folder `docs/evidence/`: Cursor parallel agents, Grok Bot screenshots, CURSOR_LOG excerpt
- [ ] Honesty: farmer fictional, data real (Aug 2022 replay), guidance general
- [ ] Expo: deployed URL + QR, backup video offline, phone hotspot

---

## 6. Credits to list (Rule R4) and "used vs built" (Rule R5)

**Used (third-party):** Next.js, React, TypeScript, Tailwind CSS, Supabase (Postgres, Realtime, Storage), Recharts, Leaflet + react-leaflet, qrcode.react, Vercel, Esri World Imagery basemap; xAI APIs (Grok Voice Agent API, Grok Imagine video, Grok TTS, grok-4.7); ESA Copernicus Sentinel-2 L2A via Copernicus Data Space Ecosystem (attribution: "Contains modified Copernicus Sentinel data 2021–2022"); NASA POWER (NASA Langley Research Center POWER Project); xai-cookbook web voice example (reference for audio handling, if code was adapted); Cursor (Agent with grok-4.7) for development; Grok Bot for planning.

**Built this weekend:** the satellite + weather data pipeline (cloud-masked NDVI time series, baseline comparison, derived stress metrics); the grounded diagnosis step (grok-4.7 with structured output restricted to input numbers); the voice agent design (persona, 5 function tools over real field data, bilingual flow, scripted greeting, barge-in, transcript logging); the clip pipeline (Imagine video + TTS narration per language, stored in Supabase); the phone UI and live judge dashboard with Realtime sync; the database schema.
