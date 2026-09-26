# Demo Scripts

Live site: https://orbital-agronomist.vercel.app
Call page: /call/cn-rice-2022 · Dashboard: /dashboard/cn-rice-2022

---

## A. Demo video (target 2:45, hard max 3:00)

**Setup before recording**
- Laptop: dashboard full screen in Chrome (Ctrl+Cmd+F), zoom 90% if tiles don't fit.
- Phone: call page open, language set to English, volume up. Mirror the phone to the Mac (QuickTime → New Movie Recording → pick the iPhone as camera) or film it next to the laptop.
- Record the Mac screen with Cmd+Shift+5 → Record Entire Screen, mic on (or record voiceover separately after).
- Do one full dry run first. Record each section as its own clip; stitch in iMovie or CapCut.

| Time | Shot | Voiceover (say this) |
|---|---|---|
| 0:00–0:15 | Dashboard: map on the field, then the Sentinel-2 July vs August slider | "In August 2022, the worst drought in sixty years hit China's Yangtze basin. This is a real rice field in Jiangxi, seen by the Sentinel-2 satellite in July, and again in late August." |
| 0:15–0:30 | Stat tiles, greenness chart, then the drought footprint layer on the map | "From orbit, the damage is clear: thirty-two percent less green than the same week a year earlier, and twenty-two millimeters of rain in a month instead of two hundred sixty. And it isn't one field. The whole area around it is browning." |
| 0:30–0:40 | Title card: Orbital Agronomist + one line | "Nearly five hundred million farms worldwide are smallholdings. Most of those farmers will never open a satellite dashboard. So we built one that calls them." |
| 0:40–0:55 | Click "Send drought alert call" on the dashboard; the phone rings; accept | "When a field starts to fail, Orbital Agronomist calls the farmer first." |
| 0:55–1:35 | The English call, with the dashboard's live panel beside it (agent steps lighting up) | Let the call play. Say: "Why is my rice turning yellow?" then "What should I do?" |
| 1:35–1:50 | Citation card appears on the dashboard | "Before it gives advice, it searches IRRI and FAO research on rice under heat and drought, and it tells the farmer where the advice comes from." |
| 1:50–2:10 | Say "Yes, send me the video." Card arrives on the phone; clip plays | "Then it sends a short video, made with Grok Imagine and narrated in the farmer's language, so the advice doesn't have to be remembered from a phone call." |
| 2:10–2:25 | Switch to 中文, 15 s of the Mandarin call (burn in English subtitles) | "The same agent speaks Mandarin. Here it's talking to Master Zhang in his own language." |
| 2:25–2:45 | Architecture diagram from README, then the Cursor agents + CURSOR_LOG | "Under the hood: Sentinel-2 and NASA POWER data, a grok-4.7 diagnosis, Grok Voice with live tool calls, Grok Imagine and TTS, Supabase Realtime. Built this weekend in Cursor with three agents working in parallel, planned with Grok Bot. The farmer is fictional. The satellite data is real." |

---

## B. Expo pitch (3 minutes, live)

1. **Hook (20 s).** Point at the slider. "This field lost a third of its green in one month in 2022. The satellite knew. The farmer didn't."
2. **Alert call (75 s).** Press "Send drought alert call" on the dashboard, the phone rings, accept it on speaker. Ask the two questions, accept the video.
3. **Hand the judge the QR (30 s).** "Scan this and call it yourself. Ask it anything about the field." Let them talk to it while the dashboard updates live.
4. **Mandarin (20 s).** Switch to 中文 and ask one question yourself.
5. **Stack + Cursor (25 s).** Architecture diagram, then the CURSOR_LOG and the three-agent screenshot.
6. **What's next (10 s).** "Real phone lines through SIP, proactive calls when a field starts to fail, more languages, every smallholder field on Earth."

**Likely judge questions**
- *Is the data real?* Yes: Sentinel-2 L2A NDVI from Copernicus, cloud-masked, and NASA POWER weather. Only the farmer is fictional.
- *Why a replay?* It lets us show a real disaster with ground truth. The pipeline runs on any field and date.
- *How do you stop it making things up?* The diagnosis is restricted to numbers in the input, the voice agent must call tools before any claim, and advice is grounded in IRRI/FAO documents and always points to the local extension station.
- *Why voice?* Only 24–37% of farms under 1 ha have 3G/4G coverage; a voice call works on the most basic phone, and nobody needs to read.
- *What did you build vs use?* See README "Used vs built".

**Expo checklist**
- [ ] Phone charged, hotspot on, laptop charger
- [ ] Deployed site tested on the venue Wi-Fi and on hotspot
- [ ] Headphones for noisy rooms (the voice agent can hear the crowd)
- [ ] Demo video saved offline on the laptop as a fallback
- [ ] QR printed or visible on the dashboard
