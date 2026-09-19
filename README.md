# CropGuard — Full Project


## Part 1 — Frontend
## 1. Problem Statement

Farmers usually notice crop diseases or pest attacks only after visible damage has already spread. Extension officers cover large areas and cannot reach every farm quickly. Weather, soil, and local pest history all affect risk, but farmers rarely get this combined into one simple alert. Wrong self-diagnosis leads to wrong pesticide use, wasted money, and crop loss.

**Goal of the frontend:** give a farmer a simple screen where they take one photo of a leaf and instantly get — a disease/pest diagnosis, the current weather-based risk for their area, a plain-language treatment plan (in English and Marathi), and a way to reach expert help if needed. Also give agriculture officials a live dashboard to see risk and outbreaks across many districts at once.

## 2. Tech Stack

| Layer | Tool | Why |
|---|---|---|
| UI framework | React (Vite) | fast dev server, component-based UI |
| Styling | Plain inline CSS-in-JS + one global `<style>` block | no extra build tooling needed, full control over animations |
| Hosting | GitHub Pages | free, works well for a static Vite build |
| CI/CD | GitHub Actions | auto-builds and deploys on every push to `main` |
| Voice output | Browser's built-in Web Speech API | zero cost, no extra library, works offline once loaded |
| Maps | Folium-generated HTML (from backend), shown in an `<iframe>` | no map API key needed |
| Backend communication | `fetch()` calls to a FastAPI backend hosted on Render | simple REST calls, JSON in/out |

No component library, no CSS framework, no router library was used — everything is one `App.jsx` file with page sections toggled by React state. This kept the app light and easy to deploy as a single static site.

## 3. What the Frontend Actually Does

### Farmer-facing side
- **Photo capture** — two ways to give a photo: `Take Photo` (opens the phone camera directly using `capture="environment"`) or `Choose image` (gallery). The hero section's scanning animation is itself clickable and opens the camera.
- **Client-side image resize** — a big camera photo (often 5–15 MB) is automatically shrunk to a max of 1024px on a `<canvas>` before upload, so it doesn't crash low-memory phones.
- **Analyze flow** — sends the photo + selected crop + selected district to the backend `/analyze` endpoint, shows a loading state, then renders the result.
- **Result card** — a circular confidence ring (color changes red → gold → green based on confidence), the exact disease detected, a colored risk pill for the district's current weather risk, live temperature/humidity, and simulated sensor alerts.
- **Crop mismatch warning** — if the farmer selected "Tomato" but the AI thinks the photo is a "Potato" leaf, a clear warning banner appears so they don't blindly trust a wrong label.
- **Expert advisory cards** — the AI's advice text is automatically split into labeled cards (Diagnosis Validation, Management Recommendation, Local Support, Marathi Summary) with icons, instead of one wall of text.
- **Voice advisory** — two buttons, "Listen (English)" and "ऐका (मराठी)", read the advisory aloud using the browser's speech engine — built for farmers who may not read comfortably.
- **Image validation feedback** — if the backend says the photo isn't a valid leaf/crop image (or confidence is too low), the frontend shows a clear toast message asking for a retake, instead of showing a wrong result.
- **Wake API button** — since the free backend hosting sleeps when idle, this button pings the server to wake it up before the farmer scans, avoiding a confusing failed first request.

### Officials-facing side (separate "Officials Dashboard" view)
- **Live ticker bar** — a scrolling strip under the navbar showing real numbers (total scans processed, districts monitored, how many are at HIGH risk right now) pulled live from the backend, not fake placeholder numbers.
- **KPI summary strip** — total field scans logged, average model confidence, count of high-risk districts, most-detected disease.
- **Outbreak cluster panel** — the headline feature. It shows when 3 or more different farmers report the same disease in the same district within 6 hours, flagging it as an early outbreak signal. When nothing is active, it still shows a "monitoring" status so it's clear the feature is working, not missing.
- **District risk cards** — one card per district with live weather risk, temperature, humidity, and a trend arrow (↗ rising / ↘ falling) comparing this reading to the previous one.
- **Priority intervention zones** — districts that are simultaneously HIGH weather risk and have severe outbreak activity, called out separately so officials know where to act first.
- **Recent field submissions table** — a live, filterable, searchable, sortable table of every real analysis performed by any farmer, with a CSV export button for officials to download the data.
- **Hotspot map** — an embedded map (built by the backend with Folium) showing geographic disease hotspots, plus a ranked "Top 8 hotspots" card grid next to it.

### General polish
- Fully green theme, page stretched edge-to-edge (fixed an early bug where Vite's default `#root` CSS was centering and capping the page width).
- Scroll-reveal animations (`Reveal` component using `IntersectionObserver`) so sections fade in as the user scrolls.
- Ambient drifting glow blobs in the background for atmosphere (kept lightweight after they caused a mobile memory warning).
- Responsive layout — grids collapse to a single column under 760px, font sizes use `clamp()` so they scale smoothly instead of jumping at breakpoints, nav links hide on small screens.
- Custom scrollbar, hover glow effects on buttons and cards, pulsing "live" indicators.

## 4. Challenges Faced and How They Were Solved

| Challenge | Fix |
|---|---|
| Page content was narrow with big empty margins | Vite's default `index.css` had `#root { max-width: 1280px; margin: 0 auto }` — overrode it globally in the app's own `<style>` tag. |
| Blank white/black screen crash on the deployed site | A JS error (`insights.map is not a function`) from an API call pointing to the wrong URL — fixed the endpoint and added safe fallbacks (`.catch(() => setX([]))`) everywhere data is fetched. |
| Backend "Analyze" button did nothing on the live site | The code was still calling `127.0.0.1:8000` (localhost) — had to be updated to the real deployed backend URL after each redeploy. |
| Camera photo upload crashed with "low memory" on some phones | Large camera images (multi-MB) plus heavy background blur effects were too much for weak devices — added canvas-based image downscaling before upload and reduced the blur/blob sizes. |
| Advisory sometimes showed as one unformatted paragraph | The AI (Gemini/Groq) didn't always format its answer the same way — wrote a text parser (`parseAdvisory`) that recognizes section headings in multiple formats, with a raw-text fallback so nothing ever renders blank. |
| Voice button pressed but no sound | Chrome loads its voice list asynchronously and has a known bug when `cancel()` and `speak()` are called back-to-back — fixed by waiting for voices to load and adding a small delay before speaking. |
| Wrong crop label shown for a correct AI diagnosis | The UI was displaying the farmer's manually selected crop instead of what the AI actually detected — fixed by showing the AI's real detected class and adding a separate mismatch warning when the two disagree. |
| Nothing visible in the Officials Dashboard for new/first-time judges | The outbreak-cluster feature only appears once enough real data exists — added an always-visible "monitoring" status state so the feature is provably working even with zero clusters yet. |
| Mobile layout unusable (fixed grid columns, huge headline text) | Added responsive CSS: grid columns collapse to one column under 760px via a media query, and headline/section font sizes use `clamp()` to scale with screen width. |
| GitHub Pages deploying the wrong content (old map instead of the new app) | The Pages source was set to "Deploy from a branch" pointing at the auto-generated `gh-pages` branch, but the custom GitHub Actions workflow hadn't actually committed/pushed correctly the first few times — fixed by confirming the workflow file's exact path (`.github/workflows/deploy.yml`) and re-pushing. |


## 5. Running Locally

```
cd crop-frontend
npm install
npm run dev
```
Opens at `http://localhost:5173`. The backend must also be running separately (`uvicorn app:app --host 0.0.0.0 --port 8000` from the project root) for the Analyze feature to work.

## 6. Deployment

Every push to `main` triggers a GitHub Actions workflow that builds the Vite app and publishes it to the `gh-pages` branch, which GitHub Pages serves automatically. No manual deploy step needed.
-e 

---


## Part 2 — Backend

## 1. Problem Statement

The backend has to take one photo from a farmer and turn it into something actually useful within seconds: what disease/pest it is, how risky the current weather makes it, what to do about it in plain language (English + Marathi), and whether nearby farmers are seeing the same problem (an early outbreak signal). It also has to survive real-world conditions: free-tier hosting that sleeps, rate-limited weather APIs, AI providers that run out of free quota, and farmers occasionally uploading the wrong kind of photo entirely.

## 2. Tech Stack

| Purpose | Tool | Why |
|---|---|---|
| Web server / API | FastAPI + Uvicorn | fast to build, automatic request validation, async-friendly |
| Image classification | TensorFlow/Keras, MobileNetV2 (transfer learning) | lightweight pretrained model, fast enough to run on a free CPU-only server |
| Image validation | Pillow (PIL) | checks the uploaded file is actually a real image before wasting a model prediction on it |
| Weather data | Open-Meteo API (primary) + wttr.in (fallback) | both free, no API key, cover for each other when one rate-limits |
| Hotspot mapping | Folium | generates an interactive Leaflet map as plain HTML, no map API key needed |
| Expert advisory (LLM) | Groq (primary) + Google Gemini (fallback) | two independent AI providers so a quota limit or outage on one doesn't take down the feature |
| Hosting | Render.com (free web service) | free tier, auto-deploys from GitHub |
| Config / secrets | python-dotenv + Render environment variables | API keys never committed to the repo |

## 3. The Five Python Modules

### `1_image_classification.py` — "What disease is this?"
- Uses a MobileNetV2 base (pretrained on ImageNet) with the top layers frozen, and a small custom classifier head trained on the PlantVillage dataset (leaf images across several crops and diseases).
- `train()` — one-time training script; saves the trained model (`crop_disease_model.h5`) and the list of class names.
- `predict(image_path)` — loads the image, resizes it to 160×160, runs it through the model, returns the predicted class name and a confidence score (0–1).
- **Model is loaded once and cached in memory** (`_get_model()`), not reloaded from disk on every request — this was a real performance fix, since reloading a `.h5` file per request made every analysis slow and occasionally caused timeouts.

### `2_weather_api.py` — "How risky is the weather right now?"
- Talks to Open-Meteo (free, no key) for live temperature, humidity, and rainfall for a given Maharashtra district.
- `compute_risk()` — a simple scoring rule: warm temperature (20–30°C) + high humidity (≥70%) + any rainfall each add a point; 2+ points = HIGH risk, 1 = MODERATE, 0 = LOW. This mirrors real plant-pathology logic (most fungal/bacterial crop diseases spread fastest in warm, humid, wet conditions).
- **Retry + cache + fallback provider**: if Open-Meteo rate-limits (which happened often, since many Render apps share the same outbound IP), it retries with backoff, and if that still fails it falls back to a second live weather source (wttr.in) — so the risk score always comes from real, live weather, never a guess.
- Caches each district's weather for 10 minutes so repeated requests don't hammer the API.

### `3_geo_hotspot.py` — "Where are the outbreaks geographically?"
- Generates a heatmap (via Folium) of simulated farmer report points across Maharashtra, saved as `hotspot_map.html` and embedded in the frontend.
- `get_top_hotspots(n)` — takes the raw lat/lon report points, matches each one to its nearest named district, keeps the worst severity seen per district, and returns the top N as a ranked list with a risk label and percentage — this is what powers the "Top Hotspots" card grid on the frontend.

### `4_expert_validation.py` — "What should the farmer actually do?"
- Sends the AI's prediction, confidence, weather risk, crop, and district to an LLM with a strict prompt template that forces a consistent 4-section output every time: **Diagnosis Validation**, **Management Recommendation**, **Local Support**, and a **Marathi Summary**. This consistent structure is what lets the frontend split the answer into clean labeled cards instead of one wall of text.
- **Two independent AI providers, automatic fallback**: tries Groq first; if that fails for any reason (quota, outage, deprecated model), it automatically retries with Google Gemini, and only reports an error if both fail. This was added after repeatedly hitting real-world issues — Gemini's free tier only allows 20 requests/day, and both Groq and Gemini occasionally deprecate model names without much warning, which silently broke the feature until caught and fixed.

### `5_pest_traps_sensor.py` — "What do the field sensors say?"
- Returns simulated IoT pest-trap / soil-sensor readings (e.g. "pest count above threshold", "low soil moisture") — stands in for real hardware sensors a farm might eventually have, so the system already has a place to plug them in.

## 4. `app.py` — The Orchestrator

This is the FastAPI app that ties all five modules together into one API.

**Endpoints:**
| Endpoint | Purpose |
|---|---|
| `GET /health` | lets the frontend "wake up" the server if it's gone to sleep (free hosting tier) |
| `POST /analyze` | the main endpoint — takes a photo + crop + district, runs the full pipeline, returns everything |
| `GET /districts-weather` | live weather risk for every tracked district, plus a rising/falling/steady **trend** compared to the last reading |
| `GET /hotspots` | top 8 disease hotspots (from module 3) |
| `GET /recent-scans` | a running log of every real farmer submission (for the officials dashboard) |
| `GET /clusters` | **outbreak cluster detection** — see below |

**What `/analyze` actually does, step by step:**
1. Saves the uploaded photo temporarily.
2. Validates it's a real image (rejects corrupted/non-image files with a clear error).
3. Runs the image classifier — rejects the result if confidence is below 35%, telling the farmer to retake the photo (blurry photos, non-leaf photos, or bad lighting all get caught here instead of returning a confident-sounding wrong answer).
4. Gets the live weather risk for the farmer's district.
5. Sends everything to the AI advisory module for a plain-language recommendation.
6. Adds simulated sensor data.
7. **Logs the submission** (crop, detected disease, confidence, risk, timestamp) to an in-memory list — this log is what feeds the officials dashboard and the outbreak detector.
8. Returns everything as one JSON response.

**Outbreak Cluster Detection** (`/clusters`) — the most novel piece of the backend: it looks at the last 6 hours of real submissions and groups them by (district, disease). If 3 or more *independent* farmers reported the same disease in the same district in that window, it flags it as an active cluster with a report count and average confidence. This turns a simple per-photo classifier into an early epidemic-warning signal — something a single farmer's app can't do alone, but the aggregated data can.

**District Risk Trend** — every time `/districts-weather` is called, it stores the risk level with a timestamp per district (last 10 readings kept) and compares the newest to the previous one to show whether risk is rising, falling, or steady — so officials see a trajectory, not just a snapshot.

## 5. Challenges Faced and How They Were Solved

| Challenge | Fix |
|---|---|
| Render build failed: `tensorflow` had no matching version | Render defaulted to Python 3.14, which has no TensorFlow wheel yet — pinned the version with a `PYTHON_VERSION=3.10.14` environment variable. |
| App crashed on startup: `Could not import PIL.Image` | `Pillow` wasn't in `requirements.txt` — added it. |
| App crashed on startup: `cannot import name 'genai' from 'google'` | wrong package name installed — the correct PyPI package is `google-genai`, added it to `requirements.txt`. |
| Every analysis was slow / model reloaded every request | `predict()` used to call `load_model()` from disk every single time — changed to load the model once and cache it globally, so only the first request pays that cost. |
| Weather API returned `429 Too Many Requests` | Free-tier cloud hosts often share IPs, so Open-Meteo rate-limited us — added retry with backoff, a 10-minute cache per district, and a second live weather provider (wttr.in) as fallback. |
| Analysis requests started returning `502 Bad Gateway` | The combined latency of model inference + weather retries + AI call occasionally exceeded Render's request timeout — fixed by making the weather retry logic fail fast (max ~5 seconds) instead of long exponential backoffs. |
| Gemini calls failed with `429 RESOURCE_EXHAUSTED` | Gemini's free tier allows only ~20 requests/day — added Groq as a second AI provider with automatic fallback between them. |
| Groq calls failed with `404 model_not_found` | The model names used (`llama-3.3-70b-versatile`, then `llama-3.1-8b-instant`) had both been deprecated by Groq — switched to the currently supported `openai/gpt-oss-20b` and moved to the official `groq` Python client instead of raw HTTP requests, to remove any chance of a malformed request. |
| Farmer uploads a wrong/blurry/non-leaf photo and gets a confident-sounding wrong diagnosis | Added a minimum confidence threshold (35%) — below that, the API returns a clear "please retake the photo" message instead of a real-looking but meaningless result. |
| No way to see patterns across many farmers, only one photo at a time | Built the in-memory scan log + outbreak cluster detector + district risk trend tracker, turning individual predictions into a small early-warning system. |

## 6. Running Locally

```
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```
Needs a `.env` file (or environment variables) with `GEMINI_API_KEY` and `GROQ_API_KEY` set.

## 7. Deployment

Hosted on Render.com as a free web service:
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app:app --host 0.0.0.0 --port $PORT`
- Environment variables set in Render's dashboard: `GEMINI_API_KEY`, `GROQ_API_KEY`, `PYTHON_VERSION`
