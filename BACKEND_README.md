# CropGuard — Backend

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

## 6. Project Structure (backend)

```
crop_app/
├── app.py                     # FastAPI app — all endpoints, orchestrates the 5 modules
├── 1_image_classification.py  # MobileNetV2 model: train() + predict()
├── 2_weather_api.py           # live weather + risk scoring, with retry/cache/fallback
├── 3_geo_hotspot.py           # Folium heatmap + top-hotspot ranking
├── 4_expert_validation.py     # Groq + Gemini advisory generation, with fallback
├── 5_pest_traps_sensor.py     # simulated IoT sensor data
├── crop_disease_model.h5      # trained model weights
├── class_names.txt            # label list matching the model's output
├── requirements.txt
└── .env                       # GEMINI_API_KEY, GROQ_API_KEY (not committed)
```

## 7. Running Locally

```
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```
Needs a `.env` file (or environment variables) with `GEMINI_API_KEY` and `GROQ_API_KEY` set.

## 8. Deployment

Hosted on Render.com as a free web service:
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app:app --host 0.0.0.0 --port $PORT`
- Environment variables set in Render's dashboard: `GEMINI_API_KEY`, `GROQ_API_KEY`, `PYTHON_VERSION`
