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

## 2. Criteria → how we satisfy it → status

| # | Criterion (from brief) | Type | How Orbital Agronomist satisfies it | Evidence to show judges | Status |
|---|---|---|---|---|---|
| E1 | Built with Cursor | **Eligibility** | Entire codebase built by Cursor Agent (grok-4.7), incl. 3 parallel agent tabs | Commit history, `docs/CURSOR_LOG.md`, `.cursor/rules/project.mdc`, screenshots of parallel agents | ✅ ongoing |
| E2 | Uses Grok Imagine **or** Voice API | **Eligibility** | Uses **both**: Voice Agent API (realtime, tools) + Imagine video + TTS | Live call demo, clips | ✅ Voice / 🟡 Imagine in progress |
| S1 | "The more you use Cursor, the more likely you are to win" | Scoring | Heavy, visible use: rules file, parallel agents, per-task log | README "How we used Cursor" section with numbers (commits, agents, log lines) | 🟡 README pending |
| S2 | Grok products elevate the project ("paints") | Scoring | Voice = the interface; Imagine = guidance videos; TTS = narration in farmer's language; grok-4.7 = diagnosis reasoning | Architecture diagram labeling each Grok product | 🟡 |
| S3 | Real-world societal challenge (health, **sustainability**, education) | Scoring | Food security + climate adaptation for smallholder farmers | Problem stats with sources (Grok Bot researching) | 🟡 stats pending |
| S4 | Beyond everyday problems, ambitious | Scoring | Satellite agronomy for people with no smartphone literacy, in their own language; scales to millions of fields | "What's next" + scale story | 🟡 |
| S5 | Push boundaries of what humanity can **know and do** | Scoring | Turns orbital observation into spoken, actionable advice for one family's field | Demo moment: satellite numbers → spoken advice → video | ✅ core loop works |
| S6 | **Real space data in** | Scoring | Sentinel-2 L2A NDVI (ESA Copernicus), NASA POWER (satellite-derived weather, root-zone wetness) | Dashboard provenance strip, NDVI chart, satellite imagery | 🟡 dashboard pending |
| S7 | "Decades of missions / a literature no human can read all of" | Scoring (theme) | Not yet covered. Candidate: ground advice in FAO/IRRI literature via xAI Collections (`file_search`) | Agent cites source docs | ❌ see backlog P1-a |
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
| Diagnosis (grok-4.7) + seed | 🟡 Tab A |
| Imagine clips (3) + TTS narration (zh, en) | 🟡 Tab B |
| Dashboard UI + Realtime + QR | ❌ |
| Deploy (Vercel) | ❌ |
| README (Cursor writes) | ❌ |
| Devpost text (Claude writes at the end, Allen edits and submits) | ❌ |
| Demo video | ❌ |

---

## 4. Polish and feature backlog (ranked by rubric impact per hour)

Only start after core items are ✅ or clearly on track. Timebox each.

| Pri | Feature | Rubric rows | Est. | Notes |
|---|---|---|---|---|
| P1-a | **Literature grounding**: upload 3–5 FAO / IRRI drought-and-heat rice guidance PDFs to an xAI Collection; add `file_search` tool to the voice session; agent cites the source; dashboard shows "Sources cited" | S7, S2, S5 | 45 min | Directly answers "a literature no human can read all of" |
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
