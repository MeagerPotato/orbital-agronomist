# Devpost submission: Orbital Agronomist

Copy each section into the matching Devpost field. Edit freely; it's written in your voice (solo, first person).

---

## Project name
Orbital Agronomist

## Elevator pitch (max 200 characters)
Satellites can see a farm failing weeks before help arrives. Orbital Agronomist turns that view into a phone call, in the farmer's own language, with a how-to video after.

---

## About the project

### Inspiration
In August 2022, China's Yangtze basin went through its most severe heatwave and drought since national records began in 1961. In Jiangxi alone, officials reported about 505,900 hectares of crops affected and 51,200 hectares of total crop failure.

From orbit, the damage was visible in near real time. Sentinel-2 passes over every field on Earth every few days and measures how green it is. Large farms already pay for dashboards built on that data. The people who grow a big share of the world's food mostly don't: nearly 500 million of the world's ~570 million farms are smallholdings under 2 hectares, and on farms under 1 hectare only 24–37% have 3G/4G coverage.

I wanted to close that gap without asking a farmer to open an app. Everyone knows how to answer a phone.

### What it does
Orbital Agronomist is a voice hotline for one field.

1. **It watches the field from space.** A pipeline pulls a cloud-masked Sentinel-2 greenness (NDVI) time series for the field's exact outline and NASA POWER daily rain, temperature, and root-zone soil wetness, then compares this season with the same weeks last year.
2. **It calls the farmer when something goes wrong.** A drought alert rings the farmer's phone. The farmer can also call in any time.
3. **It explains what the satellite sees, in the farmer's language.** A Grok Voice agent speaks Mandarin or English, pulls the field's numbers through function tools before it says anything, and explains them plainly: "about 32% less green than this time last year, and only 22 mm of rain in the last month, against 262 mm a year ago."
4. **It grounds advice in agronomy research.** Before giving advice, the agent searches a library of IRRI Rice Knowledge Bank and FAO documents on rice under heat and drought, names its source, and always points the farmer to the local agricultural station.
5. **It sends a how-to video.** If the farmer agrees, a short Grok Imagine video of the recommended action (for example, letting a shallow layer of water into the paddy at dawn) arrives on the phone, narrated in their language by Grok TTS. A button can also generate a fresh video live in about a minute.
6. **Judges see everything live.** A dashboard shows the field on satellite imagery, a July vs August Sentinel-2 before/after slider, a drought-footprint map of 42 surrounding cells, the greenness and weather charts, the diagnosis, and the call as it happens: each tool the agent uses, the source it cites, and the video it sends. Scan the QR code and call the field yourself.

The demo replays a real field near Poyang Lake in Yugan County, Jiangxi, on August 25, 2022. The satellite and weather data are real. The farmer, Master Zhang, is fictional.

### How I built it
- **Space data:** Sentinel-2 L2A through the Copernicus Data Space Statistical and Process APIs (NDVI with cloud, shadow, and cirrus masking from the scene classification layer; true-color and NDVI imagery), and NASA POWER daily point data.
- **Diagnosis:** grok-4.7 with structured output turns the numbers into a status, severity, evidence, and actions in Chinese and English. The prompt only allows numbers that appear in the input.
- **Voice:** the Grok Voice Agent API over WebSockets from the browser, with short-lived ephemeral tokens so the API key never reaches the client. Five function tools (profile, field health, weather, diagnosis, send video), a file_search tool over an xAI Collection, a scripted greeting, barge-in, and push-to-talk for noisy rooms.
- **Video:** Grok Imagine video for the three guidance clips, the live "fresh video" button, and the landing-page intro; Grok Imagine images for the cover art; Grok TTS for narration in both languages.
- **App:** Next.js and TypeScript on Vercel. Supabase stores the field data, diagnoses, calls, transcripts, and clips; Supabase Realtime pushes call events and video deliveries to the phone and the dashboard.
- **Cursor:** every line was written by Cursor Agent running grok-4.7. I ran three agents in parallel (data and dashboard, voice and video, voice polish and research grounding), coordinated through a shared plan file and a Cursor rules file. The repo has 30 commits and a 27-entry log of what each agent built.
- **Grok Bot:** a "Mission Planner" Bot held the build checklist, ran scheduled check-ins against my deadlines, logged decisions and scope changes, and researched the sourced statistics used in this pitch.

### Challenges I ran into
- **Finding a field that tells the truth.** A drop in greenness can mean drought or just harvest. I only accepted fields that stayed green in the same weeks of 2021 and lost greenness in 2022. I also dropped a planned second farm in Kenya when I couldn't find a clean plot in time, and kept one field in two languages instead.
- **Keeping the agent honest.** Early versions read raw index values aloud ("0.6085") and would happily fill silence with guesses. The fix was to force tool calls before any claim, convert numbers into plain percent changes, and ground advice in cited documents.
- **Realtime transcripts.** Speech recognition streams partial transcripts that replace each other. My first UI showed every partial as a new message. Rendering one bubble per utterance, and logging only final text, fixed both the phone and the dashboard.
- **Noisy rooms.** Voice activity detection hears crowds. I added push-to-talk and a higher detection threshold for the expo.

### Accomplishments that I'm proud of
- A real phone-to-satellite loop: you talk, the agent pulls real Sentinel-2 and NASA numbers, cites IRRI, and sends a Grok Imagine video, while a second screen shows every step live.
- Natural Mandarin and English from the same agent and the same data.
- Built solo in under a day with three Cursor agents working in parallel, with the plan, logs, and screenshots in the repo.

### What I learned
- Voice changes who can use satellite data. The hard part isn't the model; it's turning an index into a sentence a farmer trusts.
- Grounding matters more in voice than in text, because a listener can't scroll back and check.
- Running parallel agents works when each one owns specific files and everything they need to know lives in one plan document.

### What's next
- **Real phone lines** through SIP (Twilio or Telnyx into the Grok Voice Agent API), so any phone works with no internet at all.
- **Proactive monitoring at scale:** run the NDVI pipeline over every registered field weekly and call only when a field falls behind its own history.
- **More languages and crops,** starting with Hindi, Swahili, and maize.
- **Extension-officer handoff:** send the call summary to the local agricultural station so a person can follow up.
- **Cost:** voice runs about $0.08 per minute, so a three-minute call costs roughly a quarter, and guidance videos are made once per topic and language and reused.

### What I used vs what I built (hackathon Rule 5)
**Used:** Grok models and APIs (grok-4.7, Grok Voice Agent API, Grok Imagine, Grok TTS, xAI Collections), Cursor Agent, Grok Bot, Next.js, React, TypeScript, Tailwind CSS, Supabase, Vercel, Recharts, Leaflet and react-leaflet, qrcode.react, Esri World Imagery basemap, Copernicus Sentinel-2 data, NASA POWER data, IRRI and FAO documents.

**Built this weekend:** the satellite and weather pipeline and baseline comparison; the grounded diagnosis step; the voice agent's persona, tools, bilingual flow, grounding, alert call, and push-to-talk; the video pipeline (pregenerated and live) with narration; the phone call UI; the live dashboard with imagery slider, drought footprint, and call panel; the database schema, realtime events, and API security.

### Credits and data attribution (hackathon Rule 4)
Contains modified Copernicus Sentinel data 2021–2022, processed through the Copernicus Data Space Ecosystem. Weather data from the NASA Langley Research Center POWER Project. Agronomy references: IRRI Rice Knowledge Bank ("Drought", "Water management"), IRRI Rice Today ("Rice feels the heat"), FAO ("Extreme heat and agriculture"). Statistics: FAO, *The State of Food and Agriculture 2025*; Mehrabi et al., *Nature Sustainability* (2020); Caixin, citing the Jiangxi Flood Control and Drought Relief Headquarters. Basemap tiles © Esri. Frameworks listed above.

---

## Built with (tags)
cursor, grok, grok-4.7, grok-voice, grok-imagine, grok-tts, grok-bot, xai, next.js, react, typescript, tailwindcss, supabase, vercel, websockets, sentinel-2, copernicus, nasa-power, leaflet, recharts

## Try it out links
- https://orbital-agronomist.vercel.app
- https://orbital-agronomist.vercel.app/dashboard/cn-rice-2022
- https://github.com/MeagerPotato/orbital-agronomist

## Video demo link
[paste the YouTube unlisted link]

## Image gallery (upload in this order, with captions)
1. Landing page hero (Grok Imagine cover art): "Satellites can see a farm failing. Now they can call the farmer."
2. Dashboard full view: "Live judge dashboard: real Sentinel-2 and NASA data for one field in Jiangxi, August 2022."
3. Sentinel-2 before/after slider: "The same field from orbit, July 6 vs August 25, 2022."
4. Phone with the video card: "After the call, a Grok Imagine how-to video narrated in the farmer's language."
5. Live call panel mid-call: "Every tool call, citation, and video delivery, live."
6. Cursor with three agents: "Built with three Cursor agents in parallel."
7. Grok Bot Mission Planner: "Planned and tracked with Grok Bot."

## Prize categories to select
- SpaceXAI: Make it Legendary (required)
- Any other category you qualify for (check the list on Devpost; Rule 7 allows several)
